# Production readiness

The bar work has to clear before it is handed to engineering. **How** a handoff is done (the product's gate,
both reviews, the fixes, the note for the engineer) is `../skills/handoff.md`; this file is what has to be
true by the end of it. Most prototypes should never graduate, and that's the system working.

## Two paths, two ways to hand over

- **A prototype is never merged.** It is one page kept in the design repository, optimized for answering a
  design question fast, with mock data and no plumbing; merging it would import every shortcut as tech debt on
  day one. **Moving it into the code** (`../skills/move-to-code.md`) starts codebase work from it, and that
  codebase work is what is handed over. **What transfers** is the resolved design: component choices, layout,
  hierarchy, copy, interaction model, and the view states.
- **Codebase work is handed over as its branch:** real wiring, with only the product's data source stubbed,
  so engineering's remaining work is replacing the stubs, not rebuilding what was built.

## Ready for engineering

| | |
|---|---|
| **Design settled** | Not still iterating. Engineering reviewing a moving target wastes everyone's time |
| **Every state the feature has is built** | Per `universal/interaction-states.md` — designed, not stubbed. Work being handed to engineering owes all of them |
| **Copy final** | Real labels, real error messages, real empty-state text |
| **Boundaries intact** | The implementation review is clean: no production plumbing on a prototype, nothing outside the change boundary |
| **Verifies clean** | The product's handoff gate passes |
| **Parity reviewed** | The parity review ran, and its blocking findings are resolved |
| **Accessibility** | Meets the conformance target in the consuming product's `.dsnr/manifest.md` |
| **Open questions listed** | Everything guessed at, written down |

Who signs off is named in the consuming product's `.dsnr/manifest.md`. If it isn't, that's a gap to close before the first
graduation, not after.

What the engineer is told is in `../skills/handoff.md` (the handoff note), not repeated here.
