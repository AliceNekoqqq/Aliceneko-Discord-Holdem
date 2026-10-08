ALTER TABLE ai_guild_config
  ADD COLUMN host_commentary INTEGER NOT NULL DEFAULT 0 CHECK (host_commentary IN (0, 1));
ALTER TABLE ai_guild_config
  ADD COLUMN host_start INTEGER NOT NULL DEFAULT 0 CHECK (host_start IN (0, 1));
ALTER TABLE ai_guild_config
  ADD COLUMN host_results INTEGER NOT NULL DEFAULT 0 CHECK (host_results IN (0, 1));

UPDATE ai_guild_config
SET host_commentary = game_host,
    host_start = game_host,
    host_results = game_host
WHERE game_host = 1;
