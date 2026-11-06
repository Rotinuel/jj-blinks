-- The authoritative schema is the ordered set of files in db/migrations/.
-- Apply them with `bun run db:migrate` (tracked in the schema_migrations table).
-- To inspect the full current schema of a database:  pg_dump --schema-only "$DATABASE_URL"
\i migrations/001_initial.sql
