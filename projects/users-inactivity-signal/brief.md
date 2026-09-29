# Users list — inactivity signal

**Project ID:** `users-inactivity-signal`
**Branch:** `fd/users-inactivity-signal/i1` in `flock-coke` — cut from `noah/flock-designer`.
**Credibility level:** Explore
**Created:** 2026-09-29

## What's the problem

Admin → Users (`/users`, per-org — reached via the "Users" item under the Admin sub-nav,
`useAdminSubNavItems` in `src/components/common/appHeader.tsx:160`) has no legible way to tell how
long a user has been inactive. Orgs sitting on 100+ users have a chunk who haven't signed in for
months, and nobody notices until an audit. Support asked whether this could be surfaced.

**Verified against the codebase, not taken on the request's word:** there's already a "Last Login"
column (`src/components/user/orgUsersList.tsx:188-214`), so the raw data is being displayed today —
`user.lastLogin` is a real field (`src/data/models/user.ts:11`), formatted as an absolute date
(`MM/dd/yyyy`, `src/components/user/utils.ts:57,106`), no color, no relative framing, not sortable,
not filterable. The column exists; it doesn't answer "how long," and it doesn't call anything out.
That's the actual gap — not missing data, missing legibility.

## Why now

Noah is trying to decide whether this is worth doing at all, not how it should work. He asked for one
direction — his own first instinct, not a menu — rough, default state only, something he can open and
click around.

## Decision this supports

Whether an inactivity signal on the Users list is worth pursuing further. Not a spec, not validated
against any state beyond default.

## Design choice — first instinct, not a menu of options

**Change the existing "Last Login" cell from an absolute date to relative time-since-login, and
escalate it into the product's existing status-chip treatment only past an inactivity threshold.**

- **Below the threshold:** plain text — `Today`, `Yesterday`, `12 days ago`. No color, no chip. This
  alone answers "how long," which the absolute date didn't, without adding anything to scan.
- **At or past the threshold (90 days, or never logged in):** `FSChip variant="status" size="small"
  color="warning"`, e.g. `4 months inactive`, `1 year inactive`, `Never logged in`. This is the exact
  chip convention already used 58 times elsewhere in the product
  (`.flkd/product-patterns/pattern-inventory.md` — color + label together, label carries the meaning,
  color never carries it alone).

**Why this over the alternatives considered and rejected:**

- **A new column** (e.g. "Status: Inactive") would duplicate what "Last Login" already means and adds
  width to an already-wide table (8 columns) for the sake of restating the same fact in a second
  place. Flock's own convention is to cut content, not add a parallel column that says the same thing
  a different way (`product-native-ui.md` — "cut content before shrinking spacing").
- **Coloring every row's Last Login** (a heat-map style gradient) would break "color is used
  sparingly and meaningfully — status color earns attention because most of the page isn't colored"
  (`product-native-ui.md`). It would also make the normal case (someone logged in yesterday) visually
  loud for no reason.
- **A separate "days since login" number alongside the date** keeps the date's precision but doesn't
  read at a glance any faster than doing the subtraction yourself — it's the same legibility gap
  restated, not solved.

