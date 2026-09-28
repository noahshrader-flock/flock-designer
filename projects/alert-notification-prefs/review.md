# Review record — alert-notification-prefs

## Iteration i1 — 2026-09-28

**Branch:** `fd/alert-notification-prefs/i1` · **Baseline:** `flock-coke` `noah/flock-designer` ·
**FUI:** 5.5.4 · **Level:** Test

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors in the prototype |
| `npm run lint` (Biome) | Pass |
| Bare `src/…` value-import grep | Pass — no matches |
| `npm run smoke:prototype -- alert-notification-prefs` | **Pass — bundles** |

**The smoke check was itself verified**, not assumed: injecting the exact import from the
2026-09-02 gap-log entry (`import { NetworkRelationship } from 'src/data/models/networkRelationship'`)
produced `tsc` 0 errors, Biome clean, and a smoke-check failure. Then reverted.

### Product parity

**Observed.** The settings row reproduces the canonical pattern from
`togglePreferenceRow.tsx` — title/subtitle left, control right, `FSDivider` between rows. The page
container matches `camerasPage.tsx:156`.

**Proposed.** The save/cancel pair at the bottom is a proposal, not a copied pattern — `orgPageV2`
uses a sticky footer, which was not reproduced here. If this went further, that is the first thing
to reconcile.

**Not reviewed.** No human has looked at this against a real product view. Parity claims above are
the agent's own reading of the pattern files, not a review.

### Accessibility

Target is the consuming product's, in `flock-coke/.flkd/manifest.md`. **No conformance level is
claimed here.**

| # | Check | Result |
|---|---|---|
| 1 | Keyboard reachability | **Not run** — needs a human at a keyboard |
| 2 | Tab order | **Not run** |
| 3 | Focus visibility | **Not run** |
| 4 | Focus management | Not applicable — no drawer, dialog or menu in this artifact |
| 5 | Accessible names | **Built for, not verified.** Each toggle is named by a `<label htmlFor>` bound to its input `id`. **Needs a screen-reader check** — `FSToggle` renders its own `FormControlLabel` wrapper with an empty label, and whether the external label wins has not been confirmed |
| 6 | Heading structure | Pass by construction — one `h1` in the host, no skips |
| 7 | Status announcement | **Built for, not verified.** Save confirmation renders an `FSAlert`; whether it announces has not been tested |
| 8 | Non-color signals | Pass — every state carries text, none relies on color alone |
| 9 | Error messages | Pass by construction — error and partial states say what failed and what to do |
| 10 | Reduced motion | Not applicable — no motion |

**Automated scan: not run.** Cypress could not be launched in this environment (the cached binary
rejects standard flags on this macOS version, recorded in the plan's known limitations). That is a
missing check, not a pass.

### Component gap — for the Design System

**`FSToggle` cannot be given an accessible name through its own API.** Its prop allowlist exposes
`label` and `labelPlacement` but no `aria-label`, `aria-labelledby`, or `inputProps`. When the
visible label is rendered separately — which the canonical settings row does — the only route left
is binding a native `<label htmlFor>` to the input `id`.

**This is not hypothetical.** `src/components/org/orgPageV2/common/togglePreferenceRow.tsx` renders
`<FSToggle label="" />` and every toggle in that row across the product is, as far as this review can
tell, unnamed.

Raised per the process in `flock-react-component-lib/.flkd/README.md`: logged here first, and
belongs in FUI for `@flocksafety/frontend-guild`. **Not yet filed** — it needs the Design System
owner named first.

### Open questions

1. Is the sticky-footer pattern from `orgPageV2` required here, or is a bottom action row acceptable?
2. Should permission-locked rows be hidden rather than shown disabled?
3. Does the partial state belong at all, or would a failed section retry in place?

### Decisions

**None.** Nothing here has been confirmed by a person. This artifact exists to prove the harness.
