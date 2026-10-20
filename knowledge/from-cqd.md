# From CHEQ's .CQD

Paradome, CHEQ's product, has an older agent system of its own in its `.CQD` folder: a designer agent, review checklists,
standards, step by step workflows, reference maps and project notes. DSNR's agent files do the same job, shared across
products. This page is for CHEQ, when it moves Paradome onto DSNR: where each part of `.CQD` goes, and where DSNR works
differently.

Nothing here has been applied to Paradome. It is a map to follow.

## Where each part goes

| In `.CQD` | In DSNR |
|---|---|
| The README, and the designer agent that routes work | The shared `AGENTS.md` section that `dsnr agent-files` writes, and the shared builder, `agents/dsnr.md` |
| The identity file (the agent's name, the product's) | The product's `.dsnr/manifest.md` |
| The three review modes, and `reviews/` | The shared reviewers, `agents/implementation-reviewer.md` and `agents/product-parity-reviewer.md`; CHEQ's own checks go in Paradome's `.dsnr/implementation/` |
| The CUI component and token standards, and the component map | The design system's own `.dsnr/`. CUI lives in Paradome's repository, so that is a folder of Paradome |
| Composition, layout, shell and dashboard standards, and the reference maps | Paradome's `.dsnr/composition/` and its pattern files, as Coke's are |
| Its non-negotiables | Split: what holds anywhere is already in `standards/non-negotiables.md`; what is CHEQ's goes in Paradome's `.dsnr/standards/non-negotiables.md` |
| The general design standards (layout, states, accessibility, copy) | Already shared, in `standards/universal/` |
| Briefs, checklists and project notes | The design repository's `projects/`, one folder per project |
| Paradome's own `CLAUDE.md` | Its `AGENTS.md`, with `CLAUDE.md` as `@AGENTS.md`, so every agent reads the same instructions |
| The smoke test and the ready-made briefs | Nothing: DSNR writes each task itself |

## What DSNR learned from it

Four practices in `.CQD` were worth having for every product, so DSNR adopted them once, in the shared guidance:

- Use a component as it ships: changing its size, spacing, type or look needs a stated reason.
- A claim about how a page looks needs the page itself, and spacing and alignment are measured, never judged from a
  picture.
- Made-up data is fixed: never random, and never relative to today's date.
- A brief written from notes says who said what, and what is not part of this round.

And two recommendations for every product's own files, in [The agent files](agent-files.md): name the product's own
authoritative docs in its manifest, and date each pattern file with the commit it was measured at.

## Where DSNR works differently

- *One builder, not one per domain.* DSNR has a single shared builder; what is particular to a product is in that
  product's `.dsnr/`.
- *A prototype never touches the product.* `.CQD` puts prototypes in the product's code, behind a route or a flag. DSNR keeps
  them in the design repository, and moves a design into the code only as codebase work.
- *It asks, rather than assuming.* When a request does not say whether it is a prototype or codebase work, DSNR asks.
  `.CQD` assumes a prototype.
- *A prototype is never promoted.* `.CQD` moves a prototype's files into production. DSNR builds the real thing fresh,
  from an audit of every shortcut the prototype took.
- *No review of a prototype.* DSNR's reviews are for codebase work, at the handoff.
- *States are built when asked*, and switched in the review bar, not by a toggle inside the page.
- *The product's docs win only on stack and tooling*, never over the hard rules.
- *Project notes live in the design repository*, shared, not in the product.
- *The accessibility target is stated once*, in the product's manifest.
- *A prototype's text moves into translation files* when it moves into the code, not before.

`.CQD` also says some things twice, in ways that disagree (a token path one file uses and another says does not exist).
This is why DSNR keeps each fact in one place.
