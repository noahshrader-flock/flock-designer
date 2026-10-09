# Layout judgment

**Product-agnostic.** Using correct components does not make a layout good. A product's own Flock-tier
standard — its density, spacing and layout conventions — **overrides anything here**, and lives in
that product's `.dsnr/standards/flock/`.

## Rhythm

Consistent spacing is most of what makes a layout look considered. Pick a scale and stay on it.

Use a **small number of spacing values** — typically three: tight (within a group), medium (between
groups), loose (between major regions). More than four and rhythm reads as noise.

Inconsistent spacing is the most common tell of a layout assembled rather than designed.

## Grouping

Related things sit closer together than unrelated things. Proximity does more grouping work than
borders, and does it without adding visual weight.

The order to reach for:

1. **Proximity** — free, invisible
2. **Whitespace** — a gap between groups
3. **A divider** — one line
4. **A surface change** — subtle background shift
5. **A border or card** — heaviest; use last

Most layouts that feel cluttered have jumped straight to 5.

## Alignment

Everything aligns to something. Optical alignment beats mathematical alignment when they differ.

Ragged edges read as broken, especially in card grids and form fields. Equal heights within a row
matter more than they seem to.

## Scan path

Design for how it's read, not how it's built. Most-important thing first in reading order. If the
primary metric is bottom-right, the layout is fighting the reader.

Test by squinting: what do you see first? Is it what should be seen first?

## Width and measure

Long lines of text are hard to read — constrain body text to a comfortable measure rather than
letting it span the full viewport.

Full-bleed tables are fine. Full-bleed paragraphs are not.

## Density

Density is a decision, not an accident. Match it to how the interface is used — a tool someone lives
in all day earns more density than something used monthly.

**Cut content before shrinking spacing.** Compressed spacing reads as clutter, not efficiency.

## Responsive

Decide what happens as width shrinks *before* it's a bug:

- What reflows, what scrolls, what hides?
- Do tables scroll horizontally, or reflow to cards?
- Does the primary action stay reachable?

"It breaks below 1200px" is a design decision that got made by default.

## Signals a layout needs work

- Every section wrapped in a bordered box
- More than four distinct spacing values
- Ragged card heights within a row
- Body text spanning the full viewport
- The most important thing not first in reading order
- Spacing reduced to fit more in
