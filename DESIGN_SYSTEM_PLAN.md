# Design System plan: surface the component library in the app, and leave room to change it

**Written 2026-10-08. Every decision is made and every unknown I could measure was measured the same day. S1 and S2 are built
(2026-10-08); S3 and S4 are not.** The plan for filling the **Design System** tab (an empty view today, `renderer/App.tsx`) with the components
from `flock-react-component-lib` (FUI), without copying Storybook and without building the editing yet.

This is the detail behind one candidate in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), which points here and does
not repeat it. **This file holds only what is still to do or decide.** What is built, and its evidence, goes to
[flock-designer.md](flock-designer.md) when a milestone is done, and leaves this file.

## What it is for

Noah, 2026-10-08: surface the components here, **do not duplicate Storybook**, and lay the framework so that, in a later
version, a component can be adjusted in this app and pushed as a pull request to the library. Version 1 therefore does
one thing: **show what is on the library's `develop` branch, and send you to Storybook, Figma and the source for the
rest.**

## Requirements that do not move

1. **The library repository is the only source of truth.** The app holds an index of it, read when the tab opens. It
   never stores a copy of a component, a story, a prop table or a screenshot. (Same rule as
   [step 1.7](flock-designer.md#17--stop-copying-the-design-system-point-at-it-was-d1): point at it, do not copy it.)
2. **Storybook stays where variations, controls and docs live.** The app links to a component's Storybook page and does
   not render it, embed it or run it in version 1.
3. **Nothing is a step someone must remember.** The catalog is read from the library as it is, and brought up to date by
   the app itself; no generate step, no committed index file.
4. **A component has one stable identity,** its folder path under `src/` (`components/FSButton`). A later edit feature,
   a branch, and a pull request all key on it, so nothing is migrated when editing arrives.
5. **Read-only.** Version 1 changes nothing in the library's files or branches, and nothing on GitHub.
6. **`develop` is the source of truth** (Noah, 2026-10-08). The catalog is `develop`'s, whatever branch the person's
   clone has checked out, and reading it never switches a branch or touches their files.

## What is known (read from both repositories on 2026-10-08)

| Fact | Where | What it means here |
|---|---|---|
| **The Design System tab is an empty `<div>`** | `renderer/App.tsx` | Nothing to replace; the section and its nav item exist |
| **A component is a folder named `FS…` under `src/components` or `src/compositeComponents`.** `src/components` also holds non-components (`index.ts`, six `.css` files, and the folder `pickerTimezone`), and one component is spelled `FsDateTimeRangePicker` | `git ls-tree origin/develop` | The reader takes folders whose name starts with `fs` in **any case**, so the odd spelling is in and the rest are out by a rule, not a list |
| **On `origin/develop`: 87 component folders in `components` and 20 in `compositeComponents`; 80 story files** (56 and 24; `icons` has 1 and `uxDocs` 2, which are not components). Every composite has a story, though some are nested (`FSInputModal/FSFormInput`) or several to a folder (`FSPopovers`) | same | A folder's stories are found **anywhere under it**, and a folder can have more than one |
| **31 of the 87 components have no story, and 25 of those are parts of a larger one** (`FSCardContent`, `FSTableRow`, `FSListItemText`). Six are real gaps: `FSApp`, `FSInputAdornment`, `FSLoadingButton`, `FSRadioButton`, `FSTab`, `FSTreeItem` | computed with the prefix rule in decision 5 | The "no story" mark can mean something if parts do not carry it |
| **All 80 story titles are plain string literals** (measured), e.g. `'Buttons/FSButton'`, `'Inputs/Composite Components/FSInputModal/FSFormInput'`, `'Components/Window/FSDynamicWindow'`, `'Popovers/PopoverHeader'` | every `*.stories.tsx` on `develop` | A text reader is enough. Titles can have two to four parts, so the group is the first part and the rest is the path |
| **`componentSubtitle` is in 71 of the 80 stories; `githubUrl` and `figmaPageUrl` are in only 30** | same | A Source link cannot depend on `githubUrl` (decision 3), and a Figma link is often absent |
| **Storybook's id rule is verified** with the library's own `toId` from Storybook: `Buttons/FSButton` is `buttons-fsbutton--docs`; `Data Display/FSAvatar` is `data-display-fsavatar--docs`; `Inputs/Composite Components/FSInputModal/FSFormInput` is `inputs-composite-components-fsinputmodal-fsforminput--docs` | `storybook/internal/csf` in the library | The link is built from the title. The tests carry these three as fixtures |
| **The hosted Storybook is Chromatic's** (`https://develop--6617f3c579abb5c5e780fddc.chromatic.com/`, built from `develop`) **and is behind a Chromatic login** (`index.json` answers with a login address) | `README.md`, `chromatic.yaml`; fetched 2026-10-08 | The app cannot check a link, and a person without Chromatic access lands on a login page. Said in the tab (decision 6); not a code problem |
| **Storybook's sidebar order is set in `.storybook/preview.tsx`:** Buttons, Inputs, Data Display, Feedback, Surfaces, Navigation, Layout, Tables | the library | The tab uses the same order, then any other group alphabetically (`Components`, `Popovers`, `Utils`) |
| **A clone's local `develop` goes stale, and it is real:** on Noah's clone the local `develop` is at 2026-09-29 and `origin/develop` at 2026-10-07, eight days apart | `git log` in the library | Decision 4: read `origin/develop`, and the app fetches it |
| **`git fetch origin develop` works with the person's own credentials** (checked with `--dry-run`), and **changes only `origin/develop`:** no local branch, no working file | the library | Safe to do on opening the tab. Fails fast on no credentials or no network, with `GIT_TERMINAL_PROMPT=0` as `git.ts` already sets |
| **The library has `.flkd/` but no `.flkd/workspace.json`,** so discovery does not list it | the library | Needs its own lookup, not a descriptor |
| **The app can already find a clone by its `origin` remote** (`originOf`, `gitHubRepoOf`) in the usual folders and the clone folder, and **can clone a named repository with progress** (`Cloner`) | `repositories.ts`, `discovery.ts`, `cloneFolder.ts`, `clone.ts` | Finding and cloning the library is reuse |
| **Reads of a ref go through `git.ts`** (argv only, `GIT_TERMINAL_PROMPT=0`, `runGit` exported) | `git.ts` | `ls-tree` and `show` need no new way to run git |
| **The renderer has only the named operations on `contract.ts`;** the window never sends a path | `shared/contract.ts` | One new operation; the library's path is found in the main process |
| **The app's GitHub token reaches only repositories the GitHub App is installed on** | [CLONE_PLAN.md](CLONE_PLAN.md) | Why the catalog reads a clone and not the API (decision 1) |
| **`typescript` is a dev dependency of the app only** | `workspace/package.json` | Parsing stories with the compiler would ship it in the main process. Decision 2 avoids that |

**Left unmeasured, deliberately:** how long a fetch takes on a slow network. It runs while the tab shows the list it
already has (decision 4), so a slow fetch costs nothing the person waits on.

## Decisions (all made; 1 and 4 by Noah, 2026-10-08, the rest settled in this plan and cheap to change before S3)

| # | Question | Decided | Why |
|---|---|---|---|
| 1 | **Where does the catalog read from?** | **A local clone of the library** (Noah: design is to contribute to the design system, so the clone is what that needs), found by its `origin` remote (`flocksafety/flock-react-component-lib`) in the usual folders and the clone folder. When there is none, the tab says so and offers the existing clone | Matches what editing needs later; no GitHub App change. A GitHub API reader is a second implementation of the same function, built only if people without a clone need the tab |
| 2 | **How are stories read?** | **The `meta` block as text,** by a small, tested reader for four string fields: `title`, `componentSubtitle`, `githubUrl`, `figmaPageUrl`. No TypeScript compiler, no running Storybook | All 80 titles are literals; a standard, documented shape; milliseconds; nothing installed in the library. A story that departs from it still appears, under its folder name in `Ungrouped`, never missing |
| 3 | **What does a row link to?** | **Storybook** (built from the title; one per story, usually one), **Figma** (`figmaPageUrl`, only when given), **Source** (always: built from the folder path, `https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/<folder>`, never from `githubUrl`) | `githubUrl` is on 30 of 80 stories; the folder path is on all of them and cannot be wrong |
| 4 | **Which branch is read, and how is it kept current?** | **`develop`, read as `origin/develop`** (Noah: `develop` is the source of truth). **The app fetches that one ref when the tab opens and when the person presses Refresh,** and reads git's copy, not the folder. No local branch and no file is touched, so the person's checked-out branch and unfinished work make no difference. The header shows `develop`, the short commit and its date, and "Updated just now" or "Could not update: <reason>, showing <date>". Branches built on top of `develop` are the later expansion of this plan | A local `develop` was measured eight days stale; reading `origin/develop` and fetching it is what makes "the source of truth" true without making anyone remember a step (requirement 3). The list shows at once from what is already there, and the fetch replaces it if it brought anything. A failed fetch (offline, no credentials) never blanks the tab |
| 5 | **Are parts (`FSCardContent`) listed?** | **Yes, under their parent, quiet.** A component with no story is a **part** when another component **with** a story has a name that is a proper prefix of it (longest match: `FSListItemText` belongs to `FSList`, `FSTableBody` to `FSTable`). It is shown beneath its parent with no "No story" mark. A component with no story and no such parent is a **gap** and is marked | Computed on `develop`: 25 parts and six gaps, which matches what the Design System owner would say by eye. The mark means something |
| 6 | **What does the tab say about Chromatic access?** | **One line under the header:** "Storybook links open the hosted Storybook, which needs Chromatic access" with nothing else. Not a check | The app cannot test a login it does not have, and a link that lands on a login page with no explanation looks broken |
| 7 | **In what order are groups and rows?** | **Groups in Storybook's order** (a short list in one place, then others alphabetically); **rows alphabetically,** parts under their parent | People know Storybook's sidebar. The list is a copy of one setting, so a new group sorts last and nothing breaks if it changes |

## Milestones

**Four small milestones, each finished, tested and committed on its own, each leaving the app working.** Same rules as
the other plans: a test first for every behaviour, one commit each, the state document updated in the same change, and
nothing on GitHub changed.

| # | Milestone | Needs | Size | Risk |
|---|---|---|---|---|
| **S1** (done) | **The catalog reader:** a pure function that turns what `origin/develop` holds into a list of components | Decisions 2, 3, 5, 7 | S | Low |
| **S2** (done) | **Finding the library, bringing it up to date, and reading it:** locate the clone, fetch `origin/develop`, read it through git; one named operation on the contract | S1, decisions 1, 4 | M | Low |
| **S3** | **The tab:** grouped list, search, links, header, the four states | S2, decisions 3, 5 to 7 | M | Low |
| **S4** | **Clone the library from the tab,** when there is no clone | S3, the existing `Cloner` | S | Medium |

### S1: The catalog reader (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In
short: `services/componentCatalog.ts`'s `readCatalog(reads)` takes two reads (every file under a folder, one file's text)
and returns `CatalogComponent[]` in the tab's order, with `isGap` for the "No story" mark and `STORYBOOK_URL` as the one
constant for the hosted Storybook. **For S2:** the reads are `git ls-tree -r --name-only` and `git show` on
`refs/remotes/origin/develop`; the real-library test in `__tests__/componentCatalog.spec.ts` already does exactly that
with `execFileSync`, and S2 moves it into `git.ts`'s runner. **Where it differs from the plan:** the field reader takes
the first `title` in the file, which on every story today is the `meta` block's; a story that put another `title:`
first would show that one, and the real-library test would catch it as a wrong group only if it changed the group.

### S2: Finding the library, bringing it up to date, and reading it (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In
short: `services/designLibrary.ts` finds the clone by its origin (`findLibrary`), reads `origin/develop` through git
(`libraryReads`, with the stories in one `cat-file --batch`), fetches only that ref (`updateLibrary`), and `DesignLibrary`
answers the new `designSystemCatalog(refresh)` channel. **For S3:** call it with `false` when the tab is first shown
(the list comes back at once, with `update: 'updating'`), then at once with `true` and replace the list with the
answer; Refresh calls it with `true`. The types are `Catalog`, `CatalogComponent` and `CatalogUpdate` in `contract.ts`;
`isGap` is in `componentCatalog.ts`, which the window cannot import, so S3 either moves it to `shared/` or repeats its
one line. **Where it differs from the plan:** `CatalogUpdate` has a fourth value, `'updating'`, for the first answer, and
`no-develop` carries the clone's path so the tab can say which clone. **Not tried:** a fetch from the real GitHub
(a `--dry-run` was, on 2026-10-08); the first open of the tab will do one.

### S3: The tab

`renderer/DesignSystem.tsx`, shown for `section === 'design-system'`. Existing UI primitives only (`ui/card`, `ui/badge`,
`ui/input`, `ui/tabs`, `ui/tooltip`).

- **Header:** "FUI", `develop` with the short commit and date, the update line (decision 4), the count, a **Refresh**
  button and the search field. Under it, the Chromatic line (decision 6).
- **Body:** components grouped, in a list, not a gallery. Each row: the name, the subtitle, and its links: **Storybook**
  (one per story), **Figma** when there is one, **Source**. A link that is not known is absent, not disabled. A gap has
  a quiet "No story" mark; a part has none and sits under its parent.
- **Filters:** All / Components / Composite, and a way to show only the gaps, which is the useful view for the Design
  System owner.
- **States, all four** (the standards require them): loading (while the first read runs), empty (nothing found,
  saying where it looked), error (the read failed, with the message), and `no-clone` and `no-develop` (what they mean and
  what to do). A failed update is **a line, not an error**: the list stays.
- **Stays mounted when hidden,** like Projects, so the search and scroll survive a visit to the other tab. It updates when
  it is first opened and when Refresh is pressed, not on every visit.
- **Links open in the system browser,** through whatever the app uses for external addresses, never in the window.
- **Tests:** rows and groups for a fixed catalog; search narrows by name and by subtitle; the gaps filter; parts
  sit under their parent and carry no mark; each of the states renders; a failed update keeps the list and shows the
  reason; a missing link renders no anchor; Refresh asks again.

### S4: Clone the library from the tab

- In the `no-clone` state, one button, **Clone flock-react-component-lib**, with the existing line under it saying where
  it goes and **Change**. It uses `Cloner` and the clone folder exactly as the New modal does, with progress and **Stop**,
  and the tab reads the catalog when it finishes.
- **Offered only if the library is on the person's GitHub list** (`visibleRepositories`), the rule `Cloner` already
  enforces; if it is not, the tab says to ask for access to it.
- **Not done here:** installing the library's packages. Reading stories needs none.
- **Tests:** the offer appears only in `no-clone`; the clone goes where `clonePlace` says; a clone that already exists is
  used, not redone; Stop leaves nothing behind (the `Cloner` tests already pin the last two, so these assert the tab
  wires them, not the behaviour again).

## What this leaves ready for editing (not built)

Nothing below is built, and nothing is shaped now except the first line.

| Later step | What it will use from version 1 |
|---|---|
| **Pick a component to adjust** | `CatalogComponent.id` (the folder path), `stories`, `partOf` |
| **Make the change with the agent** | The authoring standards already in the library (`.flkd/authoring/components.md`, `stories.md`), the same agent run as prototypes |
| **Start from `develop`** | `origin/develop`, already fetched and current; a branch for the component is made from it, as prototypes make theirs, so the catalog and the work start from the same commit |
| **See it** | Storybook running on the person's own clone (`npm run storybook`), the way a prototype is previewed; the catalog's links point at the hosted one |
| **Propose it** | A branch and a draft pull request to the library, through the existing share path (`share.ts`, `shareTools.ts`). The library's CI already publishes a Chromatic build for each pull request (`chromatic.yaml`) |
| **Review it** | The pull request's Chromatic link, and comments the way prototypes have them |

**The one question that waits for then, not now:** the library's pull requests are reviewed by the Design System owners
(`CODEOWNERS`), not the design repository's reviewers, so "comments come back into the app" is a separate question from
"open a pull request". It belongs to the editing plan.

## Out of scope for version 1

- **Editing, branching and pull requests** (above).
- **Rendering components, stories or props** in the app, or embedding Storybook. Prop tables are Storybook's.
- **Tokens, colors, icons and the `uxDocs` pages.** They are not components; a second catalog for them is a separate
  decision.
- **Any branch but `develop`, and any tagged version of the library.** Branches are the later expansion of this plan.
- **Reading the library over the GitHub API** (a person with no clone). A second reader of the same function, built if
  asked for.
- **Updating the clone's own branches.** The app fetches one ref and moves nothing. It does not pull, switch or clean.
- **A generated index file** committed in either repository (requirement 3).

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **The text reader misses a story that departs from the standard** | A component appears ungrouped or without links | All 80 pass today (measured). It still appears under its folder name, and the `Ungrouped` count is shown in the header, which is the signal for the Design System owner to fix the story. The real-library test catches it first |
| **The prefix rule calls a real gap a part, or the reverse** | The "No story" mark would lie | Six gaps and 25 parts today, asserted by name in the real-library test, so a change shows up as a failing test, not a wrong screen |
| **A Storybook link is wrong for a title** | The first thing people click | The id rule is Storybook's own `toId`, with three real titles as fixtures. **Opened once by hand against the hosted Storybook before S3 ships,** by someone with Chromatic access |
| **The hosted Storybook address changes** (Chromatic URLs are per project and branch) | Every Storybook link breaks at once | One constant in one file; the address is in the library's `README.md`, and the Design System owner is asked to say if it moves |
| **The fetch fails: offline, no credentials, a protected network** | The list could be old and look current | The header always shows the commit date, and a failed fetch is a visible line with the reason. Nothing blanks |
| **A person's git is not signed in to GitHub** | Fetch and clone both fail | Fails fast (`GIT_TERMINAL_PROMPT=0`), with the fix named (`gh auth setup-git`), as the clone plan does |
| **A person has no access to the library** | They see the tab and no components | `no-clone` says so and says whom to ask; they are no worse off than before |
| **The tab becomes a second Storybook** | The thing Noah said not to do | Requirement 2 is the test for every addition: if it shows how a component looks or behaves, it links instead |

## Next

**S1 and S2 are done. S3 is Ready:** scope fixed, files known, tests named. Build S3 and S4 in order, one commit each.

**Before S3 ships, two things by hand:** open one Storybook link from the tab against the hosted Storybook (someone with
Chromatic access), and say whether `develop`'s date in the header reads right on a clone that has not been touched for
a week.
