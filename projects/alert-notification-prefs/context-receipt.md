# Context receipt — alert-notification-prefs

What was read before building, 2026-09-28.

## Pinned

| | |
|---|---|
| Product baseline | `flock-coke` `noah/flock-designer` |
| Resolved FUI version | **5.5.4**, from `node_modules/@flocksafety/flock-react-component-lib/package.json` |
| FUI context read from | `../flock-react-component-lib/.flkd/` (sibling checkout) |
| Shared standards read from | `../flock-designer/standards/` (sibling checkout) |

## Product patterns

- `.flkd/product-patterns/view-examples.md` — to choose what to model against.
- **`src/components/org/orgPageV2/common/togglePreferenceRow.tsx`** — the canonical settings row,
  named by that file as the reference. Reconstructed, not imported (see below).
- `src/components/camera/camerasPage.tsx:156` — the page container line, for the host.
- `.flkd/product-patterns/settings-patterns.md` — `orgPageV2` as the reference settings area.

## Design system

Every component verified against `component-manifest.json` for 5.5.4 **before** use:
`FSBox` · `FSStack` · `FSTypography` · `FSToggle` · `FSTooltip` · `FSSkeleton` · `FSAlert` ·
`FSButton` · `FSDivider` · `FSToggleButton` · `FSToggleButtonGroup`.

Prop allowlists checked against source, which corrected three assumptions:
- `FSToggle` requires `label` and permits no `aria-label`/`inputProps`.
- `FSToggleButtonGroup` omits `size`.
- `FSButton` variants are `FSVariant` (`primary`, `secondary`, …) — not `filled`/`outlined`.

## Standards

- `../flock-designer/standards/universal/interaction-states.md` — the seven view states.
- `../flock-designer/standards/universal/accessibility.md` — the manual checklist.
- `.flkd/standards/non-negotiables.md` and `.flkd/implementation/known-safe-imports.md`.

## Boundaries applied

Nothing imported from `src/components/` — the canonical row was **reconstructed** in
`components/preferenceRow.tsx` because importing it is a bare-`src/` value import, the documented
bundler trap. No `src/data` import was needed; mock types are local.
