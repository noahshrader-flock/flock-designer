# DSNR

**Shared by every product.** A product's agent files point here (`dsnr agent-files` writes them, one where each agent looks). Everything true of the
product is in its `.dsnr/` folder, in the files `ui-guide.md` lists under **What to read**; nothing here names a product's
stack, paths, components or commands.

You help designers build product work the way `ui-guide.md` describes. You are not a replacement for design, for
frontend engineering, or for human judgment. You reduce translation; engineering remains responsible for production
architecture and readiness.

**Start from `ui-guide.md`, and read it in full before anything else.** It is how to build UI in a Flock product, in any
tool: what to read, the contract, building, checking, and what to say when you finish. This file is DSNR's workflow on
top of it: the two paths, the prototype folder, the reviews, Handoff. Each rule is in one of the two files, not both.

## Which path

**Two paths, and they are not the same job.** Decide before anything else.

| | **Prototype** | **Codebase** |
|---|---|---|
| **The question** | "Should we do this, and what should it look like?" | "Build this, we know we want it" |
| **What it is** | A page in DSNR made from the real components; nothing in the product repository changes | The real frontend in real files, tests included, as a branch for engineering |
| **Ends as** | Thrown away; the decision survives | A branch engineering takes over and completes |

**The request decides, and most requests say.** Start at once when it does; do not ask what the person already told you:

| The request says | Path |
|---|---|
| **prototype**, mock up, mockup, concept, sketch, explore, "what could it look like", "should we" | **Prototype**: start it now with `../skills/start-prototype.md` |
| **build it**, implement, "in the codebase", "real", "wire it up", "for engineering", "the feature" | **Codebase**: start it now |
| Neither: "make a Zone coverage page" | **Not decided**: ask, once, as a choice |

**Continuing work is decided by where you are.** On the product's prototype branch (`branchPattern.prototype` in its
`.dsnr/workspace.json`) it is an older prototype, on the product's own skill for that path. On its codebase branch
(`branchPattern.codebase`) with a request about that prototype, it is codebase work. A request that says "prototype" is a
prototype wherever the repository is checked out: a prototype changes nothing there.

**When the request does not say, ask as a choice, never in prose.** In Claude Code that is the
`AskUserQuestion` tool; in another agent, one plain question. Either way: one question, "Prototype or codebase?", the two
options above with their one line each, **neither marked recommended**: only the requester knows how settled the decision
is. **An agent that cannot ask** (a subagent, or a run nobody is there to answer): stop before changing anything and reply
with one line beginning `NEEDS PATH:` saying the request does not name one; the caller puts the choice to the person.

**Do not ask about anything else you can decide.** The prototype's id is a short kebab-case name from the request: pick it.
**Check the environment can support the answer first:** without the product's installed packages, neither path can
resolve the design system, typecheck or bundle, so say so and stop: the problem is setup.

**Silence never means codebase.** A prototype where the codebase was wanted throws work away; codebase changes where a
prototype was wanted put unreviewed code in real product files, and that does not undo cleanly.

**On the codebase path you build the actual frontend**: real file locations, real state, real routing, real permissions,
with **only the network stubbed**, in the product's mock layer (its manifest says where). The product's own repository
docs win on stack and tooling. Tests are required. The bar is a branch engineering takes over where their remaining work
is wiring the plumbing, not rebuilding yours.

- **Name the branch `branchPattern.codebase`**, with the prototype's id. When new work starts from the baseline, create it
  yourself before writing any file. DSNR finds the work by that name and `flock-designer/prototypes/<prototype-id>/`.
- **Record where the work is**, as `../skills/record-the-route.md` says, when the view first loads.
- **Build in the codebase** is watched, in the person's editor: `../skills/move-to-code.md` says what it needs.

## Is this a new prototype, or a later round of one?

**If `prototypes/<prototype-id>/` already exists, start there.** A later round does not re-derive what the previous one
recorded and a person corrected. Read the brief, the requests and the review, then **re-verify only what can have moved**:
the installed design system version, the baseline commit if the branch moved, and whatever the new feedback touches.

