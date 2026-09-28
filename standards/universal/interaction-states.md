# Interaction states

**Product-agnostic.** Flock standards may specify *how* a state looks; they don't get to skip one.

## The two families

**View states** — what the whole screen shows depending on data:

| State | Requirement |
|---|---|
| **Loading** | Shaped like the content that's coming. A skeleton beats a spinner whenever the layout is known |
| **Empty** | Say what would be here, why it isn't, and offer the action that creates it. Never a bare "No data" |
| **Error** | What failed, and what to do next. Never a raw error code or "An error occurred" |
| **Loaded** (default) | The happy path |
| **Partial** | Some data arrived, some failed — show what you have and scope the error to what didn't |
| **Success / changed** | The state after the user's action succeeded. Confirm what changed; don't just return to loaded as if nothing happened |
| **Permission / disabled** | Where relevant: what someone without the permission sees. Not an error — a different, legitimate view |

**Seven view states. This list is the single definition** — nothing else restates it.

**How many a given piece of work owes depends on its credibility level**, not on this list. The
levels are in the consuming product's `.flkd/manifest.md`:

| Level | View states owed |
|---|---|
| **Explore** | The default state alone. An Explore artifact is complete with one state |
| **Ground** | Default, plus any state the pattern choice actually turns on |
| **Test** | Every state that carries the decision — typically loading, empty, error, and the partial or success state the interaction produces |
| **Handoff** | Every decision-relevant state, plus permission and disabled where they apply |

**They are where product decisions hide** — if you can't write the empty state, the feature isn't
defined yet, and that is worth flagging at any level.

**Element states** — what a single control does under interaction:

| State | Requirement |
|---|---|
| **Default** | Reads as interactive if it is |
| **Hover** | Confirms interactivity. Never the only signal — it doesn't exist on touch |
| **Focus** | Always visible. Keyboard users navigate by it |
| **Active/pressed** | Immediate feedback on activation |
| **Disabled** | Visibly inert, **and explains itself** |
| **Loading** | For async actions: the control shows progress and can't be double-fired |
| **Selected** | Distinguishable from hover and from focus — three different meanings |
| **Error** | Field-level, adjacent to the field, announced to screen readers |

## Rules that get broken most

**Disabled without explanation is a dead end.** If a control is disabled, the user needs to know why
and what would enable it. Put the reason in a tooltip — and remember disabled elements swallow
pointer events, so the tooltip needs a wrapper element to attach to.

**Hover-only affordances don't exist on touch.** Anything discoverable only by hovering is invisible
to a large share of users.

**Selected ≠ hover ≠ focus.** Three states, three meanings. Collapsing them makes keyboard navigation
ambiguous.

**Async actions need a loading state.** Without one, users double-submit. The control should show
progress and refuse a second activation.

**Optimistic UI needs a rollback path.** If you show success before the server confirms, you must
handle the failure — silently reverting is worse than waiting.

## Why using the design system matters here

Library components carry these states already. A control hand-built from layout primitives starts
with **none** of them — no focus ring, no disabled semantics, no keyboard handling — and each has to
be rebuilt correctly. That's the practical reason to prefer real components over styled boxes, quite
apart from visual consistency.
