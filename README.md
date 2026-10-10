# DSNR

These live here.

**[`dsnr.md`](dsnr.md)** — where everything stands. What DSNR is, what is built,
how it works and why, every contract, and the change log. If you are picking this up, start with its "Where things
stand" block. **[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)** is what is left to do; each fact is in only one of the two.

**`projects/`** — one folder per project. Drop in whatever context you have.

**`agents/`** — the builder (`dsnr.md`) and its two read-only reviewers, the same in every product. A product
carries only a three-line shim for each, so Claude Code finds them.

**`skills/`** — workflows the agent follows that are the same in every product, such as acting on a
reviewer's comments. The app puts the right one in the agent's task, so nobody has to find or install
it, and a product repository does not carry a copy.

**`standards/`** — the design standards that are not specific to any one product. The product's own
patterns and boundaries stay in the product repository; these are the ones that hold anywhere. See
[`standards/README.md`](standards/README.md) for how a product resolves them and which tier wins. How Flock looks and
speaks (its UI conventions, its voice and tone) is the design system's, in its own `.dsnr/`.

**`knowledge/`** — how the gap and setup-friction logs are written, the baselines and the pilot's questions. Each
product keeps its own rows.

## The words

There are two kinds of work: a **prototype**, one page built from the product's real components to decide what
something should be, and **codebase work**, the real change, built to ship. Each has iterations, `I1`, `I2`.
**Address** asks the agent to act on one comment; **Hand off** is the full check before an engineer takes the
work. These and the rest are defined once, in [the vocabulary](dsnr.md#vocabulary).

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

**Everything here is shared; a product brings only what is true of it, at these fixed names.** The shared agents read
them by name, so a product file never points back here. To adopt DSNR, a repository sits beside a checkout of this one
and of its design system (the folder named as the package is), and provides:

| File | What it holds |
|---|---|
| `.dsnr/workspace.json` | The app's contract (`workspace/src/shared/contract.ts`, `WorkspaceDescriptor`): its name, its context folder, where prototypes go, its branch names, its design system package, and its commands |
| `.dsnr/README.md` | Its index: each of its files and what it is for, its own skills, and its commands |
| `.dsnr/manifest.md` | Identity, stack, conventions, the accessibility target (and nowhere else), where things are, what is off-limits, how to run it |
| `.dsnr/standards/non-negotiables.md` | What each shared hard rule means here: its plumbing, its mock layer, its conventions |
| `.dsnr/standards/product.md` | Its measured conventions (casing, vocabulary) where they differ from Flock's |
| `.dsnr/implementation/` | What a prototype must never import, with the check that finds it, and what it may |
| `.dsnr/skills/` | Its part of a shared skill (what its gate checks, what its engineers pick up), and any path only it has |
| `.dsnr/knowledge/` | Its gap and setup-friction logs, rows only (`knowledge/README.md` here says how) |
| Its patterns | Whatever folders it needs (Coke: `composition/`, `product-patterns/`), listed in its README |
| `.claude/agents/<name>.md` | One shim per shared agent: frontmatter, then one line naming `../flock-designer/agents/<name>.md` |
| `CLAUDE.md` (or `AGENTS.md`) | A short section sending product UI work to the `dsnr` subagent |

**The commands** in `workspace.json`, by id: `preview` (an older prototype branch) and `design-mode` (the real product
on mock data), each with `servesPreviewOn`; `check-iteration`, the **light check**, fast, run after every step;
`handoff`, the **gate**, which takes `<project-id>` and refuses until the work is fit for engineering; `typecheck`,
`lint`, `a11y` and `boundary`, which the reviewers run; and `install` (`npm ci`), run from the New modal when packages
are missing. Commands run through `npm`, `npx` or `node`.

**The `CLAUDE.md` section**, as Coke has it:

```markdown
## Product UI and prototype work

Route requests to build, prototype, mock up, recreate, or critique a product view or UI through the **dsnr** subagent,
deciding the path first as its definition says (`../flock-designer/agents/dsnr.md`, "Which path") and naming it in the
task you hand over. If `dsnr`, or a reviewer, is not available as a subagent, read its shim in `.claude/agents/` and
follow it directly, saying so. Wait for whatever you hand to a subagent, in the foreground.
```

**Coke (`flock-coke`, branch `noah/dsnr`) is the worked example.** Copy the shape of its `.dsnr/`, its shims and its
check scripts, and replace what is Coke's. Nothing here, or in the design system, changes for a new product.

## What is not here

Code that runs inside the product. Codebase work lives in the product repository it was built
against, on its own branch, where it can actually run.
