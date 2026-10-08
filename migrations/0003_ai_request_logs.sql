CREATE TABLE IF NOT EXISTS ai_request_logs (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  context TEXT NOT NULL,
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status INTEGER,
  duration_ms INTEGER,
  error TEXT,
  response_model TEXT,
  usage_json TEXT
);
CREATE INDEX IF NOT EXISTS ai_request_logs_created_at ON ai_request_logs(created_at);
CREATE INDEX IF NOT EXISTS ai_request_logs_generation_id ON ai_request_logs(generation_id, attempt);
