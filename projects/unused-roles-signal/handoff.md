# Handoff — unused-roles-signal (codebase path)

**Branch:** `feature/unused-roles-signal` in `flock-coke`, cut from `noah/flock-designer`.
**Built:** 2026-09-29 · **Path:** codebase (not a prototype) · **Level:** Ground · **FUI:** 5.5.4

**This is a small, self-contained change, not a branch requiring further wiring.** Nothing was
stubbed — the field this uses is already returned by the real endpoint and was already on every row.

## What changed

| File | Change |
|---|---|
| `src/components/role/rolesList/roleListRowCard.tsx` | Adds `FSChip variant="status" size="small" color="warning" label="Unused"` next to the role name when `row.userCount === 0`. Also prepends `", Unused"` to the row's existing `aria-label` in the same case, so the fact is available to assistive tech, not just sighted scanning |
| `__tests__/src/components/role/rolesList/roleListRowCard.spec.tsx` | **New.** 5 RTL specs: chip shown at 0 users, not shown at 1 or 3, and the accessible-description assertions for both cases |

No other file touched. No new endpoint, no new mock data, no Redux change — `userCount` was already
fetched (`useGetRolesForOrgQuery` → `RoleLite.userCount`) and already rendered elsewhere on the same
row (the "0 Users" link). This is a legibility fix, not a data change.

## What engineering picks up — the stubbed endpoints

**Nothing was stubbed.** `POST/GET */api/v3/organization/*/roles` was already handled by the existing
MSW handler (`src/mocks/handlers.ts:57`) against the existing fixture
(`src/mocks/fixtures/orgRolesV3.json`), and that fixture already contains three roles with
`userCount: 0` — no fixture edit was needed to see every state locally.

## Decisions that are yours, not settled here

1. **The chip label is "Unused"**, not a variant that restates the count. Flagged in `brief.md` as
   the one thing worth reacting to before treating this as final — a one-line change either way.
2. **`color="warning"`, not `error`.** Reasoned from `.flkd/product-patterns/pattern-inventory.md`'s
   existing colour mapping (`warning` = needs attention, not broken), not confirmed against Noah
   directly.
3. **Read-only roles with 0 users still get the chip.** Not named either way in the original request;
   treated as in scope since "unused" and "read-only" are independent facts about a role.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors |
| `npm run lint` (Biome) | Pass on the two changed files. (1 pre-existing error remains in `scripts/smoke-prototype.mjs`, unrelated to this change and outside its boundary — same file noted in `users-inactivity-signal`'s handoff.) |
| `npx vitest run --root __tests__/` | **373 passed** (43 files), including 5 new specs, 0 failures |
| Renders in the real app (`npm start`, `PUBLIC_APP_DESIGN_MODE=true`) | Pass — verified by fetching the served `/static/js/index.js` bundle and finding `"Unused"` and `roleListRowCard` in it |

## Accessibility

| Check | Result |
|---|---|
| Non-color signal | **Pass.** The chip always carries visible text ("Unused"); colour never carries the meaning alone |
| Accessible name | **Pass.** The row's existing `aria-label` now includes "Unused" for the 0-user case, so assistive tech gets the same fact a sighted scan gets from the chip, not just the literal "0 users" it already had |
| Heading structure | **Unchanged** — no heading added |
| Keyboard reachability | **Unchanged** — the chip is not interactive; the existing "0 Users" link keeps its own separate, already-working keyboard path |
| Screen-reader read-through | **Not run.** Needs a person with a screen reader; no tool substitutes. Owner: whoever takes the branch |
| Automated axe scan | **Run.** `npm run a11y` — axe-core 4.10.3, WCAG 2 A, both states. Clean, apart from one violation it found in code that predates this branch: `aria-required-children` on the permission icon strip, recorded as inherited and written up in the branch's `HANDOFF.md`. Added 2026-09-29 (step B3) |

## States

Every state this feature actually has (codebase path owes all of them, not a level-scaled subset per
`non-negotiables.md` §8): a role with 0 users (chip + updated aria-label), a role with 1 user, a role
with many users (both unchanged from today), and a read-only role with 0 users (chip shown; the
existing `readOnly` gating on Edit/Delete actions is untouched and orthogonal to this change).

## Not run, and why

- **Product-parity and implementation review** (`review.md`) — this session had no tool available to
  invoke the `product-parity-reviewer` or `implementation-reviewer` subagents. Recording this
  honestly rather than skipping the section or asserting a pass. Worth running before this is
  considered final, even though the change is small.
- **Manual click-through in a logged-in org** — verified via the served bundle (above) rather than an
  interactive session; no browser driver available in this environment.
