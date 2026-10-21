variable "name" {
  type        = string
  default     = "app"
  description = "Prefix for all resources"
}

variable "project" {
  type = string
}

variable "network" {
  type        = string
  description = "Existing VPC network with a route to the database host"
}

variable "subnetwork" {
  type        = string
  description = "Subnetwork with Private Google Access, used for Direct VPC egress"
}

variable "db_host" {
  type        = string
  description = "Private IP or host name of Postgres"
}

variable "smtp_host" {
  type    = string
  default = ""
}

variable "smtp_user" {
  type    = string
  default = ""
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "domain" {
  type        = string
  description = "Base domain, for example staging.example.com"
}

variable "github_repository" {
  type        = string
  description = "owner/repo that may deploy from main"
}

variable "auth_image" {
  type    = string
  default = "docker.io/supabase/auth:v2.197.0"
}

variable "map_domains" {
  type        = bool
  default     = false
  description = "Map the four hosts to Cloud Run, the domain must be verified in Search Console"
}

variable "admin_allow" {
  type        = list(string)
  default     = []
  description = "CIDRs that may reach the admin app and /v1/admin, empty blocks everyone"
}
