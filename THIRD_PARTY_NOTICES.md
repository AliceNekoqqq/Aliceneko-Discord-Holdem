# Third-party source and license

This migration uses code from [ESSEX-CV9/ManageBot](https://github.com/ESSEX-CV9/ManageBot), commit `05774f8905afd39150aa45d09762522e782b255c`.

- `devil-roulette-engine.mjs` is adapted from `src/modules/mystery/core/devilRouletteEngine.js`. The changes are ESM exports and Web Crypto randomness.
- The duel rules and interaction flow are adapted from `src/modules/mystery/services/duelGame.js`; the Workers adapter is newly implemented.
- The upstream repository contains an AGPL-3.0 `LICENSE`, while its `package.json` says ISC. This branch conservatively follows its actual AGPL license file. A copy is retained in `licenses/ManageBot-AGPL-3.0.txt`.
- The proposed combined Worker license is AGPL-3.0, supplied in the root `LICENSE` and package metadata. The repository owner must review this project license proposal before merging or deploying this draft migration.
- The game help provides a public source link. Existing source notices must remain intact.

No upstream Discord.js runtime, Node timers, SQLite addon, or nickname-lock files are included in the Worker bundle.