The chosen direction is the same move the product already made for MOU status on the Organizations
List (`orgs-list-signals` i2, this same repo's prior work): don't add a signal everywhere, escalate
only the row that needs a look, using the chip convention that already exists rather than inventing a
new one.

**One departure worth naming:** the pre-threshold text changes from an absolute date to a relative
one ("12 days ago" instead of "09/17/2026"). That's a real, deliberate change to the column's existing
behavior, not just an addition — flagged as the actual product question underneath this Explore
artifact: is "how long ago" or "what date" the more useful fact for the common case? This prototype
picks relative because it's what directly answers the stated problem ("no way to tell how long"), but
it's the one place this design overrides existing behavior rather than layering on top of it.

## Assumptions, stated plainly

- **90-day threshold is invented for this artifact**, not sourced from any existing policy — nothing
  in the codebase encodes an inactivity policy today (grepped `src/` for `inactiv`, `dormant`, `stale`
  — no matches outside this prototype). Noah's own framing ("haven't signed in for months") is
  consistent with 90 days but doesn't specify a number. This is the thing most likely to be "wrong" in
  exactly the way Noah invited — flagging it rather than defending it.
- **Single threshold, not tiers.** Noah asked for the simplest version, not a menu — one cutoff, one
  color, one wording pattern, deliberately not a three-tier (30/90/180-day) severity scale.
  "Never logged in" is folded into the same escalated treatment as "past the threshold" rather than
  given its own third state.
- **Deactivated users are unchanged** — they already carry a `Status: Deactivated` chip and the real
  row shape (`DeactivatedUserListRow`, `src/components/user/utils.ts:49-55`) doesn't carry a
  `lastLogin` value at all, so there's no second signal competing with the first on the same row.

## Change boundary

`src/prototypes/users-inactivity-signal/` only. Host: Users (`src/components/user/usersPage.tsx`),
route `/users` (org-scoped) and `/organization/:id/users`, nav item **Users** under the Admin sub-nav.
No route registered, no Redux, no real API, no LaunchDarkly. Local mock data typed against
`DisplayUser`/`User` from `src/data/models/user.ts`. Grid columns reproduce
`src/components/user/orgUsersList.tsx` (Name, Role, Identity Provider, User Mgmt, Search, Alerts,
Last Login, Status, row actions) so the one changed column can be judged in its real context, not in
isolation. Toolbar reproduces search + row count + Download CSV / Add New User visually; bulk-select
(feature-flagged in production, `SHOW_BULK_SELECT_USER_ACTIONS`), the Filters drawer, and
permission-gated action visibility are **not modeled** — orthogonal to the one signal this artifact
tests, and out of scope for an Explore pass. Row actions (Edit / Reset Password / Deactivate /
Reactivate) are present for visual completeness but simulated, not wired to any drawer.

## States built

Default/loaded only, per Explore. No loading, empty, or error state — not owed at this level, and
Noah asked explicitly to skip them.

## Verification

Explore doesn't require a formal review record or a context receipt, but the required checks were
still run rather than only asserted:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors |
| `npm run lint` (Biome) | Pass on `src/prototypes/users-inactivity-signal/` — 0 errors. (1 pre-existing error remains in `scripts/smoke-prototype.mjs`, an unsorted-import warning outside the change boundary, not introduced by this work — same file the `orgs-list-signals` prototype's review noted.) |
| Bare `src/…` value-import grep | Pass — no matches |
| `npm run smoke:prototype -- users-inactivity-signal` | Pass — bundles |
| `npm run check:boundary` | Pass — 5 files, all under `src/prototypes/users-inactivity-signal/` |

**Not reviewed.** No human has looked at this yet — it's built to be reacted to, per Explore's own
purpose ("make an idea discussable"), not to be treated as decided.

**Accessibility — built for, not verified.** No automated or manual accessibility check was run
(not owed at Explore, and not claimed as one). Built with the floor in mind: the inactivity chip's
`label` always carries the state in text ("4 months inactive", "Never logged in") — color is never
the only signal, matching non-negotiables §7 and the product's own status-chip convention. The
breadcrumb is a real `FSLink component="button"`, not `onClick` on a `div`. Keyboard/tab-order/focus
behavior was not checked at a keyboard.

## Where to view it

`npm start` boots the **real Coke app** (`src/index.tsx` → `App`) — it does not, on its own, know
this prototype exists. `src/prototypes/README.md` says "open `index.tsx`," but rsbuild has exactly
one configured entry point (`source.entry.index: './src/index.tsx'`, `rsbuild.config.ts`) and its
dev server serves an SPA fallback for every other path — confirmed by requesting the prototype's own
`index.tsx` directly and getting the same bytes back as `/`. So viewing one requires a **temporary,
local, never-committed** swap of what that one entry point renders. This is not documented in
`src/prototypes/README.md` as written; flagging it here rather than asserting the README's
instruction works as literally stated.

**Verified working, this session:** back up `src/index.tsx`, replace its contents with:

```tsx
import 'react-app-polyfill/ie11';
import 'react-app-polyfill/stable';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';
import './index.scss';

import { FSApp } from '@flocksafety/flock-react-component-lib';
import { createRoot } from 'react-dom/client';
import UsersInactivitySignalPrototype from './prototypes/users-inactivity-signal';

const root = createRoot(document.getElementById('root')!);
root.render(
    <FSApp>
        <UsersInactivitySignalPrototype />
    </FSApp>,
);
```

then `npm start` and open the printed URL (port 3000, or the next free port — this machine had 3000
already in use and rsbuild moved to 3001 without complaint). Confirmed by fetching the compiled
`/static/js/index.js` bundle and finding the prototype's own strings in it ("Never logged in",
"months inactive"). **Revert `src/index.tsx` to its original contents afterward** — it must never be
committed with this swap in place; it isn't part of the change boundary.

Once reverted, `git status` should show no changes outside `src/prototypes/users-inactivity-signal/`.

`index.tsx` (the prototype's own) renders a one-button state switcher (Explore owes only the default
state) above the Users list itself. The list is fully interactive — sort by clicking a column header,
search with the quick filter, page through 20 mock users, open a row's action menu — none of it wired
to anything real, all of it genuine `FSDataGrid` behavior.

**Worth raising separately from this project:** `src/prototypes/README.md`'s "Open `index.tsx`"
instruction doesn't hold as literally written given the single-entry-point rsbuild config above —
future reviewers will hit the same gap. That's a tooling note for whoever owns the prototype harness,
not something this Explore artifact should fix by itself.
