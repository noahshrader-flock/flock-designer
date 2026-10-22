# Working in the codebase

When a prototype is right, the next step is the real thing: the same design built into the product's code, with real data
and real behaviour, on a branch an engineer can pick up. DSNR calls this *codebase work*. The agent does the building, in
the product's repository, on its own branch, and you watch it.

## Start it

1. In the panel, open the prototype's menu and choose **Build**. Or, with the prototype open, use **Build in the codebase…**
   from the review tab's menu.
2. The dialog shows which branch the work starts from. It defaults to the branch the prototype was modeled on, and offers
   only branches that have the product's DSNR files. DSNR makes a new branch for the work (at Flock, `feature/` and the
   prototype's id) and moves your checkout to it.
3. Press the button to hand it to your agent, and watch.

Your checkout must have no uncommitted changes, because DSNR is about to switch branches. If it has some, the dialog says so:
commit them or put them aside first. If the prototype already has codebase work, the dialog continues it on its branch
instead.

## What the agent does

1. *An audit first.* Before changing any code, the agent writes `audit-v1.md` (named after the version) in the prototype's
   folder. The prototype marks every shortcut it took: a stand-in for a component that does not exist yet, made-up data,
   things that must be removed, and a component drawn differently from how it ships. The audit turns each into a decision,
   a data task or a deletion.
2. *The real code.* It builds the feature in the product the way the product builds things: real state, real routing,
   real data where the product has it.
3. *A light check after every step.* The product's fast check (at Flock, `npm run check:iteration`) runs after each change,
   so a mistake is caught while it is small.
4. *Commits as it goes*, on the work's branch. It never pushes and never switches branches.
5. *One review.* The implementation reviewer checks the work once, and the agent fixes what it finds. The full reviews
   are the handoff's.

## Run it

Choose **Run locally** from the prototype's menu. DSNR starts the product on your computer with made-up data (the product's
own design mode, so you need no real accounts), and opens it at the page the work is on. It checks the page actually
loads before saying it is ready.

If your checkout is on another branch, DSNR moves it to the work's branch first, which needs a clean checkout.

## Review and comments

Codebase work is reviewed where engineering reviews code: on its pull request, on GitHub. Comments pinned in DSNR are for
prototypes. To have the agent act on a comment about codebase work, ask it in its window; the shared instructions have it
make one commit per comment, on the branch.

## Why it works this way

- *One branch per prototype.* A second build continues the same branch, so the work and its history stay in one place.
- *The audit comes first* so that nothing the prototype faked slips into the product unnoticed.
- *Your checkout is never changed silently.* DSNR switches branches only when you start or run the work, and only when
  nothing would be lost.

## If something goes wrong

- *"There are uncommitted changes in … Commit or put them aside before starting a new branch."* Commit or stash your
  changes, then start again.
- *"… has no DSNR setup (.dsnr/workspace.json), so DSNR cannot work in it."* The branch you chose predates the product's
  DSNR files. Start from a branch that has them, or merge one into it.
- *"… already has codebase work recorded. Use Continue on it."* The prototype has a branch already: continue it.
- *Run locally says the product declares no design mode.* The product has no command to run itself on made-up data. Its
  team adds one; see [Setting a product up](setting-up.md).
