# Context receipt — orgs-list-signals

What was read before building, 2026-09-28.

## Pinned

| | |
|---|---|
| Product baseline | `flock-coke` `fd/orgs-list-signals/i1`, cut from `noah/flock-designer` |
| Resolved FUI version | **5.5.4**, from `node_modules/@flocksafety/flock-react-component-lib/package.json` |
| FUI context read from | `../flock-react-component-lib/.flkd/` (sibling checkout, `HEAD` at tag `v5.5.4`, matches installed) |
| Shared standards read from | `../flock-designer/standards/` (sibling checkout) |

## Decisions this iteration builds to

- **Level: Test** (re-mapped up from an initially-proposed Explore, per the requester's decision:
  wants something clickable/interactive for Thursday, not a static mockup).
- **Scope: Direction A only** — the enriched Mode A card list. Direction B (the full `FSDataGrid`
  Mode B table) and the org-type-column-split variant were **not built**, per explicit scope
  decision; both are flagged as open questions in the report instead of resolved in code.
- **Branch:** approved to cut `fd/orgs-list-signals/i1` off the current point in history.

## Product patterns

- `src/components/org/orgList/orgsList.tsx`, `orgListForm.tsx`, `orgListSlotComponents.tsx` — the
  real Organizations List. Read in full. `OrgListForm`'s `FSDataGrid` Mode A configuration
  (`columnVisibilityModel`, `getRowHeight`, `sx` border block, `initialState.sorting`, `filterModel`
  / `onFilterModelChange` wiring, `slots.columnHeaders: () => null`, the external `FSTablePagination`
  row) is reused near-verbatim in `view.tsx`, backed by local mock filtering instead of
  `useGetAllOrgsQuery`.
- `OrgListRowCard` and `OrgListToolbar` (`orgListSlotComponents.tsx`) — the row-card and toolbar
  patterns this prototype's `components/orgListRowCard.tsx` and `RowsToolbar` (in `view.tsx`) adapt.
  Not imported directly: that module also pulls `camelCaseToTitleCase`, an `@mui/icons-material`
  `Add` import, and (via `orgListForm.tsx`, not this file) Redux/analytics/permission hooks — see
  Boundaries below.
