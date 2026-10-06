# Move a quick prototype into the code

**Shared by every product.** Nothing here names a product's tools or layout: where the repository
differs, this says to read what it declares for itself. The app puts this file in the task when
someone chooses **Build in the codebase** on a quick prototype.

A quick prototype is an approximation: one HTML page, made fast, often by someone who does not work
in the code. It shows **what is wanted**. It is not how to build it. Your job is to work out how this
product would really do it, write that down for a person to check, and then build it properly.

## What you are given

- **The quick prototype's page**, at the path the task gives. Read it; never change it. What it marks:
  - `data-component="..."`: the real component that part stands in for.
  - `data-component="none"` with `data-gap="..."`: a part the product has no way to do today. Every one
    of these is a decision, and goes under **Needs a decision**.
  - A token name beside each colour and size in its styles: use the token, never the value.
  - `data-e2e-ref`: the parts people commented on.
  - The comment at the top: where in the product it sits, what it was modelled on, which person the
    navigation shows, its states and its gaps.
- **This repository**, on the project's codebase branch, and the project's records in the design
  repository (the brief, any comments), as for any other codebase work. **Read this product's Flock
  Designer guidance as you would for any codebase work**: it says how the app is put together and which
  patterns to use. The page approximated those; the guidance is the real thing.

## First: the audit

Write the audit to the file the task names **before you change any code.** It is for a designer and
an engineer to read together, so write it in plain words, not code.

1. **Needs a decision.** First in the file. Anything the page shows that this product has no clear
   way to do, or where the page and the product's patterns disagree. Say what you will build in the
   meantime (the nearest thing the product already has) so the work is not blocked.
2. **What the page shows.** The screens, states and interactions, in a few lines.
3. **Part by part.** For each part of the page: the real component or pattern it becomes, and where
   that lives in this repository. Where the page's version differs from the real one (a colour, a
   spacing, a behaviour), say which wins: **the product's own**, unless a decision above says
   otherwise.
4. **Data.** What each piece of data on the page would really be, and where it would come from.
   This branch still uses mock data, in the way this repository already mocks things.
5. **What you will build, and where.** The files you will change or add, inside the project's
   change boundary in its brief.
6. **What you will not build**, and why.

## Then: the work

Build it as you would any codebase work here, following this repository's own agent instructions
and standards.

- **Use the real components and tokens.** Do not copy the page's markup or styles: they were an
  approximation. Its stable names (`data-e2e-ref`) are worth keeping where the product's own code
  supports them.
- Stay inside the change boundary. Mock data only.
- Record where the work is, as `skills/record-the-route.md` says, so it opens on the right page.
- Check the work with the repository's own checks, then commit on this branch. **No
  `Co-Authored-By` or other attribution line.** Never push, never switch branches.

## When you have finished

Say what you built, where, and what is waiting in **Needs a decision**. Point to the audit file.
