# Roles list — unused-role signal

**Project ID:** `unused-roles-signal`
**Branch:** `feature/unused-roles-signal` in `flock-coke` — codebase path, cut from `noah/flock-designer`
(matching how `feature/users-inactivity-signal` was cut — `develop` itself doesn't carry the `.flkd`
agent content yet).
**Credibility level:** Ground — confirmed by Noah (relayed via the coordinator agent), not inferred.
**Path:** Codebase — confirmed by Noah. This is real code wired into the real Roles list, not a
throwaway prototype.
**Created:** 2026-09-29

## What's the problem

Admin → Roles (`/organization/:id/role`, "Roles" item under the Admin sub-nav) lists every role in
the org with no way to tell which ones are actually assigned to anyone. Orgs accumulate roles made
for a one-off that nobody ever cleans up, because nobody can see which roles are unused without
opening each one individually.

**Verified against the codebase, not taken on the request's word:** the request's central claim —
"it's already in the data, the delete action knows" — is exactly right.
`src/components/role/rolesList/rolesList.tsx:118` computes
`const canDeleteRoles = row.userCount === 0;` and uses it only to grey out the Delete action. The
same `userCount` is already rendered on every row — `roleListRowCard.tsx:175`, `{row.userCount}
User{row.userCount !== 1 && 's'}`, as small `FSLink` text (`variant="body2"`) on the right side of
the card, beside four permission icons and (sometimes) an alert-sources warning button. `RoleLite`
(`src/data/models/role.ts:22`) types `userCount: number` on every row already returned by
`useGetRolesForOrgQuery`. No new data, no new endpoint — the gap is legibility, not information.

## Why now

Direct request from an org/user-management admin: "make an unused role obvious from the list...
something an admin scanning the page would catch without looking for it."

## What would success look like

An admin looking at the Roles list — not searching, not clicking into anything — can tell which
roles have zero assigned users, the same way they'd notice any other status signal on the page.

## Design choice — first instinct, not a menu

**Add a small warning-colored status chip next to the role name when `userCount === 0`.** Everything
else about the row is unchanged.

```tsx
<FSStack direction="row" spacing={1} alignItems="center">
    <FSTypography variant="h6" fontSize="1rem" fontWeight="bold" component="p">
        {row.name}
    </FSTypography>
    {row.userCount === 0 && <FSChip variant="status" size="small" color="warning" label="Unused" />}
</FSStack>
```

Why this, and why here rather than the existing "0 Users" link:

- **Placement at the name, not the existing count.** The existing `{n} Users` link already carries
  this fact today and nobody notices it — that's the whole complaint. It sits on the right, competing
  with four permission icons. The name is the first thing scanned on every row (leftmost, largest
  text); that's where a signal has to be to satisfy "catch without looking for it."
- **The exact convention already in the product**, not a new one:
  `.flkd/product-patterns/pattern-inventory.md` — `FSChip variant="status" size="small"
  color={semantic}`, 58 uses, colour never carries meaning alone (label text always states it).
  `warning` is the colour this inventory already maps to "needs attention but not broken" (e.g.
  "Unpaid" on invoices) — closer to "this role needs a look" than `error`, which the product reserves
  for rejected/failed states.
- **Direct precedent in this repo's own prior work:** `users-inactivity-signal`
  (`flock-designer/projects/users-inactivity-signal/`, now on `feature/users-inactivity-signal` in
  `flock-coke`) solved the identical shape of problem — a real field that already existed
  (`lastLogin`), already displayed, but too quiet to notice — by escalating it into
  `FSChip variant="status" size="small" color="warning"` once it crosses a threshold, and leaving it
  as plain text otherwise. This project is the same move applied to `userCount === 0` instead of a
  date threshold, and the same product precedent for "don't add a new signal everywhere, escalate the
  row that needs one."
- **The existing `{n} Users` link is left in place, unchanged**, including for unused roles (it still
  shows "0 Users" and still navigates to the filtered Users view). Nothing is removed or duplicated
  confusingly — the chip is the scan-time signal, the link is still the click-through detail.

**Considered and rejected:**

- *Row highlighting / background tint* — `product-native-ui.md`: "Color is used sparingly and
  meaningfully — status color earns attention because most of the page isn't colored." Tinting a
  whole card would compete with the row's existing selected/hover states and is a bigger visual
  change than the fact warrants.
- *A new column* — this is a Mode A card list (`list-and-table-patterns.md`), not a real table;
  there's no column to add to without changing the grid mode, which is out of scope for a legibility
  fix.
- *Moving the "0 Users" link itself to the left* — considered, but would restructure the row's layout
  for every role, not just unused ones, and change where a well-used role's info sits for no reason.

## Already decided

- `userCount === 0` is the exact and only definition of "unused" — the same boolean the Delete action
  already uses. Not inventing a separate notion of "unused" (e.g. also checking network count or last
  activity).
- Label text is **"Unused"**, not "Unused role" or "0 Users" restated — terse, matches the product's
  existing chip labels ("Unpaid", "Rejected", "Read Only").
- Read-only roles are not special-cased — a read-only role with 0 users still gets the chip; whether
  it's read-only is orthogonal to whether it's assigned to anyone.

## Placement in the product

| | |
|---|---|
| **Host page** | Roles — `src/components/role/rolesPage.tsx` → `RolesList` → `RoleListRowCard` |
| **Route** | `orgPaths('role')` → `/organization/:id/role` |
| **Nav** | Admin sub-nav **Roles** item |
| **Neighbours** | Role name/category/network-count on the left, permission icons and the Users link on the right, all inside the same row card |

## Change boundary

- `src/components/role/rolesList/roleListRowCard.tsx` — add the chip.
- `__tests__/src/components/role/rolesList/roleListRowCard.spec.tsx` — new test file.
- No route, Redux, or API changes — `userCount` is already fetched and already on every row.
- No changes to `rolesList.tsx`'s Delete-button logic; it already reads the same field.

## States

On the codebase path every state the feature actually has is owed, not scaled by level (per
`non-negotiables.md` §8): a role with 0 users (chip shown), a role with 1+ users (unchanged), and a
read-only role with 0 users (chip shown, edit/delete actions still gated by `readOnly` exactly as
today — unrelated to this change).

## Open question for Noah

None blocking — the two questions that mattered (path, level) are answered. One thing worth a
reaction rather than a silent decision: the chip label is **"Unused"** rather than something that
states the count (e.g. "0 Users — Unused"). If that reads as ambiguous once it's in front of you,
say so and it's a one-line change.
