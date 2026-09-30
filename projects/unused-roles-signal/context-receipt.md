# Context receipt — unused-roles-signal

**Pinned:** Baseline `noah/flock-designer` at `3f9e5f39` (branched to `feature/unused-roles-signal` —
cut from here, not bare `develop`, so the `.flkd` agent content stays on the branch, matching how
`feature/users-inactivity-signal` was cut). FUI resolved version
**5.5.4**, read from `node_modules/@flocksafety/flock-react-component-lib/package.json`. FUI context
read from the sibling checkout `../flock-react-component-lib/.flkd` (no published-package `.flkd` yet).

**Decisions:** Credibility level **Ground**, path **Codebase** — both stated directly by Noah via the
coordinator agent, not inferred. Scope resolved as: chip only, on the existing row card, no grid-mode
change, no new column, no touch to the Delete-action logic that already reads `userCount`.

**Sources:**
- `src/components/role/rolesList/rolesList.tsx` — `canDeleteRoles = row.userCount === 0` (the field
  and the exact boolean this project reuses)
- `src/components/role/rolesList/roleListRowCard.tsx` — the row card being changed
- `src/data/models/role.ts` — `RoleLite.userCount: number`
- `.flkd/product-patterns/pattern-inventory.md` — the `FSChip variant="status"` convention (58 uses,
  colour-plus-label, `warning` mapped to "needs attention")
- `.flkd/product-patterns/list-and-table-patterns.md` — confirms Roles is a Mode A card list, so "add
  a column" isn't a valid option here
- `.flkd/standards/flock/product-native-ui.md` — "color is used sparingly," ruled out row tinting
- `flock-designer/projects/users-inactivity-signal/` (brief + handoff) — direct precedent for the
  same move (escalate an existing quiet field into a warning chip past a threshold) on
  `feature/users-inactivity-signal`, including its test style (`lastLoginDisplay.spec.ts`) and its
  codebase-path handoff format, both used as the template for this project's own handoff
- `__tests__/src/components/org/form/sections/permissionsCheckboxSection.spec.tsx` — the RTL pattern
  followed for this project's new test file

**Boundary:** `src/components/role/rolesList/roleListRowCard.tsx` (edit) and
`__tests__/src/components/role/rolesList/roleListRowCard.spec.tsx` (new). Nothing else — see
`brief.md`'s "Change boundary."

**Assumptions:**
- The chip label **"Unused"** (not a count-restating variant) — flagged in the brief as the one thing
  worth a reaction rather than a silent decision.
- `warning` (not `error`) is the right severity — reasoned from the pattern inventory's existing
  colour mapping, not confirmed by Noah directly.
- Read-only roles with 0 users still get the chip — not called out in the request either way; treated
  as in-scope since "unused" and "read-only" are independent facts about a role.
- No accessibility change needed beyond what the chip gets for free (visible label text, no
  color-only signal) — the row's existing `aria-label` on the outer `FSStack` already states the user
  count for assistive tech, so the chip is a sighted-scan affordance layered on an already-correct
  accessible description, not a replacement for one.
