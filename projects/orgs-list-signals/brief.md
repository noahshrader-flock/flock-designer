# Organizations List — signals

**Project ID:** `orgs-list-signals`
**Branch:** `fd/orgs-list-signals/i1` in `flock-coke` — created, cut from `noah/flock-designer`.
**i2 built on the same branch, not a new `i2` branch — see the i2 section below for why.**
**Credibility level:** Test (unchanged for i2 — see i2 section)
**Created:** 2026-09-28
**Status:** i1 built and shown to the team 2026-09-24. i2 addresses that feedback. See
`context-receipt.md` and `review.md`.

## i2 — stakeholder feedback from the 2026-09-24 team review (recorded 2026-09-28)

The org showed i1 to the team Thursday 2026-09-24. Feedback, verbatim from the requester:

1. **Drop the integrations chip entirely** (not a placeholder). Backend confirmed no near-term path
   to a real integrations aggregate — could be a couple of quarters. Showing an unbacked number read
   worse than showing nothing once people started asking where it came from.
2. **MOU Not Signed needs to read as the loud, action-needed signal**, not a chip that looks the same
   grey as whatever sits next to it. It's "the quietest thing on the row" today and it's the one that
   means someone has to act.
3. **Show what a deactivated org looks like mixed into the list.** The "Include Deactivated" checkbox
   already exists on this page; the requester didn't think about its rendering until someone asked in
   the room, and explicitly doesn't know what it should look like — wants an option to react to, not
   a silent decision.

**Scope for i2:** all three, still Direction A only (Direction B / org-type-column-split remain
unbuilt, unchanged from i1). "Same level of finish as last time" — level stays **Test**, per
`brief.md`'s own i1 record above; this iteration doesn't upgrade to Ground/Handoff evidence nor
downgrade to Explore.

