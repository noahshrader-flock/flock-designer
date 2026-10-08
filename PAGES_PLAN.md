# Pages plan: prototypes on a link, with the app's comments

**Written 2026-10-07.** The plan for publishing prototypes to private GitHub Pages, so a teammate opens a link and
comments with the same experience as the app: marker pins, the inline comment box, the comment side panel. Every
comment goes to the same GitHub issue the app already reads, so a comment made on the page shows up in the app.

This is the detail behind one item in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (*After the pilot:
candidates*). What is built and how it works stays in [flock-designer.md](flock-designer.md); when a phase here is
done, its result moves there (Appendix B, with its evidence) and leaves this file, as for every other item.

## What it is for

The design-team channel asked, on 2026-10-07, how to share prototypes with people who do not have Claude access:
PMs and directors. The answers were "get them access," "record a Loom" and "export as HTML." None keeps the
conversation attached to the prototype, and the HTML file and hosted-link routes put Flock's product UI somewhere
else. This plan keeps everything inside the company's GitHub:

- **A prototype gets a link.** In the app, a prototype with a published page shows **Open page** at the top of the
  review screen, beside the iteration switcher. It opens the page in the browser.
- **The page has the app's comments.** The same pick tool (hover outline, arrow keys to climb to a container), the
  same numbered pins, the same inline comment box, the same side panel of cards.
- **Comments are GitHub issue comments,** on the prototype's existing review thread, in the app's own format. The
  app re-reads comments every minute and whenever its window comes back into focus, so a comment made on the page
  appears in the app with nothing new to build for syncing.
- **The agent hands back the link.** A prototype made from Claude Code in VS Code is packaged and published by the
  agent itself, and its final summary includes the link, so the link exists without opening the app.
