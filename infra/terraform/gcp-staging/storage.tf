resource "google_storage_bucket" "files" {
  name                        = "${var.project}-${var.name}-staging-files"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  cors {
    origin          = [for k in ["app", "cockpit", "admin"] : "https://${local.hosts[k]}"]
    method          = ["PUT", "GET", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "Content-Disposition"]
    max_age_seconds = 600
  }
  lifecycle_rule {
    condition {
      age            = 2
      matches_prefix = ["tmp/"]
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "api" {
  bucket = google_storage_bucket.files.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime["api"].email}"
}

resource "google_storage_hmac_key" "api" {
  service_account_email = google_service_account.runtime["api"].email
}
