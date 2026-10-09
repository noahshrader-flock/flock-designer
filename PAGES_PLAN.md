# Pages plan: prototypes on a link, with the app's comments

**Written 2026-10-07; cleaned 2026-10-08, when M1 to M8 were built.** The plan for publishing prototypes to GitHub Pages,
so a teammate opens a link and comments with the same experience as the app: marker pins, the inline comment box, the
comment side panel. Every comment goes to the same GitHub issue the app already reads.

This is the detail behind one item in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). **This file holds only what is
still to do or decide.** What is built, how it works and the evidence for it is in
[flock-designer.md](flock-designer.md) (its Vocabulary, section 3.7, and the Change log, 2026-10-08, one row per
milestone). When something here is done, its result moves there and it leaves this file.

## What it is for

The design-team channel asked, on 2026-10-07, how to share prototypes with people who do not have Claude access: PMs and
directors. The answers were "get them access," "record a Loom" and "export as HTML." None keeps the conversation
attached to the prototype. This plan keeps everything inside the company's GitHub: a prototype gets a link, the page has
the app's comments, comments are GitHub issue comments on the iteration's existing review thread (so they appear in the
app with nothing new to sync), and the agent hands back the link. It is for **prototypes**; codebase work stays reviewed
through engineering's pull requests and previews.

## Requirements that do not move

1. **Viewing a page requires signing in to GitHub, and having access.** That is private Pages in the `flocksafety` org,
   and it waits on M0. Until then the repository, and so the site, is public (Noah, 2026-10-07), and publishing says so
   in its note rather than refusing (Noah, 2026-10-08).
2. **Anyone who comments has signed in to GitHub.** No anonymous path (Noah, 2026-10-07).
3. **The agent that makes a prototype hands back the link,** from the app or from Claude Code, and nobody has to
   remember a step. Built (M2, M6).
