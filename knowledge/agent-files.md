# The agent files

An agent knows nothing about your product or your company until it reads something. DSNR's agent files are what it reads:
guidance on how to build UI here, step by step instructions for each kind of work, and the standards good work meets.
Most of it is shared by every product. Each product adds only what is true of it.

## Three layers

1. *The product's own* (its `.dsnr/` folder, in its repository): what the product is, its stack, its conventions, its
   patterns, and what each hard rule means there.
2. *The design system's* (its own `.dsnr/` folder): how its components and tokens are used, its conventions, and its
   voice and tone.
3. *The shared guidance*, in the design repository, the same for every product:
   - `agents/`: `agents/ui-guide.md`, how to build UI in any tool, which every task starts with; `agents/dsnr.md`, DSNR's
     own workflow; and the two reviewers, `agents/implementation-reviewer.md` and `agents/product-parity-reviewer.md`.
   - `skills/`: one file per kind of work: building a prototype, moving it into code, the handoff, addressing a comment,
     setting a product up. `skills/README.md` lists which each kind of work follows.
   - `standards/`: the hard rules (`standards/non-negotiables.md`), and the standards for any good product, in
     `standards/universal/`: accessibility, layout, copy, states.

An agent reads them in this order: the hard rules first, then the product, then the design system, then the product's own
repository docs, then the standards. If it cannot read one, it says so and stops rather than guessing.

## Which wins

- *The hard rules always win*, the shared ones and the product's version of them.
- *The product's own rule wins* over a shared one, for that product.
- *The product's repository docs* (its `AGENTS.md`, its `CLAUDE.md`) win on questions of stack and tooling, and never over
  the hard rules.
- *Accessibility is a floor.* A product can raise it, in its manifest, but never lower it.

`standards/README.md` has the full order.

## How an agent finds them

DSNR writes a few small files into the product with `dsnr agent-files`, one where each agent looks:

- a section of `AGENTS.md`, which every agent reads, sending UI work to the guide and to DSNR's builder;
- `CLAUDE.md`, containing just `@AGENTS.md`, so Claude Code reads the same section;
- a pointer per shared agent in `.claude/agents/` (for Claude Code) and `.agents/skills/` (for Codex).

They point at the design repository's clone beside the product, so the guidance is read where it lives and is never copied.
If the product already has a `CLAUDE.md` of its own, DSNR leaves it alone and says what to move into `AGENTS.md`.
`dsnr agent-files --check` says whether a product's copy is current.

A product also has a `dsnr.code-workspace` file, made by hand, which opens the product with the design repository and the
design system beside it in one window.

## What a product's own files should contain

The workspace file and the three files every agent reads first are what setup writes (see
[Setting a product up](setting-up.md)): `.dsnr/workspace.json`, `.dsnr/manifest.md`, `.dsnr/standards/non-negotiables.md`
and `.dsnr/README.md`. A product grows the rest as it learns what its agents need:

- *Its measured conventions*, where they differ from the shared ones (`.dsnr/standards/product.md`): how it capitalises
  titles, the words it uses.
- *What a prototype must never import*, with the check that finds it (`.dsnr/implementation/`).
- *Its patterns*: its page layouts, its tables and forms, as it builds them. Each pattern file should open with the commit
  and date it was measured at, so an agent knows how fresh it is.
- *Its own authoritative docs*, named in the manifest with when to read each, so an agent finds them (for example a folder
  of component guides, or engineering's instructions).
- *Its gap logs* (`.dsnr/knowledge/`): what agents got wrong, and what it took people to get running. See
  [Gap logs](gap-logs.md).

Add a file when the gap log shows it is needed, not in advance. Coke's `.dsnr/` is the fullest example.

## Why it works this way

- *Shared once, true everywhere.* A rule that holds for every product is written once, so every product gets an
  improvement at once.
- *Each fact in one place.* A product's file never repeats the shared guidance; it says what is different. Two copies of
  one rule always end up disagreeing.
- *Read where it lives.* Pointers, not copies, so a product never runs on an old version of the guidance.
