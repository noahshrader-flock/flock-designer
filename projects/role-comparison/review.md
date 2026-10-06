# Review — role-comparison

## Iteration 1 (codebase, `feature/role-comparison`)

**How these reviews ran.** No `product-parity-reviewer` or `implementation-reviewer` subagent could be spawned from this
agent (it has no subagent-spawning tool). Each definition under `.flkd/agents/` was read and followed directly, parity
first, then implementation, as separate passes. **Both are the author reviewing their own work**, which is weaker than a
second agent reading it. Weigh it accordingly.

### Product parity

Comparable production views read: `src/components/role/rolesPage.tsx`, `rolesList/rolesListSlotComponents.tsx`
(toolbar, empty state), `rolesList/roleListRowCard.tsx` (permission labels), `src/components/shared/pageTitle.tsx`.

#### Blocking
None found.

#### Should fix
1. (Superseded by the fix round below: now Title Case.) **Sentence case vs Title Case.** The new button and page title read "Compare roles". The neighbouring toolbar button is
   "Add New Role" and the page title is "Roles"; labels such as "Search Roles" and "Role Category" are Title Case.
   *Observed* (`rolesListSlotComponents.tsx`, `roleAddEditForm.tsx`). "Compare roles" was the wording Noah supplied, so it
   was kept. *Proposed:* ask whether it should be "Compare Roles" to match the toolbar.
2. **Back link differs from the Roles page.** Roles shows `PageTitle`'s "< Organization: X" link; this page shows
   "< Roles" (the real parent) using the exported `Breadcrumb`, with `PageTitle showOrg` off. *Inferred* to be right (the
   parent is Roles), but it means the document title is "Compare roles" without the org name, unlike Roles
   ("Roles - Org"). *Proposed:* decide whether the org name belongs in the tab title.
3. **Selectors use `FSTextField select`, not `FSSelect`.** Product precedent for a labelled select is `FSSelect`
   (`roleAddEditForm.tsx:327`), but `FSSelect label` leaves the combobox with no accessible name (axe
   `aria-input-field-name`, reproduced in this work's first a11y run). *Observed.* Deviation is deliberate; the FUI gap
   should go to the component library owners.

#### Consider
- "Removed"/"Fewer networks" use the `error` chip colour. Product precedent for chips is semantic colour with a text label
  (`invoices.tsx:144`), so it is consistent, but "fewer networks" is not an error. *Proposed:* the neutral chip for both
  directions of the network change, leaving colour only on permissions.
- User counts are on the role cards only, not in the table; there is no "change" for users. Intentional: user count is
  context, not access. *Proposed.*
- The empty state copy is longer than the product's (one line about why). It says what would be here, per
  `interaction-states.md`. *Proposed:* trim if it reads heavy.

#### Accessibility (visual half)
- Differences stated in text ("Added", "Removed", "Same", "More networks", "Fewer networks", "Has access"/"No access"),
  never colour alone: **pass** (read in the markup).
- Decorative symbols (`check`, `close`, `compare_arrows`) are `aria-hidden`: **pass**.
- Heading order h1 (page) > h2 (What changes, Side by side) > h3 (role names): **pass**. No level skipped.
- Colour contrast of chip and border tokens: **not run;** needs a real browser (owner: engineering). happy-dom has no layout, so `color-contrast` is disabled in
  `__tests__/support/axe.ts`; needs a real browser (Cypress or a manual pass). Owner: engineering, before release.
- Focus visibility: **not run;** needs a browser look by engineering or design. Components are FUI/MUI defaults and the button, selects and breadcrumb are
  native or FUI controls, so default focus rings apply, but nobody has looked at them.

#### Working well
- Page frame follows the sequence in `view-composition.md`: container padding 24px, back link and title, then content;
  fetch error is an `FSAlert severity="error"` with Retry, below the title, and the frame stays.
- The empty state copies the product's hand-rolled pattern (non-heading title, `outline.main` icon, action only for users
  who can edit roles) rather than `FSEmptyState`, avoiding the h6 level skip the inventory warns of.
- Loading is a content-shaped skeleton (selector, sentence, two cards, five rows), not a spinner.
- Error does not print the error object, unlike `rolesPage.tsx` (`JSON.stringify(getRolesError)`), which the inventory
  records as a defect.

### Implementation

