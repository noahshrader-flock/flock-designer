# Audit: Test DSNR, prototype v1-i1, moving into Coke

Written before any code was changed. For a designer and an engineer to read together.

The prototype is the **Policies tab** of the Organization page, redrawn from the Q3 2026 SHARC refinement. It was modeled
on `feature/admin-usage` at 93ef5f5. This work is on `feature/test-dsnr`, which already has the Policies tab, the LPR
Policy drawers, the state policy accordion and the Policy Review section, so everything below is checked against this
branch, not the one the prototype was drawn from.

## 1. Needs a decision

Each item says what gets built in the meantime, so nothing is blocked. Please confirm or change each one.

| # | The prototype did | What I will build until you decide | Who decides |
|---|---|---|---|
| 1 | **A green banner behind the organization type and name** (`@standin`; the real page draws plain text; the prototype's own note says "decide whether the page header changes"). | Nothing. The page header stays plain text. The header is the whole Organization page, shared by every tab, and is outside this change. | Design |
| 2 | **"Plan & Features" as the tab label**, and a tab bar with no "Data and Privacy" tab. The product says "Package & Features" and shows Data and Privacy for some people. | Nothing. Tab labels and the tab bar are not touched: the label list is also used for the browser title and other tests. | Design and product |
| 3 | **Add on LPR Policy** (`@standin`, no "on move" note). The real one is not a single button: Add opens a menu (Add Link / Add File), each opens a drawer, and once a policy exists the row shows its name, who updated it, and an Edit / Delete menu with a delete confirmation. | The product's existing LPR Policy section, unchanged, in the same place in the My Agency group, with its existing rule that it only appears when the shared networks flag is on. It looks like today's grey bar, not like the prototype's Add button row. | Design (does the Figma replace the grey bar?) |
| 4 | **A Sharing MOU row with an Add button** (`@standin`, no "on move" note). **Nothing in Coke backs it.** The only MOU in the product is a "MOU signed" switch on the Overview tab that only global admins can change. There is no MOU upload, no endpoint, no drawer. | **The row is not built.** A button that does nothing, or a disabled one, would be worse than leaving it out. | Product, then Crown (needs an endpoint and a drawer) |
| 5 | **A Policy Report row with a Download button** (`@standin`, no "on move" note). The prototype's description ("a report of your agency's policy acknowledgements") is placeholder text. The product's only report is the **state attestation report**: a CSV of all agencies that have affirmed the acknowledgement for your state, shown as a banner in the State section, behind its own flag, and only when the organization has an active state policy and a known state. | A Policy Report row in My Agency that downloads that same CSV through the product's existing download action, with the product's description of it, and shown under the product's existing rules (same flag, same conditions). It leaves the State section. If those conditions are not met the row is hidden, as the banner is today. | Product (is the attestation report the "Policy Report"?) |
| 6 | **Federal Sharing and Search Filters as two groups inside "My Agency"** (`@standin`). Today they sit in the un-named top section ("General"), and the State section is called "State Restrictions". | Built as the prototype draws it. | Design |
| 7 | **The group names "My Agency" and "State"**. The Figma has filler text there (`@mock`), so these two names were invented by the prototype. | Built with those two names. | Design (and Coke copy: Title Case, as built) |
| 8 | **Things the prototype leaves out that the product has today.** Moving the prototype in "as written" would delete them. | **All kept** (listed in section 3, with where each goes): Policy Review, Audit Assistance, "Block proactively shared networks", the search filter warning about networks missing, statewide search filters that are locked on, the restrictions that disable a toggle with a reason, the unsaved-changes prompt when leaving the page, and the loading, error and saving states. | Design (should any of these go?) |
| 9 | **The "cannot be undone" notice drawn as `info`.** Coke's information banner is `neutral`, and the product's current notice already uses it. | `neutral`, as today. | Design |
| 10 | **No "Enabled" / "Disabled" word next to switches**, and the title of the row as the switch's name. The product shows the word today. | Built as the prototype draws it. The switch's name is the row title, which is a better name than "Enabled". (The library's switch does not put `data-e2e-ref` on the page, so the review hook sits on a span around it.) | Design (confirm the word is meant to go) |
| 11 | **State policy wording open on the page**, with no Expand to Review accordion. | Built open. The extra things the accordion row shows today (the "Effective" date, the "Policy language update" notice, who affirmed or denied it and when, "Action Required" when nobody has) are kept above the wording. | Design |
| 12 | **The whole new layout replaces the current one for everyone.** | **Behind a new flag**, `SHOW_POLICIES_REFINEMENT` (`showPoliciesRefinement`), switched on in design mode so reviewers can see it. Off, the tab is exactly today's. Engineering creates the flag in LaunchDarkly. | Engineering |

| 13 | **Search filter rows: the prototype shows `policyName` as the title and `description` as a second line.** Today's tab shows only `description`, as the label. Nothing in this repository says what real data holds in each field. | Built as the prototype draws it. **Unverified against real data**: check with Crown before the flag goes on. If `description` is the label, make it the title and drop the second line. | Product, Crown |

Also noted, not a decision: the prototype's marked parts (`@standin` items 3 to 5) have no "on move" note beyond the one
for the banner. The notes above are mine, and need a person to confirm.

## 2. What the page shows

One screen: the Policies tab for "Indianapolis Metro - PD", under the page title and tab bar.

- **My Agency**: LPR Policy (Add), Sharing MOU (Add), Policy Report (Download), then **Federal Sharing** (one switch:
  Receive Federal Share Requests) and **Search Filters** (switches for Immigration and Reproductive Health, each with who
  last changed it and when).
- **State**: the Illinois State Policy with the full Affirm and Deny wording open on the page, a notice that the choice
  cannot be undone, and an Acknowledgement select. It reads Affirm and is locked, because it was already affirmed.
- **Interactions**: switching anything on or off turns on Save and shows "Unsaved Changes"; Cancel puts everything back;
  Save saves and says so in a snackbar. The fixed Cancel / Save bar sits at the bottom.

## 3. Where each part goes

The page frame (back link, header, tab bar) is the product's own `upsertOrgPage.tsx` and **does not change**. Only the
Policies tab body changes. The prototype's copies of the back link, the tab title and the sticky footer are the product's
own, so they are not copied in: the product's real ones are already there.

The tab's existing wrapper (`OrgPoliciesTab`) keeps everything it does today: fetching, the form state, Save and its
snackbars, Cancel, the unsaved-changes dialog when you navigate away, the loading skeleton and the fetch error, the
Policy Review section. It chooses between today's body and the new one by the flag. The one other edit to today's body: the "Refresh" action for
filters missing networks moved out of the page markup into a named function so both bodies share it. It does the same thing.

| Part | File | Wired to |
|---|---|---|
| Choosing old or new body, and the flag | `orgPoliciesFeaturesTab.tsx` (edit), `useFlockFlags.tsx` (edit) | the new flag, read with the tab's existing `flags` |
| A settings row (title, description, who changed it, control) and the switch with its name | `policySettingsRow.tsx` (new) | nothing; props only |
| The two groups together, and the divider between them | `orgPoliciesGroupedBody.tsx` (new) | everything the tab passes down |
| **My Agency** group | `orgMyAgencyPolicies.tsx` (new) | form state and flags from the tab; the LPR section, the report download, the Audit Assistance switch |
| Federal Sharing rows | `orgFederalSharingGroup.tsx` (new) | form state; owned networks; the state rule `isFederalSharingRestrictedForOrg` already in `orgSharingFilterSection.tsx` |
| Search Filters rows | `orgSearchFiltersGroup.tsx` (new) | form state; the existing "fix missing networks" action |
| **State** group and each policy in it | `orgStatePolicies.tsx` (new) | form state; the existing `onPolicyStatusChange`; the state rules from `@flocksafety/flock-sharing-lib` |
| Mock data for design mode | `src/mocks/orgPolicies.ts` and `src/mocks/fixtures/orgPolicies.json` (new), `src/mocks/handlers.ts` (edit) | the policies, save, LPR policy and state report requests; the design-mode flags |
| Tests | `__tests__/src/components/org/orgPageV2/orgPolicies/` (new) | |

**Rules the product already has, carried over** (found in `orgPoliciesFeaturesTab.tsx`, `orgSharingFilterSection.tsx`,
`orgSearchFilterSection.tsx`, `orgPolicySectionV2.tsx`, `policyRow.tsx`, `orgLPRPolicySection.tsx`):

- **Receive Federal share requests** is switched off and cannot be changed when state law applies it statewide (tooltip
  says so) or when the organization owns no networks (tooltip says so). It shows who last changed it.
- **Block proactively shared networks** (not in the prototype) is kept in the Federal Sharing group, with who last
  changed it.
- **Audit Assistance** (not in the prototype) is kept as a row in My Agency. It is switched off with an explaining
  tooltip when the organization has no Insights.
- **Policy Review** (not in the prototype) stays at the top of the tab, only with its flag and only for people who have
  review access.
- **Search Filters** show only when there are some. A filter that applies statewide is locked on, with a tooltip. A filter
  enabled for only some of the networks shows "Enabled for X of Y networks" and a warning with a Refresh action. Filters
  with no description are not shown.
- **State policies**: only the ones the organization may affirm (`orgCanAttestStatePolicy`), only those with an active or
  pending policy, in name order. The Acknowledgement select is locked once the **saved** status is Affirm (a Deny can
  still be changed). Choosing a value changes the form, and nothing is saved until Save.
- **The State group is only there** when the organization has state policies. **My Agency's LPR Policy** only with the
  shared networks flag. **The Policy Report** only under the conditions in decision 5.
- **Save** is off until something changed. Leaving the page with unsaved changes asks first. Save shows progress and
  cannot be pressed twice.

**What the prototype's accessibility check left open, and what the run found** (the automated rules only, which is not a
full accessibility check):

- *aria-input-field-name* (the Acknowledgement select has no name): **not fixed, and cannot be from here.** The library's
  select (`FSSelect`) has no property that reaches the control that is announced. The `aria-label` the current product
  puts on it lands on the wrapper `div`, and axe rejects that too (`aria-prohibited-attr`), so I did not copy it. Getting
  around it by casting past the component's allowed properties is the library's decision, not this product's. It is
  recorded as an inherited violation in the scan spec, with who can fix it, and logged as a component gap in
  `.dsnr/knowledge/agent-gaps.md`.
- *aria-valid-attr-value* (a person must judge): **identified.** It is the same select. MUI points it at its option list,
  which does not exist until the select is opened. Recorded the same way. It is not the tab bar.
- *document-title* (no page title): the real page already sets its title (`useDocumentTitle` in `upsertOrgPage.tsx`).
  This was a finding about the prototype's stand-alone page. The tab spec does not render the page, so this is **not
  run** for the real page: it needs the page or Cypress.
- *link-in-text-block* (new, axe could not decide): the statute link in the policy wording is underlined by CSS, which
  axe cannot judge without a browser. Recorded as inherited, **needs a browser check**.

## 4. Data

Everything here is mocked at the network, in the way Coke already mocks things (MSW, `src/mocks/`). Nothing calls a real
service.

| `@mock` in the prototype | What it really is | Where it comes from |
|---|---|---|
| Organization name and type | The organization | Already served by the existing organization mock (the shared fixture: name "a", type Law Enforcement, state Illinois). **I will not change the shared fixture**, so the page title does not say "Indianapolis Metro - PD". |
| Top bar links, account menus, sub-nav | The signed-in account | The product's real navigation. **Deleted from the move** (nothing to build). |
| Federal sharing: on, Dana Whitfield, 18 Sep 2026 | `detailsForFederalSharingOptIn` | New mock for `GET /api/v3/organization/:id/policies` |
| Search filters: Immigration (Marcus Okafor), Reproductive Health (Priya Delgado), both on, 3 of 3 networks | `searchPolicies` | Same response |
| Illinois State Policy, affirmed by Dana Whitfield, with the wording | `sharingPolicies` | Same response. The prototype leaves the wording blank, so I will write the prototype's wording into the mock. |
| Descriptions the Figma left as filler | Copy | The prototype's text, for those the product has none for. Federal Sharing and Search Filters keep the prototype's text. Where the product already has copy (the Policy Report, the Search Filters introduction) the product's is used. |
| Saving | `PUT /api/v3/organization/:id/policyForm` | New mock that answers success |
| LPR Policy | `GET /api/v1/organization/:id/lprPolicy` | New mock: no policy yet ("LPR Policy not provided") |
| Policy Report | `GET /api/v1/organization/:id/state-policy/csv` | New mock: a small CSV |

A save in design mode **is kept** (the mock remembers it until the page is reloaded) and the change is credited to the mock
account, so a reviewer sees Save do something. The sample dates are set at midday so they read the same in any time zone.

**Things a reviewer in design mode will see that differ from the prototype**, all because the product's rules apply:
the **Audit Assistance** row and the **Block Proactively Shared Networks** row appear (the prototype left them out, the
product has them; both off in the sample); the wording of the **last-changed line** is the product's ("Last updated by",
not "Last modified by"); the long **Search Filters** introduction and its link to the offense type settings are the
product's, not the prototype's one-line paraphrase;
the **Receive Federal Share Requests switch is off and disabled** (the shared networks mock has no network this
organization owns, and I am not changing that shared fixture because the Roles form also uses it); and **the Policy
Report row only appears with its flag**, which I will switch on in design mode. If you want the switch live, the
shared networks mock needs an owned network, and every caller of it has to be checked: say so and I will.

