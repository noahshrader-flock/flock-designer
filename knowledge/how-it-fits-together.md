# How it fits together

DSNR lets you design with the real product: prototypes built from the components and patterns engineering ships, and,
when a design is ready, the same work moved into the product's code. It lives in VS Code, in a panel on the left, and the
building itself is done by an AI agent you already use (Claude Code, Codex or GitHub Copilot).

Five things work together. Each has one job.

## The product

The repository of the app you are designing for (at Flock, `flock-coke`). It is real code that engineering owns. DSNR
reads it to build prototypes that look and behave like it, and works in it only when you move a design into the code.

A product knows it uses DSNR because it has a small folder, `.dsnr/`, with a file called `.dsnr/workspace.json`, the
*workspace file*. That file tells DSNR the product's name, how its team names branches, which design system it uses,
and the commands DSNR may run there (installing packages, running the app on fake data, its checks). DSNR never runs
anything the workspace file does not list. The rest of `.dsnr/` is guidance for agents: what the product is, its
conventions, and its rules. [Setting a product up](setting-up.md) explains how these files are made.

## The design system

The library of components and tokens the product is built from (at Flock, FUI, `flock-react-component-lib`). DSNR shows it
in its Design System tab, builds prototypes from it, and lets you try a change to it and propose that change.

It can sit in three places: in a repository of its own, checked out beside the product; as a package inside the product's
repository (a monorepo); or as the product itself. [The shapes a product can take](product-shapes.md) explains each.

## The design repository

The company's shared repository for design work (at Flock, `flock-designer`, which this page is in). It holds two
kinds of things:

- *The projects*, in `prototypes/`: one folder per project, with its brief, its prototypes, its reviews and the record of
  its work. This is the shared memory: anyone on the team can pick up a project from its folder.
- *The guidance every agent follows*, the same for every product: `agents/` (how to build UI here), `skills/` (step by
  step instructions for each kind of work), `standards/` (what good work is, everywhere), and `knowledge/` (these pages).

Its clone sits beside the product on your computer. The product says which design repository it belongs to; with nothing
said, it is Flock's.

## The panel

DSNR's panel in VS Code, with two tabs:

- **Projects**: every project, with its prototypes and its open comments. Pressing one opens its newest prototype for
  review.
- **Design System**: the product's components and tokens, with your changes being tried.

The panel works on the folders you have open in VS Code. One window is one product: open the product's folder, and the
design repository and design system beside it, and DSNR finds each.

## The agent

The AI that does the building. DSNR never builds anything itself: it writes a precise task for the agent, with the
guidance it must follow, and hands it over. You watch the agent work in its own window, and step in when you like.

Which agent is your choice. With one signed in, DSNR uses it; with several, it asks you once and keeps your answer. You can
change it with **DSNR: Choose the agent**.

## Words you will see

- *Repository*: a project's files and their whole history, kept on GitHub. The product, the design system and the design
  repository are each one.
- *Clone*: your copy of a repository, on your computer.
- *Branch*: a separate line of work in a repository, so changes can be made without touching the main one until they are
  ready. The main branch (often `develop` or `main`) is what everyone builds on.
- *Checkout*: the files of a clone as they are on your computer right now, on whichever branch you have open.
- *Commit*: a saved point in a repository's history. *Push*: sending your commits to GitHub.
- *Pull request*: a request, on GitHub, to bring a branch into the main one, where others review it first. A *draft* one
  is not yet asking for review.
- *Behind*, and a *conflict*: see [Staying up to date](staying-up-to-date.md).

## Why it is built this way

- *The real thing, not a picture of it.* A prototype made from the product's own components can be handed to
  engineering without being redrawn, and what reviewers comment on is what will ship.
- *Nothing is hidden in the app.* Projects, comments and guidance are files in a repository, readable by anyone, with
  their history.
- *You stay in control.* DSNR does the bookkeeping (recording versions, saving pages, publishing them), and never does
  the things that are yours: it does not commit to the product for you or merge, it pushes code only when you ask it to
  share, and it never changes your checkout without saying so.