**Branching-convention note, flagged rather than silently decided:** per
`.flkd/agents/flock-designer.md`, each iteration is meant to be "cut from the previous accepted
iteration, so the path is visible in Git." i1's prototype code was never actually committed — `git
status` on `fd/orgs-list-signals/i1` shows it as untracked working-tree files, not a commit. Cutting
an `fd/orgs-list-signals/i2` branch from that state would not produce any real git-visible separation
between i1 and i2 (branching an uncommitted working tree just carries the same untracked files
along), so it wouldn't fulfill what the convention is actually for. Rather than manufacture a
cosmetic branch or commit code on the designer's behalf without being asked (commits are made only
when explicitly requested), i2's changes were made in place on `fd/orgs-list-signals/i1`. If a
git-visible i1/i2 split is wanted, it needs two explicit commits — one finalizing the pre-feedback
i1 snapshot, one on a new `i2` branch for these changes — and that should be a deliberate ask, not an
inferred one.

## Decisions on the three blocking questions (2026-09-28)

1. **Branch** — approved. Cut `fd/orgs-list-signals/i1` off the current point in history.
2. **Level** — re-mapped from the originally-proposed Explore to **Test**: the requester wants
   something clickable/interactive for Thursday, not a static mockup. Test's grounding (local mock
   data, key interactions, the states that carry the decision) and output (clickable prototype +
   review evidence) fit what was asked for.
3. **Scope** — build **only Direction A** (the enriched card list: keep today's Mode A pattern, add
   an MOU-status chip and an integrations signal to each row). Direction B (the full table) and the
   org-type-column-split variant are **not built** this iteration — both stay flagged as open
   questions below and in `review.md` rather than resolved in code.

Everything below this point is the original Explore-stage framing this iteration was built from; it
is left as-is rather than rewritten, since the problem statement, data-model findings, and open
questions it captured are still accurate and still what i1 answers.

## What's the problem

Admin → Organizations List (`/organizations`, nav item "Organizations List" under
`useAdminSubNavItems`) shows only org name and type per row. **Verified against the codebase**, not
taken on the requester's word:

- `src/components/org/orgList/orgsList.tsx` → `OrgListForm` → `OrgListRowCard`
  (`src/components/org/orgList/orgListSlotComponents.tsx:16-31`) renders exactly two lines per row:
  bold org name, then `Type: {type}`. Nothing else.
- It's an `FSDataGrid` **Mode A** card list (column headers suppressed, `getRowHeight={() => 'auto'}`,
  one `renderCell` drawing the row card) — the landing-page pattern per
  `.flkd/product-patterns/list-and-table-patterns.md`.
- `OrgRow` (`src/components/org/orgList/orgListForm.tsx:165-169`) is typed as `{ id, name, type }`
  only.

An admin managing many orgs genuinely can't tell anything else without opening each one. The
complaint is accurate.

## Why now

Two concrete complaints named in the request: onboarding needs MOU status visible; support can't tell
which orgs have integrations configured without checking one by one. Stakeholder wants something to
put in front of the team **Thursday 2026-10-01** and react to — explicitly not a finished spec.

## Open questions, in the stakeholder's own words

- MOU status and integration status are the two *likely*-useful signals — not confirmed.
- Open question: does this stay a list, or become a real table?
- Open question: do HOA and Law Enforcement orgs need different columns?
- Explicitly not trying to solve org management; not trying to cram every field in.

**One correction to add to that last question:** `OrgType` (verified in
`node_modules/@flocksafety/flock-titos-lib`) has **8** values — `EDUCATION`, `BUSINESS`, `DEMO`,
`LAW_ENFORCEMENT`, `PROPERTY_MANAGEMENT`, `ADMIN`, `HOA`, `CHANNEL_PARTNER` — so "does HOA need
different columns than Law Enforcement" is really "does org type need different columns," a
bigger question than a two-way split once it's actually on the table.

## Data model — verified against `src/data/`, corrects part of the request's framing

- `mouSigned: boolean` and `defaultTimezone: string` **are real fields** on `Organization`
  (`src/data/models/organization.ts:15-28`). Genuinely available data, exactly as the requester said.
- **But** the list endpoint itself only returns the thin shape. `useGetAllOrgsQuery`
  (`src/redux/apiSlices/organizationSlice.ts:89`) returns `AllOrgsDto.organizationsList:
  OrganizationLite[]` (`src/data/dto/allOrgsDto.ts`), and `OrganizationLite` is `{ id, name, type }`
  (`src/data/models/organization.ts:9-13`) — nothing else. The richer `Organization` shape is fetched
  **per org**, not returned in bulk by the list query.
- Users / roles / networks / integrations: **verified there is no existing count or summary field
  anywhere in the codebase** — grepped for `userCount`, `networkCount`, `roleCount`,
  `integrationCount`, `numUsers`, `totalUsers` across `src/`: zero matches. Those exist today as full
  related lists reachable from each org's own pages (Users page, Roles page, org Networks list,
  Integrations page), not as an aggregate carried on the org record itself.

So: "the data's already there on each org" is accurate for MOU and timezone — those are a field
that already exists and just isn't rendered. For users/roles/networks/integrations it's accurate only
in the loose sense that the underlying relations exist somewhere in the product; showing any of the
four as a list column means **inventing a new aggregate** (a count, or a boolean "has any"), which is
real backend work later even though an Explore artifact can mock it freely now. Worth saying out loud
Thursday rather than leaving implicit.

## Proposed scope for Thursday — pending confirmation, nothing built

Two rough, static directions, default state only (Explore owes exactly that — see
`.flkd/manifest.md` credibility table), addressing the list-vs-table question and the two named
signals, while calling out rather than resolving the org-type-column question:

**Direction A — enriched card list.** Adapts the current Mode A pattern in place: keep
`FSDataGrid` Mode A, add a second metadata line under the existing name/type line on each row card —
an MOU status chip (`FSChip variant="status"`, success/warning, per
`.flkd/product-patterns/pattern-inventory.md`'s status-chip convention) and an integrations signal
(chip or short text: "3 integrations" / "No integrations configured"). Lowest disruption from today.

**Direction B — real table.** Converts to `FSDataGrid` **Mode B**, following
`src/components/user/orgUsersList.tsx` (the only full server-side Mode B implementation in the
product) for grid conventions, and `authorizedAccessListTable.tsx` for a status-chip column. Columns:
Org Name, Type, MOU Signed (status chip), Integrations (count or chip), Timezone. Sorted by name by
default, quick-filter + count-header toolbar per `list-and-table-patterns.md`.

Note for Thursday's discussion, not resolved by either direction: `.flkd/standards/flock/
product-native-ui.md` states "Tables are for scanning many rows... Cards are for a handful of
distinct things, not fifty" — an admin managing *a lot* of orgs is the textbook table case, which
argues for Direction B on Flock's own stated convention, independent of whichever fields end up
chosen.

Both directions would carry a written callout — in the report, not hidden in the code — naming the
org-type-columns question and the users/roles/networks aggregation gap above, rather than silently
deciding either one.

## Change boundary (once the branch question below is settled)

`src/prototypes/orgs-list-signals/` only. Host: Organizations List
(`src/components/org/orgList/`), route `/organizations`, nav item "Organizations List" under the
Admin sub-nav (`useAdminSubNavItems`, `src/components/common/appHeader.tsx:136`). No route
registered, no Redux, no real API. Local mock data typed against `OrganizationLite`/`Organization`
from `src/data/models/organization.ts`, plus invented fields for the aggregate counts — clearly
labeled as invented in the mock data file and the report.

## Blocking questions — need an answer before anything is built

1. **Branch.** Current branch is `noah/flock-designer`, not an `fd/<project-id>/iN` branch, and no
   `fd/orgs-list-signals/*` branch exists. Per `.flkd/skills/scaffold-product-view.md` step 3, the
   agent doesn't create or switch branches without sign-off. Confirm the project-id
   `orgs-list-signals` (or a different slug) and say go-ahead to cut `fd/orgs-list-signals/i1`.
2. **Level.** Explore is proposed here based on the request's own "put it in front of the team and
   react" framing and its two explicit open questions. Confirm that's right for Thursday rather than
   something clickable (Test) or fully sourced (Ground/Handoff).
3. **Scope.** Confirm two static directions (enriched list vs. real table) is the right amount,
   rather than one, or rather than also building the org-type-column split as a third variant.