#### Boundary violations
None against the codebase-path boundary. Files touched outside the new directories, each named in the brief/receipt:
`src/components/App.tsx` (one route, as decided), `rolesPage.tsx` and `rolesList/rolesList.tsx` and
`rolesList/rolesListSlotComponents.tsx` (entry point), `src/mocks/fixtures/orgRolesV3.json` (the confirmed mismatch).
No new dependency, no feature flag, no new endpoint, no new slice, no telemetry added. `redux/`, `api/`, `config/` untouched.
The `fd/` boundary check does not apply to this path.

#### Convention violations
- None found by `tsc` or Biome. camelCase file names, `src/...` for cross-domain imports. The one relative import is
  `../../shared/pageTitle`, a sibling-domain path matching how `rolesPage.tsx` imports it; `'src/components/shared/pageTitle'`
  would also work. *Consider.*
- `__tests__` is excluded from `tsc` and Biome, so the new specs are type-checked only by Vitest at runtime.
  Formatting of those files was not machine-checked. **Not run;** needs `__tests__` added to the Biome/tsc config (owner: repo maintainers).
- No `analytics.page(...)` call, unlike `rolesPage.tsx`. Left out on purpose (the work is told not to send telemetry from
  stubbed work); engineering decides.

#### Verification (real output, run in this session)
- `npx tsc --noEmit`: no output, exit 0.
- `npm run lint`: `Checked 603 files in 132ms. No fixes applied.`
- `npx vitest run` (whole suite): `Test Files 50 passed (50)`, `Tests 433 passed (433)`. Includes the existing role specs
  after the fixture change.
- `npm run a11y`: `Test Files 3 passed (3)`, `Tests 18 passed (18)`.
- Cypress: **not run;** needs a Cypress binary that launches here (owner: dev environment / CI). `cy.checkPageA11y()` and the E2E suite were not attempted: the project notes record that Cypress
  does not launch on this platform; owner: whoever owns the dev environment / CI.
- Browser run of the page against the MSW handler: **not run;** needs a dev server with MSW running (owner: engineering, first manual check).

#### Accessibility (implementation half)
- Semantic components: **pass.** Native `table`/`th scope`/`caption`, real buttons (`FSButton`, `FSAlertButton`,
  `Breadcrumb` is `button`), no `onClick` on non-interactive elements.
- Accessible names: **pass** (axe `aria-input-field-name` clean after switching to `FSTextField select`; selects named
  "From"/"To"; the group is named "Roles to compare").
- Roles and structure: **pass** for headings and table headers. Label association relies on MUI TextField select.
- Keyboard reachability: **pass in principle, not exercised by a keyboard in a browser.** Everything is a native button or
  MUI Select (arrow/space/enter). Tests drive the selects by mouse events, not key events. *Partly not run; needs a keyboard pass in a browser (owner: engineering).*
- Focus management: **not run;** nothing to test, owner: n/a. No dialog or drawer; focus stays where the user is after choosing a role.
- Status announcement: result region is `aria-live="polite"`; the loading skeleton has `role="status"` with hidden text.
  The error `FSAlert` has `role="alert"`. Tested for presence (markup), **not run** with a real screen reader; needs an assistive-tech pass (owner: accessibility team).
- Non-colour signals: **pass.**
- Automated axe (`wcag2a`, colour contrast off in happy-dom): **pass** for success, nothing chosen, same-role message,
  loading, error and empty. One recorded `InheritedViolation`: `aria-valid-attr-value` "needs review" from MUI Select's
  `aria-controls` pointing at a listbox that exists only while open. Owner: MUI / FUI. A passing scan is not complete
  validation.

#### Production-readiness notes
- **The fixture was corrected, and that is a guess about the API.** `orgRolesV3.json` said `userManagement`; the type says
  `accountsManage`. Engineering must confirm Crown's real field name. If Crown really returns `userManagement` the type
  and `rolesPage` are wrong and the comparison would show user management as "No access" for every role.
- `cypress/fixtures/orgRolesV3.json` (a separate copy) still has `userManagement`; Cypress specs that stub the roles
  endpoint with it would not see `accountsManage`. Not changed (out of boundary); no existing Cypress spec asserts it.
- `alerts` is **not** a `RoleLite` field. `rolesPage.tsx` derives `alerts: role.pdTool` for the list row, so it is not in
  the fixture and the comparison does not show "alerts" separately. PD tool is what the brief asked for.
