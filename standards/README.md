# Shared standards

**Cross-product standards.** These hold for any Flock product that adopts DSNR, and they carry no reference to any one
product's stack, patterns, or codebase.

```
standards/
├── non-negotiables.md        hard rules, the same in every product
├── production-readiness.md   what has to be true before work is handed to engineering
├── design-system-code.md     how an agent changes a design system's own code (adjusting a component)
└── universal/                portable; would hold at any company
    ├── accessibility.md          a floor nothing overrides
    ├── interaction-states.md     the seven view states
    ├── general-product-design.md
    ├── layout-judgment.md
    └── copy-and-microcopy.md
```

How Flock looks and speaks is the design system's: `product-native-ui.md` and `voice-and-tone.md` in its `.dsnr/`.

## Which wins

**Said here, once.** Every agent and skill follows this order; no product file restates it.

1. **Hard rules:** `non-negotiables.md` here, and the product's `.dsnr/standards/non-negotiables.md`. Always win
2. **`universal/accessibility.md`**: a floor. A product may raise it, in its `.dsnr/manifest.md`; nothing overrides it
   downward
3. **The design system's facts:** component APIs and token names, from the installed package
4. **The product's repository docs** (`AGENTS.md`, `CLAUDE.md` and the like): on stack and tooling questions
5. **The product's conventions**, `.dsnr/standards/product.md`: measured from its real views, so they win over Flock's
   where they differ
6. **Flock's conventions and voice**, the design system's `product-native-ui.md` and `voice-and-tone.md`. A blank voice
   and tone file adds nothing until it is written
7. **`universal/`** (design and interaction): wherever the tiers above are silent

**The one asymmetry:** accessibility sits in the universal tier but behaves differently from the rest of it. Design
judgment is overridable by product convention; conformance is not.

## How a product reaches these

A sibling checkout, the same arrangement the design system's guidance uses: `flock-designer/` beside the product. The
product's agent files point at `../agents/`, and the shared agents read the product's `.dsnr/` by the file names in
`../README.md` ("What a product repository provides"). The app also puts the accessibility rules and the voice and tone in
every task it makes, so a run from the app has them without reading anything. Becoming a package follows when the content
stops moving and a second product adopts it.

## What does not belong here

- **A conformance level.** The target is a per-product setting, in that product's `.dsnr/manifest.md`.
- **A product's patterns, components, routes, stack, or commands.** That is product intelligence.
- **A convention justified by one product's evidence.** If a count came from one codebase, it is that product's
  `standards/product.md`, not a Flock-wide rule.
- **How Flock looks or speaks.** That is the design system's.

## Changing one of these

A change here reaches every adopting product, so it goes through review rather than a direct edit. Repeated evidence
from real work is what justifies a change: see a product's gap log.
