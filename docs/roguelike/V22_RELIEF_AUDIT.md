# beta92 third-act relief (v0.22 numerical hotfix)

Human feedback: a third-act boss can deal30 in one turn against approximately29 player maximum HP, while100+ boss HP and late-turn attack growth turn combat into mandatory defense. The beta91 audit already showed difficulty3 fixed-policy clears falling8/16 to1/16; human feedback confirms the burst/HP/pressure combination was too punishing.

## Root cause and scope

Difficulty bonus, per-hit rounded act budget, phase bonus and long-fight pressure stacked on every packet. Pre-hotfix scoped engine probes of Molten Colossus show phase2 totals30/32 at difficulty0 turns7/11 and40/42 at difficulty10 turns7/11. The old average-per-attack figure concealed these lethal spikes.

Only live v0.22 third-act balance is relieved. v0.21 and older engines/catalogs remain unchanged; the first two acts, cards, acquisition gates, player max HP, healing, rewards and economy are unchanged.

| Adjustment | beta91 | beta92 |
|---|---|---|
| Third-act elite/boss act budget | 3 /4 | 2 /2 |
| Third-act boss heavy single-hit floor | pre-bonus19 | removed |
| Third-act late-turn pressure | elite+1, boss+2 per packet | removed for all act3 foes |
| Third-act boss base HP: Bellmaster /Bell Colossus /Molten Colossus | 68 /84 /80 | 62 /72 /72 |
| Third-act boss final HP cap after all multipliers | none | 80 + difficulty level |
| Third-act elite/boss attack action total including all hits | none | difficulty0–5:22; difficulty6–10:24 |
| Molten Colossus standard full heavy: phase1 /2 | 24 /28 before late pressure | 20 /22 |
| Molten Colossus standard broken-furnace heavy: phase1 /2 | 18 /20 before late pressure | 14 /16 |

Attack caps apply after act/difficulty/danger/phase modifiers and before charge-break reduction. Each packet receives at most floor(total cap / hits), so multihit totals cannot exceed the cap. They are per enemy attack action, not a cap on combined self-cost, burn, thorns or other sources. Player shields and pets then mitigate normal engine damage. HP cap90 at difficulty10 is engine-verified; standard final boss maxima are67/78/78.

## Already-running saves

A one-time balanceRevision1 relief normalizes active v0.22 third-act battles at service load, router action, battle action, private panel and image rendering. It removes old saved pressure, lowers/caps the current attack, refreshes the actual next charge/phase preview and proportionally lowers enemy remaining HP when lowering maximum HP. The current attack can retain an already-promised lower value rather than being increased. Subsequent turns use the new catalog values. Already-started furnace shielding/cycle flags remain until their normal resolution; new cycles use reduced shields8/10.

It does not restore player HP, refill cards, reset the turn, advance phase, change RNG or action version, revive defeated battles, or convert v0.21 saves. Pure normalization is idempotent across JSON; service persists it once after ownership checks. Existing panels require refresh to display the corrected current intent.

## Validation

387 lantern,93 chat,27 Worker checks pass. Six new tests cover all third bosses at difficulties0/3/6/10 and both phases across20 turns, attack/HP bounds, no long-turn pressure, useful furnace break, active snapshot preservation/idempotence, current displayed vs actual22 HP loss (full30 HP player survives with8), next-charge consistency, frozen/finished saves and real SQLite service persistence/ownership. The12 existing new-enemy tests were updated to the relieved numbers and pass.

One48-run v22-only audit used the unchanged prior route/combat policy,32 runs at difficulty0 and16 at difficulty3. No old-v21 rerun and no repeated final simulations. See V22_RELIEF_SIM.json and scripts/audit-lantern-v22-relief.mjs.

| Measured result | Difficulty0 | Difficulty3 |
|---|---:|---:|
| Clears, beta91→beta92 | 15/32→26/32 | 1/16→6/16 |
| Max third-act attack-action total observed | 22 | 22 |
| Max third-act boss HP observed | 78 | 83 |
| Third-act pressure turns | 0 | 0 |

The fixed policy reaches both new bosses but avoids all three new elites; scoped tests cover elite rules, not full-run elite balance. These small samples establish functioning relief, not human win-rate/fun. Existing v21 reconstructed raw-damage figures are not used for exact comparisons. No Discord messages were sent.

## Release

Implementation/local checks complete. GitHub review, main deployment, configuration and public health verification pending.
