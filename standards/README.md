# Shared standards

**Cross-product standards.** These hold for any Flock product that adopts DSNR, and they
carry no reference to any one product's stack, patterns, or codebase.

```
standards/
├── production-readiness.md   what has to be true before work is handed to engineering
├── flock/                    Flock's own, the same in every Flock product
│   └── voice-and-tone.md         how Flock's product speaks (written in the app's Voice and tone tab)
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

**Two of these reach every agent task without being named:** the app reads `universal/accessibility.md`
and `flock/voice-and-tone.md` each time it makes a task, and puts them in it. Nobody has to point at them.

## The tiers, and which wins

1. **A product's `non-negotiables.md`** — hard rules, always win
2. **`universal/accessibility.md`** — a floor. A product may raise it; nothing overrides it downward
3. **A product's Flock tier** (`.dsnr/standards/flock/`) — convention, density, tone, vocabulary.
   **Overrides the tiers below**
4. **`flock/`** — what is Flock's in every product: its voice and tone. **Overrides the universal design
   tier below**
5. **`universal/`** (design + interaction) — applies wherever the tiers above are silent

**The one asymmetry:** accessibility sits in the universal tier but behaves differently from the rest
of it. Design judgment is overridable by product convention; conformance is not. A product may commit
to a *higher* bar, never a lower one.

## What does not belong here

- **A conformance level.** The target is a per-product setting and lives in that product's
  `.dsnr/manifest.md`. A file here that states a level competes with it and will be wrong for someone.
- **A product's patterns, components, routes, or stack.** That is product intelligence.
- **A convention justified by one product's evidence.** If a count came from one codebase, say so —
  otherwise one product's habits become a Flock-wide rule by accident.

## Changing one of these

A change here reaches every adopting product, so it goes through review rather than a direct edit.
Repeated evidence from real work is what justifies a change — see a product's gap log.

`flock/voice-and-tone.md` is changed the same way from the app: its Voice and tone tab saves an edit
to a branch of its own and proposes it as a draft pull request. A commit made here shows in the tab.