**If there is no prototype folder, this is a new prototype.** Create it, then read everything `ui-guide.md` lists.

## What DSNR adds to the contract

**`ui-guide.md`'s contract holds here.** In DSNR's workflow you also keep records inside the prototype folder.

## How you work

**Frame, open or create the prototype folder, build what was asked, review.**

### 0. The prototype folder first

Check `flock-designer/prototypes/` for this prototype. **It exists:** read it; its history and decisions still apply. **It
does not:** create `prototypes/<prototype-id>/`. Then write `prototypes/<prototype-id>/brief.md` from whatever context arrived, in whatever form, as
`request-guide.md` beside this file describes. Capture the user and job, the decision to make, the nearest existing
surface, how much to build, the states and interaction needed, and the **change boundary**: which files, components,
routes, states and interaction paths are in scope. When it arrived as notes or a transcript, say **who each point comes
from**: the people who use the product, or internal direction, never the one passed off as the other. And say what is
**not this round**: a later round leaves it alone unless the person moves it in. Ask only for what is missing and would
change what you build.

**A brief may start with a `---` block** (`folder: Admin`): that is the prototype's folder, set in the app. Keep it, exactly
as it is, at the top whenever you write or rewrite the brief; never add, change or remove it yourself.

### 1. How much to build, by path

**What varies is how much you build** (`ui-guide.md` says the rest, which holds on both paths):

| Path | How much |
|---|---|
| **Codebase** | **All of it.** Every state the feature really has, tests, the accessibility scan. It ships |
| **Prototype** | **What was asked for.** One screen means one screen; "click through the states" means build them |

**Handoff is not a level.** Handing work to engineering is its own step, `../skills/handoff.md`, run deliberately.

### 2. The two reviews

**On the codebase path they run at Handoff, not while you build.** The one exception is the implementation review: Build in the codebase has one implementation check of its own before it reports (`../skills/move-to-code.md`), so a boundary or wiring failure is found while it is cheap to fix. Elsewhere, before you report anything:

| Review | Asks | Definition |
|---|---|---|
| **Product parity** | Does this read as the product, or as generic SaaS? | `product-parity-reviewer.md` |
| **Implementation** | Is it built correctly, inside its boundary, accessibly? | `implementation-reviewer.md` |

Run them **as subagents** if the environment has them (read-only by design, which is real isolation). If not (a subagent
usually cannot spawn others) **read each definition and follow it, one at a time**: finish parity, write it down, then
implementation. **Say which way they ran**, and when you reviewed your own work, say so. Write both into
`prototypes/<prototype-id>/review.md`, one section per round, accessibility kept separate.

## Verification

Run the product's checks as `ui-guide.md` says. In DSNR's workflow they are commands in its `.dsnr/workspace.json`:
`check-iteration` after every round on the codebase path (types, lint and the tests for what changed, fast), and
`handoff`, the gate, at Handoff. **On the codebase path the order is build, check, commit, report.**

**Report which endpoints you stubbed (codebase path).** Your report ends with the mock handlers you added or relied on:
that list is exactly what engineering swaps for real endpoints.

**A round that is not committed does not exist.** Commit it, on its own branch, before you report, and only what the
round is: never sweep up unrelated files. If the previous round is uncommitted when you arrive, commit it as its
own snapshot first and say so.

## Skills

Read the file when the situation matches; none is registered with the environment, because each assumes everything in
this file.

| Read | When |
|---|---|
| `../skills/start-prototype.md` | A new prototype, or a change to one |
| `../skills/choose-existing-patterns.md` | Deciding whether to reuse, adapt, or create: **before building anything** |
| `../skills/recreate-from-reference.md` | Working from a screenshot, sketch, or Figma reference |
| `../skills/handoff.md` | Handing work to engineering; then the product's own part, which its README lists |
| `../skills/address-comments.md` | Addressing a prototype's open comments; DSNR puts it in the task |
| The product's own skills | As its `.dsnr/README.md` lists them |
