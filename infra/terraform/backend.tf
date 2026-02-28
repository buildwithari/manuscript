terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3 — bootstrap this manually before first terraform init:
  #   aws s3api create-bucket --bucket manuscript-terraform-state --region us-east-1 --profile manuscript
  #   aws s3api put-bucket-versioning --bucket manuscript-terraform-state --versioning-configuration Status=Enabled --profile manuscript
  #   aws dynamodb create-table --table-name manuscript-terraform-locks \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST \
  #     --region us-east-1 --profile manuscript
  backend "s3" {
    bucket         = "manuscript-terraform-state"
    key            = "manuscript/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "manuscript-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}
