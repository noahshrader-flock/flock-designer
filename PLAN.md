# Flock Designer

Updated 2026-09-28. **This is the only Flock Designer document.** It replaced the separate plan,
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
> **Steps 1–7 are complete. Step 8 is next.**
>
> Everything needing org or release permission — the shared repo's transfer to `flocksafety`, the FUI
> context generator, shipping `.flkd` in the package — is collected in
> **[step 17](#step-17--ship-the-design-system-context-in-the-package)** so it does not block the work
> in front of it.
>
> Step 6 is live at `noahshrader-flock/flock-designer` and waiting on an org transfer to
> `flocksafety/flock-designer` — a one-step move once someone with permission does it. Nothing else
> is blocked by that.
>
> Go straight to **[the sequence](#the-sequence)** — that is the working list. Everything before it
> is reference you consult while doing a step, not reading you do first.

- **[Part I — What this is](#part-i--what-this-is)**: purpose, principles, vocabulary, the four credibility levels, the evidence model, how this compares to Magic Patterns, and what exists today.
- **[Part II — Contracts](#part-ii--contracts)**: what must be true throughout — the architecture, how the agent behaves, where code and records live, how review and handoff work. Reference, consulted while working.
- **[Part III — The work](#part-iii--the-work)**: one numbered sequence of 17 steps. Do a step, see the result, move to the next.
- **[Part IV — Decision gates](#part-iv--decision-gates)**: every organizational confirmation, its recommendation, its owner, and the step by which it must close.
- **[Part V — The Workspace application](#part-v--the-workspace-application)**: the Electron app. **Last on purpose** — built at step 13, after steps 1–12 prove the workflow without it.

**Why the order is what it is.** The agent's context comes first because it is what everything else
orchestrates: if a designer working in a checkout with nothing but the agent and `.flkd` cannot get a
good result, no application will rescue it. The cheapest steps produce the evidence that justifies
the expensive ones, and the first line of application code is not written until the workflow has been
proved without it.

## How to maintain this document

- **The repository is the real artifact.** When a contract is implemented, add an `Implemented in:` line under its heading with the repository path. From then on the repository file is authoritative and this document describes it.
- A change to an implemented contract goes through a repository PR. Update this document once the PR is approved. A change proposed here is not in effect until the matching PR lands.
- If the two disagree and nobody approved the difference, treat the repository as current and flag the divergence. Do not silently edit either one to match the other.
- **If building reveals this document is wrong, do not work around it silently.** Record the conflict in the [change log](#change-log) prefixed **Open:**, say what was found, and ask.
- After any change: add a [change log](#change-log) row, and check that the [sequence](#the-sequence) table, the "Where we are" block, and the step's "done when" still agree.

**An agent may, without asking:** fix a broken link or typo; replace a duplicated restatement with a
link; propagate a change a person has already approved; update a step's status when its "done when"
is met and the evidence can be cited; record a new observed fact with its source.

**An agent must ask first:** to change a contract, a step's order or meaning, a decision gate's
recommendation, the accessibility target, or anything in Part I's purpose, principles, or non-goals.

---

# Part I — What this is

## Purpose

Flock Designer helps designers contribute directly to Flock product code while preserving the context, safety boundaries, and human judgment that production work requires.

It creates a continuous path from a product question to a reviewable prototype, an internal preview, and an engineering handoff. The artifact becomes more credible as the decision needs it to be. It never quietly becomes production code because it happens to be written in React.

## Principles

- **Repository first.** Working in the product checkout is the default mechanism, not a fallback. Product context, standards, source, prototype records, and handoff artifacts live in Git with the code they describe.
- **Designers contribute code.** The path to more designers contributing is to make the real product easier to run, before considering a substitute for it.
- **Reuse before invention.** Existing FUI components and product patterns are the default. Intentional divergence is stated and tested.
- **Progressive credibility.** Explore quickly, ground the work in real context, test behavior when it matters, and hand off deliberately. Process weight scales with the level, not uniformly.
- **Prototype safely.** Prototypes use local mock data and do not wire production auth, APIs, state, flags, telemetry, routes, or permissions.
- **Build accessible by default.** Accessibility is a non-overridable floor. The agent follows the repository's declared target, tests affected states, and makes any gap visible rather than calling a prototype ready by assumption.
- **Keep humans responsible.** Agent output, comments, and review evidence can propose changes; product, Design System, and engineering owners approve shared standards.
- **Retain useful context.** Project memory preserves one initiative. Repeated lessons are promoted into `.flkd` only through a reviewable patch or PR.
- **Earn each layer.** Nothing is built until the layer beneath it has produced evidence that it works.

## Repository-first operating principle

Flock Designer operates inside the product repository. The local agent instructions, `.flkd` standards, product patterns, FUI resolution, safe-import rules, prototype code, and review receipts remain versioned with the product they describe. That proximity is a feature: the agent works against the same components, constraints, and source history as engineering.

A future internal workbench may help people frame requests, select context, view a running artifact, or collect feedback. It must coordinate this repository-native workflow, not replace it with a detached design sandbox or a second source of truth.

It must also make code contribution available to more designers, and the cheapest way to do that is to make the real product easier to run rather than to build a substitute for it. The observed barrier on Coke is not the repository; it is the backend dependency. The `noah/local-design-mode` branch already removes that barrier with MSW-backed `npm run start:design`. Stabilizing that path is therefore the first answer to "a designer cannot run the product locally," and it is far smaller than building a near-replica generator.

A managed harness — a smaller React/FUI runtime created from an authorized GitHub source at a pinned revision, carrying the same relevant `.flkd` and resolved FUI context — remains a designed option for cases that stabilized design mode does not solve. It is deliberately **the managed harness, a conditional runtime phase** rather than a committed one: it opens only if step 9 and step 8 produce evidence that local setup is still blocking real designers. See the [plan's the managed harness](#if-step-11-says-yes-the-managed-harness). If a managed harness is built, it preserves project memory, produces Git-backed artifacts, and can be promoted to a linked direct-repo branch through an explicit transfer manifest; it is never merged into product source automatically.

## The three connected parts

Flock Designer has three connected parts.

### 1. An internal design workflow

The team starts with a decision to make, not a blank screen: a problem, user, current product context, desired behavior, and the uncertainty worth reducing. Flock Designer turns that into the smallest useful flow, not a speculative whole product.

### 2. Context that makes the output recognizably Flock

The agent retrieves the applicable FUI components and tokens, the current product’s layout and interaction patterns, safe implementation boundaries, and reference views. It should prefer a known pattern, explain a deliberate deviation, and leave a receipt of its sources.

### 3. A safe local runtime

The work can render and be reviewed with mock data and realistic states without touching production routes, APIs, auth, feature flags, analytics, or the Redux store. Where shell placement matters, a separate design mode can run the real app against explicit fixtures.

## What it is not

- A replacement for product design, frontend engineering, Figma, or design review.
- A general-purpose Magic Patterns clone or a new visual-canvas product.
- A Figma-to-code conversion promise. Figma and FigJam are read as reference links and exported images only.
- A way to skip security, accessibility, data, permission, or engineering review.
- A second source of truth for product patterns, design-system rules, or source code.

## Guardrails

- Do not substitute generated output for product, design, or engineering judgment.
- Do not require every early idea to be production-like.
- Do not add product routes, APIs, store state, auth, flags, analytics, or telemetry merely to make a prototype feel real.
- Do not let an attractive mock hide unmodeled states, permissions, or data constraints.
- Do not treat Figma-to-code as a one-way automatic translation.
- Do not make generic visual sameness the goal; preserve a shared Flock language while allowing intentional, domain-specific variation.

## The future process

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

## Vocabulary

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

## The four credibility levels

Use four named credibility levels. They describe the work, not the job title of the person making it.

| Level | Purpose | Required grounding | Typical output |
|---|---|---|---|
| Explore | Make an idea discussable | Brief, reference images, light Flock context | One or more rough directions |
| Ground | Decide whether a direction belongs in Flock | Relevant FUI components, tokens, current product references, pattern choice | Flock-native view or small flow |
| Test | Learn from behavior | Local mock data, key interactions, loading/empty/error/success states | Clickable prototype and review evidence |
| Handoff | Prepare a decision for engineering | Route/shell placement, constraints, source receipts, known gaps | Implementation brief and, where appropriate, a clean candidate branch; not an automatic merge |

An idea may stop at Explore. A customer-facing concept may need Test. Handoff does not make prototype code production code.

Each level also carries a different amount of process. Explore is deliberately almost ceremony-free so a fast idea stays fast; only Handoff requires the full evidence set. The [Plan's required-artifact matrix](#required-artifacts-by-credibility-level) is the single definition of what each level owes, and it is what protects the "one working session" promise from being crushed by its own paperwork.

## What the team has said

### Observed facts

- The Flock Design FigJam frames the design vision as one coherent product ecosystem with shared foundations, while allowing intentional divergence where user needs differ.
- The FigJam calls for shared visual language, components and patterns, interaction behavior, and content and voice. It explicitly notes that different products can have different density, navigation, and product-specific vocabulary.
- The Ways of Working map distinguishes an early, leadership-prioritized exploration path from ongoing execution work. It describes Flock Designer as a possible future process in the explore-to-handoff span.
- In the September 22 internal discussion, the team drew a useful distinction between prototyping for alignment and prototyping for output. The desired future is not two disconnected workflows: an early idea can remain fast while becoming increasingly grounded and credible as it matures.
- The local Flock Designer implementation already contains real FUI and Coke context, prototype boundaries, two read-only review modes, and a gap log. It does not yet contain a working end-to-end prototype example.
- The current accessibility program’s goal and recent evaluation scope are WCAG 2.2 A/AA, but its formal company target remains open pending Compliance confirmation. The WCAG Tracker is the finding-level source of truth; passing external validation is the closure signal.
- Coke already carries accessibility guidance and `axe-core`/`cypress-axe`, but its Designer manifest and Cypress command currently enforce WCAG 2.0 A (`wcag2a`). This is an observed configuration gap, not evidence of WCAG 2.2 conformance.

### Supported inference

The product to build is a progressive-credibility workflow. The question is not, “is this prototype production-ready?” The question is, “what decision is this prototype meant to support, and what evidence is required for that decision?”

## The evidence model

Flock Designer should never blur these categories:

| Category | Meaning | Example |
|---|---|---|
| Observed fact | Directly found in code, a decision record, or a verified reference | Coke uses `FSDataGrid` in distinct card-list and paginated-table modes |
| Supported inference | A reasonable conclusion drawn from multiple facts | A generic agent needs Coke context in addition to FUI context |
| Proposal | A choice the team may adopt and test | Use a four-level credibility model for prototype work |
| Open question | A decision or missing evidence that needs an owner | Which fixture source should own long-lived design-mode data, and who refreshes it? |

The output should link major UI choices to an observed pattern, a design-system rule, or a clearly labeled proposal. This is how it stays useful without pretending to be certain.

## Magic Patterns, honestly

Magic Patterns is useful as a benchmark for the user experience of AI-assisted prototyping, not as a product specification or a target to clone.

### Observed facts from Magic Patterns

Its public material describes a flow in which teams:

1. Start from a prompt, brief, user story, screenshot, or Figma reference.
2. Ground generation in a reusable design system, design files, and optionally repository context.
3. Generate and refine interactive code-backed screens or a small flow.
4. Review and collaborate around the same prototype.
5. Export or hand approved intent into engineering tools.

It also treats the design system as more than colors: components, tokens, rules, examples, and product context are reusable input to every generation. [AI Prototype Generator](https://www.magicpatterns.com/product/ai-prototype-generator), [Using Your Design System](https://www.magicpatterns.com/blog/introducing-design-systems), [AI prototyping course](https://www.magicpatterns.com/docs/documentation/ai-prototyping-course/introduction)

### What Flock should borrow

- Start from the smallest decision-bearing flow, not a giant prompt.
- Make system and product context reusable rather than re-pasted on every request.
- Keep iteration attached to a live artifact rather than recreating static images.
- Give reviewers something they can click through, comment on, and compare with a known product pattern.
- Carry approved decisions, unresolved questions, and implementation gaps forward.

### What Flock should not borrow blindly

- A general-purpose multi-tenant design application is not the first problem to solve.
- Flock does not need a broad visual-editor clone before proving its internal workflow.
- Generic design-system import is weaker than the FUI and Coke-specific context already available locally.
- “Production-ready code” is not an acceptable default promise in a product with real auth, API, permissions, telemetry, and routing concerns.

### The Flock advantage

Flock already has ingredients a generic tool must reconstruct: a real component library, versioned usage guidance, existing frontend code, product-specific patterns, prototype safety rules, and people who can judge the result. The opportunity is to make those ingredients easy to invoke in one coherent flow.

### Where this wins, and where it loses

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

- **Time to first artifact.** Magic Patterns is a URL. Flock Designer needs a checkout that runs. This is the single largest risk to adoption, it is what [step 8](#step-8--make-the-product-runnable-on-mock-data) exists to fix, and [step 11](#step-11--decide-if-the-managed-harness-is-needed) is the fallback if step 8 is not enough.
- **Sharing.** Magic Patterns gives a link immediately. Flock Designer has no shared preview until [step 14](#step-14--workspace-shared-review); until then review is live against a local preview. That is a genuine gap, not a deferral of something unimportant.
- **Polish of the loop.** A funded product team has iterated on that experience for years. Steps 12 and 13 narrow it; they will not close it.

**The bet this plan makes:** for a real product decision, fidelity and continuity matter more than
the first thirty seconds. A prototype built from the installed components, in the real shell, that an
engineer can continue from, is worth more than one that looks right and has to be rebuilt. If
[step 9](#step-9--prove-it-on-real-decisions) shows that bet is wrong — that designers would rather
have something fast and disposable — that is a finding worth having early, and it is why step 9 comes
before any application code.

### What we are borrowing

"Not a Magic Patterns competitor" is easier to say than to hold, so this names exactly what we take. Four functions:

| Function | Why it helps | Where it lands |
|---|---|---|
| Reusable, configured context instead of re-pasted prompts | The design system and product patterns become input to every generation | step 4 and the learning loop, across the shared, design-system, and product layers |
| Iteration attached to a live artifact | Feedback refers to something clickable, not a static frame | step 9 locally; step 13 in Workspace |
| Review and comment around that same artifact | The collaboration function the design team is actually missing today | step 14 |
| Carrying approved intent into engineering | Decisions and open questions survive the handoff | step 10 by hand; step 15 in Workspace |

What we are not taking: the multi-tenant application, the visual canvas editor, generic design-system import, and the "production-ready" framing.

## What exists today

### Product context in `flock-coke`

The `noah/flock-designer` branch contains durable `.flkd` context for product patterns, composition, safe imports, prototype boundaries, agent instructions, and gap logging. `CLAUDE.md` routes relevant requests into the Designer workflow. Prototypes are intended to live under `src/prototypes/` and are deliberately isolated from production plumbing — today that directory holds only its `README.md`. The branch's original `proto/<name>` convention is superseded by the project-keyed `fd/<project-id>/iN` scheme defined in Vocabulary. **Step 3 closed this on 2026-09-28 with nothing to rename:** the one `proto/<name>` branch, `proto/device-health-summary`, was a local-only pointer at an ancestor commit holding no prototype, and the matching `src/prototypes/device-health-summary/` had never existed on any branch — consistent with the observed fact above that there is no working end-to-end prototype example yet. The branch was deleted; no `proto/<name>` branch or directory remains.

### Design-system context in `flock-react-component-lib`

The FUI `.flkd` directory contains an inventory of 133 `FS*` components, token data, deprecations, usage guidance, examples, and a validator. This is unusually valuable context, but it must be resolved against the app’s installed FUI version; the sibling library can be ahead of Coke.

**What it does not yet contain: standards for working *in* the library.** Everything there describes FUI for a consumer. The standards for authoring and changing components, and for creating and adjusting stories, do not exist as agent files today. That is the design system’s own layer, and [step 5](#step-5--set-up-the-design-system-agent-files) adds it.

### Runtime foundations

The Designer branch supports a prototype harness concept. A separate `noah/local-design-mode` branch adds MSW-backed `npm run start:design`, intended to run the real shell without Crown or Tanqueray. The two approaches are complementary but not yet integrated.

---

# Part II — Contracts

These hold at every step. Each is defined exactly once, here.

## Knowledge layers

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

**The shared layer is a repository first and a package later.** It is created in [step 4](#step-4--fix-the-product-repository-files), holding the standards that carry no product-specific reference, and a product resolves it from a sibling checkout exactly as FUI context resolves today. A CODEOWNERS co-owner and a published package follow when promotions start changing the standards and when a second product adopts them. Published, it declares FUI as a peer dependency and resolves FUI's context, so a product installs one thing and the agent keeps one resolution order. It is not a per-designer tool plugin: Workspace invokes an agent against a checkout, and context that exists only on one machine is not there for Workspace, for CI, or for another engineer.

**A shared file states the rule; the product holds the instances.** The same rule then serves every product, and the product's `manifest.md` and `implementation/` supply what is true of it. Reasoning about the split belongs to [decision 4](#decisions-the-audit-raises).

## The agent contract

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

## The operating loop

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

### 1. Frame before building

Turn a vague request into a brief that captures the user and job to be done; the decision to make and what would change it; the current product surface or nearest reference; the requested credibility level; required interaction and states; known constraints, open questions, and non-goals; and the change boundary — which files, components, routes, states, and interaction paths are in scope.

The designer does not fill in a form. They share whatever they have, and the agent writes `brief.md` from it, using the [request guide](#the-request-guide) to ask only for the missing pieces that would change what it builds. The designer confirms the brief before the agent builds. Do not force a long discovery ritual for a small request: an Explore request may need nothing more than the decision and a reference screen.

### 2. Retrieve a bounded context packet

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

### 3. Choose before inventing

1. Reuse an existing product pattern.
2. Adapt an existing pattern when the user/job differs but the interaction model still fits.
3. Propose a new pattern only when the old ones do not solve the problem.
4. Record why the new pattern exists and what should be tested before it is promoted.

This follows the FigJam's principle of shared foundations with intentional divergence. "Flock-native" should never mean flattening every product into the same visual density or navigation model.

### 4. Build proportionate to the decision

Do not make a Test artifact when an Explore artifact answers the question, and do not present an Explore artifact as proof of feasibility.

## The request guide

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
| **How finished it needs to be** | Sets the credibility level, and with it how much process comes along |

If a request carries only one thing, the problem is the most useful one. Where the requester already
knows the specific question to answer — "toolbar or side panel?" — that scopes the build tightest,
and the agent should ask for it when it is not obvious.

**The brief still names a decision.** The request leads with the problem because that is what people
actually have written down; the agent's job in [framing](#1-frame-before-building) is to turn it into
the decision the prototype will answer. That is why the matrix's Brief row asks for a decision and a
reference while this list asks for a problem — they are the two ends of the same step, not a
disagreement.

## Required artifacts by credibility level

**Implemented in:** `flock-coke/.flkd/manifest.md` — "Credibility levels"; per-level tables in `standards/universal/accessibility.md` and `standards/universal/interaction-states.md`.

The single definition of what each level owes. It exists to keep Explore genuinely fast: process is added as the decision gets heavier, not applied uniformly.

| Artifact | Explore | Ground | Test | Handoff |
|---|---|---|---|---|
| Brief | The decision and a reference, in a sentence or two | Written by the agent from the request guide; confirmed by the designer | Same, plus the states and interactions to test | Same, plus the constraints engineering must know |
| Change boundary declared | — | Required | Required | Required |
| Context receipt | — | Required | Required | Required |
| Mock data declared | Inline is fine | Required, explicit file | Required, explicit file | Required, with data contract |
| States built | Default only | Default plus the one state that carries the decision | Every decision-relevant state | Every decision-relevant state |
| Product parity review | Optional | Required | Required | Required |
| Implementation review | — | Required | Required | Required |
| Accessibility section of the review record | — | Required | Required | Required |
| Project memory | — | Project folder created | Project folder maintained | Project folder complete |
| Draft PR and shared preview | — | Optional | Required | Required |
| Hardening and accessibility report | — | — | — | Required |
| Transfer or rewrite plan | — | — | — | Required |

An Explore artifact that arrives with a brief, a running screen, and stated assumptions is complete. Asking it for a context receipt and two reviews is how this workflow dies of its own weight.

**Before step 14**, two rows are satisfied locally. A local preview reviewed live, in person or by screen share, stands in for the draft PR and shared preview. The [project folder](#the-project-folder) *is* project memory; from step 14 it is also copied into the shared project record. No requirement in this matrix depends on something that does not yet exist at the phase where it applies.

Both reviews, their evidence, and the accessibility section are written to one file: the [review record](#the-review-record).

The four credibility levels themselves — Explore, Ground, Test, Handoff — are defined in [the four credibility levels](#the-four-credibility-levels).

## The prototype directory

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

## The project folder

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

## Git and iteration model

**Implemented in:** `flock-coke/.flkd/manifest.md` — "Prototype configuration"; enforced in `.flkd/agents/implementation-reviewer.md`.

- Start from the selected baseline and create a project namespace only after confirmation: `fd/<project-id>/i1`, `fd/<project-id>/i2`, and so on.
- Each iteration branch is created from the prior selected iteration, not from an opaque app snapshot. The relationship is visible in Git.
- Prefer an optional Git worktree for isolation if the primary checkout is busy; it remains a real checkout, not an app-private copy.
- An iteration record contains the branch, commit SHA, label, brief and context-receipt hash, preview URL and status, review summary, and decision note.
- A project has one draft PR, retargeted to the current iteration branch.
- Prototype branches do not merge to product `develop` by default. Code hardening starts `fd/<project-id>/handoff` from the approved iteration.
- Retain prototype iteration branches as durable project history. Preview deployments may expire; retain their URL, commit, status, and rebuild instructions.
- Keep the project folder, source, review exports, captures, and handoff in Git indefinitely so another designer or engineer can continue without Electron. Restrict them to authorized code, approved assets, and mock, synthetic, or approved anonymized data.
- Because branches are retained indefinitely and never merge, prototype history in the product repository grows without bound. This is acceptable at pilot scale and is listed as an open question rather than settled here.

## The two runtime modes

**Implemented in:** **Not yet** — step 8 ports the mock-data path. `flock-coke/.flkd/manifest.md` records honestly that the shell render is unconfirmed.

Two modes, not forced into one. Both produce reviewable evidence; neither is production.

**Prototype harness** — the workhorse. The fastest, safest place to shape a view or thin flow, using the directory contract above.

**Real-shell design mode** — for Test work when the question is about a real app surface: shell placement, navigation, surrounding density, or page-level behavior. Also the standard way a designer runs the product at all.

- Start only through a development-only environment flag.
- Intercept app data with MSW and make the fixture source visible.
- Do not send production application data, analytics, or telemetry merely to make a view run.
- Allow harmless assets to bypass only if that does not mask an app-data request.
- Make unhandled application requests visible once the base fixture set stabilizes.

**Design mode is also the answer to a second problem.** The stated barrier to more designers contributing code is that they cannot run the product locally. On Coke the blocker is the backend dependency, not the repository, and `npm run start:design` removes exactly that. Stabilizing design mode is therefore both a fidelity feature and the cheapest available fix for designer onboarding — which is why it is step 8, ahead of any application work, and why the managed harness is conditional rather than committed.

## States are runtime, not decoration

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

## The review model

**Implemented in:** `flock-coke/.flkd/agents/product-parity-reviewer.md` and `.flkd/agents/implementation-reviewer.md`, including the implementation accessibility lens.

Two reviewer agents, three lenses. Accessibility is a lens applied inside both, not a third agent:

- **Product parity review:** Does this belong in the product? Are hierarchy, density, patterns, states, language, and interaction appropriate? Accessibility lens: is information conveyed by more than color, is the reading and focus order sensible, does the copy work as an accessible name?
- **Implementation review:** Does it use FUI and safe imports correctly? Does it respect the prototype boundary and runtime constraints? Accessibility lens: correct semantic components, labels and roles, keyboard reachability, focus management, status announcement.
- **At Handoff only**, accessibility separates into its own evidence-based report, because that is the point at which automated results, manual checks, and conformance claims must stand on their own.

No third reviewer agent is needed before Handoff, and accessibility is never deferred to a final polish pass.

Each report distinguishes observed facts from inferences and proposals. This prevents an agent's preference from quietly becoming a product rule.

## The review record

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

## Project memory

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

## Iterations, preview, and review

**Implemented in:** **Partly** — branch and iteration model in `flock-coke/.flkd/manifest.md`. Draft PR, shared preview, and anchored comments are step 14.

An iteration is a visible Git artifact: `fd/<project-id>/i1`, then `i2` through `iN`, created from a selected baseline or prior accepted iteration. **Iteration branches exist from step 4.** Steps 2 through 5 below — draft PR, shared preview, and comments — arrive at step 14; before then, each iteration is reviewed live from a local preview and recorded in `review.md`.

1. Create `fd/<project-id>/i1` from a pinned baseline and run it locally.
2. Push the branch and open the project's single draft PR against it, only after the required local checks pass.
3. GitHub Actions builds through the Coke-style PR deployment path and returns its preview deployment result.
4. Store the URL, build status, commit SHA, expiration, and review summary in project memory.
5. Reviewers add a general comment or a visual marker on a fixed review capture, anchored to the iteration/commit, route/state, fixed viewport, and normalized position. Workspace posts the thread and anchor metadata to the draft PR and exports a durable summary to the project record.
6. Create `i2` from the selected prior iteration and retarget the same draft PR to it. Retain superseded branches as durable history.
7. Start `fd/<project-id>/handoff` from the approved iteration for code hardening.

**One draft PR per project, retargeted per iteration.** A PR per iteration would fragment the discussion across N threads and leave a growing pile of permanently open prototype PRs, since prototype branches never merge. Retargeting keeps one coherent thread, one preview URL to share, and one thing to close when the project ends. Workspace records which commit each comment was made against, so the thread stays interpretable as the head moves.

**Markers do not drift.** A marker belongs to the iteration that created it; carrying feedback into `i2` requires an explicit re-anchor rather than a misleading automatic move.

**Review captures are Workspace-produced, not scraped.** A capture is taken locally, from the local preview, at a declared fixed viewport, on reviewer request. Workspace does not authenticate against and screenshot a remote SSO-protected deployment — that would require holding a session credential it has no business holding. Captures are content-addressed files stored through Git LFS or an approved object store, not plain Git objects, since they are retained indefinitely.

## Accessibility is continuous, then deepened at handoff

**Implemented in:** `flock-coke/.flkd/standards/universal/accessibility.md` — per-level checks and the manual checklist.

Flock Designer treats accessibility as an input to every credible prototype: the context receipt identifies the active product target, relevant FUI semantics/tokens, and the interaction states that need accessible behavior. The agent follows those constraints while it builds; it does not defer names, semantics, keyboard behavior, focus, non-color signals, status announcements, or motion considerations to a final polish pass.

At Handoff, this becomes a deeper evidence-based review. The handoff separates the product’s active automated target, the recommended next formal 2.1 AA threshold, and any 2.2 uplift observations; it records what was actually run and manually checked. No prototype or agent report may claim a higher conformance level than the product configuration and approved validation evidence support. The review remains scoped to the feature’s files, states, and interaction path: unrelated findings are separate follow-up work, not surprise changes bundled into a handoff.

## The accessibility and hardening report

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

### The accessibility position

**Observed gap:** Coke's manifest and `cy.checkPageA11y()` helper enforce WCAG 2.0 A (`wcag2a`), while the current accessibility program names WCAG 2.2 A/AA as its goal and recent evaluation scope. Formal Compliance confirmation remains open.

**Recommended progression:** protect the current 2.0 A floor, make WCAG 2.1 AA the next formal product target through a coordinated manifest-and-check update, then treat WCAG 2.2 as a later uplift.

**Be honest about the size of the middle step.** Moving from 2.0 A to 2.1 AA changes both version and level at once: it adopts the entire 2.0 AA set (contrast, resize text, focus visible, headings and labels, multiple ways) plus the 2.1 A/AA additions (reflow, non-text contrast, text spacing, pointer and target criteria). It is the largest single lift in the sequence, not an increment, and should be estimated as product work.

Until a repository changes its manifest and test configuration, 2.1/2.2 work is readiness guidance, not a conformance claim. The agent may use 2.2-friendly patterns already part of the in-scope design, but must not expand the work or claim conformance ahead of a formal change. The product manifest and matching checks are the single source of truth; a competing level must never be hard-coded into an agent file.

## Learning promotion

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

## Validation

**Implemented in:** `flock-react-component-lib/.flkd/validate.py` — 988 checks, 0 failures from a `flock-coke` checkout as of 2026-09-28.

### Context integrity

- Resolve the FUI version from the lockfile or `node_modules`, not `package.json`, and verify every selected component exists in that resolved version.
- Check that the agent uses FUI usage guidance before relying on generic MUI assumptions.
- Surface when a sibling FUI checkout is ahead of the installed package.
- Keep `.flkd` durable and tool adapters thin.

### Prototype safety

- Keep the existing guard against bare `src/...` value imports.
- Detect forbidden production-plumbing imports.
- Verify prototype code stays under `src/prototypes/<project-id>/` and does not register routes or flags.
- Verify no file outside the declared change boundary was modified.
- Require a bundler or smoke check in addition to typecheck and lint.

### Known limitations of the current guardrails

Carried over from `FLOCK-DESIGNER-EVALUATION.md` when it was retired in step 4. These are observed
facts about how the guardrails actually behave, not proposals.

| Limitation | Detail |
|---|---|
| **The prototype path boundary is prompt-level, not enforced** | The agent has `Write` and `Bash`, so "only write under `src/prototypes/<project-id>/`" is a convention it follows, not a guardrail. A `PreToolUse` hook could enforce it, but hooks apply to **all** Claude Code usage in the repository and would affect the product team's normal work. Not added; it needs a deliberate decision |
| **`.claude/` is not gitignored** | Committing makes these files visible to the whole product team. That is intended for sharing, but it is a visible change to the repository |
| **Prototypes are type-checked and linted** | `tsconfig` includes `src`, so `src/prototypes/` is covered by `tsc --noEmit` and Biome. Intentional — prototypes cannot be sloppy — but it means a production build on a prototype branch includes them |
| **Context cost** | `component-manifest.json` is roughly 14k tokens. The agent is instructed to query it with verified one-liners rather than read it whole |

### The four reliability checks

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

### Product quality

- Require a reference pattern or a stated reason for divergence.
- Evaluate required states and interaction, not only the default screen.
- Check accessible naming, keyboard/focus behavior, hierarchy, and feedback states at the credibility level requested.

---

# Part III — The work

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
exists for designers who cannot run the product locally, and [step 8](#step-8--make-the-product-runnable-on-mock-data)
addresses the same problem far more cheaply. [Step 11](#step-11--decide-if-the-managed-harness-is-needed)
decides it on evidence.

## Status

> **Steps 1–7 are complete. Step 8 is next.**
>
> Everything needing org or release permission — the shared repo's transfer to `flocksafety`, the FUI
> context generator, shipping `.flkd` in the package — is collected in
> **[step 17](#step-17--ship-the-design-system-context-in-the-package)** so it does not block the work
> in front of it.
>
> Step 6 is live at `noahshrader-flock/flock-designer`, pending an org transfer to
> `flocksafety/flock-designer`.

## The sequence

| # | Step | Who | Done when | Status |
|---|---|---|---|---|
| 1 | [Decide the rules](#step-1--decide-the-rules) | Noah | The contracts are approved, the four decisions are settled, and owners are named | **Complete** |
| 2 | [Set up the first files](#step-2--set-up-the-first-files) | Claude | The request guide, baselines file, and friction log exist in the repository | **Complete** — `4538812e` |
| 3 | [Rename existing prototype work](#step-3--rename-existing-prototype-work) | Claude | No `proto/<name>` branch or directory remains | **Complete** — nothing to rename; the stale branch was deleted |
| 4 | [Fix the product repository files](#step-4--fix-the-product-repository-files) | Claude → Noah reviews | Every row of the audit is done, and the cold-start check passes | **Complete** — cold-start check passed 2026-09-28 |
| 5 | [Set up the design-system agent files](#step-5--set-up-the-design-system-agent-files) | Claude + Design System owner | The agent reads component facts matching the installed version, and the authoring standards exist | **Complete** — `a160edf`, `62f8748`, `b8515fb`, `f03db25`; cold-start tested; packaging deferred to step 17 |
| 6 | [Create the shared repository](#step-6--create-the-shared-repository) | Noah + Claude | The shared repository holds the portable standards, the projects structure, and the plan, and Coke resolves the standards from it | **Complete** — `3d15ae9`; cold-start tested; org transfer moved to step 17 |
| 7 | [Confirm the prototype harness](#step-7--confirm-the-prototype-harness) | Claude | One real artifact builds, opens, and reviews cleanly | **Complete** — `e9e5b14c`; bundle gap closed and the check itself verified |
| 8 | [Make the product runnable on mock data](#step-8--make-the-product-runnable-on-mock-data) | Claude + a test designer | A designer who has never run Coke reaches a running app unaided | Not started |
| 9 | [Prove it on real decisions](#step-9--prove-it-on-real-decisions) | Noah leads | Two or three real decisions went from request to reviewed prototype | Not started |
| 10 | [Hand one off to an engineer](#step-10--hand-one-off-to-an-engineer) | Noah + an engineer | An engineer has received a real handoff and said whether it helped | Not started |
| 11 | [Decide if the managed harness is needed](#step-11--decide-if-the-managed-harness-is-needed) | Noah | The decision is recorded either way, with the friction log as evidence | Not started |
| 12 | [Add states, captures, and accessibility checks](#step-12--add-states-captures-and-accessibility-checks) | Claude | Every decision-relevant state can be switched to, captured, and checked | Not started |
| 13 | [Build the Workspace local loop](#step-13--build-the-workspace-local-loop) | Engineering | A designer goes from request to local preview through the app | Not started |
| 14 | [Workspace: shared review](#step-14--workspace-shared-review) | Engineering | A distributed team reviews a real iteration from an internal link | Not started |
| 15 | [Workspace: handoff and learning](#step-15--workspace-handoff-and-learning) | Engineering | The step 10 handoff happens inside the app | Not started |
| 16 | [Pilot and release decision](#step-16--pilot-and-release-decision) | Engineering + Noah | There is enough real usage to approve a broader rollout | Not started |
| 17 | [Ship the design-system context in the package](#step-17--ship-the-design-system-context-in-the-package) | Design System owner + a developer | FUI context regenerates on release and reaches products through the package, and the shared repo lives under `flocksafety` | Not started |

**Status values:** Not started, In progress, Complete. A step is Complete only when its "done when"
is met and the evidence is cited in the [change log](#change-log).

Two things run outside the sequence: the [learning loop](#the-learning-loop), which starts at step 9
and never ends, and the [managed harness](#if-step-11-says-yes-the-managed-harness), which is built
only if step 11 calls for it.

---

### Step 1 — Decide the rules

**Noah. Complete.** Settled over the course of writing this plan rather than in a sign-off meeting:

- The [agent contract](#the-agent-contract), the [artifact matrix](#required-artifacts-by-credibility-level), the four credibility levels, and the [request guide](#the-request-guide) are **approved** — they were revised repeatedly while writing this, which is the approval.
- The four decisions below are **settled**.
- **Owners:** Noah owns the sequence and every judgment in it. Claude does the repository work. Step 5 needs the Design System owner, step 10 needs a receiving engineer, and steps 13–16 need engineering — each named when that step is reached rather than in advance.
- **These planning documents live in `flocksafety/flock-designer`**, alongside the standards and the project folders, and move there when step 6 pushes.
- **Baselines** are a file, not a gate: `.flkd/knowledge/baselines.md` is waiting, and the numbers go in when someone has them. Step 16 is the only thing that needs them.

**Also settled**, costing nothing but agreement: the `fd/<project-id>/iN` branch namespace, the
[project folder](#the-project-folder) layout, and mock or synthetic data only — never production
data or credentials.

### Step 2 — Set up the first files

**Claude. Complete**, on `flock-coke` `noah/flock-designer` at `4538812e`.

- `.flkd/request-guide.md` — what good context covers, the four levels, and what happens next. A request arrives in whatever form the thinking already exists in, so this is a list of what is worth knowing, not a template.
- `.flkd/knowledge/baselines.md` — the three measures step 16 compares against, empty and waiting for numbers.
- `.flkd/knowledge/setup-friction.md` — what it took each person to get running, kept separate from the gap log because it decides step 11.

**Done when:** the three files exist. ✅

### Step 3 — Rename existing prototype work

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

### Step 4 — Fix the product repository files

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

#### What was done, 2026-09-28

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

### Step 5 — Set up the design-system agent files

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

#### Cold-start test, 2026-09-28 — found a real defect on its first run, like step 4's did

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

#### What was done, 2026-09-28

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

#### The finding that changes decision 1

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

#### Resolved: the local path is the working path

**Decided 2026-09-28 by the plan owner.** Work against the sibling checkout now; bring the context
into the published package later, with a developer, as [step 17](#step-17--ship-the-design-system-context-in-the-package).

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
| **Build the context generator**, decide `cokeUsages`, ship `.flkd` in the package | [Step 17](#step-17--ship-the-design-system-context-in-the-package) |
| Confirm the component-gap destination is the right process | Noah + Design System owner |

### Step 6 — Create the shared repository

**Done, at a temporary address.** `noahshrader-flock/flock-designer` on GitHub, branch
`noah/flock-designer`, commit `d2afdfa` — pushed there rather than under `flocksafety` because
`noahshrader-flock` cannot create repositories in that org. A personal-to-org transfer is a one-step
GitHub operation that keeps the full history, so nothing here gets redone when it moves.

**Built so far:**

- `projects/` — one folder per project. Drop in whatever context exists, in whatever form it exists.
- `projects/_template.md` — the optional starting template. Prompts, not fields; ignoring it is fine.
- `standards/` — empty, waiting for the portable standards to move out of `flock-coke`.
- `README.md` — how to start a project, and what does not belong here.

#### The content moved, 2026-09-28

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

**Nothing is open here. The org transfer moved to [step 17](#step-17--ship-the-design-system-context-in-the-package)**,
where it sits with the other items needing someone with org and release permission. Every reference
in this document to `flocksafety/flock-designer` means this repository at whichever address it
currently has — **the transfer is housekeeping, not a plan change**, and nothing here gets re-derived
once it happens.

**Done when:** the repository holds the portable standards, the project structure, and the plan, and
Coke resolves the standards from it. **The address is not part of this step** — it is step 17.

### Step 7 — Confirm the prototype harness

**Claude.** Prove the prototype contract works before using it on anything real.

- Build one small real artifact in `src/prototypes/<project-id>/` and confirm the directory contract holds.
- Document how a reviewer opens the entry point and compares states.
- Keep `tsc`, lint, and the bare `src/...` import guard, and add the bundle or dev-server smoke check that the gap log showed those two miss.

**Done when:** an isolated prototype can be built, opened, and honestly reviewed.

#### What was done, 2026-09-28

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
[`authoring/components.md`](#step-5--set-up-the-design-system-agent-files) says it should.

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

### Step 8 — Make the product runnable on mock data

**Claude, tested on a real designer.** The cheapest fix for the onboarding problem, and the evidence
Step 11 needs.

- Port the verified MSW and `start:design` approach from `noah/local-design-mode` onto the Designer baseline. Do not merge the divergent branch wholesale.
- Preserve `.flkd`, the agent adapters, and the prototype contract.
- Keep fixtures separate from product-pattern truth, and document where they came from.
- Add one shell-level smoke check and a manual review checklist.
- Write a setup path a designer can follow without frontend help, then test it on a designer who has never run Coke and record what happened in the friction log.

**Done when:** the real Coke shell runs locally on mock data, and a designer reaches that state
unaided.

### Step 9 — Prove it on real decisions

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

### Step 10 — Hand one off to an engineer

**Noah picks the proof and the engineer; Claude prepares the handoff.** This is here, rather than
inside the app at step 15, because handoff is the claim engineering cares about most. Testing it by
hand costs little; discovering at step 15 that the shape was wrong means rebuilding it inside an
application.

- Claude creates the handoff branch, runs the checks against every touched state, and writes `handoff.md` with the [accessibility and hardening report](#the-accessibility-and-hardening-report) and a rewrite plan.
- Noah gives it to the engineer who would actually build it, and records whether it reduced ambiguity, what they still had to ask, and what they wanted that it lacked.
- Claude then revises the report and writes the handoff skill from what the engineer said.

**Done when:** an engineer has received a real handoff and said whether it helped, and the report
reflects their answer.

### Step 11 — Decide if the managed harness is needed

**Noah.** With the friction log from steps 8 and 9 in hand, decide whether designers are still
blocked from running the product.

The managed harness is the single most expensive thing in this plan — a product-specific adapter
that clones at a pinned revision, resolves FUI, and generates a runnable near-replica, per product.
It exists for designers who cannot run the product locally, and step 8 addresses that far more
cheaply. Deciding in advance would invert the evidence.

**Done when:** the decision is recorded in the change log either way. If yes, see
[the managed harness](#if-step-11-says-yes-the-managed-harness).

### Step 12 — Add states, captures, and accessibility checks

**Claude.** The runtime support that makes review routine, once real use has shown what is needed.

- A standard way to switch among intended states and variants.
- Screenshot or review-link capture for the states that support a decision.
- The configured accessibility check for every touched state that can be exercised, plus a short manual keyboard and focus review. An axe bypass is never recorded as a pass.
- Tighter unhandled-request behaviour as fixture coverage becomes trustworthy.

**Done when:** a reviewer can switch to, capture, and check every decision-relevant state, and an
unhandled app-data request is visible rather than silent.

### Step 13 — Build the Workspace local loop

**Engineering.** The first line of application code. Everything local — no network integrations, no
shared services, no external approvals.

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

**This is the honest go/no-go.** Step 9 already proved designers can reach the outcome without an
application; this only makes it easier, and the collaboration value arrives at step 14. It is the
step most at risk of being built because it is on the list rather than because it is needed.

### Step 14 — Workspace: shared review

**Engineering.** The function the design team is actually missing, and the first step needing
anything outside the laptop. Its [decision gates](#part-iv--decision-gates) must close first.

- Settle the comment-anchor shape against a real review; the fields are in [Part IV](#anchored-comment-shape).
- Stand up the shared project-memory repository under the approved access model.
- Authenticate to GitHub through the approved model; create and retarget the project's single draft PR.
- Confirm the Coke `PR Deployment` workflow runs for **draft** PRs specifically, and that its URL, access policy, and expiry are acceptable.
- Add GitHub-backed comments and visual markers on locally produced review captures, validated across two designers.
- Record preview expiry and rebuild instructions rather than treating a temporary deployment as durable evidence.

**Done when:** a distributed team can review a real iteration from an internal link and return to
its exact branch, commit, and context.

### Step 15 — Workspace: handoff and learning

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

### Step 16 — Pilot and release decision

**Engineering and Noah.**

- Pilot with two or three active product initiatives on managed macOS and Windows machines.
- Validate signing, distribution, updates, logs, access controls, data handling, preview cost, and support ownership.
- Measure designer contribution, decision speed, prototype reuse, and handoff quality **against the baselines written in step 1**.

**Done when:** there is enough real usage and operational evidence to approve a broader internal
rollout.

### Step 17 — Ship the design-system context in the package

**Design System owner, with a developer. Claude can write the generator.** Deferred here
deliberately: steps 1–16 work against a sibling checkout, which is enough to build and prove the
workflow. This closes the class of problem rather than managing it.

**Why it is not just a packaging task.** [Decision 1](#decisions-the-audit-raises) recommends
shipping `.flkd` inside the published package so the context always matches the lockfile. That is
right, but on its own it makes staleness *reliable* rather than absent, because **there is no
generator**: `component-manifest.json`, `tokens.json`, and `deprecated-components.json` were produced
once in `0f25abd` and have never been regenerated. Publishing a manifest nothing regenerates just
distributes the stale one on a schedule.

- **Build the generator.** Inputs: FUI `src/` for exports, props, deprecations, and token values; the
  built bundle for the published export list, which is what a consumer can actually import; Storybook
  story `parameters` for groups, subtitles, and Figma/Storybook links. It stamps `versionScannedFrom`
  from `package.json` and runs on release, so the published context and the published bundle cannot
  disagree. The spec is in FUI's `.flkd/README.md`.
- **Decide what `cokeUsages` and `common` become.** 35 components carry a usage count sourced from
  scanning Coke, so the manifest is a cross-repository artifact today. Drop the fields, generalise
  them to "used by N products," or accept a multi-checkout build and say so. A Coke-shaped field in a
  design-system artifact is one product's habits promoted to a system fact.
- **Ship `.flkd` in the package.** Today `package.json` has `files: ["build", "dev/postinstall.ts"]`
  and nothing copies `.flkd` into `build/`.
- **Reverse the resolution order in practice.** Both repositories already list the package first; it
  falls through to the checkout because the package has no `.flkd`. When this lands, nothing in
  either repository changes.
- **Drop the release-tag requirement** from the setup path, and turn `validate.py`'s staleness NOTE
  back into a failure once a generator makes it actionable.

#### Also here: the org transfer

Batched here because it needs the same thing everything above needs — someone with org permission.

- **Transfer `noahshrader-flock/flock-designer` to `flocksafety/flock-designer`.** Settings →
  Transfer ownership, from either side. It is a one-step GitHub operation that keeps full history,
  so nothing gets redone and no reference in this document changes meaning.
- It was carried as step 6's open item until 2026-09-28, which made a finished step look unfinished.
  Step 6's work is done; this is an address change and belongs with the other permissioned items.

**Done when:** a product installs the package and reads FUI context that provably matches the
installed version, with no sibling checkout and no tag discipline required — and the shared
repository lives at `flocksafety/flock-designer`.

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

## What is deliberately not being built yet

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

## Reference

Detail the steps link to, kept out of the sequence so the sequence stays readable.

### Decisions the audit raises

Four decisions, each with a recommendation. Step 4 and the learning loop implement whichever way they go, so they are settled first, and the outcome is recorded in the change log either way.

**1. FUI context resolution** — ship `.flkd` in the published package, or require a sibling checkout.

**Recommended: ship it in the package**, and resolve the installed package first and a sibling checkout second, reversing today's order. The installed package always matches the lockfile the [agent contract](#the-agent-contract) already requires the agent to read. A sibling checkout on its default branch describes the *latest* FUI rather than the installed `5.5.4`, so an agent reading it can name a component, prop, or deprecation the product does not have — the thing the contract forbids most plainly — and nothing today would catch it. It also removes a second clone from every designer's setup. The cost is one FUI release, owned by the Design System. Until that ships, require the sibling checkout **at the release tag matching the installed version**, and put that step in step 8's setup path. The full comparison is in [step 4](#the-design-system-side).

**2. The view-state list** — the repository names five view states, this plan names six.

**Recommended: one list of seven**, held in `standards/universal/interaction-states.md`, with this plan's [state table](#states-are-runtime-not-decoration) linking to it rather than restating it: default or loaded, loading, empty, error, partial, success or changed, and permission or disabled where relevant. Partial is in the repository and missing from the plan, and the request guide's own example — "what they see when a bulk action partly fails" — is a partial state. The list lives in the repository because that is what the agent reads. The [artifact matrix](#required-artifacts-by-credibility-level) still decides how many of them each credibility level owes, so Explore stays light.

**3. `FLOCK-DESIGNER-EVALUATION.md`** — retire it, or keep it as history.

**Recommended: retire it, after moving what is still true.** It is 835 lines in Coke's repository root describing the superseded phase 1–4 rollout, and the agent reads the repository. Move its verified observations into the context document's observed facts, and its reliability section into [the learning loop](#the-learning-loop), which is what that section already calls itself — the seed of the validator. Then delete it from the branch, since Git keeps the history, and point the three files that cite it at these documents instead: `manifest.md`, `knowledge/agent-gaps.md`, and `validate.py`.

**4. The shared `flock-designer` repository** described in `.flkd/README.md` — adopt it, or drop the reference.

**Recommended: adopt it, as the three-layer model in [knowledge layers](#knowledge-layers)** — a shared repository for the agent definitions, skills, universal standards, Flock tier, and Part I contracts; FUI's `.flkd` for component facts; each product's `.flkd` for its own patterns, boundaries, and records.

The files already make the case. Measured at `6bf0f1b8`, `standards/universal/` (5 files, 385 lines) and `production-readiness.md` (61 lines) contain **zero** product-specific references, and the README says the universal tier was written to move. The agents, the skills, and `non-negotiables.md` are a portable rule wrapped around a Coke instance table — 2 to 15 product references each across 637 lines — so they move once those instances are referenced rather than inlined.

**Keep the shared standards out of FUI** rather than folding the two together. FUI's context is *generated* from FUI source, and its own README forbids hand-editing resolved values, so hand-authored organizational standards do not belong in that pipeline. Ownership differs: an accessibility change should not require a component release and a version bump in every product. And a Flock product that is not on FUI still needs the universal tier.

**Create the repository in step 4, move only what is already portable, and publish the package later.** Standing the repository up early makes the three layers a working arrangement that can be shown rather than a diagram of a future state, and it proves the resolution mechanism while it is still cheap to change. Only `standards/universal/` and `production-readiness.md` move, because they carry no product-specific reference; the agents, the skills, and `non-negotiables.md` need their instance tables lifted into `manifest.md` first, which is [deferred](#deliberately-deferred). Publishing waits too: the content is still moving — 3 of 17 skills are written, and the gap log decides the rest — so every fix would become a release. Publish when a second product adopts it.

### The audit

The checklist for [step 4](#step-4--fix-the-product-repository-files), plus what [step 5](#step-5--set-up-the-design-system-agent-files) and [step 6](#step-6--create-the-shared-repository) do.

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
| `.flkd/agents/flock-designer.md` | Good reading order and verification. Has no credibility levels, brief, context receipt, change boundary, or project folder. Asks for "all four states" every time. Its FUI query commands use `FUI=../flock-react-component-lib/agent`, a directory that does not exist; the context is in `.flkd/` | Add the [operating loop](#the-operating-loop) as its working steps: frame, write `brief.md`, write the context receipt, stop for confirmation at Ground and above, build to the level, write `review.md`. Scale states to the [matrix](#required-artifacts-by-credibility-level). Fix the FUI path. Add the always/never list verbatim from the agent contract |
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

# Part IV — Decision gates

These are the agreed product directions for a lightweight, repository-first designer-contribution workflow. Named owners validate the necessary platform, security, and operational details before the listed phase begins; they do not silently replace the intent.

The **Gate by** column matters as much as the recommendation. Gates due at step 1 are cheap to resolve and need nothing but team agreement. Gates due at step 14 are where this effort first acquires external dependencies and recurring cost, and they should be opened with their owners well before step 13 finishes.

| Question | Recommendation | Why | Owner | Gate by |
|---|---|---|---|---|
| Which local agent should Workspace support first? | **Confirmed:** integrate Claude Code first because the current Designer branch already has Claude discovery files. Make the adapter contract tool-neutral; add Codex and other local harnesses later rather than duplicating `.flkd` knowledge. | Delivers against the existing implementation while avoiding permanent coupling to one agent. | AI/platform engineering | step 13 |
| Where do the shared agent files, skills, and standards live as more products adopt this? | Three layers, per [knowledge layers](#knowledge-layers): a shared `flock-designer` repository for the agent definitions, skills, universal standards, Flock tier, and Part I contracts; FUI's `.flkd` for component facts; each product's `.flkd` for its own patterns, boundaries, and records. Create the repository in step 4 and move the already-portable standards into it, resolved from a sibling checkout as FUI is today; add a CODEOWNERS co-owner once promotions start changing those standards, and publish it as a package declaring FUI as a peer dependency when a second product adopts it. Not a per-designer tool plugin. | 446 lines of the product repository's standards already carry no product-specific reference, and the universal tier was written to move. Ownership and release cadence differ from FUI's: an accessibility change should not need a component release. A plugin installed per designer would be absent for Workspace, CI, and other engineers' checkouts, and would re-couple content to one tool that `.flkd` was built to stay independent of. | Design operations + design system + product engineering | step 4 for the repository; co-owner and publication at the second adopting product |
| How should the product move from current WCAG 2.0 A enforcement toward WCAG 2.1 and 2.2? | Keep 2.0 A as the enforced floor; make 2.1 AA the next formal target through a coordinated manifest-and-check update. Assess 2.2-friendly patterns only within feature scope until a later formal uplift. Estimate 2.0 A → 2.1 AA as a substantial piece of product work: it changes version and level together and pulls in the entire 2.0 AA set. | Coke currently enforces 2.0 A while the program direction is 2.2 A/AA. A staged path prevents false assurance, competing agent-file targets, and uncontrolled scope expansion. | Compliance + accessibility program + product engineering | step 1 for the position; step 10 for the first report |
| How should the runtime baseline proceed? | Selectively reimplement the verified `noah/local-design-mode` MSW approach on top of the Designer branch; do not merge the divergent branch wholesale. Treat this as the primary fix for designer onboarding. | Preserves current `.flkd` work while bringing forward the useful real-shell runtime foundation, and removes the actual barrier to designers running the product. | Coke engineering | step 8 |
| How does Workspace authenticate to GitHub? | Use a GitHub App installed on the participating repositories, with per-user authorization and tokens held in the OS keychain. Do not ask designers for personal access tokens, and do not embed a shared credential in the application. | Workspace needs to create PRs, post comments, and read build status as the acting user, with revocable, auditable, scoped permissions. This is the gate most likely to require security review, and step 14 cannot start without it. | Platform/security engineering | step 14 |
| Which internal preview publisher creates the shareable link and how is it protected? | Use Coke's existing GitHub Actions `PR Deployment` path, which calls the internal `s3-frontend-v2` reusable workflow. Workspace maintains one draft PR per project. Confirm specifically that the workflow runs for **draft** pull requests, not only non-draft ones, and confirm the returned URL, SSO/access policy, expiry, and cost. | This is the strongest local evidence of an existing company preview mechanism and keeps the workflow GitHub-native. Draft-PR triggering is a distinct risk from repository provisioning and has to be tested separately. | Platform/security engineering | step 14 |
| How are review captures produced and stored? | Workspace captures locally from the local preview at a declared fixed viewport, on reviewer request. It does not authenticate against and screenshot a remote SSO-protected deployment. Store captures in Git LFS or an approved object store, not plain Git objects. | Local capture avoids Workspace holding a session credential for a protected preview. Indefinitely retained images in plain Git will dominate the repository within a few projects. | Design operations + platform engineering | step 14 |
| What is the shared-comment model? | Use the project's GitHub draft PR as the collaboration thread for V1. Workspace writes structured marker metadata into the related GitHub comment and archives the full comment export, anchors, captures, and decision record in project memory. Defer a separate review service. | Reuses GitHub identity, permissions, history, and the existing draft-PR preview container without adding a collaboration backend. | Design operations + engineering | step 14 |
| Is version/state-level feedback enough, or is visual annotation required for the pilot? | Include visual preview markers from the pilot. Anchor them to an immutable iteration/commit, route/state, fixed viewport, and normalized position; make carry-forward to a later iteration explicit. Also support unanchored general comments. | The visual reference is core to design critique, while an explicit anchor contract prevents comments from drifting as the experience changes. | Design leadership + engineering | step 14 |
| How should shared project memory support another designer taking over work? | **Settled:** one folder per project in `flocksafety/flock-designer`, holding both the context that was supplied and every record the agent wrote. Prototype code stays in the product repository on its own branch. | A project has a home before any code is written, picking up someone else's work means reading one folder rather than knowing which branch to check out, and nothing per-project is written into the product repository at all. | Design operations + product engineering + security | Step 6 |
| What source code, data, prompts, and logs are allowed in a prototype or preview? | From step 1, adopt the conservative default the prototype contract already states: mock or synthetic data only. Before step 14, confirm the wider policy with its owners: permit only source the designer is already authorized to access, plus synthetic or approved anonymized fixtures. Block production credentials, customer exports, production service calls, and unapproved prompt/log retention. Require SSO access and expiration for previews. | Keeps the lightweight contribution path compatible with product-data and security boundaries. | Security + data governance + product engineering | step 1 adopts the default; step 14 for owner confirmation |
| What persists after a project closes? | Retain prototype iteration branches indefinitely. Let preview deployments expire, but preserve their URL, commit, status, and rebuild instructions. Retain comments, marker anchors, captures, decisions, and handoff evidence indefinitely in project memory. Revisit branch retention once the product repository has accumulated real prototype history. | Keeps project continuity and review rationale available to a future owner while treating deployment infrastructure as a disposable runtime resource. | Engineering + design operations | step 14 |
| What does code hardening produce? | Produce an engineering-ready candidate, a draft PR from `fd/<project-id>/handoff`, and the [accessibility and hardening report](#the-accessibility-and-hardening-report). Remove prototype-only baggage; preserve fixture contracts and review evidence in project memory. | Gives engineering the cleanest useful starting point while making verified accessibility evidence, remaining risks, and prototype boundaries explicit. | Product engineering + accessibility/design-system owners | step 10 by hand; step 15 in Workspace |
| How do component gaps become Design System changes? | Workspace creates a structured component-gap record and proposes a PR in the FUI repository; Design System and engineering approve it. The consuming product updates only after resolving the released FUI version. | Keeps prototype learning connected to FUI without allowing prototypes to create unreviewed primitives. | Design System + engineering | step 4 for the destination; the learning loop in practice; step 15 in Workspace |
| Is a managed harness needed at all? | **Do not commit to it.** Open it only on a recorded step 11 decision that a runnable product failed to unblock real designers. If opened, use a single shared private prototype repository namespaced by `fd/<project-id>/*` branches, not one repository per project. | It is the most expensive item in the set and exists to solve a problem step 8 addresses far more cheaply. Committing to it in advance inverts the evidence. | Design operations + product engineering + security | Step 11 |
| Where do managed-harness branches push, and how do they reach product source later? | Push to the dedicated private prototype repository, never the source product repository by default. When work needs full product fidelity, create a linked `fd/<project-id>/promotion` branch in the approved product checkout and use a transfer manifest; create a product PR only after direct-repo hardening. | Keeps experiments isolated while giving a clear, traceable path to continue work in the real codebase without pretending the harness can be auto-merged. | Product engineering + security | the managed harness |

## Desktop-specific decisions

- Exact app repository, owning team, release and distribution channel, and support model. Gate by step 13.
- macOS/Windows signing, auto-update, device-management, telemetry, and security-review requirements. Gate by step 16.

---

# Part V — The Workspace application

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

## Recommendation

Build **Flock Designer Workspace** as a cross-platform Electron application for macOS and Windows.

It is a local coordination layer over real product repositories. It opens a selected repository, invokes the locally configured agent, starts an approved runtime, records iterations and review decisions, and prepares an honest handoff. It does not become the source of truth for standards, product patterns, prototype source, or design-system facts.

## Why Electron

**Observed facts**

- The Flock frontend environment is React and TypeScript based. Coke and Monaco use Rsbuild and FUI.
- Designers need to work directly against local repositories and run local preview environments.
- The application needs desktop capabilities: selecting a repository, constrained filesystem access, Git status and branch operations, launching local processes, rendering previews, and secure local preferences.
- Electron supports a single JavaScript/HTML/CSS codebase across macOS and Windows. Its main-process, renderer-process, and preload model fits the separation between privileged local operations and the FUI-based workspace UI. [Electron overview](https://www.electronjs.org/docs/latest/), [process model](https://www.electronjs.org/docs/latest/tutorial/process-model)

**Assessment**

Electron is the best first choice. It lets the team use existing frontend strengths and gives mature desktop primitives without introducing a Rust application layer or separate native clients.

Tauri is a reasonable future comparison if installer size and memory become first-order concerns. It is not the recommended first choice because the initial challenge is reliable local repository and process orchestration, not reducing the desktop shell footprint. Separate native apps are out of scope.

**One consequence worth naming:** the Workspace renderer uses FUI, so the application depends on the same design system it coordinates. Pin the Workspace's own FUI version independently of any product baseline it opens, and never surface the app's installed version where a prototype's resolved version belongs. They are unrelated facts that will otherwise be confused in a context receipt.

## Product boundary

**The workspace owns**

- Selecting and opening a local repository.
- Showing the resolved Flock Designer context and readiness state.
- Creating or continuing a prototype branch or worktree through explicit user action.
- Invoking an approved local agent adapter.
- Starting, stopping, and observing approved preview commands.
- Showing iteration history, review threads, decision records, and handoff readiness.
- Showing the product baseline, resolved FUI package, and any optional Design System work connection separately.
- Opening existing Figma, GitHub, Storybook, and browser links in the right place.

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

## Technical architecture

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
  |- GitHub App: authenticated PR creation/retarget, comments, build status as the acting user
  |- Internal preview publisher: existing Coke PR-deployment path, draft-PR triggering to confirm
  |- GitHub draft PR: one per project, retargeted per iteration; thread and marker metadata
  |- Shared knowledge repository: canonical project records and durable review archive
  |- Capture storage: Git LFS or approved object store for fixed review captures
```

### Renderer

- React and the FUI component library.
- No Node.js integration.
- No direct filesystem, shell, Git, credential, or agent-process access.
- Displays only typed data returned by the preload bridge.

### Preload and main process

- Use `contextIsolation: true`, renderer sandboxing, and `nodeIntegration: false`.
- Expose purpose-built operations such as `listPrototypes`, `readContextReceipt`, `createPrototypeBranch`, `startPreview`, and `addReviewComment`. Never expose a generic shell or raw IPC endpoint.
- Treat a live or remote preview as untrusted content: keep it in a sandboxed surface with no Workspace bridge, and render annotation overlays only over Workspace-owned fixed review captures. Do not inject an annotation script into the product preview.
- Produce review captures locally, from the local preview, at a declared fixed viewport, on reviewer request. Workspace does not authenticate against and screenshot a remote SSO-protected deployment; that would require holding a session credential for a protected internal surface.
- Validate every path against the selected checkout and every command against a repo-declared allowlist. [Security](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

### Repository adapter

Each participating repository declares a small workspace descriptor in its existing Flock Designer context, naming: where `.flkd` lives; the supported prototype root and branch naming; approved runtime commands; how a prototype becomes addressable for preview; FUI package and version resolution; validation commands; and supported agent adapters.

This avoids hard-coding Coke details into the desktop application.

### Agent adapter

The desktop app launches Claude Code as the confirmed first local-agent integration. It passes a task reference and bounded context; the agent reads the repository's own instructions and writes only inside the declared prototype boundary. The adapter boundary stays tool-neutral so Codex and other local harnesses can be added later.

The desktop app does not bundle model credentials or duplicate the agent's prompts and standards. The adapter remains replaceable so the workflow is not permanently tied to one assistant.

### Runtime and preview adapter

The app manages known commands rather than executing arbitrary text from the UI: the prototype harness command, `start:design`, and typecheck, lint, import-guard, and smoke-check commands.

"Internal Preview" in the FigJam needs two steps:

1. **Local:** a localhost preview opened inside or beside Workspace, reviewable by the person running it. This is all step 13 requires.
2. **Shared:** Workspace maintains one draft PR per project and retargets it to the current iteration branch. Coke's checked-in `PR Deployment` workflow already calls the internal `s3-frontend-v2` reusable GitHub workflow; that is the first integration to validate. Two things must be confirmed separately: that the workflow triggers for **draft** pull requests at all, and that it can be provisioned for any additional repository. It should return a URL, build status, commit SHA, and expiry metadata. Access policy, retention, and cost remain integration decisions rather than Electron capabilities.

Preview environments must have no production data, no production credentials, and no public access by default.

## Minimal user journey

1. **Create a project.** The designer records the spec and resources. Workspace creates the project-memory record.
2. **Open the checkout.** Workspace opens an approved local product repository.
3. **Inspect context.** Workspace shows the pinned product baseline, resolved FUI package, relevant product patterns, references, runtime option, and prototype boundary before the agent starts.
4. **Create iteration 1.** With confirmation, Workspace creates the first prototype branch or worktree and asks the local agent to create or revise the artifact.
5. **Run and inspect.** Workspace starts the approved prototype-harness or design-mode command and shows the preview alongside its review record.
6. **Push for review.** Workspace opens or retargets the project's draft PR, invoking the internal PR-deployment path, and records the returned URL, build status, and commit.
7. **Iterate.** Feedback attaches to that iteration. The next iteration branches from the prior selected iteration and retains its project memory.
8. **Harden or stop.** The work is marked as useful exploration, or passed through code hardening and handoff. A component gap creates a linked Design System work item, never an automatic component change.

## MVP user interface

The app should be quiet and task-oriented, not a new visual design environment.

| Area | Purpose | MVP behavior |
|---|---|---|
| Project rail | Select repo and active prototype | Repository status, branch, runtime state |
| Connections | Make the repository roles legible | Product baseline, resolved FUI package, optional FUI source checkout |
| Brief | Frame the decision | Small structured form with links and local references |
| Context receipt | Make grounding visible | Show FUI version, patterns, references, constraints, and what the chosen credibility level requires |
| Preview | Inspect the running artifact | Embedded or externally opened localhost preview |
| Iterations | Preserve the path taken | Named `i1`, `i2`, `i3` records tied to Git commits and branches |
| Review | Capture feedback and decisions in visual context | Preview markers plus general comments, tied to an iteration and state |
| Handoff | Package the result for engineering | Generated handoff plan with remaining work |

### Anchored comment shape

An anchored comment contains: author, timestamp, category, text, and status; immutable iteration and commit; preview URL plus route and named fixture state; fixed review viewport and normalized `x`/`y` marker position; and a link to the resulting GitHub draft-PR comment.

For V1 the draft PR is the collaboration thread. Workspace writes the anchor metadata with the GitHub comment, renders it as a visual marker for authorized users, and exports the durable comment record, captures, anchors, and decision summary to the shared record's `review/` directory, and appends a summary to the project folder's `review.md`. A local app cache cannot be canonical for collaboration or continuity.

---

# Open questions

Decisions already settled in this plan are not repeated here. What remains genuinely open:

- Which fixture source should own long-lived design-mode data, who refreshes it, and how drift from real API shapes is detected.
- When does a review need real-shell validation rather than a reconstructed host? Step 9 should produce a rule of thumb rather than a policy written in advance.
- Which visual or interaction checks can be automated without making the workflow slow enough that designers route around it.
- Whether prototype branches should expire from the product repository after some period, given that they never merge and accumulate indefinitely.
- How the team protects the distinction between a prototype that is credible and code that is production-ready, once previews are easy to share widely.

---

# Success measures

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

**Handoff**

- Engineers receive a clear statement of what was learned, what is mocked, and what must be rebuilt.
- Engineering can tell exactly what is prototype evidence and what remains an implementation responsibility.
- Repeated prototype feedback makes the context better rather than remaining trapped in a chat thread.

## Near-term definition of success

Within a small number of real prototype requests, Flock Designer should make it possible to:

- move from a focused brief to a reviewable Flock-native flow in one working session;
- cite the FUI and product patterns used rather than rely on agent memory;
- show the state that makes the product decision testable;
- explain what is real, mocked, intentionally invented, or still unresolved;
- give engineering a handoff that reduces ambiguity without asking them to merge prototype code.

The first proof is not a polished platform. It is two or three real decisions that travel farther, with less translation and less loss of product context.

---

# Change log

Newest first. Every change to any of the three documents gets a row: what changed, why, and which sections were updated. Open items — conflicts found while building that need a person — are recorded here too, prefixed **Open:**, until someone resolves them.

| Date | Change | Sections updated |
|---|---|---|
| 2026-09-28 | **Step 7 cold-start test: clean pass, and the first one to find no real defect.** A fresh session named the entry point, the state switcher and all seven states, gave the review order, correctly identified `view.tsx` as the thing under review and `host.tsx` as throwaway, and — the trap — listed **all four** verification checks rather than stopping at `tsc` and lint. It also surfaced the accessibility caveat unprompted, without being asked about it, and correctly framed it as the reviewer’s outstanding work. Every citation verified exact. **One small inconsistency it exposed by being more thorough than the README:** `src/prototypes/README.md` said "three checks" and omitted the bare-`src/` grep from its table, while the agent file and `review.md` both require four — so a reviewer following the README alone would have run three. Fixed in `c329dffd`. **Four tests, four findings, though this one only because the session read more widely than one file.** | Change log. Repo: `c329dffd`. |
| 2026-09-28 | **Step 7 complete, and the org transfer moved to step 17 at the plan owner’s direction** so a finished step stops looking unfinished. **The bundle gap is closed** — open in the gap log since 2026-09-02. `npm run smoke:prototype` bundles a prototype entry with rsbuild’s alias set, and **the check was verified rather than asserted**: injecting the original failing import gave `tsc` 0 errors, Biome clean, and a smoke failure. The artifact is `src/prototypes/alert-notification-prefs/` with the full directory contract and all seven states behind a switcher, plus a project folder keyed by the same slug — the contract proved end to end. **Building it corrected three FUI assumptions** the manifest alone did not carry, all caught by `tsc` against the prop allowlists, and **produced the first real component gap**: `FSToggle` has no accessible-name route, so Coke’s canonical settings row ships unnamed toggles. Logged, not yet filed — the Design System owner is still unnamed. The review record leaves six of ten accessibility checks recorded as **not run** and the automated scan as **could not run**, which is the artifact proving the harness rather than pretending to prove the design. | Step 7 and its sequence row; step 6 and step 17 (transfer); both status blocks. Repos: `e9e5b14c`, `2f43511`. |
| 2026-09-28 | **Step 6 cold-start test: passed all three questions, and was right to complain about something it misdiagnosed.** A fresh session in `flock-coke` followed the references out to the sibling checkout, gave the accessibility floor and Test-level requirements, all seven view states, and — the question most likely to be confabulated — got the tier-precedence asymmetry right with citations rather than from memory: Flock wins on design judgment, the universal tier wins on accessibility, because conformance is a floor and judgment is not. Every citation verified accurate. **It then flagged the README’s file tree as stale for still listing `standards/universal/` under `.flkd/`. The tree was correct; the prose around it was not.** A blunt path substitution in step 6 had produced "the universal tier and `../flock-designer/standards/production-readiness.md` are no longer here" — a sentence saying a file at its new path is not at that path, twice over. The reader was reacting to something genuinely broken and reached for the nearest explanation. Fixed in `6cacfc74`; both sentences now say the two are deliberately absent and point at where they went. **Three tests, three defects — none of which the author could see from inside the work.** | Change log. Repo: `6cacfc74`. |
| 2026-09-28 | **Step 6’s content is complete; only the org transfer remains.** `standards/universal/` and `production-readiness.md` moved into the shared repository, Coke resolves them from `../flock-designer/standards/`, and `PLAN.md` moved in alongside them. **Verifying portability was the part that mattered:** the audit’s "zero product-specific references" claim came from grepping product names and was incomplete — validating the moved files caught two universal standards that called themselves product-agnostic while hard-linking to the Flock tier above them, plus a third reference form the substitution pass missed. All fixed; the universal tier now describes the tier relationship without knowing where it lives, which is what portability actually requires. **A consequence the plan had not stated: a `flock-coke` checkout alone no longer holds the accessibility floor or the view-state list, so the cold-start check now needs two checkouts.** Coke’s README says so and `validate.py` reports a missing shared checkout instead of failing silently, but it is a real increase in setup burden and step 8 owns it. `validate.py`: **1006 checks, 0 failures.** | Step 6, sequence row, both status blocks. Repos: `3d15ae9`, `82d6112d`, `6e0d469`. |
| 2026-09-28 | **Cold-start test on step 5 found a live contradiction I had created**, the same class step 4's test found: I corrected a false "generated from `src/` — fix the source and regenerate" claim in `.flkd/README.md` but left the identical claim standing in `.flkd/authoring/components.md`, the file it originated in. A fresh session got the right answer anyway, by citing the corrected file — luck of which file it trusted, not agreement across the repository. Also surfaced a real gap (composite components were undocumented) and, while fixing that, a second self-made confusion (two unrelated splits both labeled "two shapes"). All three fixed in `f03db25`. **This is now the pattern, not a one-off:** both cold-start tests run so far have each found one thing the author could not see from inside the work. | Step 5, sequence row. Repo: `f03db25`. |
| 2026-09-28 | **Step 5 closed on the local path; packaging becomes step 17, at the plan owner's direction** — "test with the local version first, and have a follow-up step at the end to bring this into the package." Two problems had been tangled together and only one defers. **Distribution** (sibling checkout now, package later) defers to [step 17](#step-17--ship-the-design-system-context-in-the-package). **Version match does not defer, and it already holds:** Coke has `5.5.4` installed, the manifest is stamped `5.5.4`, and every `FS*` name in every context file is verified against that manifest plus the installed type declarations, so the agent cannot name a component the product lacks. What is misaligned is FUI's own hygiene — that checkout's source is `5.5.8` — which is FUI's to fix and does not make the JSON wrong for a product pinned to an older version. **`validate.py` was over-scoped and is corrected** (`b8515fb`): it failed a consuming repo's build for a condition only the design system could fix, which is how checks get disabled. It now fails on `manifest == installed` and reports `manifest == source` as a NOTE — printed every run, never silent, never blocking; run without an installed package the NOTE becomes the failure, because there it is actionable. **998 checks, 0 failures.** Residual risk stated in step 5: hand-authored `.md` prose in an ahead checkout is unversioned and could describe newer behavior; names are covered, prose is not. New **step 17** carries the generator, the `cokeUsages` decision, and shipping `.flkd` — the plan is now 17 steps. | Step 5, new step 17, sequence table, both status blocks, intro step count. Repo: `b8515fb`. |
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