**What design mode cannot show.** The sample has one affirmed policy and two fully enabled filters, so a reviewer cannot
see, there, an unacknowledged or denied policy, the missing-networks warning, a statewide-locked filter, Audit Assistance
locked, or a tab with no State group. The unit tests cover each of those. The LPR Policy drawers' save and delete requests
are not mocked, so in design mode Add Link, Add File and Delete fail. Mocking them is a separate piece of work.

**Design-mode flags.** Three flags are on in design mode so the work can be seen: the new one, the shared networks flag (it
shows the LPR Policy row) and the state policy CSV flag (it shows the Policy Report row). The last two are read only by the
Policies tab in Coke, so no other screen changes. A test checks that every other flag stays off.

The mocks I add are for requests that **nobody mocked before** (they were refused in design mode), so no existing screen
gets a different answer. The one change to an existing mock is the flag list, where one flag turns on and every other
stays off. A test will check that.

## 5. What I will build, and where

**The change boundary.** The brief gives none, so I propose:

- `src/components/org/orgPageV2/orgPolicies/`: new files, plus one edit to `orgPoliciesFeaturesTab.tsx`
- `src/hooks/useFlockFlags.tsx`: one new flag
- `src/mocks/handlers.ts`, `src/mocks/orgPolicies.ts` (new) and `src/mocks/fixtures/orgPolicies.json` (new)
- `__tests__/src/components/org/orgPageV2/orgPolicies/` and `__tests__/src/mocks/orgPolicies.spec.ts`: new specs
- this audit, and the two logs the task says to use: `.dsnr/knowledge/agent-gaps.md` and `setup-friction.md`

