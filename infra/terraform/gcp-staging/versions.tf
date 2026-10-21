terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.10"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
  backend "gcs" {}
}

provider "google" {
  project = var.project
  region  = var.region
  default_labels = {
    app = "${var.name}-staging"
  }
}
