# Beta 89: Lantern card design review

## Scope and method

I reviewed the complete v20 card catalog programmatically: all 124 cards, both base and upgraded effect arrays, costs, exhaust/replay flags, descriptions, reward acts, and profession ownership. I also checked the compact paired v19/v20 expedition report at `docs/roguelike/V20_BALANCE_SIM.json` (96 runs total). This is a catalog and policy-simulation review, not a new expedition run or a proposed balance patch.

## Findings

| Severity | Type | Finding |
| --- | --- | --- |
| Medium | Functional design defect | `gatebreak` (“破门槌”) has an upgrade record, but its base and upgraded effects are identical: `damage_from_shield`, value 2, maxSpend 5. Cost, exhaust, and replayability also stay the same. An upgrade at camp or via another effect therefore spends an upgrade opportunity for no effect. Either give the upgrade a meaningful change or make the card ineligible for upgrades. |
| Low | Target usability | `v07_wound` (“旧伤”) likewise has an upgrade record that remains `block: 0`; it is an intentionally weak status card, but `supportTargetAllowed` accepts any unupgraded card with an upgrade object. That means `mail_redirect` can offer Wound as an upgrade target even though the upgrade portion does nothing. Excluding this status card from upgrade-target candidates would avoid the dead choice. |
| Low | Content redundancy hypothesis | Five pairs are mechanically identical across cost, base effects, upgrade effects, exhaust, and replay flags: `guard`/`riposte_stance`, `pierce`/`measured_thrust`, `ash_wall`/`iron_wall`, `bellwatch`/`folded_note`, and `foamy_guard`/`cask_guard`. Their names and reward timing differ, so this is not an execution bug; it does make some reward choices functionally interchangeable. Differentiate at least some pairs if those names are meant to represent distinct tactical roles. |
| Watch | Balance hypothesis | In the same policy sample, v20 cleared 25/32 runs at difficulty 0 versus v19’s 29/32, and 8/16 at difficulty 3 versus 9/16. Mean ending HP shifted from 14.69 to 11.25 at difficulty 0 and from 6.81 to 5.88 at difficulty 3. V20 pressure and offensive shield intents are plausible contributors, but the sample is small and the two-action greedy policy is not human-play evidence. Treat this as a signal to observe, not a tuning recommendation. |

## Interaction checks

The `shared_ultimatum` “last play” bonus is reachable: `PLAY` increments `s.plays` before effects capture their condition snapshot, so it can trigger in the third slot, or fourth when `tempo` expands the limit. Its upgraded damage rises from 4 to 5 while retaining the +4 condition bonus.

Resource converters are setup-sensitive but not unreachable. `fire_cashout` needs existing enemy burn; `trail_ambush`, `gate_reserve`, and `shared_bank` need shield already accumulated this turn to bank it; pet converters require a living pet; forge converters require forge. Their target/resource prerequisites are enforced for pet and forge cards, while burn/shield converters can still be played with zero input and yield little or no converter value. This is a usability tradeoff rather than a broken conversion rule; the paired simulation used `fire_cashout` only twice per version sample.

Energy, draw, and action caps behave consistently with card text in the reviewed definitions: energy is capped at 5, hand draw at 5, and `tempo` grants only one additional play for a four-play turn. `shared_sprint` is explicitly described as costing 2 HP; at the energy cap its base version can still be played for no energy gain, so its value depends on planning and the upgraded 2 shield. That is a tactical risk, not an invalid state.

The new pool adds 28 cards relative to v17: 25 enter act 1 and 3 enter act 2; none are introduced in act 3. Each profession has six exclusive cards in the full pool. The audit’s surfaced acquisition candidates and deck snapshots passed the act and profession gates. In the v20 sample, the added signatures did occur: `hot_iron` pierce 57 times, `mail_return` recovery discount 5 times, and medic-badge preparation 69 times. These counts show reachability under this policy, not broad balance.

## Review disposition

The actionable issue is the no-op `gatebreak` upgrade. The Wound target and identical card pairs are smaller content-quality concerns. No additional resource-conversion, draw-cap, or action-cap correctness defect was found in this review.
