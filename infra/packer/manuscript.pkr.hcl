packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables — AMI_ID is passed in by GitHub Actions after a successful build
# ---------------------------------------------------------------------------

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "instance_type" {
  type    = string
  default = "t3.small"  # matches prod; keeps bake environment consistent
}

# ---------------------------------------------------------------------------
# Source — Amazon EBS AMI, Ubuntu 22.04 LTS
# We filter for the latest Canonical image so we always bake on a patched base.
# ---------------------------------------------------------------------------

source "amazon-ebs" "ubuntu" {
  region        = var.aws_region
  instance_type = var.instance_type

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]  # Canonical's official AWS account ID
  }

  ssh_username = "ubuntu"

  ami_name        = "manuscript-backend-{{timestamp}}"
  ami_description = "Manuscript FastAPI backend - baked by Packer"

  # Tag the AMI so it's easy to identify and clean up old ones
  tags = {
    Project   = "manuscript"
    ManagedBy = "packer"
  }
}

# ---------------------------------------------------------------------------
# Build — upload code, run setup
# ---------------------------------------------------------------------------

build {
  sources = ["source.amazon-ebs.ubuntu"]

  # Create upload destinations before the file provisioners run.
  # Packer's file provisioner requires the destination directory to exist.
  provisioner "shell" {
    inline = ["mkdir -p /tmp/backend"]
  }

  # Upload the backend application code.
  # source ends with / so Packer uploads the *contents* of backend/ into /tmp/backend/
  provisioner "file" {
    source      = "backend/"
    destination = "/tmp/backend"
  }

  # Upload the boot script separately so setup.sh can install it
  provisioner "file" {
    source      = "infra/packer/scripts/boot.sh"
    destination = "/tmp/boot.sh"
  }

  # Run the setup script as root
  provisioner "shell" {
    script          = "infra/packer/scripts/setup.sh"
    execute_command = "sudo bash '{{ .Path }}'"
  }
}
