# Move a quick prototype into the code

**Shared by every product.** Nothing here names a product's tools or layout: where the repository
differs, this says to read what it declares for itself. The app puts this file in the task when
someone chooses **Build in the codebase** on a quick prototype.

A quick prototype is one React file built from this product's real components, made fast and without
running the product. Most of it is the real thing; what is not is marked. It shows **what is wanted**,
in real components. Your job is to put it where it really belongs in this product, write down what that
takes for a person to check, and then build it properly.

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
  - The block comment at the top: where in the product it sits, what it was modelled on, which person
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
   differs from the product's own way (a colour, a spacing, a behaviour), the product's own wins unless a
   decision above says otherwise.
4. **Data.** Every `@mock`: what the data really is, and where it comes from. This branch still uses mock
   data, in the way this repository already mocks things.
5. **What you will build, and where.** The files you will change or add, inside the project's
   change boundary in its brief.
6. **What you will not build**, and why.

## Then: the work

Build it as you would any codebase work here, following this repository's own agent instructions
and standards.

- **Move the unmarked code in as written,** split into the files where it belongs. Act on every mark as
  its note says: build the decision for each `@standin`, wire each `@mock` the way this repository mocks
  data, and delete each `@remove`. A marked part with no note is a finding to report, not a guess to make.
- Stay inside the change boundary. Mock data only.
- Record where the work is, as `skills/record-the-route.md` says, so it opens on the right page.
- Check the work with the repository's own checks, then commit on this branch. **No
  `Co-Authored-By` or other attribution line.** Never push, never switch branches.

## When you have finished

Say what you built, where, and what is waiting in **Needs a decision**. Point to the audit file.
