# Context receipt — role-comparison

**Pinned:** Baseline `noah/flock-designer` at `248f3058`, branched to `feature/role-comparison`.
FUI **5.5.4** per the installed package (not re-read yet this session — to confirm with
`node_modules/@flocksafety/flock-react-component-lib/package.json` before the first import). FUI
context from sibling `../flock-react-component-lib/.flkd`; shared standards from `../flock-designer/standards`.

**Decisions:**
- Path **Codebase**, stated by Noah in the request. No `flock-designer` subagent is registered in this
  session, so the agent definition was read and followed directly (the dispatch path is unverified).
- Read-only; no new endpoints; no new feature flag.
- Data: `GET */api/v3/organization/*/roles` (`useGetRolesForOrgQuery`) already returns, per role,
  `userCount`, `networkCount`, `search`, `pdTool`, `customHotlistAdmin`, and a user-management flag.
  That is everything asked for. **The user-search endpoint is not needed**, so I do not plan to call it.

**Sources:**
- `src/components/role/rolesPage.tsx` — page shell, `useGetRolesForOrgQuery`, `PageTitle`, error alert
- `src/components/role/rolesList/rolesList.tsx` — the list this entry point attaches to
- `src/data/models/role.ts` — `RoleLite` (the shape the endpoint returns)
- `src/mocks/handlers.ts`, `src/mocks/fixtures/orgRolesV3.json` — the stubbed endpoint (5 roles)
- `.flkd/product-patterns/pattern-inventory.md` — empty state (non-heading title, offer an action),
  fetch error (`FSAlert severity="error"` with Retry), `FSChip variant="status"` with a text label
- `.github/instructions/react-ui.instructions.md` — check `result.error`, aria-labels, aria-live
- `../flock-designer/standards/universal/interaction-states.md` — not yet read; read before building states

**Boundary:** see `brief.md` → Change boundary.

**Assumptions — please correct these, they decide the design:**
1. **Entry point and shape.** I plan a **"Compare roles" button in the Roles toolbar that opens a
   dialog** (two role selectors + the result). A dialog needs no new route and keeps you on the Roles
   page. Alternative: a separate page at `…/roles/compare` (shareable link, more room, but needs a route
   in `App.tsx`). Which do you want?
2. **Mock data mismatch (needs your call).** The type `RoleLite` calls the user-management flag
   `accountsManage`, but the fixture calls it `userManagement`. The page's real code reads
   `accountsManage`, so against the current mock that permission would show as missing for every role.
   I plan to add `accountsManage` to the fixture (a mock-only edit) and use the typed field name. I did
   not check what Crown actually returns — that is for engineering to confirm.
3. **Wording of the sentence**, e.g. "Moving a user from Records Clerk to Patrol Officer adds PD tool and
   removes user management. Network access changes from 3 to 78 networks." The two role names, four
   permissions and network counts are real data. **The network count difference is only a count, not
   which networks** — the endpoint does not return network IDs per role, so I cannot say "loses access
   to Network X". If you need that, it needs an endpoint that does not exist yet (the full role fetch
   returns `networkIds`; I did not use it because you scoped me to roles and user-search).
4. **Differences marked** with a "Different" text chip plus an Added/Removed label, not colour alone;
   rows in the order you listed. Identical roles show "These roles have the same permissions."
5. **Selecting roles:** two selectors (From, To), same role disabled in the other. Read-only roles are
   comparable. Roles with `userCount` 0 are comparable, and the sentence still works.
6. **Empty state** (fewer than two roles): "Add another role to compare" with the existing Add Role
   action for admins who can edit roles, nothing for those who cannot.
7. **Not verified yet:** tests, lint, typecheck, a11y scan, and the product-parity and implementation
   reviews have not run — nothing is built.

## Open questions for you
1. Dialog (my pick) or separate page?
2. OK to edit the fixture to add `accountsManage`?
3. Is a count-only network difference acceptable, or do you want named networks (needs a new endpoint)?

---

## Iteration 1 — decisions from Noah (receipt stop discharged)

Re-verified this session: FUI resolved **5.5.4** from `node_modules/@flocksafety/flock-react-component-lib/package.json`;
baseline unchanged (`feature/role-comparison` cut from `noah/flock-designer` @ `248f3058`, tree clean).
Carried forward unchanged: Sources, Boundary (extended below), the count-only network decision.

**Answers to the open questions (these supersede Assumptions 1, 2 and 5):**
1. **A page, not a dialog.** Route `orgPaths('roles/compare')` -> `/organization/:id/roles/compare?a=<roleId>&b=<roleId>`,
   registered in `src/components/App.tsx` next to the `roles` route. Reason: the review tool saves comments against
   page address + query string, so the selection lives in the URL (`a` = From, `b` = To), deep-links and restores on
   refresh. Entry: a "Compare roles" button in the Roles toolbar.
2. **Fixture corrected** to the real `RoleLite` type: `userManagement` -> `accountsManage` in
   `src/mocks/fixtures/orgRolesV3.json`; ids and names kept. `alerts` is NOT a `RoleLite` field: `rolesPage.tsx` derives
   `alerts: role.pdTool` for the list row, so it was not added to the fixture. Engineering must confirm the real Crown
   field name.
3. **Network difference is count-only** (`networkCount`). Only `useGetRolesForOrgQuery`; no user-search, no new endpoint.

**Boundary additions:** `src/components/App.tsx` (one route), `src/components/role/rolesList/rolesList.tsx` (pass the
new prop through). `cypress/fixtures/orgRolesV3.json` is a separate Cypress copy and is not touched.

**Assumptions added:** a===b is allowed in the selectors and explained in a message rather than blocked; the back link
reads "Roles" (to the Roles page) rather than PageTitle's "Organization: X" link; no `analytics.page` call (telemetry
left for engineering to decide).
