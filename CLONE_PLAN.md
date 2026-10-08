# Clone plan: pick a repository the app does not have yet, and say where it goes

**Written 2026-10-08; decisions made the same day (Noah accepted every recommendation). C1 is built.** The plan for letting a designer start work in a repository that is not on
their computer: choose it from the list, see where it will be placed, and have the app put it there.

This is the detail behind one item in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (*After the pilot: candidates*,
"The app clones the product repository and installs its packages"). **This file is the clone half of that item.**
Installing packages is C5 below, and may be a plan of its own. What is built stays in
[flock-designer.md](flock-designer.md); when a milestone here is done its result moves there and leaves this file.

## What it is for

**Cloning lives in the New modal, and only there** (Noah, 2026-10-08): the **New** button on the Projects screen,
which starts a prototype or codebase work and already has the Repository and "starts from" choices. That is where a
person creating a project picks a repository, and so where they clone one. No other screen clones (Build in the
codebase, Open, the review screen); they work in a repository that is already here.

Today the New modal lists every repository the person can see on GitHub, matched to its clone on this machine.
For one with no clone it says *"is not on this machine, so there is nothing here to build it from. Clone it, then …"*.
The person leaves the app, clones in a terminal into a folder the app happens to look in, and comes back. That is the
largest setup step for someone who does not live in a terminal, and it is also where a clone ends up in a place the app
cannot find. This plan keeps the whole thing in the dialog:

- **Choose the repository** (prototype or codebase work), including ones with no clone.
- **Choose what it starts from:** a branch, taken from GitHub when there is no clone yet.
- **See where it will be placed, and change it,** before anything is downloaded.
- **The app clones it,** shows progress, and carries straight on into the work.

## What is known (read from the code, 2026-10-08)

| Fact | Where | What it means here |
|---|---|---|
| **The dialog already lists GitHub's repositories** with their clone, or none | `repositories.ts` (`visibleRepositories`, `mergeRepositories`), `NewWork.tsx` | The choice exists; only the "no clone" end is missing |
| **A repository is found only in a fixed list of folders, one level deep, with `.flkd/workspace.json`** | `discovery.ts` (`ROOTS`: `Documents/GitHub`, `GitHub`, `code`, `dev`, `repos`, …) | A clone placed anywhere else is invisible to the app. **Where it goes and how it is found are one problem** |
| **Finding a repository trusts nothing.** `useCheckout` accepts only a root discovery itself found; the repository's `.flkd/workspace.json` is its command allowlist | `ipc.ts` (`trustedRoot`, `useCheckout`) | After a clone there is still an explicit accept, which is the same trust as picking a folder in the Open dialog |
| **The design repository has to sit beside the product repository** (`../flock-designer`). Without it, codebase work stops with "Clone flock-designer into the same folder" | `discovery.ts` (`recordsRootFor`), `ipc.ts` (`recordsFor`) | A clone folder holds two repositories, not one |
| **Starting work needs the base branch to exist locally** (`refs/heads/<branch>`), and to carry `.flkd/workspace.json` | `git.ts` (`branchExists`), `ipc.ts` (`createIteration`) | A fresh clone has only its default branch locally. Choosing another needs a local branch made from `origin/<branch>` first |
| **Coke's setup file is on `noah/flock-designer`, not on `develop`** | `.flkd` is absent from `develop` (open items, 2026-10-06) | A clone of Coke is not a Flock Designer repository until a branch that has the file is chosen. The app must say so, not fail later |
| **Git runs through argv only, with `GIT_TERMINAL_PROMPT=0`,** so it never waits on a password prompt in a window with no terminal | `git.ts` | A clone of a private repository either works with the person's own git credentials or fails fast, and the message has to say how to fix it |
| **Pushes use the person's own git credentials;** `gh` is used for GitHub's API (share, `flkd`) | `shareTools.ts`, `flkd.ts` | Clone should authenticate the way push does (see C2), not with the app's GitHub App token, which only reaches repositories the App is installed on |
| **A prototype needs the packages installed** to build, and says so when they are not | `prototypeReadiness` | Clone alone does not make a prototype buildable. C5 |

**Not measured:** how big the Coke clone is and how long it takes. The plan assumes a plain full clone, with a progress
bar, and looks at a partial clone only if it is slow.

