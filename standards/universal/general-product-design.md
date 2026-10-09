# General product design

**Product-agnostic.** Baseline judgment expected before implementation. This is the overview —
`layout-judgment.md`, `copy-and-microcopy.md`, `interaction-states.md`, and `accessibility.md` go
deeper on their areas. Flock-specific standards in
`../flock/` **override these on matters of convention and taste** — density, tone, vocabulary,
component choice. Where they're silent, these apply.

## Answer the four questions

Every view answers, in order:

1. **Where am I?** — a title
2. **What is this?** — one line, only if it isn't obvious
3. **What's here?** — the content
4. **What can I do?** — actions, in consistent positions

If you can't answer #1 and #4 crisply, the view isn't designed yet.

## Hierarchy

One thing should be most important, and it should be obvious which. Build hierarchy from type scale,
weight, spacing, and surface — **not from borders**. Boxing every section is the most common way a
layout loses its hierarchy: when everything is delineated, nothing is emphasized.

## Actions

- **One primary action per view.** Two primaries means no primary.
- Destructive actions look destructive, and confirm before doing anything irreversible.
- Buttons name what they do — "Save changes", "Delete organization" — not "Submit", "OK", "Yes".
- Consistent placement. Users learn position faster than labels.

## Progressive disclosure

Show what's needed now; make the rest reachable. Advanced options behind a disclosure, not in the
first screen. This is not the same as hiding things people need — an option nobody can find is an
option that doesn't exist.

## Error prevention beats error handling

Prevent the mistake, don't just report it: constrain inputs to valid values, default sensibly,
confirm destructive actions, make undo possible where you can.

When you must report an error: say what happened, why, and what to do next. Put it next to the thing
that caused it.

## Copy

Full guidance: **`copy-and-microcopy.md`**. In short — sentence case, name real things, say what will
happen, no exclamation marks, numbers get units and a baseline.

## Density and layout

Full guidance: **`layout-judgment.md`** — rhythm, grouping, scan path, responsive behavior. The rule
worth repeating here: **cut content before shrinking spacing.**

## Consistency beats local optimization

A marginally better pattern used once is worse than the established pattern used everywhere. Users
learn a product's conventions; breaking them costs more than the local improvement gains.

Deviate deliberately and say so — never by accident.

## Design for the real data

Design against realistic content: long names, missing values, zero rows, thousands of rows, errors,
slow networks. Three tidy rows of sample data hide every layout problem worth finding.
