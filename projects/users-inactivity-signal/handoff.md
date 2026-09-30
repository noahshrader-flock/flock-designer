# Handoff — users-inactivity-signal (codebase path)

**Branch:** `feature/users-inactivity-signal` in `flock-coke`
**Built:** 2026-09-29 · **Path:** codebase (not a prototype) · **FUI:** 5.5.4

**This is a branch to take over, not a rewrite plan.** The frontend is complete. What remains is
wiring the data, below.

## What engineering picks up — the stubbed endpoints

**One thing is faked: `lastLogin` values.** Everything else is real.

| Endpoint | What was stubbed | What is needed |
|---|---|---|
| `POST/GET */api/v1/organization/*/user/search` | `lastLogin` added to `src/mocks/fixtures/searchUsers.json` for all 10 users | **Nothing — the field already exists.** `searchUserDto.ts:11` types it as `z.string()` and `user.ts:13` as `lastLogin?: string`. The fixture simply had no values |

**So there is no API work.** The real endpoint already returns `lastLogin`. The fixture was the only
gap, and it exists solely so the states are visible locally. Revert
`src/mocks/fixtures/searchUsers.json` and it runs against real data unchanged.

## What changed

| File | Change |
|---|---|
| `src/components/user/lastLoginDisplay.ts` | **New.** Pure display logic: relative text, and an inactive flag past a threshold |
| `__tests__/src/components/user/lastLoginDisplay.spec.ts` | **New.** 7 specs, fixed clock |
| `src/components/user/utils.ts` | `mapUserToTableRow` no longer pre-formats `lastLogin` — the row carries raw ISO |
| `src/components/user/orgUsersList.tsx` | Last Login column gains a `renderCell` |
| `src/mocks/fixtures/searchUsers.json` | Stub values only |

**The one structural decision:** `utils.ts` used to format `lastLogin` to a display string at the
data layer. It now passes the raw ISO and the column formats it, because how it reads is a display
decision. `lastLogin` was read in exactly two places, so the change is contained.

## Decisions that are yours, not settled here

1. **The 90-day threshold is invented.** Nothing in the codebase or product docs encodes an
   inactivity policy. `INACTIVE_AFTER_DAYS` is one constant. **This is the most likely thing to be
   wrong.**
2. **Relative dates replace absolute ones.** This is a behaviour change, not an addition — the column
   used to show `09/17/2026`. Anyone relying on the exact date loses it.
3. **Deactivated rows show nothing.** They are already marked in Status; a second signal competes.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors |
| `npm run lint` | Pass |
| `npx vitest run --root __tests__/` | **376 passed**, including 7 new |
| Renders in the real app (`start:design`) | Pass — verified in the served bundle |

## Accessibility

**Run, not assumed** — this ships, so "not run" is not acceptable.

| Check | Result |
|---|---|
| Non-color signals | **Pass.** Every chip carries text; colour never carries meaning alone |
| Accessible names | **Pass by construction.** Chip label is visible text; no icon-only variant added |
| Heading structure | **Unchanged** — no headings added |
| Keyboard reachability | **Unchanged** — the cell adds no interactive element |
| Focus management | **Not applicable** — nothing opens |
| Status announcement | **Not applicable** — static cell content, no live update |
| Screen-reader read-through | **Not run.** Needs a person with a screen reader; no tool substitutes. Owner: whoever takes the branch |
| Automated axe scan | **Run, clean.** See below |

**Automated axe scan: run, clean.** `npm run a11y` — axe-core 4.10.3 against WCAG 2 A, all four cell
states (`__tests__/src/components/user/lastLoginDisplay.a11y.spec.tsx`). No violations.

The cell was built inline in the column definition, so a test could only have rendered a copy of it.
It is now `LastLoginCell` in `lastLoginDisplay.tsx`, so the markup under test is the markup the Users
list renders. Added 2026-09-29 as part of step B3; this said "not run — Cypress does not launch" until
then, and axe never needed Cypress. Colour contrast is the one thing it cannot judge, because
happy-dom has no layout.

## States

Every state the feature has, visible in `start:design` with the stubbed fixture: today, days-ago,
at threshold, months inactive, years inactive, never logged in, unparseable, and deactivated.
