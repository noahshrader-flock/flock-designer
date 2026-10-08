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
   a gate, not a setting to hope is right: the publish step checks it before any link exists (Phase 1).
2. **The agent that makes a prototype hands back the link.** Whether it was started from the app or from Claude Code
   in VS Code, it finishes by packaging and publishing the prototype, and its final summary includes the link and who
   can open it. Nobody has to remember a step (Phase 2).

**A consequence worth stating:** requirement 1 cannot be met from a public repository, because a public repository's
Pages site is public. The sandbox's site reported `"public": true` for exactly that reason. The publish step's check
refuses to give out a link while the repo or its site is public.

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
| **The Pages API says whether a site is public** (`"public": true` on the sandbox's public site) | `gh api repos/noahshrader-flock/prototype-pages-sandbox/pages` | The publish step can check this before it hands out a link |
| **The app publishes only `projects/`, as plain pushes, to the design repo's current branch** | Read from `designSync.ts` and `publisher.ts` | The Pages deployment has to run from that branch, or from a workflow that is allowed to. GitHub restricts Pages deployments to the default branch unless the environment allows others (GitHub's default; **not checked here**) |
| **The prototype skill ends at "say what you made."** Nothing publishes, and the build command is injected by the app | `skills/build-prototype.md`; `prototypeBuildPlan` in `ipc.ts` | From Claude Code in VS Code there is no app to supply the build command or push, so both have to live in one command that does not need the app |
| **A comment made in the page's format reads back through the app's own code** | The app's `renderComments` turned a sandbox comment into the `comments.md` the agent reads, with page, element kind, section, selector and nearby text | The format is right; the round trip into the app itself is what Phase 5 proves |
| **The app finds a prototype's thread by the `branch:` line** in the issue's description (for a prototype, `prototype/<id>/<name>`) | `designRepo.ts` | The page posts to the thread that already exists for that iteration, never a new one |

**What the sandbox taught (2026-10-07).** A public test repo (`prototype-pages-sandbox`) proved publishing and
reading comments back, but its commenting was a thin layer of its own around the app's engine: a native prompt for a
token, no pin dragging, no cards or card menu, no screenshot. That was not the product's experience, and it is the
reason Phase 3 exists: **one comments experience, two adapters**, never a second version.

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

## Phases

Each phase ends with something Noah can see. A phase whose check needs a person is not closed by Claude.

### Phase 0: Prerequisites (needs other people)

| # | Item | Who | Status |
|---|---|---|---|
| 0.1 | Move `flock-designer` into the `flocksafety` org, private, with **Maintain** for Noah | An org owner | **Requested 2026-10-07** through the access form |
| 0.2 | Confirm the org allows **private** GitHub Pages, and that Noah can publish from that repo | GitHub admin | Asked with 0.1 |
| 0.3 | Give the **design** team read access to the repo, so teammates can open its pages | GitHub admin | With 0.1 |
| 0.4 | Install the app's GitHub App on the repo in its new place, and point the app at it | Claude, once 0.1 is done | Not started |
| 0.5 | **Delete the public sandbox repo** (`noahshrader-flock/prototype-pages-sandbox`). Its page bundles the app's pick and pin code | Claude, on Noah's word | Waiting on Noah |
| 0.6 | Confirm the Pages site can be set to **private** (access limited to people with read access), and that a deployment from the branch the app pushes is allowed | GitHub admin | Asked with 0.2 |

**Done when:** the repo is in the org, private Pages is allowed, and the app works against the repo in its new place.

### Phase 1: One publish command, a private gate, and the link in the app

No comments on the page yet. This phase proves that a prototype becomes a private page, and that nothing can
publish a public one.

- **One publish command**, callable without the app running, that every route uses. Given a project and an
  iteration it: builds the prototype's source into its page with the same bundler the app uses; rewrites the
  `/_shared/` font path (or copies `_shared/` to the site root); saves the page and its source under
  `projects/<id>/prototypes/`; commits **only those files**; pushes with the same narrow rules as the app's publisher
  (only `projects/`, plain pushes, never anything else that is waiting); waits for the Pages deployment; and prints
  the link. The app's own save and the agent both call it, so there is one way a prototype becomes a page.