- `src/components/shared/pageTitle.tsx` — `TitleDescription`'s exact typography
  (`variant="h4" component="h1" gutterBottom`) and `Breadcrumb`'s `FSLink component="button"
  type="button"` pattern, both **recreated locally** rather than imported (plumbing-coupled module,
  see Boundaries).
- `src/components/common/appHeader.tsx` — `useAdminSubNavItems` (`:115`) for the real nav item list,
  order, and the `isBold`-marks-active convention; `MfeSubNav`'s `FSUniversalNav` prop usage
  (`:subNavOnly`, `navbarTitle`, `activeAppLinkItems`, `logoHref`) for the host nav.
- `.flkd/product-patterns/list-and-table-patterns.md` — Mode A vs Mode B, the toolbar-hidden-at-zero-
  rows convention (reused for the empty state), row-actions convention.
- `.flkd/product-patterns/pattern-inventory.md` — status-chip convention (colour + label, label
  carries meaning), filtered-empty variant (one line, no icon, no action).
- `.flkd/composition/product-shell-recreation.md` — the cookie-hazard note (only
  `activeAppLinkItems` passed to `FSUniversalNav`), and the pageTitle.tsx exception.

## Data model

- `src/data/models/organization.ts` — `OrganizationLite` (`{id, name, type}`, what the real list
  query returns) and `Organization` (has the real `mouSigned: boolean`, `defaultTimezone`,
  `disabledAt?`, `locked?` fields used or referenced in mock data).
- `src/data/dto/allOrgsDto.ts`, `src/redux/apiSlices/organizationSlice.ts:89` — confirmed
  `useGetAllOrgsQuery` returns only the thin `OrganizationLite` shape today.
- `node_modules/@flocksafety/flock-titos-lib/lib/data/enums/orgType.d.ts` — all 8 `OrgType` values,
  used across the mock rows.
- Grepped `src/` for `userCount`, `networkCount`, `roleCount`, `integrationCount`, `numUsers`,
  `totalUsers` — zero matches, confirming `integrationsCount` in this prototype's mock data is
  invented, not backed by any existing field.

## Design system

Verified against `component-manifest.json` and, where the manifest entry was thin or shared across
several exports, against source (`src/components/FSChip/index.tsx`,
`src/components/FSDataGrid/fsDataGridToolbar.tsx`, `src/components/FSTablePagination/index.tsx`,
`src/icons/FSSymbol/*.stories.tsx`) for 5.5.4:

`FSBox` · `FSStack` · `FSGrid` · `FSTypography` · `FSButton` · `FSCheckbox` · `FSChip` (variant
`status`, colour overrides `secondaryContainer`/`caution`/`tertiaryIndigo`/`neutral`, size `tiny`) ·
`FSLink` (the `component="button" type="button"` pattern, same as `Breadcrumb`) · `FSDataGrid` ·
`FSGridActionsCellItem` · `FSGridToolbarContainer` · `FSGridToolbarQuickFilter` · `FSTablePagination`
· `FSSkeleton` · `FSAlert` · `FSAlertButton` · `FSToggleButton` / `FSToggleButtonGroup` · `FSSymbol`
(`name="add"`, per non-negotiables §4 — no new `@mui/icons-material` import) · `useFSTheme` ·
`GridColDef`.

## Standards

- `.flkd/standards/non-negotiables.md` — all nine sections re-read; §3 (build in product context)
  and §7 (accessibility as a floor, not scaled by level) drove the two build decisions below.
- `.flkd/standards/flock/product-native-ui.md` — Title Case labels, status-chip colour+label
  convention, "cut content before shrinking spacing."
- `../flock-designer/standards/universal/interaction-states.md` — the seven states and the Test-level
  table.
- `.flkd/implementation/avoid-list.md` / `known-safe-imports.md` / `import-rules.md`.

## i2 addendum — 2026-09-28, addressing the 2026-09-24 stakeholder review

Re-read before changing anything: this file, `brief.md`'s i1 decisions, `review.md`'s i1 record, and
the actual state of `src/prototypes/orgs-list-signals/` (confirmed still untracked/uncommitted on
`fd/orgs-list-signals/i1` via `git status`). No FUI version drift since i1 — still 5.5.4, same
sibling-checkout tag.

**Newly read for i2:**

- `src/components/user/orgUsersList.tsx` (lines ~145-231, 379-383) — the only existing product
  precedent for rendering a *deactivated* row in a list: `getRowClassName`/`.disabled-row { color:
  'text.disabled' }` to dim ambient row text, plus a status chip (`label={row.deactivated ?
  'Deactivated' : 'Active'}`, `color={row.deactivated ? 'error' : 'success'}`). Reused the dimming
  idea; deliberately did not reuse the `error` colour choice for the chip — see the callout in
  `review.md`'s i2 section for why.
- `.flkd/product-patterns/pattern-inventory.md`'s status-chip colour table again, specifically to
  confirm `warning` → "Unpaid" as the existing precedent for "an action someone still owes," used to
  re-colour MOU Not Signed.
- `node_modules/@flocksafety/flock-react-component-lib/build/src/components/FSChip/index.d.ts` (via
  the sibling checkout's matching source) — confirmed `color` accepts standard MUI chip colours
  (`success`, `warning`, `error`, `default`, …) plus the FUI overrides (`secondaryContainer`,
  `caution`, `tertiaryIndigo`, `neutral`), so `warning` and a plain `default` were available without
  inventing a new chip colour.

**Not re-read:** `orgListForm.tsx`, `orgListSlotComponents.tsx`, `pageTitle.tsx`,
`appHeader.tsx`/`useAdminSubNavItems`, `product-shell-recreation.md` — unchanged since i1, no new
placement or host-chrome decision this iteration.

**Decisions this addendum builds to:** remove the integrations chip and its `integrationsCount`
field entirely (not hidden, not placeholder); recolour the MOU chip (`success`/`warning` in place of
`success`/`default`); add a deactivated-row treatment (dimmed name/type text + a small, neutral
`Deactivated` tag next to the name, `size="tiny"`, kept off the MOU signal line so it stays visually
quieter than MOU). Level stays Test; scope stays Direction A only. Branch stays
`fd/orgs-list-signals/i1` — see `brief.md`'s i2 section for why no new `i2` branch was cut.

## Boundaries applied, and one fix over the source pattern

- **Nothing imported from `src/components/`.** `orgListForm.tsx` is Redux/analytics/permission-
  coupled; `orgListSlotComponents.tsx` shares a module between the row card and the toolbar and pulls
  an `@mui/icons-material` import this prototype avoids per non-negotiables §4. Both patterns were
  reconstructed locally instead, and are named as the source throughout the code comments.
- **`pageTitle.tsx` not imported**, for the documented reason (whole-module Redux/Datadog/Segment/
  LaunchDarkly/`FSTokenManager` coupling) — `TitleDescription` recreated in `host.tsx`.
- **One accessibility fix, not a reproduction of the source defect:** the real `OrgListRowCard` (and
  the same shape in the other three Mode A row cards in the product) puts `onClick` on the outer
  `FSStack` — a plain div, not natively focusable or operable by keyboard. Per non-negotiables §7
  ("never attach `onClick` to a `div`/`span`/`li`") and the product-pattern file's own framing of the
  heading-skip as "a defect, not a convention worth copying," this prototype makes the org name a
  real `FSLink component="button"` instead (the same button-link pattern `Breadcrumb` already uses),
  rather than copying the inaccessible version. Documented in `components/orgListRowCard.tsx`.
