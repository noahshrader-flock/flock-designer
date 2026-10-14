# Move a prototype into the code

**Shared by every product.** Nothing here names a product's tools or layout: where the repository
differs, this says to read what it declares for itself. The app puts this file in the task when
someone chooses **Build in the codebase** on a prototype.

A prototype is one React file built from this product's real components, made fast and without
running the product. Most of it is the real thing; what is not is marked. It shows **what is wanted**,
in real components. Your job is to put it where it really belongs in this product, write down what that
takes for a person to check, and then build it properly.

**This is codebase work, with the person watching** (it opens in their editor). Check each step with the
product's light check, named in this task, and fix what it finds. Commit as you go, on this branch, with
**no `Co-Authored-By` or other attribution line**; never push, never switch branches. The full checks and
the two full reviews are not this run's: they happen at **Handoff**. This run has one check of its own,
before it reports (**Before you report**). What follows is only what moving a prototype adds.

- **The agent that builds writes the audit.** If this repository hands the work to another agent, give it
  this file unchanged, with the paths the task names; do not paraphrase it.

## What you are given

- **The prototype's source**, at the path the task gives. Read it; never change it. Unmarked code is the
  real thing: real components and tokens, to move in as written. The rest is marked, one comment line
  above each part, with what to do on the move:
  - `@standin`: something this product cannot do today, approximated. **Each is a decision**, and goes
    under **Needs a decision**.
  - `@mock`: data standing in for something real. Each is a data task: where the real data comes from.
  - `@remove`: scaffolding that exists only so the prototype ran (a state switcher, a hand-made shell).
    Delete it.
  - `data-e2e-ref`: the parts people commented on. Keep them where this product's code supports them.
  - The block comment at the top: where in the product it sits, what it was modeled on, which person
    the navigation shows, its states, and every mark, grouped by kind.
- **Its built page**, at the path the task gives, to see what reviewers saw.
- **This repository**, on the project's codebase branch, and the project's records in the design
  repository (the brief, any comments), as for any other codebase work. **Read this product's Flock
  Designer guidance as you would for any codebase work**: it says where this belongs and which patterns
  to use.

## First: the audit

Write the audit to the file the task names **before you change any code.** It is for a designer and
an engineer to read together, so write it in plain words, not code.

1. **Needs a decision.** First in the file. Every `@standin`, with its own "on move" note, and anything
   else where the prototype and this product's patterns disagree. Say what you will build in the meantime
   (the nearest thing the product already has) so the work is not blocked.
2. **What the page shows.** The screens, states and interactions, in a few lines.
3. **Where each part goes.** The prototype is one file; the product is not. For each part: the file it
   belongs in, and what it is wired to (routing, state, permissions, flags). Where the prototype's version
   differs from the product's own way (a color, a spacing, a behavior), the product's own wins unless a
   decision above says otherwise.
4. **Data.** Every `@mock`: what the data really is, and where it comes from. This branch still uses mock
   data, in the way this repository already mocks things.
5. **What you will build, and where.** The files you will change or add, inside the project's
   change boundary in its brief. **If the brief has none, propose one here**, and count every mock,
   fixture or file other screens also use as outside it (see below).
6. **What you will not build**, and why.

### What the prototype could not know

It was made quickly, from what was on screen. Before you build, find out what the product already
does around it, and put it in the audit:

- **An action the product already has keeps its rules.** Where the prototype offers one (delete,
  edit, assign), find every rule the product's own version applies: who may use it, which items it is
  never offered on (read-only, in use, system), what it confirms. Carry them all over.
- **Every state the data can be in,** including none at all, an error and a slow answer: not only the
  states the prototype shows.

## Then: the work

Build it as you would any codebase work here, following this repository's own agent instructions
and standards, and the task's **Accessibility** section: the rules, and this product's target, read from its manifest for you. What the prototype's check left open is listed
there: fix each in the code, or say in the audit why not.

- **Move the unmarked code in as written,** split into the files where it belongs. Act on every mark as
  its note says: build the decision for each `@standin`, wire each `@mock` the way this repository mocks
  data, and delete each `@remove`. A marked part with no note is a finding to report, not a guess to make.
- Stay inside the change boundary. Mock data only. **Mock data reproduces the prototype's sample;** do
  not mix unrelated rows into a view people will review without saying so.
- **Changing something other screens use** (a mock handler, a fixture, a shared component): show that
  each existing caller still gets what it got, with the request that caller really sends, and test it.
- **When the work changes after the audit** (something found while building, later a review finding),
  update the audit to match in the same commit. It is what people check the work against.

## Before you report: check your own work once

The light check says the work compiles and its tests pass. It does not say the work stayed inside its
boundary, or is wired the way this product does it: that fails quietly, and costs more to fix at Handoff.
So check it once now, with the implementation reviewer, `../agents/implementation-reviewer.md`. It
covers code and boundary only; **product parity stays at Handoff.**

- **Commit what you have first,** with the light check passing, so the review sees all of it. It reviews
  this branch's changes against the branch it started from, with the audit and the project's brief
  (its change boundary) as what the work is checked against.
- **Where the agent runs subagents, run it as a subagent, in the foreground,** and wait for it. Never in
  the background: this run ends when you stop, and a review still going is lost.
- If subagents are not available, read the definition and follow it directly, and say that you did. A
  review of your own work is weaker than a second reader, and much stronger than none.
- **Fix every finding it calls blocking,** and the quick, clearly right should-fix ones. **Commit after each
  fix,** with the light check passing, and update the audit in the same commit when the work changed.
- If you fixed anything, check **once more,** the same way, and no more than that. What still blocks after
  the second check is **still open**: say so, and never make a check pass by editing it.
- A check that could not run is **not run**, with what would make it runnable, never a pass.
- The check's words are for your report, not for the project's review record: that is Handoff's.

## When you have finished

Say what you built, where, the light check's result, **how the implementation check ran** (a subagent, or
yourself) **and what it found: what you fixed, and what is still open**, and what else is waiting: what is
in **Needs a decision**, and where the audit is. Say that product parity and the full gate run at Handoff.
