# Codebase work, unattended

**Shared by every product.** The app puts this file in the task of every agent run it starts on a
product's codebase branch: codebase work started from **New**, and **Build in the codebase**. The product's
own agent instructions say how to build there; this says how an unattended run starts and finishes, which
is the same everywhere.

## Nobody is there to answer

The run ends when you stop. Nobody can answer a question, confirm a plan or look at it later.

- **Where the product's guidance says stop, ask or confirm, do not.** Write the question where the
  work's record keeps decisions (the audit's **Needs a decision**, or the context receipt's assumptions),
  build the nearest thing the product already has, and carry on.
- **Finish before you stop.** Never end while anything you started is still going: another agent, a
  background command, a server. Wait for each in the foreground, or stop it. Work still going when you
  stop is lost.

## While you build

- **Check each step with the product's light check**, named in the task (its workspace file's
  `check-iteration` command), and fix what it finds. Run only the tests that cover what you changed, never
  the whole suite.
- **Commit as you go,** not only at the end: work left uncommitted when the run stops is lost. Commit on
  this branch, with **no `Co-Authored-By` or other attribution line.** Never push, never switch branches.
- **Record where the work is**, as `record-the-route.md` (beside this file) says, so it opens on the right
  page.

## What is not this run's job

The reviews and the full checks happen once, at **Handoff**, when the work is where it belongs. This run's
job is to get it there, on the product's standards, and say what is left.

## When you have finished

Say what you built, where, the light check's result, and what is still open. Say that the reviews run at
Handoff.
