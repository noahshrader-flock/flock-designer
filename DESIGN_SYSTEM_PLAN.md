# Design System plan: surface the component library in the app, and leave room to change it

**Written 2026-10-08. Every decision is made and every unknown I could measure was measured the same day. S1 to S3 are built
(2026-10-08); P0 (**Connect the design system**, which replaces S4) and P1 to P3 (previews) were added the same evening, at
Noah's request, and are not built.** The plan for filling the **Design System** tab (an empty view today, `renderer/App.tsx`) with the components
from `flock-react-component-lib` (FUI), without copying Storybook and without building the editing yet.

This is the detail behind one candidate in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), which points here and does
not repeat it. **This file holds only what is still to do or decide.** What is built, and its evidence, goes to
[flock-designer.md](flock-designer.md) when a milestone is done, and leaves this file.

## What it is for

Noah, 2026-10-08: surface the components here, **do not duplicate Storybook**, and lay the framework so that, in a later
version, a component can be adjusted in this app and pushed as a pull request to the library. Version 1 therefore does
one thing: **show what is on the library's `develop` branch, and send you to Storybook and the source for the rest.**

**Then previews** (Noah, 2026-10-08, evening): "I would like to actually have the preview of the component, so you can
actually see the component," the way Claude Design shows one. Previews render **the library's own stories**, from
`develop`, in the app. Nothing is copied or redrawn: a story is the library's code, run as the library's Storybook runs
it.

## Requirements that do not move

