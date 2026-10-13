# beta91 / v0.22 enemy and pressure audit

Five new enemies are in real act pools: act-two elite Mirror Pursuer and Furnace Guard, act-three elite Reverse Hunter, act-two boss Mirror Adjudicator, act-three boss Molten Colossus. Catalog: 35 enemies, 124 unchanged cards. New runs use v0.22. Older catalogs and battle engines remain frozen.

## Final attack progression

| Role | Act 1 budget | Act 2 budget | Act 3 budget |
|---|---:|---:|---:|
| Normal | 0 | 1 | 2 |
| Elite | 0 | 2 | 3 |
| Boss | 1 | 2 | 4 |

Each attack packet adds ceil(budget / hit count). This can exceed the whole-move budget by less than its hit count. Difficulty, dangerous-room, phase and bounded long-battle bonuses then apply. Third-act boss heavy single-hit base packets (raw value >=10) have a pre-bonus floor of19; difficulty zero therefore reaches at least20, before player defense and valid break reductions. Weakened furnace strikes never receive the heavy floor. Charge previews include the next round's actual pressure and reductions.

Selected difficulty-zero, non-dangerous values before late-turn pressure:

| Enemy | Main attack | Response window |
|---|---|---|
| Mirror Pursuer | at most2 plays:10; third play:6×3=18 | fewer plays choose lighter attack; rest armor0 |
| Furnace Guard | opening9; charged15, broken10 | break actual furnace shield during charge; cooling armor0 |
| Reverse Hunter | 5×3=15; heavy22, broken16 | charge armor0; ten actual HP loss breaks; phase2 requires12 |
| Mirror Adjudicator | recording8; attack-first next9 +8 opening shield; other next7×2 | first active card locked; phase2 at most2 plays17, third play7×3 |
| Molten Colossus | opening11; full12×2=24, broken9×2=18 | break10 furnace shield; second phase opening13, full14×2=28, broken10×2=20; cooling armor/shield0 |

New enemy half-HP transitions are queued until their current cycle's rest. Already-previewed responses and weakened strikes resolve before the next phase. Furnace shield remains through charge; enemy burn bypasses it and cannot break it. Direct damage/shield removal can break it even without enemy HP loss. First-card and count responses use active plays; echoes/items do not count. Private text and image cues show actual branches and values.

## Verification

- 381/381 lantern tests,93/93 chat tests,27/27 Worker tests.
- Twelve new tests cover catalog/pools/frozen versions, actual tempo attack, furnace shield carry and damage-free breaking, burn bypass, delayed phase, recorded first-card/count response, hunter break, next-turn pressure, echo accounting and all five private panels.
- Boundary audit:848 successful active plays,274 echoes,744 panels; no invalid menu options/cost/target/limits.
- Actual new-boss PNG rendered and visually checked. No Discord messages were sent.
- Version-specific additional bounded metrics record incoming attack, pet absorption, actual attack HP loss and player burn HP loss. Shared old metrics remain unchanged.

## Full-route evidence and limits

See V22_BALANCE_SIM.json and scripts/audit-lantern-v22.mjs.96 full expeditions (48 paired comparisons): difficulty0 four seeds × eight professions × two versions; difficulty3 two seeds × eight professions × two versions. Same policy and seeds as v21, JSON restoration after actions, acquisition/dispatch checks; no timeouts.

The initial more aggressive budget (elite0/2/4, boss1/3/6, heavy floor23) produced v22 clears13/32 at difficulty0 and0/16 at difficulty3. Final tuning lowers elite/boss progression and heavy floor as above. Final clears: v21→v22 difficulty0 27/32→15/32; difficulty3 8/16→1/16. Difficulty3 remains demanding for this fixed policy; this is not a calibrated human win-rate target.

| Final v22 observation | Act1 | Act2 | Act3 |
|---|---:|---:|---:|
| Difficulty0 actual mean incoming per attack action, including multihit | 7.74 | 10.52 | 14.07 |
| Difficulty3 actual mean incoming per attack action, including multihit | 8.36 | 11.42 | 15.68 |
| Difficulty0 actual attack HP loss per battle | 1.83 | 6.74 | 10.34 |
| Difficulty0 boss defeats / boss encounters | 0/32 | 3/32 | 13/28 |

New boss encounters: Adjudicator11/6 and Colossus7/1 at difficulty0/3. Furnace breaks occurred3/1 times. Route policy avoided all three new elites; focused engine tests cover their mechanics, but this sample does not establish their full-run balance. Response-event counters in the completed sample are unavailable due to an audit flag-path bug; the future script is corrected, scoped tests cover locking. V21 raw incoming values are reconstructed rather than engine measurements and can include a non-executed final attack at an active kill; do not treat their raw totals as directly comparable. Final v22 incoming values above are engine-measured. Net HP observations may include self-cost, burn and overkill; use capped attackHP metrics for actual attack loss. Small automated samples do not establish human strategy/fun.

## Release status

PR37 merged: runtime commit1e34c845fa88e264ce20ce7241b171d4c44ce538. PR check38330402648 and main deployment38330571570 succeeded. Cloudflare deploymentfb1184b3-fee0-4763-984e-e3d7a074b494, versionfc2aa9d2-6fa5-402e-b624-00dde5269dd7 serves100%. All13 bindings, compatibility date/flags, observability and Cron match the pre-release configuration. Public health confirms beta.91/v0.22/35 enemies, ready=true and Gateway connected/ready=true; chat84-exclusive-red-packet fingerprint retained.
