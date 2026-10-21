locals {
  api_secrets = [
    { env = "DATABASE_URL", secret = "database-url" },
    { env = "STORAGE_ACCESS_KEY", secret = "storage-access-key" },
    { env = "STORAGE_SECRET_KEY", secret = "storage-secret-key" },
  ]
  job_secrets = {
    migrate = [
      { env = "DATABASE_MIGRATE_URL", secret = "database-migrate-url" },
      { env = "DB_APP_PASSWORD", secret = "db-app-password" },
      { env = "DB_AUTH_PASSWORD", secret = "db-auth-password" },
    ]
    drain = [{ env = "DATABASE_URL", secret = "database-url" }]
  }
  edge_host = "${var.name}-edge-${data.google_project.this.number}.${var.region}.run.app"
  vpc = {
    network    = data.google_compute_network.main.id
    subnetwork = data.google_compute_subnetwork.run.id
  }
  backend_env = {
    APP_ENV                     = "staging"
    AUTH_JWKS_URL               = "https://${local.edge_host}/auth/v1/.well-known/jwks.json"
    AUTH_ISSUER                 = local.issuer
    CORS_ORIGINS                = join(",", [for k in ["app", "cockpit", "admin"] : "https://${local.hosts[k]}"])
    OTEL_EXPORTER_OTLP_ENDPOINT = ""
    STORAGE_ENDPOINT            = "https://storage.googleapis.com"
    STORAGE_REGION              = "auto"
    STORAGE_BUCKET              = google_storage_bucket.files.name
  }
}

resource "google_cloud_run_v2_service" "auth" {
  name                = "${var.name}-auth"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  template {
    service_account = google_service_account.runtime["auth"].email
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = local.vpc.network
        subnetwork = local.vpc.subnetwork
      }
    }
    containers {
      image = var.auth_image
      resources {
        cpu_idle          = true
        startup_cpu_boost = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      ports {
        container_port = 9999
      }
      dynamic "env" {
        for_each = {
          GOTRUE_API_HOST                         = "0.0.0.0"
          API_EXTERNAL_URL                        = local.issuer
          GOTRUE_SITE_URL                         = "https://${local.hosts.app}"
          GOTRUE_URI_ALLOW_LIST                   = join(",", [for k in ["app", "cockpit", "admin"] : "https://${local.hosts[k]}/**"])
          GOTRUE_DB_DRIVER                        = "postgres"
          GOTRUE_JWT_AUD                          = "authenticated"
          GOTRUE_JWT_ISSUER                       = local.issuer
          GOTRUE_JWT_EXP                          = "3600"
          GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED = "true"
          GOTRUE_EXTERNAL_EMAIL_ENABLED           = "true"
          GOTRUE_MAILER_AUTOCONFIRM               = "false"
          GOTRUE_SMTP_HOST                        = "smtp.example.invalid"
          GOTRUE_SMTP_PORT                        = "587"
          GOTRUE_SMTP_USER                        = "${var.name}-staging"
          GOTRUE_SMTP_ADMIN_EMAIL                 = "noreply@${var.domain}"
          GOTRUE_SMTP_SENDER_NAME                 = "Staging"
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = {
          GOTRUE_DB_DATABASE_URL = "auth-database-url"
          GOTRUE_JWT_KEYS        = "auth-jwt-keys"
          GOTRUE_JWT_SECRET      = "auth-jwt-secret"
          GOTRUE_SMTP_PASS       = "smtp-password"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.all[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.readers]
}

resource "google_cloud_run_v2_service" "api" {
  name                = "${var.name}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  template {
    service_account = google_service_account.runtime["api"].email
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = local.vpc.network
        subnetwork = local.vpc.subnetwork
      }
    }
    containers {
      image = local.placeholder
      args  = ["api"]
      resources {
        cpu_idle          = true
        startup_cpu_boost = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      dynamic "env" {
        for_each = local.backend_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = { for e in local.api_secrets : e.env => e.secret }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.all[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      startup_probe {
        http_get {
          path = "/livez"
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.readers]
}

resource "google_cloud_run_v2_service" "edge" {
  name                = "${var.name}-edge"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  template {
    service_account = google_service_account.runtime["edge"].email
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = local.vpc.network
        subnetwork = local.vpc.subnetwork
      }
    }
    containers {
      image = local.placeholder
      resources {
        cpu_idle          = true
        startup_cpu_boost = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      dynamic "env" {
        for_each = {
          APP_HOST        = "http://${local.hosts.app}:8080"
          COCKPIT_HOST    = "http://${local.hosts.cockpit}:8080"
          ADMIN_HOST      = "http://${local.hosts.admin}:8080"
          API_HOST        = "http://${local.hosts.api}:8080, http://${local.edge_host}:8080"
          API_ORIGIN      = local.api_origin
          API_UPSTREAM    = google_cloud_run_v2_service.api.uri
          AUTH_UPSTREAM   = google_cloud_run_v2_service.auth.uri
          TRUSTED_PROXIES = "169.254.0.0/16"
          STORAGE_ORIGIN  = "https://storage.googleapis.com"
          ADMIN_ALLOW     = length(var.admin_allow) > 0 ? join(" ", var.admin_allow) : "127.0.0.1/32"
        }
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = toset(["edge", "api", "auth"])
  name     = "${var.name}-${each.value}"
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
  depends_on = [
    google_cloud_run_v2_service.edge,
    google_cloud_run_v2_service.api,
    google_cloud_run_v2_service.auth,
  ]
}

resource "google_cloud_run_v2_job" "backend" {
  for_each            = toset(["migrate", "drain"])
  name                = "${var.name}-${each.value}"
  location            = var.region
  deletion_protection = false
  template {
    template {
      service_account = google_service_account.runtime["jobs"].email
      max_retries     = 1
      timeout         = "900s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = local.vpc.network
          subnetwork = local.vpc.subnetwork
        }
      }
      containers {
        image = local.placeholder
        args  = [each.value]
        env {
          name  = "APP_ENV"
          value = "staging"
        }
        dynamic "env" {
          for_each = { for e in local.job_secrets[each.value] : e.env => e.secret }
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.all[env.value].secret_id
                version = "latest"
              }
            }
          }
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.readers]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler" {
  name     = google_cloud_run_v2_job.backend["drain"].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime["scheduler"].email}"
}

resource "google_cloud_scheduler_job" "drain" {
  name      = "${var.name}-drain"
  region    = var.region
  schedule  = "*/15 * * * *"
  time_zone = "Europe/Berlin"
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.backend["drain"].id}:run"
    oauth_token {
      service_account_email = google_service_account.runtime["scheduler"].email
    }
  }
}

resource "google_cloud_run_domain_mapping" "hosts" {
  for_each = var.map_domains ? local.hosts : {}
  name     = each.value
  location = var.region
  metadata {
    namespace = var.project
  }
  spec {
    route_name = google_cloud_run_v2_service.edge.name
  }
}