4. **A prototype always has a page, and the page follows the project:**
   `/<project>/`, `/<project>/v1/i2/`, `/<project>/v1/latest/`, and `/<project>/latest/` (the newest
   version's newest iteration). **A version is a different idea; an iteration is a refinement of one.**

## Where things stand

| Milestone | State |
|---|---|
| M1 versions, M2 commands without the app, M3 Address starts the next iteration, M4 one comments experience, M5a the site, M5b publish, M6 the agent hands back the link | **Done** (2026-10-08) |
| M7 comments on the page, M8 the round trip proved by a test | **Built, then paused** with M9: the page's **Sign in to comment** button says to comment in the app for now |
| M9 sign-in for everyone | **Decided; waiting on Noah's approvals** |
| M10 the smaller things | **Built:** unpublish, "Built in code" link, the viewer on a phone (a selected version was built and removed on 2026-10-09). **Paused with M9:** the comment-related parts |
| M0 the asks | **In progress, Noah** |

The site is live and public while the repository is: `https://noahshrader-flock.github.io/flock-designer/`. It does
**not** yet have the M10 changes ("Built in code", the phone layout); redeploy when wanted.

## What is still known to bind

Checked on 2026-10-07 and 2026-10-08. Only what the open work depends on.

| Fact | What it means here |
|---|---|
| **The `flocksafety` org is on GitHub's Enterprise plan.** Whether it **allows private Pages is not known** | Asked in M0 |
| **The design repo is under a personal account** (`noahshrader-flock/flock-designer`), and a personal account cannot publish private Pages. The design team has no access to it in the org | The repo has to move into the org, and the design team given read access (M0) |
| **GitHub's API accepts calls from a web page, but its sign-in endpoints do not** (`/login/oauth/access_token`, `/login/device/code`; tested 2026-10-08) | A page can read and post comments if it has a token, and cannot get one by itself: the reason for M9 |
| **Signing in to view private Pages gives the page no token or identity** (GitHub's docs say nothing of it; a community answer says there is no way) | Even on private Pages, comments need M9 |
| **Reading comments on a private repo needs a token** | Without sign-in a private page shows the prototype but no comments |
| **Pages tells browsers to keep a page for 10 minutes** | A link to a new iteration carries a version (`?v=<commit>`) |
| **The site is deployed from the repository's default branch** (`noah/flock-designer` now) | Records pushed to any other branch never reach it; publish refuses that |
| **Handing a person's GitHub token to a page through its address** was refused by the safety check when it was tried | Not built. Noah's call, and it would need a permission rule (see M9) |
| **Claude Design** (claude.com/product/design, read 2026-10-07) covers real components from a repo, an admin-set design system, private links and a bridge to Claude Code. It is not approved for use at Flock, and its page says nothing of who can comment, security or compliance | Not an option for the real repo until approved. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) item 10 holds the open question of whether to use it for sharing |

## The asks and approvals (not code, waiting on people)

### M0: The asks

| # | Item | Who | Status |
|---|---|---|---|
| 0.1 | Move `flock-designer` into the `flocksafety` org, private, with **Maintain** for Noah | An org owner | **Noah is handling it (2026-10-07)** |
| 0.2 | Confirm the org allows **private** GitHub Pages, and that Noah can publish from that repo | GitHub admin | With 0.1 |
| 0.3 | Give the **design** team read access to the repo, so teammates can open its pages | GitHub admin | With 0.1 |
| 0.4 | Which branch publishes (`main`, recommended), and whether designers can push `projects/` to it | GitHub admin | With 0.1 |
| 0.5 | Confirm the Pages site can be set to **private** | GitHub admin | With 0.2 |
| 0.6 | **Approvals for the sign-in function** (M9): security, and where it is hosted. The longest lead item | Security / platform | Not started |
| 0.7 | Install the app's GitHub App on the repo in its new place, and point the app at it | Claude, once 0.1 is done | Not started |
| 0.8 | **Delete the public sandbox repo** (`noahshrader-flock/prototype-pages-sandbox`): its page bundles the app's pick and pin code | Claude, on Noah's word | Waiting on Noah |

**Done when:** the repo is in the org, private Pages is allowed, the design team can read it, and the app works against
the repo in its new place. Then the private result of publishing is checked: a teammate with access opens a link,
someone without cannot, and an anonymous request is turned away.

**Decided when it lands:** whether `flkd publish` should **refuse** to publish while the repository or site is public,
as it once did (removed 2026-10-08 because the repo is public only briefly). Recommended: bring the refusal back for the
org repo, since a public page there would break requirement 1.

### Also waiting on Noah

- **The Flock Designer GitHub App's permissions** (needed before the app's side of publishing works): **Actions: read
  and write** (starts the publish workflow), **Pages: read**, **Deployments: read**. Until then the review screen says
  **Page unknown**. The `flkd` command uses `gh`, which has them.
- **Fast-forward Coke's `noah/flock-designer` to `noah/flock-designer-path`**, which holds `7dba10c3` (`.claude/settings.json`
  allowing the four `flkd` commands), `5265e262` (the `install` command, for the clone plan's C5) and `30edaa36` (a request
  that names its path starts at once, and one that does not is asked in a panel). **Then work from that branch:**
  `feature/alert-history` was cut before the settings file and the new routing, so a Claude Code run there has neither. `unpublish` is deliberately not on that list: the agent asks first.
- **The hand runs** (the code is tested; none of these has been run for real):
  - M2: in Coke on `noah/flock-designer`, ask Claude Code for a prototype, then another version; check both open in the
    app.
  - M3: comment as a second GitHub account, run Address, see `v1-i1` unchanged, `v1-i2` with the change, and the comment
    marked addressed there.
  - M4: comment, pin, resolve, delete and Address in the app.
  - M5a: `node workspace/bin/flkd.mjs build-site --serve` from the design repository; move between the index, a
    project, its versions and iterations, and `latest`.
  - M10: select a version and watch `latest` move; unpublish a test iteration; the project page's "Built in code"
    after sharing codebase work.
  - M7 and M8's hand run (comment on the page as a second person, watch it reach the app) cannot be done until M9.

## M9: Signing in for everyone (decided 2026-10-08; waiting on approval)

