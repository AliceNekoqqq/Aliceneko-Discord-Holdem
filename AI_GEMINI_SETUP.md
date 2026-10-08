# Gemini AI

This adds Gemini chat and an optional game host to the existing Discord Worker.
The administrator-assistant feature is intentionally not included.

## Features

- Mention the bot in a server channel to start a chat. The bot replies in the same channel.
- The server can set a shared speaking style with /ai 人格 设置, inspect it with /ai 人格 查看, and restore the default with /ai 人格 重置. These controls require Manage Server permission.
- Personal memory is scoped to one Discord server and one member. It records only messages that directly mention the bot, with the most recent 30 user/model messages retained.
- Use /ai 记忆 关闭 to stop saving chat text, /ai 记忆 开启 to resume, /ai 记忆 清除 to delete saved chat text, and /ai 记忆 查看 to see the current setting. Disabling memory does not delete existing chat text; use 清除 for that.
- Short lived message IDs are kept for up to seven days to prevent duplicate replies after a Gateway reconnect. They do not include message text.
- Game commentary is off by default. A member with Manage Server permission can use /ai 主持 开启, /ai 主持 关闭, and /ai 主持 查看. Commentary is limited to public game events and at most five comments per hand.

## Cloudflare setup

The Worker uses the existing TABLES Durable Object namespace for the Discord Gateway connection and the aliceneko-ai D1 database for settings and chat memory. Migration migrations/0001_ai.sql creates the required tables.

Add the API key as an encrypted Worker Secret:

    npx wrangler secret put GEMINI_API_KEY

Do not put the key in wrangler.jsonc, a plain text Worker variable, or GitHub. This bot uses an OpenAI-compatible chat-completions endpoint when `GEMINI_API_BASE_URL` is configured. Set these plain text Worker variables for the ggchan.dev gateway:

    GEMINI_API_BASE_URL=https://gcli.ggchan.dev/v1
    GEMINI_MODEL=gemini-3.8-flash

The Worker sends requests to `/chat/completions` under that base URL, using `Authorization: Bearer` and the OpenAI chat message format. Without `GEMINI_API_BASE_URL`, it uses Google's native Gemini GenerateContent endpoint. The configured gateway receives chat messages and the selected model name.

The D1 database binding is named CHAT_DB. If preparing another environment, create the database and run:

    npx wrangler d1 create aliceneko-ai
    npx wrangler d1 execute aliceneko-ai --remote --file=migrations/0001_ai.sql

The existing Worker Cron registers /ai and keeps the Discord Gateway connection active. The Gateway subscribes to GUILDS and GUILD_MESSAGES; it does not request the privileged Message Content intent. Discord allows message content for direct mentions of the bot. The bot needs permission to view and send messages in the channels where people will use it.

## Data boundaries

Chat history is not shared between members or servers. Only direct mentions of the bot are sent to the configured model endpoint. The system prompt excludes private game hands, decks, and other unrevealed state. Game commentary receives a small public event summary rather than the full table object. Native Gemini GenerateContent requests set store:false; OpenAI-compatible requests are non-streaming.

Memory is stored in D1 until the member clears it. Disabling memory pauses new chat-history storage but does not remove existing history. The Worker keeps no channel transcript. Avoid sending sensitive personal data in a public Discord channel.

The persistent Discord Gateway uses an outbound WebSocket in a Durable Object. Cloudflare documents that outbound WebSockets do not use the WebSocket Hibernation API; a live connection and its heartbeat work can contribute to Worker duration charges. Review usage after enabling this for a busy server.
