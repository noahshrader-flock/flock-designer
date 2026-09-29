# Context receipt — role-removal-blast-radius

What was read before building, 2026-09-28.

## Pinned

| | |
|---|---|
| Product baseline | `flock-coke` `fd/role-removal-blast-radius/i1`, cut from `noah/flock-designer` at `14d0be46` |
| Resolved FUI version | **5.5.4**, from `node_modules/@flocksafety/flock-react-component-lib/package.json` |
| FUI context read from | `../flock-react-component-lib/.flkd/` (sibling checkout) — **see version-drift note below** |
| Shared standards read from | `../flock-designer/standards/` (sibling checkout) |

**Version-drift note, flagged rather than silently worked around:** the sibling FUI checkout's
working tree is on branch `noah/flock-designer` (`HEAD` `6e0d4694`), not tag `v5.5.4`
(`a75afa03`) — the two commits differ. Attempting to read `.flkd/` **at** the tag
(`git show v5.5.4:.flkd/component-manifest.json`) failed outright: `.flkd/` does not exist in that
tag at all, only on the newer default branch. So there is no version-matched `.flkd` to read for
5.5.4 today. Per manifest.md's own warning that a default-branch checkout "can offer a component,
prop, or deprecation this product does not have," every component named below was **also**
cross-checked against the actual installed `.d.ts` files in
`node_modules/@flocksafety/flock-react-component-lib/build/src/components/` — the real ground
truth for what 5.5.4 exports — rather than trusted from the manifest alone. One real mismatch this
caught: the manifest/latest-checkout implies `FSToggleButtonGroup` takes a `size` prop; the
installed 5.5.4 `.d.ts` (`FSToggleButtonGroup/index.d.ts`) explicitly omits `size` from its props
(only `FSToggleButton` — the child — takes `size?: FSSize`, and `FSSize` is `'sm'|'md'|'lg'|'xl'`,
not MUI's `'small'`). `tsc` caught both mismatches; fixed before committing. Worth logging in
`.flkd/knowledge/agent-gaps.md` as a real instance of the exact risk the manifest calls out.

## Decisions this iteration builds to

- **Level: Test** — reasoned by the agent, not yet confirmed by the stakeholder. See "Level" in
  `brief.md` for the full reasoning (the design question is about interaction/behavior, not
  appearance, so a frozen frame can't carry it). **This is the one thing to relay and get
  confirmed** before treating anything else here as settled.
- **Branch:** cut `fd/role-removal-blast-radius/i1` directly — no existing project folder, no
  stakeholder branch conversation to re-derive (unlike `orgs-list-signals`, this request arrived
  with the workflow ("prototype on an `fd/<id>/iN` branch") already specified by the calling agent).
- **Scope:** three treatments (inline, confirm-on-save, graduated) plus a role-size switch (small
  vs. ~40-person), all switchable live in one harness. Addition-vs-removal is a comparison toggle,
  not a fourth built treatment axis — see brief.md's "left open" section for why.

## Product patterns

- `src/components/role/roleFormPage.tsx`, `roleAddEditForm.tsx`, `roleFormActionsFooter.tsx`,
  `rolePermissionConfig/rolePermissionSection.tsx`, `rolePermissionConfig/roleOrgLevelPermissions.tsx`
  — read in full. This is the real host. Key findings that shaped the build:
  - `roleAddEditForm.tsx:240-256, 167-190` — a blocking `WarningDialog` **already** fires on
    VMS-related permission toggle-off and on bulk-deselect ("Select All" → off), with generic
    non-blast-radius text. This is the closest existing precedent for the confirm-on-Save
    treatment — adapted, not invented from nothing.
  - `rolePermissionSection.tsx:81-85` — a standing, non-blocking `FSAlert severity="warning"` keyed
    to `perm.warningText && isChecked`. The mechanism for the inline treatment already exists in
    the same file, on the opposite condition (shown while ON, not on toggle-OFF).
  - `roleFormActionsFooter.tsx:30-53` — `role.userCount` already read and shown once on this exact
    page (the delete-button tooltip). Confirms the blast-radius number isn't new data.
  - Two Role forms exist: legacy `RoleFormPage` (default) and `RoleFormPageV3` (behind
    `FeatureFlag.SHOW_AUTO_PERMISSION_PROVISIONING`, `App.tsx:410-417`). Built against legacy —
    it's what every admin hits regardless of flag state.
  - `roleOrgLevelPermissions.tsx` — the real permission list uses `FSSidebarContentLayout` +
    `FSSidebarNavList` for ~10 categories of ~100 fields. **Not reproduced** — this prototype's 6
    representative rows don't need sidebar navigation; noted as a simplification, not a copy of a
    pattern that doesn't apply at this scale.
- `src/data/models/role.ts` — `Role.userCount: number` (real field, `:19`) and `RoleLite` (`:22-29`)
  — confirms `search`/`pdTool` are **already** modeled as simplified booleans elsewhere in the
  product (the roles-list row), which is precedent for this prototype's own boolean simplification
  of what's really a per-network `{networkIds: string[]}` shape in the edit form.
- `src/data/models/user.ts` — `User` shape for the mock affected-user lists.
- `src/components/common/warningDialog.tsx` — the exact dialog structure adapted for
  `components/saveConfirmationDialog.tsx` (title + manual close-X + `FSDialogContent`/
  `FSDialogActions`, `destructivePrimary` proceed button).
- `src/components/common/headerEditable.tsx`, `src/components/common/stickyFooterActions.tsx` —
  checked for plumbing (imports only FUI + `@mui/icons-material` + local `useState`) and confirmed
  safe. **`stickyFooterActions.tsx` imported directly** (real chrome, not a lookalike).
  `headerEditable.tsx` was checked but **not** used — see Boundaries below for why.
- `.flkd/product-patterns/form-patterns.md` — "confirm/warn/inform → dialog, no exceptions" and the
  hand-composed dialog structure (`FSDialog`/`FSDialogTitle`/close-X/`FSDialogContent`/
  `FSDialogActions`).
- `.flkd/product-patterns/pattern-inventory.md` — `severity="neutral" variant="filled"` as the
  informational-banner convention (used for the addition-comparison banner, deliberately distinct
  from the `warning` removal banner); the "no pluralization helper, `x !== 1 ? 's' : ''` written
  inline" note (matched in `utils.ts` rather than inventing a shared helper).
- `.flkd/composition/view-composition.md` — the h1→h2→h4 skip called out as a defect, not a
  convention: applied here as h4-visual/h1-semantic for the role name, h6-visual/h2-semantic for
  "Permissions."
- `.flkd/composition/product-shell-recreation.md` — the `flockHeader` cookie hazard
  (`activeAppLinkItems` only, no fuller `FSUniversalNav` prop set); the `pageTitle.tsx` exception
  (breadcrumb recreated locally).

## Data model

- `Role.userCount` (`src/data/models/role.ts:19`) — real, and the only new-to-this-page data the
  design actually needs; not invented.
- Confirmed (see "Already decided" in brief.md): permissions are role-level, so blast radius is
  `role.userCount` uniformly per role, not a per-permission subset — matches the stakeholder's own
  account ("a role with about 40 people on it").
- No existing endpoint returns "which users have this role" inline on the edit form itself — that
  data is reached via `Users` filtered by role (`rolesPage.tsx`'s `handleOpenUsers` →
  `/users?role=X`). This prototype mocks a short named list per role locally rather than importing
  anything from `src/redux/apiSlices/`.

## Design system

Verified against `component-manifest.json` (default-branch checkout, see version-drift note above)
**and** against the installed 5.5.4 `.d.ts` files directly for anything load-bearing:

`FSBox` · `FSStack` · `FSGrid` (not used, considered) · `FSTypography` · `FSButton` ·
`FSLoadingButton` · `FSCheckbox` · `FSAlert` (`severity`: `warning`/`neutral`/`success`, `variant`
`filled`) · `FSDialog`/`FSDialogTitle`/`FSDialogContent`/`FSDialogContentText`/`FSDialogActions` ·
`FSIconButton` · `FSListItemText` · `FSDivider` · `FSLink` (`component="button" type="button"`) ·
`FSUniversalNav` (`subNavOnly`, `navbarTitle`, `activeAppLinkItems`) · `FSToggleButton` /
`FSToggleButtonGroup` (size lives on the button, not the group — see version-drift note).

## Standards

- `.flkd/standards/non-negotiables.md` — all nine sections re-read. §3 (build in product context)
  and §7 (accessibility as a floor) drove the host-chrome and heading-level decisions.
- `.flkd/standards/flock/product-native-ui.md` — Title Case labels (harness excluded, since it's
  explicitly not part of the design), direct action language ("Save anyway," not "Are you sure?").
- `../flock-designer/standards/universal/interaction-states.md` — the seven states and the
  Test-level table; drove the decision **not** to build page-load/fetch-error states (see
  brief.md's "Level" section).
- `.flkd/implementation/avoid-list.md` / `known-safe-imports.md` / `import-rules.md` — all `~`
  aliases used for cross-boundary imports; grep for bare `src/…` value imports returned nothing.

## Boundaries applied

- **Nothing imported from `src/redux/`, `src/api/`, or any `apiSlice`.** All role/user data is
  local mock data in `mockData.ts`, typed against `~data/models/role` and `~data/models/user`.
- **`headerEditable.tsx` checked, not used.** It's plumbing-free and could have been imported, but
  its dual edit/display mode exists for role **renaming**, which is out of this project's change
  boundary — reusing it would have pulled in a capability (inline rename) this prototype doesn't
  exercise or test. A plain `FSTypography` heading was used instead; noted as a deliberate
  narrowing, not a boundary violation (the component was available and safe either way).
- **`pageTitle.tsx` not imported**, for the documented whole-module-coupling reason. `Breadcrumb`
  recreated locally in `host.tsx`, non-functional (`onClick={() => {}}`) since prototypes don't
  register routes.
- **One accessibility gap found in the real page, not reproduced:** `RoleFormPage` has no real
  route-level `PageTitle`/`h1` — the visible "page title" is `HeaderEditable`'s `FSTypography
  variant="h4"` with no `component` override, which MUI renders as an actual `<h4>` tag, and the
  "Networks" section heading below it (`roleAddEditForm.tsx` `variant="h6"`, no `component`) renders
  as `<h6>` — meaning the real page has **no `<h1>` at all** and jumps straight to `<h6>`. Not
  previously logged in `.flkd/product-patterns/`. This prototype does **not** reproduce that gap:
  its own role-name heading is `variant="h4" component="h1"` and "Permissions" is
  `variant="h6" component="h2"`, per `view-composition.md`'s standing instruction to match visual
  scale but fix the semantic level rather than copy a skip. Worth flagging to the Coke team as a
  new, real finding, separate from anything this project is otherwise exploring.
