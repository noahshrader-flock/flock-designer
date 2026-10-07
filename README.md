# Flock Designer

Four things live here.

**[`flock-designer.md`](flock-designer.md)** — where everything stands. What Flock Designer is, what is built,
how it works and why, every contract, and the change log. If you are picking this up, start with its "Where things
stand" block. **[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)** is what is left to do; each fact is in only one of the two.

**`projects/`** — one folder per project. Drop in whatever context you have.

**`skills/`** — workflows the agent follows that are the same in every product, such as acting on a
reviewer's comments. The app puts the right one in the agent's task, so nobody has to find or install
it, and a product repository does not carry a copy.

**`standards/`** — the design standards that are not specific to any one product. The product's own
patterns and boundaries stay in the product repository; these are the ones that hold anywhere. See
[`standards/README.md`](standards/README.md) for how a product resolves them and which tier wins.

## The words

There are two kinds of work: a **prototype**, one page built from the product's real components to decide what
something should be, and **codebase work**, the real change, built to ship. Each has iterations, `I1`, `I2`.
**Address** asks the agent to act on one comment; **Hand off** is the full check before an engineer takes the
work. These and the rest are defined once, in [the vocabulary](flock-designer.md#vocabulary).

The app is for **discovery**: a prototype is reviewed in it, by anyone with the app and a GitHub account.
**Delivery** is engineering's, through their own pull requests and preview links.

## Starting a project

Make a folder under `projects/`. Put whatever you already have into it — a markdown file, a PRD, a
few screenshots, some links, a paragraph. There is no required format and no minimum.

`projects/_template.md` exists in case a blank page is annoying. Ignore it otherwise. Three
sentences is a legitimate way to start a project, and "here's the Figma, make it work on mobile" is
a legitimate way to start a project.

Everything the agent writes for that project lands in the same folder — the brief it wrote from your
context, what it read before building, the review, and the decisions you confirmed. One project, one
place, so picking up someone else's work means reading one folder.

A **prototype** is kept in its project's folder too, under `prototypes/`: one React file and the page
built from it, so anyone can open it without the product. Large files those pages share are kept once in
`projects/_shared/`, which is not a project.

## What a product repository provides

Everything here is shared; a product brings only what is true of it. To adopt Flock Designer, a repository
provides, beside a checkout of this one and of its design system (the folder named as the package is):

- **`.flkd/workspace.json`**, the app's contract with the product (`workspace/src/shared/contract.ts`,
  `WorkspaceDescriptor`): its name, its context folder, where prototypes go, its branch names, its design
  system package, and its commands. The app looks for these command ids:
  - `preview` serves an older prototype branch, `design-mode` serves the real product on mock data (each with
    `servesPreviewOn`);
  - `check-iteration`, the **light check**: fast, on what the branch changed, run after every step;
  - `handoff`, the **gate**: takes `<project-id>`, and refuses until the work is fit for engineering.
  Commands run through `npm`, `npx` or `node`.
- **`.flkd/`**: a manifest (its conventions, accessibility target and who signs off), its builder agent and
  two read-only reviewers (parity, and implementation), its own patterns and boundaries, and the product's
  part of each shared skill, such as what its gate checks and what its engineers pick up.
- **Its agent instructions** (`CLAUDE.md` or `AGENTS.md`) sending product work to that builder.

**Coke's (`flock-coke`, branch `noah/flock-designer`) is the worked example:** copy its `.flkd/`, its
`workspace.json` and its check scripts, and replace what is Coke's. Nothing here, or in the design system,
changes for a new product.

## What is not here

Code that runs inside the product. Codebase work lives in the product repository it was built
against, on its own branch, where it can actually run.
