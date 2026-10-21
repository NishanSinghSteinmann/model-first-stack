locals {
  hosts = {
    app     = "app.${var.domain}"
    cockpit = "cockpit.${var.domain}"
    admin   = "admin.${var.domain}"
    api     = "api.${var.domain}"
  }
  api_origin  = "https://${local.hosts.api}"
  issuer      = "${local.api_origin}/auth/v1"
  registry    = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.images.repository_id}"
  placeholder = "us-docker.pkg.dev/cloudrun/container/hello"
  db          = "${var.db_host}:5432/app?sslmode=require"
  services    = ["run", "storage", "secretmanager", "artifactregistry", "cloudscheduler", "iam", "iamcredentials", "sts"]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = "${each.value}.googleapis.com"
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "${var.name}-staging"
  format        = "DOCKER"
  location      = var.region
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }
  depends_on = [google_project_service.apis]
}

data "google_project" "this" {}

data "google_compute_network" "main" {
  name = var.network
}

data "google_compute_subnetwork" "run" {
  name   = var.subnetwork
  region = var.region
}

resource "google_service_account" "runtime" {
  for_each   = toset(["api", "auth", "edge", "jobs", "scheduler", "deploy"])
  account_id = "${var.name}-stg-${each.value}"
}
