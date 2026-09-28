# Review record — orgs-list-signals

## Iteration i1 — 2026-09-28

**Branch:** `fd/orgs-list-signals/i1` · **Baseline:** `flock-coke` `noah/flock-designer` · **FUI:**
5.5.4 · **Level:** Test · **Scope:** Direction A only (enriched card list)

### What this is

The Organizations List (`/organizations`, "Organizations List" under the Admin sub-nav), rebuilt as
the existing `FSDataGrid` Mode A card list with two new signals added to every row: an MOU-status
chip and an integrations signal. Direction B (a full table) and the org-type-column-split idea were
**not built** — both are open questions below, by explicit scope decision, not by omission.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors |
| `npm run lint` (Biome) | Pass on `src/prototypes/orgs-list-signals/` — 0 errors. (4 pre-existing errors remain in `scripts/smoke-design-mode.mjs`, outside the change boundary and not introduced by this work.) |
| Bare `src/…` value-import grep | Pass — no matches |
| `npm run smoke:prototype -- orgs-list-signals` | **Pass — bundles** |

### Product parity

**Observed, and named:**

- The grid configuration (`columnVisibilityModel`, `getRowHeight={() => 'auto'}`, the `.MuiDataGrid-main` border `sx` block, `initialState.sorting`, the `filterModel`/`onFilterModelChange` wiring, `slots.columnHeaders: () => null`, the external `FSTablePagination` row) reproduces `src/components/org/orgList/orgListForm.tsx` closely, backed by local filtering instead of `useGetAllOrgsQuery`.
- The toolbar (quick filter, "Include Deactivated", "Add New Organization") reproduces `OrgListToolbar` (`orgListSlotComponents.tsx`), swapping the `@mui/icons-material` `Add` icon for `FSSymbol name="add"` per non-negotiables §4.
- The status chips follow the product's existing convention exactly: `FSChip variant="status" size="small"`, colour + label together, label carries the meaning (`.flkd/product-patterns/pattern-inventory.md`).
- The empty state (search matches nothing) uses the documented **filtered-empty** variant — one line, no icon, no action — and the toolbar hides entirely at zero rows, both matching existing product convention rather than inventing new ones.

**Adapted, and named as a fix rather than a copy:** the real `OrgListRowCard` puts `onClick` on the
outer `FSStack` (a `div`), with `tabIndex` on an unrelated inner `FSBox` — not keyboard-operable, and
the same shape recurs in the other three Mode A row cards in the product (`rolesList`, `zonesList`,
`authorizedAccessList`). Non-negotiables §7 states this as a hard rule regardless of credibility
level ("never attach `onClick` to a `div`/`span`/`li`"), so this prototype makes the org name a real
`FSLink component="button"` instead — the same pattern `Breadcrumb` in `pageTitle.tsx` already uses.
**This is a real, pre-existing accessibility gap in production**, not something this prototype
introduced; worth a ticket independent of whether Direction A goes anywhere.

**Not reviewed.** No human has looked at this against the real product view yet. The parity claims
above are this agent's own reading of the pattern files and the real source, not a human review.

### Accessibility

Target is the consuming product's, per `flock-coke/.flkd/manifest.md`: **WCAG 2.0 Level A**. No
conformance claim is made here — this is a manual read, not a validated conformance level.

