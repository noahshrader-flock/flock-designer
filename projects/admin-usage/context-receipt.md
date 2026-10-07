# Context receipt: admin-usage (codebase, from quick prototype q1)

**Pinned:** `feature/admin-usage` at `370fba8e`, the same commit as the baseline `noah/flock-designer`, with a clean
tree. The prototype was modelled on `21c9b90`, one commit earlier; that commit changed Flock Designer docs only.
FUI is **5.5.4**, read from `node_modules/@flocksafety/flock-react-component-lib/package.json`. Component APIs were
checked against the installed `.d.ts` files and then by `tsc`.

**Could not read:** the sibling FUI `.flkd/` (`component-usage.md`, `tokens-and-styling.md`), the shared standards in
`../flock-designer/standards/`, and `../flock-designer/skills/record-the-route.md`. This session only has permission
to read `flock-coke`, `flock-designer/projects`, and the quick-prototype folder. To make up for it:
- the prototype already compiled against these components;
- `tsc` checks every prop against the installed types;
- the route is recorded the way `role-comparison/iterations.json` records it.

**Decisions:**
- **Path:** codebase, because the branch is `feature/admin-usage`.
- **Scope:** the whole feature with every state, as the task "Build in the codebase" asks.
- **Did not stop after this receipt for corrections:** the task said to build and commit, and reviews follow.
  Open questions are in `audit-q1.md` §1.

**Sources:**
- `src/components/org/upsertOrgPage.tsx`: the host page and its tab gating.
- `orgPageV2/orgDataPrivacy/orgDataPrivacyTab.tsx` and `shared/tabTitle.tsx`: the tab body pattern.
- `role/rolesPage.tsx`, `role/rolesList/rolesList.tsx` and `role/deleteConfirmationDialog.tsx`: delete only at 0
  users, the delete copy, and the `accountsManage` rule.
- `role/networkConfig/devicesDrawer.tsx`: the drawer list.
- `user/assignRoleDrawer.tsx`: moving people to a role (bulk).
- `redux/apiSlices/{organizationSlice,usersSlice}.ts`: the existing endpoints.
- `src/mocks/handlers.ts`: design mode's stubs.
- `.flkd`: `pattern-inventory`, `view-composition`, `settings-patterns`, `list-and-table-patterns`,
  `dashboard-patterns` (no chart exists in Coke), `layout-and-routing`, `product-native-ui`, `non-negotiables` §1b.
- `role-comparison` on `feature/role-comparison`: precedent for the MSW test harness.

**Boundary:** the brief declares none. The inferred boundary is in `audit-q1.md` §5. Please confirm it.

**Assumptions:**
- Delete stands in for Archive (§1.1).
- Login stands in for "used" (§1.3).
- No feature flag (§1.5).
- Who sees the tab, and who can delete (§1.6).
- 15 sample roles are added to the roles response by the mock handler. The fixture file is not edited.
