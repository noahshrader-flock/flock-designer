# Staying up to date, and conflicts

The product keeps moving while you work: other people merge their changes into its main branch every day. Sooner or later
your work is *behind*: the main branch has commits your branch does not. Usually that is harmless. Sometimes the same
lines were changed on both sides, and git cannot combine them by itself. That is a *conflict*. DSNR watches for both,
tells you in plain words, and has the agent do the combining, where you can see it, and undo it.

## What DSNR checks for you

DSNR looks at the latest of the product's main branch on GitHub. It fetches it quietly, without touching your branches or
files. It works out two things:

- *How far behind* your branch is: how many commits the main branch has that it does not.
- *Whether it would merge cleanly*, and if not, which files would conflict. It works this out without merging anything: no
  file of yours changes.

You see it in the **Update this branch…** dialog, from the prototype's menu, and in the handoff dialog when the branch is
behind. It reads like: "feature/zone-coverage is 4 commits behind develop. It merges into develop cleanly." Or, when it
would not: "Merging develop into it conflicts in ZoneList.tsx."

## Bring codebase work up to date

1. Open the work's branch in the product, with nothing uncommitted.
2. Choose **Update this branch…** from the prototype's menu. It shows how the branch stands.
3. Press **Update this branch**. The agent merges the main branch in, in your window.

What the agent does:

- It merges; it never rebases, so your branch's history stays as it was.
- Where there is a conflict, it combines both sides so neither change is lost.
- If a conflict needs a decision only a person can make (two designs for the same thing, say), it stops, undoes the
  merge, and tells you what the decision is.
- Nothing is pushed.

Before the agent starts, DSNR remembers exactly where your branch was. If the update goes wrong, the task tells the agent
how to put the branch back exactly as it was.

DSNR never merges anything itself. It tells you, and the agent does it in front of you.

## Keep a prototype current

A prototype is modeled on a commit of the product. When that branch has moved on, the review bar, beside the version,
says how many commits it is behind, for example "3 behind latest". Press it to see which branch, then **Refresh to
latest**: the agent rebuilds the prototype on the latest code, in place. Its comments stay where they were. A prototype
never conflicts: it is rebuilt, not merged.

## What DSNR never does to your checkout

It never pulls, merges, rebases or stashes your work, and it never switches your branch without being asked. The only time
it moves your checkout is when you start or run codebase work, and then only when you have nothing uncommitted.

When your copy of a branch and GitHub's differ, DSNR says which it used and why: for example "Your local develop is 2
commits behind origin; origin's is used". So you know what a prototype or a check was based on.

## If something goes wrong

- *"Open … first: it is brought up to date where it is."* Check out the work's branch, then update again.
- *"… is in the middle of a merge. Finish it or abort it first."* A merge you started is unfinished. Finish it, or undo it,
  before asking for another.
- *"In …, N files are changed or new and not committed. Commit or stash them first, so the agent's changes are not mixed
  with yours."* Commit or stash your own changes first.
- *"How … stands against the product's default branch cannot be told here."* DSNR could not reach GitHub, or the product
  does not say which branch is its main one. Check your connection, and try again.
- *The product holds its own design system* (like Paradome): a component change and codebase work share one checkout,
  and DSNR says so when it refuses. See [The shapes a product can take](product-shapes.md).
