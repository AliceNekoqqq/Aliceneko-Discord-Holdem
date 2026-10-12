-- Server-scoped relationship snapshots. No trust score; no raw chat transcripts.
CREATE TABLE IF NOT EXISTS ai_relationships (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
 familiarity INTEGER NOT NULL DEFAULT 0 CHECK(familiarity BETWEEN 0 AND 100),
 goodwill INTEGER NOT NULL DEFAULT 0 CHECK(goodwill BETWEEN -100 AND 100),
 epoch INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS ai_relationship_events (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, message_id TEXT NOT NULL,
 channel_id TEXT NOT NULL, topic_hash TEXT NOT NULL, kind TEXT NOT NULL,
 familiarity_delta INTEGER NOT NULL CHECK(familiarity_delta BETWEEN 0 AND 1),
 goodwill_delta INTEGER NOT NULL CHECK(goodwill_delta BETWEEN -2 AND 2),
 day TEXT NOT NULL, created_at INTEGER NOT NULL,
 summary TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(guild_id,user_id,message_id)
);
CREATE INDEX IF NOT EXISTS ai_relationship_events_time ON ai_relationship_events(guild_id,user_id,created_at);
CREATE INDEX IF NOT EXISTS ai_relationship_events_topic ON ai_relationship_events(guild_id,user_id,topic_hash,created_at);
CREATE TABLE IF NOT EXISTS ai_relationship_notes (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, message_id TEXT NOT NULL,
 channel_id TEXT NOT NULL, summary TEXT NOT NULL, evidence TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id,message_id)
);
CREATE TRIGGER IF NOT EXISTS ai_relationship_event_apply AFTER INSERT ON ai_relationship_events BEGIN
 UPDATE ai_relationships SET familiarity=MIN(100,familiarity+NEW.familiarity_delta),
 goodwill=MAX(-100,MIN(100,goodwill+NEW.goodwill_delta)),updated_at=NEW.created_at
 WHERE guild_id=NEW.guild_id AND user_id=NEW.user_id;
 INSERT OR IGNORE INTO ai_relationship_notes(guild_id,user_id,message_id,channel_id,summary,evidence,created_at)
 SELECT NEW.guild_id,NEW.user_id,NEW.message_id,NEW.channel_id,NEW.summary,NEW.evidence,NEW.created_at WHERE NEW.summary<>'';
 DELETE FROM ai_relationship_notes WHERE guild_id=NEW.guild_id AND user_id=NEW.user_id AND message_id NOT IN
 (SELECT message_id FROM ai_relationship_notes WHERE guild_id=NEW.guild_id AND user_id=NEW.user_id ORDER BY created_at DESC,message_id DESC LIMIT 8);
END;
