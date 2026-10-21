# Layout judgment

**Product-agnostic.** Using correct components does not make a layout good. Flock's conventions and a product's own
override anything here, in the order `../README.md` gives.

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

## Looking at what you built

A layout is judged by looking at it, not by reading its code. The build's check saves a picture of every state at
1280 and at 800 wide: read each one, as a person would see it, before you call the work finished. These are the
flaws that get past code that builds and passes its checks; look for each.

- **Text touching a border.** A helper line, hint or error sits clear of the field above it and its own edge; if a
  line is tucked up against a field's border or another line, add the space the component's own form gives it.
- **A flow that changes width.** The steps of one dialog or panel (a form, its loading state, its results) keep one
  width. Size it for its widest step, or bring the widest step in; a window that jumps wider when the result arrives
  reads as a different place.
- **Long values broken in the middle of a word.** A hostname, an ID or a path is never split mid-word. Give the column
  the room it needs, break only at its own separators (a dot or a hyphen), or cut it short with the whole value in a
  tooltip and on copy.
- **Chrome that crowds out the content.** What the screen is for (a table, a list, the form) is the largest thing on
  it. At 1280 by 900 a table shows its header and at least five rows without scrolling; notices, summaries, filters and
  helper lines above it are cut, folded or moved until it does. A summary of three chips beats five.
- **The same control over and over.** Three identical icon buttons in every row, or any icon that appears in every
  row with nothing to say which is which, is noise. Offer one action for the row, or put the action in the column's
  header, and keep a row to two icon actions at most.
- **Footers off the content's edges.** Buttons at the bottom of a dialog line up with the content above them, on the
  same left and right edges; a footer with its own padding that sits past the content's edge looks broken.
- **A narrow window that cuts things off.** At 800 wide nothing is clipped, overlaps or hides what the person needs.
  A table that cannot fit scrolls inside its own container, with its edge visible, or reflows; decide which, as above.
- **Saying the same thing twice.** One message, once, in the place it is acted on. A caution on the first step of a
  flow that is repeated on the last is trimmed to one.

Say in your summary that you looked, and what you changed because of it. If you could not look (no pictures came
with the check), say that, and do not call the layout checked.

## Signals a layout needs work

- Every section wrapped in a bordered box
- More than four distinct spacing values
- Ragged card heights within a row
- Body text spanning the full viewport
- The most important thing not first in reading order
- Spacing reduced to fit more in
