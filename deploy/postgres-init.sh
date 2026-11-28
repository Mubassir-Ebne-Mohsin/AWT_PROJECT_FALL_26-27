#!/bin/sh
set -eu
if [ "${#SF_APP_PASSWORD}" -lt 24 ] || [ "${#SF_MIGRATION_PASSWORD}" -lt 24 ] || [ "${#POSTGRES_PASSWORD}" -lt 24 ] || [ "$SF_APP_PASSWORD" = "$SF_MIGRATION_PASSWORD" ] || [ "$SF_APP_PASSWORD" = "$POSTGRES_PASSWORD" ] || [ "$SF_MIGRATION_PASSWORD" = "$POSTGRES_PASSWORD" ]; then
  echo "Invalid database credentials: use three distinct generated passwords" >&2
  exit 1
fi
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1   --set=app_password="$SF_APP_PASSWORD" --set=migration_password="$SF_MIGRATION_PASSWORD" <<'SQL'
CREATE ROLE sf_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sf_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE stressforge OWNER TO sf_migrator;
ALTER SCHEMA public OWNER TO sf_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE stressforge TO sf_app;
GRANT USAGE ON SCHEMA public TO sf_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sf_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO sf_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sf_migrator IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO sf_app;
SQL
