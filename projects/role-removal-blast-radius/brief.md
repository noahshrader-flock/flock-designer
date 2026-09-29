# Role permission removal — blast-radius warning

**Project ID:** `role-removal-blast-radius`
**Branch:** `fd/role-removal-blast-radius/i1` in `flock-coke`, cut from `noah/flock-designer`.
**Credibility level:** Test — see "Level" below for the reasoning; this was decided by the agent,
not confirmed by the stakeholder yet, and should be treated as provisional until relayed back.
**Created:** 2026-09-28
**Status:** i1 built, not yet reviewed by anyone.

## What's the problem

Verbatim from the stakeholder (product owner), via Noah, arriving as a support-escalation account
rather than a spec:

> When an admin edits a role and turns off a permission, that change hits everyone who has that
> role — and right now there's nothing telling them how many people that is, or who. They hit Save
> and find out afterwards when someone can't do their job. One of the escalations was an org that
> turned off Search on a role with about 40 people on it and didn't realise until the complaints
> started.

Two named escalations. The problem is real and has already cost a support incident.

## Why now

Named twice in support escalations, not hypothetical. The stakeholder wants something to react to,
not a finished spec — explicit framing: "Same as last time, something we can look at together and
react to. Not final."

## What would success look like

The stakeholder didn't specify a metric — this is exploratory. Directionally: an admin editing a
role can tell, before hitting Save, how many people (and ideally who) a permission removal affects,
scaled so that a 2-person role doesn't get the same ceremony as a 40-person one.

## Current thinking — the stakeholder's own words

> What I don't know is how heavy that should be. Could be a line of text that updates as you toggle
> things. Could be a proper confirmation step when you hit Save that lists what's being removed and
> who's affected. Could be something in between. I lean toward not blocking people — most role edits
> are routine and I don't want a scary modal every time someone renames a role — but "40 people are
> about to lose Search" genuinely should stop you for a second.
>
> Also worth thinking about whether adding a permission deserves the same treatment or whether it's
> only removals that matter. My gut says only removals but I'm not sure.

Wants to react to **options**, not receive one locked answer. Explicitly flags the
addition-vs-removal question as unresolved.

## Inspiration / nearest existing pattern

**Verified against the codebase, not assumed.** The exact mechanism the stakeholder is describing
already exists in one corner of the real Role edit form, just without blast-radius information:

- `src/components/role/roleAddEditForm.tsx` (`handleChangeFeature`, ~L240-256, and the "Select All"
  branch ~L167-190) already shows a **blocking confirmation dialog** — `WarningDialog`
  (`src/components/common/warningDialog.tsx`) — the moment an admin unchecks a VMS-related
  permission or bulk-deselects, with generic text: *"Unselecting this will remove VMS features on
  all networks for users assigned to this role."* This never mentions a user count.
- This is a real, live, per-toggle interruption pattern already shipping. What's missing is exactly
  what the stakeholder named: **who/how many** it affects, and any **scaling** by blast radius — today
  every VMS toggle-off gets the identical dialog regardless of whether the role has 1 user or 400.
- `RolePermissionSection` (`rolePermissionConfig/rolePermissionSection.tsx`) also has a **standing,
  non-blocking inline** pattern already: `perm.warningText && isChecked` renders an `FSAlert
  severity="warning"` under a checkbox. Different mechanism, same file, already coexisting with the
  blocking dialog above — Coke already has both of the stakeholder's named options live in production,
  in the same form, for different permissions.
- `role.userCount` (`src/data/models/role.ts:19`) is a real field already on every `Role`, already
  read and displayed elsewhere on the same page (`roleFormActionsFooter.tsx:37-39`, the delete-button
  tooltip: *"This role can not be deleted because it has N assigned users"*). The count this project
  needs is not new data — it's a field the form already has in scope and already surfaces once, just
  not next to the permission toggles.

So this is **not** a new interaction pattern. It's extending two mechanisms Coke already ships
(inline warning text, blocking warning dialog) with information (user count, and a sample of who)
that role edit doesn't currently surface anywhere near the toggles.

## Already decided

