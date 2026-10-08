CREATE TABLE IF NOT EXISTS ai_channel_memory_config (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS ai_channel_chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  speaker_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_channel_chat_history_channel
  ON ai_channel_chat_history (guild_id, channel_id, id DESC);
CREATE INDEX IF NOT EXISTS ai_channel_chat_history_member
  ON ai_channel_chat_history (guild_id, user_id, id DESC);