| # | Check | Result |
|---|---|---|
| 1 | Keyboard reachability | **Not run** — needs a human at a keyboard. Built for: org names are real `<button>` elements via `FSLink`, so they should be reachable and operable; the grid's own row-action menu, quick filter, checkbox, and pagination controls are unmodified FUI/MUI DataGrid internals that already carry keyboard support in production. |
| 2 | Tab order | **Not run** |
| 3 | Focus visibility | **Not run** — relies on FUI's own focus ring; no custom focus styling was added |
| 4 | Focus management | Not applicable — no drawer, dialog, or menu opens in this artifact beyond the grid's own built-in row-actions menu, which is unmodified library behavior |
| 5 | Accessible names | **Built for, not verified.** The org-name `FSLink` has its visible text as its accessible name. The decorative `FSSymbol name="add"` is `aria-hidden`, with the visible button text carrying the name. Status chips render their meaning as visible `label` text (no icon-only or colour-only chip). **Needs a screen-reader check**, not just a source read. |
| 6 | Heading structure | Pass by construction — one `h1` in the host (`TitleDescription`'s `component="h1"`), no skips, `columnHeaders: () => null` means the grid contributes no heading-level elements |
| 7 | Status announcement | **Not applicable in the built states** — no live-region-worthy status change happens in Direction A (no save action; the "Selected: …" caption is static text, not an announced update) |
| 8 | Non-color signals | Pass — every chip carries a text label; colour is never the only signal (MOU: "MOU Signed"/"MOU Not Signed"; Integrations: "N Integrations"/"No Integrations") |
| 9 | Error messages | Pass by construction — the error state names what failed ("Unable to fetch Organizations") and offers a next step (Retry), matching the real page's copy exactly |
| 10 | Reduced motion | Not applicable — no motion in this artifact |

**Automated scan: not run.** Cypress was not invoked for this prototype (prototypes are reviewed via
`npm start`, not Cypress, per `src/prototypes/README.md`) — recorded as not run, not as a pass.

### What's mocked, simulated, or omitted — stated plainly

- **Mocked:** all 28 organizations in `mockData.ts`, including `mouSigned` (a real field, fake
  per-row values) and `integrationsCount` (an **invented** field — no such aggregate exists in the
  product today, see below).
- **Simulated:** clicking an org name or the row's "Edit" action sets a local "Selected: …" caption
  instead of navigating — real navigation isn't wired, and the caption says so.
- **Omitted:** the "Downgrade MOU to Community" row action (org-id-gated, orthogonal to the
  MOU/integrations-signal question); permission-based hiding of "Add New Organization" (kept visible
  for one persona rather than modeling every role); real pagination against a server (client-side
  slicing of the 28-row mock array instead).

### Callouts — flagged, not resolved, per the scope decision

1. **The aggregation gap.** `mouSigned` and `defaultTimezone` are real fields on `Organization`
   (`src/data/models/organization.ts:15-28`) that the list query simply doesn't return today —
   showing them is a display change plus a small BFF change. Users/roles/networks/integrations are
   different: grepped all of `src/` for `userCount`, `networkCount`, `roleCount`,
   `integrationCount`, `numUsers`, `totalUsers` — zero matches anywhere. There is no existing
   aggregate to surface; `integrationsCount` in this prototype is invented to test whether the
   *signal* is worth having, not because the data already exists in that shape. Worth saying out
   loud Thursday: MOU is "turn on a field," integrations is "ask Crown for a new aggregate."
2. **Org type isn't binary.** `OrgType` has 8 values — `EDUCATION`, `BUSINESS`, `DEMO`,
   `LAW_ENFORCEMENT`, `PROPERTY_MANAGEMENT`, `ADMIN`, `HOA`, `CHANNEL_PARTNER`
   (`@flocksafety/flock-titos-lib`). "Does HOA need different columns than Law Enforcement" is really
   "does org type need different columns" — a bigger design question than the two types named in the
   original request, and this iteration doesn't attempt to answer it. The mock data spans all 8 types
   deliberately, to make it visible that a uniform row works across all of them right now, in case
   that's useful for Thursday's conversation.
3. **Tables vs. cards, unresolved.** `.flkd/standards/flock/product-native-ui.md`: "Tables are for
   scanning many rows... Cards are for a handful of distinct things, not fifty." An admin managing
   *a lot* of orgs is the textbook table case, which argues for Direction B (not built here)
   independent of which fields end up chosen. Flagging again since Direction A doesn't resolve it —
   it was explicitly excluded from this iteration's scope, not judged unnecessary.
4. **The real toolbar's hide-at-zero-rows behavior removes the way to clear a bad search.** When the
   quick filter matches nothing, the toolbar (which contains the only search box) disappears along
   with the grid, per the product's existing convention (`.flkd/product-patterns/
   list-and-table-patterns.md`). This prototype reproduces that faithfully rather than fixing it — a
   pre-existing quirk in the real page, out of scope for Direction A.

### Open questions

1. Does the row-level "Selected: … would open its Organization page" caption read clearly enough for
   Thursday's review, or would a disabled-looking hover/click affordance communicate "this would
   navigate" better without implying more interactivity than the prototype actually has?
2. Should the "Include Deactivated" toggle and its interaction with disabled orgs even be part of
   this artifact, given the decision under test is about the two new signals, not about the existing
   deactivation filter? Kept for host fidelity, not because it's part of the decision.
3. Direction B and the org-type-column split remain open, per the scope decision — not something this
   iteration answers.

### Decisions

**None yet.** Nothing here has been reviewed by a person. This artifact is meant to be reacted to
Thursday, not treated as decided.

## Iteration i2 — 2026-09-28

**Branch:** `fd/orgs-list-signals/i1` (no new `i2` branch cut — see below) · **Baseline:** i1, shown
2026-09-24 · **FUI:** 5.5.4 (unchanged) · **Level:** Test (unchanged) · **Scope:** Direction A only
(unchanged)

### What this addresses

Verbatim stakeholder feedback from the 2026-09-24 team review (full text in `brief.md`'s i2 section):
drop the integrations chip entirely; make MOU Not Signed read as the loud, action-needed signal
instead of an identical grey chip next to another; show what a deactivated org looks like mixed into
the list via the existing "Include Deactivated" checkbox.

### What changed

1. **Integrations chip removed.** `integrationsCount` deleted from `OrgListRow` and every mock row
   (`mockData.ts`) and from the row card (`components/orgListRowCard.tsx`). Not replaced with a
   placeholder or disabled state — gone, per the requester's explicit "take it out rather than leave
   it as a placeholder."
2. **MOU recoloured, not just left as the only chip.** `success` (MOU Signed) is unchanged.
   `default` → `warning` for MOU Not Signed, reusing the existing status-chip semantic
   `pattern-inventory.md` already documents for the same shape of state ("Unpaid" → `warning`, an
   action someone still owes). Removing the integrations chip alone would have made MOU the only chip
   on the row, but wouldn't have made it *read* as higher-attention — the colour change is what
   answers "it's the quietest thing on the row" specifically.
3. **Deactivated-org rendering, built from the closest existing precedent rather than invented from
   nothing.** `orgUsersList.tsx` already renders a deactivated entity in a list (dimmed row text +
   Active/Deactivated status chip). Reused for orgs: name and "Type: X" dim to `text.disabled` when
   `row.disabledAt` is set. **One deliberate departure from that precedent:** the source colours its
   Deactivated chip `error` (red); this version uses `default` (grey, `size="tiny"`, placed next to
   the org name rather than on the signal line) instead, so it doesn't compete with — or outrank —
   the now-single, `warning`-coloured MOU chip for attention. That's a judgment call answering the
   stakeholder's explicit "I don't know what this should look like," not a settled decision; flagged
   under Callouts below. Mock data: 4 of 29 rows now carry `disabledAt` across 3 org types
   (`BUSINESS`, `HOA`, `LAW_ENFORCEMENT`), sorted in among active rows rather than grouped separately
   — the existing "Include Deactivated" checkbox and its filtering logic were already wired in i1 and
   are unchanged.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors |
| `npm run lint` (Biome) | Pass on `src/prototypes/orgs-list-signals/` — 0 errors. (Same 1 pre-existing error remains in `scripts/smoke-prototype.mjs` — an unsorted-import warning, outside the change boundary, not introduced by this work; i1's review noted 4 errors in a similarly-named but different script file, `scripts/smoke-design-mode.mjs` — that file's status wasn't re-checked this iteration since it's outside the boundary either way.) |
| Bare `src/…` value-import grep | Pass — no matches |
| `npm run smoke:prototype -- orgs-list-signals` | Pass — bundles |

### Product parity

Unchanged from i1 except where named above. The grid configuration, toolbar, empty state, and the
i1 accessibility fix (org name as a real `FSLink component="button"` instead of the source's
inaccessible `onClick`-on-`div` pattern) all carry forward untouched.

**Not reviewed.** No human has looked at this against the real product view yet, same as i1.

### Accessibility

Target unchanged: **WCAG 2.0 Level A**, no conformance claim. Re-checked only what i2 touched:

| # | Check | Result |
|---|---|---|
| 5 | Accessible names | **Built for, not verified.** The new `Deactivated` chip and the recoloured MOU chip both carry their meaning as visible `label` text — colour is never the only signal on either. The dimmed org-name link keeps its visible text as its accessible name; dimming is a colour/contrast change, not a semantic one. **Contrast on `text.disabled` against the row background is asserted from the FUI palette token, not measured with a contrast tool this session — flagged as not run, not as a pass.** |
| 8 | Non-color signals | Pass — MOU: "MOU Signed"/"MOU Not Signed" (label carries meaning regardless of colour); Deactivated: a text-labelled chip, not a colour-only or icon-only cue. |
| 1–4, 6, 7, 9, 10 | Unchanged from i1 | Not re-run — no change touched keyboard flow, tab order, focus management, headings, status announcements, error copy, or motion. |

**Automated scan: not run**, same as i1 and for the same reason (prototypes are reviewed via
`npm start`, not Cypress).

### What's mocked, simulated, or omitted — stated plainly

- **Mocked:** `disabledAt` values on 4 rows (3 carried over from i1, 1 new — `org-029`, a
  `LAW_ENFORCEMENT` org, added purely to show the treatment isn't type-specific). `integrationsCount`
  is no longer part of the mock data at all — removed, not zeroed out.
- **Unchanged from i1:** the "Selected: …" simulated-navigation caption; the omitted
  "Downgrade MOU to Community" row action and permission-gated "Add New Organization"; client-side
  pagination.

### Callouts — flagged, not resolved

1. **The Deactivated-chip colour is this agent's judgment call, not a settled answer.** The requester
   said plainly they don't know what a deactivated org should look like and want to react to
   something — this iteration's `default`/grey, off-the-signal-line treatment is one answer, chosen
   specifically to keep MOU the loudest thing on the row per the requester's other ask, not because
   grey is obviously correct on its own. Worth asking directly next week: does a deactivated org read
   clearly enough at a glance, or does it need to be louder (e.g., the existing product's `error`-red
   convention from `orgUsersList.tsx`) even if that means it now competes with MOU?
2. **MOU's colour is left at full strength on deactivated rows.** Whether MOU status still matters
   once an org is deactivated is a product question this prototype doesn't resolve — flagging rather
   than deciding it by muting or hiding the chip.
3. **Carried over from i1, unchanged:** the aggregation gap for any future signal beyond MOU (still
   true — the integrations aggregate genuinely doesn't exist, which is exactly why it was removed
   rather than fixed); org type isn't binary (8 `OrgType` values, still not addressed); tables vs.
   cards remains unresolved (Direction B still not built, still flagged as the textbook case per
   `product-native-ui.md`); the real toolbar's hide-at-zero-rows behavior still removes the way to
   clear a bad search, reproduced faithfully rather than fixed.
4. **Branching convention.** No `fd/orgs-list-signals/i2` branch was cut for this round — i2's
   changes were made in place on `fd/orgs-list-signals/i1`. Reasoning is in `brief.md`'s i2 section:
   i1 was never committed, so a new branch wouldn't have produced a real git-visible split, and
   commits aren't made without an explicit ask. Flagging this as the one process deviation in this
   iteration rather than deciding it silently.

### Open questions

1. Does the Deactivated tag's grey, off-signal-line treatment read clearly enough, or does a
   deactivated org need a louder cue (see Callout 1)?
2. Should MOU status be de-emphasized (not just left at full colour) on deactivated rows, given MOU
   compliance presumably stops mattering once an org is off? (Callout 2.)
3. Carried over, still open: Direction B vs. Direction A, and the org-type-column split.

### Decisions

**None yet.** i1 wasn't reviewed by a person before this feedback came in informally from the
Thursday 2026-09-24 session; i2 is built to be looked at again next week, per the same "same level of
finish, we'll look again next week" framing.