- Blast radius = `role.userCount` uniformly for **every** permission on that role, not a per-permission
  subset. Permissions are role-level; removing one hits every user assigned to the role equally. (Also
  literally what the stakeholder's own account describes: "a role with about 40 people on it.")
- Additions are explicitly **not** assumed to deserve the same treatment — build the removal case, and
  make the addition case's current (silent) behavior visible as a deliberate comparison point rather
  than resolving it either way.
- Not building the real per-network VMS permission model (`RoleFeatures`'s `{networkIds: []}` shape)
  — the blast-radius question is orthogonal to that complexity. See "What's simplified" below.

## Placement in the product

| | |
|---|---|
| **Host page** | Role edit — `src/components/role/roleFormPage.tsx` → `RoleAddEditForm`, reached from Roles |
| **Route** | `orgPaths('role/:roleId')` → `/organization/:id/role/:roleId` |
| **Nav** | Admin sub-nav **Roles** item, then "Edit" on a role row |
| **Neighbours** | Role Name / Select All / Role Category header, Networks summary link, then the permission-toggle sections (`RoleOrgLevelPermissions`), then the sticky Save/Cancel/Delete footer |

**Note on which Role form:** Coke has two — legacy `RoleFormPage` (default) and `RoleFormPageV3`
(behind `FeatureFlag.SHOW_AUTO_PERMISSION_PROVISIONING`, per `App.tsx:410-417`). Building against the
**legacy, default-path** form — that's what every admin hits today regardless of flag state, and
matches the escalations described (nothing V3-specific in the stakeholder's account).

## Level

Reasoned to **Test** rather than a lower-ceremony Explore, without stakeholder confirmation — **this
is the one open item Noah should relay before treating the level itself as settled**, per this
project's own framing echoing the "react to" language `orgs-list-signals` used before that project
was explicitly upgraded to Test for the same reason.

Why Test, not Explore: the actual design question — *does the friction feel right, scaled to blast
radius* — is a property of **interaction**, not appearance. An Explore-level frozen frame can show
what an inline warning or a confirmation dialog *looks like*, but it can't show what "toggling Search
off on a 2-person role feels calm, and toggling it off on a 40-person role feels like it should stop
you for a second" actually feels like — that comparison only exists once the same control is
switchable between blast radii and treatments and can actually be clicked. The stakeholder's own
language ("Could be a line of text that updates as you toggle things") describes behavior, not a
static state.

**What Test owes here, concretely:** the states the interaction produces — default (untouched
form), the moment a removal is toggled (inline-warning treatment), the moment Save is pressed on a
role with unsaved removals (confirmation-dialog treatment), and post-save confirmation. Page-level
loading/fetch-error states are **not** built — they're unchanged from the existing `RoleFormPage` and
don't carry this decision (see `context-receipt.md`).

## Change boundary

- `src/prototypes/role-removal-blast-radius/` only.
- No route registered, no Redux, no real API, no LaunchDarkly flag.
- Local mock data: two `Role`/`RoleLite`-shaped mock roles (small and large `userCount`) and a mock
  affected-`User` list per role, typed against `src/data/models/role.ts` and
  `src/data/models/user.ts`.
- A simplified permission list (6 representative rows), **not** the full ~100-field `RoleFeatures` /
  per-network VMS model — see "What's simplified" in `context-receipt.md`.

## What this project is exploring, and what it deliberately leaves open

Three treatments, switchable in the same harness so a reviewer can compare them directly, plus a
role-size switch (small role vs. ~40-person role) so blast-radius scaling is something to click
through, not just read about:

1. **Inline, non-blocking.** Text under a toggle updates live the moment a permission is switched
   off, naming the user count. Never blocks Save.
2. **Confirmation on Save.** Save opens a dialog (adapting the existing `WarningDialog` pattern)
   listing which permissions are being removed and who/how many it affects. Blocks until confirmed
   or cancelled.
3. **Graduated.** Inline text always shows (treatment 1, always-on, informational). The confirmation
   dialog (treatment 2) additionally appears on Save, but **only** when total affected users crosses
   a threshold (this prototype uses >10, called out as invented and arbitrary, not a considered
   number) — routine edits on small roles stay frictionless; a 40-person removal still stops you.

**Left open, on purpose, for the stakeholder to react to rather than the agent deciding:**

- **Whether additions warrant any of this.** The prototype's default behavior for adding a
  permission is silent (matches today), with an explicit harness note calling this out as the
  unresolved question, plus one concrete alternate to react to (a quieter, always-non-blocking
  version of treatment 1 that also fires on addition) — not built as a full toggle path, described
  in the report instead, since building a second full axis (add vs. remove) × (three treatments)
  would be scope creep this project doesn't need to answer the primary question first.
- **The >10-user threshold in treatment 3** — arbitrary, not derived from anything.
- **Whether "who" needs real names or just a count.** This prototype shows both (a short name list
  plus "and N more" for the large role) so that trade-off itself is visible and reactable-to, not
  resolved.
- **Whether the existing, already-shipping VMS-toggle `WarningDialog` behavior (no user count, fires
  on every org regardless of size) should be replaced by whichever treatment here is chosen**, or
  left alone as a separate, narrower mechanism. Not decided here.
