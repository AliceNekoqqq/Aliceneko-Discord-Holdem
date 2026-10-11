# v0.11 P2 connected-route audit

This independent audit covers the v0.11 route graph, route-choice validation, text/image route views, old-save routing, and a bounded scripted playthrough comparison. It does not establish that route choices are fun, balanced, or strategically deep; those need human play and feedback. No route-generation, card-effect, or shop-price changes were made by the audit.

## Graph and route validation

The audit script generated 2,000 fixed seeds across all three acts (6,000 plans and 144,000 edges). Every plan had four rows of three nodes, 24 exact directed edges, outer-lane-to-same/middle links, middle-lane-to-all links, and all fourth-row nodes connected to the act boss. Every node in row one was a normal encounter; its middle node was the only dangerous encounter, and no first-row node forced an elite. Each plan had exactly one camp in row two or three, reachable from every first-row node. Camp rows two and three both appeared in the seed sample. Row-role combinations retained the designated shop/event/elite/normal opportunities around the camp.

An explicit non-adjacent route jump was rejected with `INVALID_ROUTE`. A JSON-restored route state accepted a legal next edge. The generic router continued an existing v0.10 save through v0.10 logic, while v0.11 remained the current version. The route graph checker rejects malformed dimensions, duplicate or extra edges, missing/reversed edges, unknown endpoints, and nodes disconnected from the boss. Effect-metric merging and old-save observation handling are wired for v0.11 in the service path; legacy versions keep their version dispatch.

The route page’s “通往” labels matched graph edges, and the generated image model exposed the same edge list as the saved plan. Supply text marked the center camp as reachable from the first station, then marked it as missed after the player chose a different row-two node. This confirms that the recovery text follows the selected path rather than treating every camp as permanently available.

The v0.11 catalog was deep-compared to v0.10 after normalizing the version label: card definitions, effects, costs, item/event data, and shop prices are unchanged. v0.11 inherits the v0.10 early reward-pool placement of `quiet_hour` and `clean_cut`.

## Fixed-seed playthrough comparison

Ran all eight professions at difficulty 0 and 6 on both v0.10 and v0.11, reusing the P1 seeds `v10-p1-fixed-d0` and `v10-p1-fixed-d6`. The battle evaluator, route priority, reward choice, camp threshold, and event choice match `scripts/audit-lantern-p1.mjs`: two-step greedy battle scoring; prefer a camp below 24 HP, then a safe normal encounter, then normal/camp/event/elite/first available; take default rewards, the first blessing, event gain where offered, and leave shops. All route actions were selected from the legal choices.

| Profession | v0.10 d0 | v0.11 d0 | v0.10 d6 | v0.11 d6 |
| --- | --- | --- | --- | --- |
| Traveler | CLEAR, 27 HP | CLEAR, 22 HP | CLEAR, 23 HP | CLEAR, 25 HP |
| Warden | CLEAR, 30 HP | CLEAR, 27 HP | CLEAR, 18 HP | CLEAR, 22 HP |
| Brewer | CLEAR, 21 HP | CLEAR, 13 HP | CLEAR, 9 HP | CLEAR, 2 HP |
| Messenger | CLEAR, 25 HP | DEFEAT at 14 stations, 30 HP | CLEAR, 3 HP | CLEAR, 3 HP |
| Smith | CLEAR, 26 HP | CLEAR, 24 HP | CLEAR, 15 HP | CLEAR, 14 HP |
| Medic | CLEAR, 11 HP | CLEAR, 22 HP | CLEAR, 8 HP | DEFEAT at 14 stations, 0 HP |
| Tamer | CLEAR, 29 HP | CLEAR, 29 HP | CLEAR, 21 HP | DEFEAT at 4 stations, 24 HP |
| Forger | CLEAR, 30 HP | CLEAR, 28 HP | CLEAR, 10 HP | CLEAR, 11 HP |

The v0.11 sample cleared 7/8 runs at difficulty 0 and 6/8 at difficulty 6, compared with 8/8 at both levels in the v0.10 baseline. Failures were Messenger at d0 and Medic/Tamer at d6. These are small fixed samples and do not show a general difficulty increase: several v0.11 runs finished with more HP than their v0.10 counterparts, and the failed professions differ by route. The losses are useful triggers for checking the exact act/station route and resource availability for those professions; they are not evidence for changing combat numbers.

The sample’s safe policy selected no shops. This is a policy limitation, not evidence that shops are absent: the audit also ran three route strategies on the same v0.11 seed. Safe play visited three camps and no shops, clearing with 29 HP. Shop-seeking visited one camp and three shops but made no purchases (the shared shop policy leaves immediately), then lost at the second-act boss. Risk-seeking took three dangerous middle encounters and five elites with no camps or shops, and cleared with 23 HP. The routes differed at legal nodes while retaining the same seeded map. These outcomes illustrate different legal paths only, and cannot assess the value of shop investment; the scripted policy does not know the player’s intent or whether a route feels worthwhile.

## Image glyph correction and validation limits

The shared nickname font loader had emitted dynamically loaded glyphs as five-element tuples. The renderer expects `[width, height, advance, pixels, byteLength, unit]`; omitting the sixth field selected the default 48-unit scale, and the old fifth field used `24` instead of the 576-byte bitmap length. The loader now supplies `entry[2].length` and explicit `unit: 24`, matching the existing atlas glyph schema. The targeted `nickname-font.test.mjs` passed and verifies both values and measured text width. The parent’s real Noto image generation visual check also confirmed consistent glyph size.

Run `node scripts/audit-lantern-p2.mjs` to repeat the graph sweep, route/view assertions, old-version check, and 32 fixed-seed plays. This sample and the unit tests validate bounded mechanics and integration; neither can replace human route decisions, accessibility review on Discord clients, or playtesting.

Final local integration checks: Lantern 213/213, Worker 25/25, assets 116/116. No bindings, secrets, migration tags, cron schedules or compatibility settings were changed by this implementation. Deployment and real Discord checks are tracked separately in PROJECT_NOW.md.
