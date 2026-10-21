output "registry" {
  value = local.registry
}

output "github_variables" {
  value = {
    APP_NAME          = var.name
    GITHUB_REPOSITORY = var.github_repository
    GCP_PROJECT       = var.project
    GCP_REGION        = var.region
    GCP_WIF_PROVIDER  = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SA     = google_service_account.runtime["deploy"].email
    GCP_REGISTRY      = local.registry
    STAGING_EDGE      = "https://${local.edge_host}"
  }
}

output "edge_url" {
  value = "https://${local.edge_host}"
}

output "dns_records" {
  value = var.map_domains ? { for k, m in google_cloud_run_domain_mapping.hosts : m.name => m.status[0].resource_records } : {}
}

output "db_setup_sql" {
  sensitive = true
  value     = "create role owner login createrole password '${random_password.db["owner"].result}'; create database ${var.name} owner owner;"
}
