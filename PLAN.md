# Flock Designer

Updated 2026-10-06. **This is the only Flock Designer document.** It replaced the separate plan,
context, and overview files, which stated the same things three times and made every change cost
three edits. Everything that was in them is here.

Flock Designer is an internal design capability: a way to go from a product question to a
reviewable, Flock-native prototype without losing the context that normally disappears between a
brief, a Figma exploration, and a frontend implementation. A designer explores quickly, then
progressively grounds the work in the real component system, the real product patterns, and the real
constraints. The output becomes more credible as the decision requires — and it is never silently
treated as production code because it happens to be written in React.

It does not replace design judgment, frontend engineering, Figma, or the normal product process. It
is the connective tissue between them. It begins around exploration and prototype work, then rejoins
the wider product process at readiness to build.

> ### Where we are
>
> **Everything that can be built is built.** Phases 1 and 2 are done apart from two approvals only a
> person can give, and **Phase 3 is done through 3.5**: a designer builds in the real codebase, the
> team comments on it, and an agent acts on a comment one at a time and says what it did.
>
> **21 of 25 steps are done.** The full list, every step marked off in order, is
> [The sequence](#the-sequence): Phases 1 to 4, numbered 1.1 to 4.3.
>
> **New on 2026-10-06: quick prototypes.** [3.7](#37--quick-prototypes) builds one shareable page from the
> product's real components with no environment setup, and [3.8](#38--move-a-quick-prototype-into-the-code)
> moves one into the code. Both are built and tested; each needs its first real run.
>
> **What remains needs other people, not code.** 3.6 is the pilot: two or three real projects reviewed
> by a PM and an engineer, and then the decision to keep it, change it or stop. Phase 4 is rollout —
> designer access and the design-system package — and it can start any time.
>
> **Still owed by Noah:** one real share (3.4), which needs Coke's draft change pushed; the security
> look at anonymous preview addresses; and merging the Coke baseline commits for engineering.
>
> The detail for every finished step is in [Appendix B](#appendix-b--what-was-built-and-why), including
> [what using 3.5 for real changed](#what-using-35-for-real-changed-2026-10-06) on 2026-10-06.
>
> This document was restructured on 2026-10-05 so the plan covers only what remains. Nothing was
> deleted: completed work moved into the appendices, and the [change log](#change-log) says why.

- **[The plan — what remains](#the-plan--what-remains)**: the direction, **the four phases and every step in order**, the asks to other people, the decisions made, the risks, and the open questions.
- **[Appendix A — How the system works](#appendix-a--how-the-system-works)**: principles, contracts and reference for what is built. Consulted while working.
- **[Appendix B — What was built, and why](#appendix-b--what-was-built-and-why)**: every completed step with its evidence, and the status blocks as they stood.
- **[Appendix C — Superseded designs](#appendix-c--superseded-designs)**: the earlier decision gates, Workspace architecture, and old steps 14–16, kept for the reasoning.
- **[Change log](#change-log)**

---

## How to maintain this document

- **The repository is the real artifact.** When a contract is implemented, add an `Implemented in:` line under its heading with the repository path. From then on the repository file is authoritative and this document describes it.
- A change to an implemented contract goes through a repository PR. Update this document once the PR is approved. A change proposed here is not in effect until the matching PR lands.
- If the two disagree and nobody approved the difference, treat the repository as current and flag the divergence. Do not silently edit either one to match the other.
- **If building reveals this document is wrong, do not work around it silently.** Record the conflict in the [change log](#change-log) prefixed **Open:**, say what was found, and ask.
- After any change: add a [change log](#change-log) row, and check that the [sequence](#the-sequence) table, the "Where we are" block, and the step's "done when" still agree.

### A contract without a step never gets built

**This has happened three times**, and each time the contract was perfect while the thing did not
exist:

| Described in a contract | Never scheduled as a step | Cost |
|---|---|---|
| The codebase path | Unbuilt for nine steps, while every proof went to `src/prototypes/` | The main thing being built was missing |
| Real-shell design mode as a place to *work* | Step 2.2 built the "run the product" half and closed | Prototypes still reconstruct their chrome — now [step 2.4](#24--run-a-prototype-in-the-real-shell-was-a2) |
| A prototype being openable | Step 2.1 closed on "built, **opened**, reviewed" with opening unverified | Nothing served prototypes at all |

**So: when a contract says something exists, find the step that builds it.** If there is no step,
either write one or mark the contract `Implemented in: **Not yet**` and say which step will own it.
A contract with no owning step is a description of something imaginary.

**And a step whose "done when" needs a person cannot be closed by Claude.** Step 2.1 and step 2.2 were
both marked Complete on claims nobody had tested. The sequence marks each step **mechanical**, **cold
start**, or **human** for exactly this reason.

**An agent may, without asking:** fix a broken link or typo; replace a duplicated restatement with a
link; propagate a change a person has already approved; update a step's status when its "done when"
is met and the evidence can be cited; record a new observed fact with its source.

**An agent must ask first:** to change a contract, a step's order or meaning, a decision gate's
recommendation, the accessibility target, or anything in Part I's purpose, principles, or non-goals.

---


# The plan — what remains

## The direction

**Flock Designer becomes where the team looks at each other's work and comments on it.**

The authoring half exists: a designer builds a prototype in the real codebase with the agent and
shares it. What is missing is the other half — someone who did not build it opens it, sees what it
is, and says what they think, **without installing a toolchain, cloning anything, or learning git.**
That is the function [Magic Patterns](https://www.magicpatterns.com/docs/documentation/collaboration/inline-comments)
has and Flock does not, and it is what the design team is actually missing.

**One app, two modes.** The Electron app built at [step 3.1](#31--build-the-workspace-local-loop-was-step-13)
(`flock-designer/workspace/`) is renamed **Flock Designer**. *Author mode* is what it did first and
needs a checkout; *reviewer mode* is new and needs only a GitHub account. **As of 2026-10-05 the window
shows only the reviewer side**, as a **Projects** tab in a fixed top bar with the account menu on the
right. The Author screen is hidden, not deleted from the main process; it returns as a GitHub-backed
list of repositories rather than a folder picker.

| What a reviewer does | What happens behind the scenes |
|---|---|
| Opens the app and clicks **Sign in with GitHub**, once | GitHub handles identity, including the company's Okta SSO |
| Sees a list of projects | The app reads the design repo through GitHub's API. No clone, no git |
| Clicks one and sees the prototype | It was built and hosted when the designer shared it |
| Clicks an element and types a comment | Saved as an issue comment in the design repo; the designer is notified |

**GitHub is the only backend.** Nothing here needs a server or a database of ours.

| Piece | Where it lives |
|---|---|
| Who you are | GitHub sign-in by **device flow** through a **GitHub App** — no client secret, so no server — whose token can touch only the design repo's issues. SSO is between GitHub and Okta; the app never touches it |
| Projects and iterations | The design repo, read through the API |
| Comments | **Issue comments in the design repo, one issue per iteration.** Read access is enough to comment; authors keep edit access. Keeps PMs out of the Coke repo |
| The prototype | A preview CI builds from the iteration's branch — which **must be a mock-data build** |
| The durable record | Exported to `review.md` in the project folder, so the agent reads comments with no app |

**How a comment is anchored.** Click an element, as Magic Patterns does — its docs say comments are
"tied to elements in the design," so they survive a resize. Ours store the route, the element's
selector (preferring `data-e2e-ref`, which FUI components already emit), the nearby text, the
viewport, the commit, and optionally a screenshot crop. **If the element is gone, the comment
degrades to a page-level comment that says so.** Dragging out a region is deferred.

**What was considered and rejected**, so it is not re-litigated:

| Option | Why not |
|---|---|
| A comment overlay built into the prototype itself | Needs a small server to finish a web sign-in, and a change to Coke's build |
| A Chrome extension | Still an install, plus a store listing, updates and permission review; anchoring on someone else's page is brittle |
| A hosted web app that also *builds* prototypes | That is the managed harness — cloud builds against Coke. Closest to Magic Patterns and by far the most expensive; [step 4.3](#43--decide-if-the-managed-harness-is-needed-was-step-11) decides it on evidence |
| A separate comments service | A server and database to own, for something GitHub already does |

**The line to hold: no server, no database, no second client.** Every "weird web of stuff" risk
traces to adding one of those.

## The sequence

**Four phases, every step in order.** ✔ done · ◐ built, awaiting a check · ▶ next · ○ not started ·
⏸ needs a person. Steps are numbered by phase: **1.1 to 4.3**. The last column is what the step was
called before 2026-10-05, so history still resolves.

### Phase 1 — Foundation: the rules, the context, and the shared repository

*Done apart from two approvals. If we stopped here, the agent already has the right context.*

| # | Step | Status | Evidence, or what it needs | Was |
|---|---|---|---|---|
| 1.1 | [Decide the rules](#11--decide-the-rules-was-step-1) | ⏸ Needs a person | Name the Design System owner. Everything else here is settled | step 1 |
| 1.2 | [Set up the first files](#12--set-up-the-first-files-was-step-2) | ✔ Done | `4538812e` | step 2 |
| 1.3 | [Rename existing prototype work](#13--rename-existing-prototype-work-was-step-3) | ✔ Done | Nothing needed renaming | step 3 |
| 1.4 | [Fix the product repository files](#14--fix-the-product-repository-files-was-step-4) | ✔ Done | 1,006 checks; cold start passed | step 4 |
| 1.5 | [Design-system agent files](#15--design-system-agent-files-what-is-still-owed-was-step-5) ([full account](#15--set-up-the-design-system-agent-files-the-full-account-was-step-5)) | ◐ Built — awaiting approval | Standards written and verified; the Design System owner approves them | step 5 |
| 1.6 | [Create the shared repository](#16--create-the-shared-repository-was-step-6) | ✔ Done | `3d15ae9`. Moving it to the `flocksafety` org is 4.2 | step 6 |
| 1.7 | [Stop copying the design system](#17--stop-copying-the-design-system-point-at-it-was-d1) | ✔ Done | `873aba9`, `bf5b4c13` | D1 |

### Phase 2 — Working in the codebase: prototypes and real code, on mock data

*Done. If we stopped here, a designer can build a prototype or a real change, and engineering can take the branch.*

| # | Step | Status | Evidence, or what it needs | Was |
|---|---|---|---|---|
| 2.1 | [Confirm the prototype harness](#21--confirm-the-prototype-harness-was-step-7) | ✔ Done | Reviewed 2026-09-29; the watermark and icon defects it found are fixed | step 7 |
| 2.2 | [Make the product runnable on mock data](#22--make-the-product-runnable-on-mock-data-was-step-8) | ✔ Done | The real shell renders on fixtures. Designer install access is 4.1 | step 8 |
| 2.3 | [Prove it on real decisions](#23--prove-it-on-real-decisions-was-step-9) | ✔ Done | Four proofs; the resume test passed | step 9 |
| 2.4 | [Run a prototype in the real shell](#24--run-a-prototype-in-the-real-shell-was-a2) | ✔ Done | `667c5070` | A2 |
| 2.5 | [Prove the codebase path](#25--prove-the-codebase-path-was-b1) | ✔ Done | `56aee3c3` | B1 |
| 2.6 | [Build the handoff](#26--build-the-handoff-was-b2) | ✔ Done | `3f137cd6`, `cef176be` | B2 |
| 2.7 | [Close the review and evidence gaps](#27--close-the-review-and-evidence-gaps-was-b3) | ✔ Done | The accessibility scan runs; the handoff gate passes on all six work branches | B3 |

### Phase 3 — Flock Designer: the whole team browses and comments

*Done through 3.5. 3.7 and 3.8, quick prototypes, are built and need their first real runs. 3.6, the pilot, needs other people. One real share (3.4) is still owed by Noah, which needs Coke's draft change pushed.*

| # | Step | Status | Evidence, or what it needs | Was |
|---|---|---|---|---|
| 3.1 | [Build the local authoring app](#31--build-the-workspace-local-loop-was-step-13) | ✔ Done | `158eab3`; confirmed working | step 13 |
| 3.2 | [Sign in, and the comment store](#32--prove-sign-in-and-the-comment-store-was-c1) | ✔ Done | Sign-in, the project list and automatic publishing of iteration records. Confirmed by Noah 2026-10-05 | C1 |
| 3.2.5 | [Show who is on each project](#325--show-who-is-on-each-project) | ✔ Done | Every project lists everyone who has committed to it, on any iteration. Confirmed by Noah 2026-10-05 | added 2026-10-05 |
| 3.3 | [Open a preview and comment on an element](#33--open-a-preview-and-comment-on-an-element-was-c2) | ✔ Done | Click an element in a preview, comment, and see it marked on reopening; verified in real Electron against a real click, and confirmed by Noah 2026-10-05. The security look is owed by Security (see *Waiting on other people*) | C2 |
| 3.3.5 | [Prove it locally, start to finish](#335--prove-it-locally-start-to-finish) | ✔ Done | **New prototype** creates the branch, runs the agent and the preview, and opens it with pins. A real Coke prototype was run through the app's own services and pinned. Confirmed by Noah 2026-10-05 | added 2026-10-05 |
| 3.4 | [Share for review](#34--share-for-review-was-c3) | ✔ Done | One click pushes the branch, opens a draft pull request, waits for the deploy and records the address. Verified end to end in real Electron against a throwaway remote and a stand-in `gh`. **Still owed by you:** one real share, which needs Coke's draft change pushed | C3 |
| 3.5 | [Close the loop](#35--close-the-loop-was-c4) | ✔ Done | A comment carries its commit, state, element and a picture; **Address** on each comment reads it fresh, writes `comments.md` and starts a real agent, which marks the comment addressed with the commit it made. Run for real against Coke on 2026-10-06 | C4 |
| 3.6 | [Pilot and decision](#36--pilot-and-decision-was-c5) | ⏸ Needs people | Real projects reviewed by people outside design | C5 |
| 3.7 | [Quick prototypes](#37--quick-prototypes) | ◐ Built — run once, awaiting Noah's call | First React run 2026-10-06 (admin-usage q1): the real shell and components, about 6 minutes, 51 KB of source, built first time. Closing it is Noah's judgement (**human**) | added 2026-10-06 |
| 3.8 | [Move a quick prototype into the code](#38--move-a-quick-prototype-into-the-code) | ◐ Built — awaiting a real run | An audit from the prototype's marks, then real code on `feature/<project>`; never yet run (**human**) | added 2026-10-06 |

**The goal is the whole loop across two people:** a product manager sees an iteration and comments, and the designer pulls those comments and changes the prototype locally with the agent. **3.4 is the PM's half** (without a hosted preview and read access to the design repository the PM has nothing to open); **3.5 is the designer's half** (comments the agent can act on). Both are built. What is left is 3.6: running it with people outside design, and deciding.

**What each step left behind:** 3.2 sign-in and a browsable list of every project; 3.3 click-to-comment on a
prototype, against any preview; 3.4 the full loop, author shares and reviewer opens and comments; 3.5 comments
the agent acts on, one at a time, on your own machine. **The question 3.6 answers is whether people outside
design use it.**

### Phase 4 — Rollout and open decisions

*Needs other people, and none of it holds up Phase 3. It can start any time.*

| # | Step | Status | Evidence, or what it needs | Was |
|---|---|---|---|---|
| 4.1 | [Designer environment access](#41--designer-environment-access-was-step-18) | ⏸ Needs a person | Registry access, then the unaided designer test | step 18 |
| 4.2 | [Ship the design-system context in the package](#42--ship-the-design-system-context-in-the-package-was-step-17) | ⏸ Needs a person | The org transfer and packaging; the Design System owner | step 17 |
| 4.3 | [Decide if the managed harness is needed](#43--decide-if-the-managed-harness-is-needed-was-step-11) | ⏸ Conditional | Only if local setup fails designers | step 11 |

Each finished step's detail, with its evidence, is in [Appendix B](#appendix-b--what-was-built-and-why).

**How the work flows.** Build step after step. A step whose last check needs a person is marked
**Built — awaiting check** and the next step starts anyway; it is not closed until that person has
done it, and Claude never closes it. The work stops only at these points:

| Stop | When | What I need | What I do meanwhile |
|---|---|---|---|
| 1 | Before 3.2 | **Cleared 2026-10-05** — Noah registered the GitHub App and sent its client ID | — |
| 2 | End of 3.2 | **Cleared 2026-10-05** — Noah confirmed 3.2 | — |
| 3 | End of 3.3 | **Cleared 2026-10-05** — Noah confirmed 3.3. The security look is in *Waiting on other people* | — |
| 4 | 3.4, end to end | **Your first real share**, and Coke engineering merging the `build:design` change. Until it is merged, a prototype branch carries the change itself (see 3.4) | App side is built and tested against a stub; the Coke change is drafted. Start 3.5 |
| 5 | 3.6 | Real projects reviewed by people outside design | Nothing — this is the decision |

Everything else — the builds of 3.2, 3.3 and 3.5, and 3.4's app side — runs without waiting.

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

### What counts as a step

**A step is something Claude can finish.** If it needs another person, it is not a step — it goes in
*Waiting on other people* below, where it never blocks anything.

This rule exists because the sequence briefly contained steps that could not be completed by anyone
doing the work, which made "what is next" unanswerable: every answer came with two dependencies
attached. Human verification still happens, and the place for it is already built — review records,
the friction log, the handoff document. It just does not sit in the critical path.

### How a step gets marked Complete

**Every step names how it is checked, and a step whose check needs a person cannot be closed by
Claude.** This rule exists because it was broken: step 2.1 was marked Complete with "opens" never
verified, and step 2.2 was closed having implemented half of what it owned.

| Check type | Meaning |
|---|---|
| **Mechanical** | A command anyone can run. If it passes, the step is done |
| **Cold start** | A fresh session in the checkout, plan unavailable, answering from repository files alone |
| **Human** | A named person has to do something. **Claude may not mark these Complete** |


### 1.1 — Decide the rules (was step 1)

*Written before the 2026-10-05 renumbering: step numbers in the paragraphs below are the old ones. The name map at the top of [Appendix B](#appendix-b--what-was-built-and-why) translates them.*

**Noah. Complete.** Settled over the course of writing this plan rather than in a sign-off meeting:

- The [agent contract](#the-agent-contract), the [artifact matrix](#what-each-piece-of-work-owes), the four credibility levels, and the [request guide](#the-request-guide) are **approved** — they were revised repeatedly while writing this, which is the approval.
- The four decisions below are **settled**.
- **Owners:** Noah owns the sequence and every judgment in it. Claude does the repository work. 1.5 needs the Design System owner, 2.6 needs a receiving engineer, and 3.2–3.6 need engineering — each named when that step is reached rather than in advance.
- **These planning documents live in `flocksafety/flock-designer`**, alongside the standards and the project folders, and move there when 1.6 pushes.
- **Baselines** are a file, not a gate: `.flkd/knowledge/baselines.md` is waiting, and the numbers go in when someone has them. 3.6 is the only thing that needs them.

**Also settled**, costing nothing but agreement: the `fd/<project-id>/iN` branch namespace, the
[project folder](#the-project-folder) layout, and mock or synthetic data only — never production
data or credentials.

### 1.5 — Design-system agent files: what is still owed (was step 5)

**Human — the Design System owner, once named.** The work itself is done and verified (full account
in [Appendix B](#15--set-up-the-design-system-agent-files-the-full-account-was-step-5)): the authoring standards exist in
FUI's `.flkd/authoring/`, and the snapshot problem the resolution half was fighting is gone
([step 1.7](#17--stop-copying-the-design-system-point-at-it-was-d1)). Two approvals remain:

- **Approve the authoring standards** (`authoring/components.md` and `authoring/stories.md` in
  `flock-react-component-lib`).
- **Confirm the component-gap destination** — the FUI repository, reviewed by
  `@flocksafety/frontend-guild` — is the right process.

**Done when:** the owner has approved both. Nothing here blocks the steps below.

### 3.6 — Pilot and decision (was C5)

**Human.** Two or three real projects reviewed through the app by people **outside design** — a PM and
an engineer at minimum.

**Done when:** the team decides to keep it, change it, or stop, on what happened: did they open it,
did they comment, how long from share to first comment, what did they say about installing it.

### 3.7 — Quick prototypes

**Human.** Built 2026-10-06 at Noah's request. **What sets it apart from a codebase feature is what it
needs:** the repository and its packages installed, and nothing else. It never runs the product, so no
environment variables, no backend, no mock-data service.

**New → Quick prototype**, from a repository and a branch, has the agent write **one React file** with the
product's real components, reading the product's code, guidance and installed packages read-only. The app
bundles it (esbuild, against the product's own `node_modules`) into **one page**, and keeps both in
`projects/<id>/quick/`. The page opens in the review screen from a small server in the app, and comments
pin to it as on any iteration. **There is no hand-drawn mode:** without the design system installed the
dialog says what to install and will not start.

**Nothing is refused for being missing.** The agent approximates what the product cannot do and marks it,
one comment line above the part: `@standin` (cannot be done today), `@mock` (stands in for real data),
`@remove` (scaffolding). Unmarked code is the real thing.

**Size.** The design system's fonts are embedded in its stylesheet, about 5 MB per page. Large embedded
files are kept once, by content, in `projects/_shared/`, and served beside every page: a page costs about
0.5 MB in git. The only size limit is GitHub's.

Where it lives: `workspace/src/main/services/quick.ts`, `quickBundle.ts`, `quickServer.ts`; the skill
`skills/build-quick-prototype.md`; Coke's mount recipe and shell reference in
`.flkd/composition/product-shell-recreation.md` (on `noah/flock-designer`).

**Done when:** a real run, from Noah's machine on `noah/flock-designer`, produces a page clearly more
accurate than the two hand-drawn runs, in less than their eight minutes, and it builds.

### 3.8 — Move a quick prototype into the code

**Human.** **Build in the codebase**, on a quick prototype, starts the project's codebase work with the
prototype's source. The agent writes `projects/<id>/audit-qN.md` first, built from the marks: each
`@standin` a decision, each `@mock` a data task, each `@remove` a deletion. Then it moves the unmarked code
into the files where it belongs. Skill: `skills/move-to-code.md`.

**Done when:** one quick prototype from 3.7 is moved into the code and the audit and branch are judged
by Noah to be a better start than a hand-drawn page would have been.

### 4.1 — Designer environment access (was step 18)

**Noah, with whoever owns the internal registry; then a test designer.** Split out of
[step 2.2](#22--make-the-product-runnable-on-mock-data-was-step-8) on 2026-09-28, because everything left in
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

### 4.2 — Ship the design-system context in the package (was step 17)

**Design System owner, with a developer.** Much smaller since [step 1.7](#17--stop-copying-the-design-system-point-at-it-was-d1) removed the snapshots this step existed to keep current. Deferred here
deliberately: Phases 1–3 work against a sibling checkout, which is enough to build and prove the
workflow. This closes the class of problem rather than managing it.

**Why it is not just a packaging task.** [Decision 1](#decisions-the-audit-raises) recommends
shipping `.flkd` inside the published package so the context always matches the lockfile. That is
right, but on its own it makes staleness *reliable* rather than absent, because **there is no
generator**: `component-manifest.json`, `tokens.json`, and `deprecated-components.json` were produced
once in `0f25abd` and have never been regenerated. Publishing a manifest nothing regenerates just
distributes the stale one on a schedule.

- **No generator is needed, and the snapshots are gone** — see
  [step 1.7](#17--stop-copying-the-design-system-point-at-it-was-d1). This step used to exist largely to
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

#### Also here: the org transfer

Batched here because it needs the same thing everything above needs — someone with org permission.

- **Transfer `noahshrader-flock/flock-designer` to `flocksafety/flock-designer`.** Settings →
  Transfer ownership, from either side. It is a one-step GitHub operation that keeps full history,
  so nothing gets redone and no reference in this document changes meaning.
- It was carried as step 1.6's open item until 2026-09-28, which made a finished step look unfinished.
  Step 1.6's work is done; this is an address change and belongs with the other permissioned items.

**Done when:** a product installs the package and reads FUI context that provably matches the
installed version, with no sibling checkout and no tag discipline required — and the shared
repository lives at `flocksafety/flock-designer`.

### 4.3 — Decide if the managed harness is needed (was step 11)

**Noah.** With the friction log from 2.2 and 2.3 in hand, decide whether designers are still
blocked from running the product.

The managed harness is the single most expensive thing in this plan — a product-specific adapter
that clones at a pinned revision, resolves FUI, and generates a runnable near-replica, per product.
It exists for designers who cannot run the product locally, and step 2.2 addresses that far more
cheaply. Deciding in advance would invert the evidence.

**Done when:** the decision is recorded in the change log either way. If yes, see
[the managed harness](#if-step-11-says-yes-the-managed-harness).

### Waiting on other people — never blocks a step

**These are not steps and they are not in the sequence.** Each needs a person who is not Claude, and
none holds up the work in front of it.

| Needs | Who | What it unblocks |
|---|---|---|
| Name the Design System owner | Noah | 1.1, 1.5 and 4.2 |
| Register a **development GitHub App**, install it on the design repo, and give me its client ID | Noah | 3.2 |
| Move the design repo from `noahshrader-flock` to the `flocksafety` org | Someone with org permission | Everyone else's access; rollout |
| Register the GitHub App **for the org** and install it on the design repo | An org owner | Rollout |
| `build:design` and CI for `fd/*` branches — **drafted**, with the prototype standards: commits `1ca7d523`, `e02c408c`, `ff5e3f71`, `65e9a700`, `c8f0447d` on Coke's `noah/flock-designer`, not pushed | Coke engineering, to merge it | 3.4 for every designer, not just those whose branch carries the change |
| **Decide who may open a shared preview.** Coke's existing PR previews answer an anonymous request with the page (checked 2026-10-05: HTTP 200 from S3, no login), at an address that is just the pull request number. The plan's rule is no public access by default | Security / platform | 3.4: a design preview is mock data only, but is public to anyone with the link until this is decided |
| Read and write access to the **design repo** for PMs (not Coke) | GitHub admin, or Noah as owner | 3.4 and 3.6: a PM cannot comment without it |
| How internal Mac apps are deployed here, what they require (usually signing), and the turnaround | IT | Rollout |
| A security look at an app that reads SSO-protected pages and holds a token | Security | Closing 3.3 |
| Whether a managed harness is needed ([step 4.3](#43--decide-if-the-managed-harness-is-needed-was-step-11)) | Noah | Only if local setup fails designers |
| Registry access and the unaided designer test ([step 4.1](#41--designer-environment-access-was-step-18)) | Noah + the registry owner | Real designer onboarding |
| Package and org items ([step 4.2](#42--ship-the-design-system-context-in-the-package-was-step-17)) | Design System owner | Smaller now than it was |

**Status values:** Not started, In progress, **Built — awaiting check**, Complete. A step is Complete only when its "done when"
is met and the evidence is cited in the [change log](#change-log).

## Decisions made, and what is still owed

| Decision | Choice | Why |
|---|---|---|
| Identity | GitHub sign-in, device flow, through a **GitHub App** | Everyone who needs it can have a GitHub account; no secret, so no server. The token reaches only the design repo's issues, not every repo the user can see. Okta is GitHub's concern |
| Comment store | Issue comments in the design repo, one issue per iteration | No commits, no merge conflicts, notifications built in, and read access suffices. Keeps PMs out of Coke |
| Durable record | Comments exported to `comments.md`, beside the agent's own `review.md` | The agent reads it with no app, and a closed or deleted PR cannot take it away. Generated on every read and git-ignored: GitHub stays the only place a comment lives, and the file is a view of it. Resolved comments are kept, marked, so the file is the whole conversation |
| Gesture and anchor | Click an element, which is outlined and named before the click; anchor by a selector scoped to the nearest stable name, with the element's kind, its containers, the page state, the commit and a picture | Survives a resize and a rearrangement of the markup; degrades instead of breaking. Its ceiling is the product's own markup, not this app |
| Client | One Electron app, author and reviewer modes | No web app, extension or server to maintain |
| App UI | **shadcn/ui, Radix and Tailwind**, stock Neutral theme (changed 2026-10-06; was Flock's FUI) | The app is the tool, not the product: a prototype already uses its own product's design system, and the shell should not claim to be any company's. Reversed when a second company's build became the plan, since FUI there meant forking the shell per company. It also drops the `@flocksafety` GitHub Packages token and the React 18 pin that FUI's peer dependencies forced |
| Preview | A CI-built **mock-data** deployment; **one PR per branch**, always draft | A PR's head branch cannot change, so one PR per shared branch is the only mapping GitHub has |
| Distribution | IT's device management | Internal only; no store, and IT can push updates |
| Data | Mock or synthetic only — never production data | Unchanged since step 1.1 |
| Persistence | Branches kept; previews expire; comments and the record kept in the design repo | A comment must outlive the preview it was made on |
| Component gaps | Through the [learning loop](#the-learning-loop) | Unchanged |
| Acting on a comment | One comment at a time, from its own card; the agent marks it addressed with the commit, and **a person resolves it** | Comments are not alike, so a batch makes the clear ones wait on the unclear. The agent knows it changed something; only the person who wrote the comment knows whether that was what they meant — and an unresolved comment that is done costs one click, while a resolved comment that is wrong costs the signal |
| Quick prototypes | **React only**, with the product's installed design system, bundled into one page kept in the project's folder (added 2026-10-06) | Hand-drawn HTML imitated the components and got the shell wrong twice; real components make that impossible and give the move into the code real code to start from. Without the packages it says what to install rather than make a lesser page |
| Gaps in a quick prototype | Approximated and marked: `@standin`, `@mock`, `@remove` | A missing component or package never blocks an idea, and the move into the code reads each mark as a decision, a data task or a deletion |
| Where an iteration opens | The route its record names, checked when recorded and again when it loads | A codebase branch runs the whole product, so without it the preview opens at the product's front door and a comment lands on work the iteration never touched |

**Dropped from the earlier design:** capture storage (no screenshots to host) and
automating handoff inside the app (`npm run handoff` already does it). See
[Appendix C](#appendix-c--superseded-designs).

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

## What is deliberately not being built

| Not building | Why |
|---|---|
| A server or a database | GitHub is the backend; this is the line that keeps the whole thing small |
| A web app, a browser extension, or a second client | One client to maintain. A hosted version stays a fallback if IT's deployment route is awkward |
| Live syncing | The app fetches comments when a project is opened |
| Auto-update | IT pushes new versions |
| Thumbnails and a polished gallery | Decide after 3.3, on whether people want to browse |
| Dragging out a region | Click-an-element first; a region is a small step later |
| Windows | Open question — see below |
| Any visual canvas, embedded editor, Figma import, or model-provider integration | Never in this plan |
| Blocking a comment outside the iteration's scope | A PM may legitimately comment on a breadcrumb or a neighbouring page, and for codebase work the app cannot reliably know the boundary — it is prose in `brief.md`. A false "you cannot comment here" is worse than a comment the agent declines, with its reason now shown. **Marking** such a comment is worth doing once the boundary is machine-readable; deferred 2026-10-06 |
| Committing `comments.md` for its history | GitHub already holds authorship, edits and resolution. A committed generated file adds merge conflicts between two people commenting at once, and looks authoritative while going stale. The history lives in the file itself instead: resolved comments are listed, marked, under their own heading |
| A design-system pack for people without the product installed | Would let anyone make a quick prototype with no install (about 70 MB of built packages, shared). Deferred until a real 3.7 run proves the approach; it also needs a decision on keeping the design system's built files in the design repository |
| A browser extension for commenting | Would let reviewers comment in their own browser on login-gated previews. Deferred: the app covers review while shared previews are anonymous, and it is a second client |
| A React component chain in the anchor | Not verified against Coke's React version, and the element's kind and its named containers already carry the meaning |

## Open questions

Decisions already settled in this plan are not repeated here. What remains genuinely open:

*Answered since this list was written: **device flow works with the company's SSO** (3.2, confirmed in use since
2026-10-05).*

- **Is Mac enough for now?** Windows roughly doubles the distribution work. Decide before 3.6.
- **May a quick prototype carry the MUI X licence key?** Without it, `FSDataGrid` shows a "Missing license key" watermark. It is the prototype, not a bug, but it is visible. The key comes from Coke's environment, and a prototype is kept in the design repository.
- **When does `.flkd/` reach `develop`?** Coke's Flock Designer guidance is only on `noah/flock-designer`. A quick prototype reads it from the branch it is based on when that branch has it, otherwise from the accepted checkout's working tree.
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
- Whether prototype branches should expire from the product repository after some period, given that they never merge and accumulate indefinitely.
- How the team protects the distinction between a prototype that is credible and code that is production-ready, once previews are easy to share widely.

---


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

---


# Appendix A — How the system works

*Built and in force. Principles, contracts and reference, moved here on 2026-10-05 so the plan above covers only what remains. Consult it while working; it is not a reading order.*

## Part I — What this is

### Purpose

Flock Designer helps designers contribute directly to Flock product code while preserving the context, safety boundaries, and human judgment that production work requires.

It creates a continuous path from a product question to a reviewable prototype, an internal preview, and an engineering handoff. The artifact becomes more credible as the decision needs it to be. It never quietly becomes production code because it happens to be written in React.

### Principles

- **Repository first.** Working in the product checkout is the default mechanism, not a fallback. Product context, standards, source, prototype records, and handoff artifacts live in Git with the code they describe.
- **Designers contribute code.** The path to more designers contributing is to make the real product easier to run, before considering a substitute for it.
- **Reuse before invention.** Existing FUI components and product patterns are the default. Intentional divergence is stated and tested.
- **Progressive credibility.** Explore quickly, ground the work in real context, test behavior when it matters, and hand off deliberately. Process weight scales with the level, not uniformly.
- **Prototype safely.** Prototypes use local mock data and do not wire production auth, APIs, state, flags, telemetry, routes, or permissions.
- **Build accessible by default.** Accessibility is a non-overridable floor. The agent follows the repository's declared target, tests affected states, and makes any gap visible rather than calling a prototype ready by assumption.
- **Keep humans responsible.** Agent output, comments, and review evidence can propose changes; product, Design System, and engineering owners approve shared standards.
- **Retain useful context.** Project memory preserves one initiative. Repeated lessons are promoted into `.flkd` only through a reviewable patch or PR.
- **Earn each layer.** Nothing is built until the layer beneath it has produced evidence that it works.

### Repository-first operating principle

Flock Designer operates inside the product repository. The local agent instructions, `.flkd` standards, product patterns, FUI resolution, safe-import rules, prototype code, and review receipts remain versioned with the product they describe. That proximity is a feature: the agent works against the same components, constraints, and source history as engineering.

A future internal workbench may help people frame requests, select context, view a running artifact, or collect feedback. It must coordinate this repository-native workflow, not replace it with a detached design sandbox or a second source of truth.

It must also make code contribution available to more designers, and the cheapest way to do that is to make the real product easier to run rather than to build a substitute for it. The observed barrier on Coke is not the repository; it is the backend dependency. The `noah/local-design-mode` branch already removes that barrier with MSW-backed `npm run start:design`. Stabilizing that path is therefore the first answer to "a designer cannot run the product locally," and it is far smaller than building a near-replica generator.

A managed harness — a smaller React/FUI runtime created from an authorized GitHub source at a pinned revision, carrying the same relevant `.flkd` and resolved FUI context — remains a designed option for cases that stabilized design mode does not solve. It is deliberately **the managed harness, a conditional runtime phase** rather than a committed one: it opens only if step 9 and step 8 produce evidence that local setup is still blocking real designers. See the [plan's the managed harness](#if-step-11-says-yes-the-managed-harness). If a managed harness is built, it preserves project memory, produces Git-backed artifacts, and can be promoted to a linked direct-repo branch through an explicit transfer manifest; it is never merged into product source automatically.

### The three connected parts

Flock Designer has three connected parts.

#### 1. An internal design workflow

The team starts with a decision to make, not a blank screen: a problem, user, current product context, desired behavior, and the uncertainty worth reducing. Flock Designer turns that into the smallest useful flow, not a speculative whole product.

#### 2. Context that makes the output recognizably Flock

The agent retrieves the applicable FUI components and tokens, the current product’s layout and interaction patterns, safe implementation boundaries, and reference views. It should prefer a known pattern, explain a deliberate deviation, and leave a receipt of its sources.

#### 3. A safe local runtime

The work can render and be reviewed with mock data and realistic states without touching production routes, APIs, auth, feature flags, analytics, or the Redux store. Where shell placement matters, a separate design mode can run the real app against explicit fixtures.

### What it is not

- A replacement for product design, frontend engineering, Figma, or design review.
- A general-purpose Magic Patterns clone or a new visual-canvas product.
- A Figma-to-code conversion promise. Figma and FigJam are read as reference links and exported images only.
- A way to skip security, accessibility, data, permission, or engineering review.
- A second source of truth for product patterns, design-system rules, or source code.

### Guardrails

- Do not substitute generated output for product, design, or engineering judgment.
- Do not require every early idea to be production-like.
- Do not add product routes, APIs, store state, auth, flags, analytics, or telemetry merely to make a prototype feel real.
- Do not let an attractive mock hide unmodeled states, permissions, or data constraints.
- Do not treat Figma-to-code as a one-way automatic translation.
- Do not make generic visual sameness the goal; preserve a shared Flock language while allowing intentional, domain-specific variation.

### The future process

The Flock Design FigJam's future process shows:

```text
Spec & Resources
  -> In-Repo Prototype Branch
     (OR Prototype Harness — conditional, the managed harness only)
  -> Branch Iterations (i1, i2, i3)
  -> Internal Preview (shareable for demos)
  -> Code Hardening & Handoff
```

The FigJam names iterations `v1, v2, v3`. This plan uses `i1, i2, i3` throughout to avoid collision with product and package versioning; they are the same thing.

It also shows component gaps flowing into Design System component work, Design System review, and engineering review. The desktop workspace should facilitate this path; it should not invent a parallel design process.

### Vocabulary

These terms are easy to confuse and are used strictly throughout the set. The file layouts behind them are defined in the plan's [project folder](#the-project-folder) and [prototype directory](#the-prototype-directory) contracts.

| Term | What it is | Where it lives |
|---|---|---|
| **Context packet** | The bounded set of material the agent selects *before* it builds: specific FUI components, product references, boundaries, states | Assembled per request; not a file |
| **Context receipt** | The human-readable record of what the packet contained and why, shown to the designer before generation | `context-receipt.md` in the project folder |
| **Change boundary** | The files, components, routes, states, and interaction paths a project may touch. Anything outside it is out of scope for fixes and for the handoff branch | Declared in `brief.md`, echoed in the context receipt |
| **Review record** | Per-iteration evidence, product parity findings, implementation findings, the accessibility section, and open questions | `review.md` in the project folder |
| **Project folder** | The directory holding every record a project produces, one per project | `flock-designer/projects/<project-id>/` |
| **Project record** | The proposed shareable project narrative, from step 14, for a designer who does not have the branch | `project-knowledge/<project-id>/` in the proposed `flock-design-knowledge` repository |
| **Prototype** | The runnable source itself, and nothing else | `src/prototypes/<project-id>/` on an `fd/<project-id>/iN` branch |

**One identifier throughout.** A project gets one slug, `<project-id>`, at creation — for example `alerts-triage`. That same slug keys the branch (`fd/alerts-triage/i1`), the prototype directory (`src/prototypes/alerts-triage/`), the project folder (`flock-designer/projects/alerts-triage/`), and, from step 14, the project record (`project-knowledge/alerts-triage/`). The earlier `proto/<name>` branch convention observed on the Designer branch is superseded by `fd/<project-id>/iN`.

**Figma is reference-only.** Flock Designer reads Figma and FigJam as links and exported images inside a brief. There is no Figma API integration, import pipeline, or design-to-code conversion in any phase of the plan.

### How much to build

**Removed 2026-09-29, at the plan owner's direction.** This was four named levels — Explore, Ground,
Test, Handoff — chosen before work started. The choice was not real.

**Grounding is the floor, not a level.** Real components, real product patterns, real standards, on
both paths, always. A version that is not grounded is not worth building here, because being
grounded is the only reason to build here rather than in a design tool. So "Ground" was never a
setting, and offering it implied you could opt out of the thing that makes this worth doing.

**Handoff was not a level either.** Preparing work for engineering is a deliberate step with its own
command — [step 10](#26--build-the-handoff-was-b2) — not something picked from a menu
before any work exists.

**What actually varies is how much of the thing gets built**, and the request already says it:

| Path | How much |
|---|---|
| **Codebase** | **All of it.** Every state the feature really has, tests, accessibility run. It ships |
| **Prototype** | **What was asked for.** One screen means one screen |

**A single-screen prototype is a finished prototype.** Building past the question is the most common
way this work gets slow. If the scope is genuinely unclear the agent asks one plain question — *is
one screen enough, or do you want the other states too?* — not a ladder of names nobody outside this
repository understands.

### What the team has said

#### Observed facts

- The Flock Design FigJam frames the design vision as one coherent product ecosystem with shared foundations, while allowing intentional divergence where user needs differ.
- The FigJam calls for shared visual language, components and patterns, interaction behavior, and content and voice. It explicitly notes that different products can have different density, navigation, and product-specific vocabulary.
- The Ways of Working map distinguishes an early, leadership-prioritized exploration path from ongoing execution work. It describes Flock Designer as a possible future process in the explore-to-handoff span.
- In the September 22 internal discussion, the team drew a useful distinction between prototyping for alignment and prototyping for output. The desired future is not two disconnected workflows: an early idea can remain fast while becoming increasingly grounded and credible as it matures.
- The local Flock Designer implementation already contains real FUI and Coke context, prototype boundaries, two read-only review modes, and a gap log. It does not yet contain a working end-to-end prototype example.
- The current accessibility program’s goal and recent evaluation scope are WCAG 2.2 A/AA, but its formal company target remains open pending Compliance confirmation. The WCAG Tracker is the finding-level source of truth; passing external validation is the closure signal.
- Coke already carries accessibility guidance and `axe-core`/`cypress-axe`, but its Designer manifest and Cypress command currently enforce WCAG 2.0 A (`wcag2a`). This is an observed configuration gap, not evidence of WCAG 2.2 conformance.

#### Supported inference

The product to build is a progressive-credibility workflow. The question is not, “is this prototype production-ready?” The question is, “what decision is this prototype meant to support, and what evidence is required for that decision?”

### The evidence model

Flock Designer should never blur these categories:

| Category | Meaning | Example |
|---|---|---|
| Observed fact | Directly found in code, a decision record, or a verified reference | Coke uses `FSDataGrid` in distinct card-list and paginated-table modes |
| Supported inference | A reasonable conclusion drawn from multiple facts | A generic agent needs Coke context in addition to FUI context |
| Proposal | A choice the team may adopt and test | Use a four-level credibility model for prototype work |
| Open question | A decision or missing evidence that needs an owner | Which fixture source should own long-lived design-mode data, and who refreshes it? |

The output should link major UI choices to an observed pattern, a design-system rule, or a clearly labeled proposal. This is how it stays useful without pretending to be certain.

### Magic Patterns, honestly

Magic Patterns is useful as a benchmark for the user experience of AI-assisted prototyping, not as a product specification or a target to clone.

#### Observed facts from Magic Patterns

Its public material describes a flow in which teams:

1. Start from a prompt, brief, user story, screenshot, or Figma reference.
2. Ground generation in a reusable design system, design files, and optionally repository context.
3. Generate and refine interactive code-backed screens or a small flow.
4. Review and collaborate around the same prototype.
5. Export or hand approved intent into engineering tools.

It also treats the design system as more than colors: components, tokens, rules, examples, and product context are reusable input to every generation. [AI Prototype Generator](https://www.magicpatterns.com/product/ai-prototype-generator), [Using Your Design System](https://www.magicpatterns.com/blog/introducing-design-systems), [AI prototyping course](https://www.magicpatterns.com/docs/documentation/ai-prototyping-course/introduction)

#### What Flock should borrow

- Start from the smallest decision-bearing flow, not a giant prompt.
- Make system and product context reusable rather than re-pasted on every request.
- Keep iteration attached to a live artifact rather than recreating static images.
- Give reviewers something they can click through, comment on, and compare with a known product pattern.
- Carry approved decisions, unresolved questions, and implementation gaps forward.

#### What Flock should not borrow blindly

- A general-purpose multi-tenant design application is not the first problem to solve.
- Flock does not need a broad visual-editor clone before proving its internal workflow.
- Generic design-system import is weaker than the FUI and Coke-specific context already available locally.
- “Production-ready code” is not an acceptable default promise in a product with real auth, API, permissions, telemetry, and routing concerns.

#### The Flock advantage

Flock already has ingredients a generic tool must reconstruct: a real component library, versioned usage guidance, existing frontend code, product-specific patterns, prototype safety rules, and people who can judge the result. The opportunity is to make those ingredients easy to invoke in one coherent flow.

#### Where this wins, and where it loses

Stating this honestly is the only way to know whether the effort is worth it.

**Where Flock Designer is better:**

| | Magic Patterns | Flock Designer |
|---|---|---|
| Components | An imported approximation of the design system | The actual FUI version the product has installed, resolved from the lockfile |
| Product patterns | Not available | Read from the real codebase, with occurrence counts and file paths |
| Shell and constraints | A blank canvas | The real app, real routing, real permission and state boundaries |
| Output | An export an engineer re-implements | A branch in the product repository an engineer can read and continue |
| Accessibility | Generic | Checked against the product's own declared target and tooling |
| Continuity | Lives in the tool | A project folder and Git history that outlive the tool, the designer, and the chat thread |
| Data | Leaves the building | Stays in the checkout; works against internal, authenticated surfaces |

**Where Magic Patterns is better, and these are real:**

- **Time to first artifact.** Magic Patterns is a URL. Flock Designer needs a checkout that runs. This is the single largest risk to adoption, it is what [step 8](#22--make-the-product-runnable-on-mock-data-was-step-8) exists to fix, and [step 11](#43--decide-if-the-managed-harness-is-needed-was-step-11) is the fallback if step 8 is not enough.
- **Sharing.** Magic Patterns gives a link immediately. Flock Designer has no shared preview until [step 14](#step-14--workspace-shared-review); until then review is live against a local preview. That is a genuine gap, not a deferral of something unimportant.
- **Polish of the loop.** A funded product team has iterated on that experience for years. Steps 12 and 13 narrow it; they will not close it.

**The bet this plan makes:** for a real product decision, fidelity and continuity matter more than
the first thirty seconds. A prototype built from the installed components, in the real shell, that an
engineer can continue from, is worth more than one that looks right and has to be rebuilt. If
[step 9](#23--prove-it-on-real-decisions-was-step-9) shows that bet is wrong — that designers would rather
have something fast and disposable — that is a finding worth having early, and it is why step 9 comes
before any application code.

#### What we are borrowing

"Not a Magic Patterns competitor" is easier to say than to hold, so this names exactly what we take. Four functions:

| Function | Why it helps | Where it lands |
|---|---|---|
| Reusable, configured context instead of re-pasted prompts | The design system and product patterns become input to every generation | step 4 and the learning loop, across the shared, design-system, and product layers |
| Iteration attached to a live artifact | Feedback refers to something clickable, not a static frame | step 9 locally; step 13 in Workspace |
| Review and comment around that same artifact | The collaboration function the design team is actually missing today | step 14 |
| Carrying approved intent into engineering | Decisions and open questions survive the handoff | step 10 by hand; step 15 in Workspace |

What we are not taking: the multi-tenant application, the visual canvas editor, generic design-system import, and the "production-ready" framing.

### What exists today

#### Product context in `flock-coke`

The `noah/flock-designer` branch contains durable `.flkd` context for product patterns, composition, safe imports, prototype boundaries, agent instructions, and gap logging. `CLAUDE.md` routes relevant requests into the Designer workflow. Prototypes are intended to live under `src/prototypes/` and are deliberately isolated from production plumbing — today that directory holds only its `README.md`. The branch's original `proto/<name>` convention is superseded by the project-keyed `fd/<project-id>/iN` scheme defined in Vocabulary. **Step 3 closed this on 2026-09-28 with nothing to rename:** the one `proto/<name>` branch, `proto/device-health-summary`, was a local-only pointer at an ancestor commit holding no prototype, and the matching `src/prototypes/device-health-summary/` had never existed on any branch — consistent with the observed fact above that there is no working end-to-end prototype example yet. The branch was deleted; no `proto/<name>` branch or directory remains.

#### Design-system context in `flock-react-component-lib`

The FUI `.flkd` directory contains an inventory of 133 `FS*` components, token data, deprecations, usage guidance, examples, and a validator. This is unusually valuable context, but it must be resolved against the app’s installed FUI version; the sibling library can be ahead of Coke.

**What it does not yet contain: standards for working *in* the library.** Everything there describes FUI for a consumer. The standards for authoring and changing components, and for creating and adjusting stories, do not exist as agent files today. That is the design system’s own layer, and [step 5](#15--set-up-the-design-system-agent-files-the-full-account-was-step-5) adds it.

#### Runtime foundations

The Designer branch supports a prototype harness concept. A separate `noah/local-design-mode` branch adds MSW-backed `npm run start:design`, intended to run the real shell without Crown or Tanqueray. The two approaches are complementary but not yet integrated.

---


## Part II — Contracts

These hold at every step. Each is defined exactly once, here.

### Knowledge layers

**Implemented in:** `flock-coke/.flkd/README.md` — "The three layers", with every tree entry tagged with its destination layer. Design-system layer: `flock-react-component-lib/.flkd/README.md` and `.flkd/authoring/`.

**This is the architecture.** Everything else in this plan serves it. Agent files live in three
repositories, plus one place that holds project context:

```text
flock-react-component-lib/.flkd   the design system, consumed as a package
  - where things are in the library
  - standards for authoring and changing components
  - standards for creating and adjusting stories

flock-coke/.flkd                  the product (and every other product)
  - where things are in THIS product's code
  - points at the design system's files rather than restating them
  - this product's own patterns, constraints, and prototype safety

flock-designer/                   shared, and the home for projects
  standards/                      the rules common to every product
  projects/<project-id>/          one folder per project
```

**Same dot-directory name everywhere** — `.flkd` — so the agent's resolution order is one rule, not
three. A product's files point at the design system's; the shared standards sit above both. Each
product keeps its own nuances; the standard it shares lives in one place.

`flock-designer` is one repository holding two things: the shared standards, and the projects. It is
a repository first and may be published as a package later.

Where knowledge lives, and what each layer may not claim:

| Layer | Location | What it knows | What it must not claim |
|---|---|---|---|
| Shared intelligence | `flock-designer` — agent definitions, skills, the universal standards, the Flock tier, and the Part I contracts | How the workflow runs at Flock, whichever product it runs in | A product's patterns, boundaries, or stack; a convention as Flock-wide on one product's evidence |
| Product intelligence | `flock-coke/.flkd` | Coke patterns, constraints, prototype safety | Universal Flock behavior without evidence |
| Design-system intelligence | Resolved FUI package, plus `flock-react-component-lib/.flkd` | Where things are in the library; FUI components, tokens, use, deprecations; **the standards for authoring and changing components and for creating and adjusting stories** | Availability in every consuming app version |
| Runtime intelligence | Prototype docs and design mode | How to run and review locally, fixture boundary | Production readiness |
| Project intelligence | The project folder in `flock-designer` | Decisions, feedback, open questions, ownership | A permanent rule after one project |
| Tool adapters | Claude Code first through `.claude/agents`; future adapters including Codex | How a tool discovers the workflow | The durable source of truth |

**The shared layer is a repository first and a package later.** It is created in [step 4](#14--fix-the-product-repository-files-was-step-4), holding the standards that carry no product-specific reference, and a product resolves it from a sibling checkout exactly as FUI context resolves today. A CODEOWNERS co-owner and a published package follow when promotions start changing the standards and when a second product adopts them. Published, it declares FUI as a peer dependency and resolves FUI's context, so a product installs one thing and the agent keeps one resolution order. It is not a per-designer tool plugin: Workspace invokes an agent against a checkout, and context that exists only on one machine is not there for Workspace, for CI, or for another engineer.

**A shared file states the rule; the product holds the instances.** The same rule then serves every product, and the product's `manifest.md` and `implementation/` supply what is true of it. Reasoning about the split belongs to [decision 4](#decisions-the-audit-raises).

### The agent contract

**Implemented in:** `flock-coke/.flkd/agents/flock-designer.md` — "The contract", always/never verbatim.

The non-negotiables. These are the statements a reviewer can hold the agent to, and the ones a validator should eventually enforce.

**The agent must always:**

- resolve the FUI version from the lockfile or installed package before naming a component as available;
- produce a context receipt for Ground, Test, and Handoff work, listing the actual files and components it read;
- name its source for every significant layout, pattern, or interaction choice — an existing product view, a `.flkd` rule, or an explicitly labeled proposal;
- keep generated code inside `src/prototypes/<project-id>/` and records inside the project folder;
- state which data is mocked, which behavior is simulated, and which is omitted;
- report a check it could not run as "not run," with the reason.

**The agent must never:**

- claim a conformance level the repository's configuration and evidence do not support;
- hard-code an accessibility target in an agent file that competes with `.flkd/manifest.md`;
- register a production route, add a feature flag, wire Redux, call a real API, invoke auth, or emit analytics to make a prototype feel real;
- modify files outside the declared change boundary, including "helpful" unrelated fixes;
- rewrite a `.flkd` standard, pattern, or validator directly — it proposes a patch, a human approves it;
- present an Explore artifact as evidence of feasibility, or a passing automated scan as complete accessibility validation;
- substitute its own assertion for a validation it did not actually run.

Every one of these is testable. That matters more than the list being complete.

### The operating loop

**Implemented in:** `flock-coke/.flkd/agents/flock-designer.md` — "How you work", steps 0 and 0b.

```text
Frame the decision
  -> open or create the project folder
  -> retrieve a bounded context packet
  -> choose reuse vs. intentional divergence
  -> build the smallest decision-bearing prototype
  -> review product fit and implementation safety separately
  -> retain reusable learning
```

#### 1. Frame before building

Turn a vague request into a brief that captures the user and job to be done; the decision to make and what would change it; the current product surface or nearest reference; how much to build; required interaction and states; known constraints, open questions, and non-goals; and the change boundary — which files, components, routes, states, and interaction paths are in scope.

The designer does not fill in a form. They share whatever they have, and the agent writes `brief.md` from it, using the [request guide](#the-request-guide) to ask only for the missing pieces that would change what it builds. The designer confirms the brief before the agent builds. Do not force a long discovery ritual for a small request: an Explore request may need nothing more than the decision and a reference screen.

#### 2. Retrieve a bounded context packet

Inspect before creating. A packet includes only the relevant material:

| Context | Examples |
|---|---|
| Product | Coke route/shell pattern, neighboring screen, table or form convention, density |
| Design system | Resolved FUI version, exact components, prop caveats, tokens, examples |
| Behavior | States, permissions, validation, copy, active accessibility target, WCAG 2.2 readiness expectations |
| Implementation | Safe imports, forbidden plumbing, prototype runtime, branch boundary |
| Evidence | Screenshots, FigJam/Figma reference links, research, prior feedback |

**Before retrieving anything, the agent settles the project folder.** It checks
`flock-designer/projects/` for the project. If the folder is there, it reads it and continues the
existing history. If it is not, this is a new project: the agent creates
`projects/<project-id>/` and uses it for this branch, so the project has a home before any code is
written. Everything the agent then writes — brief, receipt, review, decisions — lands in that folder,
and each iteration on the branch adds to the same history rather than starting a new one.

The agent then writes the context receipt, and the designer can correct it before a wrong assumption becomes polished UI. **This is the single highest-leverage moment in the loop.** A wrong packet produces confidently wrong output that takes longer to diagnose than to rebuild.

#### 3. Choose before inventing

1. Reuse an existing product pattern.
2. Adapt an existing pattern when the user/job differs but the interaction model still fits.
3. Propose a new pattern only when the old ones do not solve the problem.
4. Record why the new pattern exists and what should be tested before it is promoted.

This follows the FigJam's principle of shared foundations with intentional divergence. "Flock-native" should never mean flattening every product into the same visual density or navigation model.

#### 4. Build proportionate to the decision

Do not make a Test artifact when an Explore artifact answers the question, and do not present an Explore artifact as proof of feasibility.

### The request guide

**Implemented in:** `flock-coke/.flkd/request-guide.md`; used by `.flkd/skills/scaffold-product-view.md` step 1.

What good context covers. **None of it is required, there is no template, and nobody fills in a
form.** A request arrives in whatever form the thinking already exists in — a PRD, a one-pager, a
Figma file, a Slack thread, a screenshot, or a single sentence — and the agent writes the brief from
it, asking only for what is missing and would change what it builds. This is the one piece of
guidance designers are given, and the agent uses the same list to decide what to ask for.

| What good context covers | Why it helps |
|---|---|
| **The problem** — what is wrong today, and for whom | Grounds the work in a real job rather than a generic screen |
| **The opportunity** — why it is worth solving now | Separates an idea worth prototyping from one worth a conversation |
| **What success looks like** | Tells the agent what the artifact has to make judgeable |
| **Current thinking**, even half-formed | Distinguishes "build this" from "challenge this," which change what gets made |
| **Inspiration** — references, and the closest existing Flock screen | The single biggest factor in whether the result looks like Flock |
| **Already decided** — anything settled or off limits | Keeps the work in scope; becomes the change boundary |
| **How finished it needs to be** | Sets how much gets built — one screen, or every state |

If a request carries only one thing, the problem is the most useful one. Where the requester already
knows the specific question to answer — "toolbar or side panel?" — that scopes the build tightest,
and the agent should ask for it when it is not obvious.

**The brief still names a decision.** The request leads with the problem because that is what people
actually have written down; the agent's job in [framing](#1-frame-before-building) is to turn it into
the decision the prototype will answer. That is why the matrix's Brief row asks for a decision and a
reference while this list asks for a problem — they are the two ends of the same step, not a
disagreement.

### What each piece of work owes

**Implemented in:** `flock-coke/.flkd/manifest.md` — "How much to build"; `.flkd/standards/non-negotiables.md` §8.

Replaced the per-level artifact matrix on 2026-09-29, when [credibility levels](#how-much-to-build)
were removed. Requirements follow the **path**, which is a real distinction, rather than a rigor
setting, which was not.

| | **Prototype path** | **Codebase path** |
|---|---|---|
| **Grounded in real components and patterns** | Always | Always |
| **Runs and clicks** | Always | Always |
| **States** | What was asked for | Every state the feature has |
| **Context receipt** | Beyond a single screen | Always — it is handoff evidence |
| **Tests** | No | **Yes** |
| **Accessibility** | Check as you build; record what you did not verify | **Run it.** "Not run" is unacceptable for shipping code |
| **Review record** | Per iteration | Per iteration, plus `handoff.md` |

**"Not run" is always an acceptable answer on a prototype. Silence is not** — an unstated gap reads
as a passing check, which is the failure the whole evidence model exists to prevent.

### The prototype directory

**Implemented in:** `flock-coke/.flkd/manifest.md` — "Prototype configuration"; `flock-coke/src/prototypes/README.md`.

The canonical shape, keyed by `<project-id>`, the same slug used for the branch and the project folder.

```text
src/prototypes/<project-id>/
  index.tsx         entry point
  host.tsx          throwaway product framing
  view.tsx          candidate experience
  mockData.ts       local feature data
  hostMockData.ts   local framing data
  components/       prototype-only composition where useful
```

**This directory holds runnable source only.** Every record — brief, receipt, review, decisions, handoff — lives in the [project folder](#the-project-folder). One location for records, with no exceptions, so an agent never has to guess where a file belongs and handoff never has to strip review notes out of source.

Rules:

- Use real FUI components and product patterns where they help the decision.
- Use a minimal reconstructed host rather than importing unsafe app-shell modules.
- Do not register a production route or add a feature flag.
- Do not call real APIs, wire Redux, invoke auth, or emit analytics.
- Keep mock data explicit and local; label unsupported assumptions.
- Build the smallest stateful flow that can be reviewed.
- Touch nothing outside `src/prototypes/<project-id>/` without an explicit, recorded reason.

### The project folder

**Implemented in:** `flock-designer/projects/` and its `_template.md`. Pointed at from `flock-coke/.flkd/README.md` and `manifest.md`; nothing per-project is written into the product repository.

**One folder per project, in `flocksafety/flock-designer`.** Everything about a project lives
together: what you put in, and what the agent wrote.

```text
flock-designer/projects/<project-id>/
  <whatever you had>    a markdown file, a PRD, screenshots, links, a paragraph.
                        No required format and no minimum — three sentences counts
  brief.md              written by the agent from your context, and confirmed by you
  context-receipt.md    what it read before building, including the baseline commit
                        and resolved FUI version
  review.md             one section per iteration: evidence, parity and implementation
                        findings, the accessibility section, open questions
  decisions.md          only what you confirmed
  log.md                the agent's working notes, labelled as machine-generated
  handoff.md            Handoff only: the hardening report and the rewrite plan
```

`projects/_template.md` is there in case a blank page is annoying. Ignoring it is fine.

Rules:

- **Drop in whatever exists, in whatever form it exists.** The agent reads the folder and writes `brief.md` from it, asking only for what is missing and would change what it builds.
- The change boundary is declared once, in `brief.md`, and echoed in the context receipt. It names the files, components, routes, states, and interaction paths in scope.
- Nothing enters `decisions.md` until you have confirmed it. Agent drafts go to `log.md`.
- **The agent writes these files; designers are never asked to fill them in.** Your part is to drop in what you have, confirm the brief, and confirm decisions.
- Prototype code does not live here. It stays in the product repository on its `fd/<project-id>/iN` branch, where it can actually run. The folder holds the thinking; the branch holds the code.

**Why here and not on the branch.** An earlier version of this plan kept these records in
`.flkd/projects/` on the prototype branch, which meant picking up someone's work required knowing
which branch to check out, and it needed a standing rule to stop per-project state reaching
`develop`. One folder in one repository removes both problems, and it means a project has a home
before any code is written.

### Git and iteration model

**Implemented in:** `flock-coke/.flkd/manifest.md` — "Prototype configuration"; enforced in `.flkd/agents/implementation-reviewer.md`.

- Start from the selected baseline and create a project namespace only after confirmation: `fd/<project-id>/i1`, `fd/<project-id>/i2`, and so on.
- Each iteration branch is created from the prior selected iteration, not from an opaque app snapshot. The relationship is visible in Git.
- Prefer an optional Git worktree for isolation if the primary checkout is busy; it remains a real checkout, not an app-private copy.
- An iteration record contains the branch, commit SHA, label, brief and context-receipt hash, preview URL and status, review summary, and decision note.
- **One PR per branch.** An iteration gets its own PR when you want to share it; an iteration you never share never opens one.
- Prototype branches do not merge to product `develop` by default. Code hardening starts `fd/<project-id>/handoff` from the approved iteration.
- Retain prototype iteration branches as durable project history. Preview deployments may expire; retain their URL, commit, status, and rebuild instructions.
- Keep the project folder, source, review exports, captures, and handoff in Git indefinitely so another designer or engineer can continue without Electron. Restrict them to authorized code, approved assets, and mock, synthetic, or approved anonymized data.
- Because branches are retained indefinitely and never merge, prototype history in the product repository grows without bound. This is acceptable at pilot scale and is listed as an open question rather than settled here.

### The two build paths

**Implemented in:** `flock-coke/.flkd/standards/non-negotiables.md` §0 and §1b; the agent's path
decision. Added 2026-09-29.

**This is the thing the plan always described and only half-built.** Two paths, not two tools:

| | **Prototype path** | **Codebase path** |
|---|---|---|
| The question | "Should we do this, and what should it look like?" | "Build this — we know we want it" |
| Code goes | `src/prototypes/<project-id>/` | Real locations, this repo's conventions |
| Data | Local mocks in the prototype directory | **MSW handlers in `src/mocks/`** — the only fake |
| Redux, routing, permissions | Forbidden | **Required, and real** |
| States | What was asked for | **Every state the feature has** |
| Tests | Skipped | **Required** |
| Branch | `fd/<project-id>/iN` | The repo's normal convention |
| Ends as | Thrown away; the decision survives | **A branch engineering takes over** |

**On the codebase path the designer builds the actual frontend**, to spec, with the real design
system and the repo's real standards — backend stubbed. **Engineering takes the branch and wires the
plumbing.** The bar, in the plan owner's words: *"as if they had built it themselves."* They may
change things here and there; they should not be rebuilding.

**How a path gets chosen.** Not by reading the request's wording — inference is where this agent has
been weakest, and "build me a X" is the most common way someone asks for a **prototype**.

| Signal | Result |
|---|---|
| On an `fd/<project-id>/iN` branch | Prototype path, no question |
| On a product feature branch | Codebase path, no question |
| On a baseline branch — **new work** | **The agent must ask.** No default, no recommendation |
| `node_modules` missing | **Neither path is available** — both need it for FUI resolution, typecheck, lint and bundling. A setup problem, not a path choice |

**Asking is mandatory on new work, not a fallback for unclear requests.** Which path is right depends
on how settled the decision is, and only the requester knows that. Silence never means codebase,
because that is the direction that does not undo cleanly.

**Deliberately not a slash command.** `.flkd` is tool-agnostic so it works in Codex or Cursor with a
thin adapter; routing through a Claude Code feature would move the decision into `.claude/` and break
that. A `/prototype` shortcut can exist later as an adapter that expands to the same prompt.

**Richer environment detection belongs to [Track C](#31--build-the-workspace-local-loop-was-step-13).** When
a designer is working through the Workspace rather than a terminal, the app knows whether they have a
full checkout with dependencies or something lighter, and can settle the question before asking it.
Today the branch is the reliable signal.

**One agent, not two.** The paths share everything that matters — FUI resolution, product patterns,
accessibility as a floor, reading context before writing. What differs is four non-negotiables and
where the files land. Splitting the agent would duplicate the 80% that is identical and invite the
two copies to drift.

**Why this was missed for nine steps:** the contract below described both modes from the start, but
step 8 implemented design mode only as *a way to run the product* and closed. Every proof written
after it pointed at `src/prototypes/`, so the second path was never exercised, and its
`Implemented in:` line read "Not yet" while the step that owned it was marked Complete.

### The two runtime modes

**Implemented in:** `flock-coke` — `npm run start:design` (step 8) and `npm run start:prototype` (step 7). Both run; design mode as a **build** environment is what the codebase path above adds.

Two modes, not forced into one. Both produce reviewable evidence; neither is production.

**Prototype harness** — the workhorse. The fastest, safest place to shape a view or thin flow, using the directory contract above.

**Real-shell design mode** — for Test work when the question is about a real app surface: shell placement, navigation, surrounding density, or page-level behavior. Also the standard way a designer runs the product at all.

- Start only through a development-only environment flag.
- Intercept app data with MSW and make the fixture source visible.
- Do not send production application data, analytics, or telemetry merely to make a view run.
- Allow harmless assets to bypass only if that does not mask an app-data request.
- Make unhandled application requests visible once the base fixture set stabilizes.

**Design mode is also the answer to a second problem.** The stated barrier to more designers contributing code is that they cannot run the product locally. On Coke the blocker is the backend dependency, not the repository, and `npm run start:design` removes exactly that. Stabilizing design mode is therefore both a fidelity feature and the cheapest available fix for designer onboarding — which is why it is step 8, ahead of any application work, and why the managed harness is conditional rather than committed.

### States are runtime, not decoration

**Implemented in:** `flock-coke/.flkd/standards/universal/interaction-states.md` — the single seven-state list and the per-level table.

For every Ground or Test artifact, choose the states that actually affect the decision:

| State | Why it matters |
|---|---|
| Default / loaded | Primary hierarchy and action path |
| Loading | Perceived structure, density, and expectation setting |
| Empty | First-use and no-result behavior |
| Error | Recovery language and guardrails |
| Success / changed | Confirmation and next action |
| Permission or disabled, when relevant | Feasibility and access boundaries |

The artifact matrix states how many each level owes: Ground needs the default plus the one state that carries the decision; Test and Handoff need every decision-relevant state.

### The review model

**Implemented in:** `flock-coke/.flkd/agents/product-parity-reviewer.md` and `.flkd/agents/implementation-reviewer.md`, including the implementation accessibility lens.

Two reviewer agents, three lenses. Accessibility is a lens applied inside both, not a third agent:

- **Product parity review:** Does this belong in the product? Are hierarchy, density, patterns, states, language, and interaction appropriate? Accessibility lens: is information conveyed by more than color, is the reading and focus order sensible, does the copy work as an accessible name?
- **Implementation review:** Does it use FUI and safe imports correctly? Does it respect the prototype boundary and runtime constraints? Accessibility lens: correct semantic components, labels and roles, keyboard reachability, focus management, status announcement.
- **At Handoff only**, accessibility separates into its own evidence-based report, because that is the point at which automated results, manual checks, and conformance claims must stand on their own.

No third reviewer agent is needed before Handoff, and accessibility is never deferred to a final polish pass.

Each report distinguishes observed facts from inferences and proposals. This prevents an agent's preference from quietly becoming a product rule.

### The review record

**Implemented in:** `flock-coke/.flkd/agents/flock-designer.md` step 6, plus the output shape in both reviewers.

`review.md` in the project folder, one section per iteration, for every artifact at Ground or above. This single file replaces the separate "evidence receipt" and "accessibility receipt" used in earlier drafts. Each iteration's section records:

- runtime mode and command used;
- FUI version resolved from the lockfile, and the main components used;
- product shell or reference pattern chosen;
- mocked routes and data, and known omissions;
- states and interactions reviewed;
- results of typecheck, lint, bundler or smoke check, and visual inspection;
- product parity findings;
- implementation findings;
- **the accessibility section:** the active target, relevant states, the automated result or "not run" with its reason, the manual checks that applied, and any 2.2 readiness observation kept separate from the active target;
- open questions.

It gives reviewers a shared object to react to, and prevents a screenshot from being mistaken for a complete prototype.

### Project memory

**Implemented in:** `flock-designer/projects/<project-id>/`. **Step 14** adds the shared record.

A project is keyed by one `<project-id>` slug used for its branch, prototype directory, and project folder alike.

**The [project folder](#the-project-folder) is the whole model.** One folder per project in `flocksafety/flock-designer`, holding the context you supplied and every record the agent wrote.

**Step 14: a shared record becomes necessary.** Once review is distributed, a branch-local pack cannot serve a second designer discovering the project. The **proposal** — not an existing repository or an approved retention policy — is a private `flock-design-knowledge` GitHub repository at `project-knowledge/<project-id>/`, using a consistent shape:

| Directory | Contents |
|---|---|
| `project.yaml` | Identity, ownership, source pins, status |
| `brief/` | Spec and resource references |
| `context/` | Receipts and assumptions |
| `iterations/` | Branch, commit, state, and preview records |
| `review/` | Comment exports, marker anchors, captures, decision summaries |
| `handoff/` | Hardening evidence and final outcome |

Resource files are referenced rather than copied unless explicitly approved. This is project history, not a replacement for reusable product or FUI standards. The project folder remains on the branch after step 14, because it is what the local agent reads; `brief.md` gains a link to the shared record.

Workspace writes to the record at project creation, on an intentional iteration publish, and at handoff. The agent may draft a change-and-rationale summary, but a designer confirms it before it becomes a durable decision. Records, comments, captures, and decisions are retained indefinitely. Prototype branches remain as durable Git history. Preview deployments are disposable: record URL, commit, status, and expiration, then let a future user recreate one from the retained branch. Project material is limited to authorized code, approved assets, and mock, synthetic, or approved anonymized data; never customer data, production credentials, or production access.

Staging it this way keeps every step before 14 free of any dependency on a repository that does not yet exist, and puts the access-model conversation exactly where distributed review makes it unavoidable.

### Iterations, preview, and review

**Implemented in:** **Partly** — branch and iteration model in `flock-coke/.flkd/manifest.md`. Draft PR, shared preview, and anchored comments are step 14.

An iteration is a visible Git artifact: `fd/<project-id>/i1`, then `i2` through `iN`, created from a selected baseline or prior accepted iteration. **Iteration branches exist from step 4.** Steps 2 through 5 below — draft PR, shared preview, and comments — arrive at step 14; before then, each iteration is reviewed live from a local preview and recorded in `review.md`.

1. Create `fd/<project-id>/i1` from a pinned baseline and run it locally.
2. Push the branch and open the project's single draft PR against it, only after the required local checks pass.
3. GitHub Actions builds through the Coke-style PR deployment path and returns its preview deployment result.
4. Store the URL, build status, commit SHA, expiration, and review summary in project memory.
5. Reviewers add a general comment or a visual marker on a fixed review capture, anchored to the iteration/commit, route/state, fixed viewport, and normalized position. Workspace posts the thread and anchor metadata to the draft PR and exports a durable summary to the project record.
6. Create `i2` from the selected prior iteration when you want a different direction, or keep building on the one you have. Either way it is that branch's own PR. Retain superseded branches as durable history.
7. Start `fd/<project-id>/handoff` from the approved iteration for code hardening.

**One PR per branch**, which is the only mapping GitHub actually has: a pull request's head branch cannot be changed after it is opened. An earlier version of this plan had Workspace moving one project-wide PR from `i1` to `i2` as the work progressed. That is not possible, and the alternative it implied -- a long-lived branch the PR points at -- was solving a problem that does not exist.

**A PR is opened when an iteration is worth sharing, not for every iteration.** You pick the direction you want to keep building, push it, and open a PR for that branch. Most projects will have one. The reason to keep a branch per iteration is that it stays cheap to show three at once when the comparison is the point -- three branches, three PRs, three preview URLs, side by side. Nothing forces that shape, and nothing accumulates when you do not use it.

**The durable thread is the project folder, not the PR.** Comments on a shared iteration live on its PR, and the review record in `flock-designer/projects/<project-id>/review.md` is what survives across all of them. That was already true; it is what makes per-branch PRs cost nothing in continuity.

**Markers do not drift.** A marker belongs to the iteration that created it; carrying feedback into `i2` requires an explicit re-anchor rather than a misleading automatic move.

**Review captures are Workspace-produced, not scraped.** A capture is taken locally, from the local preview, at a declared fixed viewport, on reviewer request. Workspace does not authenticate against and screenshot a remote SSO-protected deployment — that would require holding a session credential it has no business holding. Captures are content-addressed files stored through Git LFS or an approved object store, not plain Git objects, since they are retained indefinitely.

### Accessibility is continuous, then deepened at handoff

**Implemented in:** `flock-coke/.flkd/standards/universal/accessibility.md` — per-level checks and the manual checklist.

Flock Designer treats accessibility as an input to every credible prototype: the context receipt identifies the active product target, relevant FUI semantics/tokens, and the interaction states that need accessible behavior. The agent follows those constraints while it builds; it does not defer names, semantics, keyboard behavior, focus, non-color signals, status announcements, or motion considerations to a final polish pass.

At Handoff, this becomes a deeper evidence-based review. The handoff separates the product’s active automated target, the recommended next formal 2.1 AA threshold, and any 2.2 uplift observations; it records what was actually run and manually checked. No prototype or agent report may claim a higher conformance level than the product configuration and approved validation evidence support. The review remains scoped to the feature’s files, states, and interaction path: unrelated findings are separate follow-up work, not surprise changes bundled into a handoff.

### The accessibility and hardening report

**Implemented in:** `flock-coke/.flkd/standards/production-readiness.md` — points at the report and the shared checklist. **Full revision is step 10**, after the first real handoff.

Produced once, at Handoff, from the `fd/<project-id>/handoff` branch. It contains:

- the repository's active conformance configuration and the program target being worked toward, shown separately;
- automated results for every touched, runnable state, naming the exact axe target and tags, plus any bypass — a persistent bypass is never reported as a pass;
- manual keyboard path, focus entry and return, semantic structure, accessible name, headings and landmarks, error and status announcement, non-color signal, and reduced-motion review where applicable;
- 2.1 AA next-target and 2.2 uplift observations, clearly separated from the active target and from any conformance claim;
- fixture provenance and the data contract engineering needs;
- confirmation that prototype-only host code, fixtures, demo controls, and review artifacts were removed or isolated from the engineering candidate;
- remaining routing, API, auth, permissions, flags, telemetry, test, and migration work;
- unresolved risks with evidence, owner, and next step; and
- an agent-gap entry for any standard the agent missed, with the rule, cause, evidence, and the proposed `.flkd` or validator change that would catch it next time.

A passing automated scan is a necessary signal, not sufficient validation. Hardening is an in-scope remediation loop bounded by the declared change boundary: in-scope defects are fixed before ready status; findings elsewhere are logged as separate observations and never enter the handoff branch. An in-scope issue needing a product decision carries an explicit exception, risk, and owner.

#### The accessibility position

**Observed gap:** Coke's manifest and `cy.checkPageA11y()` helper enforce WCAG 2.0 A (`wcag2a`), while the current accessibility program names WCAG 2.2 A/AA as its goal and recent evaluation scope. Formal Compliance confirmation remains open.

**Recommended progression:** protect the current 2.0 A floor, make WCAG 2.1 AA the next formal product target through a coordinated manifest-and-check update, then treat WCAG 2.2 as a later uplift.

**Be honest about the size of the middle step.** Moving from 2.0 A to 2.1 AA changes both version and level at once: it adopts the entire 2.0 AA set (contrast, resize text, focus visible, headings and labels, multiple ways) plus the 2.1 A/AA additions (reflow, non-text contrast, text spacing, pointer and target criteria). It is the largest single lift in the sequence, not an increment, and should be estimated as product work.

Until a repository changes its manifest and test configuration, 2.1/2.2 work is readiness guidance, not a conformance claim. The agent may use 2.2-friendly patterns already part of the in-scope design, but must not expand the work or claim conformance ahead of a formal change. The product manifest and matching checks are the single source of truth; a competing level must never be hard-coded into an agent file.

### Learning promotion

**Implemented in:** `flock-coke/.flkd/knowledge/agent-gaps.md` — the four categories and the step 9 exit questions.

Project memory retains one initiative. Shared learning goes through a small promotion loop, and comments never update standards automatically:

| Learning type | Destination | Required approval |
|---|---|---|
| One-off preference or project decision | Project memory | Project/design owner |
| Repeated product decision | Product repository `.flkd` | Product design + engineering |
| Repeated component misuse | Design-system `.flkd` usage guidance or validation | Design System + engineering |
| Repeated agent failure | Proposed skill, test, or guardrail | Workspace/AI engineering owner |
| Accessibility escape found in hardening | Proposed standard, skill, or validation, with the original evidence and a test that would catch it | Accessibility + product engineering |
| Tool or runtime behavior | Adapter/runtime documentation | Workspace engineering owner |
| Unresolved strategic choice | Remains an open question with an owner | — |

The outcome is a suggested patch or PR with sources. It is never an invisible rewrite of standards from raw comments.

A component gap becomes an explicit Design System work item: capture the gap and its use case in the review record, create a linked FUI component-work request, let Design System review decide whether it belongs in FUI, let engineering review approve the implementation, and refresh FUI context only after the consuming repository can resolve the new package version. A prototype never quietly invents a new system primitive.

### Validation

**Implemented in:** `flock-react-component-lib/.flkd/validate.py` — 988 checks, 0 failures from a `flock-coke` checkout as of 2026-09-28.

#### Context integrity

- Resolve the FUI version from the lockfile or `node_modules`, not `package.json`, and verify every selected component exists in that resolved version.
- Check that the agent uses FUI usage guidance before relying on generic MUI assumptions.
- Surface when a sibling FUI checkout is ahead of the installed package.
- Keep `.flkd` durable and tool adapters thin.

#### Prototype safety

- Keep the existing guard against bare `src/...` value imports.
- Detect forbidden production-plumbing imports.
- Verify prototype code stays under `src/prototypes/<project-id>/` and does not register routes or flags.
- Verify no file outside the declared change boundary was modified.
- Require a bundler or smoke check in addition to typecheck and lint.

#### Known limitations of the current guardrails

Carried over from `FLOCK-DESIGNER-EVALUATION.md` when it was retired in step 4. These are observed
facts about how the guardrails actually behave, not proposals.

| Limitation | Detail |
|---|---|
| **The prototype path boundary is prompt-level, not enforced** | The agent has `Write` and `Bash`, so "only write under `src/prototypes/<project-id>/`" is a convention it follows, not a guardrail. A `PreToolUse` hook could enforce it, but hooks apply to **all** Claude Code usage in the repository and would affect the product team's normal work. Not added; it needs a deliberate decision |
| **`.claude/` is not gitignored** | Committing makes these files visible to the whole product team. That is intended for sharing, but it is a visible change to the repository |
| **Prototypes are type-checked and linted** | `tsconfig` includes `src`, so `src/prototypes/` is covered by `tsc --noEmit` and Biome. Intentional — prototypes cannot be sloppy — but it means a production build on a prototype branch includes them |
| **Context cost** | `component-manifest.json` is roughly 14k tokens. The agent is instructed to query it with verified one-liners rather than read it whole |

#### The four reliability checks

Also carried over from the retired evaluation document, whose reliability section called itself the
seed of the validator — which is what `validate.py` became. The principle is the one to keep:
**the answer to a document that is quietly wrong is not fewer documents, it is documents that cannot
silently lie.**

| Check | Where | Catches |
|---|---|---|
| Every `@flocksafety/*` package named in an instruction file exists in `package.json` | Product repositories, PR check | A maintained file naming a package the product does not have |
| Every exported component appears in `component-manifest.json`, and every entry resolves to a real export | `flock-react-component-lib` CI | Manifest drift |
| Every token in `tokens.json` resolves in the theme; every `@deprecated` component is in `deprecated-components.json` | `flock-react-component-lib` CI | Silent token and deprecation drift |
| Every file path referenced in a product context file exists | Product repositories, PR check | Docs pointing at moved or deleted code |

`validate.py` implements the second, third, and fourth today. The first is not implemented.

#### Product quality

- Require a reference pattern or a stated reason for divergence.
- Evaluate required states and interaction, not only the default screen.
- Check accessible naming, keyboard/focus behavior, hierarchy, and feedback states across what was built.

---


## The learning loop

Not a step — a standing practice that starts at step 9 and runs for as long as the system is used.
Step 15 surfaces it inside Workspace.

Gaps found in proofs and projects become reviewed changes to the repository files, through
[learning promotion](#learning-promotion). Claude creates a gap entry for every miss and every
hardening escape and proposes the `.flkd`, skill, or validator change that would prevent a
recurrence; the owner of that repository approves it. Standards never change invisibly from raw
comments.

This is also where everything [deliberately deferred](#deliberately-deferred) lands, which is what
makes deferral safe: the repository's own rule is to add a file or a check when the gap log shows it
is needed, not in anticipation.


## Reference

Detail the steps link to, kept out of the sequence so the sequence stays readable.

### Decisions the audit raises

Four decisions, each with a recommendation. Step 4 and the learning loop implement whichever way they go, so they are settled first, and the outcome is recorded in the change log either way.

**1. FUI context resolution** — ship `.flkd` in the published package, or require a sibling checkout.

**Recommended: ship it in the package**, and resolve the installed package first and a sibling checkout second, reversing today's order. The installed package always matches the lockfile the [agent contract](#the-agent-contract) already requires the agent to read. A sibling checkout on its default branch describes the *latest* FUI rather than the installed `5.5.4`, so an agent reading it can name a component, prop, or deprecation the product does not have — the thing the contract forbids most plainly — and nothing today would catch it. It also removes a second clone from every designer's setup. The cost is one FUI release, owned by the Design System. Until that ships, require the sibling checkout **at the release tag matching the installed version**, and put that step in step 8's setup path. The full comparison is in [step 4](#the-design-system-side).

**2. The view-state list** — the repository names five view states, this plan names six.

**Recommended: one list of seven**, held in `standards/universal/interaction-states.md`, with this plan's [state table](#states-are-runtime-not-decoration) linking to it rather than restating it: default or loaded, loading, empty, error, partial, success or changed, and permission or disabled where relevant. Partial is in the repository and missing from the plan, and the request guide's own example — "what they see when a bulk action partly fails" — is a partial state. The list lives in the repository because that is what the agent reads. The [artifact matrix](#what-each-piece-of-work-owes) still decides how many of them each credibility level owes, so Explore stays light.

**3. `FLOCK-DESIGNER-EVALUATION.md`** — retire it, or keep it as history.

**Recommended: retire it, after moving what is still true.** It is 835 lines in Coke's repository root describing the superseded phase 1–4 rollout, and the agent reads the repository. Move its verified observations into the context document's observed facts, and its reliability section into [the learning loop](#the-learning-loop), which is what that section already calls itself — the seed of the validator. Then delete it from the branch, since Git keeps the history, and point the three files that cite it at these documents instead: `manifest.md`, `knowledge/agent-gaps.md`, and `validate.py`.

**4. The shared `flock-designer` repository** described in `.flkd/README.md` — adopt it, or drop the reference.

**Recommended: adopt it, as the three-layer model in [knowledge layers](#knowledge-layers)** — a shared repository for the agent definitions, skills, universal standards, Flock tier, and Part I contracts; FUI's `.flkd` for component facts; each product's `.flkd` for its own patterns, boundaries, and records.

The files already make the case. Measured at `6bf0f1b8`, `standards/universal/` (5 files, 385 lines) and `production-readiness.md` (61 lines) contain **zero** product-specific references, and the README says the universal tier was written to move. The agents, the skills, and `non-negotiables.md` are a portable rule wrapped around a Coke instance table — 2 to 15 product references each across 637 lines — so they move once those instances are referenced rather than inlined.

**Keep the shared standards out of FUI** rather than folding the two together. FUI's context is *generated* from FUI source, and its own README forbids hand-editing resolved values, so hand-authored organizational standards do not belong in that pipeline. Ownership differs: an accessibility change should not require a component release and a version bump in every product. And a Flock product that is not on FUI still needs the universal tier.

**Create the repository in step 4, move only what is already portable, and publish the package later.** Standing the repository up early makes the three layers a working arrangement that can be shown rather than a diagram of a future state, and it proves the resolution mechanism while it is still cheap to change. Only `standards/universal/` and `production-readiness.md` move, because they carry no product-specific reference; the agents, the skills, and `non-negotiables.md` need their instance tables lifted into `manifest.md` first, which is [deferred](#deliberately-deferred). Publishing waits too: the content is still moving — 3 of 17 skills are written, and the gap log decides the rest — so every fix would become a release. Publish when a second product adopts it.

### The audit

The checklist for [step 4](#14--fix-the-product-repository-files-was-step-4), plus what [step 5](#15--set-up-the-design-system-agent-files-the-full-account-was-step-5) and [step 6](#16--create-the-shared-repository-was-step-6) do.

#### Product repository audit

Observed 2026-09-27 on `flock-coke` `noah/flock-designer` at `6bf0f1b8`, and `flock-react-component-lib` `noah/flock-designer` at `1b54b48`. Every item is an observed fact about those commits; the change column is the proposal.

**Every file is also tagged with its destination layer**, per [decision 4](#decisions-the-audit-raises). Measured at `6bf0f1b8`: `standards/universal/` and `production-readiness.md` carry no product-specific reference and move to the shared repository unchanged; `standards/flock/product-native-ui.md` moves with its two instances lifted into the manifest; the agents, the skills, and `non-negotiables.md` move once their instance tables are referenced rather than inlined; and `manifest.md`, `implementation/`, `product-patterns/`, `composition/`, `knowledge/`, and `projects/` stay in the product. Tagging costs nothing during an audit that already touches every file, and it is what makes the later extraction a move rather than a rewrite.

**Entry and routing**

| File | Today | Change in step 4 |
|---|---|---|
| `CLAUDE.md` | Routes UI work to `flock-designer`; says prototypes go on `proto/*` branches | Switch to `fd/<project-id>/iN`; route by credibility level; keep it thin |
| `.claude/agents/*.md` (3 shims) | Frontmatter plus a pointer into `.flkd/agents/`; `validate.py` checks the frontmatter and the read-only tool sets | No change beyond naming. These are correct as they are |
| `.flkd/README.md` | Index and precedence. Says "all 4 agents" when there are 3; states two paragraphs twice; counts "8 of 11 standards, 3 skills of 17, all 60 files"; describes a separate phase 1–4 rollout; plans a move to a shared plugin repository | Remove the duplicates and stale counts; replace the rollout phases with this plan's phase IDs; add the project folder and credibility levels to the layout; replace the plugin-repository plan with the three-layer model from [knowledge layers](#knowledge-layers), and tag each file with its destination layer |
| `.flkd/manifest.md` | Target WCAG 2.0 A with `['wcag2a']`, checked against `cypress/support/commands.js:58` by `validate.py`. Says to read the FUI version from `package.json`. Prototype branch `proto/<name>`. Links to `FLOCK-DESIGNER-EVALUATION.md` for a "phase 0 spike" | Resolve FUI from `package-lock.json` (today `^5.5.4` in `package.json` resolves to `5.5.4`); switch the branch and directory to `<project-id>`; add the project folder location and the change-boundary rule; replace the evaluation-document references with this plan |
| `.flkd/README.md` layout tree | Already lists the whole structure, but predates the project folder, the shared layer, and the FUI resolution fix. Agent files hard-code paths, and the FUI query path points at a directory that does not exist | Extend the existing tree rather than adding a second map to keep in sync: FUI facts for the installed version, the shared standards, the prototype directory, the project folder, the gap log, and the validator. Agent files link to the tree instead of hard-coding a path |
| `FLOCK-DESIGNER-EVALUATION.md` | Still referenced by the manifest, the gap log, and `validate.py` | Retire it, per [decision 3](#decisions-the-audit-raises): move its verified observations into the context document and its reliability section into the learning loop, then delete it and repoint the three files that cite it |

**Agents**

| File | Today | Change in step 4 |
|---|---|---|
| `.flkd/agents/flock-designer.md` | Good reading order and verification. Has no credibility levels, brief, context receipt, change boundary, or project folder. Asks for "all four states" every time. Its FUI query commands use `FUI=../flock-react-component-lib/agent`, a directory that does not exist; the context is in `.flkd/` | Add the [operating loop](#the-operating-loop) as its working steps: frame, write `brief.md`, write the context receipt, stop for confirmation at Ground and above, build to the level, write `review.md`. Scale states to the [matrix](#what-each-piece-of-work-owes). Fix the FUI path. Add the always/never list verbatim from the agent contract |
| `.flkd/agents/product-parity-reviewer.md` | Strong design-system and parity checks; has an accessibility section | Write findings in the parity and accessibility shape [`review.md`](#the-review-record) expects; label observed facts, inferences, and proposals separately |
| `.flkd/agents/implementation-reviewer.md` | Strong boundary checks. **No accessibility lens.** Checks for a `proto/*` branch and "outside `src/prototypes/`" rather than the declared change boundary | Add the implementation accessibility lens from the [review model](#the-review-model): semantic components, labels and roles, keyboard reachability, focus management, status announcement. Check against the change boundary in `brief.md`. Report "not run" with its reason |

Both reviewers are read-only by design, and `validate.py` enforces it. They return reports; `flock-designer` writes those reports into `review.md`. This keeps the reviewers isolated and must stay.

**Skills**

| File | Today | Change in step 4 |
|---|---|---|
| `skills/choose-existing-patterns.md` | Reuse, adapt, compose, create — matches [choose before inventing](#3-choose-before-inventing) | Name the source for each choice, as the contract requires |
| `skills/scaffold-product-view.md` | Brief questions, placement, directory layout, verification. Uses `proto/*` and `<name>`; requires all four states | Ask from the request guide instead of its own list; switch to `<project-id>`; states by level; add the smoke check step 7 names |
| `skills/recreate-screenshot-with-fui.md` | Sound fidelity rules | Naming only |
| **No new skill files** | The brief, the context receipt, and the review record have nowhere to be written | The [operating loop](#the-operating-loop) goes into `flock-designer.md` itself — frame, receipt, confirm, build to the level, write `review.md` — rather than three new files. The repository's own rule is that skills follow the gap log; extracting them is [deferred](#deliberately-deferred) until that file is unwieldy or a step gets skipped. The handoff skill waits for step 10, where handoff is first tried |

**Standards and accessibility**

| File | Today | Change in step 4 |
|---|---|---|
| `standards/non-negotiables.md` | Precedence, boundaries, placement, design-system rules. §2 uses `proto/<name>`; §5 says to check `package.json`; §8 says "all four states" every time | Switch to `<project-id>` and the change boundary; lockfile resolution; tie §8 to the matrix so an Explore artifact is complete with its default state |
| `standards/universal/accessibility.md` | Universal rules, the axe tag ladder, and "automated testing catches roughly half". Correctly defers the target to the manifest | Add what each credibility level must check and record; a manual keyboard, focus, and announcement checklist that both the review record and the hardening report use; the rule that an unrun check is reported as "not run" and a bypass is never a pass |
| `manifest.md` accessibility section | The only place the target is declared; `validate.py` fails if another file states a WCAG level | Add the [accessibility position](#the-accessibility-position): 2.0 A enforced today, 2.1 AA the recommended next target, 2.2 later readiness. Because of the validator, this goes **only** in the manifest and is labeled a recommendation, not a target |
| `standards/universal/interaction-states.md` | Five view states, including **Partial**, which the plan's [state table](#states-are-runtime-not-decoration) lacks | Hold the single seven-state list from [decision 2](#decisions-the-audit-raises); the plan's table links here rather than restating it. Tie the count owed to the credibility level |
| `standards/production-readiness.md` | A six-item handoff document; "graduation is a rewrite" | Point at the [accessibility and hardening report](#the-accessibility-and-hardening-report) rather than keeping its own list. The full revision happens in step 10, after the first real handoff |
| `standards/flock/product-native-ui.md` | Title Case for titles, sentence case for body text — already corrected. Its occurrence counts come from Coke alone | Close the gap log's open decision on Title Case. Record which product the counts came from, so a second product can confirm or diverge rather than inherit Coke's habits as Flock-wide convention |

**Knowledge, patterns, and implementation**

| File | Today | Change in step 4 |
|---|---|---|
| `knowledge/agent-gaps.md` | Uses `content` / `architecture` / `model` categories and "phase 2 exit questions" from the older rollout | Use the plan's four categories (missing context, missing runtime support, design decision, model behavior); replace the exit questions with step 9's exit |
| `product-patterns/*`, `composition/*`, `implementation/*` | Built from the code with occurrence counts and file paths — the strongest part of `.flkd` | Check the counts and paths against the current baseline and record the commit they were counted at. No other change unless a proof shows a gap |
| Project records | No home in this repository, and they no longer need one | Point the agent files at the [project folder](#the-project-folder) in `flock-designer`. Nothing per-project is written into `flock-coke`, so the rule about keeping project state out of `develop` disappears rather than needing enforcement |
| `validate.py` coverage | **Observed 2026-09-28: it does not pass.** 10 failures at `6bf0f1b8`, before any change in this plan. Its file list misses `composition/` and `product-patterns/` — the 9 files added in `6bf0f1b8` itself — so the pattern files, the strongest part of `.flkd`, are invisible to *every* other check, which is the exact failure its own comment warns about. It also reports 8 broken cross-references: the files exist, but agent files cite them by bare filename and the resolver never looks in `implementation/`, `composition/`, `skills/`, or `product-patterns/` | Add the missing directories to its file list, and resolve the bare references by pointing them at the extended README tree. Both are prerequisites for the exit below, which requires it to pass |
| `src/prototypes/README.md` | Engineer-facing rules; uses `proto/<name>` | Naming, and link to the project folder |
| Existing work | Nothing left to rename | Done in step 3: the branch held no prototype and was deleted, and the directory never existed |

#### The design-system side

FUI's `.flkd` is largely generated from FUI source and already accurate, so this is one fix and one decision rather than an audit. What matters is that a consuming product reads facts matching the version it has installed.

**The problem, not yet written anywhere.** A sibling checkout on its default branch describes the *latest* FUI, not the installed `5.5.4`. An agent reading it can name a component, prop, or deprecation the product does not have — the thing the agent contract forbids most plainly — and nothing today would catch it.

**Set up by Claude**

- Implement the resolution path chosen in [decision 1](#decisions-the-audit-raises), and make the FUI query commands in Coke's agent file work against it. They currently point at an `agent/` directory that does not exist.
- Add the one check this earns: the FUI version being read matches the version installed. This is the only contract check built now; the rest are [deferred](#deliberately-deferred).
- Document where component-gap requests go — FUI's `.flkd` or the Design System team's existing process — in both repositories, so the learning loop has a real destination.

**Done by Noah, with the Design System owner**

- Settle the resolution path, if step 1 has not already, and approve the FUI change. FUI is the Design System team's repository, so its owner approves anything landing there.
- Agree where component-gap requests go.

#### The shared repository

Create `flock-designer` and move into it only the content that is already portable, so the three layers in [knowledge layers](#knowledge-layers) are a working arrangement rather than a diagram.

**Set up by Claude**

- Create the repository and move `standards/universal/` (5 files, 385 lines) and `production-readiness.md` (61 lines) into it. Measured at `6bf0f1b8`, these contain zero product-specific references and lift out unchanged.
- Make Coke resolve them from a sibling checkout, the same pattern FUI uses today, and have `validate.py` fail if the resolution breaks.
- Tag every remaining file with the layer it will eventually belong to. The agents, the skills, and `non-negotiables.md` stay in Coke for now: their Coke instance tables have to move into `manifest.md` first, and that refactoring is [deferred](#deliberately-deferred).

**Done by Noah**

- Create the repository and own it to start.

**Why only the clean content moves.** It proves the resolution mechanism while it is still cheap to change: if three-layer resolution turns out to be awkward in practice, that surfaces with 446 lines moved rather than everything. The setup burden stays flat, because [decision 1](#decisions-the-audit-raises) takes FUI's context into its published package and removes a checkout at the same time this adds one.

### Deliberately deferred

Cut from the first pass to keep the path to a real prototype short. Nothing here is rejected — each item has the thing that brings it back, so it is picked up on evidence rather than remembered by luck. All of it lands in [the learning loop](#the-learning-loop) unless stated otherwise.

| Deferred | Why it waits | What brings it back |
|---|---|---|
| A check for every always/never statement in the [agent contract](#the-agent-contract) | Building thirteen checks before the system has been used once is guessing at which breaches actually happen. Only the FUI version check is built in step 4, because the audit found that failure | The gap log recording a breach a check would have caught. Each statement still gets a written note saying whether a check exists |
| Separate skill files for framing the brief, writing the context receipt, and writing the review record | Three files written on spec breaks the repository's own rule that skills follow the gap log. The operating loop lives in `flock-designer.md` instead, which is one file to keep correct | `flock-designer.md` becoming unwieldy, or the gap log showing a step being skipped because it is buried |
| A file-by-file audit of FUI's `.flkd` | It is generated from FUI source and already accurate. Step 4 fixes the version resolution, which is the failure that actually exists | A proof showing the agent got a component, prop, or token fact wrong |
| Moving the agents, skills, and `non-negotiables.md` into the shared repository | Their Coke instance tables have to move into `manifest.md` first, and that refactoring is the expensive part of the extraction. They are tagged in step 4 so the move stays mechanical | A second product adopting the workflow, or the refactoring becoming worth doing for its own sake |
| A CODEOWNERS co-owner on the shared standards | Nothing is changing them yet, and it is the item with real calendar lead time | the learning loop, when promotions start changing shared standards |
| Publishing `flock-designer` as a package | The content is still moving; every fix would become a release | A second adopting product, per the [gate in Part IV](#part-iv--decision-gates) |
| A Coke-side validator modeled on the FUI one | Same reason as the contract checks: no evidence yet about what it should catch | The gap log showing a Coke-only rule being broken repeatedly |
| A separate location map | `.flkd/README.md` already has a layout tree; a second table would be one more thing to keep in sync. Step 4 extends the tree instead | The tree failing to answer "where is X" during a proof |

### If step 11 says yes: the managed harness

**Why it is conditional.** The managed harness is the single most expensive item in this plan — a product-specific adapter that clones at a pinned revision, resolves FUI, and generates a runnable near-replica, per product. It exists to serve designers who cannot run the product locally. Step 8 addresses that same problem far more cheaply by removing the backend dependency from the real app. Committing to it in advance inverts the evidence. If it never opens, nothing else in this plan changes.

**The harness contract, if built**

- Clone only an approved GitHub source the designer is authorized to read.
- Pin the source commit, resolved FUI version, and `.flkd` context in project memory.
- Generate or open a product-specific React/FUI harness with declared safe dependencies and local mock data.
- Consume an engineering-owned mock-data service only through a declared runtime adapter, recording fixture source and data contract; never treat it as production access.
- Do not copy in production credentials, production data, auth flows, APIs, feature flags, telemetry, or the complete app dependency graph.
- State plainly which product behavior is recreated, mocked, or intentionally omitted.
- Keep the managed worktree and its branch in Git so the result can be handed to engineers without a local-app export.
- Live in a single shared private prototype repository namespaced by `fd/<project-id>/*` branches, not one repository per project.

**Delivery**

- Provision that repository and its access model.
- Build the first product-specific harness adapter. Coke gets a Coke adapter; another product does not inherit Coke assumptions — a large part of why this is expensive.
- Validate the PR deployment path for that repository separately; it is a different repository with different provisioning.
- Add promotion to a linked `fd/<project-id>/promotion` branch using the transfer manifest, and validate it with a real receiving engineer.

**Promotion contract.** Workspace creates the direct-repo branch from the selected product baseline and supplies a transfer manifest: prototype commit and preview, source and FUI pins, selected patterns, target product surface, mock-data and omission list, and remaining implementation work. The receiver adapts or reimplements inside the product structure. **Never merge a harness branch automatically into the product repository** — the near-replica intentionally differs in routing, runtime wiring, dependencies, and data. Promotion is an explicit, reviewable port, and both tracks stay linked in the project record.

**Done when:** a designer who could not otherwise contribute has a code-backed path, and their work can reach product source through a deliberate port.

---


# Appendix B — What was built, and why

*Every completed step, with its evidence and what it changed. Moved here intact on 2026-10-05.*

## Name map: old step names to the new numbers

Steps were renumbered by phase on 2026-10-05. Everything below, and the change log, still uses the old
names, so this is how to read them.

| Old name | Now | Step |
|---|---|---|
| step 1 | 1.1 | Decide the rules |
| step 2 | 1.2 | Set up the first files |
| step 3 | 1.3 | Rename existing prototype work |
| step 4 | 1.4 | Fix the product repository files |
| step 5 | 1.5 | Design-system agent files |
| step 6 | 1.6 | Create the shared repository |
| D1 | 1.7 | Stop copying the design system |
| step 7 | 2.1 | Confirm the prototype harness |
| step 8 | 2.2 | Make the product runnable on mock data |
| step 9 | 2.3 | Prove it on real decisions |
| A2 | 2.4 | Run a prototype in the real shell |
| B1 | 2.5 | Prove the codebase path |
| step 10, B2 | 2.6 | Build the handoff |
| step 12, B3 | 2.7 | Close the review and evidence gaps |
| step 13 | 3.1 | Build the local authoring app |
| C1 | 3.2 | Sign in, and the comment store |
| C2 | 3.3 | Open a preview and comment on an element |
| C3 | 3.4 | Share for review |
| C4 | 3.5 | Close the loop |
| C5, step 16 | 3.6 | Pilot and decision |
| step 18 | 4.1 | Designer environment access |
| step 17 | 4.2 | Ship the design-system context in the package |
| step 11 | 4.3 | Decide if the managed harness is needed |
| steps 14 and 15 | — | Replaced by 3.3 and 3.4; automating handoff inside the app was dropped. Kept in [Appendix C](#appendix-c--superseded-designs) |

## Status blocks and navigation as they stood before 2026-10-05

> ### Where we are
>
> **Tracks A and B are complete. Track C is paused** — [step 13](#31--build-the-workspace-local-loop-was-step-13)
> is built and works, and the plan owner wants to revisit the idea before more is built on it.
> **Every step Claude can finish is finished.** What is left needs other people: the
> [decision gates](#part-iv--decision-gates) for steps 14–16, the Design System owner for
> [step 17](#42--ship-the-design-system-context-in-the-package-was-step-17), and registry access for
> [step 18](#41--designer-environment-access-was-step-18).
>
> **What is actually left in Track A:** a person opening a prototype and reviewing it. Four proofs are
> built and every mechanical check passes; steps 7 and 9 both wait on that same act.
>
> **Corrected 2026-09-29:** the status column had been wrong in both directions — step 9 read
> "Not started" with four proofs on disk, step 7 read Complete with "opens" never verified, and step 5
> read Complete in the table and In progress in the change log.
>
> Everything that needs access or another person is parked out of the critical path:
> **[step 17](#42--ship-the-design-system-context-in-the-package-was-step-17)** (the shared repo's org
> transfer, the FUI context generator, shipping `.flkd` in the package) and
> **[step 18](#41--designer-environment-access-was-step-18)** (AWS registry access, and the unaided
> designer test).
>
> Everything needing org or release permission — the shared repo's transfer to `flocksafety`, the FUI
> context generator, shipping `.flkd` in the package — is collected in
> **[step 17](#42--ship-the-design-system-context-in-the-package-was-step-17)** so it does not block the work
> in front of it.
>
> Step 6 is live at `noahshrader-flock/flock-designer` and waiting on an org transfer to
> `flocksafety/flock-designer` — a one-step move once someone with permission does it. Nothing else
> is blocked by that.
>
> Go straight to **[the sequence](#the-sequence)** — that is the working list. Everything before it
> is reference you consult while doing a step, not reading you do first.


- **[Part I — What this is](#part-i--what-this-is)**: purpose, principles, vocabulary, how much to build, the evidence model, how this compares to Magic Patterns, and what exists today.
- **[Part II — Contracts](#part-ii--contracts)**: what must be true throughout — the architecture, how the agent behaves, where code and records live, how review and handoff work. Reference, consulted while working.
- **[Part III — The work](#part-iii--the-work)**: one numbered sequence of 18 steps. Do a step, see the result, move to the next.
- **[Part IV — Decision gates](#part-iv--decision-gates)**: every organizational confirmation, its recommendation, its owner, and the step by which it must close.
- **[Part V — The Workspace application](#part-v--the-workspace-application)**: the Electron app. **Last on purpose** — built at step 13, after steps 1–12 prove the workflow without it.

**Why the order is what it is.** The agent's context comes first because it is what everything else
orchestrates: if a designer working in a checkout with nothing but the agent and `.flkd` cannot get a
good result, no application will rescue it. The cheapest steps produce the evidence that justifies
the expensive ones, and the first line of application code is not written until the workflow has been
proved without it.


## Part III — The work

One sequence. Do a step, see the result, move to the next. Each step says who does it and what
"done" means, and nothing later starts until the step before it closes.

**Steps 1–12 need no application at all.** If the workflow does not work with a designer, a checkout,
the agent, and `.flkd`, the Workspace has nothing to orchestrate. Step 13 is the first line of
application code, and it does not start until the work has been proved on real decisions without it.

**Building and proving are separate on purpose.** Steps 1–8 build; step 9 is where we find out whether
any of it works, on real product decisions. When a proof exposes a gap it becomes a reviewed
repository change through the [learning loop](#the-learning-loop), so every later project gets the fix.

**The managed harness is conditional on purpose.** It is the most expensive item here — a
product-specific adapter that clones at a pinned revision and generates a runnable near-replica. It
exists for designers who cannot run the product locally, and [step 8](#22--make-the-product-runnable-on-mock-data-was-step-8)
addresses the same problem far more cheaply. [Step 11](#43--decide-if-the-managed-harness-is-needed-was-step-11)
decides it on evidence.


### Status

> **Tracks A and B are complete. Track C is paused** — [step 13](#31--build-the-workspace-local-loop-was-step-13)
> is built and works, and the plan owner wants to revisit the idea before more is built on it.
> **Every step Claude can finish is finished.** What is left needs other people: the
> [decision gates](#part-iv--decision-gates) for steps 14–16, the Design System owner for
> [step 17](#42--ship-the-design-system-context-in-the-package-was-step-17), and registry access for
> [step 18](#41--designer-environment-access-was-step-18).
>
> **What is actually left in Track A:** a person opening a prototype and reviewing it. Four proofs are
> built and every mechanical check passes; steps 7 and 9 both wait on that same act.
>
> **Corrected 2026-09-29:** the status column had been wrong in both directions — step 9 read
> "Not started" with four proofs on disk, step 7 read Complete with "opens" never verified, and step 5
> read Complete in the table and In progress in the change log.
>
> Everything that needs access or another person is parked out of the critical path:
> **[step 17](#42--ship-the-design-system-context-in-the-package-was-step-17)** (the shared repo's org
> transfer, the FUI context generator, shipping `.flkd` in the package) and
> **[step 18](#41--designer-environment-access-was-step-18)** (AWS registry access, and the unaided
> designer test).
>
> Everything needing org or release permission — the shared repo's transfer to `flocksafety`, the FUI
> context generator, shipping `.flkd` in the package — is collected in
> **[step 17](#42--ship-the-design-system-context-in-the-package-was-step-17)** so it does not block the work
> in front of it.
>
> Step 6 is live at `noahshrader-flock/flock-designer`, pending an org transfer to
> `flocksafety/flock-designer`.


### The sequence (before 2026-10-05)

**Three things get built, in order. Finish one before starting the next.**

| Track | What it delivers | State |
|---|---|---|
| **A — the prototype path** | A designer takes a real request to a reviewed prototype, isolated from the product | **Complete**, bar one human gate in [step 1](#11--decide-the-rules-was-step-1) |
| **B — the codebase path** | A designer builds the real frontend on mock data; engineering takes the branch | **Complete** |
| **C — the Workspace app** | The Electron app that orchestrates both | **Paused 2026-09-29 by the plan owner.** [Step 13](#31--build-the-workspace-local-loop-was-step-13) is built and works; 14–16 wait on gates other people own, and on an idea Noah wants to revisit first |
| **D — the design-system layer** | Context that points at the installed package instead of copying it, so it cannot go stale | **Complete** — [D1](#17--stop-copying-the-design-system-point-at-it-was-d1) deleted 3,071 lines of snapshot |

**[Step 18](#41--designer-environment-access-was-step-18)** (designer AWS access) and the packaging and org
transfer sit outside the tracks because they need access or another person, and neither blocks the
work in front of it.

**On the numbering.** Track A's steps kept their original numbers 1–9 because they are done and the
change log refers to them constantly; later steps use track letters. It is inconsistent, and
renumbering finished work would break every historical reference for no gain. **Every row above links
to its section and every link resolves** — that is the thing to rely on, not the numbering.


#### Track A — the prototype path

| # | Step | Done when | How it is checked | Status |
|---|---|---|---|---|
| 1 | [Decide the rules](#11--decide-the-rules-was-step-1) | Contracts approved, decisions settled, **owners named** | Human | **In progress** — the Design System owner is still unnamed, which blocks part of 5 and 17 |
| 2 | [Set up the first files](#12--set-up-the-first-files-was-step-2) | The three files exist | Mechanical | **Complete** — `4538812e` |
| 3 | [Rename existing prototype work](#13--rename-existing-prototype-work-was-step-3) | No `proto/<name>` branch or directory remains | Mechanical | **Complete** — nothing to rename |
| 4 | [Fix the product repository files](#14--fix-the-product-repository-files-was-step-4) | Audit done; `validate.py` passes; cold start passes | Mechanical + cold start | **Complete** — 1,006 checks, cold start passed |
| 5 | [Set up the design-system agent files](#15--set-up-the-design-system-agent-files-the-full-account-was-step-5) | Agent reads facts matching the installed version; authoring standards exist | Mechanical + human | **In progress** — standards done; the version half needs the generator, which needs the DS owner |
| 6 | [Create the shared repository](#16--create-the-shared-repository-was-step-6) | Holds the standards, projects and plan; Coke resolves them | Mechanical | **Complete** — `3d15ae9` |
| 7 | [Confirm the prototype harness](#21--confirm-the-prototype-harness-was-step-7) | One real artifact **builds, opens, and reviews cleanly** | Mechanical + human | **Complete** — reviewed 2026-09-29; the watermark and icon defects it surfaced are fixed |
| 8 | [Make the product runnable on mock data](#22--make-the-product-runnable-on-mock-data-was-step-8) | The real shell runs locally on mock data | Mechanical | **Complete** — render verified from screenshots |
| 9 | [Prove it on real decisions](#23--prove-it-on-real-decisions-was-step-9) | A proof went request → **reviewed** prototype; a second person resumed from the folder alone | Human | **Complete** — four proofs, resume test passed, reviewed 2026-09-29 |
| A2 | [Run a prototype in the real shell](#24--run-a-prototype-in-the-real-shell-was-a2) | A prototype mounts inside design mode with the product's real navigation and routing | Mechanical | **Complete** — `667c5070`; nav-inheritance verified by live test |

**Track A is complete, 2026-09-29.** Four proofs built, the resume test passed, a person opened and
reviewed one — which immediately surfaced two harness defects, both fixed — and A2 proved a prototype
inherits the product's real navigation rather than a copy of it.

**Step 1 is the one thing still open in this track**, and only partly: the Design System owner has
never been named, which blocks part of step 5 and step 17.

#### Track B — the codebase path

| # | Step | Done when | Status |
|---|---|---|---|
| B1 | [Prove the codebase path](#25--prove-the-codebase-path-was-b1) | One real feature built in real locations on MSW data, with tests and every state | **Complete** — `56aee3c3` |
| B2 | [Build the handoff](#26--build-the-handoff-was-b2) | `npm run handoff` refuses unless the work is genuinely ready, and produces **HANDOFF.md** in the branch | **Complete** — `3f137cd6`, `cef176be`; 15 checks, verified on a real branch |
| B3 | [Close the review and evidence gaps](#27--close-the-review-and-evidence-gaps-was-b3) | Every decision-relevant state can be exercised and checked, and the automated accessibility scan actually runs | **Complete**; `npm run handoff` green on all six work branches, 13 real defects found and fixed or recorded with an owner |

#### Track C — the Workspace app

| # | Step | Done when | Status |
|---|---|---|---|
| 13 | [Build the Workspace local loop](#31--build-the-workspace-local-loop-was-step-13) | A designer goes from a request to a local, repo-backed preview without learning Git or dev-server mechanics | **Complete** — `158eab3`; 88 tests, the journey end to end, a boot smoke check, and confirmed working by Noah |
| 14 | [Workspace: shared review](#step-14--workspace-shared-review) | A distributed team reviews a real iteration from an internal link and returns to its exact branch and commit | **Not started** — needs the [decision gates](#part-iv--decision-gates) and other people's calendars |
| 15 | [Workspace: handoff and learning](#step-15--workspace-handoff-and-learning) | The handoff B2 proved by hand is automated, in the shape a receiving engineer's feedback produced | **Not started** — waits on an engineer receiving one |
| 16 | [Pilot and release decision](#step-16--pilot-and-release-decision) | The team decides on evidence whether this is worth keeping | **Not started** |

**Step 13 is built and confirmed working**, 2026-09-29. **Track C is paused from 2026-09-29**, at the
plan owner's direction: he has an idea for the Workspace worth working through before more is built
on top of it. Nothing is lost by waiting — step 14 could not have started anyway, because six of its
[decision gates](#part-iv--decision-gates) are owned by other people, and step 13's own success
measure is that *every artifact remains usable without the app*.

#### Track D — the design-system layer

| # | Step | Done when | Check | Status |
|---|---|---|---|---|
| D1 | [Stop copying the design system; point at it](#17--stop-copying-the-design-system-point-at-it-was-d1) | No context file restates what the installed package already carries, and `validate.py` reads the package | Mechanical | **Complete** — `873aba9`, `bf5b4c13`; 3,071 lines deleted, 606 checks, 0 failures |

**Split out of [step 17](#42--ship-the-design-system-context-in-the-package-was-step-17) on 2026-09-29**,
then **reversed by the plan owner from "build a generator" to "delete the copies."** The packaging and
the org transfer stay in 17 with their owners — though 17 is now much smaller, because shipping
`.flkd` in the package mattered mainly to keep a snapshot in step with the code, and there is no
snapshot.


#### Waiting on other people (before 2026-10-05)

**These are not steps and they are not in the sequence.** Each needs a person who is not Claude, each
has a place already built for it, and none holds up the work in front of it. This section exists
because treating them as sequence steps made "what is next" unanswerable.

| | Needs | Where it lands |
|---|---|---|
| **Name the Design System owner** | Noah | Unblocks the FUI generator and the `cokeUsages` decision |
| **An engineer receives a handoff** | Noah + an engineer | The machinery is built and verified; their feedback revises `prepare-handoff.md` |
| **Designers review prototypes** | Noah + designers | `projects/<id>/review.md` already holds it |
| **Decide on the managed harness** ([step 11](#43--decide-if-the-managed-harness-is-needed-was-step-11)) | Noah | Needs real usage first; the friction log is the evidence |
| **Ship `.flkd` in the package + org transfer** ([step 17](#42--ship-the-design-system-context-in-the-package-was-step-17)) | Design System owner | Specified, including the generator it needs |
| **Designer AWS access** ([step 18](#41--designer-environment-access-was-step-18)) | Noah | Access is confirmed as provisionable |
| **Open the step 14 conversations** ([step 14](#step-14--workspace-shared-review)) | Noah | GitHub auth, preview provisioning, capture storage, knowledge-repo access — their lead time is other people's calendars |

**Status values:** Not started, In progress, Complete. A step is Complete only when its "done when"
is met and the evidence is cited in the [change log](#change-log).

Two things run outside the sequence: the [learning loop](#the-learning-loop), which starts at step 9
and never ends, and the [managed harness](#if-step-11-says-yes-the-managed-harness), which is built
only if step 11 calls for it.

---


### What was deliberately not being built (before 2026-10-05)

| Not yet | Earliest | Why it waits |
|---|---|---|
| Any Electron application code beyond an architecture spike | step 13 | step 9 has to prove there is a workflow worth orchestrating |
| The `flock-design-knowledge` repository | step 14 | The project folder is sufficient while review is co-located, and costs nothing |
| GitHub App, draft PRs, shared preview links | step 14 | First external dependency, first security review, first recurring cost |
| Visual markers and review captures | step 14 | Needs a shared preview to annotate |
| Workspace-automated hardening and learning promotion | step 15 | step 10 proves the handoff by hand first |
| Managed prototype harness and promotion | the managed harness, conditional | step 8 may remove the problem it solves |
| Any visual canvas, embedded editor, Figma import, or model-provider integration | Never in this plan | Out of scope by design, not deferred |

The external confirmations step 14 depends on — GitHub authentication, preview provisioning and access policy, capture storage, and knowledge-repository access — gate step 14, not step 13. Open them during step 13, since their lead time is other people's calendars.

#### 1.2 — Set up the first files (was step 2)

**Claude. Complete**, on `flock-coke` `noah/flock-designer` at `4538812e`.

- `.flkd/request-guide.md` — what good context covers, the four levels, and what happens next. A request arrives in whatever form the thinking already exists in, so this is a list of what is worth knowing, not a template.
- `.flkd/knowledge/baselines.md` — the three measures step 16 compares against, empty and waiting for numbers.
- `.flkd/knowledge/setup-friction.md` — what it took each person to get running, kept separate from the gap log because it decides step 11.

**Done when:** the three files exist. ✅

#### 1.3 — Rename existing prototype work (was step 3)

**Claude. Complete.** It went first so step 4 would write the final names rather than renaming twice.
There was nothing to rename.

**What was actually there**, checked in `flock-coke` on 2026-09-28:

- `proto/device-health-summary` was a **local-only branch at `6bf0f1b8`, an ancestor of `noah/flock-designer`** — the same tree minus the step 2 commit. It held no unique commit, no prototype, and no remote copy. Its commit is the standards commit, unrelated to device health.
- **`src/prototypes/device-health-summary/` never existed** — not in the working tree, not on any branch, not anywhere in history. `src/prototypes/` contains only `README.md`. This matches the context document's observed fact that the implementation "does not yet contain a working end-to-end prototype example"; the branch name was aspirational.
- No file in any repository or planning document referenced the branch except this plan.

**So the branch was deleted rather than renamed.** Renaming it to `fd/device-health-summary/i1` would
have minted an iteration branch containing no iteration — a name in the new scheme pointing at a
commit with nothing in it, which step 4 would then have to explain. Nothing was lost: `6bf0f1b8` is an
ancestor of `noah/flock-designer` and stays reachable, and the branch is recreatable with
`git branch proto/device-health-summary 6bf0f1b8` if this judgment is wrong.

**Done when:** no `proto/<name>` branch or directory remains. ✅ Verified — `git branch -a` in
`flock-coke` matches neither `proto` nor `device-health`.

#### 1.4 — Fix the product repository files (was step 4)

**Claude writes it; Noah reviews and merges.** The biggest step, and the one everything after it
depends on. Claude Code reads `CLAUDE.md`, the agent files, and `.flkd` — not these planning
documents — so this is where the Part I contracts actually take effect. Each contract gets an
`Implemented in:` line under its Part I heading.

Delivered as focused commits grouped by area — entry and routing, agents, skills, standards,
knowledge — so each is reviewable on its own. The [audit](#the-audit) below is the checklist.

**Done when:** every row of the audit is done or has a recorded reason it is not; every Part I
contract has an `Implemented in:` line; `validate.py` passes; and the **cold-start check** passes —
in a fresh session in the checkout, with none of these planning documents available, the agent can
state from the repository files alone what the four levels are, what a chosen level requires, where
the FUI facts for the installed version are, and where a project's records go.

##### What was done, 2026-09-28

Four commits in `flock-coke` on `noah/flock-designer`, plus one in
`flock-react-component-lib`:

| Commit | Repo | Area |
|---|---|---|
| `18a1eff4` | flock-coke | Entry and routing — `CLAUDE.md`, `.flkd/README.md`, `.flkd/manifest.md`; `FLOCK-DESIGNER-EVALUATION.md` retired |
| `f8baa387` | flock-coke | Context truthfulness — the three false claims, 10 bare cross-references, `knowledge/agent-gaps.md` |
| `55a9853e` | flock-coke | Agents — operating loop, the contract, the implementation accessibility lens |
| `5096ad62` | flock-coke | Skills and standards — states by level, the manual checklist, lockfile resolution, Title Case closed |
| `d3759cb` | flock-react-component-lib | `validate.py` coverage and type exports |

**`validate.py`: 988 checks, 0 failures**, from 867 checks with 10 failures at the baseline.

**Three real defects the coverage fix exposed**, all invisible before because `composition/` and
`product-patterns/` were validated by nothing: `settings-patterns.md` showed an `FSSwitch` that FUI
does not publish (Coke uses `FSToggle`); two files named a breadcrumb component that does not exist;
and `product-shell-recreation.md` cited a prototype directory that had been removed. A fourth,
separate bug: the main agent's FUI query commands pointed at
`../flock-react-component-lib/agent`, **a directory that has never existed** — anything following
them failed or guessed.

**The validator itself had two blind spots**, both fixed: its file list omitted 10 files on disk,
and it treated type-only exports as unpublished, so a real export used in product code
(`FSDataGridColumn`) was reported as a lie.

**Cold-start check — PASSED, live, 2026-09-28.** A fresh session in the `flock-coke` checkout,
with these planning documents unavailable, answered all four questions from the repository alone and
cited file and line for each; every citation was verified accurate. It avoided both known traps:
it said an Explore artifact owes **the default state only** (not "all four states"), and it resolved
the FUI version from `node_modules`/the lockfile rather than from `package.json`'s `^5.5.4` range,
then checked the resolved value and reported **5.5.4**.

**The check also earned its keep by finding a real defect** — see the change log entry for
`43635e32`. Original file-inspection note follows.

**Verified by file inspection.** All four questions are
answerable from `.flkd/` alone and reachable from `CLAUDE.md` → `.flkd/README.md` →
`manifest.md`: the levels and what each requires are in `manifest.md`, `accessibility.md`, and
`interaction-states.md`; installed-version FUI resolution is in `manifest.md`, `non-negotiables.md`
§5, and the agent; the project folder is named in 9 files. **A true cold start needs a fresh
session in the checkout with these documents unavailable — Noah should run that before calling the
step closed.**

**Deferred, with reasons:** the shared repository extraction of `agents/`, `skills/`, and
`non-negotiables.md` still needs their Coke instance tables lifted into `manifest.md` first — every
file is now tagged with its destination layer, which is what makes that a move rather than a
rewrite. `production-readiness.md` gets its full revision in step 10, after a real handoff. The
bundle smoke check is step 7; the agent and the gap log both record that `tsc` and lint do not prove
a prototype builds.

#### 1.5 — Set up the design-system agent files: the full account (was step 5)

**Claude, with the Design System owner approving.** Two things: resolution, which is one fix, and the
authoring standards, which do not exist yet.

**Resolution.** FUI's existing context is generated from FUI source and already accurate, so this is
one fix and one decision, not an audit — the agent must read facts matching the version the product
actually has installed.

**Authoring standards.** `flock-react-component-lib/.flkd` needs the standards for working *in* the
design system, not only for consuming it: where things are in the library, how components are
authored and changed, and how stories are created and adjusted. Nothing covers this today. It is
the design system's own layer, owned by the Design System owner, and the product repositories point
at it rather than restating it.

**Done when:** from a Coke checkout, the agent resolves the installed FUI version and reads facts
that match it, with no guessing; and from a `flock-react-component-lib` checkout, the agent can state
the component-authoring and story standards from the repository's own files.

##### Cold-start test, 2026-09-28 — found a real defect on its first run, like step 4's did

Four questions, fresh session, `flock-react-component-lib` checkout, plan unavailable. Full pass on
three of four; the fourth exposed something worth having found.

**The regeneration question is the one that mattered.** It answered correctly — no regeneration
command exists — but by citing `.flkd/README.md`, which I had corrected. **It never checked
`.flkd/authoring/components.md`**, which still said the opposite: "generated from `src/`... fix the
source and regenerate." I had corrected the claim in one file and left the identical false one
standing in the file I'd written it in originally. The session got the right answer by luck of which
file it happened to trust, not because the repository agreed with itself. Fixed in `f03db25`.

**It also found a real gap, not just a contradiction:** `components.md` never mentioned composite
components — the generator has a whole second path for them (`src/compositeComponents/`, a
`use<Name>.ts` hook, prompted at generation time), documented from the actual templates. Fixing that
turned up a second problem in my own draft: I called both "single-file vs multi-file" (a split
*within* `src/components/`) and "basic vs composite" (a different directory root entirely) "two
shapes" — the same word for two unrelated splits. Disambiguated.

**On the composite generator prompt and the PR template's breaking-changes checklist**, both cited
accurately and add real value beyond what this file said; not yet folded in.

**`validate.py`: 999 checks, 0 failures**, from a Coke checkout — the version NOTE still present
and correctly non-blocking.

##### What was done, 2026-09-28

`a160edf` in `flock-react-component-lib`, `3a4f1f4c` in `flock-coke`.

**The authoring half is done.** `.flkd/authoring/components.md` and `.flkd/authoring/stories.md`
exist, written from the repository as it is at `5.5.8` rather than from assumption. FUI's `.flkd`
had described FUI *to its consumers* and said nothing about building FUI itself. The standards cover
where things are, the prop allowlist as the convention that keeps 133 exports coherent, what counts
as a breaking change, the story shape and the title groups, and the fact that **FUI uses ESLint and
Prettier while Coke uses Biome** — neither should inherit the other's tooling.

**Two inconsistencies recorded while writing them:** `FSButton` exports its props type and `FSAlert`
keeps it local, so nothing outside that module can name it; and an exported *type* never appears in
`component-manifest.json` at all, because the manifest is generated from the runtime bundle.

**Component gaps now have a destination** — the FUI repository, reviewed by
`@flocksafety/frontend-guild` — documented in both repositories, so the learning loop ends
somewhere real instead of a product quietly widening the API.

**The resolution half is built but not satisfied.** The rule is written and now *enforced*: the
generated context must be current with the source it came from, and that stamp must match the
installed version. Together those are what make "check out FUI at the tag matching your installed
version" actually work — without the first, the tag hands you `.md` files from one version and
JSON from another.

> **That check fails today, correctly.** `validate.py` is at **998 checks, 1 failure**: the FUI
> checkout's source is `5.5.8` while its generated context says `5.5.4`. The drift is real and
> pre-existing; step 5 made it visible and blocking rather than silent. **It is not closeable from
> here** — regenerating at `5.5.8` would then disagree with Coke's installed `5.5.4`, and the
> checkout cannot be both. The structural fix is [decision 1](#decisions-the-audit-raises): ship
> `.flkd` inside the package, where it cannot disagree with itself. Today
> `package.json` has `files: ["build", "dev/postinstall.ts"]` and nothing copies `.flkd` into
> `build/`, so it is **not published**.

##### The finding that changes decision 1

Chasing the version drift turned up why it exists, and it is structural rather than an oversight.

**There is no regeneration command.** `component-manifest.json`, `tokens.json`, and
`deprecated-components.json` were produced **once**, in `0f25abd`, and have never been regenerated.
Nothing in FUI references `versionScannedFrom` except the manifest itself and `validate.py`. The
README claimed the files are "generated from `src/`" and told readers to "fix the source and
regenerate" — naming a process that does not exist. Corrected in `62f8748`.

**They also could not be regenerated from `src/` alone.** 35 components carry a `cokeUsages` count
and `counts.commonInCoke` is 35 — that data comes from scanning **Coke**. The manifest is a
cross-repository artifact, not a build output of FUI.

**Three versions are live right now:** the manifest is stamped `5.5.4`, the working branch is
`5.5.8`, FUI's `develop` is `5.6.4`, and Coke has `5.5.4` installed. The context matching Coke is
luck — it was generated when `5.5.4` happened to be current and has not moved since.

**Why this matters for [decision 1](#decisions-the-audit-raises):** its recommendation is to ship
`.flkd` inside the published package so the context always matches the lockfile. That is still the
right direction, but **on its own it does not fix this** — publishing a manifest nothing regenerates
makes staleness *reliable* rather than absent. The generator is the prerequisite, not a follow-up.
FUI's README now carries a spec for what it has to do, including the decision `cokeUsages` needs:
a Coke-shaped field in a design-system artifact is one product's habits promoted to a system fact.

##### Resolved: the local path is the working path

**Decided 2026-09-28 by the plan owner.** Work against the sibling checkout now; bring the context
into the published package later, with a developer, as [step 17](#42--ship-the-design-system-context-in-the-package-was-step-17).

Two problems were tangled together, and only one of them defers:

| | Defers? |
|---|---|
| **Distribution** — sibling checkout today, published package later | **Yes.** Step 17 |
| **Version match** — does the context describe what the product has installed? | **No, and it already holds** |

**The invariant that matters is already true.** Coke has `5.5.4` installed and the manifest is
stamped `5.5.4`. Every `FS*` name in every context file is verified against that manifest plus the
installed type declarations, so the agent cannot name a component the product does not have — which
is the thing the [agent contract](#the-agent-contract) forbids most plainly.

What is *not* aligned is FUI's own hygiene: that checkout's source is `5.5.8` while its generated
context says `5.5.4`. That is real, it is FUI's to fix, and **it does not make the JSON wrong for a
product pinned to an older version.** `validate.py` was over-scoped — it failed a consuming repo's
build for a condition only the design system could fix, which is how checks get disabled. It now
fails on `manifest == installed` and reports `manifest == source` as a **NOTE**: printed every run,
never silent, never blocking. Run without an installed package, the second becomes the failure,
because there it is actionable.

**The residual risk, stated plainly:** the hand-authored `.md` files in a checkout ahead of the
installed version are unversioned and could describe newer behavior. Component *names* are covered
by the validator; prose is not. Step 17 removes the class of problem.

**Still owed — now step 17, plus one thing for Noah:**

| Owed | Who |
|---|---|
| Name the Design System owner | Noah |
| Approve the authoring standards and the FUI change | Design System owner |
| Align the versions — tag the checkout at the installed version, or regenerate and pin | Design System owner |
| **Build the context generator**, decide `cokeUsages`, ship `.flkd` in the package | [Step 17](#42--ship-the-design-system-context-in-the-package-was-step-17) |
| Confirm the component-gap destination is the right process | Noah + Design System owner |

#### 1.6 — Create the shared repository (was step 6)

**Done, at a temporary address.** `noahshrader-flock/flock-designer` on GitHub, branch
`noah/flock-designer`, commit `d2afdfa` — pushed there rather than under `flocksafety` because
`noahshrader-flock` cannot create repositories in that org. A personal-to-org transfer is a one-step
GitHub operation that keeps the full history, so nothing here gets redone when it moves.

**Built so far:**

- `projects/` — one folder per project. Drop in whatever context exists, in whatever form it exists.
- `projects/_template.md` — the optional starting template. Prompts, not fields; ignoring it is fine.
- `standards/` — empty, waiting for the portable standards to move out of `flock-coke`.
- `README.md` — how to start a project, and what does not belong here.

##### The content moved, 2026-09-28

`3d15ae9` (flock-designer), `82d6112d` (flock-coke), `6e0d469` (flock-react-component-lib).

- **`standards/universal/` and `production-readiness.md` moved across**, verified portable first.
- **Coke resolves them from a sibling checkout** — `../flock-designer/standards/` — the same
  arrangement FUI context uses and the same terms on which it becomes a package later.
- **`PLAN.md` moved in**, per step 1's decision that the plan lives alongside the standards and
  projects it describes. `standards/README.md` states how a product resolves the tiers and which one
  wins.
- **`non-negotiables.md` and `standards/flock/` stayed.** Both wrap a portable rule around a Coke
  instance table; they move once those instances are lifted into `manifest.md`.

**Verifying portability turned out to be the interesting part.** The audit's claim that
`standards/universal/` held "zero product-specific references" came from grepping for product names,
and it was incomplete. Validating the files from a consuming repo immediately caught **two universal
files that declared themselves "product-agnostic" in one line and hard-linked to
`../flock/product-native-ui.md` in the next** — a universal standard reaching up into the tier above
it. Both now describe the relationship without the path, which is what actually makes them portable.
A third reference form was missed on the first substitution pass and also caught by the validator.

**One consequence worth stating plainly:** a `flock-coke` checkout alone no longer contains the
accessibility floor or the view-state list. **The cold-start check now needs two checkouts.** Coke's
`.flkd/README.md` says so, and `validate.py` reports a missing shared checkout rather than letting
the gap pass silently — but this is a real increase in setup burden, and step 8 owns making that
survivable for a designer.

`validate.py`: **1006 checks, 0 failures.**

**Nothing is open here. The org transfer moved to [step 17](#42--ship-the-design-system-context-in-the-package-was-step-17)**,
where it sits with the other items needing someone with org and release permission. Every reference
in this document to `flocksafety/flock-designer` means this repository at whichever address it
currently has — **the transfer is housekeeping, not a plan change**, and nothing here gets re-derived
once it happens.

**Done when:** the repository holds the portable standards, the project structure, and the plan, and
Coke resolves the standards from it. **The address is not part of this step** — it is step 17.

#### 1.7 — Stop copying the design system; point at it (was D1)

**Claude. Complete, 2026-09-29** — `873aba9` in `flock-react-component-lib`, `bf5b4c13` in
`flock-coke`.

**This step was written as "build the context generator" and the plan owner reversed it mid-build.**
The reversal was right and the reasoning is worth keeping, because it applies to everything in
`.flkd/`.

**What was there.** `component-manifest.json`, `tokens.json` and `deprecated-components.json` —
**3,071 lines** holding 133 components, **494 resolved hex values** and a `versionScannedFrom` stamp.
Produced once in `0f25abd`, never regenerated, four patch versions stale.

**What the generator found before it was deleted.** Building it was not wasted, because it proved the
copies were wrong in ways nobody had noticed:

- **`FSFormInput.onChange` was published as `(fieldName: string) => void`.** It takes
  `(fieldName: string, value: string | number | boolean | string[] | null) => void`. The manifest was
  dropping the argument carrying what the user typed — in the one field that exists to stop people
  getting these handlers wrong.
- **`FSAlertButton` was documented with `FSAlert`'s description and prop allowlist.** It takes
  `FSButtonProps`. The same fault gave the whole `FSGridToolbar*` family `FSDataGrid`'s 60 props:
  components declared inside another component's file had each inherited their neighbour's entry.
- Three MUI re-exports claimed `FSDataGrid`'s props; `tokens.json` was missing the `desktopNav`
  breakpoint entirely.

**Why the generator was deleted anyway.** Noah, on seeing 494 hex values in a file a generator would
now keep in sync: *"I don't want to add a ton of scripting where if things change in the design
system, we're constantly having to go back and update these files... the files inside the design
system should be pointing to the actual files in there."*

That is correct, and it dissolves a problem rather than automating it. **The version question was
self-inflicted.** `versionScannedFrom` existed only because facts were copied; the whole chain —
manifest vs source, source vs installed, and a hard validator failure when a checkout sat one patch
ahead of the product — was the cost of keeping a copy. Nothing is copied now, so there is nothing to
stamp and nothing to mismatch.

**What replaced it.** Every fact was already in the package a product installs:

| Question | Where it is answered now |
|---|---|
| What components exist? | `ls node_modules/@flocksafety/flock-react-component-lib/build/src/components` |
| What props does it take? | That component's shipped `index.d.ts`, including the MUI augmentations — which is where `FSChip`'s `variant="status"` is declared |
| What is deprecated? | `grep -rl '@deprecated'` over the same directory — the JSDoc survives into the declarations |
| What tokens exist? | `build/src/colors/*.d.ts` — names only. **No one needs the values**: tokens are referenced by name in `sx` and the theme resolves them. `createFSTheme()` works inside the app or a test, but **not from a bare `node -e`**, whose plain-Node loader rejects the bundle's extensionless imports (found 2026-10-05; the original instruction here had never been run) |

`tokens-and-styling.md` now lists palette key *names* and no values; `component-usage.md` keeps the
hand-written knowledge the types cannot express — the deviations that type-check and still surprise
you. **`validate.py` reads the installed package** and gained a check that **fails on a hex literal
in any context file**, which is what stops the snapshot growing back.

**Done when:** no context file restates a value the package already carries; every reference across
both repositories points at the package; and `validate.py` passes reading only from `node_modules`.
**Met** — 606 checks, 0 failures, and no version NOTE, because there is no longer a version chain to
report on.

**The rule this leaves behind, which is the durable part:** *a context file states judgment, not
data.* Where something is written down twice, one copy is always about to be wrong.

#### 2.1 — Confirm the prototype harness (was step 7)

**Claude.** Prove the prototype contract works before using it on anything real.

- Build one small real artifact in `src/prototypes/<project-id>/` and confirm the directory contract holds.
- Document how a reviewer opens the entry point and compares states.
- Keep `tsc`, lint, and the bare `src/...` import guard, and add the bundle or dev-server smoke check that the gap log showed those two miss.

**Done when:** an isolated prototype can be built, opened, and honestly reviewed.

> **Corrected 2026-09-29.** This step was marked Complete on 2026-09-28 with "opened" **unverified**.
> Prototypes register no production route by design, so nothing served them — `src/prototypes/README.md`
> said "open `index.tsx`", which is a file, not a URL. The instruction had never been followed by
> anyone, including its author. Found by the third real project's agent, which tried to follow it,
> worked out a manual `src/index.tsx` swap, and reported the docs as wrong. Fixed in `9015497e` and
> `90043e1c`: `npm run start:prototype -- <project-id>` serves one prototype on `:3100` from its own
> dev-only config, verified end to end. **The step's own "done when" was not met when it was closed**,
> and the closing evidence cited the build check for a claim about opening.

##### What was done, 2026-09-28

`e9e5b14c` (flock-coke), `2f43511` (flock-designer). Branch `fd/alert-notification-prefs/i1`.

**The bundle gap is closed** — the open item the gap log has carried since 2026-09-02.
`scripts/smoke-prototype.mjs` bundles a prototype entry with rsbuild's alias set and deliberately
without a bare `src/` alias, so an import that type-checks and does not bundle fails here. Wired into
the agent, the skill, and `src/prototypes/README.md` as a required third check, and exposed as
`npm run smoke:prototype -- <project-id>`.

**It was verified, not asserted.** Injecting the exact import from the 2026-09-02 gap entry produced
`tsc` **0 errors**, Biome **clean**, and a smoke-check **failure**. Then reverted. That is the whole
argument for the check, demonstrated rather than claimed.

**The artifact:** `src/prototypes/alert-notification-prefs/`, holding the full directory contract and
all seven view states behind a switcher so a reviewer compares them without editing code. The
project folder in `flock-designer` carries brief, context receipt, and review — one slug keying the
branch, the directory, and the folder, which is the contract proved end to end.

**Building it corrected three things the manifest alone did not carry**, each caught by `tsc` against
FUI's prop allowlists rather than by inspection: `FSToggle` requires `label` and permits no
`aria-label` or `inputProps`; `FSToggleButtonGroup` omits `size`; `FSButton` takes `FSVariant`, not
`filled`/`outlined`. This is the allowlist behaving exactly as
[`authoring/components.md`](#15--set-up-the-design-system-agent-files-the-full-account-was-step-5) says it should.

**The first real component gap came out of it.** `FSToggle` has no accessible-name route in its
allowlist, so when the visible label is rendered separately — which the product's canonical settings
row does — the only option is a native `<label htmlFor>` bound to the input `id`. Coke's
`togglePreferenceRow.tsx` renders `<FSToggle label="" />`, so those toggles appear to be unnamed
product-wide. Logged in the project's `review.md`; **not yet filed in FUI**, because the Design
System owner is still unnamed.

**What the review record does not claim:** six of ten manual accessibility checks are recorded as
**not run**, the automated scan could not run at all (Cypress will not launch in this environment),
and no human has reviewed product parity. The artifact proves the harness; it does not prove the
design.

#### 2.2 — Make the product runnable on mock data (was step 8)

**Claude, tested on a real designer.** The cheapest fix for the onboarding problem, and the evidence
Step 11 needs.

- Port the verified MSW and `start:design` approach from `noah/local-design-mode` onto the Designer baseline. Do not merge the divergent branch wholesale.
- Preserve `.flkd`, the agent adapters, and the prototype contract.
- Keep fixtures separate from product-pattern truth, and document where they came from.
- Add one shell-level smoke check and a manual review checklist.
- Write a setup path a designer can follow without frontend help, then test it on a designer who has never run Coke and record what happened in the friction log.

**Done when:** the real Coke shell runs locally on mock data.

> **Scope narrowed 2026-09-28, at the plan owner's direction.** This step originally also required
> *"and a designer reaches that state unaided."* That half depends on AWS registry access being
> provisioned and on the correct SSO command being confirmed — neither of which is Claude's to do,
> and both of which were discovered only at the end of this step. **They moved to
> [step 18](#41--designer-environment-access-was-step-18), together with the unaided designer test and the
> unverified `msw` lockfile port.** Narrowing the step is recorded here rather than done quietly,
> because "done when" changed after the fact.

##### What was done, 2026-09-28

`afa5aa4f`, plus `22de790d` which moved step 7's tooling onto this baseline.

**The port is in and the server side is verified.** The mechanism came across from
`noah/local-design-mode` — not the branch, which is not merged. Design mode is gated on
`PUBLIC_APP_DESIGN_MODE`, set only by `start:design`, with MSW behind a dynamic import so it never
reaches a production bundle. `npm run smoke:design` checks the four things a shell can check: the
server boots with no Crown or Tanqueray, design mode is compiled into the entry bundle, the worker is
served, and **the checked-in worker matches the installed `msw`** — a stale worker after an upgrade
is the classic silent MSW failure.

**A real defect the port surfaced.** `msw` was present in `node_modules` from an earlier checkout but
**absent from `package-lock.json`**. A clean `npm ci` — which is what a designer runs — would have
installed no `msw`, and design mode would have failed with the working environment showing no sign of
it. The 43 lockfile entries were ported from the verified branch; the resulting diff is 499
insertions, matching that branch's own lockfile diff exactly.

**A branch-hygiene mistake, found and fixed.** Step 7's infrastructure — the smoke script, the npm
script, the `.flkd` and README updates — had been committed to the prototype *iteration* branch
rather than the baseline. Prototype branches are never merged, so that tooling would have been
stranded and every future branch cut from the baseline would have lacked it. Split in `22de790d`;
the iteration branch now touches only `src/prototypes/alert-notification-prefs/`, which is what the
change boundary always said it should.

**Setup friction, recorded:** `npm install` failed with `401 Unable to authenticate` against
`npm.pkg.github.com` — `@flocksafety` packages need a GitHub token with `read:packages`. The error
names npm, not GitHub, and says nothing about scopes. It is now the first thing in
`src/prototypes/DESIGN-MODE.md`, but **documenting a trap is not removing it**, and it is the most
likely thing to stop a designer.

##### Cold-start test, 2026-09-28 — passed, both traps cleared

A fresh session in `flock-coke`, plan unavailable, answered all four from the repository: the
command and the token setup, what is real versus mocked, the no-navigation cause, and — the trap —
that design mode is **not** needed to review a prototype. It got the no-nav answer exactly right
(LaunchDarkly; they ran `start` rather than `start:design`) and volunteered `npm run smoke:design`
as the self-check. Every citation verified accurate. **No defect found** — the second clean pass in a
row, after three that each found one.

**This was the document test, not the designer test.** It proves `DESIGN-MODE.md` answers the
questions; it does not prove a designer gets a running app.

##### The most likely failure, named in advance

`msw`'s lockfile entries were **ported by hand**, because the `401` made a real install impossible
here. The port matches the source branch's lockfile diff exactly — 499 insertions — but **no clean
`npm ci` has ever run against it.** If it is wrong, the first person to run `npm ci` finds out, and
the symptom is design mode failing rather than an obvious install error. Whoever runs the designer
test should run `npm ci` first and report whether it succeeded, before judging anything else.

##### The render question is settled, 2026-09-28

**The plan owner ran `npm run start:design` and it worked in seconds.** Screenshots show the full
shell: top nav, admin sub-nav, Organizations List populated, Profile page, account switcher. That
settles the thing this step could not verify from a shell — **MSW interception, the auth bypass, and
the LaunchDarkly flag mocking all hold end to end.** The nav rendering is the proof of the last one,
since `AppHeader` does not render until at least one flag returns.

**It also caught a documentation defect, and a nasty one.** `DESIGN-MODE.md` said to expect data for
"Springfield Police Department" — **a name that appears nowhere in `src/mocks/fixtures/`.** It was
asserted, not read. The real data is *HOA Org*, *Law Enforcement Org*, and *John Smith*. A designer
following that file would have seen the correct screen, failed to recognise it, and concluded the
setup was broken — a false negative sending them for help while everything worked. Corrected in
`99491e48` to a table taken from the fixtures, usable to tell working from broken at a glance.

**Discoverability was broken too, found in the same conversation.** `DESIGN-MODE.md` sat at
`src/prototypes/` with nothing linking to it, while the root `README.md` opened by saying local
development needs a local database and `flock-tanquery` — the exact barrier design mode removes. A
designer would have read that and concluded they could not run Coke. Fixed in `ddcc6f54`.

##### `npm ci` was exercised, and it failed — 2026-09-28

A fresh clone into `/tmp` by the plan owner. The clone worked and the branch carried design mode.
**`npm ci` failed immediately with `401 Unable to authenticate`.**

**The cause is not what this plan assumed.** GitHub Packages answered fine
(`npm view @flocksafety/flock-react-component-lib version` → `5.6.4`). The **default registry, AWS
CodeArtifact, returned the 401**, and `aws sts get-caller-identity` showed no AWS credentials at all.

**1,320 of the 1,428 packages in `package-lock.json` resolve through CodeArtifact** — `react`
included, not just the private `@flocksafety` ones. **Without AWS access, a designer installs
nothing.** The CodeArtifact token also **expires within 12 hours**, so this is recurring friction,
not one-time setup: it will feel like the environment breaking for no reason, on a schedule.

**The setup doc was wrong about the cause**, which would have made it worse rather than neutral. It
said a `401` meant a missing GitHub PAT with `read:packages`; a designer would have made a new GitHub
token, added it, still failed, and had nothing pointing at the real system. Corrected in `3fdec5af`,
with the AWS credential step explicitly marked unconfirmed with whoever owns the registry.

**Resolved the same day — designers will be provisioned AWS access** (plan owner, 2026-09-28). That
turns the registry from a capability barrier into an **onboarding step**: real, and it has to happen
before a designer is handed this, but not a reason to build anything.

**What provisioning does not fix, and [step 11](#43--decide-if-the-managed-harness-is-needed-was-step-11)
should still weigh:** the CodeArtifact token expires within 12 hours. Every designer doing this work
will hit a setup that worked yesterday and does not today, with an error naming npm rather than AWS.
That is permanent recurring friction of the kind that makes people quietly stop using a tool rather
than complain about it. The backend barrier is genuinely gone — the shell renders on fixtures — but
"runs locally on mock data" now carries a standing dependency on an internal registry and a
twice-daily token refresh. Worth naming as a cost, not a blocker.

**None of this was visible until someone cloned from scratch**, which is the argument for having
done it before handing this to a designer rather than after.

**Still not verified:** the hand-ported `msw` lockfile entries, since `npm ci` never got far enough
to install anything. The run above was on a machine that
already had `node_modules`, so nothing was installed and no token was needed — which is precisely
the step predicted to block a designer. The hand-ported `msw` lockfile entries remain unverified.

**Not done, and it is the half that matters:** **no designer has run this.** The server-side checks
pass, but whether the shell *renders* needs a real browser running the service worker, and whether a
designer gets there unaided is the actual "done when." Step 8 stays **In progress** until someone who
has never run Coke tries it and the result is in the friction log.

#### 2.3 — Prove it on real decisions (was step 9)

**Noah leads; Claude does the setup and the writing.** Everything before this was building. This is
where we find out whether it works. Two or three real decisions, in a real checkout — no Workspace,
no harness.

**Noah**

- Pick two or three Explore or Ground requests from real product work, and send whatever exists for each.
- **Confirm the brief and correct the context receipt before the build.** The one moment that cannot be delegated back to the agent.
- Answer the product questions it raises; confirm or reject each drafted decision.
- Judge each prototype. Would it go in front of a stakeholder? Is it grounded in Flock, or generic?
- Run the **resume test**: give someone else one project folder and nothing else, and record what they could and could not recover.
- Record setup friction — yours and every participant's.

**Claude**

- Check step 4 landed before starting: the audited `.flkd` is on the baseline, `validate.py` passes, the cold-start check passes, FUI facts resolve. If not, stop and say so rather than testing an agent that never saw the contract.
- For each proof, create the project folder, the branch, and the prototype directory, pinning the baseline commit and resolved FUI version.
- Write `brief.md`, then the context receipt **before building**, then build only what makes the decision testable.
- Run the checks, run both reviews, and write `review.md` with the accessibility section. Report anything not run as "not run," with the reason.
- Log every miss in the gap log. A miss that blocks a proof is fixed as a reviewed repository change through the [learning loop](#the-learning-loop), never patched by hand inside one prototype.

**Done when:** at least one proof went from request to reviewed prototype in a single working
session; a second person resumed a proof from its project folder alone; no production code changed;
and the team knows whether local setup is genuinely blocking anyone.

#### 2.4 — Run a prototype in the real shell (was A2)

**Claude. Sequenced after [B1](#25--prove-the-codebase-path-was-b1)**, not before it — building in the
real app first is what will show what this should look like, and Track B needs no new mechanism to
get real chrome.

**The problem.** A prototype's surrounding chrome is **reconstructed** in `host.tsx`, not real. It
looks right because the agent read `useAdminSubNavItems` and copied the item list — so it is a
snapshot that silently goes stale the day someone adds a nav item. A prototype of an admin view
should inherit the actual navigation, not a copy of it.

**The mechanism already half-exists.** Design mode runs the real shell on MSW data
(`npm run start:design`). What is missing is mounting a prototype *inside* it, so the prototype
inherits real navigation, real routing and real chrome, with only the network faked. That is the
[real-shell design mode](#the-two-runtime-modes) the contract has described from the start.

**Why this was not already a step.** The contract described it; nothing scheduled it. Step 8 built
design mode as a way to *run the product* and closed, and no step ever owned the other half — the
same failure that left the codebase path unbuilt for nine steps.

- Mount a prototype inside design mode without registering a production route.
- Keep `npm run start:prototype` — standalone is faster and right for a view that does not depend on
  its surroundings. Two ways to open one, chosen by what the work needs.
- `host.tsx` becomes optional rather than required, and the agent is told when each applies.

**Done when:** a prototype opens inside the real shell with the product's actual navigation, and
adding a nav item to the product changes what the prototype shows without anyone editing the
prototype.

##### Verified 2026-09-29

`667c5070`. `/design/<project-id>` is registered **only** when `config.isDesignMode`, so it can never
exist in production — which is what keeps it inside [non-negotiables](#the-agent-contract) §1's ban on
production routes. It works because `App.tsx` renders the header and sub-nav **above** `<Routes>`, so
anything mounted inside inherits the real navigation with no wiring and nothing to keep in sync.

**The criterion was tested, not assumed.** A nav item, `NAVTEST-A2`, was added to the real product's
`useAdminSubNavItems` and appeared in the prototype. No prototype file contained that string —
verified zero matches — so it was inherited, not copied. Reverted after.

**It also exposed a defect the criterion did not ask about.** A prototype's `host.tsx` renders its own
`FSUniversalNav`, so mounted at `/design/` it stacked a reconstructed nav under the real one. A small
context now tells a prototype the real shell is already around it, and `host.tsx` skips its chrome;
standalone via `start:prototype` it still draws it. The two modes now differ deliberately rather than
by accident.

**Both ways of opening a prototype stay**, because they answer different questions: `start:prototype`
is isolated and faster when the view does not depend on its surroundings; `/design/<id>` is right when
placement, navigation or surrounding density is the question.

**Navigating away from a prototype lands you in the real product**, on mock data. That is deliberate:
a prototype is one view at one route, and what surrounds it is the genuine neighbour to compare
against. Making its nav links route *within* the prototype would mean the prototype owning routing —
forbidden — and would leave no way to tell a real link from a simulated one.

#### 2.5 — Prove the codebase path (was B1)

**Claude builds it; Noah judges it.** Track B's first step, and the thing the plan described from the
start and never built — see [the two build paths](#the-two-build-paths).

Build **one real feature** the way a designer would hand it to engineering: real file locations, real
Redux, real routing, real permissions, with **only the network stubbed** by MSW handlers in
`src/mocks/`. Tests written. Every state the feature actually has. Accessibility **run**, not
recorded as "not run."

**Pick something already prototyped**, so the two paths can be compared directly on the same feature.
The inactivity signal is the obvious candidate: it exists as a prototype, and as production work it
is a contained change to one existing column.

**Done when:** the feature is built on a normal product branch; `tsc`, lint, tests and
`npm run check:boundary` pass; every state is reachable in the running app; the accessibility
checklist is genuinely run; and `handoff.md` lists the stubbed endpoints — the list engineering
swaps.

**How it is checked:** mechanical. Unlike Track A's remaining gate, nothing here needs a person until
step 10.

#### 2.6 — Build the handoff (was B2)

**Renamed 2026-09-29.** It was "Hand one off to an engineer," which made a step depend on someone who
is not Claude and turned "what is next" into a list of blockers. **Building the handoff is the step.**
An engineer receiving one is real and still wanted — it is in
[Waiting on other people](#waiting-on-other-people--never-blocks-a-step), where it belongs.

**Complete.** `npm run handoff -- <project-id>` runs 15 checks and refuses unless the work is genuinely
ready; **HANDOFF.md** is produced at the branch root where engineering will actually see it.

**Noah picks the proof and the engineer; Claude prepares the handoff.** This is here, rather than
inside the app at step 15, because handoff is the claim engineering cares about most. Testing it by
hand costs little; discovering at step 15 that the shape was wrong means rebuilding it inside an
application.

- **Build the `/handoff` command here.** Handoff was briefly a credibility level, which was wrong — it is a deliberate, formal run, not a setting chosen before any work exists. This step is where that command gets defined: what it checks, what it produces, and what it refuses to do when the work is not ready. Tool-agnostic language first, with a thin `.claude/` adapter if a slash command is wanted.
- **Prototype path:** Claude creates the handoff branch, runs the checks against every touched state, and writes `handoff.md` with the [accessibility and hardening report](#the-accessibility-and-hardening-report) and a **rewrite plan**.
- **Codebase path:** there is no rewrite. Engineering **takes the branch over**. Claude's job is to hand it across complete — every state built, tests written, accessibility actually run rather than recorded as "not run", and `handoff.md` carrying the **list of stubbed MSW endpoints**, which is precisely the work engineering picks up.
- Noah gives it to the engineer who would actually build it, and records whether it reduced ambiguity, what they still had to ask, and what they wanted that it lacked.
- Claude then revises the report and writes the handoff skill from what the engineer said.

##### The command is built, 2026-09-29

`05fa8a52`, `3f137cd6` in `flock-coke`. **Claude's half of this step is done; the half that closes it
is not.**

**`npm run handoff -- <project-id>`** refuses when the work is not ready. It checks a clean working
tree, that the brief and handoff exist, `tsc`, lint, tests — required on the codebase path, optional
for a prototype — the bundle and boundary checks for prototypes, and that shipping code does not hand
over accessibility marked "not run" without saying why. **Every false claim this project has produced
was one nobody could run**; this makes "ready for engineering" a fact.

**It caught a real failure on its first run** — repo-wide lint was failing on `smoke-prototype.mjs`,
which I had linted with a scoped check that passed. "Lint passes" was an assertion and it was wrong.

**`.flkd/skills/prepare-handoff.md`** is the judgement half, deliberately not in the script: lead with
what engineering actually picks up, name the decisions made that were not the agent's to make with the
most-likely-wrong first, and report accessibility as run or not-run but never as silence. The gap log
has carried this skill as deferred since step 4, waiting for a real handoff to write it from.

**Verified against the real B1 branch:** all eight checks pass on `feature/users-inactivity-signal`.

##### What handoff actually is

**Clarified by the plan owner 2026-09-29, and it is narrower than this step assumed.** Handoff is
**getting a branch properly hardened and leaving it ready**. Design passes it along manually;
engineering takes the branch and does what they need with it. There is no ceremony beyond that.

**The handoff document lives in the branch**, at the root as **HANDOFF.md**. It had been written into
`flock-designer/projects/<project-id>/`, a different repository — whoever took the branch would never
have seen it. Corrected in `cef176be`; the gate now requires it in the branch.

**Two documents, two audiences, no duplication:**

| | |
|---|---|
| **HANDOFF.md**, in the branch | What engineering picked up. The feature, which files are actually it, what remains, and the decisions design made that were not design's to make. Deleted when the work merges — it describes a handoff, not the product |
| `flock-designer/projects/<id>/` | Why it was built that way. Brief, context receipt, both reviews. Stays |

**It must name which files are the feature.** The first real handoff had five feature files among
sixty, because the branch carried Flock Designer infrastructure that has not merged to `develop`. An
engineer opening that cannot tell what they are looking at, so the document gives the exact `git diff`
that shows only the feature.

**Done when:** an engineer has received a real handoff and said whether it helped, and the report
reflects their answer. **This is human-gated and Claude cannot close it** — Noah picks the engineer
and records what they said.

#### 2.7 — Close the review and evidence gaps (was B3)

**Claude.** Written before real use; **rescoped 2026-09-29 against what four real projects actually
showed.** Two of its four original items are done or overtaken, and the remaining two are the
evidence gaps every review so far has recorded as unmet.

| Original item | Now |
|---|---|
| A standard way to switch among states | **Done.** Prototypes carry a state switcher; the codebase path shows real states |
| Screenshot / review-link capture | **Overtaken.** Captures existed to annotate shared previews, which is [step 14](#step-14--workspace-shared-review). Nothing needs them before then |
| **The accessibility check actually running** | **Still open, and the real gap.** Every review so far records the axe scan as "not run — Cypress will not launch." That is four consecutive artifacts with no automated accessibility evidence |
| **Unhandled requests visible, not silent** | **Still open.** `onUnhandledRequest: 'bypass'` means a missing fixture looks like a working screen with absent data |

**Done when:** the automated accessibility check runs against a prototype and against a codebase-path
change, producing real output rather than "not run"; and an unhandled app-data request in design mode
is visible rather than silently bypassed.

**Status: Complete, 2026-09-29.** Both, plus the debt they left behind.

**The scan.** `npm run a11y` — axe-core 4.10.3 driven by vitest and happy-dom, all already installed.
Cypress still does not launch here (`npx cypress verify` rejects its own Electron flags on
darwin-arm64), and it never needed to: axe needs a DOM, not Cypress. It now runs across **all five
work branches** — four prototypes and two codebase changes — and every project record that said "not
run" now carries a real result.

It found things on its first run, which is the argument for having it:

| Found | Where | Disposition |
|---|---|---|
| `aria-required-children` — the grid toolbar sits inside `role="grid"`, which may only own rows | `orgUsersListSlotComponents.tsx` and every prototype copying it | **Product defect, recorded as inherited.** Named, with an owner |
| `aria-required-children` — `role="list"` holding `role="img"` children | `roleListRowCard.tsx`, on `develop` today | **Product defect, written up in that branch's HANDOFF.md** for the engineer to decide |
| A landmark `role="region"` nested inside a grid | The prototype toolbar, copied from production | **Fixed** in the prototype |
| Testing Library's cleanup never registered, so renders piled up in one document and `screen` queries matched the previous test's markup | Every spec in the repo | **Fixed** in the shared render helper |
| A vitest cache file committed to git, dirtying the tree on every run | `__tests__/node_modules/` | **Fixed** — `.gitignore` only anchored `node_modules` at the root |

Three supporting pieces were needed to make it honest rather than green:

- **`renderInShell`** wraps in `FSApp`, the wrapper that ships and that the product's own specs
  already use. The alternative on offer was the older pattern of mocking the whole component library
  with plain divs — which scans markup nobody ever receives.
- **`useStubbedLayout`** gives happy-dom a viewport. Without it MUI's DataGrid virtualises to zero
  rows and axe reports a missing-row fault that exists only in the test. Switching the rule off
  would have been quicker and would have hidden the real version of the same fault.
- **`InheritedViolation`** records a violation this work did not introduce and cannot fix from here.
  Every entry must name what is wrong and who can fix it, and **the run fails once an entry stops
  firing** — so a suppression cannot outlive its defect. It is the opposite of switching a rule off.

**Unhandled requests.** `onUnhandledRequest: 'bypass'` sent anything unmocked to the real API, where
it failed authentication, the app swallowed the error, and the screen rendered correctly with the
data simply absent — an empty table reading as a design decision. App-data requests are now refused
and named in a bar at the bottom of the window with the method and path a handler would need. Fonts
and third-party scripts still pass through, which is why blanket bypass was there to begin with.

**What still cannot be checked here, and who owns it.** Tab order, focus visibility, keyboard
reachability, colour contrast, and the screen-reader read-through all need a browser or a person.
happy-dom has no layout, so axe's `color-contrast` rule is disabled there by design. Every record now
names this as one gap with one owner — the first browser-based accessibility pass — rather than
repeating "not run" per row. That pass is in [Waiting on other people](#waiting-on-other-people--never-blocks-a-step), not
in the sequence, because it is not something Claude can finish.

**Then both reviewers ran, and the scan's own honesty was the first thing they broke.** The helper
read `results.violations` and discarded `results.incomplete` — axe's undecided results — so a green
run was hiding items on **five of six branches**. With that fixed, the reviews turned up nine more
real defects, including one of mine: an `InheritedViolation` recording something as unfixable that
the prototype could fix in four lines. **A suppression that is merely untrue is worse than no scan,
because it looks like diligence.** It was deleted and the underlying defect fixed. Also fixed, not
recorded: a tooltip on a disabled control that no keyboard could reach, four row titles rendering as
`<h6>` under an `<h1>`, a `partial` state whose banner named data it was still showing, an unnamed
search box, and two `aria-label`s landing on elements ARIA forbids naming.

**Made required, not merely possible.** `non-negotiables.md` §7 now says every view gets a
`*.a11y.spec.tsx`; the handoff gate refuses work that has none and refuses a run where axe found
anything. Both were written the day the scan started working, so nothing lands having skipped it.

#### 3.1 — Build the Workspace local loop (was step 13)

**Claude. Complete, 2026-09-29** — `158eab3` in `flock-designer`, `75730a90` in `flock-coke`.
The first line of application code. Everything local — no network integrations, no shared services,
no external approvals.

*(This step said "Engineering" until it was built, which contradicted the rule that a step is
something Claude can finish. Writing the application is Claude's; steps 14–16 are the ones that need
other people, and they say so.)*

- The Electron shell for macOS and Windows, with a secure renderer, preload, and main-process boundary.
- Open one Coke checkout, read `.flkd`, and render the context receipt.
- Create and continue project branches and worktrees through explicit user action.
- Invoke the Claude Code adapter and run one allowlisted local preview command.
- Persist named iterations and write to the project folder.

**In parallel:** open the step 14 conversations with their owners — GitHub authentication, preview
provisioning, capture storage, knowledge-repository access. Their lead time is other people's
calendars.

**Done when:** a designer goes from a request to a local, repo-backed preview through Workspace
without learning the underlying Git and dev-server mechanics.

**Built, in `flock-designer/workspace/`.** Electron 44, React 18, FUI, TypeScript; `npm run dev`,
`npm test`, `npm run smoke`.

| Owed | Built | Proven by |
|---|---|---|
| Electron shell with a secure renderer/preload/main boundary | `contextIsolation`, `sandbox`, no `nodeIntegration`, a CSP with no remote origins, one named-operation bridge with no generic invoke | `npm run smoke` boots the real app and asserts the window opened and the renderer loaded |
| Open a checkout, read `.flkd`, render the context receipt | `descriptor.ts`, `contextReceipt.ts` | Parses the descriptor Coke actually ships and resolves Coke's real FUI version from its lockfile |
| Create and continue branches through explicit user action | `git.ts`, `iterations.ts` | Refuses on a dirty tree, refuses a name already taken, and treats a branch name with shell metacharacters as a name |
| Invoke the Claude Code adapter and run one allowlisted command | `agent.ts`, `runtime.ts` | The allowlist refuses anything undeclared; a descriptor cannot smuggle in a shell string |
| Persist named iterations and write to the project folder | `iterations.ts` | The record survives switching branches, which is exactly what a record on the branch would not |
| The journey itself | — | One test runs all of it against a real repository: open → receipt → iteration → agent → preview → stop → return |

**Three things the build found.** The iteration record was first written into the product checkout,
which dirtied the tree and then blocked the next iteration on its own bookkeeping — the plan had
already settled that records live in `flock-designer/projects/`, and had already given this reason.
A stopped preview reported itself as a crash, because `stop()` removed the entry before the exit
handler could tell the difference. And `ELECTRON_RUN_AS_NODE`, which editors and agent harnesses
export into the environment, makes the Electron binary run as plain Node and die on its first line.

**The click-through is confirmed.** Noah ran the app on 2026-09-29 and reported it works. That was
the one thing the tests could not answer, and it is the go/no-go below: **the answer is go.**

**This is the honest go/no-go.** Step 9 already proved designers can reach the outcome without an
application; this only makes it easier, and the collaboration value arrives at step 14. It is the
step most at risk of being built because it is on the list rather than because it is needed.


#### 3.2 — Prove sign-in and the comment store (was C1)

**Claude. Mechanical, plus one human check.** Built in the existing app. Everything later depends on
two things being true that are *not yet verified*: that device-flow sign-in works for people in the
company's GitHub org, and that issue comments are a workable comment store.

- Rename the app **Flock Designer**; separate *author* features (need a checkout) from *reviewer*
  features (need only a GitHub account).
- **Sign in with GitHub by device flow**; keep the token in the OS keychain. Build against a
  development **GitHub App** with device flow enabled and permission for Issues on the design repo
  only. GitHub's docs confirm device flow needs no secret for GitHub Apps, and that a user token is
  limited to what both the app and the user can do. (An OAuth app would need the `repo` scope, which
  reaches every repository the user can access — Coke included.)
- **List projects and their iterations** from the design repo through the API — no clone.
- **Create, post to and read** one issue per iteration, with a label, for comments.
- **Publish the iteration record automatically** *(added 2026-10-05, built)*. Creating or continuing
  an iteration in the app writes `projects/<id>/iterations.json` to the design repo through the API,
  so reviewers see it with no manual step. It merges by iteration name, so a stale checkout cannot
  delete someone else's iteration, and it writes nothing when the record is unchanged. If the author
  is signed out, or the app lacks permission, the local save still succeeds and the app says the
  iteration has not been shared yet. The five older records were written by hand and are marked so.
  **Needs the GitHub App's Contents permission raised from read-only to read and write**, then
  approved on the installation.

**Done when:** an account with only *read* access signs in, lists the projects, posts a comment on an
iteration, and a second account sees it — verified against a test repository. **Human:** one sign-in
with a real company account, to confirm the org's SSO behaves.

**Needs:** one GitHub App client ID, registered by Noah for development. **Not in this step:** previews,
anchoring, any server.

#### 3.2.5 — Show who is on each project

**Claude. Built 2026-10-05; added because designers working directly in the codebase will be the main
way in, and a reviewer needs to know whose work they are looking at.** The project list shows, for each
project, everyone who has committed to it, so two designers on one project both appear.

- **Where the names come from.** Code commits live in the Coke repo, which reviewers cannot see, so
  the author's app records them. Opening or continuing an iteration reads the commit authors on that
  branch beyond the trunk, and writes them into the iteration record as `contributors`, which is
  published to the design repo with the rest of the record. The reviewer's app also reads the history
  of the project's own design-repo folder, which catches whoever wrote the brief or the review. A
  project's list is the union, alphabetical, with no duplicates.
- **Names only, no emails.** The record lives in a shared repository.
- **Avatar and username** *(added 2026-10-05)*. Each person shows as their GitHub profile picture and
  username, with their initial where no account is known. A git name is not a GitHub login, so the
  login is resolved without guessing, from three sources: a `…@users.noreply.github.com` address
  names its account; the person running the app is signed in as themselves, so commits under their
  own git identity carry their login; and the design repo's folder history links commits to
  accounts. Most Flock commits use a company address, so a collaborator appears by name until they
  open an iteration in the app once, after which their login is recorded. A login learned anywhere
  applies to that person everywhere. Pictures load from GitHub's avatar host, the only network
  fetch the window is allowed.
- **Bots are left out.** Accounts ending `[bot]` are automation, not people.
- **How current it is.** Refreshed when an iteration is opened or shared (3.4 also refreshes it), so
  commits made since then appear at the next one. Names are matched case-insensitively; one person
  who commits under two git names appears twice, which `git config user.name` fixes.
- **Simple prototypes.** A prototype with no branch of its own still shows whoever committed to its
  project folder.

The five existing records were backfilled from the Coke branches (all Noah, so far).

**Both ways in work the same** *(checked 2026-10-05)*. The app offers **New prototype** (a throwaway
`fd/<project>/iN` branch) and **Work in the codebase** (the project's one `feature/<project>` branch).
Before this check only the first existed: the app read the codebase branch pattern and never used it,
so codebase work could only be started by hand and recorded by hand. Now both create the branch, write
the record, publish it, and credit contributors identically. Starting codebase work on a branch that
already exists adopts it and keeps its commits. Also fixed: numbering counted every record, so a
codebase entry made the next prototype `i3` instead of `i2`. After the branch exists, everything
downstream does not care which kind it is: the preview command, the agent task, comments (keyed by
branch), the handoff gate and the project list.

**Done when:** a project with commits from two people lists both in the app. **Human:** one look at
the list.

#### 3.3 — Open a preview and comment on an element (was C2)

**Claude. Built 2026-10-05; waits on a human feel check and a security look.** Built and tested
against a local design-mode preview, so it did not wait on CI.

**What exists.** An iteration opens its preview inside the app, with a numbered comment panel beside
it. **C** (or the button) starts pin mode: the cursor becomes a crosshair, one click anywhere places a
pin and is not delivered to the page, and **Escape** cancels. Nothing is highlighted: it is a pin, not
an element picker. The pin shows at once (amber) while the comment is written, then turns blue and
numbered once saved. **Click a pin and its comment is highlighted in the panel**; **drag one and it
moves**, which saves the new position. You can drag only your own pins (GitHub refuses an edit to
someone else's comment, which is the rule wanted), and a small wobble counts as a click. Under the pin the app still records the element it landed on, and where inside
it, because that is what keeps the pin in place when the window is resized or the page reflows. The
comment is posted with its anchor hidden in the comment body, and a plain "On /route · selector" line for anyone reading on
GitHub. On reopening, each comment is placed again: *found* by its selector, *moved* when the
selector no longer matches but its text does (the marker follows the text, and the panel says so), or
*missing* when neither does (it stays as a page-level comment, and says so). Comments for another
page of the preview wait for that page. A preview address is `https`, or `http` on this machine; an
iteration with no recorded address offers a field to paste a local one, until 3.4 records it.

**Verified three ways.** The in-page scripts in jsdom (selectors, text fallback, markup that tries
to break out of the script); the anchor encoding; and `npm run smoke:page`, which drives the real
view in real Electron with a genuine mouse click and checks isolation (the page can see no `window.workspace`,
`require` or `process`), that the click is picked and not delivered, that the marker stays on its element
after a resize, the moved and missing cases, and that the page cannot navigate the view away.


- Show a project's preview in the app's own browser view.
- Comment mode (**C**): click an element, write a comment, post it as an issue comment with its
  anchor — route, selector (preferring `data-e2e-ref`), nearby text, viewport, commit, optional
  crop.
- Markers on reopening; a comment whose element is gone becomes a page-level comment that says so.
- **Isolation:** the preview gets no bridge to the app. The app reads the page to resolve an element;
  the page cannot call the app. This replaces the earlier rule against ever scripting a preview, which
  was written for untrusted remote pages — it needs a security look before the step closes.

**Done when:** on a real prototype, a comment placed on an element is still on that element after a
reload and after resizing the window, and degrades correctly when the element is removed. **Human:**
one reviewer places a comment and says whether it feels right.

**Not in this step, and not wanted:** dragging a region. **Later, if needed:** thumbnails, notifications.

#### 3.3.5 — Prove it locally, start to finish

**Claude. Added 2026-10-05 as the proof of concept.** The whole loop on one machine, with no hosting and
no other people: **generate a prototype, see it in Flock Designer, comment on it, and (with 3.5) have the
agent act on the comments.** If this works, putting the preview on a shared address is a small, separate
conversation with Coke engineering, because it only changes where the address comes from.

When the Author screen was hidden (2026-10-05) the app lost its only way to create work. Its services
are still there; this step gives them a place, inside the Projects tab, without bringing back a second mode.

- **Find the product checkout without being told** *(changed 2026-10-05)*. A repository Flock Designer can work in has a `.flkd/workspace.json`, so the app looks for that marker in the usual places (Documents/GitHub, GitHub, code, dev and so on, one level deep) and uses the most recently used match. Nothing to choose or register; *Change* is there if it picks wrong, and a folder picker only if nothing is found.
- **New prototype** (and **work in the codebase**), from Projects: a project id and a line on what it
  is trying. It creates the branch and the record through the services that already exist (3.2 and
  the codebase route).
- **Run the agent** on that request, with its output shown in the window, so a designer is not
  watching a terminal.
- **Run the preview** with the repository's declared command, and **open the iteration straight onto
  it**: no pasting an address. The preview then behaves as in 3.3.
- **Comments** are placed and kept as in 3.3. On one machine they need only the Issues permission the
  app already has; publishing the record to the design repo is best-effort, as built.

**Done when:** from the app, on this machine, a new prototype is created from a short request, the
agent builds it, its preview opens in the app, and a pinned comment is placed and survives a restart.
**Human:** you do this once, start to finish, and say where it was awkward.

**Not in this step:** a hosted preview, other people's access, the list of GitHub repositories.

**Built 2026-10-05.** **New prototype** (and *In the codebase*) in the Projects tab asks for a name and what
to explore, creates the branch and record, runs the agent, then the preview, and opens it with pins.
Any existing iteration also gets a **Build on this machine** panel: run or stop its preview, or ask the
agent for a change, with the agent's progress shown in the window. The checkout is chosen once and
remembered.

**What checking it end to end turned up, all fixed:**
- **No `claude` on this machine's PATH.** Claude Code here exists only inside the editor, so the app
  looked for it on the PATH, then the usual install places, then the newest copy an editor bundles.
- **The agent could not have run unattended.** It now runs in print mode with streamed output, may edit
  and run the repository's own scripts and local git, but not push, switch branches or delete, and may
  write to the project's folder in the design repository.
- **The declared preview command could never run.** `start:prototype` exits unless given a project id and
  the descriptor gave none. The descriptor now says `<project-id>`, which the app fills in as one argument
  (Coke change).
- **Running a preview broke the handoff gate.** It writes a generated `bootstrap.tsx` that the linter
  failed and that broke the typecheck on any other branch, and stopping the app's preview left the dev
  server holding port 3100. Coke now ignores the file in the linter and the script removes it, and its
  server, when stopped (Coke changes).
- **Generated element ids** such as `:r1:` are no longer used to find an element again.

**Anything built on this machine shows in the project list.** The list is GitHub's projects merged with the
local copy of the design repository, read straight from disk: a project folder with an iteration record
in it is a project, however it got there (the app, or an agent in a terminal), and whether or not it has
been shared. Work only on this machine is marked **Only on this machine**; an iteration made here for a
project that is already shared is marked **local**. If GitHub cannot be reached, local work still shows.
**Work is found from the branches themselves**, not only from records: a branch named the way the repository names work (`fd/<project>/iN`, `feature/<project>`) is an iteration whether or not a record exists, so codebase work started by an agent in a terminal appears with no step of its own, and its record is written when it is first opened. The design repository is found beside the product checkout; if it is not there the app says to clone it rather than creating a folder outside any repository.

The Coke changes are three commits on `noah/flock-designer`, and the four prototype branches were rebased
onto them (backups are `backup/pre-descriptor-…`); the handoff gate passes on the ones I re-ran.

**Verified:** `npm run smoke:local` ran the real Users prototype from its declared command in real Electron,
opened it in the preview view and placed a pin on it that was found again. **Not yet verified:** the agent
building a *new* prototype from a request, which needs a real run and takes a few minutes.

*Marked Complete on 2026-10-05 on Noah's confirmation that these four steps were verified. Evidence is in the change log; items that were never seen by Claude are listed there.*


#### 3.4 — Share for review (was C3)

**Claude for the app; Coke engineering for CI. Built 2026-10-05, waiting for your first real share.** This is the
half that lets a product manager see an iteration at all: without it a reviewer *elsewhere* has nothing to open, so
the PM-to-designer loop cannot run. (Moved back from "deferred" the same day, and built before 3.5 at Noah's direction.)

**What it does.** In the review screen, someone with the product repository sees **Share for review**. A dialog says what
is about to happen (a push, and a *draft* pull request that exists only to make a link and is not meant to be merged), then:

1. **Pushes** the branch to `origin` with the designer's own git. Plain push only: if the remote has work this machine
   lacks it refuses and says so, and never forces. Only committed work goes; uncommitted changes on that branch are
   refused with a message to commit first.
2. **Opens a draft pull request** with the designer's own GitHub CLI, or reuses the open one for that branch (one PR per
   branch, as settled). The body says it is a preview thread and not for merge, and names the project folder. It is never
   opened ready for review.
3. **Waits for the deploy workflow** the repository names, looking only at that workflow's checks and only at checks that
   started after this push (a previous push's passing checks are not evidence). A failure names the check and its log; a
   workflow that never starts, or a build that outlasts 25 minutes, says so.
4. **Records the address** on the iteration (`previewUrl`, filled from the repository's pattern and the PR number) and
   publishes the record, so it reaches reviewers with no manual step. If the designer is signed out the address is still
   saved locally, and the dialog says it was not shared.

It starts and returns at once; the main process holds the share, so closing the dialog or leaving the screen does not lose
it, and the button shows it is still going. **A reviewer** who opens an iteration whose address is not up yet sees "This
preview is still being built", and it opens by itself when the address answers (with "Open it anyway" for a check that
cannot be trusted, such as a VPN). **A designer** with the product repository keeps building locally, which is their
latest work, and falls back to the shared preview only if the local build cannot run.

**How a repository joins** (`share` in `.flkd/workspace.json`; the app hard-codes nothing about Coke's CI):
`url` (https, with `<pr>`), `workflow` (the CI workflow whose success means the preview is up) and `kinds` (which work
gets one). Coke declares prototypes only, because codebase branches are real engineering PRs that must keep the dev
build; hosting those needs a decision from engineering about how to tell the two apart (a branch prefix is race-free,
a label is not, because the build starts before a label is applied).

**Why the GitHub CLI.** The app's GitHub App is installed on the design repository only, deliberately; the pull request
is in the product repository. Widening the app's token to every repository its user reaches would undo why it is narrow.
The designer's own `gh` is already them, and the app never sees its token. Cost: designers need `gh` installed and
signed in once, and the dialog says exactly that when it is not.

**What was checked, and how.**
- **Tests (340 passing, 59 new).** The flow with stubbed tools, including each outcome (failed check, never started,
  timeout, stale checks, nothing new pushed, kind refused, unsafe branch, stopped); the real `git push` against a bare
  remote (new, unchanged, incremental, refused rather than forced); the real way of running `gh` against a stand-in
  that logs its calls (draft flag present, no ready or merge ever called, existing PR reused, "no checks yet", missing
  or signed-out CLI, the branch still pushed). Four deliberate breakages (trusting stale checks, counting other
  workflows, allowing a bad branch name, always opening a new PR) each fail a test.
- **Real Electron, isolated** (temporary profile, a throwaway remote, a stand-in `gh`, sign-in and publish stubbed, so
  nothing could reach GitHub or Coke, and the real settings were confirmed unchanged): the Share dialog over a real
  preview, the preview stepping aside while it is open and returning after, the three steps, the address shown, the
  branch present on the remote, one draft PR created, the address in the record and published, the button changing to
  *Update shared preview*. And the reviewer side: no Share button, the waiting screen, then the preview opening on its
  own about ten seconds after the address answered.
- **Coke, for real:** `npm run build:design` built the real Users prototype into `build/` in about two seconds, and that
  build, served statically, rendered the full prototype (theme, icons, mock data, no console errors). It refuses any
  branch that is not `fd/<project-id>/i<n>`.
- **Read from real Coke PRs (read-only), answering questions the plan had open since 2026-09-29:** a **draft** PR (#1479)
  did deploy, so drafts trigger it; the workflow is named `PR Deployment` and its checks come through the GitHub CLI as
  expected; the address is `https://dev-coke-pr-<number>.flocksafety.com`, confirmed from a real PR's deploy comment.

**A finding that needs a decision.** That address answered an anonymous request with the page (HTTP 200, served from S3,
no login), and PR numbers are sequential. A design preview is mock data only, but the plan's rule is *no public access
by default*, and this is public to anyone who has or guesses the link. It is in *Waiting on other people*. The app is
indifferent to it: if the preview is later put behind sign-in, the reviewer's window shows whatever the page shows.

**What changed in Coke (committed on `noah/flock-designer` as `1ca7d523`, not pushed):** `npm run build:design`;
`start-prototype.mjs --build` (same bootstrap as the local preview, so a comment placed on the shared page is placed on the
page the designer sees); the PR Deployment workflow runs `build:design` for `fd/*` and `build:dev` for everything else,
unchanged; and the `share` block. **Until engineering merges it**, a pull request carries its own copy of the workflow, so a
branch only gets the design build if it contains this commit. **The four existing `fd/*` branches do not yet**; rebase
one onto `noah/flock-designer` (the earlier rebase left `backup/pre-descriptor-*` branches in place), or start a new
prototype from `noah/flock-designer`.

**Done when:** against a throwaway repository with a stub deploy workflow, the click produces a draft PR and a recorded
URL, and the iteration appears in a second account's app with no manual step in between. **Met** for everything except the
second account, which needs someone else signed in (3.6). **Human, which Claude cannot close:** one real share.

**You:** (1) `gh auth login` if you have not. (2) Rebase `fd/users-inactivity-signal/i1` onto `noah/flock-designer` (or
make a new prototype from it) and open it in the app. (3) Click **Share for review**, then **Push and share**. Expect a
draft PR in `flocksafety/flock-coke` and, within about ten minutes, a preview at `dev-coke-pr-<number>.flocksafety.com`.
That opens Coke's other CI on the PR as well (tests, lint, security scans), which is normal for a draft there. (4) Say
whether the preview matches the local one. Close the PR afterwards if you do not want it kept: closing destroys the preview.

**Not in this step:** hosting codebase work (needs the engineering decision above); who may open a preview (Security);
the PM's read and write access to the design repository (see below).

**Also needed for the PM half: read and write access to the design repository.** It is private and its only collaborator
is Noah, so a PM who opens a preview still cannot read or write comments. Either invite the PM as a collaborator or finish
the org move (see *Waiting on other people*). Neither is code.

#### 3.5 — Close the loop (was C4)

**Claude, with two small Coke changes. Reshaped 2026-10-05 so that a comment is unambiguous to the agent
that acts on it.** The first version of this step only exported what the app already stored. Measured
against real work, that is not enough to act on, so the step now also makes each comment say clearly what
it refers to. **Principle: one store, derived views, graceful degradation.** The comment on GitHub stays the
only place a comment lives; everything the agent reads is generated from it and can be regenerated; and
each added detail is optional, so a comment with none of them is still exactly as usable as today.

**Status: built 2026-10-05, in the planned order. Waiting for you to read one change.**

*What was built.*
1. **The commit.** Read from the branch when a comment is placed, so it names the version the comment was made against;
   sharing records the commit it pushed, which is what a reviewer's comment is made against. **Resolve** and **Reopen** on
   each card. A resolved comment keeps its number, loses its pin, and stops counting.
2. **The page state.** The query string is recorded (`?state=error`; empty is the default, which is not the same as a
   state, and comments from before have none). A comment made in a different state is not drawn, and its card says so.
3. **The picture.** About 240 pixels wide, kept under 12 KB (it steps down in width and quality until it fits, and is left
   out if it cannot), cropped at the click **with the app's own pins hidden**, riding in the same GitHub comment.
4. **`comments.md`.** Open comments only, with number, words, page, state, stable name, element, nearby text, commit and
   the picture written beside it. Rewritten whenever the app reads the comments; generated and ignored by git. **A
   reviewer's words are untrusted input to something that can edit files:** each line is quoted so nothing in it can
   open a section or pass as structure, and the file says it is feedback and not instructions.
5. **Refresh and paging.** An open iteration re-reads its comments on window focus and about every minute while it is in
   front, one read at a time, and a read that finds nothing new changes nothing. Reads page past 100 (comments and
   threads); a list too long to read is reported, not trimmed.
6. **Address N comments.** *(Superseded 2026-10-06: one comment at a time, from its own card — see [what using 3.5 for real changed](#what-using-35-for-real-changed-2026-10-06). The order and the refusals below are unchanged.)* In the sidebar, for someone with the product repository. One click reads the comments from
   GitHub now, writes the file from that read, and only then starts the agent, so **the agent cannot act on a stale
   file**. It refuses, with a reason, while the agent is busy, when the checkout is not on this iteration's branch, when
   there are uncommitted changes, when the design repository lacks the skill, and when nothing is open. The task it gives
   the agent is **the shared skill's text**, the file and the branch, and **none of a reviewer's words**.
7. **The skill is shared, in the design repository** (`skills/address-comments.md`, layer 3 of the agent-file layers),
   not in any product. It is the same for every product, so it names no product's tools: where a repository differs
   (which checks to run, which folder the work is in) it says to read what the repository declares in its own
   `.flkd/workspace.json`. The app reads it and puts its text in the agent's task, so **nobody finds, installs or rebases
   anything to get it**, and a second product needs no copy. A product's agent file only lists it, for an agent run from a
   terminal.
8. **In Coke** (five commits on `noah/flock-designer`: `1ca7d523`, `e02c408c`, `ff5e3f71`, `65e9a700`, `c8f0447d`, not
   pushed): the `?state=` standard and a request for `e2eRef` names in the scaffold skill and the prototype README; two
   handoff-gate notes (how many stable names, and whether the switcher keeps its state in the address) that fail nothing;
   and the pointer to the shared skill. (The skill was first put in Coke and moved out in `c8f0447d`.)

9. **Work an agent built in a terminal** (added 2026-10-06, found by walking Noah's intended flow rather than the app's own):
   the agent makes a project folder in the design repository and a branch, and nothing else. A project folder now vouches for its
   `feature/<id>` branch, so the work appears in the list with its brief's title, while a teammate's ticket branch (no folder)
   still does not. And **sharing, addressing and the commit lookup now record the work from its branch when they first need
   the record**, in one place, because the app had only written it when it switched branches itself, which it does not when
   the checkout is already on the branch, as after a terminal session. Coke's agent file now says to name the codebase
   branch `feature/<project-id>` (`248f3058`). Checked end to end in real Electron: a codebase branch checked out, a folder with
   only a brief, no record anywhere; the project appears, the preview opens through the repository's `design-mode` command,
   a real click saves a comment with its picture, the branch's commit and its state, and Address runs.
   *Known friction, not built:* codebase work opens the product's root in the preview, so the designer navigates to the new
   view there; the agent could record an entry route (add when it is a real annoyance).

*What was checked.* **Tests: 459** (340 before 3.5; 449 before this addition). **Tests (earlier count): 449** (340 before this step). **Real Electron:** a real click gives a real 1.7 KB JPEG, and a
control capture proves the pin is in an ordinary capture while the picture has none; the other-state behaviour. **The whole
UI, isolated** (temporary profile, stand-in agent, nothing able to reach GitHub, 3 runs of 3): a comment made after the
iteration opened appears on focus with no reopen, Resolve and Reopen move the count and the pin, the picture and the
other-state note show, and the agent started on the right branch and read a file that already held the new comment.

*The real run, twice.* The real `claude`, the real skill, through the app's real Address path, in a throwaway worktree on a
temporary branch of a real prototype (`alert-notification-prefs`), with a **real click** in its Read-only state, so a real
anchor and a real 5.5 KB picture. The anchor's selector was only `div:nth-of-type(2) > div:nth-of-type(1) > …` (as measured
before: no stable name), and the agent found the element anyway from the text, the state and the picture. Both times, in
about 95 seconds and exit 0: it confirmed the branch and commit, changed **only** the Read-only state (the two-sentence
banner became one line, and the Save and Cancel row is not rendered instead of shown disabled), touched one file in the
prototype's folder, committed with a message naming comment 1, did not resolve, reply or push, and ended with a summary by
comment number that listed three decisions for the designer (which role to name, hiding Cancel as well, and the repeated
"managed by your administrator" text on each row). Rendered afterwards: no Save or Cancel in Read-only, both in Loaded.

*What the real run found, and what was done.*
- **A `Co-Authored-By` trailer on the agent's commit,** against the standing rule. Claude Code adds one by default. The
  launch now passes settings that empty the attribution for commits and pull requests (tested), and the skill says so too.
  The second run had none.
- **My own Coke change broke `npm run lint`.** The gate note I added failed the formatter, which would have failed lint on
  every prototype branch. The agent reported it. Fixed in `ff5e3f71`; lint and `tsc` were clean on the second run.
- **`check:boundary` listed 12 files outside the prototype.** An artifact of the test setup (the baseline's commits were
  cherry-picked, so they had other hashes), not of the change. **It does mean the real flow needs an iteration rebased onto
  the baseline, not copied from it.**
- **The skill was in the wrong layer.** First put in Coke's agent files, it would have needed a rebase on every iteration cut
  before it existed (and a refusal telling the designer to do it) and a copy in every product. It is generic, so it moved
  to the shared design repository and into the agent's task, and the refusal and the rebase went with it: less code, and
  nothing for a designer to remember. **Proved with a real run on a prototype branch that has no copy of the skill and none
  of the baseline's commits:** the agent made the same one-file, right-state change, found the repository's checks through
  its descriptor, committed naming comment 1 with no trailer, and its summary was by number.

*Decision recorded: candidate code locations are not built.* The agent located the element from the text, the state and the
picture on both runs, with no list to help. A list of confident-looking wrong answers can mislead more than none. It comes
back only if a real run shows the agent failing to find a place.

*Owed, and whose.*
- **You read a change, on your own branch.** (1) Nothing to rebase for this: the skill comes from the design repository, which
  you already have. Only the holding branch below needs merging, for the `?state=` switch on that prototype. (2) Open the
  iteration in the app, switch the prototype to a non-default state, **Comment**, click an element, write something and save
  (this is a real post to the design repository). (3) Open the sidebar and press **Address 1 comment**. (4) Read what it
  changed, in the preview and with `git show`, and say whether it addresses the comment. Then Resolve it yourself.
- **Across two people** (a PM's comment on a hosted preview appearing in your app and turning into a change) needs 3.4's real
  share and the PM's access to the design repository. Everything on this side is built.
- **The five Coke commits are not pushed.** They no longer matter for this step (the skill is shared); they matter for sharing (3.4), where `build:design` and the CI change must be in an iteration's history until engineering merges them.
- **The existing prototypes now keep their state in the address (done 2026-10-06), except one branch that is yours to move.**
  Before this, a comment on a prototype that did not could only ever record the default state, even if the page was showing
  Error, which would have misled the agent. Each is one commit touching only that prototype's `index.tsx`, checked with
  `tsc`, lint and the prototype's own tests, and exercised in a real browser build (opening at the state in the address,
  clicking a switch updates it, a junk value falls back to the default):
  `orgs-list-signals` (`09810d99`, on its branch), `role-removal-blast-radius` (`59242940`, on its branch; its three controls
  are `?state=`, `&role=` and `&additions=1`, each left out at its default), and `alert-notification-prefs`
  (**`b54b6109`, on the branch `pending/alert-notification-prefs-state`, not on the branch itself, because that branch is
  checked out in your working copy and I do not touch it**: when it suits, run `git merge --ff-only
  pending/alert-notification-prefs-state` while on it, then delete the holding branch). `users-inactivity-signal` has one
  state, so there is nothing for a comment to record. The branch tips before this are in `/tmp/phases/coke-branch-tips-before-state.txt`.

**Why it was not enough (measured 2026-10-05, against the four prototypes and the product components).**

| What the agent needs to know | What a comment carries today |
|---|---|
| The words | Yes |
| Which element, in a prototype | Weak: three of the four prototypes have **no** stable element names and the fourth has 7, so the stored selector is a path like `div:nth-of-type(2) > div:nth-of-type(6)`, which means nothing in the source. The nearby text is the only real handle |
| Which element, in the product code | Decent: 157 `e2eRef` names across `src/components`, plus greppable text |
| Which state of the prototype | **Not recorded.** The harness's "Prototype state: Loaded / Loading / Empty / Error" switch is not in the URL or the comment, so a comment on Error reads the same as one on Loaded |
| What was being pointed at | **No picture** |
| Which version of the code | **Unreliable.** The saved comment that was inspected had an empty commit; the recorded commit is refreshed only when the app switches branches, so it can be stale |
| Whether it is still open | **No way to resolve one.** The app reads a resolved marker but nothing sets it |

**What each comment carries after this step.** All additions are optional and ride in the same GitHub
comment, in the hidden part that already holds the position:
1. **The page state.** The URL's query string (for a prototype, `?state=error`), recorded as `state`. Existing
   comments have none, and still work. On reopening, a comment made in a different state says so.
2. **A small picture of the spot.** About 240 pixels wide, JPEG, kept under roughly 12 KB, cropped around the
   click **at the moment of the click, before the pin is drawn**, so it shows the thing and not the pin.
   Embedded in the same comment rather than stored as a separate file, so there is still one store and no
   permission to write anywhere else. GitHub allows 65,536 characters in a comment; this is about a quarter of that.
   If it cannot be taken, the comment is saved without one.
3. **The commit the checkout was on.** Read when the preview starts and refreshed each time, so it is the
   version the comment was actually made against; falls back to the iteration's recorded commit.
4. **Resolved.** A **Resolve** toggle on each card in the sidebar. It sets the marker that is already read.
   GitHub decides who may do it (the comment's author, or anyone who can write to the repository), so nothing
   new has to be enforced here.

**The export: `comments.md`, generated, never hand-edited.** One file per project, in its project folder, **not
`review.md`**: every project folder already has a `review.md`, which is the agent's own review record, and
comments must not be mixed into it. The app regenerates it whenever it reads a project's comments, on a
machine where the design repository sits beside the product repository, and again whenever the **Address** button
below is pressed, so it is never stale when the agent reads it. **It and its pictures are not committed:** they are generated, change constantly, and would conflict
between machines, so `projects/*/comments.md` and `projects/*/comment-pictures/` are ignored by the design
repository's `.gitignore` (done 2026-10-05, ahead of the export). It lists the **open** comments only, in number
order, and for each:
- the number, author and words, and the state it was made in;
- the picture, written to a file beside it (`comment-pictures/3.jpg`) for the agent to open;
- **candidate code locations, last and optional.** The branch is searched (`git grep` on the branch, never a
  checkout) for the comment's stable name and nearby text, and up to five matches are listed as `file:line`,
  each saying how it matched ("exact `e2eRef`", "text match") and saying so plainly when nothing matches.
  **This is built only if the real run shows the agent struggling to find things without it.** A short list of
  confident-looking wrong answers can mislead more than no list, and the agent can search the branch itself
  given the text, the picture, the state and any stable name, which are what carry the meaning. Everything
  above this bullet is what makes a comment clear; this is a convenience.

**Comments refresh on their own.** Today the app reads a thread's comments once, when the iteration is opened,
so a PM's comment made afterwards never appears. After this step an open iteration re-reads its comments **when
the window regains focus and on a gentle timer (about every 60 seconds, only while the window is visible)**. A
new comment appears in the sidebar and as a pin, with the count updated. The read is a single request per open
iteration, GitHub's listing lag does not apply because the thread is read by number, and the paging limit is
fixed here: reads are currently capped at 100 comments per thread with no paging, so they page instead.

**One button: "Address N comments".** *(Superseded 2026-10-06: each comment carries its own Address button, for the reason recorded [below](#what-using-35-for-real-changed-2026-10-06). Everything else in this paragraph still holds.)* In the sidebar, shown only when open comments exist. One click, in order:
re-read the comments, regenerate `comments.md` and its pictures, then start the agent on the iteration's branch
with the address-comments skill. Because the file is rebuilt by the same click that starts the agent, **the agent
can never act on a stale file**, whether the comment arrived a minute ago or a day ago. It uses the agent launch
that already exists (print mode, edits allowed, no push) and the same phases and log as a build, and it is
refused while a build or another agent run is going. Running the agent from a terminal instead reads whatever
`comments.md` was last generated, which is why the button is the supported path.

**The agent instruction.** A skill in the **shared design repository** (`skills/address-comments.md`), which the app puts in
the agent's task: "address the open comments on `<project>`". For each open comment, in order: look at the picture, open the candidate
locations, change the iteration's branch, run the handoff gate, and say per comment **number** what changed or
why not. It asks rather than guesses when there are no candidates or several equally likely ones, and on the
prototype path it stays inside the prototype's own folder (the boundary gate already enforces this). **It does
not mark anything resolved:** a person does that after looking at the change.

**Two small Coke changes** (agent standards, not Coke engineering): prototypes reflect the harness state in
`?state=<name>` and read it on load; and meaningful elements get an `e2eRef`. The handoff gate **prints a note**,
not a failure, with how many stable names a prototype has.

**Done when:** on one real project, a comment placed on a **non-default state** of a prototype, on an element,
produces a change on the branch through the instruction, and the agent's summary names that comment's number.
Tests cover the picture crop and its size cap, the export on fixtures (open comments only, the picture written
beside it), Resolve, the refresh (a comment added elsewhere appears, none are lost or duplicated, paging past 100),
and the Address button (regenerates before the agent starts, hidden with no open comments, refused while busy). **Human:** you read the change and say it addresses the comment. **Across two people** (once 3.4 is built): a PM's
comment on a hosted preview appears in your app within a minute, and **Address** turns it into a change.

**Not in this step:** the agent replying inside the thread, hosted previews, comments across several iterations.

**Order:** the commit and Resolve first (small, and they make the rest honest), then the state, then the
picture, then the export (words, state, status and picture), then refresh with the paging fix, then the skill and
the Address button, then one real run. Candidate
locations only if that run needs them.

*Marked Complete on 2026-10-06. 3.4 was verified end to end in real Electron against a throwaway remote and a
stand-in `gh`; Noah's one real share is still owed and needs Coke's draft change pushed. 3.5 was run for real
against Coke the same day: a comment was placed on the role-comparison view, addressed from its own card by a
real Claude Code agent, and the change committed. What the day's use then found, and what it changed, is below.*

#### What using 3.5 for real changed, 2026-10-06

Everything here came from Noah using the app, not from review. Each is in the change log with its reasoning.

**The agent's own account reaches the person.** The first real Address run read the comment, found the text,
saw that it lay outside the iteration's change boundary, declined, and said so clearly — and the app threw that
away and showed "finished" in green, so it looked as though the change had been made and lost. The run's closing
message is now shown, and the app compares the branch before and after so a refusal reads differently from a
rewrite.

**One comment at a time.** The bulk **Address N comments** button is gone. Comments are not alike: a batch makes
the clear ones wait on the unclear ones, and hands the agent a list where one out-of-scope comment colours the
whole run. Each comment has its own Address button, and the comment id is required the whole way down, so there
is no batch path left to reach.

**A comment the agent acted on says so, and resolving stays the person's.** The agent knows it changed something;
only the person who wrote the comment knows whether that was what they meant. An addressed comment is marked with
the commit, its card steps back (no second run, no placement note, the content faded) and leaves Resolve and
Delete. Three tests fail if addressing a comment also resolves it.

**A pin attaches to the element.** While placing one, the element under the pointer is outlined and named, and the
arrows climb to a container. The element's tag and the named areas it sits in are recorded and reach the agent.
Dragging a pin shows the same outline, since dropping it re-attaches it.

**Where pins break, and where they do not.** An element with no stable name was recorded as a path of direct
children, so inserting one wrapper div lost it; it is now described as a descendant of the nearest named
ancestor. The text fallback demanded an exact match on 80 characters cut mid-word, so one character moving lost
the pin outright; it now follows text that merely begins the same way. Measured in Coke: 131 `data-e2e-ref`
across 49 of 344 component files, mostly on leaf elements, so **the remaining lever is Coke's markup, not this
app** — adding stable names to section containers.

**An iteration opens where its work is.** A codebase iteration ran the whole product and opened at its front
door, so Noah commented on a page the work never touched. An iteration's record can now say which route its work
is at. Two layers guard it, because validation alone cannot: a route *pattern* (`/organization/:id/roles`) is
refused when recorded, and the app compares where it sent the preview with where the page settled, since a wrong
route still answers HTTP 200 from a dev server that serves the SPA shell for every path.

**The comment list is honest about itself.** Reads no longer drop a request made while one is in flight (which
is why a comment sometimes appeared only after adding another); a change made here is not undone by a read that
started before it; resolving and moving a pin re-read, as deleting already did; a failed draw says so instead of
leaving stale pins; and errors open the sidebar, since they were rendered only inside it and it starts shut.

**One home each.** `numberComments` (the number on a pin and in the agent's file), `openComments`, `markersFor`
(which comments get a pin, including the draft one) and `latest` (read coalescing) each have a single definition.
628 tests.


# Appendix C — Superseded designs

*Replaced on 2026-10-05 by the direction at the top of this document. Kept for the reasoning, and because several of its contracts — the comment shape, the one-PR-per-branch mechanics — still inform the steps above.*

## Part IV — Decision gates

These are the agreed product directions for a lightweight, repository-first designer-contribution workflow. Named owners validate the necessary platform, security, and operational details before the listed phase begins; they do not silently replace the intent.

The **Gate by** column matters as much as the recommendation. Gates due at step 1 are cheap to resolve and need nothing but team agreement. Gates due at step 14 are where this effort first acquires external dependencies and recurring cost, and they should be opened with their owners well before step 13 finishes.

| Question | Recommendation | Why | Owner | Gate by |
|---|---|---|---|---|
| Which local agent should Workspace support first? | **Confirmed:** integrate Claude Code first because the current Designer branch already has Claude discovery files. Make the adapter contract tool-neutral; add Codex and other local harnesses later rather than duplicating `.flkd` knowledge. | Delivers against the existing implementation while avoiding permanent coupling to one agent. | AI/platform engineering | step 13 |
| Where do the shared agent files, skills, and standards live as more products adopt this? | Three layers, per [knowledge layers](#knowledge-layers): a shared `flock-designer` repository for the agent definitions, skills, universal standards, Flock tier, and Part I contracts; FUI's `.flkd` for component facts; each product's `.flkd` for its own patterns, boundaries, and records. Create the repository in step 4 and move the already-portable standards into it, resolved from a sibling checkout as FUI is today; add a CODEOWNERS co-owner once promotions start changing those standards, and publish it as a package declaring FUI as a peer dependency when a second product adopts it. Not a per-designer tool plugin. | 446 lines of the product repository's standards already carry no product-specific reference, and the universal tier was written to move. Ownership and release cadence differ from FUI's: an accessibility change should not need a component release. A plugin installed per designer would be absent for Workspace, CI, and other engineers' checkouts, and would re-couple content to one tool that `.flkd` was built to stay independent of. | Design operations + design system + product engineering | step 4 for the repository; co-owner and publication at the second adopting product |
| How should the product move from current WCAG 2.0 A enforcement toward WCAG 2.1 and 2.2? | Keep 2.0 A as the enforced floor; make 2.1 AA the next formal target through a coordinated manifest-and-check update. Assess 2.2-friendly patterns only within feature scope until a later formal uplift. Estimate 2.0 A → 2.1 AA as a substantial piece of product work: it changes version and level together and pulls in the entire 2.0 AA set. | Coke currently enforces 2.0 A while the program direction is 2.2 A/AA. A staged path prevents false assurance, competing agent-file targets, and uncontrolled scope expansion. | Compliance + accessibility program + product engineering | step 1 for the position; step 10 for the first report |
| How should the runtime baseline proceed? | Selectively reimplement the verified `noah/local-design-mode` MSW approach on top of the Designer branch; do not merge the divergent branch wholesale. Treat this as the primary fix for designer onboarding. | Preserves current `.flkd` work while bringing forward the useful real-shell runtime foundation, and removes the actual barrier to designers running the product. | Coke engineering | step 8 |
| How does Workspace authenticate to GitHub? | **A "Sign in with GitHub" button, not a Google/SSO login.** Use a GitHub App, installed once on the participating repositories by whoever administers them. After that one-time install, each designer clicks "Sign in with GitHub" inside Workspace, GitHub asks them to approve it, and GitHub hands back a token scoped to that person's own existing repo permissions — the app can only do what they could already do by hand through the GitHub UI. The token lives in the OS keychain, not in a config file or a shared secret. Google Auth cannot substitute for this: it can confirm who someone is, but only GitHub can issue a token that acts on GitHub, since the permission being granted is GitHub's to give. | Workspace needs to create PRs, post comments, and read build status as the acting user, with revocable, auditable, scoped permissions. This is the gate most likely to require security review, and step 14 cannot start without it. **Okta, asked 2026-09-29: Workspace never integrates with Okta.** SAML SSO is an arrangement between GitHub and Okta; the app only ever talks to GitHub, and GitHub redirects to Okta on its own when it needs to. No Okta credentials or configuration exist on this side. **The sign-in must open the designer's real browser, not a window inside the app** — that is what makes an existing Okta-authenticated GitHub session carry over with no password prompt, and an embedded login view is both a worse experience and a likely security-review objection. **Three things are not automatic:** the GitHub App has to be created, an org owner has to install it on each participating repository, and authorizations expire under SAML — so the app needs a real "sign in again" path rather than assuming a token lasts forever. **Ask the org administrator specifically:** whether user tokens expire on a fixed schedule under Flock's SAML enforcement, and what revokes them. | Platform/security engineering | step 14 |
| Which internal preview publisher creates the shareable link and how is it protected? | Use Coke's existing GitHub Actions `PR Deployment` path, which calls the internal `s3-frontend-v2` reusable workflow. **Draft triggering largely answered 2026-09-29 by reading the workflow** — it listens for `opened`/`synchronize`, which drafts fire, and nothing in Coke filters drafts; only the reusable workflow in `flock-github-actions` remains unread. Still to confirm with the owner: that reusable workflow's own draft handling, provisioning for a second repository, and the returned URL, SSO/access policy, expiry and cost. **Separately, the one-PR-per-project model needs a mechanism change** — see [the preview adapter](#runtime-and-preview-adapter). | This is the strongest local evidence of an existing company preview mechanism and keeps the workflow GitHub-native. Draft-PR triggering is a distinct risk from repository provisioning and has to be tested separately. | Platform/security engineering | step 14 |
| How are review captures produced and stored? | Workspace captures locally from the local preview at a declared fixed viewport, on reviewer request. It does not authenticate against and screenshot a remote SSO-protected deployment. Store captures in Git LFS or an approved object store, not plain Git objects. | Local capture avoids Workspace holding a session credential for a protected preview. Indefinitely retained images in plain Git will dominate the repository within a few projects. | Design operations + platform engineering | step 14 |
| What is the shared-comment model? | Use the project's GitHub draft PR as the collaboration thread for V1. Workspace writes structured marker metadata into the related GitHub comment and archives the full comment export, anchors, captures, and decision record in project memory. Defer a separate review service. | Reuses GitHub identity, permissions, history, and the existing draft-PR preview container without adding a collaboration backend. | Design operations + engineering | step 14 |
| Is version/state-level feedback enough, or is visual annotation required for the pilot? | **Reversed 2026-09-29.** Ship general comments only for the pilot — a comment tied to an iteration and a screenshot, no specific spot on it. Defer click- or drag-to-mark-a-spot; it is a small technical step once general comments exist (a click or a drag is stored as a position, or a box, as a percentage of the screenshot's width and height — no image recognition, nothing has to "figure out" what is in the picture), but it does not need to be built to ship the pilot. | Ships something real sooner; the anchor contract below is written so a later marker still slots into the same comment record rather than becoming a second system. | Design leadership + engineering | step 14 |
| How should shared project memory support another designer taking over work? | **Settled:** one folder per project in `flocksafety/flock-designer`, holding both the context that was supplied and every record the agent wrote. Prototype code stays in the product repository on its own branch. | A project has a home before any code is written, picking up someone else's work means reading one folder rather than knowing which branch to check out, and nothing per-project is written into the product repository at all. | Design operations + product engineering + security | Step 6 |
| What source code, data, prompts, and logs are allowed in a prototype or preview? | From step 1, adopt the conservative default the prototype contract already states: mock or synthetic data only. Before step 14, confirm the wider policy with its owners: permit only source the designer is already authorized to access, plus synthetic or approved anonymized fixtures. Block production credentials, customer exports, production service calls, and unapproved prompt/log retention. Require SSO access and expiration for previews. | Keeps the lightweight contribution path compatible with product-data and security boundaries. | Security + data governance + product engineering | step 1 adopts the default; step 14 for owner confirmation |
| What persists after a project closes? | Retain prototype iteration branches indefinitely. Let preview deployments expire, but preserve their URL, commit, status, and rebuild instructions. Retain comments, marker anchors, captures, decisions, and handoff evidence indefinitely in project memory. Revisit branch retention once the product repository has accumulated real prototype history. | Keeps project continuity and review rationale available to a future owner while treating deployment infrastructure as a disposable runtime resource. | Engineering + design operations | step 14 |
| What does code hardening produce? | Produce an engineering-ready candidate, a draft PR from `fd/<project-id>/handoff`, and the [accessibility and hardening report](#the-accessibility-and-hardening-report). Remove prototype-only baggage; preserve fixture contracts and review evidence in project memory. | Gives engineering the cleanest useful starting point while making verified accessibility evidence, remaining risks, and prototype boundaries explicit. | Product engineering + accessibility/design-system owners | step 10 by hand; step 15 in Workspace |
| How do component gaps become Design System changes? | Workspace creates a structured component-gap record and proposes a PR in the FUI repository; Design System and engineering approve it. The consuming product updates only after resolving the released FUI version. | Keeps prototype learning connected to FUI without allowing prototypes to create unreviewed primitives. | Design System + engineering | step 4 for the destination; the learning loop in practice; step 15 in Workspace |
| Is a managed harness needed at all? | **Do not commit to it.** Open it only on a recorded step 11 decision that a runnable product failed to unblock real designers. If opened, use a single shared private prototype repository namespaced by `fd/<project-id>/*` branches, not one repository per project. | It is the most expensive item in the set and exists to solve a problem step 8 addresses far more cheaply. Committing to it in advance inverts the evidence. | Design operations + product engineering + security | Step 11 |
| Where do managed-harness branches push, and how do they reach product source later? | Push to the dedicated private prototype repository, never the source product repository by default. When work needs full product fidelity, create a linked `fd/<project-id>/promotion` branch in the approved product checkout and use a transfer manifest; create a product PR only after direct-repo hardening. | Keeps experiments isolated while giving a clear, traceable path to continue work in the real codebase without pretending the harness can be auto-merged. | Product engineering + security | the managed harness |

### Desktop-specific decisions

- Exact app repository, owning team, release and distribution channel, and support model. Gate by step 13.
- macOS/Windows signing, auto-update, device-management, telemetry, and security-review requirements. Gate by step 16.

---


## Part V — The Workspace application

The FigJam's future process makes the eventual workspace role concrete: facilitate `Spec & Resources`
→ an in-repo prototype branch → named iterations → internal preview → code hardening and handoff. It
also needs to surface component gaps for Design System review. The workspace is not a generic canvas;
it is a lightweight Electron coordination layer over those repository-native steps, and it arrives at
step 13, after the repository-native workflow has been proven without it.

**This is last, and deliberately so.** The Workspace is a real goal, not a maybe — but nothing here
is built until the model underneath it works without it. Steps 1–12 set up the agent files in the
three repositories and prove the workflow with a designer, a checkout, and an agent. Only then does
step 13 start the application, because only then is there a proven workflow for it to orchestrate.

Everything below is the design that waits for that: the material an architecture or security
reviewer needs when the Workspace is picked up at step 13.

### Recommendation

Build **Flock Designer Workspace** as a cross-platform Electron application for macOS and Windows.

It is a local coordination layer over real product repositories. It opens a selected repository, invokes the locally configured agent, starts an approved runtime, records iterations and review decisions, and prepares an honest handoff. It does not become the source of truth for standards, product patterns, prototype source, or design-system facts.

### Why Electron

**Observed facts**

- The Flock frontend environment is React and TypeScript based. Coke and Monaco use Rsbuild and FUI.
- Designers need to work directly against local repositories and run local preview environments.
- The application needs desktop capabilities: selecting a repository, constrained filesystem access, Git status and branch operations, launching local processes, rendering previews, and secure local preferences.
- Electron supports a single JavaScript/HTML/CSS codebase across macOS and Windows. Its main-process, renderer-process, and preload model fits the separation between privileged local operations and the FUI-based workspace UI. [Electron overview](https://www.electronjs.org/docs/latest/), [process model](https://www.electronjs.org/docs/latest/tutorial/process-model)

**Assessment**

Electron is the best first choice. It lets the team use existing frontend strengths and gives mature desktop primitives without introducing a Rust application layer or separate native clients.

Tauri is a reasonable future comparison if installer size and memory become first-order concerns. It is not the recommended first choice because the initial challenge is reliable local repository and process orchestration, not reducing the desktop shell footprint. Separate native apps are out of scope.

**One consequence worth naming:** the Workspace renderer uses FUI, so the application depends on the same design system it coordinates. Pin the Workspace's own FUI version independently of any product baseline it opens, and never surface the app's installed version where a prototype's resolved version belongs. They are unrelated facts that will otherwise be confused in a context receipt.

### Product boundary

**The workspace owns**

- Selecting and opening a local repository.
- Showing the resolved Flock Designer context and readiness state.
- Creating or continuing a prototype branch or worktree through explicit user action.
- Invoking an approved local agent adapter.
- Starting, stopping, and observing approved preview commands.
- Showing iteration history, review threads, decision records, and handoff readiness.
- Showing the product baseline, resolved FUI package, and any optional Design System work connection separately.
- Opening existing Figma, GitHub, Storybook, and browser links in the right place.
- **Keeping its own checkout of `flock-designer` present and current**, so a designer never sets up
  the shared repository by hand: cloning it on first use, pulling before it is read, and committing
  and pushing project-folder writes. Built at [step 14](#step-14--workspace-shared-review), using the
  same git access already required to read the shared repository — not gated on the GitHub App
  decision below, which is for the review/PR path.

**The repository owns**

- `CLAUDE.md` and any tool-specific agent adapter.
- `.flkd` standards, patterns, skills, safe-import rules, and gap log.
- Product and design-system source code.
- Prototype source and local mock data.
- Git history and the branch that contains the work.

**The workspace does not own**

- A competing design system.
- A duplicate product-pattern database.
- A remote copy of source code or an arbitrary repository indexing service.
- A new canonical source-code or standards database outside Git.
- An embedded general-purpose code editor, visual-canvas product, or model provider.
- Automatic merges, production deployment, or permission to bypass engineering review.

### Technical architecture

```text
Electron renderer: React + FUI workspace
  |  typed, narrow bridge
Electron preload: allowlisted APIs only
  |
Electron main process
  |- Repository service: selected roots, file reads/writes within declared boundary
  |- Git service: status, branch/worktree, commit metadata; explicit user approval for mutations
  |- Agent adapter: invokes locally installed Claude Code first; tool-neutral contract
  |- Runtime manager: allowlisted prototype/design-mode commands and process lifecycle
  |- Accessibility runner: repository-declared axe/Cypress checks, results to the review record
  |- Preview broker: local URL health, browser/embedded preview
  |- Review capture: fixed-viewport capture of the LOCAL preview, on reviewer request
  |- Review sync: local cache and repository export of comments/iterations
  |- Credential service: OS keychain for the GitHub App user token

Step 13 needs nothing beyond this. Everything above runs against a local checkout.

Internal services, added at step 14:
  |- GitHub App: authenticated PR creation, comments, build status as the acting user
  |- Internal preview publisher: existing Coke PR-deployment path, draft-PR triggering to confirm
  |- GitHub draft PR: one per shared branch; thread and marker metadata
  |- Shared-checkout manager: clones/pulls/commits/pushes flock-designer automatically -- plain git,
  |  the designer's own access, NOT gated on the GitHub App above. Listed here because it ships in
  |  the same pass as the rest of step 14, not because it depends on any of it.
  |- Capture storage: Git LFS or approved object store for fixed review captures
```

#### Renderer

- React and the FUI component library.
- No Node.js integration.
- No direct filesystem, shell, Git, credential, or agent-process access.
- Displays only typed data returned by the preload bridge.

#### Preload and main process

- Use `contextIsolation: true`, renderer sandboxing, and `nodeIntegration: false`.
- Expose purpose-built operations such as `listPrototypes`, `readContextReceipt`, `createPrototypeBranch`, `startPreview`, and `addReviewComment`. Never expose a generic shell or raw IPC endpoint.
- Treat a live or remote preview as untrusted content: keep it in a sandboxed surface with no Workspace bridge, and render annotation overlays only over Workspace-owned fixed review captures. Do not inject an annotation script into the product preview.
- Produce review captures locally, from the local preview, at a declared fixed viewport, on reviewer request. Workspace does not authenticate against and screenshot a remote SSO-protected deployment; that would require holding a session credential for a protected internal surface.
- Validate every path against the selected checkout and every command against a repo-declared allowlist. [Security](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

#### Repository adapter

Each participating repository declares a small workspace descriptor in its existing Flock Designer context, naming: where `.flkd` lives; the supported prototype root and branch naming; approved runtime commands; how a prototype becomes addressable for preview; FUI package and version resolution; validation commands; and supported agent adapters.

This avoids hard-coding Coke details into the desktop application.

#### Agent adapter

The desktop app launches Claude Code as the confirmed first local-agent integration. It passes a task reference and bounded context; the agent reads the repository's own instructions and writes only inside the declared prototype boundary. The adapter boundary stays tool-neutral so Codex and other local harnesses can be added later.

The desktop app does not bundle model credentials or duplicate the agent's prompts and standards. The adapter remains replaceable so the workflow is not permanently tied to one assistant.

#### Runtime and preview adapter

The app manages known commands rather than executing arbitrary text from the UI: the prototype harness command, `start:design`, and typecheck, lint, import-guard, and smoke-check commands.

"Internal Preview" in the FigJam needs two steps:

1. **Local:** a localhost preview opened inside or beside Workspace, reviewable by the person running it. This is all step 13 requires.
2. **Shared:** Workspace opens a draft PR for the branch being shared -- one PR per branch. Coke's checked-in `PR Deployment` workflow already calls the internal `s3-frontend-v2` reusable GitHub workflow; that is the first integration to validate. It should return a URL, build status, commit SHA, and expiry metadata. Access policy, retention, and cost remain integration decisions rather than Electron capabilities.

**Read 2026-09-29, before the gate conversation, because the answer was in the repository:**

```yaml
# .github/workflows/deploy-pr-s3.yaml
on:
  pull_request:
    types: [opened, synchronize, closed]
```

- **Draft PRs almost certainly do trigger it.** GitHub fires `opened` and `synchronize` for draft pull requests like any other, and **nothing in Coke's workflows filters drafts** — `grep -rn draft .github/workflows/` returns nothing. The one piece that cannot be read from here is the reusable `flocksafety/flock-github-actions/.github/workflows/s3-frontend-v2.yaml@master`, which lives in another repository. **That is now a one-line question for its owner, not an open investigation.**
- **`reopened` and `edited` are absent from the trigger list.** A closed PR that is reopened does not redeploy, and neither does a change to a PR's base branch.
- **This is why the model is one PR per branch.** GitHub does not permit changing a pull request's **head** branch — the API accepts `title`, `body`, `state`, `base` and `maintainer_can_modify`, and nothing else. An earlier version of this plan had one project-wide PR moving from `i1` to `i2`, which cannot be done. Settled 2026-09-29: a branch that is worth sharing gets its own PR, and pushing to it fires `synchronize`, which does rebuild.
- **A prototype PR must not read as "ready to send to engineering."** Raised 2026-09-29: an
  iteration branch that never merges opening a PR looks, at a glance, exactly like a real pull
  request — and a *second*, genuinely-for-engineering PR exists later at handoff (`fd/<project-id>/handoff`).
  Left unmarked, the two are indistinguishable in a repo's PR list. Workspace always opens this PR in
  **draft** state and never marks it ready for review, and the PR body it writes states plainly that
  the PR exists only to produce a preview link and a comment thread, is not headed for `develop`, and
  names the project folder as the actual record. Whether Coke's repo conventions also want a label
  (e.g. `prototype-preview`) is a small settled-at-step-14 detail, not an open question — the
  mechanism above is required regardless of what label convention it sits under.

Preview environments must have no production data, no production credentials, and no public access by default.

### Minimal user journey

1. **Create a project.** The designer records the spec and resources. Workspace creates the project-memory record.
2. **Open the checkout.** Workspace opens an approved local product repository.
3. **Inspect context.** Workspace shows the pinned product baseline, resolved FUI package, relevant product patterns, references, runtime option, and prototype boundary before the agent starts.
4. **Create iteration 1.** With confirmation, Workspace creates the first prototype branch or worktree and asks the local agent to create or revise the artifact.
5. **Run and inspect.** Workspace starts the approved prototype-harness or design-mode command and shows the preview alongside its review record.
6. **Push for review.** Workspace opens a draft PR for that branch, invoking the internal PR-deployment path, and records the returned URL, build status, and commit.
7. **Iterate.** Feedback attaches to that iteration. The next iteration branches from the prior selected iteration and retains its project memory.
8. **Harden or stop.** The work is marked as useful exploration, or passed through code hardening and handoff. A component gap creates a linked Design System work item, never an automatic component change.

### MVP user interface

The app should be quiet and task-oriented, not a new visual design environment.

| Area | Purpose | MVP behavior |
|---|---|---|
| Project rail | Select repo and active prototype | Repository status, branch, runtime state |
| Connections | Make the repository roles legible | Product baseline, resolved FUI package, optional FUI source checkout |
| Brief | Frame the decision | Small structured form with links and local references |
| Context receipt | Make grounding visible | Show FUI version, patterns, references, constraints, and what the chosen credibility level requires |
| Preview | Inspect the running artifact | Embedded or externally opened localhost preview |
| Iterations | Preserve the path taken | Named `i1`, `i2`, `i3` records tied to Git commits and branches |
| Review | Capture feedback and decisions in visual context | General comments tied to an iteration and screenshot for the pilot; a marker pinned to a spot on the screenshot is the deferred upgrade, same record shape |
| Handoff | Package the result for engineering | Generated handoff plan with remaining work |

#### Comment shape

**Reversed 2026-09-29 from "anchored by default" to "anchorable, not required."** A comment contains:
author, timestamp, category, text, and status; immutable iteration and commit; preview URL plus route
and named fixture state; and a link to the resulting GitHub PR comment. The position fields — fixed
review viewport, and a normalized `x`/`y` point or `x`/`y`/`width`/`height` box — are present on the
same record but **optional**. A comment with no position is a general comment on that iteration. One
sets them later without changing what a comment is.

The draft PR is the collaboration thread for V1: it is where the conversation actually happens, so
comments carry their own commit history and notifications for free. Workspace exports the durable
copy — comments, any positions, captures, and the decision summary — to the shared record's `review/`
directory, and appends a summary to the project folder's `review.md`. **The PR is not the canonical
copy; the project folder is.** A closed, deleted, or force-pushed-over PR does not take the record
with it, and someone who never opens GitHub can still read the whole history in one file.

---


#### Step 14 — Workspace: shared review

**Engineering.** The function the design team is actually missing, and the first step needing
anything outside the laptop. Its [decision gates](#part-iv--decision-gates) must close first.

- Settle the comment shape against a real review; the fields are in [Part IV](#comment-shape), and position is optional on it.
- **Have Workspace manage its own `flock-designer` checkout**, not assume a designer cloned it by hand: clone it on first use if absent, pull before reading standards or project memory, commit and push project-folder writes. This needs no new auth model — it is the same git access a designer already has to read the repository, run through the git service step 13 already built. **Installing Workspace should be enough; nothing about the shared repository should require a manual git step.**
- Authenticate to GitHub through the approved model; open a PR for the branch being shared. This gate is for the review/PR path specifically — draft PRs, comments, and build status as the acting user — not for the plain git access above.
- Confirm the Coke `PR Deployment` workflow runs for **draft** PRs specifically, and that its URL, access policy, and expiry are acceptable.
- Add GitHub-backed comments and visual markers on locally produced review captures, validated across two designers.
- Record preview expiry and rebuild instructions rather than treating a temporary deployment as durable evidence.

**Done when:** a distributed team can review a real iteration from an internal link and return to
its exact branch, commit, and context.


#### Step 15 — Workspace: handoff and learning

**Engineering.** Automate the handoff step 10 proved by hand, in the shape the engineer's feedback
produced, and surface the learning loop in the app.

- Create the handoff branch, run hardening checks, and generate the implementation plan and report.
- Enforce the change boundary during hardening: fix in-scope escapes, log unrelated findings as separate follow-ups.
- Strip prototype-only host code, fixtures, and demo controls from the engineering candidate, keeping the evidence and mock-data contract in project memory.
- Name the routing, API, auth, permissions, flags, telemetry, test, and migration work still required.
- Surface the learning loop: component-gap records, agent-gap entries, and proposed patches for their owners to approve.

A handoff is a rewrite plan, not a merge request.

**Done when:** engineering can estimate and implement from a clearer decision without inheriting
accidental prototype architecture.


#### Step 16 — Pilot and release decision

**Engineering and Noah.**

- Pilot with two or three active product initiatives on managed macOS and Windows machines.
- Validate signing, distribution, updates, logs, access controls, data handling, preview cost, and support ownership.
- Measure designer contribution, decision speed, prototype reuse, and handoff quality **against the baselines written in step 1**.

**Done when:** there is enough real usage and operational evidence to approve a broader internal
rollout.


# Change log

Newest first. Every change to any of the three documents gets a row: what changed, why, and which sections were updated. Open items — conflicts found while building that need a person — are recorded here too, prefixed **Open:**, until someone resolves them.

| Date | Change | Sections updated |
|---|---|---|
| 2026-10-06 | **The first React quick prototype ran, and met 3.7's bar on the evidence.** admin-usage q1, based on `noah/flock-designer`: the real `FSUniversalNav` with the reference's twelve links, `FSDataGrid`, `FSDrawer`, `FSDialog` and `FSSymbol`, no raw colours, 13 marks each with an "On move" note; about 6 minutes against about 8, 51 KB of source against 80 KB of HTML, built first time. Two findings went into the files: a state must show the situation at rest (its dialog opened with a dropdown already expanded), and a prototype keeps the product's colour mode (it renders dark on a dark Mac, as Coke does, since `FSApp` follows the system). **Open:** whether Coke means to support dark mode. 3.7 is left for Noah to close. | Phase 3 table (3.7) |
| 2026-10-06 | **Quick prototypes: React only, built from the real design system, with gaps marked rather than refused (3.7, 3.8 added).** Noah wanted designers in the codebase without the cost of the environment: a quick prototype needs the repository and its packages, never the running product. Two real hand-drawn runs on the Admin usage idea showed why HTML was the wrong medium: the first had no app shell at all, because Coke's guidance lived only on `noah/flock-designer` and the skill never pointed at it; the second drew the top bar black from cookie advice written for coded prototypes, took its colours from legacy SCSS and hand-built the data grid. Now the agent writes one React file with real components, which the app bundles against the product's installed packages into one page, and the move into the code reads its `@standin`, `@mock` and `@remove` marks. Hand-drawn mode was removed at Noah's call: without the packages the dialog says what to install. The design system's ~5 MB of fonts are kept once in `projects/_shared/`, so a page costs about 0.5 MB in git. Coke's guidance gained a dated shell reference from a real screenshot and the React mount recipe (`21c9b904`, unpushed). Also fixed while testing: a build race that stranded a finished page, a codebase feature able to start from a branch with no `.flkd/`. | Where we are; Phase 3 table; 3.7; 3.8; Decisions; Not being built; Open questions |
| 2026-10-06 | **Starting new work: one New dialog, from any repository the person can see.** One button opens one dialog with a toggle between Quick prototype and Codebase feature; both start from a repository and branch, searchable, the repositories coming from GitHub so they follow the person's permissions, matched to clones here by their `origin`. The dialog checks Claude Code is installed and signed in before anything is made (only its yes or no is read; the terms were checked and the person's own CLI sign-in is allowed). | Sequence (3.7) |
| 2026-10-06 | **Interface refinements after the move to shadcn.** The components were re-pulled in Nova, the style ui.shadcn.com now shows (`new-york` was legacy, which also meant open and close animations never ran). Dialogs sit 10% from the top with a fixed header and footer, and their backdrop starts below the top bar. Each project card's files open in a sheet. Sync is one word everywhere, its status sits beside the button, and the not-synced banner no longer flickers through each run. The window reopens at its last size. | — |
| 2026-10-05 | **Removed the checkout step.** Noah's point: setting up project context already ties Flock Designer to the codebase, so a designer should never be asked to choose a checkout, and working in the code should simply appear as a project. The app now finds the product repository by its own `.flkd/workspace.json` marker, and reads work from the repository's branches as well as from records, so unrecorded work appears and is recorded when first opened. Kept deliberately simple: no registry, no config file, nothing that can go stale; a *Change* link and a folder picker remain only as fallbacks. | 3.3.5; the app. |
| 2026-10-06 | **The app's interface moved to shadcn/ui, Radix and Tailwind, on the stock Neutral theme.** Noah is going to build this for a second company and asked whether the shell should keep using each company's design system or a neutral one. Neutral, and the reason is not taste: a prototype inside the app already uses its own product's design system, which is where "personal" belongs and which needed no change; the *shell* using Flock's meant a per-company fork of the tool. Ten components are vendored into `src/renderer/ui/` as source we own, with Radix under the dialog, menu, tooltip and avatar, and lucide for icons. About 440 usages across eleven files. **The measurable result:** the renderer bundle fell from 3,185 KB to 682 KB and 11,647 modules to 2,011, and -- the part that mattered for a second company -- a fresh clone no longer needs a GitHub Packages token, so it installs with no Flock credentials at all. Two places needed more than a swap: the account menu still hides the native preview while open, and the comment box became a positioned element rather than a popover, because the pin it belongs to lives inside the native preview and is not part of this document. A cleanup pass then caught three things the conversion had quietly dropped: the window had stopped following the system's light/dark setting (the component library had done that, and the variables were written but nothing applied the class), a finished agent run had lost the colour distinction between changing the code and changing nothing, and the README still described the old library and token. **The tests could not have caught any of this** -- 633 of them cover logic, not markup, and none renders a component -- so the real window was photographed in both light and dark. 633 tests, both typechecks, the boot and the full preview run all pass. |
| 2026-10-06 | **Brought the document up to date: 3.4 and 3.5 marked Complete, their detail moved to Appendix B, and a cleanup pass.** Noah: everything through 3.5 is finished, so the plan should say so and the stale parts should go, keeping all the context for a later structural audit. Done: 3.4 and 3.5 are ✔ Done in the sequence and their 285 lines of build instructions moved into Appendix B intact, so the plan body again covers only what remains (3.6 and Phase 4). **Where we are** was badly stale -- it still said 3.2 awaited a comment and 3.3 was next -- and now reads 21 of 23 steps done, with what is left needing people rather than code and what Noah still owes. A new Appendix B section, *What using 3.5 for real changed*, records the eight things the day's real use produced, each traced to the use that found it rather than to review. Corrected in the decisions table: the durable record is `comments.md` beside the agent's own `review.md`, not `review.md`; the anchor row now says what a comment actually carries. Added: acting on one comment at a time with the person resolving, and where an iteration opens. Added to *what is deliberately not being built*: blocking out-of-scope comments, committing `comments.md` for history, and a React component chain -- each with the reasoning, so they are not re-litigated. The `data-e2e-ref` question is answered with the measurement (131 across 49 of 344 files) and reframed as the open question it really is: whether to ask Coke for stable names on containers. Two descriptions of the removed bulk Address button are marked superseded in place rather than rewritten, since Appendix B records what was built at the time. Zero broken links. |
| 2026-10-06 | **An addressed comment's card steps back, leaving only the decision.** Noah, on seeing it: once a comment is addressed it should not still offer to address it, it should not warn that the element is no longer on the page -- the agent having just changed the very element the comment pointed at, that is the expected outcome and not news -- and the explanation should be one line with the commit, nothing more. All three done: no second run, no placement note, and "The agent addressed this in `7f90de2`". The comment, its picture and its details fade; the commit and the two decisions still to make (Resolve, Delete) stay at full strength, since they are why the card is still there. Fading is applied to the content rather than the card, because fading the card would dim the very buttons that are the point of it. Every part of this hangs off one value, so they cannot disagree about whether a comment has been addressed. 628 tests. Not pushed. |
| 2026-10-06 | **A comment the agent acted on says so, and resolving stays the person's.** Noah asked whether marking a comment done should happen automatically after a run. No: the agent knows it changed something, but only the person who wrote the comment knows whether that was what they meant, and the asymmetry decides it -- an unresolved comment that is done costs one click, while a resolved comment that is wrong costs the signal entirely, because nobody looks at it again. What was actually missing was not the resolving but the *remembering*: after a run nothing said which comments were waiting on a verdict. So a comment the agent acted on is marked with the commit it made, its card shows **Addressed** with that commit and a line saying to look and then resolve, and Resolve sits beside it. The mark lives in the comment body on GitHub like the resolved marker, so it survives the app closing and whoever wrote the comment can see it was acted on. It is never written as resolution -- three tests fail if addressing also resolves -- a later run that changes nothing clears it, only something that is a commit is ever written, and it never shows in the comment as a person reads it. Noah's own "Remove this text" comment, addressed by 7f90de2c before this existed, was marked by hand with his say-so. 628 tests. Not pushed. |
| 2026-10-06 | **A cleanup pass over the whole comment path, starting with the hesitation Noah saw.** His report: sometimes a comment only appears after adding another one. Reproduced, and it was a real bug -- the guard against two reads at once *discarded* a request that arrived while one was in flight instead of deferring it, the same mistake the publisher's throttle once had. Opening an iteration reads on arrival, so a read asked for during that one went nowhere and the list stayed as the first left it until something else happened to ask. Now in `latest`, a small shared piece with its own tests; writing those first caught a flaw in my first version, which released the waiter when the next run *started* rather than finished. Opening the preview also re-reads now, since that is the first moment pins can be drawn and the read on arrival raced it. An audit of the rest of the path then found that `forgetPosted`, added the same hour and right in itself, had **made a race worse**: GitHub answers a read as things stood when it began, so resolving a comment while a background read was in flight let the stale answer land afterwards and reopen it. Every change made here now bumps a counter and a read whose generation has moved on is dropped. Also: resolving a comment and moving a pin now re-read (both change what the agent's file should say; only deleting did); drawing the pins no longer swallows a failure, which left stale pins beside a list that no longer matched, and overlapping draws are guarded like every other async path in that file; a resolved comment no longer shows a note about a pin it does not have; errors open the sidebar, since they were rendered only inside it and it starts shut, so a failed pin drag said nothing at all; and "which comments are open" became one function, having been written out in five places while deciding the count on screen, whether a pin exists, what the agent's file lists, and whether the agent may run. 622 tests. Not pushed. |
| 2026-10-06 | **Dragging a pin shows what it will re-attach to.** Noah: when moving an existing marker he wants the element outlines, but only while dragging. Dropping a pin already re-attaches it to whatever is under it -- that was simply invisible. The outline and its label moved into the shared page helpers, so placing a pin and dragging one draw it from one piece of code and cannot drift apart; the drag creates it on the first real move and removes it on drop, so it exists only while there is something to point at. It carries the app's own layer attribute, so element detection skips it and the picture taken at the drop never includes it. Nothing is outlined for a wobble that is really a click, or for someone else's pin, which cannot be moved. Verified in real Electron (outline appears mid-drag, names the element under the pointer, gone after the drop) as well as in the unit tests. 610 tests. Not pushed. |
| 2026-10-06 | **A comment no longer loses its pin when the page changed a little.** Noah had one comment and no marker, with the app saying the element was no longer on the page -- about text plainly still there. The stored anchor explains it: the selector is a positional path with no stable name (`#root > div:nth-of-type(1) > div:nth-of-type(3)`), made before the scoped selector landed, and the div count under `#root` is not what it was, since design mode injects a banner of its own. So the selector missed and the text fallback had to carry it -- and that fallback demanded the element's text still *begin with the stored text exactly*. The stored text is cut at 80 characters, usually mid-word, so one character moving anywhere inside that window lost the pin outright. It now takes the smallest element whose text begins like the stored one, and allows either side to be longer, since an element can be shortened as well as extended. A pin that lands roughly right is worth far more than one that vanishes. Mutation-checked (the old exact rule fails both new tests) and the real-Electron move/missing behaviour is unchanged. Note the older comment keeps its weak selector: the durability work helps comments made after it, not before. 608 tests. Not pushed. |
| 2026-10-06 | **A pin can no longer be left on the page with no comment behind it.** Noah found an amber pin -- the colour for one being placed -- with only one comment in the sidebar. It could be neither finished nor dismissed, so it sat there looking like a comment that was not one. Two causes, both fixed at the root rather than patched. The pin was drawn whenever an anchor was pending, while the box opened only in composing mode, so anything leaving that mode without clearing the anchor stranded it; both now come from one value in `markersFor`, shared and tested. And reading the branch commit sits between placing the pin and opening the box, so Escape or leaving comment mode could land inside that await and set the anchor afterwards; a pick that was backed out of is now dropped. Mutation-checked: restoring the old condition fails the new test. Also from the same screenshot: the comment card's actions move to their own wrapping row, since a third button beside the author's name did not fit a narrow panel and ran together into "AddressResolve Delete". 606 tests. Not pushed. |
| 2026-10-06 | **The bulk Address button is gone: one comment at a time, deliberately.** Noah, having added the per-comment button: there is no reason to keep the bulk one. Agreed, and for the reason he gave earlier -- comments are not alike, so a batch makes the clear ones wait on the unclear ones, and hands the agent a list where one out-of-scope comment colours the whole run. The comment id is now **required** the whole way down (window, preload, IPC boundary, `prepareAddress`, `addressTask`), so there is no batch path left to reach by accident; the IPC handler treats a missing id as a mistake, not as a request for everything. The shared skill was rewritten for one comment, including its closing section: when the agent changes nothing, its summary is all the designer has, so it carries the whole reason. 601 tests. Not pushed. |
| 2026-10-06 | **A recorded route that does not load now says so, rather than showing the wrong page.** Noah asked what about the landing route would be fragile across repos and people. Four ways it can break, none of which the app can predict: the view moves, a permission guard redirects (the role-comparison route is behind an accounts-view check, so a change to the mock user would redirect it), a parameter is left unfilled, or a dev server does not serve deep paths. All four land somewhere other than the work, silently. Two layers now. **Refused when recorded:** a route *pattern* (`/organization/:id/roles`, `{id}`, `*`) is what a router matches, not an address, and as a URL matches nothing -- the likeliest mistake when an agent copies from a route table; a colon inside a real path still passes. **Checked when it opens:** the app compares where it sent the preview with where the page settled and says plainly when they differ, knowing nothing about any product's routing, so it holds for any repo. First landing only; navigating away afterwards is not a failure. The second layer is the one that counts, and the reason is measured: against the real preview a wrong route (`/roles/comparison`) still answers HTTP 200, because the dev server serves the SPA shell for every path, so no validation could catch it -- only watching where the app settles. Mutation-checked: a warning that never fires fails a test. 601 tests. Not pushed. |
| 2026-10-06 | **An iteration opens where its work is, not at the product's front door.** Noah: the role-comparison iteration opened on the Organizations list, so he could not see what had been built and commented on a page the work never touched. Cause: a codebase iteration runs the whole product, and the preview always opened `http://localhost:<port>/`; nothing recorded where the work was. An iteration's record may now carry a `route` (`/roles/compare`), and the preview opens there; a prototype, or any record without one, opens exactly where it did. The value comes from a file an agent wrote and is joined onto the address the preview loads, so it is checked twice and never corrected: `asRoute` refuses a scheme, a host, a protocol-relative address, a backslash, control characters and a climbing path when the record is read, and `previewAddress` then resolves it against the preview's own origin and keeps the plain address if it moved. Both have their own tests; the chain was verified from record to address. A new shared skill, `skills/record-the-route.md`, is the instruction for writing it (plainest form of the route, the first page of a flow, leave it out rather than guess), and Coke's agent file points at it from the paragraph that already explains how codebase work is found -- so it is generic, in one place, and reaches the agent without anyone remembering. 597 tests. Not pushed. |
| 2026-10-06 | **Each comment can be addressed on its own, from the comment itself.** Noah's point, after seeing a comment the agent rightly declined: comments are not all alike -- some are a clear change, some are something for the designer to think about -- so addressing the whole list makes the clear ones wait on the unclear ones. Every open comment now carries its own **Address** button, and the task names that comment by the number on its pin ("Address comment 3, and only that one"). `comments.md` still holds them all, because it is the project's file and its pictures are kept in step with it; the others are context, and the shared skill says that leaving them is correct and not an omission. A comment resolved or deleted a moment ago is caught by the same fresh read that writes the file. The batch button stays for when the whole list is clear. Mutation-checked: making the task ignore which comment was chosen fails a test. 589 tests. Not pushed. |
| 2026-10-06 | **The app now says what the agent said, and whether it changed anything.** Noah commented "remove this text", pressed Address, was told the agent had finished, and found nothing changed -- and reasonably suspected the agent was not real. It was: the transcript shows a real Claude Code run that read the comment, found the text in `orgsList.tsx:101`, saw that `brief.md` scopes this iteration to `src/components/role/roleComparison/` and puts other pages out of scope, and declined to act, saying so clearly. **The app threw that explanation away.** Two causes. The stream formatter dropped the run's closing `result` on success and printed `Finished.`; that field is where the agent explains itself, above all when it changes nothing, so it is now shown (once -- the closing event repeats the last message, verified against the real binary). And the window could not tell a refusal from a rewrite, since both exit zero: it now reads the branch head before and after, says plainly when the branch did not move, drops the green for a neutral tone, and keeps more of the log, because then what the agent said *is* the answer. It never claims the branch stood still when it could not be read. Separately, `comments.md` keeps resolved comments as history under their own heading, after the open ones and marked as not work to do, so the file is the whole conversation; the shared skill says to act on the open ones only. Noah's wider question -- whether comments should be committed markdown with git history -- was answered no for now: GitHub already holds authorship, edits and resolution, and a committed generated file adds conflicts and staleness for a history the file itself can carry. 586 tests. Not pushed. |
| 2026-10-06 | **Made the commenting mechanism less fragile where it actually was, and took three dead things out.** Noah asked whether commenting is reliable and scalable as work passes between people. Checking rather than assuming found one real defect: an element with no stable name of its own was recorded as a path of direct children, so inserting a single wrapper div -- what restyling does -- made the pin vanish and the comment lose its place. That is the ordinary case for "remove this subtext". It is now recorded as a descendant of the nearest element that does have a stable name, scoped to that card so it cannot drift onto an identical-looking element next door. Also: the page-state limit was written twice, once when a comment is made and once when it is placed again, where any drift would silently resolve every comment to otherState; it is one helper now. And a comment's number was counted once in the window for the pin and once in the file the agent reads -- they agreed in every reachable case, but nothing held them together, and "fix comment 3" depends on it; both ends now call one function. Removed as unread: `readLocalProjects`, `CheckoutMemory.exists`. Kept on purpose, against the audit's advice: `viewport` (required in every comment already stored on GitHub) and `authorAvatarUrl` (recomputed on every read, costs nothing) -- removing either is churn against stored data for no gain. Measured in Coke for the ceiling on all this: 131 stable names across 49 of 344 component files, mostly on leaf elements, so a pin on unnamed subtext is only as durable as the nearest named ancestor; adding `data-e2e-ref` to section containers is the remaining lever, and it belongs to Coke, not this app. 580 tests. Not pushed. |
| 2026-10-06 | **A pin now attaches to the element it is dropped on, and the picture is a supplement.** Noah's point: a comment like "remove this subtext" is more reliable when the pin names the element itself than when it rests on a cropped screenshot, so lean on element detection and keep the picture. While picking, the element under the pointer is outlined and labelled with its tag and text; the up and down arrows climb to a container and back, for a broad comment; what is recorded is the *outlined* element, with its tag and up to three named containers it sits in ("inside", named by aria-label, its own heading or its stable name), alongside the stable name and nearby text that were already there. The picture is now framed on that element's own box instead of a fixed square around the click. `comments.md` carries "Kind of element" and "Inside", and the shared address-comments skill explains both and says to trust the stable name and text over the picture when they disagree. Checked in real Electron (the outline's rectangle matches the element, the up arrow records the section and reports its box, the picture is framed on the button) and mutation-checked (recording the pointer's target instead of the outlined element fails a test). Not built, on purpose: a React component chain (not verified against Coke's React version). 578 tests. Not pushed. |
| 2026-10-06 | **A preview that was slow to start no longer fails with `ERR_FAILED (-2)`.** Noah placed a pin and saw the error banner. Loading now retries up to six times, and treats a page as loaded only when a real document finished (Chromium's own error page also reports "finished", which had made a dead server look open). A late server opens in about 2.6 seconds; a dead one fails after about 15 seconds with a plain message. The exact trigger of Noah's error was not reproduced, so the real-Electron check is a guard, not a proof. |
| 2026-10-06 | **The app now publishes the person's work by itself, so nothing depends on anyone remembering.** Noah asked how to stop work being left unpublished: a codebase branch committed but not pushed, and pending changes in the design repo. The finding was a split-brain: records were written into the clone *and* committed through GitHub's API, so the clone could never catch up (git refuses to fast-forward over a file that already matches, shown in scratch repos), and the design repo named branches (`role-comparison`) that existed only on one machine. **Built:** (1) *Branches first*: the person's own `fd/*` and `feature/<project>` branches are pushed (plain, never forced; a `feature/` branch only if its project has a folder, because that is also how a team names tickets; a branch that moved on GitHub is reported and never overwritten). (2) *Then the records, with one writer*: `projects/` is committed here, fitted onto GitHub's, and pushed; a conflict in a project's `iterations.json` is merged by meaning, any other conflict is abandoned with everything kept; a record that does not parse is never published; work built in a terminal (a branch and a folder, no record) is recorded as part of publishing, since reviewers find an iteration through its record. (3) *It will not push if anything outside `projects/` is waiting*, because a push carries every commit, and it says what is held back and why. It runs on open, window focus, Refresh, after any record is written, and every five minutes; a trigger too soon after a run becomes one delayed run, never a dropped one. Status is in the top bar on every screen; a problem names what and why and clears itself. The API publish path is gone. **A consent step was built and then removed at Noah's challenge:** it was a reflex from the rule that *I* do not push in his repos without his say-so, which is not a rule for the product; the scoping is what protects people. Tested against real repositories including a teammate's concurrent pushes, each safety rule shown to fail a test when disabled, and end to end in the real app with real git on both sides. **Known sharp edge:** for the person who maintains this repository, unpushed commits to the app or the plan hold the records back until they are pushed; a records-only push (plumbing that builds a commit on GitHub's tip) would remove that and is not built until it proves annoying. First run on Noah's machine will push 7 Coke branches. 551 tests. Not pushed. |
| 2026-10-06 | **A comment can be deleted.** *Delete* sits beside *Resolve* on each card and asks first, on the card, since it cannot be undone and a dialog would have to take the preview's place. GitHub decides who may (the author, or anyone who can write to the design repository); its refusal is put in words a person can act on, and a comment already gone counts as deleted. Two things were found on the way: the GitHub wrapper parsed the body of every success, so a delete's `204 No Content` would have been reported as a failure; and a comment just posted from this window is kept until a read includes it, so a delete has to forget it there too (removing that line makes the comment never leave the list, which the real-Electron check catches). Deleting renumbers later comments, since numbers follow the pins; resolving does not. 496 tests. Not pushed. |
| 2026-10-06 | **A preview no longer opens a browser tab by itself, and there is a button to open it on demand.** Clicking a codebase iteration started Coke's dev server, whose own config opens a tab unless `CI` is set, so a stray tab appeared beside the app. Commands that serve a preview now start with `CI=true` and `BROWSER=none` (rsbuild ignores `BROWSER`, which is why `CI` is needed; the two together cover rsbuild, Vite, webpack-dev-server and CRA); ordinary commands are untouched. The toolbar has an *Open this page in your browser* button, which opens the page the preview is on right now, query included, and is disabled until a preview exists. **Checked against Coke's real dev server** with the browser openers replaced by loggers: started the old way it asks Chrome to open the page; started the new way it makes no call and still answers. 483 tests. Not pushed. |
| 2026-10-06 | **The project list is now newest first, by when each project was started.** It was alphabetical. A project's date is its earliest iteration's (so adding iterations to an old project does not move it up); an iteration's date is its record's, or, for work found only as a branch, its first commit beyond the trunk, and adopting unrecorded work now dates the record from the work and not from the moment the app noticed it. No date sorts last, ties fall back to the title so the order never shuffles, and dates compare as moments across time zones. Each project shows its start date. 473 tests; reversing the sort fails five of them. With the current data the order is role-comparison, role-removal-blast-radius, unused-roles-signal, users-inactivity-signal, orgs-list-signals, alert-notification-prefs. Not pushed. |
| 2026-10-06 | **Walked Noah's intended flow (prompt the Coke agent to build a codebase view, see it in Flock Designer, comment, go back to the agent to iterate) and fixed what broke it.** Three gaps, all invisible when the app creates the work itself and all hit when an agent does: (1) a terminal-built `feature/<id>` branch never appeared, because only a project with a recorded iteration vouched for it and the agent writes a folder and a brief but no record; a project folder now vouches (teammates' ticket branches still do not); (2) Address, Share and the commit lookup failed for work with no record, because the app only wrote one when it switched branches, which it does not when the checkout is already on the branch; they now record it from the branch, in one place; (3) the agent was never told what to name a codebase branch; it now is (`feature/<project-id>`, from the repository's own descriptor). The shared skill also now works from a terminal. **459 tests**; a mutation of the vouching rule is caught; the whole flow checked in real Electron from a branch with no record. **Not verified:** a real agent building a real view (that is Noah's test), and the app's real post to GitHub with the new picture and state fields (the pipeline is verified with the post stubbed; Noah's earlier real comment shows the post itself works). |
| 2026-10-06 | **Moved the address-comments skill out of Coke into the shared design repository, and put it in the agent's task.** Noah's principle: this must scale to whoever builds on the framework, nothing should rest on a designer, product person or engineer remembering something, and it must not be overcomplicated. Checking my own work against it found a flaw. The skill is the same in every product, yet I had put it in Coke's agent files, contrary to the settled layering (shared things live in the design repository). That meant a rebase for every iteration cut before it existed, a refusal telling the designer to do it, and a copy in every future product. It now lives in `skills/` in the design repository, the app reads it and puts its text in the task, and anything product-specific (the checks to run, the work's folder) it says to read from the repository's own descriptor. **Removed:** the check for the skill in the product checkout and the context-folder logic. **Added:** one reader and one refusal for an out-of-date design repository. **Proved** with a real agent run on a prototype branch with no copy of the skill and none of the baseline's commits: same one-file, right-state change, no trailer, summary by number; `tsc`, lint and the prototype's tests clean on an independent re-run. 449 tests. **Not built, deliberately:** a way to name the design repository's location for a monorepo (today it is found beside the product checkout; add one optional descriptor field when a monorepo actually adopts this), and moving the `?state=` standard to the shared layer (the idea is shared, the code snippet is Coke's React harness; move it when a second product has a harness). |
| 2026-10-06 | **Gave the existing prototypes a `?state=` switch, closing the one gap on my side in 3.5.** On a prototype that kept its state in memory, every comment recorded the default state even if the page was showing Error, which would have misled the agent. Three of the four prototypes had more than one state: `orgs-list-signals` and `role-removal-blast-radius` (three controls, so `?state=`, `&role=` and `&additions=1`) are done on their branches; `alert-notification-prefs` is done on the holding branch `pending/alert-notification-prefs-state`, because its branch is checked out in your working copy; `users-inactivity-signal` has one state and needs nothing. Each was checked with `tsc`, lint and its own tests, and in a real browser build. The handoff gate's note now reads the prototype's entry file directly (one harness is not labelled "Prototype state") and is quiet for a one-state prototype; tried on three real prototypes, it gave the right note for each. A fourth Coke commit, `65e9a700`, not pushed. **Open, yours:** fast-forward the holding branch onto your branch when convenient, and the step's one check, your read of a change. |
| 2026-10-05 | **Built 3.5, Close the loop, and ran it for real.** In the planned order: the commit and Resolve; the page state; a picture of the spot (with the app's own pins hidden); `comments.md` for the agent, with a reviewer's words quoted and labelled as feedback because they are untrusted input to something that can edit files; refresh on focus and every minute, and paging past 100; and **Address N comments**, which reads the comments now, writes the file and only then starts the agent, so it cannot act on a stale file. In Coke, an `address-comments` skill, the `?state=` standard and two handoff-gate notes. **449 tests** (340 before); real Electron for the picture (a control proves the pin is absent from it) and, isolated, the whole UI three times of three; and **the real agent, twice, on a real click in a real prototype's Read-only state**: it found the element from text, state and picture although the selector was only a path, changed only that state (one-line banner, no Save row), touched one file, named comment 1, and did not resolve, reply or push. **The real run found:** a `Co-Authored-By` trailer on the agent's commit, now turned off at launch and in the skill; a lint failure in my own Coke gate note, fixed; and that an iteration cut before the skill existed lacks it, so Address now refuses there and says to rebase. **Decided on that evidence:** candidate code locations are not built. **Owed:** your read of one change on your own branch (steps in 3.5), the three Coke commits pushed, the four existing prototypes given `?state=`, and for the two-person loop 3.4's real share and PM access. |
| 2026-10-05 | **Built 3.4, Share for review, ahead of 3.5.** Noah asked for it first and for 3.2 to 3.3.5 to be marked Complete (done; see the row above). One click pushes the branch with the designer's own git, opens a *draft* pull request with their own GitHub CLI (the app's GitHub App is limited to the design repository on purpose, so it is not used for Coke), waits for the deploy workflow the repository names, and records the address so reviewers see it; a reviewer who opens it while it builds is told so and it opens by itself. A repository opts in with a `share` block in its descriptor, so nothing about Coke is compiled in. **Checked:** 340 tests (59 new, four deliberate breakages each caught); real Electron in an isolated profile with a throwaway remote and a stand-in `gh` (nothing could reach GitHub or Coke; real settings confirmed unchanged), both the designer's and the reviewer's side; and in Coke, `build:design` built the real Users prototype and the static build rendered it. **Read from real Coke PRs, read-only, answering open questions:** draft PRs do deploy (#1479); the workflow is `PR Deployment`; the address is `dev-coke-pr-<number>.flocksafety.com`. **Found:** that address answers an anonymous request with the page, so a shared preview is public to anyone with the link, against the plan's rule of no public access by default; added to *Waiting on other people* for a decision. **Found and fixed:** the preview slot's background was hard-coded light grey, so the loading, failure and new waiting screens were unreadable in dark mode. **Not done:** one real share (yours), the second account, codebase hosting (needs an engineering decision), and the Coke change is committed (`1ca7d523`) but not pushed or merged. |
| 2026-10-05 | **3.2, 3.2.5, 3.3 and 3.3.5 marked Complete, and moved to Appendix B intact.** Noah said he believed everything before 3.4 had been verified, and asked for them to be marked. Recorded on his word, with the evidence that exists: tests (281 passing at the last full run), `smoke`, `smoke:page` (a real click, pins, isolation, keyboard hand-over) and `smoke:local` (the real Users prototype run from its declared command, pinned and found again), plus the real-app walkthrough of pin, comment box, save and sidebar. **Claude never saw, and the record should not imply:** a second person signing in; a real comment posted to GitHub by the final build (the test runs stubbed the post, so Noah's own use is the evidence); real macOS keyboard routing into the comment box; the agent building a *new* prototype from a request in a fresh run. The security look at pins, page scripts and the trust gate is still owed and stays in *Waiting on other people*. |
| 2026-10-05 | **Refresh and an Address button added to 3.5; 3.4 is required again.** Noah's goal: a product manager sees an iteration and comments, and the designer pulls those comments and changes the prototype locally with the agent. Checking that against the plan found three gaps. (1) The app reads a thread's comments once, when the iteration opens, so a PM's later comment never appears; 3.5 now refreshes on window focus and about every 60 seconds while visible, and pages past the 100-comment read cap. (2) `comments.md` was regenerated only when the app read comments, so an agent started from a terminal could act on a stale file; 3.5 now has one sidebar button, **Address N comments**, that re-reads, regenerates and starts the agent in one click. (3) The PM could not see the prototype at all: hosted preview (3.4) had been deferred, and the design repository is private with one collaborator. **3.4 is moved from deferred to required** (still built after the local proof), with PM access to the repository named as a prerequisite. Plan only; nothing built. |
| 2026-10-05 | **Local work now shows in the project list.** Noah expected anything built locally, a prototype or codebase work, to appear in Flock Designer. It did not: the list read only GitHub, so work appeared only after its record was pushed (and its title was just its id until the brief was too). The list now merges GitHub's projects with the local design repository's, marked *Only on this machine* or *local*, and still shows local work if GitHub is unreachable. | 3.3.5; the app. |
| 2026-10-05 | **Built 3.3.5, the local proof.** From Projects, *New prototype* creates the branch and record, runs the agent, runs the preview and opens it with pins; existing iterations get a *Build on this machine* panel. Checking it against the real Coke checkout found five faults that would each have stopped the walkthrough: Claude Code was not on the PATH on this machine, the agent had no way to run unattended, the declared preview command exited without a project id, a running preview left a generated file that failed the linter and the typecheck on other branches, and a stopped preview left its server holding the port. All fixed (three Coke commits; the four prototype branches rebased, with backups). The one thing not run is the agent building a new prototype from scratch. | 3.3.5; the app; Coke's descriptor, biome config and start script. |
| 2026-10-05 | **Re-scoped Phase 3 around a local proof of concept.** Noah wants to prove the loop on one machine first: generate a prototype locally, see it in the app, comment, and close the loop at 3.5, and treat a hosted preview as a later, easy conversation with engineering. Added **3.3.5** (the local walkthrough, including a place in the Projects tab to create work, since hiding the Author screen removed it) and **deferred 3.4**. Considered GitHub Pages for hosted links and set it aside: Pages on a private repo is public unless the org has Enterprise Cloud access control, serves one site per repo, and Coke's existing S3 PR deployment already does per-PR previews, so the later change is a mock-data build through that workflow. | Phase 3 table; 3.3.5 new; 3.4. |
| 2026-10-05 | **3.5 refined after a review of its own plan.** Candidate code locations are now the last, optional piece, built only if the real run shows the agent needs them: they are the least certain part, and a short list of confident wrong answers can mislead more than none, while the picture, state and stable names carry the meaning. And the generated `comments.md` and `comment-pictures/` are not committed (ignored by the design repository), because they are derived, change constantly and would conflict between machines. One further risk is recorded rather than solved: state in the URL depends on each prototype's harness following the standard, and the gate only prints a note. | 3.5; the design repository's `.gitignore`. |
| 2026-10-05 | **Reshaped 3.5 so a comment is clear to the agent that acts on it.** Noah asked whether the agent would know what a comment refers to, and wanted it clear in a reliable, uncomplicated way. Measured first: prototypes have almost no stable element names (0, 0, 0 and 7 across four), the prototype state is not recorded, there is no picture, the recorded commit is empty or stale, and nothing can mark a comment resolved. 3.5 now adds the state, a small embedded picture and the real commit to each comment, a Resolve toggle, a generated `comments.md` that lists open comments with candidate code locations found by searching the branch, and an agent skill. Kept simple on purpose: one store (the GitHub comment), everything else derived and regenerable, every addition optional. The export is `comments.md`, not `review.md`, because every project already has a `review.md` holding the agent's own review. | 3.5 and its table row. |
| 2026-10-05 | **Commenting is a mode, and the sidebar is back.** Noah asked for a split button at the top right: the left half turns on **comment mode**, the right half toggles a **sidebar** listing every comment. In comment mode a click anywhere on the page drops a pin and opens a small box beside it to write in and **Save**; the mode stays on, so you can comment your way down the page. The sidebar is the docked, resizable one from before (250px minimum, 1px divider, width remembered), restored from history rather than rewritten, and closed by default. The count shows beside the sidebar icon. Cmd or Ctrl and Enter saves; the first Escape cancels the box and keeps the mode on, the second leaves it. The click's position now comes back with the pick so the box can sit beside the pin. The box is drawn over a snapshot of the page, as the earlier popovers were, and the snapshot now waits for the page to paint first, or the pin that was just placed is missing from it. | The iteration screen; supersedes the Comments popover above. |
| 2026-10-05 | **Opening an iteration now brings its preview up by itself; the Build controls are gone.** Noah asked for no Run preview button and no Ask the agent box: open an iteration, see a loading screen, and the preview appears when it is ready, so nobody has to decide to run anything. The wrench and its popover are removed, leaving one Comments icon in the toolbar. The steps (put the checkout on the branch, have the agent build it first if the work was only just created, start the preview) are one function over an injected API, tested without a window, and the screen says which step it is on. A failure shows what happened with the program's own output beneath it and a Try again button; a dirty working tree is reported with what to do about it; and trying again after the agent has done its work does not ask it to do the work twice. The agent now runs only at creation. Checked in the real app against a throwaway repository, so neither the user's Coke checkout nor its preview port were touched. | The iteration screen; supersedes the Build popover above. |
| 2026-10-05 | **Side panel replaced by two toolbar popovers.** Noah wanted the sidebar gone, leaving two icons in the toolbar: a wrench for **Build** and a speech bubble for **Comments**, each opening a popover. The preview is full-width again. A popover is part of the window and the preview is a native layer drawn above it, so the picture-of-the-preview technique returns, in a smaller form than before: while a popover is open the preview is swapped for a snapshot of itself, taken after the pins are drawn and shown before the live view is hidden. Escape, or a click outside, closes the popover and brings the live page back; switching from one popover to the other keeps the same picture. Build stays mounted while closed, so an agent run or a starting preview is not lost when the popover shuts, and Build closes itself when the preview opens. The comment count moved into the Comments heading and tooltip rather than a badge. The docked, resizable panel and its width limits were removed. Tooltips use `describeChild`, so the icon is labelled once rather than twice. | The iteration screen; supersedes the docked panel above. |
| 2026-10-05 | **The side panel is docked, not a flyover, and can be resized.** Noah preferred the panel to push the content. That removes the whole workaround for drawing over a native view: no snapshot of the preview, no hover-to-open, no edge watching, and the page stays live and usable beside the comments, so all of it was deleted rather than left dormant. The panel opens from the toolbar icon and shares the row with the preview, which gets narrower. A divider between them drags (or takes arrow keys), with a **250px minimum**, a maximum of 60% of the window (760px at most), and the width remembered. The preview is hidden for the length of a drag, because the pointer over a native view never reaches the window and the drag would stall the moment it crossed into the page. Hiding stays a set of named reasons (the account menu, a drag). | The iteration screen; supersedes the sliding panel above. |
| 2026-10-05 | **Iteration toolbar tidied and the panel split into tabs.** Back is now a chevron; the comment count moved from on top of the panel icon (where it was cropped) to its own chip beside it, and clicking it opens the Comments tab; the panel has two tabs, **Build** (run the preview, ask the agent) and **Comments** (place a pin, write, read). Build opens first when there is no preview to look at yet, and a placed pin, a pin click or an error moves to Comments. | The iteration screen. |
| 2026-10-05 | **Iteration screen reworked: a thin toolbar and a full-bleed preview.** Noah asked for a slim bar under the main one (back, name, branch, designer, panel toggle), the preview taking all the remaining space down to the bottom edge, and the comments and build panel sliding out over it from the right, by an icon or by resting the pointer near the right edge. The preview is a native view that is always drawn above the window's own content, so a panel cannot be laid over it and the window never sees the pointer over it. Solved by pausing it: while the panel is open the preview is swapped for a picture of itself (taken after the pins are drawn, shown before the live view is hidden) and the panel is drawn over that; clicking the picture closes the panel and the live page returns. The pointer at the edge is watched by the main process, with a short dwell so reaching for the page's scrollbar does not open it. Several things can need the preview hidden at once (the account menu, the panel), so hiding is a set of named reasons rather than one flag. An error opens the panel so it is not hidden under the page. | 3.3.5; the app. |
| 2026-10-05 | **Window reworked: a top bar instead of a toolbar, and the Author view hidden.** Noah asked for a toolbar-less window with a normal top nav: Flock Designer on the left, a Projects tab beside it, and an account menu (GitHub picture and name, with Sign out) fixed at the top. The native title bar is gone (on macOS the window buttons sit inside the bar). The Author screen was removed from the window for now, because it will come back as a list of repositories from GitHub; its services stay in the main process. The preview is hidden while the account menu is open, since a native view would otherwise cover the menu. | The app and its README; the description of modes in Part I. |
| 2026-10-05 | **Pins can be clicked and dragged.** Noah asked to move a pin after placing it, and for a click on a pin to highlight its comment. A click selects the comment in the panel and scrolls to it; a drag moves the pin and saves the new position by editing the comment, so only its author can. Pins now report back through the page's console with a per-preview secret, since the preview has no bridge to the app; `smoke:page` checks a real click, a real drag and that a forged message is ignored. | 3.3; the app and its README. |
| 2026-10-05 | **First real use of 3.3 found two faults, both fixed.** Noah placed comments and reported no pin and nothing saving. The comments were in fact saved, but as **two separate issues** for one iteration. GitHub's issue listing lags a new issue by ten seconds or more (measured: not visible at 8 s, visible by 10 s, with or without the label filter), so the app could not find the thread it had just made, showed no comments, and the next comment created a second thread. The app now remembers threads it creates, reads every thread for a branch and writes to the oldest, so the two existing ones show together. Separately, the element outline was dropped: Noah wants a plain click-to-place pin, so comment mode is a crosshair and a teardrop pin whose tip is the click point, shown amber while writing. A pick that cannot be anchored now says so instead of silently doing nothing. | 3.3; the app. |
| 2026-10-05 | **Built 3.3.** Preview inside the app, click-to-comment with element anchoring, markers on reopening, and the moved/missing degrade. The preview is an isolated view with no bridge to the app; the app runs scripts in it and validates what comes back. Added `smoke:page`, which tests this in real Electron because jsdom cannot show isolation, real clicks or layout. Left for later, as specified: dragging a region, thumbnails, notifications. Still needs the human feel check and the security look. | 3.3; the app and its README. |
| 2026-10-05 | **Checked that prototype and codebase work are treated equally, and fixed what was not.** Noah asked for confirmation that the app works equally well for designers working directly in the codebase and for simple prototypes. It did not: the app could only start `fd/` prototype iterations, and codebase work had to be created and recorded by hand. Added **Work in the codebase** (adopts an existing feature branch), and fixed iteration numbering skipping a number when a codebase record existed. | 3.2; the app. |
| 2026-10-05 | **Added 3.2.5, who is on each project.** Noah asked for the project list to show everyone who has committed to a project, since designers working in the codebase will be the main way in. Added as 3.2.5 at his suggestion rather than renumbering. Code authors are recorded in the iteration record by the author's app (reviewers cannot see Coke) and design-repo folder history is read by the reviewer's app. Names only, no emails; bots excluded. Avatars and usernames added the same day: logins are resolved from noreply addresses, the signed-in user's own commits, and design-repo history, never guessed from a name. | Phase 3 table; new section 3.2.5; the five iteration records. |
| 2026-10-05 | **Moved automatic publishing of iteration records forward into 3.2.** Noah asked why `iterations.json` exists and whether it could be automatic. It exists because iteration branches live in the Coke repo, which reviewers deliberately cannot see, so the record has to be in the design repo. The authoring side already wrote it locally; nothing committed it, and the note I had written in the five backfilled records ("the app writes this file from now on") was not yet true. The app now publishes the record through the API on create and continue, merging by name. It needs the GitHub App's Contents permission raised to read and write. 3.4 keeps only the preview URL. | 3.2, 3.4, the app README. |
| 2026-10-05 | **Reorganised the plan into four numbered phases.** The sequence mixed numbers and letters (1, 5, C1, A2, D1) and skipped, which made it impossible to see where we were. It is now Phase 1 (foundation), Phase 2 (working in the codebase), Phase 3 (the review app, the current build) and Phase 4 (rollout, needing other people), with steps numbered 1.1 to 4.3. Every old name is mapped to its new number in [Appendix B](#name-map-old-step-names-to-the-new-numbers), the finished-step sections there are now in phase order, and every internal link was rewritten and checked. Historical text, including the change log, keeps the old names on purpose. | The sequence; the status box; all step headings. |
| 2026-10-05 | **Restored one complete, ordered list of steps.** Moving finished work into appendices had left the live table showing steps 1, 5, C1 and so on, with the completed run missing, which read as disorganised and hid how much was done. The sequence is now one numbered list, 1 to 23, with every step marked done, built-awaiting-a-check, next, not started, or needing a person, and the old name beside each so history still resolves. 13 of 23 are done. Also marked stop 1 cleared and stop 2 partly cleared, since the client ID arrived and sign-in was verified. | The sequence; the status box; the stop table. |
| 2026-10-05 | **Found that an iteration appearing for reviewers was not automatic, and made it part of C3.** Running the app against the real design repo listed "No branches yet" for every project, which exposed two things: iteration branches live in the product repo, which the app deliberately cannot see, so iterations are now read from `projects/<id>/iterations.json`; and **only the app's author mode writes that file** — the agent's instructions never mention it — and **nothing publishes it**, so today it needs a manual commit and push. The five existing projects were backfilled once by hand because they predate the app. **Step C3's Share action now owns it**: it writes and pushes the record from facts it already has, so designers add nothing. | C3; the project listing code. |
| 2026-10-05 | **Corrected: the sign-in is a GitHub App, not an OAuth app.** The plan said to start with an OAuth app because GitHub's device-flow page did not mention GitHub Apps. Checked properly: GitHub Apps do support device flow (it must be enabled in the app's settings), need no client secret, and issue a user token limited to what both the app and the user can do. An OAuth app would have needed the `repo` scope, which reaches every repository the user can access, Coke source included — and GitHub itself recommends a GitHub App for that reason. This reverses an earlier decision to drop the GitHub App. Org SSO remains unverified; C1 tests it. | C1; the waiting list, risks, decisions and open questions. |
| 2026-10-05 | **Made the flow continuous.** Noah asked that the steps can be worked one after another until everything is finished. The plan did not say what happens when a step's last check needs a person, which would have stalled it. Added a status, **Built — awaiting check**, so the next step can start while a human check is pending, and a table of the five points where work genuinely stops and what happens meanwhile. | The sequence; status values. |
| 2026-10-05 | **Phases made explicit; the app's UI stays on FUI.** Noah asked for the work to stay in phases, which it already was as C1–C5; added a table of what exists if the work stops after each phase, with natural stop points after C2 and C4. He also considered moving the app to shadcn/ui and Tailwind for a nicer default look, then decided to keep the Flock design system. The shadcn route was checked first — components are copied into the repo, and its docs do not mention Electron — and would have been cheap, since the renderer is 373 lines with four FUI imports, so this is a preference and not a constraint. The cost of staying: building the app needs the GitHub Packages token, and it stays on React 18. | The sequence; the decisions table. |
| 2026-10-05 | **Restructured so the plan covers only what remains, and set the direction for it.** The plan had grown to ~44,000 words, 27% of it change log and most of the rest describing finished work, so the live plan was hard to find. Completed work moved **intact** into [Appendix B](#appendix-b--what-was-built-and-why), the contracts into [Appendix A](#appendix-a--how-the-system-works), and the superseded Workspace design and decision gates into [Appendix C](#appendix-c--superseded-designs); a check confirmed every original line still exists. **The direction changed too.** Noah's goal — a Figma-like place where design, product and engineering browse each other's prototypes and comment — reframed Track C: the Electron app is no longer a paused authoring convenience but the client for **review**, because GitHub's device flow lets a desktop app sign people in with no server of ours, and the existing Electron app already holds the authoring half. Decisions reached in discussion: GitHub identity (Okta is GitHub's concern); comments as issue comments in the **design repo**, one issue per iteration, keeping PMs out of Coke; click-an-element anchoring, as Magic Patterns does; a **mock-data** CI build as the shared preview, which the current `build:dev` workflow is not; one PR per branch. Old steps 14–16 are replaced by **C1–C5**; automating handoff inside the app was dropped because `npm run handoff` already does it. **Checked rather than assumed:** device flow needs no secret for OAuth apps and read access can comment on issues (GitHub docs); Electron needs an upgrade at least about twice a year (its policy); GitHub's docs are silent on device flow for GitHub Apps and under org SSO, so C1 tests them. | The whole document; Track C; steps 14–16 → C1–C5. |
| 2026-09-29 | **Track C paused, and the next step made findable.** Noah paused the Electron work — he has an idea for the Workspace worth working through before more is built on it. Nothing is lost by waiting: step 14 could not have started regardless, and step 13's own success measure is that every artifact stays usable without the app. **Two real problems fixed while doing it.** The track summary at the top of the sequence still said Track B was *"just specified, nothing built"* and Track C *"not started"* — both badly stale, in the one table a reader checks first. And **the design-system context generator was invisible**: step 17 said plainly *"Claude can write the generator,"* but the rest of 17 needs permissions and a release, so a step nobody could finish was hiding the one piece of real work that was ready. Split it out as **Track D, step D1**, the same way step 18 was split out of step 8 — and it is now the only unbuilt step Claude can finish. The `cokeUsages` decision, the packaging and the org transfer stay in 17 with their owners. | The sequence summary; Track C; new Track D and step D1; step 17; both status blocks. |
| 2026-10-05 | **Full verification pass.** Baseline green (tsc, lint, 396 tests, 12 a11y, 599 context checks, Workspace 87 tests and boot); all six work branches rebased to the current baseline and **Ready** on the corrected gate; zero co-authored commits of mine on any ref (the 16 pre-existing team commits in Coke are untouched). **Found and fixed:** the "not run" check could never fail, and my first repair of it over-corrected and rejected good records; the design-system docs still made false present-tense claims about the deleted JSON and counted allowlisted components three different ways; and the token lookup command I had documented in three files **does not run in plain Node**. tsbuildinfo files had been committed. | Step D1 (token lookup); `check-handoff.mjs`; FUI and Coke `.flkd/`. |
| 2026-09-29 | **Four gate answers from Noah, three of them plan changes.** (1) GitHub auth: confirmed his "log in with GitHub" instinct is exactly the recommended mechanism, not a different idea — tightened the gate's wording to say so plainly and rule out Google Auth by name, since only GitHub can issue a token for GitHub permissions. (2) **Annotation reversed:** the plan said include click-to-pin markers from the pilot; Noah wants general comments only for the pilot, with spot-marking deferred. Changed the gate recommendation, the MVP UI table, and renamed "Anchored comment shape" to "Comment shape" with position fields now optional on the same record rather than required — so a later marker slots in without a second system. Also answered his "how would it know what's highlighted" question: it does not — it is a stored percentage position on a fixed screenshot, no image recognition. (3) **New requirement, not previously written down:** a prototype's PR must not read as a request to merge, since a real handoff PR exists later and the two would be indistinguishable in a PR list. Draft state and an explicit "do not merge" PR body are now required, next to the one-PR-per-branch mechanics. Confirmed separately that his "attach it to a markdown file" instinct was already the design — `review.md` is the durable copy, the PR is only the live thread. (4) **New fact, not resolved:** engineering has or is building a mock-data service. Recorded in Open Questions rather than integrated, because whether it generates fixtures ahead of time or is called live changes a real safety guarantee (design mode currently makes zero real network calls), and neither is known yet. | The GitHub-auth gate; the annotation gate and "Comment shape"; the MVP UI table; the PR-per-branch section; the fixture open question. |
| 2026-09-29 | **Step 13 confirmed working, and the PR model corrected by the plan owner.** Noah ran the app: it works. That was the one claim the tests could not make, and step 13's go/no-go is **go**. **On the PR model, the plan was wrong and so was the fix I proposed for it.** The plan had one project-wide draft PR moving from `i1` to `i2`, which GitHub cannot do; I proposed a long-lived `fd/<id>/current` branch to work around it. Noah: *"it'll be one PR per branch"* — you pick an iteration, keep building on it, and open a PR for that branch. **No workaround is needed, because the problem was invented by the plan.** Branch-per-iteration stays, for the reason he gave: it costs nothing when you only do one, and it makes showing three at once cheap when the comparison is the point. A PR is opened when an iteration is worth sharing, not for every iteration — which also answers the "growing pile of open prototype PRs" the old rationale worried about. **Nothing built had to change**; the retargeting language was removed from nine places in the plan. | The git and iteration model; the preview adapter; the architecture diagram; the minimal user journey; step 13's status; both status blocks. |
| 2026-09-29 | **Answered part of a step 14 gate by reading the repository instead of waiting for a meeting, and found a mechanism in the plan that cannot work.** Coke's `PR Deployment` workflow listens for `pull_request` `opened`/`synchronize`, which **draft PRs do fire**, and nothing anywhere in `.github/workflows/` filters drafts — so draft triggering is very likely already fine, and the only unread piece is the reusable workflow in `flock-github-actions`. That turns an open investigation into a one-line question for its owner. **The harder finding: "one draft PR per project, retargeted to the current iteration branch" is not possible.** GitHub does not allow changing a pull request's head branch — the API takes `title`, `body`, `state`, `base`, `maintainer_can_modify` and nothing else — so a PR opened from `fd/<id>/i1` can never point at `i2`. Retargeting the base would fire `edited`, which this workflow does not listen for, so it would not rebuild either. Candidate fix recorded for the gate owner rather than decided here: one long-lived `fd/<id>/current` branch per project that Workspace updates to the selected iteration, keeping the PR thread and its anchors alive across every iteration while each update fires `synchronize`. Iteration branches stay immutable and one per attempt. | The preview adapter; the preview-publisher gate row. |
| 2026-09-29 | **Named a gap in step 14 before it could get lost: "stand up the shared project-memory repository" was a goal, not a build item.** Noah asked whether installing Workspace should be enough for the shared `flock-designer` checkout to just be there -- clone, standards, project records, all connected without a manual git step. It should, and now says so explicitly in step 14's bullets and the product boundary. **Split into two pieces that were being treated as one:** cloning/pulling/writing `flock-designer` needs nothing beyond the git access a designer already has to read it, so it does NOT depend on the GitHub App decision; only the review/PR path (draft PRs, comments, build status as the acting user) does. Both still ship in the same step-14 pass -- the split is about what gates what, not about pulling anything forward yet. | Step 14's bullets; the product boundary; the technical-architecture diagram. |
| 2026-09-29 | **Step D1 reversed mid-build, and the reversal was right: the design-system snapshots are deleted rather than automated.** D1 was written as "build the context generator" and I built it. It found real errors the copies had accumulated — **`FSFormInput.onChange` was published as taking one argument when it takes two**, silently dropping the value the user typed, in the one field that exists to prevent exactly that; `FSAlertButton` carried `FSAlert`'s props when it takes `FSButtonProps`; three MUI re-exports claimed `FSDataGrid`'s 60 props. Then Noah saw what the generator would be keeping in sync — **494 resolved hex values** — and reversed it: *"the files inside the design system should be pointing to the actual files in there."* **That dissolves the problem instead of automating it, and it dissolves the version problem with it:** `versionScannedFrom`, the manifest-vs-source-vs-installed chain, and a hard validator failure whenever a checkout sat one patch ahead of the product all existed *only because facts were copied*. **3,071 lines of JSON deleted**, 39 lines of pointer added. Every fact was already in the installed package: prop types and MUI augmentations in the shipped `.d.ts`, `@deprecated` in the JSDoc, token values from `createFSTheme()`. `validate.py` now reads `node_modules` and gained a check that fails on a hex literal in any context file, so the snapshot cannot grow back. 606 checks, 0 failures, and no version NOTE. **The durable rule: a context file states judgment, not data.** | Step D1 (rewritten); step 17 (three items settled by deletion); Track D; `flock-react-component-lib/.flkd/` throughout; `flock-coke/.flkd/` and `check-handoff.mjs`. |
| 2026-09-29 | **Step 13 built: the Workspace local loop, in `flock-designer/workspace/`.** Electron 44 + React 18 + FUI + TypeScript; 88 tests, the whole designer journey end to end, the services run against the real Coke checkout, and `npm run smoke` boots the actual app to prove the window opens rather than trusting that a build implies one. **Nothing about any product is compiled in** — a repository declares itself in `.flkd/workspace.json`, and its `commands` array is the entire allowlist, always as already-split `argv` so no shell parses anything. The renderer sees one object of named operations with no generic invoke, every root is checked against what the window actually opened, and every path resolves through a check that follows symlinks. **Three things the build found:** the iteration record first went into the product checkout, which dirtied the tree and blocked the next iteration on its own bookkeeping (the plan had already settled that records live in `flock-designer/projects/`, for this reason); a stopped preview reported itself as a crash because `stop()` removed the entry before the exit handler could tell the difference; and `ELECTRON_RUN_AS_NODE`, exported by editors and agent harnesses, makes the Electron binary run as plain Node and die on its first line. **Also corrected: step 13 was labelled "Engineering"**, which contradicted the rule that a step is something Claude can finish — writing the application is Claude's, and steps 14–16 are the ones that genuinely need other people. **What is not proven is the click-through**: the services and the journey are tested, but nobody has driven the UI. That is step 13's own go/no-go and it is now in *Waiting on other people*. | Step 13; the Track C table; both status blocks; `flock-coke/.flkd/workspace.json`. |
| 2026-09-29 | **Both reviewers ran, on the two projects that had recorded them as "not run" — and the first thing they found was that the new scan was lying.** `expectNoAxeViolations` read `results.violations` and threw away `results.incomplete`, so undecided findings were invisible on **five of six branches**. Fixed: they report as NEEDS REVIEW and need the same named record a violation does. The reviews then found nine more real defects. **The one worth naming is mine:** an `InheritedViolation` claiming the prototype could not stop a toggle carrying two labels. It could — `FSToggle`'s `label` takes a ReactNode. The record was deleted and the defect fixed. *A suppression that is merely untrue is worse than no scan, because it looks like diligence.* Also fixed rather than recorded: a lock reason reachable only by mouse, four row titles rendering as `<h6>` under an `<h1>`, a `partial` state whose banner named data it was still showing, an unnamed search box, two `aria-label`s on elements ARIA forbids naming, and a `style` prop standards forbid. **`npm run handoff` is now green on all six work branches.** Two review records written that never existed (`unused-roles-signal`) or were half-written (`alert-notification-prefs`), and a Design System component gap corrected — "FSToggle cannot be named through its own API" was too strong; the real gap is that it always wraps its input in a `<label>`, so naming it from outside produces two. | Step B3; `axe.ts`; `check-handoff.mjs`; all six work branches; `review.md` for unused-roles-signal and alert-notification-prefs. |
| 2026-09-29 | **Step B3 built: the accessibility scan runs for the first time, and a missing fixture is no longer silent.** `npm run a11y` — axe-core via vitest and happy-dom, both already installed. Cypress still will not launch here and never needed to. Run across **all five work branches**; every "not run" in every project record now carries a real result or a named owner. **It found four real defects on its first outing**, two of them in shipped product code (`aria-required-children` on the grid toolbar, and a `role="list"` of `role="img"` children), plus a repo-wide test hazard — Testing Library's cleanup had never registered, so renders piled up in one document and `screen` queries matched the previous test's markup. **`InheritedViolation` is the mechanism that keeps this honest:** a violation this work did not introduce is recorded with what is wrong and who fixes it, and the run **fails once it stops firing**, so a suppression cannot outlive its defect. Also: design mode now refuses and names unmocked app-data requests instead of passing them to the real API, where they failed auth and rendered as a working screen with absent data. Standards and the handoff gate now require the scan, so nothing lands having skipped it. **Three gaps found while doing this were fixed rather than recorded:** a vitest cache file committed to git, a handoff doc missing from `feature/unused-roles-signal`, and the gate asking a prototype for a handoff doc it does not owe. | Step B3; `non-negotiables.md` §7; `check-handoff.mjs`; `smoke-design-mode.mjs`; all five work branches; all five project records. |
| 2026-09-29 | **Fixed a half-done rename that made B3 unfindable.** The Track B table listed B1/B2/B3, but the sections were still headed "Step 10" and "Step 12" — so the label existed in one place and the content in another, and the plan owner could not locate the only remaining step. Sections renamed to **Step B2** and **Step B3** with anchors and live prose following; change-log rows keep the old numbers, since they are history. **Verified mechanically: all 13 sequence rows resolve to a real section, 0 broken anchors.** Also noted why the numbering is mixed — Track A kept 1–9 because it is finished and the change log refers to those numbers constantly; renumbering completed work would break every historical reference for nothing. The links are what to rely on. | The sequence; steps B2 and B3. |
| 2026-09-29 | **The sequence now contains only steps Claude can finish, at the plan owner’s direction** — "the whole point of writing the steps is that we can hit each one and clearly move on to the next." It had stopped doing that: every answer to "what is next" arrived with two human dependencies attached, because steps that needed an engineer, a designer or a named owner sat in the critical path. **New rule: a step is something Claude can finish.** Anything needing another person moves to **Waiting on other people**, which never blocks. Those reviews still happen and the place for each is already built — review records, the friction log, HANDOFF.md — they just are not sequence steps. **Step 10 renamed** from "Hand one off to an engineer" to **"Build the handoff"**, which is the part that was actually done; the engineer receiving one is parked. **Step 12 rescoped against what four real projects showed:** the state-switcher item is done, captures are overtaken by step 14, and the two that remain are the evidence gaps every review has recorded as unmet — **the axe scan has never run** (four consecutive artifacts with no automated accessibility evidence) and **unhandled requests are silently bypassed**, so a missing fixture looks like a working screen. Track B is now B1, B2, B3, and **B3 is the only unbuilt step in the whole sequence**. | The sequence, rebuilt again; steps 10 and 12; both status blocks. |
| 2026-09-29 | **Track A is complete.** Steps 7 and 9 both closed on the same act — a person opening and reviewing a prototype — which immediately surfaced two harness defects (the MUI X licence watermark and Material Symbols rendering as ligature text), both since fixed and both caused by the bootstrap duplicating `src/index.tsx` rather than reading it. **A2 verified against its own strict criterion:** `NAVTEST-A2` was added to the real product’s `useAdminSubNavItems` and appeared in the prototype, with **zero** occurrences of that string in any prototype file — inherited, not copied. Reverted after. **A2 also exposed a defect its criterion did not ask about:** a prototype’s `host.tsx` drew its own `FSUniversalNav`, stacking a reconstructed nav under the real one; a context now tells a prototype the real shell is present and the host skips its chrome. Both ways of opening a prototype stay, answering different questions. **Navigating away lands you in the real product on mock data — deliberate:** a prototype is one view at one route, and making its links route internally would mean the prototype owning routing, which is forbidden and would blur real links against simulated ones. | Track A table, steps 7, 9 and A2. Repo: `667c5070`, `d28757ea`. |
| 2026-09-29 | **Handoff clarified and its document moved into the branch, at the plan owner’s direction.** Handoff is narrower than this step assumed: get the branch hardened, leave it ready, pass it along manually — engineering takes the branch from there. **The handoff document was in the wrong repository.** It sat in `flock-designer/projects/<id>/handoff.md`, so an engineer handed the branch would never have found it. It now lives at the branch root as **HANDOFF.md**, first thing visible on checkout, and says to delete itself when the work merges because it describes a handoff rather than the product. The design record — brief, context receipt, both reviews — stays in `flock-designer`: two documents, two audiences, no duplication. **It must also name which files are the feature**, because the first real handoff had five feature files among sixty, the rest being Flock Designer infrastructure not yet on `develop`. The gate enforces the branch location. Verified end to end on `feature/users-inactivity-signal` — all fifteen checks pass. | Step 10; the handoff skill; the gate. Repo: `cef176be`, `ec78650c`, `51d0ba84`. |
| 2026-09-29 | **Quality pass across both repositories before moving on**, at the plan owner’s direction — "we keep finding these little things… I want to make sure we’re solid." Found by sweeping rather than by hitting them again. **Stale:** the `.flkd` README claimed 8 standards and 3 skills (2 and 4 — the universal tier moved out, `prepare-handoff` came in), its skills tree omitted `prepare-handoff.md`, and `manifest.md` still called design mode "not yet confirmed" and pointed at steps 7 and 8 as future work. **Missing:** the five commands that now carry this project’s reliability were almost absent from the index — each is now listed with what it does and which false claim caused it. **Redundant:** the bare-`src/` trap is explained in four files; two restated it without linking the canonical explanation, which is how copies drift. **The real hole, in both repos:** the most repeated failure here — claims about code nobody ran — existed only as historical gap-log rows, not as a rule anyone reads. It is now **non-negotiable §9** with the six false claims that earned it, and the plan gains **"a contract without a step never gets built"**, which is what would have caught the codebase path, real-shell design mode, and prototypes being unopenable. | `.flkd` README, manifest, non-negotiables, `known-safe-imports`, `src/prototypes/README.md`; this document’s maintenance rules. Repo: `200b1580`. |
| 2026-09-29 | **Step 10’s buildable half is done: `/handoff` exists.** `npm run handoff -- <project-id>` runs the checks a handoff claims and **refuses when they fail** — clean tree, records present, `tsc`, lint, tests (required on the codebase path), bundle and boundary for prototypes, and no unexplained "not run" accessibility on shipping code. **It caught a real failure on its first run:** repo-wide lint was failing on `smoke-prototype.mjs`, which a scoped check had passed — "lint passes" was an assertion and it was wrong, which is precisely the pattern the gate exists to end. `.flkd/skills/prepare-handoff.md` carries the judgement half the script deliberately omits: lead with what engineering picks up, name the decisions made that were not the agent’s with the most-likely-wrong first, and never let an unstated check read as a passing one. Verified against the real B1 branch — all eight pass. **The step stays In progress: it is human-gated**, and no engineer has received anything. | Step 10 and its sequence row. Repo: `05fa8a52`, `3f137cd6`. |
| 2026-09-29 | **Credibility levels removed entirely, at the plan owner’s direction** — "code base should always be grounded… if you’re building a prototype, it should always be grounded in the right patterns. So actually I don’t even think we need the rigor level." Correct: the four-level ladder conflated **grounding**, which is the floor on both paths and always was, with **how much gets built**, which genuinely varies and which the request already states. Offering "Ground" as a choice implied you could opt out of the one thing that makes building here worth doing rather than using a design tool. **Handoff was not a level either** — it is a deliberate formal run, now folded into [step 10](#26--build-the-handoff-was-b2) as a `/handoff` command to be defined there, tool-agnostic first. **Swept from eleven files across two repos:** the levels table, the per-level state table, the per-level accessibility table, the artifact matrix, both reviewers, both skills, and the brief’s level field. Requirements now follow the **path**, which is a real distinction. Accessibility scales by how much is *recorded*, never by whether the rules apply, and states outright that **"not run" is always acceptable and silence is not**. | "How much to build" (was the four levels); "What each piece of work owes" (was the artifact matrix); step 10; the two build paths. Repos: `7d592971`, `9b66bfd`. |
| 2026-09-29 | **Path routing is decided by the branch and a mandatory question, not by inference**, at the plan owner’s suggestion. An `fd/<project-id>/iN` branch means prototype work and a product feature branch means codebase work — neither needs asking. **Only new work on a baseline branch is open, and there the agent must ask, with no default and no recommendation**, because "build me a X" is the most common way someone asks for a prototype and the wording does not disambiguate. Silence never means codebase, since that is the direction that does not undo cleanly. Also checks the environment can support the answer: without `node_modules` **both** paths are blocked, so that signal cannot separate them — it is a setup problem. **Deliberately not a slash command:** `.flkd` is tool-agnostic, and routing through a Claude Code feature would move the decision into `.claude/`. Richer detection — knowing whether the designer has a full checkout at all — belongs to the Workspace in Track C. | The two build paths. Repo: `3f9e5f39`. |
| 2026-09-29 | **B1 done — the codebase path works.** The inactivity signal built for real in `flock-coke` on `feature/users-inactivity-signal`: `lastLogin` now reads relatively and renders a warning chip past a threshold, in the actual `orgUsersList.tsx`, with 7 new specs against a fixed clock. **376 tests pass**, `tsc` and lint clean, and it was **verified rendering in the real app** rather than assumed. **The handoff is smaller than expected:** there is no API work at all — `searchUserDto` already types `lastLogin` and the real endpoint already returns it, so the only stub was fixture *values*, and reverting that one file runs it against real data. The structural decision worth review: `mapUserToTableRow` used to format the date at the data layer; the row now carries raw ISO and the column formats it. **Same feature now exists on both paths**, which is the comparison B1 existed to produce. | Track B table; `projects/users-inactivity-signal/handoff.md`. Repo: `56aee3c3`. |
| 2026-09-29 | **New step A2: run a prototype in the real shell — it was described but never scheduled.** A prototype’s chrome is reconstructed in `host.tsx`, so an admin view shows a **copy** of the Admin nav that goes stale the day someone adds an item. The contract has always described real-shell design mode "for Test work when the question is about a real app surface," and step 8 built design mode only as a way to *run the product*, so **no step ever owned the other half** — the same described-but-unscheduled failure that left the codebase path unbuilt for nine steps. A2 is **sequenced after B1**, because building in the real app first shows what this should look like, and Track B gets real chrome for free. Standalone `start:prototype` stays; two ways to open a prototype, chosen by whether the work depends on its surroundings. | Track A table; new step A2. |
| 2026-09-29 | **The sequence is restructured into three tracks, and the status column was wrong in both directions.** At the plan owner’s direction: *"get over the line with one, then move to the next,"* and *"I need to see where we actually are."* **Track A** (prototype path), **Track B** (codebase path), **Track C** (the Workspace app), with 17 and 18 parked outside because they need access or another person and block nothing. **The audit found the status table lying both ways:** step 9 read "Not started" with **four** proofs on disk and the resume test passed; step 7 read **Complete** with "opens" never verified until `9015497e` hours ago, and "reviews cleanly" still unmet; step 5 read **Complete** in the table and **In progress** in the change log; step 1 read **Complete** while its own "done when" requires owners named and the Design System owner never was. All corrected. **Every step now names how it is checked** — mechanical, cold start, or human — and **a step whose check needs a person cannot be marked Complete by Claude.** That rule exists because it was broken twice: step 7 closed on an unverified claim, step 8 closed having built half of what it owned. **Track A’s entire remaining gate is one act:** a person opening a prototype and reviewing it. New **step B1** starts Track B. | The sequence, rebuilt; both status blocks; new step B1. |
| 2026-09-29 | **The codebase path is specified, at the plan owner’s direction — and it was always in the plan.** The two-runtime-modes contract has said since the original runtime document that real-shell design mode is *"for Test work when the question is about a real app surface."* **Step 8 implemented only half of it** — design mode as a way to *run* the product — and closed; every proof written afterwards pointed at `src/prototypes/`, so the second path was never exercised, and its `Implemented in:` line read "Not yet" while the step owning it was marked Complete. **Claude then compounded it by answering "never, by design" when asked when work happens in the real codebase**, quoting the prototype graduation rule as though it governed everything. It does not. **Now specified:** one agent, two paths. On the codebase path the designer builds the actual frontend in real locations with real Redux, routing and permissions, and **only the network stubbed** via MSW handlers in `src/mocks/`; `.github/instructions/*` come into force alongside `.flkd`; tests are required; every state the feature has is built. Non-negotiables §1–3 are marked prototype-only, §8 splits, and new §1b carries the codebase boundaries. **Handoff differs by path:** a rewrite plan for prototypes, and for the codebase path **a branch engineering takes over** — "as if they had built it themselves" — with the report ending in the list of stubbed endpoints, which is exactly what they swap. | New "The two build paths" contract; the runtime-modes `Implemented in:`; step 10. Repo: `0c9d64a7`. |
| 2026-09-29 | **Step 7 was closed on an unmet criterion, found by the third real project.** Its "done when" is *built, opened, and honestly reviewed*. Built was verified by a smoke check; **opened was never verified at all.** Prototypes register no production route by design, so nothing served them — the README said "open `index.tsx`", a file rather than a URL, and no mechanism existed. The agent tried to follow it, worked out a manual `src/index.tsx` swap with a revert, and reported the documentation as wrong. **Fixed:** `npm run start:prototype -- <project-id>` serves one prototype on `:3100` from a dev-only config that touches no product route, with a generated bootstrap that wraps it in `FSApp` — without the theme provider a prototype renders unstyled and looks broken. Verified end to end. The agent is now told to open its own work before reporting that it works. **This is the second step closed on a procedure its author never executed**, after the impossible FUI tag instruction. | Step 7; `src/prototypes/README.md`; agent contract. Repo: `9015497e`, `90043e1c`. |
| 2026-09-29 | **Third proof, run at Explore — the level scaling works.** 5 files against the previous project’s 9, and **`brief.md` alone** in the records: no context receipt, no review record, which is exactly what the contract says Explore owes. All five checks pass and the iteration was **committed** without being asked, so both contract changes from the previous run held. **The reliability question improved again:** it verified `lastLogin` is a real field and cited the file rather than assuming, flagged the 90-day threshold as **invented with no policy behind it** and named it "the thing most likely to be wrong," and flagged that turning an absolute date into relative text is a **behavior change rather than an addition** — a distinction nobody asked it to draw. One cited line number was off by two; the substantive claim was right. | Step 9 evidence. |
| 2026-09-29 | **Every credibility level produces something runnable and clickable, at the plan owner’s direction** — "I never want just a visual prototype." The credibility table listed "Clickable prototype" only on the **Test** row, which made clickability read as something Test buys. The first real project’s agent drew exactly that inference and asked the requester to choose between a "rough, static mockup" and a clickable one. Nothing said *static*; the table implied it by omission. **That inverts the premise:** building in the product with real components is only worth doing because the result runs — a picture of an interface is what Figma is for, and Figma is faster at it. What scales with the level is now stated as states, evidence and ceremony, never whether it runs. Explore still owes one state and no context receipt; it still runs. | Credibility levels here and in `flock-coke/.flkd/manifest.md`; the agent’s states-by-level section. Repo: `7779d6cd`. |
| 2026-09-29 | **Two trims to iteration cost, both keeping the check that catches the error.** Prop pre-verification is dropped — the agent was reading FUI source to check allowlists before writing code, and `tsc` caught the errors anyway: five across two projects, strictly more than reading found. The manifest is still queried to *choose* components, and `deprecated-components.json` is still read in full, because a deprecated component type-checks fine. Receipts were running ~100 lines listing every file opened; the format is now five rows — pinned, decisions, sources, boundary, **assumptions** — with the last carrying the most weight, since that is where a wrong inference gets caught before it becomes polished UI. A receipt the designer skims because it is long fails at the only thing it exists for. **Kept deliberately:** the confirmation stop, honest not-run reporting, the commit, and all five mechanical checks — none of which cost the time. **No "fast mode" was added:** Explore already is one, and had never been used. | Agent contract: FUI querying, receipt format. Repo: `3c0d8b6b`. |
| 2026-09-28 | **Step 9 run on a real request, two iterations — and the workflow held where it mattered most.** The **resume test passed**: a fresh session given feedback that never named the project, the branch or the folder found the work, read i1’s records, and appended i2 as a second review section without overwriting the first. The prototypes were good — it refused the request’s premise and verified that four of six proposed fields have no backing data, corrected "HOA vs Law Enforcement" to the 8 real org types, found a **genuine production accessibility bug** (`OrgListRowCard` puts `onClick` on a div with `tabIndex` on an unrelated element, recurring across four Mode A row cards), and deleted the unbacked integrations chip rather than placeholdering it. All four checks passed on both iterations, verified independently. **Three record inaccuracies, all one species — asserting a detail rather than deriving it:** a claimed FUI checkout tag that was never checked out, a grep result that was wrong, and a review dated four days before the artifact it reviewed. Logged as `model behavior`, since more documents will not fix it. **Two contract gaps found and closed.** Iteration speed barely improved (10 min → 7–8) because the reading list was unconditional — the agent now resumes from the existing context receipt and re-verifies only what can move. And nothing told it to commit: i1 was never committed, i2 edited those untracked files in place, and **i1 is unrecoverable** — its record survives, its code does not. | Step 9 evidence; `.flkd` agent contract, gap log, reviewer, README. Repos: `97a7aa6e`, `14d0be46`, `fda713e9`, `b37a086`. |
| 2026-09-28 | **The change boundary is now enforced mechanically, after I broke it twice by hand.** Baseline tooling was committed to a prototype iteration branch on two separate occasions, minutes after writing the rule against it both times — and because iteration branches never merge, both would have been stranded. `scripts/check-boundary.mjs` fails an `fd/<project-id>/iN` branch that touches anything outside its prototype directory, fails a baseline carrying prototype code, and fails an iteration branch with no commit. **Verified by reproducing both real failures**, not by assertion. Wired into the agent’s pre-report sequence, the implementation reviewer, and the README — five checks now, the last three all existing because the first two are not enough. **The general lesson, worth stating once:** every rule in this plan that has been broken was broken by its own author, within minutes of writing it. Rules that depend on care are worth less than checks that do not. | Change log. Repo: `14d0be46`. |
| 2026-09-28 | **Step 8 narrowed and closed; the access work becomes step 18, at the plan owner’s direction** ("we can figure this out later — add it to a later step"). Step 8’s "done when" originally read *"the real Coke shell runs locally on mock data, **and a designer reaches that state unaided**."* The first half is done and verified from screenshots. The second depends on AWS registry access, on confirming the correct SSO command, and on a `npm ci` that has never succeeded — none of it Claude’s to do. **Narrowing a step’s "done when" after the fact is recorded rather than done quietly**, both in the step and here. New **step 18** carries: confirm the AWS SSO command (currently a guess, flagged as such in `DESIGN-MODE.md`), provision designer access, **verify the hand-ported `msw` lockfile entries with a real `npm ci`** — the last technical unknown, whose failure mode is design mode breaking rather than an obvious install error — decide whether the 12-hour token expiry needs mitigating, and then run the unaided designer test. The plan is now 18 steps. | Step 8 and its sequence row; new step 18; intro step count. |
| 2026-09-28 | **The registry barrier is an onboarding step, not a wall — designers will be provisioned AWS access** (plan owner). That resolves the blocking question from the fresh-clone test. **What provisioning does not fix, and step 11 should still weigh:** the CodeArtifact token expires within 12 hours, so every designer will repeatedly hit a setup that worked yesterday and does not today, with an error that names npm rather than AWS. The backend barrier is genuinely removed — the shell renders on fixtures — but "runs locally on mock data" carries a standing dependency on an internal registry plus a twice-daily token refresh. Named as a cost rather than a blocker. `DESIGN-MODE.md` now says access is provisioned, who to ask, and that the expiry is expected behavior rather than something the designer broke. | Step 8 and its sequence row; friction log. Repo: `3d9f3565`. |
| 2026-09-28 | **The real setup barrier is AWS CodeArtifact, and it is bigger than the plan assumed.** A fresh clone reached `npm ci` and failed with `401`. GitHub Packages answered fine; the **default registry, AWS CodeArtifact, refused**, with no AWS credentials present at all. **1,320 of 1,428 lockfile packages resolve through CodeArtifact** — `react` included — so without AWS access a designer installs **nothing**, and the token **expires within 12 hours**, making this recurring rather than one-time. **The setup doc blamed GitHub**, which would have sent a designer to generate a PAT, fail again, and have no pointer to the real system; corrected in `3fdec5af`. **This is evidence step 11 must weigh:** design mode demonstrably removes the *backend* barrier — the shell renders on fixtures — but not the *internal-registry* barrier sitting in front of `npm install`, and therefore in front of everything. Invisible until someone cloned from scratch. The `msw` lockfile port remains unverified because installation never began. | Step 8 and its sequence row; friction log; step 11 evidence. Repo: `3fdec5af`. |
| 2026-09-28 | **Design mode renders — the plan owner ran it and it worked in seconds.** Screenshots show the full Coke shell on fixtures: nav, admin sub-nav, Organizations List, Profile, account switcher. That settles what could not be checked from a shell — MSW interception, the auth bypass and the LaunchDarkly mocking all hold end to end, the nav rendering being proof of the last since `AppHeader` waits on a flag. **Two defects came out of it.** `DESIGN-MODE.md` promised data for "Springfield Police Department", **a name found nowhere in the fixtures** — asserted rather than read. The real data is *HOA Org*, *Law Enforcement Org*, *John Smith*, and a designer would have seen the right screen, not recognised it, and reported the setup broken. Corrected to a table taken from the fixtures (`99491e48`). Separately, the file was undiscoverable: nothing linked to it and the root README opened by saying local dev needs a database and `flock-tanquery`, the very barrier design mode removes (`ddcc6f54`). **`npm ci` is still unexercised** — the run used an existing `node_modules`, so the hand-ported lockfile remains the open risk. | Step 8; friction log. Repo: `99491e48`, `ddcc6f54`. |
| 2026-09-28 | **Step 8 cold-start test passed, both traps cleared — and it is not the test that closes step 8.** A fresh session answered all four questions from `DESIGN-MODE.md` with accurate citations, correctly diagnosing the no-navigation case as LaunchDarkly plus running `start` instead of `start:design`, and correctly separating design mode from the prototype harness. Second clean pass in a row after three that each found a defect. **But this tests the document, not the setup.** Step 8’s "done when" is a designer reaching a running app unaided, and none has tried. **The most likely failure is now named in advance:** `msw`’s 43 lockfile entries were ported by hand because a `401` against GitHub Packages made a real install impossible in this environment, and **no clean `npm ci` has ever run against the result** — if the port is wrong, design mode fails rather than the install obviously erroring. Recorded in the friction log so whoever runs the designer test checks `npm ci` first. | Step 8; friction log. Repo: `cadff46d`. |
| 2026-09-28 | **Step 8 built; the half that needs a person is named.** The MSW `start:design` mechanism is ported onto the baseline — not the branch, which stays unmerged — gated behind `PUBLIC_APP_DESIGN_MODE` with MSW behind a dynamic import so it never reaches production. `npm run smoke:design` verifies the four shell-checkable things, including that the checked-in worker matches the installed `msw`. **Two real defects found.** First, `msw` was in `node_modules` but **absent from `package-lock.json`** — a clean `npm ci` would have installed none and design mode would have failed silently, hidden by a working dev environment; 43 entries ported, 499 insertions matching the source branch exactly. Second, **step 7’s tooling had been committed to the prototype iteration branch rather than the baseline**, where it would have been stranded because prototype branches never merge; split in `22de790d`, and the iteration branch now respects the change boundary it always claimed. **Setup friction recorded honestly:** `npm install` failed with a `401` that names npm rather than GitHub and never mentions the `read:packages` scope a designer would need — documented first in `DESIGN-MODE.md`, but documenting a trap is not removing it. **Step 8 stays In progress: no designer has run this**, and whether the shell renders needs a browser. | Step 8 and its sequence row; both status blocks. Repo: `afa5aa4f`, `22de790d`. |
| 2026-09-28 | **Step 7 cold-start test: clean pass, and the first one to find no real defect.** A fresh session named the entry point, the state switcher and all seven states, gave the review order, correctly identified `view.tsx` as the thing under review and `host.tsx` as throwaway, and — the trap — listed **all four** verification checks rather than stopping at `tsc` and lint. It also surfaced the accessibility caveat unprompted, without being asked about it, and correctly framed it as the reviewer’s outstanding work. Every citation verified exact. **One small inconsistency it exposed by being more thorough than the README:** `src/prototypes/README.md` said "three checks" and omitted the bare-`src/` grep from its table, while the agent file and `review.md` both require four — so a reviewer following the README alone would have run three. Fixed in `c329dffd`. **Four tests, four findings, though this one only because the session read more widely than one file.** | Change log. Repo: `c329dffd`. |
| 2026-09-28 | **Step 7 complete, and the org transfer moved to step 17 at the plan owner’s direction** so a finished step stops looking unfinished. **The bundle gap is closed** — open in the gap log since 2026-09-02. `npm run smoke:prototype` bundles a prototype entry with rsbuild’s alias set, and **the check was verified rather than asserted**: injecting the original failing import gave `tsc` 0 errors, Biome clean, and a smoke failure. The artifact is `src/prototypes/alert-notification-prefs/` with the full directory contract and all seven states behind a switcher, plus a project folder keyed by the same slug — the contract proved end to end. **Building it corrected three FUI assumptions** the manifest alone did not carry, all caught by `tsc` against the prop allowlists, and **produced the first real component gap**: `FSToggle` has no accessible-name route, so Coke’s canonical settings row ships unnamed toggles. Logged, not yet filed — the Design System owner is still unnamed. The review record leaves six of ten accessibility checks recorded as **not run** and the automated scan as **could not run**, which is the artifact proving the harness rather than pretending to prove the design. | Step 7 and its sequence row; step 6 and step 17 (transfer); both status blocks. Repos: `e9e5b14c`, `2f43511`. |
| 2026-09-28 | **Step 6 cold-start test: passed all three questions, and was right to complain about something it misdiagnosed.** A fresh session in `flock-coke` followed the references out to the sibling checkout, gave the accessibility floor and Test-level requirements, all seven view states, and — the question most likely to be confabulated — got the tier-precedence asymmetry right with citations rather than from memory: Flock wins on design judgment, the universal tier wins on accessibility, because conformance is a floor and judgment is not. Every citation verified accurate. **It then flagged the README’s file tree as stale for still listing `standards/universal/` under `.flkd/`. The tree was correct; the prose around it was not.** A blunt path substitution in step 6 had produced "the universal tier and `../flock-designer/standards/production-readiness.md` are no longer here" — a sentence saying a file at its new path is not at that path, twice over. The reader was reacting to something genuinely broken and reached for the nearest explanation. Fixed in `6cacfc74`; both sentences now say the two are deliberately absent and point at where they went. **Three tests, three defects — none of which the author could see from inside the work.** | Change log. Repo: `6cacfc74`. |
| 2026-09-28 | **Step 6’s content is complete; only the org transfer remains.** `standards/universal/` and `production-readiness.md` moved into the shared repository, Coke resolves them from `../flock-designer/standards/`, and `PLAN.md` moved in alongside them. **Verifying portability was the part that mattered:** the audit’s "zero product-specific references" claim came from grepping product names and was incomplete — validating the moved files caught two universal standards that called themselves product-agnostic while hard-linking to the Flock tier above them, plus a third reference form the substitution pass missed. All fixed; the universal tier now describes the tier relationship without knowing where it lives, which is what portability actually requires. **A consequence the plan had not stated: a `flock-coke` checkout alone no longer holds the accessibility floor or the view-state list, so the cold-start check now needs two checkouts.** Coke’s README says so and `validate.py` reports a missing shared checkout instead of failing silently, but it is a real increase in setup burden and step 8 owns it. `validate.py`: **1006 checks, 0 failures.** | Step 6, sequence row, both status blocks. Repos: `3d15ae9`, `82d6112d`, `6e0d469`. |
| 2026-09-28 | **Cold-start test on step 5 found a live contradiction I had created**, the same class step 4's test found: I corrected a false "generated from `src/` — fix the source and regenerate" claim in `.flkd/README.md` but left the identical claim standing in `.flkd/authoring/components.md`, the file it originated in. A fresh session got the right answer anyway, by citing the corrected file — luck of which file it trusted, not agreement across the repository. Also surfaced a real gap (composite components were undocumented) and, while fixing that, a second self-made confusion (two unrelated splits both labeled "two shapes"). All three fixed in `f03db25`. **This is now the pattern, not a one-off:** both cold-start tests run so far have each found one thing the author could not see from inside the work. | Step 5, sequence row. Repo: `f03db25`. |
| 2026-09-28 | **Step 5 closed on the local path; packaging becomes step 17, at the plan owner's direction** — "test with the local version first, and have a follow-up step at the end to bring this into the package." Two problems had been tangled together and only one defers. **Distribution** (sibling checkout now, package later) defers to [step 17](#42--ship-the-design-system-context-in-the-package-was-step-17). **Version match does not defer, and it already holds:** Coke has `5.5.4` installed, the manifest is stamped `5.5.4`, and every `FS*` name in every context file is verified against that manifest plus the installed type declarations, so the agent cannot name a component the product lacks. What is misaligned is FUI's own hygiene — that checkout's source is `5.5.8` — which is FUI's to fix and does not make the JSON wrong for a product pinned to an older version. **`validate.py` was over-scoped and is corrected** (`b8515fb`): it failed a consuming repo's build for a condition only the design system could fix, which is how checks get disabled. It now fails on `manifest == installed` and reports `manifest == source` as a NOTE — printed every run, never silent, never blocking; run without an installed package the NOTE becomes the failure, because there it is actionable. **998 checks, 0 failures.** Residual risk stated in step 5: hand-authored `.md` prose in an ahead checkout is unversioned and could describe newer behavior; names are covered, prose is not. New **step 17** carries the generator, the `cokeUsages` decision, and shipping `.flkd` — the plan is now 17 steps. | Step 5, new step 17, sequence table, both status blocks, intro step count. Repo: `b8515fb`. |
| 2026-09-28 | **Open: decision 1 is necessary but not sufficient, and step 5 cannot close without a piece nobody has built.** Tracing the version drift found that FUI’s JSON context **has no generator** — produced once in `0f25abd`, never regenerated, and nothing in that repository references `versionScannedFrom` except the manifest and the validator. Its README claimed the files are "generated from `src/`" and said to "fix the source and regenerate," which named a process that does not exist; corrected in `62f8748`. It also **could not** be regenerated from `src/` alone: 35 components carry a `cokeUsages` count sourced from scanning Coke, so the manifest is a cross-repository artifact. Three versions are live — manifest `5.5.4`, working branch `5.5.8`, `develop` `5.6.4`, Coke installed `5.5.4` — and the one that matches Coke does so by luck. **Decision 1 recommends shipping `.flkd` in the package; that makes staleness reliable rather than absent unless a generator exists first.** The spec for one is now in FUI’s README. **Needs: the Design System owner to decide whether Claude builds the generator, and what `cokeUsages` becomes.** Step 5 stays In progress — its "done when" requires the agent to read facts matching the installed version, and today that holds only by coincidence. | Step 5; decision 1 context. Repo: `62f8748`. |
| 2026-09-28 | **Cold-start check passed, and found a defect on its first run — step 4 is closed.** A fresh session in the `flock-coke` checkout, without these documents, answered all four questions from the repository alone with accurate file-and-line citations, and avoided both traps: Explore owes **the default state only**, and the FUI version resolves from `node_modules` or the lockfile rather than `package.json`'s range. **It also surfaced a contradiction step 5 had introduced:** step 5 reversed the FUI resolution order in `flock-react-component-lib` so the published package wins, but three files in `flock-coke` still said sibling-first and described the reversal as a *future* step 5 action. The fresh session faithfully reported the product repo's order, which the design-system repo now contradicted — the "a second definition of anything is a defect" failure, caught by the one test that exists to catch it. Fixed in `43635e32`. **This is the argument for running the check after every step, not once:** the defect was six hours old, invisible to `validate.py` (both statements were internally valid), and would have taught every future agent the wrong resolution order. | Step 4 and its sequence row; change log. Repo: `43635e32`. |
| 2026-09-28 | **Step 5 built; the half that needs a person is named.** FUI's `.flkd` described FUI to its consumers and said nothing about authoring it — the first thing the plan owner asked for and the one thing missing from 1,200 lines of plan. `.flkd/authoring/components.md` and `.flkd/authoring/stories.md` are written from the repository at `5.5.8`: the prop allowlist convention, what counts as breaking, the story shape and title groups, and the ESLint/Prettier-vs-Biome split between the repositories. Component gaps now have a destination in both repos. **The resolution rule is now enforced rather than described**, and the new check **fails today, correctly** — the FUI checkout's source is `5.5.8` while its generated context says `5.5.4`. That drift was pre-existing and silent; it is now visible and blocking, and it cannot be closed from here because the checkout cannot be both versions at once. The structural fix is decision 1, shipping `.flkd` in the package, which needs a release. Step 5 stays **In progress** rather than Complete, because its "done when" says the agent reads facts matching the installed version, and today it would not. | Step 5 and its sequence row; both status blocks; knowledge-layers `Implemented in:`. Repos: `a160edf`, `3a4f1f4c`. |
| 2026-09-28 | **Commit authorship corrected to the Flock Safety identity, at the plan owner's direction.** Two commits carried `noah.s@cheq.ai` as their **author** while the committer was `noah.shrader@flocksafety.com`, so each showed as two people. No `Co-Authored-By` trailers were involved — there are none anywhere. **`flock-coke` is fixed:** `f086e8d9` was re-authored and the four step-4 commits rebased onto it, all local, since `origin` was still four commits behind and nothing needed force-pushing. Trees verified byte-identical before and after, and `validate.py` still passes. Every step-4 hash in this document is updated: `f086e8d9`→`4538812e`, `f8c3e9a8`→`18a1eff4`, `f02536a6`→`f8baa387`, `b14d72ec`→`55a9853e`, `08879f5f`→`5096ad62`. **`flock-designer` is fixed too**, on the plan owner's go-ahead: `e2a9b7d` was re-authored to `d2afdfa` and force-pushed with `--force-with-lease`, since it is that repository's only commit and was already published. Tree hash verified identical before and after, and the remote was re-fetched and confirmed. A full-history sweep of all three repositories now finds **zero** commits carrying a `cheq.ai` address in either the author or committer field. `flock-react-component-lib` was checked and is clean. Local and global `user.email` are both correct now, so new commits are unaffected. | Step 2, step 4, sequence table, change log. |
| 2026-09-28 | **Step 4 done, pending review.** Every audit row is done or has a recorded reason. `validate.py` went from 867 checks with 10 failures to **988 checks, 0 failures**. Covering `composition/` and `product-patterns/`, which had been validated by nothing, exposed three claims that were quietly wrong — an `FSSwitch` FUI does not publish, a breadcrumb component that does not exist, and a deleted prototype path — and a fourth bug outside that: the agent's FUI query commands pointed at a directory that has never existed. The validator had two blind spots of its own, both fixed. Process now scales with the credibility level rather than demanding "all four states, every time"; the view-state list is one list of seven; accessibility gained per-level requirements, a ten-item manual checklist shared by the review record and the hardening report, and explicit "not run" and "a bypass is never a pass" rules; the implementation reviewer gained the accessibility lens it never had. All 18 contracts now carry an `Implemented in:` line. The cold-start check was verified by file inspection — **a live fresh-session run is still owed before the step is closed**. | Step 4 and its sequence row; both status blocks; every Part II contract heading. Repository: 4 commits in `flock-coke`, 1 in `flock-react-component-lib`. |
| 2026-09-28 | **Consolidated into one document, at the plan owner's direction** — the three files stated the same things three times, and the propagation rules between them made every small change cost three edits plus a change-log row. That maintenance burden, not the content, was the source of the repeated rewrites. `flock-designer-plan.md`, `flock-designer-context.md`, and `flock-designer-overview.md` are merged into **`flock-designer.md`** and archived under `.archive/`. **All 16 steps are kept**, with their status table and "done when" lines intact, because the step granularity is what makes progress trackable. Dropped as pure restatement: the overview's duplicate 16-step table, "How It Works, In Brief," "Start here," and "The Three Documents," plus the three-document authority and propagation tables, which have no purpose in a single file. Everything unique was carried over verbatim and verified line by line. New: **[Where this wins, and where it loses](#where-this-wins-and-where-it-loses)** — an honest comparison against Magic Patterns naming the three places Magic Patterns is genuinely better (time to first artifact, sharing, polish) and stating the bet this plan makes. Structure is now Part I what this is, II contracts, III the work, IV decision gates, V the Workspace application. | Everything. Verified: 16 steps present, 0 broken anchors. |
| 2026-09-28 | **Restructured so the agent-file model leads and the Workspace comes last, at the plan owner's direction** — the Electron app "is very important, but that should be the last thing." Nothing was deleted. **Part II — Architecture moved to the back as Part IV — The Workspace application**, with a note that it is built at step 13 after steps 1–12 prove the model without it; the work became Part II and decision gates Part III. `Git and iteration model` stayed forward in Part I, since branching applies with or without the app. **[Knowledge layers](#knowledge-layers) is now the first section of Part I** and opens with the actual architecture: `.flkd` agent files in the design system, in each product, and shared standards plus `projects/` in `flock-designer`, all under one dot-directory name. **Two real gaps filled:** the design system had no standards for authoring or changing components or for creating and adjusting stories — step 5 is widened from "fix how FUI facts are resolved" to "set up the design-system agent files" and now covers both; and the operating loop never said the agent opens or creates the project folder before retrieving anything, which it now does. **Two defects fixed:** `project folderet`, a botched find/replace of "context packet", in 5 places across all three documents; and the project folder's location, recorded as an open item last entry and now resolved to `flock-designer/projects/<project-id>/` in the context document's Vocabulary table and the overview, matching the plan. | Plan: part order and every Part cross-reference, knowledge layers, operating loop, step 5 and its sequence row. Context: Vocabulary, the plan's part list, design-system section, workspace link. Overview: "Where work lives," step 5, part links. |
| 2026-09-28 | **Step 3 complete — there was nothing to rename.** `proto/device-health-summary` in `flock-coke` was a local-only branch at `6bf0f1b8`, an ancestor of `noah/flock-designer` holding no unique commit, no prototype, and no remote copy, and `src/prototypes/device-health-summary/` **never existed on any branch or anywhere in history** — consistent with the context document's observed fact that there is no working end-to-end prototype example yet. The branch was **deleted rather than renamed**, because renaming it to `fd/device-health-summary/i1` would have created an iteration branch containing no iteration; `6bf0f1b8` stays reachable as an ancestor and the branch is recreatable from it. Also corrected two stale references found while doing this: the sequence table still cited step 2 as `083cad60` after the amend to `4538812e`, and the audit's "Existing work" row said step 7 would do the rename rather than step 3. | Plan: step 3, sequence table rows 2 and 3, both "Where we are" blocks, audit "Existing work" row. Context: "What exists today." Overview: "Start here." |
| 2026-09-28 | **Open — now resolved, see the entry above. The project folder location was stated two different ways across the set.** The 2026-09-28 intake-simplification entry moved the project folder to `flocksafety/flock-designer/projects/<project-id>/` and says so throughout the plan, but the **context document's Vocabulary table and the overview's "Where work lives" still say `.flkd/projects/<project-id>/`** — the branch-local location that entry replaced. The context document is authoritative for vocabulary, so the set currently contradicts itself on a term the plan calls out as needing propagation everywhere. Found while doing step 3; not fixed here because it is step 3's neighbour rather than its content, and the context document asks for a person before its definitions change. **Resolved the same day:** the plan owner's description of the architecture confirmed `flock-designer/projects/<project-id>/` as the intended home, and it was propagated to the context document's Vocabulary table and the overview. | Closed by the restructure entry above. |
| 2026-09-28 | **This file was found empty (0 bytes)**, almost certainly from an iCloud sync conflict triggered by two rapid successive writes to this path in the previous edit. No copy existed in Trash, iCloud's trash, or a local Time Machine snapshot. Reconstructed from a full backup taken immediately before the step-restructure edit, replayed forward through the exact transformations recorded in this session (the restructure into 16 steps, the project-folder simplification, and the step 6 push), each verified against the same checks used when originally applied — link resolution, step count, wording sweeps. Believed complete; flagged here so a discrepancy anyone notices later has an explanation. | All of Part III; scattered wording throughout Parts I, II, and IV. |
| 2026-09-28 | **Co-authorship attribution removed, at the plan owner's direction.** The commit in `flock-designer` (`31a964d` → `e2a9b7d`, later `d2afdfa`) and the commit in `flock-coke` (`083cad60` → `f086e8d9`, later `4538812e`) were both amended to drop the `Co-Authored-By` trailer, and `flock-designer` was force-pushed. Every hash reference in this document is updated to match. No commits go out with that trailer from here on. | Plan: step 2, step 6, sequence table. |
| 2026-09-28 | **Step 6 pushed, at the plan owner's direction.** `noahshrader-flock` cannot create repositories in the `flocksafety` org, so `flock-designer` was created and pushed under the personal account instead of staying local, since a personal-to-org transfer keeps full history and is a one-step GitHub operation. Live at `noahshrader-flock/flock-designer`, branch `noah/flock-designer`, `31a964d`. Every reference to `flocksafety/flock-designer` in these documents means this repository at whichever address it currently has; the pending transfer is housekeeping, not a plan change. | Plan: step 6, sequence table, both "Where we are" blocks. |
| 2026-09-28 | **Intake simplified and step 1 closed, at the plan owner's direction** — "we are making this way more formal than it needs to be." Context is now just a folder: `flocksafety/flock-designer/projects/<project-id>/`, where whatever already exists gets dropped in, in whatever form it exists, with `_template.md` as an optional prompt rather than a form. The agent's records — brief, receipt, review, decisions — land in the same folder, so a project is one place and has a home before any code is written. **This replaces the branch-local context pack** in `.flkd/projects/`, which meant picking up work required knowing which branch to check out and needed a standing rule to keep project state out of `develop`; both problems disappear rather than needing enforcement, and the step-14 `flock-design-knowledge` proposal collapses into this. **Step 1 is complete:** the contracts count as approved by having been revised throughout, owners are named as needed rather than in advance, the planning documents move into `flock-designer`, and baselines are a file to fill rather than a gate. **Step 6 is built** at `31a964d` and blocked only on `noahshrader-flock` lacking repository-creation permission in the `flocksafety` org. | Plan: Part I project folder (was the context pack) and 20 references to it; steps 1 and 6; sequence table; both "Where we are" blocks; Part IV project-memory gate. |
| 2026-09-28 | **Part III restructured into one numbered sequence, at the plan owner's direction** — "I have no idea where we are." The four parallel tracks (I, R, P, W) and their phase IDs are gone; the work is now **16 steps, done in order**, each naming who does it and what "done" means. A **Where we are** block sits at the top of the document and at the head of Part III. Mapping: I0→1, the I0 files→2, R0 rename→3, I1 Coke audit→4, I1 FUI→5, I1 shared repo→6, R0 harness→7, R1→8, P1→9, P2→10, the R3 decision→11, R2→12, W1→13, W2→14, W3→15, W4→16; the learning loop and the managed harness sit outside the sequence, one continuous and one conditional. Detail the steps link to — the four decisions, the audit, the deferred list, the harness contract — moved to a **Reference** section at the end of Part III so the sequence stays scannable. Every phase ID in all three documents is now a step number. Nothing was cut. | Plan: document intro, maintenance rules, Part I and II step references, all of Part III, Part IV "Gate by" column. Overview: delivery section, "Start here." Context: prototype-branch note. |
| 2026-09-28 | **Request guide simplified, at the plan owner's direction.** It was written as a template to follow; a request actually arrives in whatever form the thinking already exists in — a PRD, a one-pager, a Figma file, a thread, or a sentence. Replaced the design-agent framing ("the decision you're trying to make," "the closest existing screen") with the product-spec vocabulary people already have written down: the problem, the opportunity, what success looks like, current thinking, inspiration, what is already decided, and how finished it needs to be. The brief still names a decision — the request leads with the problem, and framing turns it into the decision, which the section now states so the matrix's Brief row and this list are not read as disagreeing. The repository file dropped from 65 lines to 44. **Verified:** all 39 files in `flock-coke`'s `.flkd`, `.claude`, and related roots are named somewhere in the I1 audit; nothing on disk is unaccounted for. | Plan: Part I request guide, with an `Implemented in:` line. Repository: `.flkd/request-guide.md`. |
| 2026-09-28 | **I0 started.** Claude's three I0 files are committed to `flock-coke` `noah/flock-designer` at `083cad60`: the request guide, the baselines file, and the setup-friction log. **Settled:** the shared repository is `flocksafety/flock-designer`, and both repositories keep working on the `noah/flock-designer` branch. **New observed fact, and a correction to this plan:** `validate.py` does not pass today — 10 failures at `6bf0f1b8`, before any change here — because its file list misses `composition/` and `product-patterns/`, leaving 9 files unchecked, and because 8 bare-filename cross-references resolve nowhere. Earlier entries assumed it was green. Recorded as an I1 audit row. **Open:** phase owners, the baseline numbers, and where these three planning documents live are still outstanding, and I1 should not start until the contracts are confirmed. | Plan: intelligence phase table; I0; knowledge audit table. |
| 2026-09-28 | **Simplification pass, requested by the plan owner.** The Intelligence plan goes from five phases to three: old I2 (design-system context) and the essential part of old I3 (contract checks) fold into I1 as sections, and old I4 becomes I2. P1 now depends on I1 and R0 only, so the first real prototype is four rows down the line-up rather than five, and validators are no longer built before the system has been used. Everything cut is recorded in a new **[Deliberately deferred](#deliberately-deferred)** table with the trigger that brings it back, rather than dropped: contract checks beyond the FUI version check, three separate skill files, a file-by-file FUI audit, moving the agents and skills into the shared repository, the CODEOWNERS co-owner, publishing the package, the Coke-side validator, and the separate location map. The shared `flock-designer` repository is still created in I1 — the plan owner's call, so the three layers can be shown connected — but scoped to the 446 lines that carry no product-specific reference. | Plan: Part III intro; line-up table; intelligence phase table, capability table, I1, I2, deferred table; decision 4; audit rows for skills and the README tree; P1 and P2 dependencies; R1, W3; costs paragraph; Part IV gate. Overview: line-up, "Start here." |
| 2026-09-28 | **Decided (recommendations recorded, pending I0 confirmation):** (1) FUI ships `.flkd` in its published package, resolved before any sibling checkout; (2) one seven-state view-state list lives in `interaction-states.md`, adding Partial, with the plan linking to it; (3) `FLOCK-DESIGNER-EVALUATION.md` is retired after its verified observations move to the context document and its reliability section to I3; (4) the shared `flock-designer` repository is adopted as a three-layer model — shared repository, FUI `.flkd`, product `.flkd` — created in I1 and published as a package at I3 exit or the second adopting product, and explicitly not a per-designer tool plugin. New observed facts from measuring `flock-coke` at `6bf0f1b8`: `standards/universal/` (385 lines) and `production-readiness.md` (61 lines) contain zero product-specific references; the agents, skills, and `non-negotiables.md` carry 2–15 each across 637 lines. | Plan: knowledge layers; how deep each file should go; I0 decisions; I1 audit intro and four rows; I2 validator ownership; Part IV new gate. Overview: "Start here." |
| 2026-09-27 | **Requested by the plan owner:** the Intelligence plan is now only about getting the agent files, skills, and standards right in both repositories: I0 Decide the rules, I1 Product repository context (the Coke audit, plus a new location map), I2 Design-system repository context (a full FUI audit, and version-locked FUI resolution), I3 Contract checks, I4 The learning loop. Using the system on real decisions moved to a new **Proof track**, led by the plan owner: P1 Real decisions in the repository (was I1) and P2 Handoff by hand (was the second half of I2). Validators split: contract-required checks are I3; gap-driven checks wait for I4. R1 no longer waits for the proofs; only its closing R3 decision does. New observed consequence: a sibling FUI checkout on its default branch describes a newer FUI than Coke installs, so the resolution path must be version-locked. The audit could not be re-verified this session because neither repository is checked out on this machine. | Plan: intro, Part III intro, line-up table, Intelligence plan, Proof track (new), Runtime R0/R1, Workspace W1/W3, cost section, Part IV gates, open questions, maintenance table. Overview: borrowing table, delivery section, Start here, not-yet table. Context: R3 paragraph. |
| 2026-09-27 | **Requested by the plan owner:** I0 now includes a file-by-file repository context audit of `flock-coke` `.flkd`, agents, skills, and standards (at `6bf0f1b8`) and the FUI side (at `1b54b48`), with a rule for how deep each file goes and four decisions it raises. I0 and I1 now split work into "Set up by Claude" and "Done by Noah." New observed facts: the published FUI `5.5.4` package does not ship `.flkd`; the agent's FUI query path points at a missing `agent/` directory; the implementation reviewer has no accessibility lens; no `.flkd` file yet mentions credibility levels, the brief, the context receipt, `review.md`, or the context pack. | Plan: I0, I1, intelligence phase table. Overview: "Start here." |
| 2026-09-27 | **Requested by the plan owner:** replaced the single Stage 0–6 ladder and Track H with three implementation plans — Intelligence (I0–I3), Runtime (R0–R3), Workspace (W1–W4) — each with its own phase table, dependencies, exits, and status, plus a line-up table that keeps the original delivery order. Moved Architecture ahead of the implementation plan so all context comes first. Mapping: Stage 0 → I0 + R0; Stage 1 → I1; Stage 2 → I2 (validators, handoff by hand) + R1 (design mode, harness decision); Stage 3 → W1 + R2; Stage 4 → W2; Stage 5 → W3, with its learning-loop rules split into a new I3; Stage 6 → W4; Track H → R3. New wording: exit criteria for R2 and I3. | Plan: intro, maintenance tables, Part I phase references, Part II (was III), Part III (new), Part IV "Gate by" column, open questions. Overview: delivery section, "Start here," "not being built yet," phase references. Context: phase references and links. |
| 2026-09-27 | **Approved:** all project records live in the context pack, the prototype directory holds source only, and review evidence is one `review.md`. **Approved:** the first handoff test is in Stage 2, by hand, before any Workspace. **Decided:** no mandated templates. Replaced them with one request guide — guidance on what information helps, which the agent also uses to decide what to ask. Designers never fill in forms; the agent writes the records. Dropped `project.md` and moved its facts into `brief.md` and `context-receipt.md`. | Plan: request guide added; operating loop step 1; artifact matrix Brief row; context pack; Stage 0, 2, 5; ladder; maintenance tables. Overview: ladder, "Start here." |
| 2026-09-27 | Added maintenance and propagation rules, including the rule that implemented contracts in the repository take precedence. Defined the context pack layout and moved all records out of the prototype source directory. Merged the evidence and accessibility receipts into one review record. Made the artifact matrix satisfiable before Stage 4. Added a Stage 0 step to implement the contracts in the product repository, where the agent actually reads them, and a Stage 0 decision on where these planning documents live. Moved the first handoff test to Stage 2 so engineering sees one before any Workspace is built. Added stage status and stage owners. Narrowed Stage 0 decisions to team-only agreement. | Plan: maintenance section, Part I, Part II, Part III, Part IV. Overview and context: aligned to match. |
| 2026-09-27 | Consolidated the separate intelligence, runtime, workspace, and technical-assessment documents into this plan, organized as contracts, then sequence, then architecture, then gates. | All |

