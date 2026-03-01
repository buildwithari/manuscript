# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------

# Use the default VPC and its subnets — simpler than creating a custom VPC for MVP.
# ALB requires at least two AZs, so we pull all default subnets.
data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Look up the Route 53 hosted zone for manuscript.help
data "aws_route53_zone" "main" {
  name         = var.domain
  private_zone = false
}

# ---------------------------------------------------------------------------
# ACM Certificate — DNS validated via Route 53
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "api" {
  domain_name       = var.api_subdomain
  validation_method = "DNS"

  lifecycle {
    # Create the new cert before destroying the old one to avoid downtime
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      value  = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.value]
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------

# ALB — accepts HTTP (for redirect) and HTTPS from the public internet
resource "aws_security_group" "alb" {
  name        = "manuscript-alb"
  description = "Allow HTTP and HTTPS inbound to the ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP - redirected to HTTPS by the ALB listener"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "manuscript-alb" }
}

# EC2 — only accepts traffic from the ALB on port 8000
# No direct internet access to the instance.
resource "aws_security_group" "ec2" {
  name        = "manuscript-ec2"
  description = "Allow port 8000 from the ALB only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "FastAPI from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Unrestricted outbound — instance needs to reach SSM, PyPI, Supabase, OpenAI, etc.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "manuscript-ec2" }
}

# ---------------------------------------------------------------------------
# IAM role for EC2
# ---------------------------------------------------------------------------

# The instance needs to read SSM parameters (secrets) and use SSM Session Manager
# (for shell access without SSH keys).
resource "aws_iam_role" "ec2" {
  name = "manuscript-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ssm_secrets" {
  name = "manuscript-ssm-secrets"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssm:GetParameter",
        "ssm:GetParametersByPath",
      ]
      Resource = [
        "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/manuscript/backend/*",
        "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/manuscript/backend",
      ]
    }]
  })
}

# SSM Session Manager — allows shell access via AWS console without opening SSH
resource "aws_iam_role_policy_attachment" "ssm_manager" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "manuscript-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ---------------------------------------------------------------------------
# ALB + Target group
# ---------------------------------------------------------------------------

resource "aws_lb" "main" {
  name               = "manuscript-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids

  tags = { Name = "manuscript-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "manuscript-api"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "instance"

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  # Allow old connections to drain before deregistering during instance refresh
  deregistration_delay = 30
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS — forwards to the target group
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---------------------------------------------------------------------------
# Launch template + Auto Scaling Group
# ---------------------------------------------------------------------------

resource "aws_launch_template" "api" {
  name_prefix   = "manuscript-"
  image_id      = var.ami_id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.ec2.arn
  }

  vpc_security_group_ids = [aws_security_group.ec2.id]

  # boot.sh (run by manuscript-secrets.service) needs instance metadata
  # for the region — IMDSv2 is enforced for security
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2 only
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name    = "manuscript-backend"
      Project = "manuscript"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "api" {
  name                = "manuscript-asg"
  min_size            = 1
  max_size            = 1
  desired_capacity    = 1
  vpc_zone_identifier = data.aws_subnets.default.ids
  target_group_arns   = [aws_lb_target_group.api.arn]

  launch_template {
    id      = aws_launch_template.api.id
    version = "$Latest"
  }

  # Wait for the instance to pass the ALB health check before marking it healthy
  health_check_type         = "ELB"
  health_check_grace_period = 120

  # Instance refresh — triggers a blue/green swap when the launch template changes
  # (i.e. when a new AMI is deployed). The ALB drains the old instance while the
  # new one warms up, keeping downtime to near-zero.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 0   # min 1 max 1 means we must allow 0% during swap
      instance_warmup        = 60
    }
  }

  tag {
    key                 = "Project"
    value               = "manuscript"
    propagate_at_launch = true
  }
}

# ---------------------------------------------------------------------------
# Route 53 — A record pointing api.manuscript.help at the ALB
# ---------------------------------------------------------------------------

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.api_subdomain
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
