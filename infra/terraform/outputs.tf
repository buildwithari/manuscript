output "alb_dns_name" {
  description = "ALB DNS name — useful for debugging before Route 53 propagates"
  value       = aws_lb.main.dns_name
}

output "api_url" {
  description = "Public HTTPS URL for the backend API"
  value       = "https://${var.api_subdomain}"
}

output "ami_id" {
  description = "AMI ID used in this deployment"
  value       = var.ami_id
}