- Network difference is a count only. Naming networks needs the full role (`networkIds`) or a new endpoint.
- Scale: the comparison is all client-side from the existing list endpoint; selectors list every role. Fine for tens of
  roles; no search in the select for hundreds.
- `src/components/App.tsx` route is not covered by a unit test (importing App pulls in the whole app and heavy
  dependencies). The route and the `?a=&b=` behaviour are tested through the page under a `MemoryRouter`. Verify the real
  route by hand: `/organization/<id>/roles/compare?a=role2&b=role3`.
- Permission: the route is wrapped in `ensureAccountsViewOrManageUserBefore`, same as Roles. Comparison is read-only and
  shows to anyone who can view roles; "Add New Role" in the empty state needs `accountsManage` for the org.

### Independent review (fix round on iteration 1)

Two independent reviews were then run by the coordinator as real subagents (`product-parity-reviewer`,
`implementation-reviewer`). They supersede the self-review above where they disagree. Findings, as relayed to the author,
and what was done:

| # | Finding | Action |
|---|---|---|
| 1 | Sentence case against product Title Case | Fixed: "Compare Roles" (title and toolbar button), "What Changes", "Side By Side", "More Networks"/"Fewer Networks", "No Roles To Compare"/"Not Enough Roles To Compare". Tests updated. |
| 2 | Empty state too long; inline fontSize | Fixed: one sentence ("Create at least two roles to compare what changes between them."), `subtitle1`/`body2` variants. |
| 3 | Network change chips were error red | Fixed: neutral (`default`) chips; direction is in the label. Permission chips keep success/error colour plus text. |
| 4 | Polite live region wrapped everything, double-announcing with `role="alert"` | Fixed: `aria-live="polite"` is on one always-mounted element holding only the sentence. Test asserts there is exactly one live element and its text equals the sentence. |
| 5 | Retry `FSSelect`; reviewer could not reproduce the axe failure | Retried with a bare `<FSSelect label="From">` under axe: **reproduced** `aria-input-field-name` on the combobox. Kept `FSTextField select`, commented in code, recorded for the FUI owners in HANDOFF.md. |
| 6 | Use FUI table components if they keep semantics | Not done: every `FSTable*` and `FSSimpleTable` is `@deprecated` in 5.5.4 (non-negotiables section 4 forbids them). Kept a native table with `caption`, `th scope`. Reason is in a code comment. |
| 7 | Cards duplicated the counts | Fixed: cards removed; User Count and Network Count are rows in the table, so the table leads and each count appears once (tested). |
| 8 | Prevent From = To | Fixed: each selector disables the role chosen in the other. The same-role message stays for hand-edited URLs. When both ids are unknown, both messages show. |
| 9 | Cleanups | Removed unused `RoleDiff.identical` (and its tests). Merged the duplicate `react` import in `App.tsx`. Spec files formatted with Biome (they are ignored by the repo config, so formatted with the same rules via a temporary config). **Not done:** dropping `goBack` and adding the org to the tab title. `PageTitle` requires `goBack`, and shows the org in the title only together with its own org breadcrumb, which would sit beside "< Roles". Changing the shared component is outside the boundary. |
| 10 | Specs mocked the query, org, navigation | Fixed: page and a11y specs now use the real Redux store (`customConfigureStore`), the real RTK Query slice, real `useOrganization` / `useOrganizationPrefix` / router / permission helpers, with MSW serving `orgRolesV3.json` and the organization fixture. **Still faked, unavoidably:** the network (MSW) and `FSTokenManager.getApiToken` (the API slice asks for a token before every request). The logged-in user is seeded by dispatching the same action the shell dispatches. See `roleComparisonHarness.tsx`. |
| 11 | Compare button with fewer than two roles | Unchanged on purpose: stays enabled; it leads to the explanatory empty state. |
| 12 | Records | `rolesList.tsx` added to the brief's boundary. HANDOFF.md notes the design-mode scaffolding (`isDesignMode` sets `authType` TEST; engineering to confirm it cannot reach production) and count-only networks. |

Checks after the fix round (run): `npx tsc --noEmit` no output; `npm run lint` clean (603 files); full `npx vitest run`
50 files / 438 tests pass; `npm run a11y` 3 files / 18 tests pass. Not run, unchanged from above (each needs a real browser, owner: engineering): Cypress, colour contrast,
focus visibility, keyboard and screen-reader passes.
