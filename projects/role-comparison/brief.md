# Role comparison

## What's the problem

Org admins who edit roles or move people between them cannot see how two roles differ, so they guess
what a user would gain or lose. The real question: "if I move these people from Records Clerk to
Patrol Officer, what changes?"

## What would success look like

An admin can answer "what changes if I move someone from A to B?" in under ten seconds.

## Current thinking

From the existing Roles page (Organization → Roles), pick two roles and see them side by side:
- each role's user count and network count
- which of four permissions each has: search, PD tool, user management, custom hotlist admin
- differences clearly marked (in text, not colour alone)
- one plain-language sentence: what moving a user from role A to role B would add and take away

## Inspiration

Organization → Roles (`src/components/role/rolesPage.tsx`). Match its patterns.

## Already decided

- **Path: codebase** (not a prototype), stated by Noah. Branch `feature/role-comparison`.
- Read-only. No editing roles.
- Use only mock endpoints that already exist (roles and user-search). If something else is needed,
  say so rather than invent it.

## How finished does it need to be

Real files with tests, as if engineering is taking it next. Loading, empty (org with fewer than two
roles) and error states. Fully keyboard-operable.

## Change boundary

In scope:
- New: `src/components/role/roleComparison/` (comparison view, a pure diff helper, the sentence builder)
- Edit: `src/components/role/rolesPage.tsx` and `src/components/role/rolesList/rolesList.tsx` (entry point only; the new prop is passed through the list) and, if the entry point is a toolbar
  action, `src/components/role/rolesList/rolesListSlotComponents.tsx`
- Edit: `src/mocks/fixtures/orgRolesV3.json` only if the field-name mismatch below is confirmed
- New tests under `__tests__/src/components/role/roleComparison/`, including a `*.a11y.spec.tsx`
- A route in `src/components/App.tsx` only if "separate page" is chosen over "dialog" (open question 1)

Out of scope: editing roles, the role form, the users page, any new endpoint, any new feature flag.
