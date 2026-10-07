# Audit: quick prototype q1 into the codebase

Project `admin-usage` · branch `feature/admin-usage` (at `370fba8e`, the same commit as `noah/flock-designer`) ·
prototype source `quick/admin-usage/q1.tsx`, modelled on `noah/flock-designer` at `21c9b90` · FUI 5.5.4 (installed
package) · written 2026-10-06, before any code was changed.

This is for a designer and an engineer to read together. Section 1 is what needs a person. Everything after it is
what I am building in the meantime, so nothing waits on those answers.

---

## 1. Needs a decision

### 1.1 Archiving roles (`@standin`)

**What the prototype shows:** an Archive action (row, bulk, and in the side panel). Archiving a role that people
still hold asks which role to move them to first. The 40-person case is Legacy Investigator.

**Its note for the move:** "Decide what happens to users on archive (this prototype makes the admin pick a role to
move them to), whether archived roles can be restored, and where archived roles are listed."

**Why it is a decision:** the product has no Archive. It can only **delete** a role, and only when nobody holds it
(the Roles page turns Delete off when a role has users). Delete is permanent: it removes the role's network and
permission settings. Archive, archived roles, and "move people off a role while archiving it" do not exist anywhere.

**What I build in the meantime: Delete, the product's existing action.**
- The buttons say **Delete**, not Archive: "Delete Selected", the row's "Delete", and "Delete Role" in the side panel.
- A role nobody holds can be deleted, alone or several at once. Each uses the product's existing delete call.
- A role people still hold cannot be deleted. Choosing Delete on it opens the dialog, which says how many people
  hold it and that they must be moved to another role first. It links to the **Users** page filtered to that role,
  where the existing **Assign to Role** bulk action moves them. This is the 40-person state.
- In a mixed selection, the dialog deletes the roles nobody holds and lists the others as not deleted, with the reason.
- The prototype's "Move 40 Users To" picker is **not** built. Moving people and permanently deleting a role in one
  step is the decision above, not something to settle in code.

When Archive is decided, the dialog is one file and the action is one call. The rest of the page stays as it is.

### 1.2 The per-role chart (`@standin`)

**Its note for the move:** "Decide a chart library, or build one chart component in FUI. Keep the shared 0-100% scale
and the hover readout."

**Why it is a decision:** the product has no chart component and no chart library. Adding a library is an
engineering decision (a new dependency).

**What I build in the meantime:** the prototype's own chart, kept as written, in one file of its own. It uses
palette colours only. Screen readers skip the drawing and get the same facts as text: each card's accessible name
carries the role, its user count and its summary line. Swapping the chart later means replacing that one file.

### 1.3 What "used" means, and the 90-day window (`@standin`, listed in the header only)

**What the prototype says:** "A role counts as used on a day when someone with that role signs in and uses a
permission it grants." The window is the last 90 days.

**Why it is a decision:** the product does not record when someone uses a permission. What it does record is each
person's **last login** (shown on the Users page). The prototype's header lists this as a stand-in, but the code
carries no inline mark and no note for the move (see "Unannotated marks" at the end).

**What I build in the meantime:** the nearest thing the product has. A role counts as used on a day when someone who
holds it **signs in**. The side panel shows each person's **Last Login**. The usage data comes from a stubbed request
(section 4), which also says which 90 days it covers; the page shows those dates rather than working them out.

### 1.4 A tab of its own, or a filter on the Roles list (the brief's open question)

The prototype answers "its own tab", and I build that. Two things to weigh when deciding:
- The Roles list already has the full toolbar, filters and delete. A filter there would reuse all of it.
- **The word "Unused" would mean two different things.** The branch `feature/unused-roles-signal` puts an "Unused"
  chip on roles **nobody holds**. This tab calls a role "Unused" when **nobody who holds it was active** in 90 days.
  Legacy Investigator would be "Unused" here and not "Unused" there. If both ship, one of them needs another word.

### 1.5 Whether the tab ships behind a feature flag

New Organization tabs are switched on with a LaunchDarkly flag (Data & Privacy uses one). I do not add one: the list
of flags is a file I am not allowed to change, and design mode starts with every flag off, so the tab could not be
seen or reviewed. **In the meantime** the tab shows for anyone who can see the Settings tab. Engineering adds a flag
before this merges, if one is wanted.

### 1.6 Who sees the tab, and who can delete

The prototype shows a customer's own org admin and does not say who else sees the tab. **In the meantime:**
- The tab shows to people with permission to manage the organization, on an existing organization (the same rule
  as the Settings tab). It does not show while creating an organization.
- Checkboxes and Delete only show to people who can manage users for the org. That is the rule the Roles page uses
  for editing roles. Anyone else gets the same page with no actions.

### 1.7 Delete on a role people still hold: on, not off

On the Roles page, Delete is shown greyed out with a tooltip when a role has users. Here, Delete stays available and
opens the dialog that explains why the role cannot be deleted yet. I do this because the brief asks for that state
("archiving a role that is still assigned to 40 people") to be shown, and a greyed-out menu item cannot show it.
Say if this page should match the Roles page instead.

