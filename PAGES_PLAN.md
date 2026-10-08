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
| **M3** | **Address starts the next iteration** when the current one has outside comments | M1, M2 | M | Medium | After M2 |
| **M4** | **One comments experience,** taken out of the review screen | M1 | L | **High** | Ready after M1 (tests first) |
| **M5a** | **The site, assembled locally:** project pages, `latest` links, index | M1 | M | Low | Ready after M1 |
| **M5b** | **Publish for real:** the publish command, the private gate, the deploy, **Open page** | M2, M5a (M0 for the private result) | L | Medium | **Buildable and testable now on the public repo;** the private result waits on M0 |
| **M6** | **The agent hands back the link** | M2, M5b | S | Low | After M5b |
| **M7** | **Comments on the page** (shared components, browser adapter, test sign-in) | M4, M5b | L | Medium | After M4 and M5b |
| **M8** | **The round trip, proved** | M7 | S | Low | After M7 |
| **M9** | **Signing in for everyone** | M0 (security), M7 | L | **High** | Blocked on a decision |
| **M10** | **Parity and the smaller things we agreed** | M7 | M | Low | Later |

**M1 and M2 are done (2026-10-08). Next: M5a,** on the fastest path below; M3 and M4 are ready too.

**The repo is public for now (Noah's decision, 2026-10-07), so the whole flow can be built and tested before the admins
answer.** Public Pages needs no login to view, so what it cannot show is that an anonymous viewer is blocked. That
single result is what M0 unlocks, by moving the repo into the org as a private repository with private Pages.
**The fastest path to seeing it work end to end:** M1, then M2, then M5a, then M5b in its public test mode, then M6
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
an agent runs from Claude Code in the product repository. The shared skill says how, including "another version" and
"based on V1", and Coke's agent file sends a new prototype there.

**The open question was answered differently from the recommendation:** not a pre-built file committed in the repo,
but a launcher that builds the command from the app's source each time it runs. The build needs esbuild either way,
and no product repository has it (Coke's Vite uses Rolldown), so the app's install is needed anyway; this way there is
no built copy to go stale.

**What is left of "done when" is Noah's:** the real run. In Coke on `noah/flock-designer` (it has the new routing), ask
Claude Code for a prototype, then for another version, and check both open in the app. It writes to the real design
clone, and the app publishes it to the public repo the next time it is open.

### M3: Address starts the next iteration

**Goal.** What people commented on is never changed under them, without an iteration per comment.

- **The rule:** an iteration is frozen once someone other than its author comments on it. The first Address after that
  starts the next iteration of the same version: the source is copied to `vN-iM+1`, the record is added, and the change
  is made there. Further Address runs edit that new iteration until someone else comments on it.
- **The comment** that was acted on is marked "addressed in V1 · I2" (today the mark records a hash of the source, as a
  prototype has no commit).
- **The app and the command** both follow it, through M2's shared service.

**Tests first:** an iteration with no outside comments is edited in place; one with an outside comment is left
untouched and a new one appears; the mark points at the new iteration.

**Done when:** Noah comments as a second person on `v1-i1`, runs Address, and sees `v1-i1` unchanged, `v1-i2` with the
change, and the comment marked as addressed there.

### M4: One comments experience, taken out of the review screen

**Goal.** The comments experience exists once, so a page can use it later. **No visible change in the app.** This is
the riskiest piece of work in the plan: `Review.tsx` is about 1,200 lines, and the comments are mixed with the native
preview, the agent runs and about twenty calls into the app's main process.

- **4a. Pin the behavior first.** Tests that drive the review screen with a fake app interface and fix what it does
  today: loading and merging comments, posting, resolving, deleting with confirmation, Address, pin clicks and moves,
  selecting a comment. **Nothing moves until these pass against the current code.**
- **4b. Move the pure parts** (`pageScripts.ts`) from `main/services/` to `shared/`. They have no Electron in them.
- **4c. Define the two interfaces:** the *comments* (read, post, resolve, delete, move a pin, mark addressed, who the
  viewer is) and the *page surface* (pick an element, show pins, focus a pin, report a pin's click or move, take a
  picture of the spot).
- **4d. Extract the components:** the side panel, the cards and their menu, the inline comment box, the comment-mode
  control and the pin-event handling, written against the two interfaces.
- **4e. The app's own adapter:** what it does today (IPC, the native preview, `capturePage`) behind those interfaces.
  Address, Hand off and anything that runs an agent stay in the app and are not part of the shared components.

**Done when:** the 4a tests pass before and after; `Review.tsx` is much smaller; the app behaves as before in a manual
run through comment, pin, resolve, delete and Address; new tests drive the comment components through a fake adapter.

**Undo:** each sub-step is its own commit and the app works after each, so any can be reverted without the others.

### M5a: The site, assembled locally

**Goal.** The structure of the site exists and can be seen, before anything is published.

- **A site generator** that takes the saved pages in the repository (every project, every version, every iteration) and
  writes the site: each page wrapped in a slim viewer bar (project, two-level switcher, back to the project), a
  **project page** (the title from its brief, versions side by side, each with its iterations newest first, with date,
  author and comment count), `/<project>/<version>/latest/`, `/<project>/latest/`, and the index of projects.
- **Fonts and paths:** the `/_shared/` font path is rewritten so a page works from a sub-path.
- **Built from the repository,** so two people publishing never overwrite each other, and rebuilt in full each time.
- **Seen locally,** served from a folder and checked in a browser, using dummy prototypes with invented content.

**Tests first:** the generator against a fixture repository with two projects, two versions and three iterations.

**Done when:** Noah opens the generated site locally and moves between the index, a project, its versions and
iterations, and `latest`.

**Undo:** nothing outside the code is touched.

### M5b: Publish for real (blocked on M0)

**Goal.** A prototype becomes a private page, and nothing can publish a public one.

- **One publish command,** callable without the app, that every route uses. Given a project and an iteration it saves
  and commits **only `projects/` files**, pushes with the same narrow rules as the app's publisher (plain pushes, never
  anything else that is waiting), waits for the Pages deployment, and prints the link.
- **The private gate, before anything is pushed or any link is printed:** it asks GitHub whether the repository and its
  Pages site are private (the Pages API's `public` field). If either is public it stops, says why, and prints **no
  link**.
- **A public test mode, for as long as the repo is public.** The gate can be passed only with an explicit option that
  has to be typed (never a default and never remembered), and when it is used every published page carries a visible
  **PUBLIC TEST** banner and the agent's summary says so. It exists so the flow can be tried end to end before the repo
  is private; it is removed once the repo is in the org.
- **The check afterwards:** it requests the link with no credentials and expects not to get the page. If it does, it
  says the site is public and tells the person not to share it.
- **The workflow** that runs M5a's generator and deploys, queued and not cancelled, from the branch M0 settles.
- **The page's address** is read from GitHub and kept by the app, never typed in. **Open page** appears in the review
  screen beside the switcher; its link carries a version, so a new iteration never shows a cached page.
- **A "not published yet" state** while the deployment runs (about a minute and a half in testing).

**Tests first:** the gate and the anonymous check against a fake GitHub (public repo, public site, private both, a page
that comes back for an anonymous request); the command's narrow push.

**Done when:** from the app, Noah opens `admin-usage` on its private page; a teammate with access opens the same link;
someone without access cannot; and the command refuses to publish when the repo is made public.

**Undo:** the workflow can be disabled, and a page removed by deleting its files and redeploying.

### M6: The agent hands back the link

**Goal.** From Claude Code in VS Code, the agent finishes a prototype and gives you the link.

- **The prototype skill ends with publishing:** the agent runs the publish command and puts the **link** in its final
  summary, with the version and iteration and who can open it ("anyone signed in to GitHub with read access to the
  design repository"). It never states a link it did not get from the command.
- **The other files that must say so,** so it always happens: the address skill (publishing after a change), each
  product repository's Flock Designer agent file (pointing to the shared skill, no copy), and the routing in each
  product's `CLAUDE.md`.
- **A narrow permission:** agents never push, and that stays. The publish command is the one named exception, allowed
  as that command only in a settings file that ships in the repo, and it can only push `projects/`.
- **When publishing cannot happen** (private Pages not allowed, GitHub's command line not signed in, no access), the
  agent says so plainly and why, and still finishes the prototype with a standalone file to share. It never leaves the
  summary without saying whether there is a link.
- **The agent checks the thread when it starts,** and says "2 new comments since you last looked."

**Done when:** Noah asks the Flock Designer agent for a prototype from Claude Code in VS Code, and its final message
includes a link that opens the private page for someone with access, under its project and beside any earlier versions.

### M7: Comments on the page

**Goal.** A teammate opens the link and comments with the app's own experience.

- **A viewer around the prototype:** the slim bar from M5a, the prototype in a frame beneath it, and M4's shared
  components with the **browser adapter** (the GitHub API, the pick and pin scripts run in the page).
- **The trigger:** the app's own pattern, a Comment control with the count, opening the side panel from the right.
  No native prompts.
- **Signing in, for testing only:** a proper dialog in the app's style that takes a fine-grained GitHub token with Issues
  read and write on the design repository, keeps it in that browser, and says so. A stopgap for Noah and a few
  testers; M9 is the answer for everyone.
- **No picture of the spot yet** (it needs `capturePage`, which a page does not have); the card says so. M10 adds it.

**Done when:** on a prototype's page, Noah picks an element, writes a comment in the inline box, sees the numbered pin
and the card in the side panel, and the comment is on the iteration's review issue.

### M8: The round trip, proved

- Comment on the page; in the app it appears (within a minute, on focus, or with Sync), the pin in the same place on
  the same element.
- Resolve it in the app and the page shows it resolved; delete one on the page and it goes from the app.
- Run **Address** from the app on a comment made on the page, and see the next iteration appear and publish (M3, M6).
- A test that drives both adapters against one fake GitHub, so the round trip is checked on every change.

**Done when:** Noah watches a comment made on the page appear in the app, and acts on it there.

### M9: Signing in for everyone (a decision first)

Anyone who views or comments is signed in to GitHub (decided). Viewing is covered by private Pages. For commenting, a
page cannot sign a person in by itself (GitHub's sign-in refuses calls from a page); one of these does it:

| Option | What a reviewer does | Cost |
|---|---|---|
| **A small, stateless sign-in service** (recommended) | Clicks "Sign in with GitHub" on the page | A server to own, approve and secure. It holds no data: it only exchanges GitHub's sign-in code for a token |
| **A browser extension** | Installs it once; it signs in with GitHub's device flow, as the app does | An install, deployed to people's browsers. No server |
| **The token dialog** | Creates a token in GitHub's settings | Fine for a few testers, not for PMs and directors |

**Done when:** a PM with access signs in from the page in one step and comments.

### M10: Parity and the smaller things we agreed

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
| **The public test mode is left on** | Pages stay public with product UI on them | The option must be typed each time, every page and summary says PUBLIC TEST, and it is deleted when the repo moves to the org. A personal account's Pages site also goes down the moment the repo is made private again |
| **A page is made public by mistake** (the repo flipped to public, or the site set to public) | The link then opens for anyone, which is the opposite of requirement 1 | The publish gate (M5b) refuses to hand out a link while either is public, and checks again after deploying |
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