1. **The library repository is the only source of truth.** The app holds an index of it, read when the tab opens. It
   never stores a copy of a component, a story, a prop table or a screenshot. A built preview is a cache in the app's
   own folder, keyed by the `develop` commit it was built from, and thrown away when that moves on. (Same rule as
   [step 1.7](flock-designer.md#17--stop-copying-the-design-system-point-at-it-was-d1): point at it, do not copy it.)
2. **Storybook stays where controls, prop tables and docs live.** The app renders a component's stories as they are
   written, to show what it looks like (P1 to P3), and links to Storybook for everything else. It does not embed or run
   Storybook, and it never writes a story of its own.
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

**Measured for previews (a spike on 2026-10-08, built and rendered in a scratch folder, nothing written to the
library):**

| Fact | What it means here |
|---|---|
| **Portable stories work on this library.** An entry that imports a story file, `composeStories` and the library's `.storybook/preview.tsx` builds with Vite and renders FSButton's 15 stories in the FUI theme (green primary, the real variants, the icon font) | P1 is a build step, not a research project |
| **All 80 story files build in one page in 5.5 s** (7.3 MB, of which 3.9 MB is the icon font), and **all 359 stories render**, none failing to compose | One build per `develop` commit serves every component page |
| **Ten stories render blank on one shared page:** `FSDialog`, `FSDrawer` (7), `FSMenu`, `FSPipWindow`, which open into the page's body or a new window | Decision 9's one frame per story. Some (a closed menu) will still be blank until clicked, as they are in Storybook's own canvas, and a card says "Opens on click" rather than looking broken: P2 |
| **Three things the library's Storybook gets from its own setup had to be given:** a Sass compiler (some components import `.scss`), an alias for `react-image-gallery`'s stylesheet (its package hides the path), and an empty stand-in for `.mdx` files (the docs template `preview.tsx` imports) | P1's build config. Each is one line, and each is tested |
| **Vite and the React plugin were the library's own installed copies in the spike.** The app already depends on `@vitejs/plugin-react` and `electron-vite` (which carries Vite); it does not have `sass` | P1 uses **the app's own** Vite and plugin, and adds `sass` to the app, so building runs none of the library's installed tools in the app's process. The library's code runs only in the preview page, which is sandboxed (`pageView.ts`) |
| **The clone's packages are installed for whatever branch it has checked out,** not necessarily for `develop` | A dependency `develop` added since would fail the build for the components that use it: said on those cards, not as a broken tab. And a clone with no packages installed cannot build at all: P1 says so and offers the app's existing installer |

**Left unmeasured, deliberately:** how long a fetch takes on a slow network. It runs while the tab shows the list it
already has (decision 4), so a slow fetch costs nothing the person waits on.

## Decisions (all made; 1, 4 and 11 to 14 by Noah, 2026-10-08, the rest settled in this plan and cheap to change)

| # | Question | Decided | Why |
|---|---|---|---|
| 1 | **Where does the catalog read from?** | **A local clone of the library** (Noah: design is to contribute to the design system, so the clone is what that needs), found by its `origin` remote (`flocksafety/flock-react-component-lib`) in the usual folders and the clone folder. When there is none, the tab shows **Connect the design system** (decision 11): clone it, or locate a clone already on the computer | Matches what editing needs later; no GitHub App change. A GitHub API reader is a second implementation of the same function, built only if people without a clone need the tab |
| 2 | **How are stories read?** | **The `meta` block as text,** by a small, tested reader for four string fields: `title`, `componentSubtitle`, `githubUrl`, `figmaPageUrl`. No TypeScript compiler, no running Storybook | All 80 titles are literals; a standard, documented shape; milliseconds; nothing installed in the library. A story that departs from it still appears, under its folder name in `Ungrouped`, never missing |
| 3 | **What does a row link to?** | **Storybook** (built from the title; one per story, usually one) and **Source** (always: built from the folder path, `https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/<folder>`, never from `githubUrl`) | `githubUrl` is on 30 of 80 stories; the folder path is on all of them and cannot be wrong. **No Figma link** (Noah, 2026-10-08): the reader still reads `figmaPageUrl`, and the tab does not show it |
| 4 | **Which branch is read, and how is it kept current?** | **`develop`, read as `origin/develop`** (Noah: `develop` is the source of truth). **The app fetches that one ref when the tab opens and when the person presses Refresh,** and reads git's copy, not the folder. No local branch and no file is touched, so the person's checked-out branch and unfinished work make no difference. The header shows `develop`, the short commit and its date, and "Updated just now" or "Could not update: <reason>, showing <date>". Branches built on top of `develop` are the later expansion of this plan | A local `develop` was measured eight days stale; reading `origin/develop` and fetching it is what makes "the source of truth" true without making anyone remember a step (requirement 3). The list shows at once from what is already there, and the fetch replaces it if it brought anything. A failed fetch (offline, no credentials) never blanks the tab |
| 5 | **Are parts (`FSCardContent`) listed?** | **Yes, under their parent, quiet.** A component with no story is a **part** when another component **with** a story has a name that is a proper prefix of it (longest match: `FSListItemText` belongs to `FSList`, `FSTableBody` to `FSTable`). It is shown beneath its parent with no "No story" mark. A component with no story and no such parent is a **gap** and is marked | Computed on `develop`: 25 parts and six gaps, which matches what the Design System owner would say by eye. The mark means something |
| 6 | **What does the tab say about Chromatic access?** | **Nothing, for now** (Noah, 2026-10-08) | It was one line under the header; removed with the **Without a story** filter, which Noah also did not want. The **No story** badge on a gap stays |
| 8 | **How is a preview made?** | **Storybook's portable stories** (`composeStories` and `setProjectAnnotations` from `@storybook/react`, made for rendering stories outside Storybook), with the library's own `.storybook/preview.tsx`, so every story gets the FUI theme and decorators it has in Storybook. **One build of every story per `develop` commit,** with Vite, from a copy of `develop` made with `git archive` into the app's folder and the clone's installed packages; cached until `develop` moves | Measured (spike, below): every story builds in 5.5 s, the same as one, so one build serves the whole tab. `git archive` leaves no trace in the clone (a worktree would add one to its `.git`). No Storybook server, no second copy of anything |
| 9 | **Where is a preview shown?** | **Click a component, and it opens on its own page in the tab:** its name, subtitle and links, then **each of its stories as a card**, named, rendered live, each in its own frame. Back returns to the list where it was | One frame per story, as Storybook's own preview does: a dialog or drawer renders into the page's body, so on a shared page they cover each other (the spike showed 359 stories, ten of them blank because they open into the body). A frame also keeps one broken story from taking the others down |
| 10 | **Pictures in the list itself?** | **Not yet.** After P2 is used, P3 adds a small picture of each component's first story to its row, taken once per `develop` commit | The list stays fast and useful without them; the component page is where seeing it matters. Pictures cost a render of every component, which is worth doing once people have asked for it |
| 11 | **How does the tab get a library when it has none?** | **A centred "Connect the design system" screen, laid out like the GitHub sign-in,** with two tabs: **Clone** and **Locate** (P0). Whichever is used, the connection is **remembered** (the folder's path, in the app's own settings, as the checkout and the clone folder are) and checked every time the app starts | Noah, 2026-10-08: connecting is something a person does on purpose, once, like signing in, and the app remembers it. Locate lets someone who already has the library anywhere on the computer use that clone, and Clone gives everyone else one with no terminal |
| 12 | **Does the app still find a clone by itself?** | **Yes** (Noah, 2026-10-08), **as a convenience.** What is remembered wins; otherwise a clone of the library in the clone folder or the usual places is used, with no screen. The Connect screen shows only when neither exists, or the remembered folder is gone | A designer with the library already in `~/Documents/GitHub` should not have to say so, and Noah's own reason: **a connection can be removed and replaced later,** which a find-by-itself rule does not get in the way of. Finding trusts nothing: the app only reads git's copy of `develop` from it (decision 4) |
| 13 | **What may be connected?** | **The design system library, and nothing else; no forks** (Noah, 2026-10-08). It is recognised in **one place**, `isDesignSystem`, over a short list of accepted repositories with one entry, `flocksafety/flock-react-component-lib`: **by name** when a repository is chosen in Clone (so nothing is downloaded that would be refused), and **by the folder's `origin`** when one is located or found (any remote form, any case, any folder name). A clone of a fork has a different `origin`, so it is refused with the others | The tab shows one library, and a refusal comes before anything is built on a wrong folder. A second design system later is one more line in that list, not a new rule |
| 14 | **What does Clone offer?** | **The New modal's own repository picker and clone panel, reused as they are** (Noah, 2026-10-08): the same `SearchSelect` of the person's repositories, the same place line with **Change**, the same progress and **Stop**, the same `clonePlan`, `cloneFolder` and `cloneProgress`. They are moved out of `NewWork.tsx` into shared components, so there is one of each. **Choosing a repository that is not the design system** is said at once ("That is not the design system library"), before any clone is offered; choosing the library offers **Clone** | One clone picker in the app, as Noah asked. The detection (decision 13) happens on the name, which is known before a byte is downloaded |
| 7 | **In what order are groups and rows?** | **Groups in Storybook's order** (a short list in one place, then others alphabetically); **rows alphabetically,** parts under their parent | People know Storybook's sidebar. The list is a copy of one setting, so a new group sorts last and nothing breaks if it changes |

## Milestones

**Small milestones, each finished, tested and committed on its own, each leaving the app working.** Same rules as
the other plans: a test first for every behaviour, one commit each, the state document updated in the same change, and
nothing on GitHub changed.

| # | Milestone | Needs | Size | Risk |
|---|---|---|---|---|
| **S1** (done) | **The catalog reader:** a pure function that turns what `origin/develop` holds into a list of components | Decisions 2, 3, 5, 7 | S | Low |
| **S2** (done) | **Finding the library, bringing it up to date, and reading it:** locate the clone, fetch `origin/develop`, read it through git; one named operation on the contract | S1, decisions 1, 4 | M | Low |
| **S3** (done) | **The tab:** grouped list, search, links, header, the four states | S2, decisions 3, 5 to 7 | M | Low |
| **P0** | **Connect the design system:** the centred screen with **Clone** and **Locate**, and a connection that is remembered. **Replaces S4** | S2, S3, decisions 11 to 14 | M | Medium |
| **P1** | **Build the previews:** one page of every story from `develop`, cached by commit, one story per address | P0, decision 8 | M | **Medium** |
| **P2** | **The component page:** click a row, see its stories as live cards | P1, decision 9 | M | Medium |
| **P3** | **Pictures in the list:** a small picture of each component on its row | P2, decision 10 | M | Low |

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

### S3: The tab (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In
short: `renderer/DesignSystem.tsx`, mounted in `App.tsx` and kept mounted while hidden; the toolbar, the Chromatic line,
search, the kind tabs, **Without a story (n)**, grouped rows with their links, and every state; the two-step first read
and Refresh. **For P0:** the `no-clone` state is a `Notice` in `DesignSystem.tsx` saying to clone it by hand; P0 replaces
it with the Connect screen and, when a connection is made, calls the same first read again. **Where it differs from the plan:**
none in what it does. The `Ungrouped` count the risks table mentions is not a separate figure in the header: a
component with no readable title appears in an **Ungrouped** group like any other, with its count beside the heading.
**Not seen in the running app yet** (Noah's own session was running; nothing was launched against his settings).

### P0: Connect the design system

**Replaces S4**, which was only a clone button. What the person sees, laid out like the GitHub sign-in (`SignIn.tsx`):
centred in the space under the bar, a heading **Connect the design system**, one line saying what it is for ("Flock
Designer reads the component library from a copy on this computer"), and two tabs under it.

- **Clone** (the default when the library is not on the person's computer, which is what a new designer has): the
  **same repository picker and clone panel as the New modal** (decision 14), not a copy of them.
  - The picker lists the person's repositories, with the library found for them (it is the one entry the tab accepts).
    Choosing anything else says "That is not the design system library" under the picker and offers nothing.
  - Choosing the library shows **where it will go** (`~/Documents/GitHub/flock-react-component-lib`) with **Change**,
    which opens the system's folder picker and sets the clone folder every clone uses, and **Clone**. Progress and **Stop**
    while it runs. When it finishes the connection is made, and the screen is replaced by the list.
  - A clone already there is used, not redone; anything else in the way is said and never cloned over (`clonePlan`,
    `notClonedOver`). A library not on the person's GitHub list is not in the picker, so the screen says to ask for access.
    A refusal from git (not signed in, offline, no space) is said in the existing words.
  - **What changes underneath:** `NewWork.tsx`'s `CloneHere` and `Working` move to their own file and the repository
    picker's loading and clone logic into one hook, used by both screens. `clonePlan` returns no design repository for the
    design system (nothing to put beside it). A new `cloneDesignSystem(repository)` clones through the same `Cloner`, but
    refuses anything `isDesignSystem` does not accept, and does not look for Flock Designer setup, open the clone as a
    product checkout, or clone the design repository: the library is read, not worked in.
- **Locate:** a line ("Choose the folder on this computer where you cloned the library") and a **Browse** button,
  which opens the system's folder picker **in the main process**: the window never names a folder. The folder is checked
  before anything is connected (decision 13), and said in words if not: not a git repository; a clone of a different
  repository (named), including a fork; the right repository but with no `develop` on GitHub's side to read. On success it is connected and
  the screen is replaced by the list.
- **The connection** (`designSystem.json` in the app's settings folder, beside `checkout.json`): the folder's path,
  kept as a hint and **re-checked on every read**, as the checkout is. If it is gone, moved, or no longer a clone of the
  library, the tab treats it as not connected, says so on the Connect screen ("The folder you chose before is no longer
  there: <path>"), and falls back to finding one (decision 12) before showing the screen.
- **The contract:** `designSystemCatalog` is unchanged. Its `no-clone` answer gains `lost: string | null` (a folder that
  was connected and is gone). Two new operations: `locateDesignSystem(): Result<boolean>` (picker, check, connect; false
  if the person cancels) and `cloneDesignSystem(repository): Result<null>` (the repository is checked by name, then
  cloned and connected; progress on the existing event; Stop is the existing `cancelClone`). Both are added to `contract.ts`, `CHANNELS`, the preload and `ipc.ts` with `guard`.
- **What it does not do:** install the library's packages (reading stories needs none; previews, P1, do), **remove or
  replace a connection** (Noah, 2026-10-08: not now; later a connection can be removed and a new one put in), or connect
  more than one library.
- **Tests:** **services:** a folder that is a clone of the library connects, with any remote form and any case; a folder
  that is another repository, a plain folder, a folder with no `.git`, and a clone of a fork are each refused with their
  own words and connect nothing; the connection is remembered and read back; a remembered folder that is gone gives
  `lost` and the screen, and one that still exists is used with no screen; a remembered folder wins over one found by
  itself; a connection that no longer points at the library is dropped. **Clone:** it clones the library and only the
  library into the clone folder, connects it, and clones no design repository; **any other repository, including a fork
  of the library, is refused by name with nothing made and nothing downloaded**; a library not on the list is refused with
  nothing made; a taken folder is refused and left alone; Stop leaves nothing behind (the `Cloner` tests already pin
  these, so the new ones assert the wiring). **IPC:** the window sends no path to either operation, and the picker's
  result is checked before it is connected. **Screen:** the Connect screen shows in `no-clone` with Clone as the default
  tab, and Locate switches to Browse; the picker is the New modal's (the same component, tested once for both), and
  choosing another repository says so and offers no button; Change opens the clone folder picker; progress and Stop show and work; a refusal's
  words are shown; on connecting, the list replaces the screen with no second click; `lost` is said. **The New modal's own clone tests all
  still pass unchanged**, which is what proves the sharing. **Seen by Noah before it is marked done:** Clone from nothing, Locate on the real clone, and a connection surviving a restart.

## Settled before P0 (Noah, 2026-10-08)

Clone reuses the New modal's picker and clone panel (decision 14); the app still finds a clone by itself (decision 12);
no forks (decision 13); and removing or replacing a connection is not in P0, but is expected later, which is why
decision 12's automatic find stays out of its way. Nothing is open.

### P1: Build the previews

New `services/storyPreviews.ts`, in the main process.

- **The copy:** `git archive <origin/develop commit> src .storybook package.json` unpacked into the app's own folder
  (`<userData>/story-previews/<commit>/`), with `node_modules` a link to the clone's. Nothing is written in the clone.
- **The entry:** generated, importing every story file from S1's catalog, `composeStories` and `.storybook/preview.tsx`.
  The page reads its address (`?story=<file>:<export>`) and renders that one story, alone, in a small error boundary
  that shows the error instead of a blank. `?component=<id>` lists the component's stories for P2.
- **The build:** the app's own Vite and `@vitejs/plugin-react`, plus `sass` added to the app, the `react-image-gallery`
  alias and the `.mdx` stand-in. Run in a child process, so a slow build never blocks the window. One build at a time
  per commit; a second ask waits for it.
- **The cache:** a build is kept for its commit and served by the app's existing `PrototypeServer` on `127.0.0.1`. When
  `develop` moves, the next ask builds the new commit and the old folder is removed.
- **What it says:** building (with how long the last one took), built, or why not: no packages installed in the clone
  (with **Install packages**, the existing installer), or the build's own error.
- **One new operation,** `storyPreview(): Promise<Result<StoryPreviews>>`: `{ state: 'building' } | { state: 'ready';
  base: string } | { state: 'no-packages' } | { state: 'failed'; error }`. `base` is the local address; the window
  adds `?story=` itself and sends nothing else.
- **Tests:** against a small library made in the test (a bare `develop` with two components, one importing `.scss`, one
  story that throws), with packages linked from the app's own `node_modules`: the build renders each story alone at its
  address; a throwing story shows its error and the other renders; the cache is reused for the same commit and rebuilt
  for a new one, and the old one removed; no packages gives `no-packages`; the clone's files, branches and `.git` are
  untouched (compared before and after). **One test against the real library** (skipped when it is not here): every
  story file composes.

### P2: The component page

- **Clicking a row** opens the component in the tab: a back arrow, the name, the subtitle, **Storybook** and **Source**,
  then **a card for each story**: its name (`Default`, `All Variants`, spaced from the export's name) and the story,
  live, in its own frame, as tall as it renders.
- **The frames live in one preview view,** the sandboxed native view prototypes already use (`PageView`), showing a page
  the app serves (`?component=<id>`) that holds the cards. The window draws the header; the view draws the stories.
  Going back hides the view and returns to the list at the same scroll and search.
- **While building:** the page says so with the component's name; it shows the cards when the build is ready, without
  being asked again. **No packages** and **failed** are said on the page with what to do.
- **A story that is blank until clicked** (a closed menu or dialog) says "Opens on click" under its card; one that fails
  shows its error in its card, and the rest still render.
- **Tests:** a click opens the component and Back returns to the list where it was; each state; the view is asked for
  the right address and shown, then hidden; and, in the real app against a made library, a card for each story that
  rendered. **Seen by Noah before it is marked done.**

### P3: Pictures in the list

- After a build, the app takes a picture of each component's first story in an offscreen view, kept beside the build
  for that commit, and each row shows it small, at the left. A component with no story, or whose story is blank until
  clicked, shows none.
- **Not specified further until P2 has been used:** whether people want it is the question it answers.

## What this leaves ready for editing (not built)

Nothing below is built, and nothing is shaped now except the first line.

| Later step | What it will use from version 1 |
|---|---|
| **Pick a component to adjust** | `CatalogComponent.id` (the folder path), `stories`, `partOf` |
| **Make the change with the agent** | The authoring standards already in the library (`.flkd/authoring/components.md`, `stories.md`), the same agent run as prototypes |
| **Start from `develop`** | `origin/develop`, already fetched and current; a branch for the component is made from it, as prototypes make theirs, so the catalog and the work start from the same commit |
| **See it** | P1's preview build, run on the person's branch instead of `develop`: the same page, the same cards, showing the change |
| **Propose it** | A branch and a draft pull request to the library, through the existing share path (`share.ts`, `shareTools.ts`). The library's CI already publishes a Chromatic build for each pull request (`chromatic.yaml`) |
| **Review it** | The pull request's Chromatic link, and comments the way prototypes have them |

**The one question that waits for then, not now:** the library's pull requests are reviewed by the Design System owners
(`CODEOWNERS`), not the design repository's reviewers, so "comments come back into the app" is a separate question from
"open a pull request". It belongs to the editing plan.

## Out of scope for version 1

- **Editing, branching and pull requests** (above).
- **Embedding or running Storybook, and controls or prop tables.** Previews render the stories as written; changing
  their arguments is Storybook's.
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
| **A person has no access to the library** | They see the tab and no components | The Connect screen's Clone tab says to ask for access, and Locate still works if they have a copy; they are no worse off than before |
| **A connected folder is moved or deleted** | The tab would show an error or nothing | The connection is re-checked on every read; a missing folder returns the Connect screen with what was lost, never a blank tab |
| **Locate connects something that is not the library** | The tab would show the wrong list | Decision 13: the folder's `origin` is checked before it is connected, and again on every read |
| **The tab becomes a second Storybook** | The thing Noah said not to do | Requirement 2 is the test for every addition: previews show the stories as written, and anything about controlling or documenting them links to Storybook |
| **A preview build fails on `develop`** (a dependency `develop` added that the clone has not installed, or a story that only builds in Storybook's own setup) | No previews at all, or blank cards | One build fails as a whole: the page says so with the error and **Install packages**. A single story that throws is shown with its error in its own card. The real-library test runs every story file |
| **Building runs code** | Trust | The app's own Vite, plugin and Sass run in its process; the library's code runs only in the sandboxed preview view, which has no bridge to the app (`pageView.ts`), as prototypes do |
| **A build is slow or large** | A wait the first time, and disk | 5.5 s measured; built once per `develop` commit, in the background, with the old one removed. 7.3 MB a build |

## Next

**S1 to S3 are done. P0 is Ready:** scope fixed, files known, tests named, nothing open. Then P1, P2 and P3. P1 needs P0
only because it needs a connected library; P3 waits for P2 to be used.

**By hand, Noah:** look at the tab in the running app (built, not yet seen), and open one Storybook link from it (it
needs Chromatic access).
