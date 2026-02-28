variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "ami_id" {
  description = "ID of the Packer-built AMI to deploy. Passed in by GitHub Actions."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the backend"
  type        = string
  default     = "t3.small"
}

variable "domain" {
  description = "Root domain managed in Route 53"
  type        = string
  default     = "manuscript.help"
}

variable "api_subdomain" {
  description = "Full hostname for the backend API"
  type        = string
  default     = "api.manuscript.help"
}
