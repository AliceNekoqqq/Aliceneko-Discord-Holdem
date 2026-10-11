# v0.10 P1 mechanical audit

This is an independent mechanical review of the v0.10 pilot loop and a small deterministic playthrough sample. It does not claim that the new directions are fun, that the professions are balanced, or that these are mature builds. No player feedback was collected for this audit. Rule values and v0.9 behavior were not changed as part of the audit.

## Sample

Ran `node scripts/audit-lantern-p1.mjs` against the v0.10 run engine. Each profession was tested once at difficulty 0 and once at difficulty 6, using the fixed seeds `v10-p1-fixed-d0` and `v10-p1-fixed-d6`. The battle policy greedily evaluates up to two actions; it chooses safer normal rooms, visits a camp when HP is below 24, takes the default reward, chooses the first blessing, takes event gain when offered, and leaves shops. Thus this is a smoke sample of the loop and seed reproducibility, not an estimate of win rate or player decision quality.

| Profession | Difficulty 0 | Difficulty 6 |
| --- | --- | --- |
| Traveler | CLEAR, 27 HP, 142 steps | CLEAR, 23 HP, 197 steps |
| Warden | CLEAR, 30 HP, 167 steps | CLEAR, 18 HP, 227 steps |
| Brewer | CLEAR, 21 HP, 148 steps | CLEAR, 9 HP, 176 steps |
| Messenger | CLEAR, 25 HP, 213 steps | CLEAR, 3 HP, 214 steps |
| Smith | CLEAR, 26 HP, 145 steps | CLEAR, 15 HP, 177 steps |
| Medic | CLEAR, 11 HP, 139 steps | CLEAR, 8 HP, 183 steps |
| Tamer | CLEAR, 29 HP, 160 steps | CLEAR, 21 HP, 205 steps |
| Forger | CLEAR, 30 HP, 180 steps | CLEAR, 10 HP, 202 steps |

All 16 runs completed 15 route stations with a final deck size of 16. At difficulty 0, each sampled run selected an event at slots 1.4, 2.4, and 3.4, with a camp at 3.2. At difficulty 6, routes varied by HP and selected events at 2.4 and 3.4. The notably low remaining HP in several difficulty-6 runs shows why this sample should not be presented as evidence of a comfortable or balanced experience.

## Mechanical review

- **Version isolation and fallback:** v0.10 has its own cloned catalog and run/battle modules. The generic run and battle dispatchers route explicit v0.10 runs to those modules and retain legacy version routing. The v0.9 content, run, and battle modules are unchanged. Catalog lookup falls back through the supported older catalogs for unknown or absent versions.
- **Reward integrity:** reward generation filters to real catalog IDs, selects three unique candidates, and has current-act and reinforcement/bridge sources. The current-act pool can supply the required candidate for the v0.10 acts. Candidate fit weights those actual candidates and uses a run-seeded stream; it does not synthesize IDs. No-evidence candidates remain unendorsed and the UI defaults to skip when it has no supported recommendation.
- **Build guidance:** the eight profession directions are derived from actual effect kinds and available producer/consumer relationships, not a fixed reward-card list. Upgraded card effects are read from their upgraded definitions. The supported routes include traveler prepare-to-attack, warden counter/shield spend, brewer burn/fire guard, messenger sift/retain, smith echo/prepare, medic healing and block, tamer pet command/defense, and forger forge/shield spend. Medic cleanse is surfaced as a parallel tool; it is not described as causing a heal/block chain. Unsupported or absent components do not receive fabricated evidence.
- **Effect metrics:** v0.10 metrics are updated from actual effects and counters rather than inferred from net HP change. Coverage includes effective healing/overheal, absorbed shield, consumed prepare/mark, active draws, retained cards, upgraded card use, and echo replays. Boss victory captures the terminal battle's metrics before clearing battle state; service merge is idempotent and avoids counting the terminal action twice. A targeted terminal-clear smoke check confirmed mark consumption survives battle cleanup and is merged once. The result UI now presents the tracked echo replay metric alongside the other surfaced metrics.
- **Scope of integration:** v0.10 catalog, run, build analysis, metrics, and UI are wired into the current-version path, with legacy paths retained. The parent reports the previously failing service integration checks were fixed and the full suite is green; the final observed local suite in this audit was 194/194 Lantern tests. The earlier service failure was an integration defect that was corrected, not an obsolete test.

## Validation and limits

The final reported validation is 196/196 Lantern tests and 25/25 Worker tests. The additional targeted checks cover actual healing/overheal, investment while armor is active, and terminal action metric capture/replay without double counting. The sample script is at `scripts/audit-lantern-p1.mjs` and the implementation reviewed includes `rogue-content-v10.mjs`, `rogue-run-v10.mjs`, `rogue-battle-v10.mjs`, `rogue-build-system.mjs`, `rogue-effect-metrics.mjs`, plus service/UI integration.

This validates a bounded rules and integration loop: actual candidates, actions, rewards, terminal resolution, and metrics work together for the fixed sample. Two seeds total, one per difficulty shared across professions, and a scripted policy cannot establish win rates, route quality, strategic diversity, build viability, or human enjoyment. Treat this as an initial mechanical P1 implementation; mechanisms and recommendations still need broader automated coverage and playtesting before claiming that the directions work well for players.
