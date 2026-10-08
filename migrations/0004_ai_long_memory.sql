CREATE TABLE IF NOT EXISTS ai_long_memory (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id,user_id,key)
);