Comments on the page need the page to know who the person is, and a github.io page cannot find that out or finish a
sign-in on its own (tested; see the facts above).

**Decided (Noah, 2026-10-08): a small, stateless sign-in function, hosted under the company's account.** It only swaps
GitHub's one-time sign-in code for a token, holding the GitHub App's secret; it keeps no data and no token logs. The
page then signs people in with one click, or none (it can send them to GitHub and back), in any browser, with nothing
installed. **Waiting on Noah's approvals** (0.6); it is written then.

**Considered and set aside:** a browser extension (an install, and one per browser family); the page asking the app on
the same computer (only for people with the app running; Chrome asks for "local network access", Safari blocks it);
anonymous comments with a typed name (still needs a server holding a shared credential, and breaks the freeze rule and
who may resolve); moving off GitHub Pages (loses GitHub's own sign-in for viewing); replacing the Electron app (it stays:
one build for Mac and Windows and any browser).

**Until then:** everyone comments in the app. The page's **Sign in to comment** button stays where it will be and says
so. **Opening the page from the app already signed in** (Open page handing the page the app's token) was proposed as a
short-term demo and stopped before it was built: it hands a person's token to a page through its address. Noah's call
whether to do it, and it would need an explicit permission rule.

**Built and kept for it:** the browser viewer (`workspace/src/viewer/`) with all of the commenting behind that button,
and the round-trip test (`workspace/__tests__/roundTrip.spec.ts`), which hands the page a token itself. **Done when:** a
PM with access signs in from the page in one step and comments.

## Paused with M9: the comment-related parts of M10

Only matter once people can comment on the page. Built when M9 is:

- The **picture of the spot** in a browser comment (today the box says there is none).
- **Moving a pin** you made.
- The page's own **states** carried into each comment.
- A card that says **when it was made on the page, and by whom**.

## Still open

- **Whether to redeploy the live site** with the M10 changes.
- **The site's index and project pages are hand-styled,** not the design system (the page's bar is the app's own,
  built from its components). Undecided whether to rebuild them from the design system.
- **Selection in the app is read when the screen opens,** not again when the window returns to the front, so someone
  else's selection shows the next time it is opened. Left as is; revisit if it bites.
- **A "Built in code" link for a branch that has not been shared:** none, because the record does not say which GitHub
  repository the product code is in. Add the repository to the record if a link to the branch is wanted.
- **What the label for codebase work becomes** beside "V1 · I2". It keeps its present label until there is a reason.
- **Claude Design versus building the viewer** ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) item 10): not decided.
  M1 to M3 serve either choice.

## Out of scope

- Making or changing a prototype from the page (needs the agent and the product repository, on the designer's machine).
- Reviewing codebase work on a page (engineering's previews cover it).
- Address, Hand off and Build in the codebase from the page.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Private Pages not allowed** in the org | The private result cannot happen as written | Asked in M0; without it the app stays the way to review, and the site stays as public as the repo |
| **Two comment experiences drifting apart** | The reason the sandbox failed | One set of components, two adapters, and the round-trip test on every change |
| **The sign-in function is a credential holder** | It holds the GitHub App's secret | Stateless, no logs of tokens, under the company's account; security approves it first (0.6) |
| **Cached pages** | A teammate sees the old iteration and comments on it | The link carries a version; each comment carries the iteration it was made on |
| **A page is public by mistake** (repo flipped to public, or site set to public) | The link then opens for anyone | Publishing says so in its note and checks the link with no credentials after deploying. It does not refuse today (see M0) |
| **An agent pushes to the design repository** | Agents are told never to push | Only the one publish command, only `projects/`, only plain pushes; nothing else may push. `unpublish` is not on Coke's allowed list |
| **A link goes out that someone cannot open** | A director gets "not found" and thinks it is broken | The summary says who can open it; the design team has read access (0.3) before links go to anyone |
| **Page size** | A page is about 2 MB, plus the 5 MB fonts once | Fonts are kept once on the site, not inlined into every page |
| **Rate limits** | GitHub allows 5,000 API calls an hour per signed-in person | Comments are read when a page opens and when it returns to the front, not continuously |
