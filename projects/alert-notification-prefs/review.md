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

### Implementation

**Run 2026-09-29 as a subagent**, against `.flkd/agents/implementation-reviewer.md`. It was never run
when this artifact was built — that session had no dispatch and nothing told it what to do instead.
Reviewing after the fact is weaker than reviewing before delivery; weigh it accordingly.

**Boundary: clean.** Seven files, all under `src/prototypes/alert-notification-prefs/`. No Redux, no
`injectEndpoints`, no flags, no auth, no telemetry, no `fetch`, no `process.env`, no bare `src/`
imports, no new dependency, no route registered.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Major | **The recorded `InheritedViolation` was not one.** The spec claimed nothing here could stop the toggle carrying two labels. `FSToggle`'s `label` takes a ReactNode, so the title and subtitle go *in* it with `labelPlacement="start"` — one label, clean scan. Verified independently before acting on it | **Fixed, and the record deleted.** A suppression that is merely untrue is worse than no scan: it looks like diligence |
| 2 | Major | **The lock reason was reachable only by pointer.** A tooltip on a disabled control reaches neither keyboard nor screen reader, and three of seven states render a locked row | **Fixed.** The reason is text in the row |
| 3 | Major | **Heading structure skipped h1 → h6.** `variant="subtitle1"` maps to `<h6>`, so four row titles were level-6 headings under the host's single `<h1>` — and they are form labels, not headings | **Fixed** with `component="span"`. Note the scan could never catch this: `heading-order` is tagged best-practice, outside the configured WCAG 2 A set |
| 4 | Major | **The `partial` state contradicted itself** — a "device alert preferences couldn't be loaded" banner rendered above the device row. The brief names partial load as one of two things this artifact exists to exercise, so it was not posing its question | **Fixed.** `partial` now has its own dataset with that row absent |
| 5 | Major | `npx tsc --noEmit` was red — in the shared a11y harness, not this prototype | **Fixed** on the baseline |
| 6 | Minor | A `style` prop, which standards §4 forbids outright | **Fixed** — the element carrying it is gone |
| 7 | Minor | **The stated reason for forking `togglePreferenceRow.tsx` was wrong.** It said importing would be a bare-`src/` value import; `~components` is a defined alias and relative paths work, and the component is plumbing-free, so §3 says import it. The fork is still right — the real row leaves its switch unnamed — but the wrong reason teaches the next prototype to recreate what it should import | **Fixed** in the comment and here |
| 8 | Minor | The loading state announces nothing — four bare skeletons, no `aria-live` or `aria-busy` | **Open.** Below the enforced target and invisible to the scan; a real version needs it |
| 9 | Minor | `host.tsx` never calls `useInRealShell()`, so at `/design/alert-notification-prefs` its reconstructed header stacks under the real one | **Open.** Applies to this prototype's host, not the harness |
| 10 | Minor | Placement is asserted in prose only, and the host renders the view with no neighbouring content — which §3 says a host must not do, because fit is a property of surroundings | **Open** |
| 11 | Minor | State-model rough edges: the success alert moves from top to bottom on save, survives a cancel, and Save is live with nothing changed | **Open.** Prototype scaffolding, not the candidate experience |

### What the scan does and does not establish

Recorded here because the pass was claimed before this was known. **Until the harness was fixed on
2026-09-29 it read only `results.violations` and dropped `results.incomplete`** — so four of seven
states were passing on undecided results that were never shown. Both sat on the very component this
prototype forked for accessibility reasons.

Four limits remain, and they belong next to any future claim of a pass:

1. **It scans `view.tsx` only.** `index.tsx` and `host.tsx` are never rendered, so the artifact's only `<h1>` is outside every scan — and the heading skip lived exactly in that composition.
2. **Initial render only.** No interaction is simulated, so post-save and post-toggle DOM has never been scanned.
3. **WCAG 2 A is 61 rules.** Contrast, focus-visible and heading order are all outside it.
4. **Static-DOM axe cannot see behaviour.** It passed a silent loading state and a lock reason no keyboard could reach.

"Passes across all seven states" is true of what it scans. It is not the same claim as "this is
accessible."

### Accessibility

Target is the consuming product's, in `flock-coke/.flkd/manifest.md`. **No conformance level is
claimed here.**

| # | Check | Result |
|---|---|---|
| 1 | Keyboard reachability | **Not run** — needs a browser or a person; no tool here can judge it. Owner: the first browser-based accessibility pass, which is the same gap as the screen-reader read-through and colour contrast. |
| 2 | Tab order | **Not run** — needs a browser or a person; no tool here can judge it. Owner: the first browser-based accessibility pass, which is the same gap as the screen-reader read-through and colour contrast. |
| 3 | Focus visibility | **Not run** — needs a browser or a person; no tool here can judge it. Owner: the first browser-based accessibility pass, which is the same gap as the screen-reader read-through and colour contrast. |
| 4 | Focus management | Not applicable — no drawer, dialog or menu in this artifact |
| 5 | Accessible names | **Built for, not verified.** Each toggle is named by a `<label htmlFor>` bound to its input `id`. **Needs a screen-reader check** — `FSToggle` renders its own `FormControlLabel` wrapper with an empty label, and whether the external label wins has not been confirmed |
| 6 | Heading structure | Pass by construction — one `h1` in the host, no skips |
| 7 | Status announcement | **Built for, not verified.** Save confirmation renders an `FSAlert`; whether it announces has not been tested |
| 8 | Non-color signals | Pass — every state carries text, none relies on color alone |
| 9 | Error messages | Pass by construction — error and partial states say what failed and what to do |
| 10 | Reduced motion | Not applicable — no motion |

**Automated scan: run, clean.** `npm run a11y` — axe-core 4.10.3 against WCAG 2 A, all seven states
(`src/prototypes/alert-notification-prefs/view.a11y.spec.tsx`). No violations.

This was recorded "not run" when the review was written, because Cypress would not launch on this
platform. It still will not. axe-core does not need Cypress — it needs a DOM, and vitest already
provides one. Added 2026-09-29 as part of step B3; colour contrast is the one thing it cannot judge,
because happy-dom has no layout.

### Component gap — for the Design System

**Corrected 2026-09-29 — the original wording was too strong.** `FSToggle` *can* be named through its
own API: `label` takes a ReactNode. The real gap is narrower and still worth filing: **`FSToggle`
always wraps its input in a `<label>` via `FormControlLabel`, so it cannot be named from outside
without producing two labels — there is no `aria-label`, `aria-labelledby` or `inputProps` route, and
`optOutOfLabel` only changes a margin.** The original claim, kept for the record: its prop allowlist exposes
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