## Decisions (made by Noah, 2026-10-08: all recommendations accepted)

| # | Question | Decided | Why |
|---|---|---|---|
| 1 | **Where does a clone go by default?** | A **clone folder** setting. Default: the first of discovery's folders that exists (`~/Documents/GitHub`, then `~/GitHub`, …), else `~/Documents/GitHub`, made. The person can change it with the system's folder picker, once, and it is remembered. Each repository is `<folder>/<repo name>` | Discovery already looks there, so a clone is found with no extra step, and it reads as where people already keep code |
| 2 | **Does cloning a product repository also clone the design repository beside it?** | **Yes, shown in the confirmation** ("also `flock-designer`, which holds the project records"), skipped when it is already there | Codebase work cannot start without it, and one confirmation beats a second failure |
| 3 | **How does it sign in to clone a private repository?** | **The person's own git credentials,** the same as push, with a message that says how to fix a refusal (`gh auth setup-git`, or sign in to git). One path, no token handed to git | The app's token is the GitHub App's and only reaches repositories it is installed on; the person's git already works for their work. Alternative: `gh repo clone`, which `flkd` already needs, at the cost of a second way to do the same thing |
| 4 | **What does the person confirm before a clone is trusted?** | The dialog names the repository **and its owner**, the folder, and says the app will be able to run the commands that repository lists. **One click clones and accepts it** | Choosing a repository from their own GitHub list and confirming it is the same act as picking a folder in the Open dialog, which already trusts it |
| 5 | **A repository whose default branch has no `.flkd/workspace.json`** (Coke's `develop`) | Clone it, then say plainly: "this repository has no Flock Designer setup on `develop`; `noah/flock-designer` has it" and offer the branches that do, rather than failing on Start | The branch list is the answer, and the existing check already refuses a branch without it |

## Milestones

**Five small milestones, each finished, tested and committed on its own, each leaving the app working.** Same rules as
the Pages plan: tests first (a behaviour is pinned by a test that fails without it), the app keeps working, one commit
each, the state document updated in the same change, and no data on GitHub is changed.

| # | Milestone | Needs | Size | Risk |
|---|---|---|---|---|
| **C1** (done) | **Where clones go:** the clone folder (setting, default, picker), the path a repository would be placed at, and discovery reading it | Nothing | S | Low |
| **C2** | **The clone itself:** a service that clones a named repository into a folder, with progress and cancel | C1, decision 3 | M | **Medium** |
| **C3** | **The New modal:** choose a repository with no clone, see where it goes and change it, confirm, watch it, and carry on into the work | C2, decisions 2, 4 | M | Medium |
| **C4** | **What it starts from:** branches for a repository with no clone (from GitHub), remote-only branches usable as a base, and the "no setup on this branch" answer | C3, decision 5 | M | Medium |
| **C5** | **After the clone:** say what is missing to build (packages, access to private packages), and, if wanted, install them with progress | C3 | L | **High** |

### C1: Where clones go (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In
short: `services/cloneFolder.ts` keeps the folder, gives the default, and says where a repository would go
(`clonePlace`); discovery looks there first; `cloneFolder` and `chooseCloneFolder` are the two channels. **For C3:** the
window has no use of them yet, and no channel returns a place; C3 adds both. **One refinement to decision 1:** the
default is beside the repository last worked in when there is one, since the design repository has to sit beside it.

### C2: The clone itself

- **`cloneRepository`** in its own service: a repository name that **must be one the person's GitHub list returned**
  (`owner/repo` checked against the same pattern `gitHubRepoOf` uses, then against the list), a destination from C1,
  `git clone --progress --no-recurse-submodules`, argv only, no shell.
- **Never over anything.** It creates the folder itself, and refuses a destination that exists and is not empty. On
  failure or cancel it removes **only the folder it created**, and only when it is still what it created.
- **Progress and cancel:** git's progress lines are read from its error output and passed to the window as a step and a
  percentage; cancel stops git. One clone at a time, as the agent runs one at a time.
- **Refusals in words a person can act on:** git not installed (with where to get it, on Mac and Windows), access
  refused (decision 3's message), no network, disk full, the destination taken.
- **Tests,** against a bare repository on this machine standing in for GitHub: it clones; it refuses a taken folder and
  leaves it untouched; cancel leaves nothing behind; a name not in the list is refused; a refusal says how to fix it.

### C3: The New modal

All of it in `renderer/NewWork.tsx`, the **New** modal opened from the Projects screen, in its existing Repository field
and "starts from" choice; no new screen and no second entry point.

- **A repository with no clone is chosen like any other.** Where today the dialog says "Clone it, then …", it shows
  **"Will be placed in `~/Documents/GitHub/flock-coke`"** with a **Change** button (the picker from C1), and, if the
  design repository is missing, a line saying it comes too (decision 2).
- **The confirmation names the owner and the trust** (decision 4). One button, **Clone and continue**, runs C2 with
  progress in the dialog, then accepts the repository as `useCheckout` does today, and carries on into the work the
  dialog was opened for.
- **Same for prototype and codebase work,** since both begin in the New modal. A prototype is built in the app's own
  folder, but from the repository's files, so it still needs the clone.
- **The new channel is narrow:** it takes a repository name and a choice of "use the default folder or the one picked",
  never a path from the window.
- **Tests:** the review-harness style already used for the dialog, against a fake app: choosing a repository with no
  clone shows the place and the change button; confirming calls clone once; a failure is shown and the dialog stays
  usable; a clone made is found and accepted.

### C4: What it starts from

- **Branches for a repository with no clone,** asked of GitHub (`/repos/<owner>/<repo>/branches`), so the base-branch
  choice works before anything is downloaded; the default branch first.
- **A remote-only branch can be a base.** After a clone only the default branch exists locally, and starting work needs
  a local one. Choosing another makes the local branch from `origin/<branch>` first, with no checkout, so it never
  moves the person's working branch. The list for a clone shows local and remote branches together.
- **The "no setup here" answer** (decision 5): after the clone, if the chosen base has no `.flkd/workspace.json`, say so
  and offer the branches that do, instead of failing at Start.
- **Tests:** a remote-only branch chosen as the base starts work from it and leaves HEAD where it was; a base without the
  setup file is explained, not attempted.

### C5: After the clone

**The least settled, and the highest risk,** because installing packages touches the product's private registry:

- **Say what is missing** with the existing readiness check, in the same dialog: packages not installed, or not
  installable here, and what to ask for (the candidate item already says: detect missing access to the private packages
  and say what to ask for).
- **Install with progress, if wanted.** `npm ci` in a repository the person just accepted runs that repository's install
  scripts. That is a larger trust decision than cloning, and the registry credentials are the person's own. **Do not
  decide here;** decide it when C1 to C4 are in people's hands, on what they get stuck on.

## Out of scope

- **Moving, deleting or updating clones** (pull, switching a clone's folder). The app starts work; it does not manage a
  person's repositories.
- **Repositories that are not on GitHub,** or are on a GitHub Enterprise host. The list is GitHub's.
- **Cloning to a folder the window names.** The window never sends a path.
- **Signing the person in to git.** The app says how; it does not set up credentials.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **A clone is written over something** | Losing a person's files | Only a folder the clone creates; a taken path is refused; cleanup removes only what it created |
| **Cloning is how a repository becomes trusted** | A repository's setup file is its command allowlist | Chosen from the person's own GitHub list, owner shown, one explicit confirmation (decision 4); the window never names a path |
| **The clone lands where discovery cannot see it** | The app would clone and then say it cannot find it | C1: discovery reads the chosen folder, and the clone is accepted by the app that made it |
| **Private repository, no git credentials** | The first thing a new designer meets | Fails fast (no prompt), with the fix named for Mac and Windows |
| **A very large clone** | A long wait with nothing happening | Progress and cancel; a partial clone looked at only if measured to be slow |
| **A clone of a repository with no setup** (Coke's `develop`) | "Cloned, and still cannot start" | Decision 5: said at once, with the branches that work |
| **Mac and Windows differ** (paths, git on the PATH) | One build for both is the reason the app stays | Path logic in one function with tests for both; git-missing message for both |

## Also decided (Noah, 2026-10-08)

- **The clone folder is per person.** A repository does not suggest where files go on a computer.
- **C5 is not built before the pilot reports.** C1 to C4 first; what stops people decides whether installing is built.

## Next

**C1 is done. C2 to C4 are Ready:** scope fixed, files known, tests named, no open question. Build in order, one commit each. C5 waits.
