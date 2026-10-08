CREATE TABLE IF NOT EXISTS ai_guild_config (
  guild_id TEXT PRIMARY KEY,
  persona TEXT NOT NULL DEFAULT '',
  game_host INTEGER NOT NULL DEFAULT 0 CHECK (game_host IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_member_settings (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  memory_enabled INTEGER NOT NULL DEFAULT 1 CHECK (memory_enabled IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_chat_history_member
  ON ai_chat_history (guild_id, user_id, id DESC);

CREATE TABLE IF NOT EXISTS ai_processed_messages (
  message_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_processed_messages_age
  ON ai_processed_messages (created_at);
