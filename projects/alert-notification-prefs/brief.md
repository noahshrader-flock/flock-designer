# Alert notification preferences

**Project ID:** `alert-notification-prefs`
**Branch:** `fd/alert-notification-prefs/i1` in `flock-coke`
**Credibility level:** Test
**Created:** 2026-09-28

## What this actually is

**A harness confirmation, not a real product decision.** Step 7 of the plan requires one small real
artifact to prove the prototype contract works before it is used on anything that matters. This is
that artifact. The subject was chosen to exercise the contract — real FUI components, a real product
pattern, and every view state — not because anyone asked for this screen.

**Do not treat the design conclusions here as decided.** Nobody reviewed the product thinking.

## The decision it would support, if it were real

Whether per-alert-type notification preferences belong as a settings surface under Organization,
using the canonical settings-row pattern, and whether that pattern survives contact with the states
it would really have to show — particularly permission-locked rows and partial load failures.

## Change boundary

- `src/prototypes/alert-notification-prefs/` only.
- Plus, explicitly authorised by step 7 as infrastructure rather than project work:
  `scripts/smoke-prototype.mjs`, one line in `package.json`, and the verification sections of
  `src/prototypes/README.md`, `.flkd/agents/flock-designer.md`,
  `.flkd/skills/scaffold-product-view.md`, and `.flkd/knowledge/agent-gaps.md`.
- Nothing else. No routes, no flags, no Redux, no API.

## Level and what it owes

Test. Local mock data, the interactions that carry the decision, and the states that carry it. All
seven view states are built here because proving a reviewer can switch between them **is** the point
of this artifact.
