# Choose existing patterns

**Shared by every product.** Default to reuse. A marginally better pattern that appears once is worse than the
established one used everywhere: consistency is what makes a product feel like one product.

## The order of preference

1. **Reuse** an existing product pattern as-is
2. **Adapt** an existing pattern with minimal change
3. **Compose** something new from the design system's components
4. **Create** a genuinely new pattern: rare, and always explicit

Rule out each level before moving to the next.

## 1. Search the product

Its `.dsnr/README.md` lists its pattern files and the real views to study; its manifest says where its views are. Search
those for how the product already solves this.

**Match by job, not by name.** A "manage members" view and a "manage cameras" view are the same pattern with different
nouns. When you find a match, read it fully: its layout, its view states, where it puts actions.

**Record where each choice came from.** Every significant layout, pattern, or interaction decision needs a named source:
a real product view with its path, a `.dsnr` rule, or an explicitly labeled proposal. "It seemed right" is not a source.
These go into the context receipt and the report.

## 2. Check the design system

If no product pattern fits, read what the design system ships (the installed package, and its `.dsnr/` for which
component does which job and how they compose), and what is deprecated. Search by shape, not just name: something
"table-like" or "panel-like" has a component.

## 3. Compose

Build from the design system's components as its composition guidance says. This is the normal case for a new view and
doesn't count as inventing.

## 4. Create (rare)

Only when nothing above fits. When you do, **state it**:

> New pattern: `<name>`. Existing options considered: `<what you looked at>`. Why they don't fit: `<reason>`. Closest
> precedent: `<file path>`.

A new pattern that isn't announced is a new pattern nobody reviews.

## Report

Say which level you landed on and what you looked at. "Reused the pattern from `<the view's path>`" tells a reviewer far
more than "built a table".
