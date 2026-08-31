export const createSyncProfilesTable = `
CREATE TABLE IF NOT EXISTS sync_profiles (
  sync_key_hash TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
)
`;