**Counted as outside, and not touched:** `upsertOrgPage.tsx` (header, tab bar, labels), `orgPageV2/common/`,
`shared/tabTitle.tsx`, `common/stickyFooterActions.tsx`, every existing file in `orgPolicies/` except the one edit above,
the existing fixtures (`organization.json`, `orgNetworks.json`, and the rest), `App.tsx`, the Redux slices, `.github/`.

What gets built is in the table in section 3. The tests cover: each part, the tab choosing old or new by the flag (and
today's body being exactly what it was when the flag is off), the permission and data cases above, and an
accessibility scan of the real components (`*.a11y.spec.tsx`).

**Reused:** the settings row layout from `togglePreferenceRow.tsx` (same shape, new file because that one has no
description line and is used on other tabs); `TabTitle`; `StickyFooterActions`; `UnsavedChangesDialog`; the LPR Policy
section; the policy save, download and status-change actions; the section-heading scale from
`.dsnr/composition/view-composition.md` (h2 tab title, h3 groups, h4 sub-groups, so there is no skipped level).

**New, and why nothing existing fit:** none of the structure is a new pattern; it is existing rows in two named groups.
The settings row with a description and a "last changed" line is the nearest thing to
`togglePreferenceRow.tsx`. The open (non-accordion) state policy block has no precedent in Coke: the only existing form
is the accordion in `policyRow.tsx`.

## 6. What I will not build, and why

- **The green organization banner** and **the "Plan & Features" tab label** (decisions 1 and 2): outside the Policies
  tab.
- **The Sharing MOU row** (decision 4): nothing exists to back it.
- **The other tabs' placeholder**, and the **simulated save delay and the "not part of this prototype" snackbars**: the
  prototype's `@remove` items. The real save, download and drawers replace them.
- **The prototype's copies of the navigation, back link, tab bar, tab title and sticky footer**: the product's own are
  already on the page.
- **A new default for the Illinois organization's name** in the shared mock (section 4).