### 1.8 The side panel shows up to 100 people

The Users page loads people a page at a time. The side panel loads one page of up to 100 holders and searches within
it. When a role has more (one sample role has 112), it says "Showing 100 of 112 users" and links to the Users page
filtered to that role. Say if it should page through everyone instead.

---

## 2. What the page shows

- **Where:** Admin > Organization, a new **Usage** tab after Data & Privacy. The address is
  `/organization/:id?tab=usage`.
- **Role Usage** (the tab title), with one line saying what counts as used and which dates are shown.
- **Unused Roles:** a table of roles with no activity in the window: Role Name, Users, Created, Last Used, and a
  row menu with Delete. There are checkboxes and a **Delete Selected (n)** button, which is off until something is
  selected and says so in a tooltip. Clicking a role's name or user count opens the side panel.
- **Usage by Role:** one card per role, all on the same 0-100% scale. Used roles come first, busiest first.
  Each card shows the role name, an Unused or Idle chip where it applies, the user count, the chart, and a readout
  that changes as you hover along the chart. Clicking a card opens the side panel.
- **Side panel:** the role's status, users, how many were active, last used, and created date. Then **Who Holds This
  Role**: a search box and the list of holders with their last login. Delete Role and Close are at the bottom.
- **Delete dialog:** described in 1.1.
- **States:**
  - Default.
  - Empty: no unused roles. The section says "No Unused Roles" and why.
  - Loading: skeletons shaped like the table rows and the cards.
  - Error: the usage could not load. The message has a Retry button.
  - Side panel: loading, error, no matches for the search, nobody holds the role, more than 100 holders.
  - Delete: in progress, failed, and blocked because people hold the role (the 40-person case).
  - No permission to delete: the page with no actions.

## 3. Where each part goes

| Part | File | Wired to |
|---|---|---|
| The tab in the tab bar | `src/components/org/upsertOrgPage.tsx` (existing) and `src/components/org/utils.ts` (tab list and label) | `?tab=usage` like the other tabs, shown under 1.6's rule |
| The tab body | `src/components/org/orgPageV2/orgUsage/orgUsageTab.tsx` (new) | The roles list and usage requests, permissions, snackbars |
| Unused Roles section | `.../orgUsage/unusedRolesSection.tsx` (new) | The tab's selection and delete |
| Role card, and the chart | `.../orgUsage/roleUsageCard.tsx`, `.../orgUsage/roleUsageChart.tsx` (new) | Nothing. Plain props |
| Side panel | `.../orgUsage/roleHoldersDrawer.tsx` (new) | The existing user search, filtered to the role |
| Delete dialog | `.../orgUsage/deleteRolesDialog.tsx` (new) | The existing delete-role call, and a link to the Users page |
| Joining roles to usage, dates, wording | `.../orgUsage/roleUsageUtils.ts` (new) | Nothing. Pure functions |
| The usage request | `src/redux/apiSlices/roleUsageSlice.ts` (new), `src/data/dto/roleUsage.ts` (new) | Refreshes whenever the roles list does, so a delete updates both |
| The page header, top bar and navigation | Already in the product (`upsertOrgPage.tsx`, `AppHeader`) | Nothing moves in. The prototype's copy of them is deleted |

Where the prototype differs from the product's own way, the product wins:
- **Tab title:** the prototype builds its own heading and description. The product uses `TabTitle` for every
  Organization tab, so this uses it too (`h5` styled as an `h2`, with a plain description).
- **Tab padding:** 24px, using the spacing scale (`padding: 3`), as the Organization tabs use.
- **Error state:** the prototype has none. It gets the product's: a red alert below the title, with Retry.
- **Delete wording and the 0-users rule:** taken from the Roles page and its delete dialog.
- **Close icons:** `FSSymbol`, not the MUI icon the older dialog uses. FSSymbol is the rule for new icons.
- **Section headings:** `h6` styled as `h3` under the `h2` tab title, as the prototype already does. This does not
  copy the product's skipped heading level.

## 4. Data

This branch still uses mock data: MSW handlers in `src/mocks/`, the way design mode already stubs the network. Each
item below is what the data really is, where it comes from, and how it is mocked here.

