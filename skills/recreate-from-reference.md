# Recreate from a reference

**Shared by every product.** Rebuilds a screenshot, sketch or Figma frame as product-native work. Use it when the *what*
is settled and the work is the *how*; if the product direction is still open, resolve that first.

**This is not pixel tracing.** You are resolving a reference against the design system, the product's patterns, and its
constraints.

## The two failure modes

**Tracing:** reproducing the reference pixel for pixel, including decisions that were artifacts of wherever it was drawn
(a 6px radius, an off-palette blue, a custom control). It looks like the reference and nothing like the product.

**Drifting:** reinterpreting so freely that the reference's information architecture is lost, and the person who drew it
can't recognise their intent.

## Preserve intent, adapt execution

| Preserve from the reference | Adapt to the product |
|---|---|
| Information architecture: what's on screen and how it groups | Component choices: the design system's |
| Layout relationships: what's beside, above, inside what | Color: tokens, always |
| Relative emphasis: what dominates, what recedes | Spacing: the scale |
| Reading order and scan path | Type: the design system's variants |
| Interaction model | Corners, shadows, borders: theme defaults |
| Real content and labels | Icons: the design system's |

When preserving the reference and following the product genuinely conflict, **follow the product and say so**.

## 1. Read the reference

Describe it before building: its regions, its primary content, its hierarchy, its repeating units, every control and
which is primary, and the states it implies. State any ambiguity rather than inventing.

## 2. Map it to the design system

Region by region, pick the design system's component for each (its `.dsnr/` says which does which job). Write the
mapping out before coding: it surfaces wrong choices while they're cheap.

## 3. Check for an existing pattern

`choose-existing-patterns.md`. If the product already has a view like this, match it rather than the reference: the
product's own precedent outranks an external mock.

## 4. Build

On the prototype path, as `build-prototype.md` says; on the codebase path, as `../agents/dsnr.md` says. Use the
reference's real labels and content where legible: placeholder text hides copy problems, and copy is usually where the
product decisions are.

## 5. Report the diff

Say where you departed from the reference and why:

> **Adapted:** custom blue to the primary token; 6px radius to the theme default; a hand-built table to the design
> system's grid. **Preserved:** three-column layout, filters above the table, detail drawer on row click.
> **Ambiguous:** the reference shows no empty state; I wrote one, please review the copy.

That diff is the useful output: it's where design intent and the product's conventions were reconciled.
