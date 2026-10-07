# Implementation plan: what remains

**Updated 2026-10-07.** Everything still to do for Flock Designer, and nothing else. What is built, how it works and
why is in [flock-designer.md](flock-designer.md); this file never repeats it. **When an item is done it leaves this
file**: its evidence goes into `flock-designer.md` (the status table, Appendix B, a change-log row), so the two
never describe the same thing.

**The state of it.** Every step that is code or guidance is built. What remains is proving it with people, a few
first real runs, setup and access that need other people, and decisions.

## At a glance

| Item | What it needs | Who | Kind |
|---|---|---|---|
| [The pilot (3.6)](#36--pilot-and-decision-was-c5) | Two or three real projects, reviewed by a PM and an engineer | People outside design | Human |
| [First real runs](#first-real-runs-of-what-is-built) | Address on a prototype, a reviewer with no checkout, a prototype moved by someone else, and the rest | Noah, then others | Human |
| [Finish the handoff proof](#finish-the-handoff-proof-admin-usage) | Run Handoff on `admin-usage` | Noah | Human |
| [Setup and access](#setup-and-access) | Name the Design System owner (1.1), approve the authoring standards (1.5), registry access (4.1), packaging and the org transfer (4.2), the managed-harness decision (4.3) | Noah, the Design System owner, org owners | Human |
| [Decisions owed](#decisions-owed) | Choices for Noah or engineering | Noah, engineering | Decision |
| [After the pilot](#after-the-pilot-candidates) | Candidates, not commitments | Decided on what the pilot shows | Candidate |

## Rules for whoever does this

- **Shared things go in this repo; product-specific things stay in the product repo.** Handoff's judgment is
  shared (`skills/handoff.md`); its gate and Coke's standards stay in Coke.
- **Nothing may depend on a person remembering a step.** If a step matters, the app or the agent does it.
- **Never edit main-process files (`workspace/src/main/`) while an agent is running** in the dev app: it
  restarts and can kill the run. Check first, or work in a temporary `git worktree` and bring the commit over.
- **Never `git checkout` in Noah's Coke repo.** Make Coke edits in a temporary worktree of
  `noah/flock-designer`, and remove it afterwards.
- **Commit only your own files**, as Noah, with **no `Co-Authored-By` trailer**.
- **Ask before changing a contract, or a step's order or meaning.** The reversal of where the reviews
  happen (to Handoff) was approved by Noah on 2026-10-06.
- Prototypes and runs use mock data only.

## What is still to do

### 3.6 — Pilot and decision (was C5)

**Human.** Two or three real projects reviewed through the app by people **outside design** — a PM and
an engineer at minimum. **Scope (2026-10-07):** one loop. A designer makes a prototype; a PM opens it in the
app and comments; Address acts on the comments; the prototype is moved into the code; Hand off gives an engineer
the branch. A designer comfortable with the setup may also start codebase work directly. **Not in scope:**
shared previews of codebase work (engineering's own PR previews cover delivery), and codebase iterations beyond
I1. The check that matters most: a reviewer with a second GitHub account, no checkout and only the app can open a
prototype and comment.

**Done when:** the team decides to keep it, change it, or stop, on what happened: did they open it,
did they comment, how long from share to first comment, what did they say about installing it.

### First real runs of what is built

These pass their tests. None is *done* until someone has watched it work, and Claude does not close them.

| # | What to run | It proves | Who |
|---|---|---|---|
| 1 | A prototype made from a real request (3.7). A first run exists (admin-usage: about 6 minutes, built first time); judging it is Noah's | The page is clearly more accurate than the hand-drawn ones, and quicker | Noah |
| 2 | A prototype moved into the code through the app (3.8): the confirmation, the audit, the branch | The audit and branch are a better start than a hand-drawn page would have been | Noah |
| 3 | **Address on a prototype**, with a real agent, on a comment of your own | The agent changes the source, the page is rebuilt and saved, and the comment is marked addressed | Noah |
| 4 | **Address on a codebase comment that is inside the iteration's scope** | The agent changes real code from a comment, which Noah has not yet seen | Noah |
| 5 | **A reviewer with a second GitHub account, no checkout and only the app** opens a prototype and comments | The reviewer path works for someone who is not you. **The check that matters most** | Noah, with a second account |
| 6 | **A prototype moved into the code by a different person** than the one who made it | The prototype is in the design repository, so anyone with the product repository can move it | Two people |
| 7 | **The prototype's comments reach the engineer** after the move into the code | The conversation is not lost at the handover | The pilot |
| 8 | **Take over in Claude Code** during a codebase build, and confirm the conversation opens in VS Code's Claude Code panel | The handover to the editor works. Not yet seen | Noah |
| 9 | One real **Share for review** (3.4), which needs Coke's draft change pushed | Optional now: codebase work is reviewed through engineering's own previews. Only if Share for review is kept | Noah |

### Finish the handoff proof: `admin-usage`

**Goal:** prove the new Handoff guidance on the branch that exposed the gaps. **Noah's call**: it touches his Coke
checkout, which has 14 uncommitted files from the run that was cut off.

| # | Item | Status |
|---|---|---|
| H1 | Run Handoff on `feature/admin-usage` from the app | waiting on Noah |
| H2 | The open review findings, which Handoff must clear or record: the feature flag (declared, and on in design mode); a11y scans scoped narrower instead of the violation recorded; the "Add New Role" action nobody asked for; the stale audit; sample data that drifted from the prototype's; the type error; the unwired test helper; the removed test timeouts | with H1 |
| H3 | Judge it: the Users page works, the Usage tab appears behind its flag, and engineering would accept the diff. Then run a second, different prototype through the same path | after H1 |
| H4 | Permission denials (44 in the first run, 18 for the builder): re-measure after the next run, then widen the allowlist only for what is still denied | after H1 |

**Done when:** `npm run handoff -- admin-usage` passes, `HANDOFF.md` is on the branch, and a second prototype
finishes in one pass without repeating these classes of bug.

### Setup and access

What a designer needs before they can start, and what needs a named person. None of it blocks the pilot's first loop (a prototype reviewed in the app).

#### 1.1 — Decide the rules (was step 1)

**Noah.** The rules were settled while this was written, and the full account is in [Appendix B](flock-designer.md#11--decide-the-rules-as-settled-was-step-1). **What remains is to name the Design System owner**, which 1.5 and 4.2 wait on. Everything else is settled.

#### 1.5 — Design-system agent files: what is still owed (was step 5)

**Human — the Design System owner, once named.** The work itself is done and verified (full account
in [Appendix B](flock-designer.md#15--set-up-the-design-system-agent-files-the-full-account-was-step-5)): the authoring standards exist in
FUI's `.flkd/authoring/`, and the snapshot problem the resolution half was fighting is gone
([step 1.7](flock-designer.md#17--stop-copying-the-design-system-point-at-it-was-d1)). Two approvals remain:

- **Approve the authoring standards** (`authoring/components.md` and `authoring/stories.md` in
  `flock-react-component-lib`).
- **Confirm the component-gap destination** — the FUI repository, reviewed by
  `@flocksafety/frontend-guild` — is the right process.

**Done when:** the owner has approved both. Nothing here blocks the steps below.

#### 4.1 — Designer environment access (was step 18)

**Noah, with whoever owns the internal registry; then a test designer.** Split out of
[step 2.2](flock-designer.md#22--make-the-product-runnable-on-mock-data-was-step-8) on 2026-09-28, because everything left in
it needs access or a person rather than code.

**What step 2.2 found.** Design mode works — the real shell renders on fixtures, verified from
screenshots. But a **fresh clone cannot install anything**: `npm ci` fails with `401`, because
**1,320 of the 1,428 packages in `package-lock.json` resolve through AWS CodeArtifact**, Flock's
internal registry, and a designer has no credentials for it. GitHub Packages was never the problem.

- **Confirm the correct AWS SSO command.** `aws login` is a guess in
  `src/prototypes/DESIGN-MODE.md`, explicitly marked unconfirmed. The domain, owner, repository and
  region in the `codeartifact login` line are read from the registry URL and are right; the
  credential step is not. A designer following a wrong AWS command fails exactly like they would
  have with the GitHub misdiagnosis that step 2.2 already had to correct.
- **Provision designer access** to that registry. The plan owner confirmed on 2026-09-28 that
  designers are meant to have it.
- **Verify `npm ci` on a fresh clone.** This is the only remaining technical unknown from step 2.2:
  `msw`'s 43 lockfile entries were **ported by hand** because no install was possible, and **no
  clean `npm ci` has ever run against them.** If the port is wrong, the symptom is design mode
  failing rather than an obvious install error — so this must be checked before a designer sees it,
  not after.
- **Decide whether the 12-hour token expiry needs mitigating.** Provisioning does not fix it. Every
  designer will repeatedly hit a setup that worked yesterday and does not today, with an error
  naming npm rather than AWS. `DESIGN-MODE.md` documents it as expected behavior, which is the
  cheapest mitigation and may be enough — but it is recurring friction of the kind that produces
  quiet abandonment rather than complaints, so the friction log should watch for it.
- **Then run the unaided designer test** — a designer who has never run Coke, given only the README
  and `DESIGN-MODE.md`, with no help. Record where they stick and for how long.

**Done when:** a designer with no prior setup runs `npm ci` successfully and reaches a running app
on mock data unaided, and the result is in the friction log.

#### 4.2 — Ship the design-system context in the package (was step 17)

**Design System owner, with a developer.** Much smaller since [step 1.7](flock-designer.md#17--stop-copying-the-design-system-point-at-it-was-d1) removed the snapshots this step existed to keep current. Deferred here
deliberately: Phases 1–3 work against a sibling checkout, which is enough to build and prove the
workflow. This closes the class of problem rather than managing it.

**Why it is not just a packaging task.** [Decision 1](flock-designer.md#decisions-the-audit-raises) recommends
shipping `.flkd` inside the published package so the context always matches the lockfile. That is
right, but on its own it makes staleness *reliable* rather than absent, because **there is no
generator**: `component-manifest.json`, `tokens.json`, and `deprecated-components.json` were produced
once in `0f25abd` and have never been regenerated. Publishing a manifest nothing regenerates just
distributes the stale one on a schedule.

- **No generator is needed, and the snapshots are gone** — see
  [step 1.7](flock-designer.md#17--stop-copying-the-design-system-point-at-it-was-d1). This step used to exist largely to
  keep a copy of the design system's facts in step with the design system. There is no copy. What
  remains here is smaller and is about distribution only: whether the judgment files in `.flkd/`
  travel with the package rather than requiring a sibling checkout.
- ~~**Decide what `cokeUsages` and `common` become.**~~ **Settled by deletion, 2026-09-29.** The
  fields described one consuming product inside a design-system artifact, which made the manifest
  impossible to build from this repository alone. The manifest is gone and they went with it.
- **Ship `.flkd` in the package.** Today `package.json` has `files: ["build", "dev/postinstall.ts"]`
  and nothing copies `.flkd` into `build/`. **Lower stakes now** — what would ship is judgment that
  changes rarely, not data that goes stale, so a sibling checkout being slightly behind costs much
  less than it used to.
- **Reverse the resolution order in practice.** Both repositories already list the package first; it
  falls through to the checkout because the package has no `.flkd`. When this lands, nothing in
  either repository changes.
- ~~**Drop the release-tag requirement**, and turn `validate.py`'s staleness NOTE back into a
  failure.~~ **Both gone, 2026-09-29.** The staleness NOTE and the version chain it belonged to were
  removed with the snapshots; `validate.py` reads the installed package, so there is no stale
  generated context to report on and no tag to check out against.

##### Also here: the org transfer

Batched here because it needs the same thing everything above needs — someone with org permission.

- **Transfer `noahshrader-flock/flock-designer` to `flocksafety/flock-designer`.** Settings →
  Transfer ownership, from either side. It is a one-step GitHub operation that keeps full history,
  so nothing gets redone and no reference in this document changes meaning.
- It was carried as step 1.6's open item until 2026-09-28, which made a finished step look unfinished.
  Step 1.6's work is done; this is an address change and belongs with the other permissioned items.

**Done when:** a product installs the package and reads FUI context that provably matches the
installed version, with no sibling checkout and no tag discipline required — and the shared
repository lives at `flocksafety/flock-designer`.

#### 4.3 — Decide if the managed harness is needed (was step 11)

**Noah.** With the friction log from 2.2 and 2.3 in hand, decide whether designers are still
blocked from running the product.

The managed harness is the single most expensive thing in this plan — a product-specific adapter
that clones at a pinned revision, resolves FUI, and generates a runnable near-replica, per product.
It exists for designers who cannot run the product locally, and step 2.2 addresses that far more
cheaply. Deciding in advance would invert the evidence.

**Done when:** the decision is recorded in the change log either way. If yes, see
[the managed harness](flock-designer.md#if-step-11-says-yes-the-managed-harness).

### After the pilot: candidates

Not commitments. Each is decided on what the pilot shows.

- **The app clones the product repository and installs its packages for the designer.** Today a designer clones and runs `npm ci` once, and the app says what is missing. Doing it for them removes the largest setup step. It needs to detect missing access to the private packages and say what to ask for, show progress for a slow install, and clone somewhere discovery will find it. **The first thing to build if the pilot shows setup is where designers get stuck.**
- **A small web viewer for reviewing prototypes**, so a reviewer who only comments need not install the app or have Claude. A prototype is a static page in the design repository, so this is cheap. **Evidence (2026-10-07):** in the design-team channel someone asked how to share prototypes with internal stakeholders who do not have Claude access, and the replies were "get them access," "record a Loom" and "export as HTML." PMs and directors without access was the named problem. A reviewer would still need read access to the design repository, which is a separate item under *Waiting on other people*.
- **A standalone export of a prototype**, one HTML file that opens locally with no app, as the same thread suggested for other tools. Today a saved page points to shared font files stored beside it (`projects/_shared/`), so it is not a single file; an export would inline them. Smaller than the viewer, and useful on its own for sending a prototype to someone.
- **Codebase iterations beyond I1.** Codebase work is one branch because it is meant to ship. A second would be for a designer who needs another attempt after engineering asks for changes; it needs a branch name, a rule for which one engineering takes, and a Handoff per iteration. Design it from a real case.
- **Deleting a prototype.**
- **A way in for people without Claude Code**, which needs Flock IT and Anthropic on authentication.

## Decisions owed

Nothing here blocks the pilot.

| # | Decision | Notes |
|---|---|---|
| 1 | How design mode turns a new view's flag on | Guidance now says to add it to the LaunchDarkly mock in `src/mocks/handlers.ts`; engineering may prefer another way |
| 2 | Coke's `.github/instructions` still says to use `src/…` imports, which crash the app on load | Engineering's file; agents may not edit `.github/` |
| 3 | Does Coke support dark mode? | Prototypes render dark on a dark Mac |
| 4 | May prototypes carry the MUI X licence key? | The grid shows a watermark without it |
| 5 | When does `.flkd` go onto `develop`? | Agents read guidance from the code branch, else the accepted checkout |
| 6 | Pin a model per agent, or use a different one for the reviewers? | Not planned unless asked. Today every agent uses the default |
| 7 | **Keep or remove Share for review** (the draft pull request and deploy preview in the More menu) | Built and working, but it reaches into delivery, which is engineering's. Decide after the pilot |
| 8 | **Should the More menu stay disabled until the page is up?** | It also hides Open in VS Code and Build in the codebase while a build is running or has failed, which is when they are most useful. The alternative is to disable only Open in browser and Copy link |
| 9 | Whether the codebase side of the iteration switcher, which shows only I1, should be hidden until there is more than one | It can read as a promise the app does not keep |

## Waiting on other people — never blocks a step

**These are not steps and they are not in the sequence.** Each needs a person who is not Claude, and
none holds up the work in front of it.

| Needs | Who | What it unblocks |
|---|---|---|
| Name the Design System owner | Noah | 1.1, 1.5 and 4.2 |
| Move the design repo from `noahshrader-flock` to the `flocksafety` org | Someone with org permission | Everyone else's access; rollout |
| Register the GitHub App **for the org** and install it on the design repo | An org owner | Rollout |
| `build:design` and CI for `fd/*` branches — **drafted**, with the prototype standards: commits `1ca7d523`, `e02c408c`, `ff5e3f71`, `65e9a700`, `c8f0447d` on Coke's `noah/flock-designer`, not pushed | Coke engineering, to merge it | 3.4 for every designer, not just those whose branch carries the change |
| **Decide who may open a shared preview.** *No longer needed for the pilot (2026-10-07): codebase work is reviewed through engineering's own PR previews, and prototypes are not hosted. It still stands if Share for review is kept.* Coke's existing PR previews answer an anonymous request with the page (checked 2026-10-05: HTTP 200 from S3, no login), at an address that is just the pull request number. The plan's rule is no public access by default | Security / platform | 3.4: a design preview is mock data only, but is public to anyone with the link until this is decided |
| Read and write access to the **design repo** for PMs (not Coke) | GitHub admin, or Noah as owner | 3.4 and 3.6: a PM cannot comment without it |
| How internal Mac apps are deployed here, what they require (usually signing), and the turnaround | IT | Rollout |
| A security look at an app that reads SSO-protected pages and holds a token | Security | Closing 3.3 |
| Whether a managed harness is needed ([step 4.3](#43--decide-if-the-managed-harness-is-needed-was-step-11)) | Noah | Only if local setup fails designers |
| Registry access and the unaided designer test ([step 4.1](#41--designer-environment-access-was-step-18)) | Noah + the registry owner | Real designer onboarding |
| Package and org items ([step 4.2](#42--ship-the-design-system-context-in-the-package-was-step-17)) | Design System owner | Smaller now than it was |

**Status values:** Not started, In progress, **Built — awaiting check**, Complete. A step is Complete only when its "done when"
is met and the evidence is cited in the [change log](flock-designer.md#change-log).

## How steps are worked and closed

### What counts as a step

**A step is something Claude can finish.** If it needs another person, it is not a step — it goes in
*Waiting on other people* below, where it never blocks anything.

This rule exists because the sequence briefly contained steps that could not be completed by anyone
doing the work, which made "what is next" unanswerable: every answer came with two dependencies
attached. Human verification still happens, and the place for it is already built — review records,
the friction log, the handoff document. It just does not sit in the critical path.

### A step does not close with its own work unmet

**A step is Complete only when nothing in its own scope is outstanding.** Not "outstanding but
recorded" — outstanding.

This rule exists because the opposite kept happening: step 2.1 closed with "opened" never verified,
step 2.2 closed having built half of what it owned, and the automated accessibility scan was recorded
**"not run"** on four consecutive artifacts without anyone fixing the cause. Each record was honest.
The honesty became a release valve — writing the gap down felt like discharging it.

**So, before marking anything Complete:**

- Is every item in this step's own "done when" actually met, not merely recorded?
- Does any artifact from this step carry a "not run" that this step was supposed to make runnable?
- If something is genuinely out of scope, does it name the step that owns it? An orphaned gap is
  nobody's, which means it is permanent.

### How a step gets marked Complete

**Every step names how it is checked, and a step whose check needs a person cannot be closed by
Claude.** This rule exists because it was broken: step 2.1 was marked Complete with "opens" never
verified, and step 2.2 was closed having implemented half of what it owned.

| Check type | Meaning |
|---|---|
| **Mechanical** | A command anyone can run. If it passes, the step is done |
| **Cold start** | A fresh session in the checkout, plan unavailable, answering from repository files alone |
| **Human** | A named person has to do something. **Claude may not mark these Complete** |

## Open questions

Decisions already settled in this plan are not repeated here. What remains genuinely open:

*Answered since this list was written: **device flow works with the company's SSO** (3.2, confirmed in use since
2026-10-05).*

- **Is Mac enough for now?** Windows roughly doubles the distribution work. Decide before 3.6.
- **May a prototype carry the MUI X licence key?** Without it, `FSDataGrid` shows a "Missing license key" watermark. It is the prototype, not a bug, but it is visible. The key comes from Coke's environment, and a prototype is kept in the design repository.
- **When does `.flkd/` reach `develop`?** Coke's Flock Designer guidance is only on `noah/flock-designer`. A prototype reads it from the branch it is based on when that branch has it, otherwise from the accepted checkout's working tree.
- **How much of Coke should carry stable names?** Measured 2026-10-06: **131 `data-e2e-ref` across 49 of 344
  component files**, mostly on leaf elements rather than containers. A pin on an element with no stable name of
  its own is only as durable as its nearest named ancestor, so this is the ceiling on how well a comment survives
  the code changing — and the lever is Coke's markup, not this app. Adding stable names to section containers is
  a small change engineering benefits from anyway. **Open:** whether to ask for that, and of whom.
- **Who owns the Electron upgrade cadence**, and who holds the signing certificate IT requires?
- **How long do preview deployments live**, and what happens to the comments on an expired one?
- **Does a PM need anything beyond read access** to the design repo to comment on its issues? GitHub's docs say no; confirm with a real PM account.

- **Which fixture source should own long-lived design-mode data, who refreshes it, and how drift from
  real API shapes is detected.** Noah noted 2026-09-29: engineering is building (or has built) a mock
  data service, intended for this. Two things need to be known before it changes anything here: **(1)**
  does it generate fixture files ahead of time (a drop-in replacement for the hand-copied
  `cypress/fixtures/` → `src/mocks/fixtures/` pattern Coke uses today, and low-risk), or does a running
  prototype call it live over the network (a materially different guarantee — design mode's whole
  safety model today is that a prototype makes zero real network calls, so nothing it does can reach
  anything production, even by accident); and **(2)** who owns it and what it is called, so it has a
  named owner here instead of "engineering" in the abstract. Not resolved — recorded so it is not lost
  before those are known.
- When does a review need real-shell validation rather than a reconstructed host? Step 2.3 should produce a rule of thumb rather than a policy written in advance.
- Which visual or interaction checks can be automated without making the workflow slow enough that designers route around it.
- Whether the older `fd/` prototype branches should expire from the product repository after some period, given that they never merge and accumulate indefinitely.
- How the team protects the distinction between a prototype that is credible and code that is production-ready, once previews are easy to share widely.

## Risks and ongoing costs

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Electron upkeep** | A new major version ships every 8 weeks and only the latest three are supported ([policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)) | Someone owns an upgrade at least about twice a year. **The largest standing cost** |
| **Org SSO unverified** | GitHub's docs confirm device flow needs no secret for GitHub Apps and gives fine-grained permissions, but say nothing about org SSO | 3.2 tests with a real company account |
| **The CI change** | Without a mock-data build the link is a login screen on real dev data — also a breach of the data rule | Coke engineering; drafted by Claude |
| **Reading SSO-protected pages** | The app displays and inspects internal pages | The preview gets no bridge; security review before 3.3 closes |
| **Anchoring drift** | Selectors break when markup changes; `data-e2e-ref` coverage is unmeasured | Route + selector + text + crop; degrade to a page-level comment |
| **Deployment to laptops** | Unsigned Mac apps are blocked by default, even inside a company | The IT question above |
| **Preview expiry** | A comment's page can disappear | Comments carry commit and route; rebuild from the branch |
| **PM access** | PMs need GitHub accounts and read access to the design repo | GitHub admin; not Coke |

## Success measures

**Intelligence**

- The first generated direction cites the right FUI and product context often enough that reviewers spend their time on product decisions, not correcting generic UI.
- New patterns are deliberate and traceable rather than accidental agent invention.
- Prototype lessons become reusable guidance only when evidence supports them.
- An Explore request still completes in one sitting after the artifact matrix is adopted.

**Runtime**

- A small interactive Flock-native prototype can be run and reviewed without production dependencies.
- A designer who has never run Coke can reach a running app and a reviewable prototype in a single sitting, unaided.
- Runtime checks catch failures that typecheck and lint do not.
- Real-shell validation is available for the questions that need it, without weakening prototype isolation.

**Workspace**

- A designer can see and correct the context before generation.
- A reviewable prototype can answer a real product question in one working session.
- Reviewers can distinguish system parity, product fit, and implementation safety.
- Every artifact remains usable without the app, because its context and decisions live in the repository.
- Security boundaries are narrow enough that a renderer or agent task cannot gain arbitrary local-machine access.

**Review**

- A PM or engineer who has never seen Flock Designer can sign in, open a prototype, and leave an element-anchored comment within a few minutes of first launch, unaided.
- A designer learns a comment arrived without going to look for it.
- A comment placed on an element is still on that element after a reload and a resize.
- Comments are readable by the agent with no app involved, and an agent instruction can act on them.
- Nothing in the review path needs a server, a database, or a second client.

**Handoff**

- Engineers receive a clear statement of what was learned, what is mocked, and what must be rebuilt.
- Engineering can tell exactly what is prototype evidence and what remains an implementation responsibility.
- Repeated prototype feedback makes the context better rather than remaining trapped in a chat thread.

### Near-term definition of success

Within a small number of real prototype requests, Flock Designer should make it possible to:

- move from a focused brief to a reviewable Flock-native flow in one working session;
- cite the FUI and product patterns used rather than rely on agent memory;
- show the state that makes the product decision testable;
- explain what is real, mocked, intentionally invented, or still unresolved;
- give engineering a handoff that reduces ambiguity without asking them to merge prototype code.

The first proof is not a polished platform. It is two or three real decisions that travel farther, with less translation and less loss of product context.