- **Discovery, not delivery.** This is for prototypes. Codebase work stays reviewed through engineering's own pull
  requests and preview links ([flock-designer.md, Vocabulary](flock-designer.md#vocabulary)).

## Two requirements that do not move

1. **Viewing a page requires signing in to GitHub, and having access.** A prototype page is never public. Only a
   person who is signed in to GitHub and has read access to the design repository can open it; anyone else gets a
   sign-in or a "not found." This is private GitHub Pages (visibility **private**, not public), and the plan treats it as
   a gate, not a setting to hope is right: the publish step checks it before any link exists (M5b).
2. **The agent that makes a prototype hands back the link.** Whether it was started from the app or from Claude Code
   in VS Code, it finishes by packaging and publishing the prototype, and its final summary includes the link and who
   can open it. Nobody has to remember a step (M2 and M6).

3. **A prototype always has a page, and the page follows the project.** Making a prototype is not finished until it
   has a page, and that is done by the app and the agent, never left for someone to remember. The site mirrors the
   project structure in the design repository, so every iteration of a project sits together:

   ```text
   /                            index of projects
   /<project-id>/               the project: its versions side by side, each with its iterations
   /<project-id>/v1/i1/         version 1, iteration 1 (the prototype, with its comments)
   /<project-id>/v1/i2/         version 1 after a refinement
   /<project-id>/v2/i1/         a different idea for the same brief: version 2
   /<project-id>/v1/latest/     the newest iteration of version 1, so a link shared once never goes stale
   /<project-id>/latest/        the selected version's newest iteration, or the newest version's if none is selected
   ```

   **A version is a different idea; an iteration is a refinement of one version.** The two words are used strictly
   (M1).

**A consequence worth stating:** requirement 1 cannot be met from a public repository, because a public repository's
Pages site is public. The sandbox's site reported `"public": true` for exactly that reason. The publish step's check
refuses to give out a link while the repo or its site is public.

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| **Who can view or comment** | **Anyone who views or comments has signed in to GitHub.** There is no anonymous path (Noah, 2026-10-07) | Prototypes show the product's UI and are for the company; viewing is private Pages, commenting is a signed-in action |
| **Versions and iterations** | A **version** is a different idea for the same brief (V1, V2, V3); an **iteration** is a refinement of one version (I1, I2, I3). Page addresses are `/<project>/v1/i2/` (Noah, 2026-10-07) | A designer explores several ideas and then refines one. One flat count could not say which iteration belonged to which idea |
| **When a new iteration starts** | An iteration is frozen once someone other than its author comments on it; the next change becomes the next iteration of that version (recommended 2026-10-07, accepted for small iterations) | Keeps what people commented on intact without an iteration per comment, and needs no step from anyone |
| **Getting the org repo and private Pages** | In hand: Noah is handling the request with the GitHub admins (2026-10-07) | M0 |

**Recommended, not yet confirmed:** publish from `main`; the publish command waits up to about three minutes for the
deployment; one allowed publish command in a settings file that ships in the repo; GitHub's own notifications plus a
check when the agent starts; an "unpublish" command; no analytics; a plain link to the code's branch or pull request on
the project page; the viewer readable on a phone but not built for commenting from one; a slim bar above the prototype
as the trigger; no mark on comments made on a page. **The sign-in for everyone** is recommended to be a small
stateless sign-in service, needing security's approval, with the extension as the fallback.

## What is known (checked on 2026-10-07)

| Fact | How it was checked | What it means here |
|---|---|---|
| **The `flocksafety` org is on GitHub's Enterprise plan** | `gh api orgs/flocksafety` | Private Pages, visible only to people with access to the repo, is possible. **Whether the org allows it is not known** |
| **The design repo is under a personal account** (`noahshrader-flock/flock-designer`) | `gh api repos/...` | A personal account cannot publish private Pages. The repo has to move into the org first |
| **The design team has no repo access in the org** | `gh api orgs/flocksafety/teams/design/repos` (0 repos) | Teammates will need read access to the design repo to open its pages |
| **A built prototype runs from a static host** | Rendered `admin-usage` i1 from a single file, and a sandbox page from a public Pages URL | Pages can serve prototypes as they are saved today. The React runs in the viewer's browser |
| **A saved page has one outside reference**: the design system's fonts, at the absolute path `/_shared/<hash>` (5 MB) | Read from `projects/admin-usage/prototypes/i1.html` | On Pages the site is served from a sub-path, so the publish step has to rewrite that path or inline the file |
| **GitHub's API accepts calls from a web page** (`access-control-allow-origin: *`) | Preflight to `api.github.com/.../issues/1/comments` | A page can read and post comments, **if it has a token** |
| **GitHub's sign-in endpoints refuse calls from a web page** (no CORS) | Preflight to `github.com/login/device/code` and `/login/oauth/access_token` | A page cannot sign a person in by itself. This is the one problem the plan has to solve with something other than the page |
| **Signing in to view a private Pages site does not give the page a token** | **Not tested.** From how GitHub's private Pages sign-in works: the session is a cookie for the Pages host, not an API token | Even private, a reviewer still needs a way to sign in for the comments |
| **Reading comments on a private repo needs a token too** | GitHub's rules for private repositories (an unauthenticated read of a private repo is refused) | Without sign-in, a private page shows the prototype but no comments |
| **Pages tells browsers to keep a page for 10 minutes** (`cache-control: max-age=600`) | Response headers, and a stale page seen in testing | A link to a new iteration must not look unchanged; the link carries a version |
| **The app's comment engine is pure code** | `shared/anchor.ts`, `shared/comments.ts` and `main/services/pageScripts.ts` import only types | It runs in a browser unchanged; the sandbox drew the app's own pin from a real comment |
| **The app's comment experience is not** | The side panel, cards, card menu, comment box and pin dragging are inside `renderer/Review.tsx` (about 1,200 lines), mixed with the native preview, IPC and agent runs | It has to be taken out into its own components before a page can use it |
| **Claude Design, per its product page (claude.com/product/design, read 2026-10-07):** "included in all paid plans; admins must turn it on in Organization settings." It imports a design system from "GitHub repo, design files, or raw uploads," and "builds with your components, checks its output against your design system, and makes corrections before you see it." "Admins can lock a team to a single approved design system." "Every artifact gets a link, private by default until you're ready." It "hands off to Claude Code" with `/design-sync` and `/design`; exports PowerPoint, PDF or HTML. **The page does not state:** who can comment or view, security, compliance or data-residency terms, whether it pushes to GitHub, or whether it is generally available | Fetched and summarised from the page; what it does not say is not the same as what it does not do | **It covers more of this plan than was assumed:** real components from a repo, an admin-set design system, private links, a bridge to Claude Code. It is not yet approved for use at Flock, so importing the real repo into it is not an option until it is. What it does not say is exactly where this plan differs (history and comments in your own GitHub, versions, the audit of what a prototype faked, Flock's own handoff checks) |
| **The Pages API says whether a site is public** (`"public": true` on the sandbox's public site) | `gh api repos/noahshrader-flock/prototype-pages-sandbox/pages` | The publish step can check this before it hands out a link |
| **The app publishes only `projects/`, as plain pushes, to the design repo's current branch** | Read from `designSync.ts` and `publisher.ts` | The Pages deployment has to run from that branch, or from a workflow that is allowed to. GitHub restricts Pages deployments to the default branch unless the environment allows others (GitHub's default; **not checked here**) |
| **The prototype skill ends at "say what you made."** Nothing publishes, and the build command is injected by the app | `skills/build-prototype.md`; `prototypeBuildPlan` in `ipc.ts` | From Claude Code in VS Code there is no app to supply the build command or push, so both have to live in one command that does not need the app |
| **A comment made in the page's format reads back through the app's own code** | The app's `renderComments` turned a sandbox comment into the `comments.md` the agent reads, with page, element kind, section, selector and nearby text | The format is right; the round trip into the app itself is what M8 proves |
| **The app finds a prototype's thread by the `branch:` line** in the issue's description (for a prototype, `prototype/<id>/<name>`) | `designRepo.ts` | The page posts to the thread that already exists for that iteration, never a new one |

**What the sandbox taught (2026-10-07).** A public test repo (`prototype-pages-sandbox`) proved publishing and
reading comments back, but its commenting was a thin layer of its own around the app's engine: a native prompt for a
token, no pin dragging, no cards or card menu, no screenshot. That was not the product's experience, and it is the
reason M4 exists: **one comments experience, two adapters**, never a second copy of it.

## The shape of it

```text
             the app (Electron)                          the page (GitHub Pages)
   ┌──────────────────────────────────┐        ┌──────────────────────────────────┐
   │ Review screen                     │        │ The prototype, and around it:     │
   │  └─ Comments  (shared components) │        │  └─ Comments  (the same components)│
   │       pins · inline box · panel   │        │       pins · inline box · panel   │
   │       uses: Electron adapter      │        │       uses: browser adapter       │
   └──────────────┬───────────────────┘        └──────────────┬───────────────────┘
                  │  IPC → GitHub API                          │  GitHub API (with a token)
                  └──────────────► the iteration's review issue ◄──────────────┘
                                   (comments in the app's format)
```

- **Shared:** the comment format and its sanitizer (`anchor.ts`), numbering and markers (`comments.ts`), the pick and
  pin scripts (`pageScripts.ts`, moved to `shared/`), and the comment components themselves.
- **Two adapters**, each implementing two small interfaces:
  - **Comments:** read, post, resolve, delete, move a pin, and who the viewer is.
  - **The page surface:** pick an element, show pins, focus a pin, report a pin's click or move, and take a picture
    of the spot.
  - The **Electron adapter** is what the app does today (IPC, the native preview, `capturePage`).
  - The **browser adapter** calls the GitHub API directly and runs the pick and pin scripts in the page itself.
- **Not in the page:** Address, Hand off, Build in the codebase, and anything that runs an agent. Those stay in the
  app, which is where the agent and the checkout are.

## How the work is cut

**Ten milestones, each small enough to finish, test and commit on its own, and each leaving the app working.** None
depends on a later one. Sizes are estimates for the work, to be corrected after M1: **S** is a few hours, **M** about a
day, **L** several days.

**Rules for every milestone**
- **Tests first.** Before code moves, the behavior being kept or added is pinned by tests that fail without it.
- **The app keeps working** after each milestone: the existing tests pass, and nothing the app does today changes
  unless the milestone says so.
- **One commit per milestone,** with the plan and `flock-designer.md` updated in the same change: the finished
  milestone moves to the state document with its evidence, and leaves this file.
- **No data on GitHub is edited** by a milestone unless it says so and says how to undo it.
- **A milestone is Ready** when its scope is fixed, the files it touches are known, its tests are named, its done-when
  can be seen, and no open question blocks it. The table below says which are.

## Order of work

| # | Milestone | Needs | Size | Risk | Ready? |
|---|---|---|---|---|---|
| **M0** | **The asks:** org repo, private Pages, access, security (in parallel, not code) | Admins, security | n/a | n/a | **In progress, Noah** |
| **M1** | **The version model in code** (`v1-i2`; old names read as V1) | Nothing | M | Low | **Done 2026-10-08**, see [flock-designer.md](flock-designer.md#change-log) |
| **M2** | **Make prototypes without the app** (new-prototype and build-and-save as shared commands) | M1 | L | Medium | **Done 2026-10-08** (its real run is Noah's), see [flock-designer.md](flock-designer.md#change-log) |
| **M3** | **Address starts the next iteration** when the current one has outside comments | M1, M2 | M | Medium | **Done 2026-10-08** (its real run is Noah's), see [flock-designer.md](flock-designer.md#change-log) |
| **M4** | **One comments experience,** taken out of the review screen | M1 | L | **High** | **Done 2026-10-08** (its manual run is Noah's), see [flock-designer.md](flock-designer.md#change-log) |
| **M5a** | **The site, assembled locally:** project pages, `latest` links, index | M1 | M | Low | **Done 2026-10-08** (Noah's look is his), see [flock-designer.md](flock-designer.md#change-log) |
| **M5b** | **Publish for real:** the publish command, the deploy, **Open page** | M2, M5a (M0 for the private result) | L | Medium | **Built and run 2026-10-08**, see [flock-designer.md](flock-designer.md#change-log) |
| **M6** | **The agent hands back the link** | M2, M5b | S | Low | **Built 2026-10-08**, see [flock-designer.md](flock-designer.md#change-log) |
| **M7** | **Comments on the page** (shared components, browser adapter, test sign-in) | M4, M5b | L | Medium | **Built 2026-10-08**; its real run needs the site published, see [flock-designer.md](flock-designer.md#change-log) |
| **M8** | **The round trip, proved** | M7 | S | Low | **Built 2026-10-08**; the hand run is Noah's, see [flock-designer.md](flock-designer.md#change-log) |
| **M9** | **Signing in for everyone** | M0 (security), M7 | L | **High** | **Decided: a small sign-in function; waiting on approval** |
| **M10** | **Parity and the smaller things we agreed** | M7 | M | Low | Later |

**M1 to M5a are done, and M5b to M8 are built (2026-10-08).** The site is published (public while the repo is). The private result waits on M0. M9 is decided and waits on approval. Next: M10.

**The repo is public for now (Noah's decision, 2026-10-07), so the whole flow can be built and tested before the admins
answer.** Public Pages needs no login to view, so what it cannot show is that an anonymous viewer is blocked. That
single result is what M0 unlocks, by moving the repo into the org as a private repository with private Pages.
**The fastest path to seeing it work end to end:** M1, then M2, then M5a, then M5b, then M6
(a prototype becomes a link, handed back by the agent); then M4, M7 and M8 (comments on the page, reaching the app).
M9 is a decision and is not needed for the test: testers use a token.

```text
M0 (asks, in parallel) ─────────────────────────────┐
                                                    ▼
M1 versions ─┬─► M2 commands ─► M3 address ─►      M5b publish ─► M6 agent link
             ├─► M4 comments extraction ───────────► M7 page comments ─► M8 round trip ─► M9 sign-in ─► M10
             └─► M5a site assembly ──────────────────┘
```

## Milestones

### M0: The asks (other people, in parallel throughout)

| # | Item | Who | Status |
|---|---|---|---|
| 0.1 | Move `flock-designer` into the `flocksafety` org, private, with **Maintain** for Noah | An org owner | **Noah is handling it (2026-10-07)** |
| 0.2 | Confirm the org allows **private** GitHub Pages, and that Noah can publish from that repo | GitHub admin | With 0.1 |
| 0.3 | Give the **design** team read access to the repo, so teammates can open its pages | GitHub admin | With 0.1 |
| 0.4 | Which branch publishes (`main`, recommended), and whether designers can push `projects/` to it | GitHub admin | With 0.1 |
| 0.5 | Confirm the Pages site can be set to **private** (access limited to people with read access) | GitHub admin | With 0.2 |
| 0.6 | **Security's view on a small sign-in service** for commenting (see M9). The longest lead item, so it starts now | Security / platform | Not started |
| 0.7 | Install the app's GitHub App on the repo in its new place, and point the app at it | Claude, once 0.1 is done | Not started |
| 0.8 | **Delete the public sandbox repo** (`noahshrader-flock/prototype-pages-sandbox`). Its page bundles the app's pick and pin code | Claude, on Noah's word | Waiting on Noah |

**Done when:** the repo is in the org, private Pages is allowed, the design team can read it, and the app works
against the repo in its new place.

### M1: The version model in code (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08) and its
Vocabulary. In short: names are `v<version>-i<iteration>`, read in one place; older `i1` names are version 1 with nothing
migrated; a new prototype on a project is its next version; the switcher groups by version. **Refinements (`v1-i2`)
are not made yet**: M3 makes them, with the freeze rule.

### M2: Make prototypes without the app (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08) and its
3.7. In short: one service makes prototypes, called by the app and by `flkd` (`new-prototype`, `save-prototype`), which
an agent runs from Claude Code in the product repository. Its own skill, `skills/start-prototype.md`, says how,
including "another version" and "based on V1", and Coke's agent file sends a new prototype there.

**The open question was answered differently from the recommendation:** not a pre-built file committed in the repo,
but a launcher that builds the command from the app's source each time it runs. The build needs esbuild either way,
and no product repository has it (Coke's Vite uses Rolldown), so the app's install is needed anyway; this way there is
no built copy to go stale.

**What is left of "done when" is Noah's:** the real run. In Coke on `noah/flock-designer` (it has the new routing), ask
Claude Code for a prototype, then for another version, and check both open in the app. It writes to the real design
clone, and the app publishes it to the public repo the next time it is open.

### M3: Address starts the next iteration (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08) and its
3.7. In short: a change goes in the version's newest iteration, or, once someone other than that iteration's makers
has commented on it, in the next iteration, started as a copy and recorded only when the change is made and builds.
The comment is marked "addressed in V1 · I2". The app's Address and `flkd change-prototype` share the rule; the
command reads who commented through GitHub's command line, and treats the iteration as frozen when it cannot.

**What is left of "done when" is Noah's:** comment on a prototype as a second GitHub account, run Address, and see
`v1-i1` unchanged, `v1-i2` with the change, and the comment marked as addressed there. Coke's routing for a change
asked for in Claude Code is on `noah/flock-designer-m3`, to fast-forward into `noah/flock-designer`.

### M4: One comments experience, taken out of the review screen (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In
short, one commit per step, the app working after each:

- **4a:** the review screen rendered for real in jsdom against a fake app, with 17 tests of what it does with comments.
  They passed before anything moved and pass after. One found a bug, fixed separately: comments that could not be read
  on opening said nothing.
- **4b:** `pageScripts.ts` is in `shared/`.
- **4c:** `CommentStore` and `PageSurface` (`renderer/comments/surfaces.ts`), with the app's adapter for each
  (`appAdapter.ts`). Mark-addressed is not in the store: Address stays the app's, and its result comes back as a
  changed comment, like any other.
- **4d, 4e:** `useComments` and three parts drawn from it (`CommentList`, `CommentBox`, `CommentControl`). The review
  screen gives them the app's adapters, adds Address to a card's menu, and says on a card what the agent did.
  `Review.tsx` is 781 lines, down from 1,231. New tests drive the parts through a store and page that are not the app's.

**What is left of "done when" is Noah's:** a manual run through comment, pin, resolve, delete and Address in the app.

### M5a: The site, assembled locally (done 2026-10-08)

**Done.** What it built, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In
short: `flkd build-site` writes the site from the design repository (`workspace/src/site/buildSite.ts`, nothing of the
app in it), and `--serve` shows it on this machine. Each iteration is its saved page in a frame under a slim bar (the
project, and one switcher grouped by version); each project page has its versions side by side, iterations newest
first, with date, author and comment count (through `gh`); `latest` addresses redirect to the newest iteration as of
the build; the fonts are written as real files and found by relative path; every link is relative. It is rebuilt in
full each time, and only ever clears a folder it made.

**For M5b:** the workflow has to run the generator, which today needs the workspace's packages for its bundler; a
build that needs none is part of M5b. **"Selected version"** (M10) is not here: `/<project>/latest/` follows the newest
version.

**What is left of "done when" is Noah's:** `node workspace/bin/flkd.mjs build-site --serve` from the design repository,
then move between the index, a project, its versions and iterations, and `latest` in a browser.

### M5b: Publish for real (built 2026-10-08; the private result waits on M0)

**Built.** What, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In short:

- **`flkd publish --project <id> --name <v1-i1>`** (`workspace/src/main/services/pages.ts`, nothing of the app in it):
  the records pushed by the app's own records sync (only `projects/`, and nothing at all if anything else is waiting),
  then the workflow asked to deploy and waited on, then the iteration's link, then a request for it with no
  credentials.
- **Who can open it is said, not enforced.** It asks GitHub whether the repository and its Pages site are private
  (unknown counts as public), and says in its note when they are not: while the repository is public, anyone with the
  link can open the page. If a site GitHub called private opens for anyone, it warns plainly and says not to share it.
  (An earlier version refused to publish to a public site except with a typed phrase, and put PUBLIC TEST on every
  page. Noah removed both on 2026-10-08: the repository is public only briefly.)
- **The workflow** (`.github/workflows/publish-prototypes.yml`) runs only when asked, never on a push, takes no options,
  and queues rather than cancels. It installs the generator's packages without the app's binaries (rehearsed: 2
  seconds from a warm cache, no Electron download).
- **In the app,** the review screen shows **Open page** beside the switcher once the iteration is on its page (the last
  deploy includes the last change to it, asked of GitHub), with a link that names that deploy, and **Not published yet**
  when it is saved but not deployed. The main process works out the address and opens it; the window never hands it one.

**What was not built, and why:** publishing from inside the app. The plan's routes are the command and the agent (M6);
the app shows the result.

**What is left:** the first real publish, which pushes the workflow and puts a page on the public site, with the
banner. Then, once M0 makes the repository private, the private result: a teammate with access opens the link, someone
without cannot, and the command refuses when the repository is public.

### M6: The agent hands back the link (built 2026-10-08)

**Built.** What, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In short:

- **From Claude Code,** the task `flkd new-prototype` and `change-prototype` print ends: save, publish, then end with
  the link exactly as the command printed it, which version and iteration, and who can open it; or, with no link, why,
  in the command's words. The agent never gives a link the command did not print. `change-prototype` first says how many open comments the iteration has, and puts
  them in a file to read.
- **From the app,** a prototype the app built and a change Address made are published by the app itself, in the
  background, through the same code. The review screen says
  **Publishing…**, then **Open page**, or **Not published yet** with the reason it stopped.
- **The narrow permission:** Coke's `.claude/settings.json` allows the four `flkd` commands and nothing else
  (`7dba10c3`, on `noah/flock-designer-m6`). Publishing is the only one that pushes, and only `projects/`.

**Where it differs from the plan:** the address skill is unchanged. In the app, the app publishes after Address; from
Claude Code a change goes through `change-prototype`, whose task already ends with publishing. "New comments since you
last looked" is the open comments: nothing records when someone last looked. A page that cannot be published is
reported as saved in Flock Designer, not handed over as a standalone file: the saved page needs the shared fonts beside
it, so on its own it would show icons as words.

**Needs Noah, before the app's side works:** the Flock Designer GitHub App's permissions. It has Issues and Contents;
starting the publish workflow needs **Actions: read and write**, and reading the site and its deploys needs **Pages:
read** and **Deployments: read**. Until then the review screen says **Page unknown**, with GitHub's refusal as the
reason. The command uses `gh`, which has them.

### M7: Comments on the page (built 2026-10-08)

**Built.** What, and the evidence, is in [flock-designer.md](flock-designer.md#change-log) (2026-10-08). In short:

- **The viewer** (`workspace/src/viewer/`): the app's own comments parts from M4 (the Comment control and its count in
  the page's bar, the side panel from the right, the box beside the pin, the cards and their menu), in the app's own
  look, built with the app's Vite into one script and stylesheet that the site puts beside every page. A page without
  it is as it was.
- **The browser adapter:** GitHub through the app's own code (`DesignRepo`, `callApi`) given a token, so threads are
  found and written as the app writes them; the page is the prototype's frame, where the same pick and pin scripts run.
- **Signing in, for testing:** a dialog in the app's style taking a fine-grained token with Issues read and write on
  the design repository, checked against it before it is kept, kept in that browser only, and forgotten on Sign out.
- **No picture of the spot:** the comment box says so.
- **Found on the way and fixed:** a pin was placed by the page's address, which is not the same in the app and on the
  site, so comments made in one would never have their pins in the other. A prototype is one page, so only what follows
  its `#` places a pin now, in both.

**Paused 2026-10-08 (see M9):** what is built stays, and the page still takes a fine-grained token for testers, but nothing more
is done on comments in the browser until the sign-in function is approved.

**What is left of "done when" is Noah's:** on the published page, sign in with a token, pick an element, write the
comment, see its pin and card, and see it on the iteration's review issue. It needs the site published first (M5b).

### M8: The round trip, proved (built 2026-10-08)

**Built:** `workspace/__tests__/roundTrip.spec.ts` runs the page's viewer and the app's review screen against one fake
GitHub, each the real thing (the app's calls go through its own `DesignRepo`, as its main process does), and checks on
every change: a comment made on the page is in the app, by its author, pinned on the same element; it appears in an app
already open when its window comes to the front; resolved in the app it is resolved on the page, its pin gone; deleted
on the page it is gone from the app; addressed from the app, the page says so and where the change is. Address making
the next iteration and publishing it are the app's own tests (M3, M6).

**Found by it and fixed:** after leaving comment mode while it waited for a click, the first click on entering it again
was dropped, in the app and on the page alike.

**What is left of "done when" is Noah's:** on the published page, comment as a second person (a token for another
GitHub account), and watch it appear in the app and act on it there.

### M9: Signing in for everyone (decided 2026-10-08; waiting on approval)

Anyone who views or comments is signed in to GitHub (decided). Viewing is covered by private Pages (M0). Comments on the
page need the page itself to know who the person is, and it cannot find that out on its own: **tested 2026-10-08**, both
of GitHub's sign-in endpoints (`/login/oauth/access_token`, `/login/device/code`) refuse calls from a web page, so a
github.io page cannot complete a sign-in by itself. GitHub's docs for private Pages say nothing of handing the page an
identity or a token, and a community answer says there is no way to.

**Decided (Noah, 2026-10-08): a small, stateless sign-in function, hosted under the company's account.** It only swaps
GitHub's one-time sign-in code for a token, holding the GitHub App's secret; it keeps no data and no logs of tokens. The
page then signs people in with one click, or none (it can send them to GitHub and back automatically), in any browser,
with nothing installed. **Waiting on Noah's approvals** (security, and where it is hosted); it is written then.

**Considered and set aside, with why:**

| Option | Why not |
|---|---|
| Only GitHub, no function | Not possible: GitHub's sign-in refuses a page (tested) |
| A browser extension | An install, and one per browser family (Chrome and Edge share one; Firefox and Safari do not) |
| The page asks the app on the same computer | Only for people with the app running; Chrome asks for "local network access", Safari blocks it |
| Anonymous comments with a typed name | Still needs a server holding a shared credential, open to anyone; breaks the M3 freeze rule and who may resolve |
| Moving off GitHub Pages | Loses GitHub's own sign-in for viewing; another vendor; revisit only if M0 refuses private Pages |
| Replacing the Electron app with an extension | Kept the app: one build across Mac and Windows and any browser, already built |

**Until then:** testers sign in on the page with a fine-grained token (M7); everyone else comments in the app, where the
same comments are. **Opening the page from the app already signed in** (the app's **Open page** handing the page its
sign-in) was proposed as the short-term demo; it was stopped before it was built, as handing a person's GitHub token to
a page through its address is a security decision to make deliberately, not by default. Noah's call whether to do it.

**Done when:** a PM with access signs in from the page in one step and comments.

### M10: Parity and the smaller things we agreed

**Paused with the comments in the browser (2026-10-08, see M9):** the picture of the spot, moving a pin, the page's states
carried into each comment, and the card saying when and by whom. They only matter once people can comment on the page,
and the sign-in function that allows it is waiting on approval. **Not paused:** the selected version, unpublish, the
"Built in code" link, and the viewer on a phone.

- The **picture of the spot** in the browser; **moving a pin** you made; the page's own **states** carried into each
  comment; a card that says when it was made on the page and by whom.
- A **selected version** marker: the project page highlights it, `/<project>/latest/` follows it, and Build in the
  codebase starts from its newest iteration.
- An **unpublish** command (remove an iteration's files, push, redeploy), with Pages switched off by an admin as the
  emergency switch.
- The project page's plain **"Built in code" link** to the branch or pull request when there is codebase work.
- The viewer readable on a phone, with "best on a computer" for the prototype.

## Out of scope

- Making or changing a prototype from the page. That needs the agent and the product repository, which are on the
  designer's machine.
- Reviewing **codebase work** on a page. That is delivery, and engineering's previews cover it.
- Address, Hand off and Build in the codebase from the page.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Private Pages not allowed** in the org | M5b cannot happen as written | Asked in M0; without it, nothing here goes ahead, and the app stays the way to review |
| **Two comment experiences drifting apart** | The reason the sandbox failed | M4: one set of components, two adapters, and the round-trip test in M8 |
| **Tokens in a browser** | A token kept in a browser can be read by anything running on that page | Fine-grained, one repository, Issues only, and only for testing; M9 replaces it |
| **Cached pages** | A teammate sees the old iteration and comments on it | The link carries a version; each comment carries the iteration it was made on |
| **A page is made public by mistake** (the repo flipped to public, or the site set to public) | The link then opens for anyone, which is the opposite of requirement 1 | Publishing says in its note when either is public, and checks the link with no credentials after deploying, warning if a site GitHub called private opens for anyone. It does not refuse (Noah, 2026-10-08) |
| **An agent pushes to the design repository** | Agents are told never to push | Only the one publish command, only `projects/`, only plain pushes (M6); nothing else may push |
| **A link goes out that someone cannot open** | A director gets a "not found" and thinks it is broken | The summary says who can open it; the design team has read access (M0) before links go to anyone |
| **Page size** | A page is about 2 MB, plus the 5 MB fonts once | Fonts are kept once on the site, not inlined into every page |
| **Rate limits** | GitHub allows 5,000 API calls an hour per signed-in person | Comments are read when a page opens and when it comes back into focus, not continuously |

## Open questions

Most of what was open is now settled in a milestone or marked recommended in *Decisions made*. What remains:

- **How the command reaches an agent in VS Code** (M2). Recommended: one pre-built file committed in the design
  repository, with a test that fails when it is stale.
- **The trigger's exact look** on the page (M7). The pattern is set (a slim bar above the prototype, the Comment
  control with its count, the side panel from the right); the visual detail is designed together when M7 starts.
- **Which sign-in mechanism** for everyone (M9): the small service or the extension, and who would own it. That it
  requires GitHub is decided.
- **What the label for codebase work becomes** beside "V1 · I2". It keeps its present label until there is a reason to
  change it.