- **The private gate, before anything is pushed or any link is printed.** The command asks GitHub whether the
  repository is private and whether its Pages site is private (the Pages API's `public` field). If either is public
  it stops, says why, and prints **no link**.
- **The check afterwards.** Once deployed, it requests the link with no credentials and expects not to get the page
  (a sign-in or a "not found"). If an anonymous request gets the page, it says the site is public and tells the person
  not to share the link.
- **The page's address** is read from GitHub (the Pages API gives the site's URL; a private site has its own domain)
  and kept by the app. Never typed in.
- **Open page** in the app's review screen, beside the iteration switcher, for a prototype whose page is published.
  Its link carries the iteration and a version, so a new iteration never shows an old cached page.
- **A "not published yet" state** while the deployment runs (about a minute and a half in testing).

**Done when:** from the app, Noah opens `admin-usage` I1 on its private page; a teammate with access opens the same
link; someone without access cannot; and the command refuses to publish when the repo is made public.

### Phase 2: The agent hands back the link

This is what makes it work from Claude Code in VS Code, where there is no app.

- **The prototype skill gets a final step:** when the build finishes, run the publish command, then put the **link**
  in the final summary, with the iteration and who can open it ("anyone signed in to GitHub with read access to the
  design repository"). It never states a link it did not get from the command, and if publishing failed it says so
  and what is needed.
- **From VS Code,** the agent needs what a designer there already has: the product checkout with packages, the design
  repository's clone beside it, and GitHub's command line signed in. The publish command finds the build tools itself,
  since there is no app to inject them.
- **A narrow permission:** agents never push, and that rule stays. The publish command is the one named exception,
  allowed as that command only, and it can only push `projects/` (Phase 1). Nothing else the agent runs may push.
- **From the app,** the agent's run does the same, and the app shows the link where **Open page** is.
- **Waiting:** the command waits for the deployment (with a limit), so the link in the summary works when it is read;
  on a timeout it says the link will work shortly.

**Done when:** Noah asks the Flock Designer agent for a prototype from Claude Code in VS Code, and its final message
includes a link that opens the private page for someone with access.

### Phase 3: One comments experience, taken out of the review screen

No visible change in the app. This is what stops a second version being written.

- Move `pageScripts.ts` from `main/services/` to `shared/`.
- Take the comments out of `Review.tsx` into their own components: the side panel, the cards and their menu (Address,
  Resolve or Reopen, Delete), the inline comment box, the comment-mode control, and the pin events.
- Define the two interfaces above, and give the app its **Electron adapter**, which is what it does today.
- Address stays a capability the Electron adapter has and the browser one does not, so its menu item appears only in
  the app.

**Done when:** the app behaves exactly as before, the existing tests pass, and new tests drive the comment components
through a fake adapter.

### Phase 4: Comments on the page

- **A small viewer around the prototype**: the page loads the built prototype and the shared comment components, with
  the **browser adapter**.
- **The trigger:** to be designed together before it is built. The starting point is the app's own: a Comment control
  with the comment count beside it, opening the side panel. No native prompts.
- **Signing in, for testing only:** a proper dialog, in the app's style, that takes a fine-grained GitHub token with
  Issues read and write on the design repo, keeps it in that browser, and says so. It is a stopgap for Noah and a few
  testers, never the answer for everyone (Phase 6 is).
- **The picture of the spot:** the app takes it with Electron's `capturePage`, which a page does not have. The first
  version posts without a picture, and says so on the card; Phase 7 adds it.

**Done when:** on a prototype's page, Noah picks an element, writes a comment in the inline box, sees the numbered pin
and the card in the side panel, and the comment is on the iteration's review issue.

### Phase 5: The round trip, proved

- Comment on the page; in the app, the comment appears (within a minute, or at once when the window comes back into
  focus, or with Sync). The pin is in the same place in both, on the same element.
- Resolve it in the app; the page shows it resolved. Delete one on the page; it goes from the app.
- Run **Address** on the page's comment from the app, and see the page update once the new iteration is published.
- A test that drives both adapters against one fake GitHub, so the round trip is checked on every change.

**Done when:** Noah watches a comment made on the page appear in the app, and acts on it there.

### Phase 6: Signing in for everyone else (a decision first)

The page cannot sign a person in by itself. One of these does it; each is a decision with a cost:

| Option | What a reviewer does | Cost |
|---|---|---|
| **A browser extension** | Installs it once; it signs in with GitHub's device flow, as the app does, and gives the page a token | An install, deployed to people's browsers. No server |
| **A small sign-in service** | Clicks "Sign in with GitHub" on the page | A server to own, approve and secure, which the plan has avoided so far |
| **Stay with the token dialog** | Creates a token in GitHub's settings | Fine for a few testers, not for PMs and directors |

**Done when:** a PM with access signs in from the page in one step and comments.

### Phase 7: Parity and polish

- The **picture of the spot** in the browser (a page-capture library, or the extension's own screenshot).
- **Moving a pin** you made, as in the app.
- The page's own **states** (default, empty, loading) carried into each comment, as the app does.
- A comment's card says when it was made on the page, and by whom, as cards in the app do.

## Out of scope

- Making or changing a prototype from the page. That needs the agent and the product repository, which are on the
  designer's machine.
- Reviewing **codebase work** on a page. That is delivery, and engineering's previews cover it.
- Address, Hand off and Build in the codebase from the page.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Private Pages not allowed** in the org | Phase 1 cannot happen as written | Asked in Phase 0; without it, nothing here goes ahead, and the app stays the way to review |
| **Two comment experiences drifting apart** | The reason the sandbox failed | Phase 3: one set of components, two adapters, and the round-trip test in Phase 5 |
| **Tokens in a browser** | A token kept in a browser can be read by anything running on that page | Fine-grained, one repository, Issues only, and only for testing; Phase 6 replaces it |
| **Cached pages** | A teammate sees the old iteration and comments on it | The link carries a version; each comment carries the iteration it was made on |
| **A page is made public by mistake** (the repo flipped to public, or the site set to public) | The link then opens for anyone, which is the opposite of requirement 1 | The publish gate (Phase 1) refuses to hand out a link while either is public, and checks again after deploying |
| **An agent pushes to the design repository** | Agents are told never to push | Only the one publish command, only `projects/`, only plain pushes (Phase 2); nothing else may push |
| **A link goes out that someone cannot open** | A director gets a "not found" and thinks it is broken | The summary says who can open it; the design team has read access (Phase 0) before links go to anyone |
| **Page size** | A page is about 2 MB, plus the 5 MB fonts once | Fonts are kept once on the site, not inlined into every page |
| **Rate limits** | GitHub allows 5,000 API calls an hour per signed-in person | Comments are read when a page opens and when it comes back into focus, not continuously |

## Open questions

- **Which branch publishes?** The app pushes `projects/` to the design repo's current branch. Pages deployments are
  restricted to the default branch unless the environment allows others. Options: allow the app's branch in the Pages
  environment, or publish from a workflow that runs on that branch. Needs the admin's answer (Phase 0).
- **Does the publish command wait for the deployment,** and for how long, before the agent's summary goes back?
- **What permission lets an agent run the publish command and nothing else that pushes,** in the repositories where
  agents run?

- **The trigger UI** on the page: where it sits, and how it looks beside a prototype that has its own top bar.
- **Which sign-in** for everyone (Phase 6), and who would own it.
- Whether a page should show **every iteration** of a prototype (a switcher, as in the app) or only the one linked.
- Whether comments made on a page should carry a mark saying so, for the agent and for the person reading them.