| Prototype mock | What it really is | Where it comes from | Mocked here as |
|---|---|---|---|
| Organization name and type | The org's name and type | Already on the page: the Organization header reads them | Nothing new. The prototype's copy is deleted |
| The role list | The org's roles, with how many people hold each | **Existing** request: roles for the org (`GET /api/v3/organization/:id/roles`) | The existing handler, plus 15 sample roles from the prototype added to its response in the handler. The fixture file is not changed. The prototype's "HOA Admin" is dropped, because the fixture already has one |
| Daily usage per role, last used | For each role, how many holders signed in on each day, and the last day anyone did | **New, does not exist yet:** `GET /api/v1/organization/:id/roles/usage?days=90` | New handler. Numbers are generated from the prototype's own seeds, so the charts look as reviewers saw them |
| Creation dates | When each role was created | **Nothing returns this today.** The roles list has no created date | Carried on the new usage request for now. Engineering decides whether it belongs on the roles list instead |
| Role holders and last active | The people who hold a role, with their last login | **Existing** request: user search (`POST /api/v1/organization/:id/user/search`) with a role filter. Users already have `lastLogin` | The existing handler now honours the role filter and search text, and returns generated holders whose numbers match each role's user count. Requests without a role filter get exactly what they got before |
| The 90-day window | Which days the numbers cover | The new usage request returns its first and last day | Fixed in the mock: Jul 9 to Oct 6, 2026, as in the prototype |
| Top-bar links and account menus | The signed-in person's apps and menus | The real `AppHeader`, from the account | Nothing new. The real shell renders them |
| Sub-navigation | The admin side menu | The real `useAdminSubNavItems`, from permissions | Nothing new |
| (Archive) | (Not built, see 1.1.) Delete: **existing** `DELETE /api/v1/organization/:id/role/:roleId` | | New handler. Deleted roles stay gone until the page reloads |

**Stubbed requests engineering swaps for real ones:** the role usage request (new), delete role (exists), and the
role filter on user search (exists; only the mock changed).

## 5. What I will build, and where

The brief does not declare a change boundary. This is the one I am working to, inferred from the brief ("a new tab
on the Organization page") and the codebase path's rules. Please confirm it.

**Change:**
- `src/components/org/upsertOrgPage.tsx`: add the tab and render its body.
- `src/components/org/utils.ts`: add `Usage` to the tab list and its label.
- `src/mocks/handlers.ts`: the usage request, delete role, the role filter on user search, and the sample roles.

**Add:**
- `src/components/org/orgPageV2/orgUsage/` with `orgUsageTab.tsx`, `unusedRolesSection.tsx`, `roleUsageCard.tsx`,
  `roleUsageChart.tsx`, `roleHoldersDrawer.tsx`, `deleteRolesDialog.tsx`, `roleUsageUtils.ts`.
- `src/redux/apiSlices/roleUsageSlice.ts` and `src/data/dto/roleUsage.ts`.
- `src/mocks/roleUsageData.ts`: the generated sample roles, usage and holders.
- Tests in `__tests__/src/components/org/orgPageV2/orgUsage/`: the pure functions, the tab's behaviour and states,
  and an accessibility scan (`*.a11y.spec.tsx`).
- The route in `flock-designer/projects/admin-usage/iterations.json`, so the codebase iteration opens on this tab.

**A rule I am following that conflicts with another:** this repository's Flock Designer notes list `src/redux/` as
off-limits, and also say the codebase path wires Redux for real and must not invent a parallel data layer. The hard
rules (`non-negotiables.md` §1b) win, so the usage request is a new RTK Query file in `src/redux/apiSlices/`. No
existing file there changes.

## 6. What I will not build, and why

- **Archive, archived roles, restoring, and moving people while archiving.** Not decided (1.1). Delete is the stand-in.
- **A chart library or an FUI chart component.** Not decided (1.2), and a new dependency is an engineering call.
- **Tracking permission use.** The product does not record it (1.3).
- **A feature flag** (1.5).
- **The prototype's state switcher, the "this tab is not shown" placeholder, and the fake delays.** Marked
  `@remove`. Real loading comes from the real requests.
- **The prototype's own top bar, navigation, page header and tab bar.** The product already has them.
- **Paging through more than 100 holders in the side panel** (1.8).
- **Changes to the Roles list or the Users page.** Both are outside the boundary. The link to Users uses the role
  filter the Users page already supports (`?role=`).
- **A Cypress test.** Cypress does not launch on this machine (recorded in `__tests__/support/axe.ts`). The
  accessibility scan runs in Vitest against the real components instead.

---

## Unannotated marks

These are findings, not guesses:

1. **The top-bar `@mock`** (app links, help and account menus) has no "On move" note. It is plain what happens: the
   real `AppHeader` renders them. But the note is missing.
2. **The "used" definition `@standin`** is listed in the header but has no inline mark and no note for the move.
   The definition sits unmarked in the tab's description text. Covered in 1.3.
3. **The hand-made shell is unmarked.** `FSApp`, `FSSnackbarProvider`, `FSUniversalNav`, the page frame
   (`OrganizationPage`) and the two CSS imports have no `@remove`, even though they exist only so the file runs on
   its own. The header says only the frame of `upsertOrgPage.tsx` was reused, so I treat them as the existing host
   and move none of them in.

`data-e2e-ref` names are kept as written, including `archive-dialog`, `confirm-archive-button`,
`drawer-archive-button` and `bulk-archive-button`, even though those parts now delete, so comments made against them
still point at the same parts. The prototype-only `state-switcher` ref goes with the switcher.
