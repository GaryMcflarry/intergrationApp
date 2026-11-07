# Gitea migration

Source is hosted under Lumina on gitea.lluminaa.net. The primary Git remote is origin (Gitea); github preserves the previous source address. Main and tags have been pushed without rewriting history.

The workflow follows Telemetry's checks → container registry → Dokploy webhook pattern. Checks run on main pushes. Image builds are enabled by setting IMAGE; deployments additionally require DEPLOY_ENABLED=true. Nothing deploys until configured.

Repository Actions variables: REGISTRY=gitea.lluminaa.net, REGISTRY_USER=<your Gitea account>, IMAGE=gitea.lluminaa.net/lumina/intergrationapp. Repository secrets: REGISTRY_TOKEN with package write access and DOKPLOY_WEBHOOK_URL for the matching service. Secrets were not copied from Telemetry (they are not readable).

Dokploy can either clone this Gitea repository directly using deploy/Dockerfile with build context /, or pull the published IMAGE:latest after the workflow is configured. Use container port 8080. Preserve the service's current environment and database. Changing Git remotes does not change the live Dokploy source automatically.

The download site still uses the existing verified GitHub release installer. The source push does not publish a new installer. Discord Social SDK binaries remain local/ignored and need an explicit licensed runtime build and packaging step before release.
