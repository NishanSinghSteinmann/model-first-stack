resource "random_password" "db" {
  for_each = toset(["owner", "app", "auth"])
  length   = 32
  special  = false
}

locals {
  generated_secrets = {
    database-url         = "postgres://app:${random_password.db["app"].result}@${local.db}"
    database-migrate-url = "postgres://owner:${random_password.db["owner"].result}@${local.db}"
    db-owner-password    = random_password.db["owner"].result
    storage-access-key   = google_storage_hmac_key.api.access_id
    storage-secret-key   = google_storage_hmac_key.api.secret
    db-app-password      = random_password.db["app"].result
    db-auth-password     = random_password.db["auth"].result
    auth-database-url    = "postgres://supabase_auth_admin:${random_password.db["auth"].result}@${local.db}&search_path=auth"
  }
  manual_secrets = ["auth-jwt-keys", "auth-jwt-secret", "smtp-password"]
  secret_readers = {
    database-url         = ["api", "jobs"]
    db-owner-password    = []
    storage-access-key   = ["api"]
    storage-secret-key   = ["api"]
    database-migrate-url = ["jobs"]
    db-app-password      = ["jobs"]
    db-auth-password     = ["jobs"]
    auth-database-url    = ["auth"]
    auth-jwt-keys        = ["auth"]
    auth-jwt-secret      = ["auth"]
    smtp-password        = ["auth"]
  }
}

resource "google_secret_manager_secret" "all" {
  for_each  = toset(concat(keys(local.generated_secrets), local.manual_secrets))
  secret_id = "${var.name}-stg-${each.value}"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "generated" {
  for_each    = local.generated_secrets
  secret      = google_secret_manager_secret.all[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "readers" {
  for_each = merge([for secret, readers in local.secret_readers : { for r in readers : "${secret}/${r}" => { secret = secret, reader = r } }]...)

  secret_id = google_secret_manager_secret.all[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value.reader].email}"
}
