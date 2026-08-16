-- Optional feature: authentication / API keys / multi-tenancy.
-- This table exists regardless of AUTH_ENABLED (cheap, empty by default);
-- it is only ever consulted when AUTH_ENABLED=true.
CREATE TABLE IF NOT EXISTS api_keys (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  tenant     TEXT NOT NULL,
  scopes     TEXT[] NOT NULL DEFAULT ARRAY['ingest', 'query'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (id) VALUES ('002_auth')
ON CONFLICT (id) DO NOTHING;
