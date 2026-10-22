# Committing

A *commit* is a saved point in a repository's history: what changed, by whom, and why. DSNR works with two repositories,
and they are committed differently. The short version: DSNR saves design work for you, and never commits product code for
you.

## Prototypes: saved for you, in the design repository

You never commit a prototype. When a version is built, DSNR saves its source and its page into the design repository's
`prototypes/` folder, and keeps the project's record (`work.json`) up to date. Then it commits and pushes those files to
GitHub with your own git sign-in, in the background, whenever they change: after a build, after a comment is addressed,
when the project list is read, and when VS Code comes back into focus.

It commits only the `prototypes/` folder, on top of the latest from GitHub, and it never rebases, stashes or changes your
checkout of the design repository. The panel's sync status shows **Synced** once everything has reached GitHub, and
**Sync now** pushes at once.

*If the records are held back:* when the design repository has other changes of yours waiting to be pushed (a change to the
shared guidance, say), DSNR holds the records back rather than push your other work for you. Push those yourself, and the
records follow.

## Codebase work: committed by the agent, on its branch, in the product

When a prototype moves into the code, the agent makes every commit, on the work's own branch, as it goes: the audit, each
step of the real code, each fix from a review. It never pushes and never switches branches. You see every commit in the
branch's history and can change anything.

DSNR's own git actions in the product are few, and each is one you start:

- *Making or moving to the work's branch*, when you press **Build** or **Run locally**. It needs a clean checkout, so
  nothing of yours is carried along or lost.
- *Remembering where a branch was* before an update, so the update can be undone (see
  [Staying up to date](staying-up-to-date.md)).
- *Pushing the branch*, only when you ask it to share the work (below), and never by force.

## Getting it to engineering

Codebase work reaches engineering as a branch on GitHub with a pull request. After a successful handoff, DSNR offers
**Open a draft pull request**: it pushes the branch and opens a draft pull request with your own GitHub sign-in. When the
product's workspace file says how to build a preview of a branch, the pull request gets a preview link too.

Today the pull request DSNR opens is made for its preview, and says it is not to be merged. An engineer takes the branch on
from there, in their own pull request or by making that one ready. Either way, DSNR never marks a pull request ready and
never merges.

## The design system: saved to its own branches

Changes to the design system are saved to branches of their own in the design system's repository, and proposed as draft
pull requests. [The design system](the-design-system.md) explains it.

## Why it works this way

- *Design work is bookkeeping, so DSNR does it.* A version, its record and its page belong together, and keeping them in
  step by hand would be easy to get wrong.
- *Product code is engineering's, so a person commits it.* The agent commits, you review, and nothing reaches the product's
  main branch except through engineering's own review.
- *Your work is never pushed for you by surprise.* DSNR pushes only the design records automatically, and only when nothing
  else of yours is waiting.
