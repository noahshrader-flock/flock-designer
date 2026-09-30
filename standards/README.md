# Shared standards

**Cross-product standards.** These hold for any Flock product that adopts Flock Designer, and they
carry no reference to any one product's stack, patterns, or codebase.

```
standards/
├── production-readiness.md   what has to be true before work is handed to engineering
└── universal/                portable; would hold at any company
    ├── accessibility.md          a floor nothing overrides
    ├── interaction-states.md     the seven view states
    ├── general-product-design.md
    ├── layout-judgment.md
    └── copy-and-microcopy.md
```

## How a product resolves these

A sibling checkout today, the same arrangement FUI context uses:

```
your-product/
../flock-designer/standards/      <- this directory
```

A product's agent files reference them by that relative path. Becoming a package follows on the same
terms as FUI's: when the content stops moving and a second product adopts it.

## The three tiers, and which wins

1. **A product's `non-negotiables.md`** — hard rules, always win
2. **`universal/accessibility.md`** — a floor. A product may raise it; nothing overrides it downward
3. **A product's Flock tier** (`.flkd/standards/flock/`) — convention, density, tone, vocabulary.
   **Overrides the universal design tier below**
4. **`universal/`** (design + interaction) — applies wherever the tiers above are silent

**The one asymmetry:** accessibility sits in the universal tier but behaves differently from the rest
of it. Design judgment is overridable by product convention; conformance is not. A product may commit
to a *higher* bar, never a lower one.

## What does not belong here

- **A conformance level.** The target is a per-product setting and lives in that product's
  `.flkd/manifest.md`. A file here that states a level competes with it and will be wrong for someone.
- **A product's patterns, components, routes, or stack.** That is product intelligence.
- **A convention justified by one product's evidence.** If a count came from one codebase, say so —
  otherwise one product's habits become a Flock-wide rule by accident.

## Changing one of these

A change here reaches every adopting product, so it goes through review rather than a direct edit.
Repeated evidence from real work is what justifies a change — see a product's gap log.
