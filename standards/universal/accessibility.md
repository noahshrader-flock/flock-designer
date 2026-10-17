# Accessibility

**Product-agnostic.** These rules hold for any interface, at any company. Flock standards may **raise**
this bar; they may never relax it. Accessibility is a floor, not a preference — that's the one place
where "the Flock way" does not override the universal standard.

## Conformance target

The target level is a **per-product setting**, declared in the consuming product's `.dsnr/manifest.md` and
enforced in that repo's axe configuration. Read it there — don't assume a level.

Do not restate the target in other files. One declaration, referenced everywhere, so raising it is a
single edit rather than a hunt.

### How the ladder works

| | Level A | Level AA | Level AAA |
|---|---|---|---|
| **WCAG 2.0** | `wcag2a` | `wcag2aa` | `wcag2aaa` |
| **WCAG 2.1** | `wcag21a` | `wcag21aa` | none |
| **WCAG 2.2** | none | `wcag22aa` | none |

Those are **axe tag names** — raising conformance means adding tags to the axe `runOnly.values`
array, then fixing what newly fails. Levels are cumulative: 2.1 AA is every tag at or above it in the table.

**"none" means axe has no rules for that level**, not that it has no criteria: 2.2 Level A, for one,
added criteria (consistent help, redundant entry) that only a person can check. A tag that names no
rules runs nothing, so never add one to make a run look complete — report those criteria as not run,
or checked by hand. DSNR's own copy of this table, in `workspace/src/shared/wcag.ts`, is held to
axe-core's rules and to this table by a test, so the two cannot drift.

What each step actually adds, in practice:

- **A → AA** is the big one. Adds color contrast minimums (4.5:1 body text, 3:1 large text and UI
  components), visible focus indicators, resize to 200%, meaningful headings and labels, multiple
  ways to find a page. **AA is the usual commercial and procurement target** — most accessibility
  commitments mean AA.
- **2.0 → 2.1** adds mobile and low-vision criteria: orientation, pointer gestures, target size,
  reflow, non-text contrast, content on hover/focus.
- **2.1 → 2.2** adds focus appearance, dragging alternatives, consistent help, accessible
  authentication.
- **AAA** is rarely adopted wholesale — it's usually cherry-picked (e.g. 7:1 contrast on a specific
  surface), not adopted as a blanket target.

**Design implication:** if the target is moving toward AA, contrast and focus visibility are the two
things that will bite hardest, and both are decided at design time, not patched afterward. Use
palette tokens as intended — they carry `contrastText` for exactly this reason.

## Universal rules

### Names

Every interactive element needs an accessible name. Visible text counts. Where there is none, supply
`aria-label`, and make it describe the **action**, not the widget:

```tsx
<FSIconButton aria-label="Delete zone" />      // ✅
<FSIconButton aria-label="button" />           // ❌
<FSIconButton aria-label="trash icon" />       // ❌ describes the icon, not the action
```

### Roles and semantics

- Never put `onClick` on a `div`, `span`, or `li`. Use a real button or link. Non-interactive
  elements are not focusable, not keyboard-operable, and not announced.
- Headings communicate document structure. Level should reflect hierarchy, not visual size — decouple
  them when they differ.
- Lists, tables, and landmarks should be real ones. A grid of `div`s is not a table.

### Never rely on color alone

Any state carried by color must also be in text or in the accessible name:

```tsx
aria-label={`Device management ${enabled ? 'enabled' : 'disabled'}`}   // ✅
```

This is a Level A requirement, and it's the most common failure in status-heavy interfaces.

### Keyboard

Everything operable by mouse is operable by keyboard. In practice:

- Logical tab order following visual order
- No keyboard traps — anything focusable can be escaped
- `Esc` closes dialogs, drawers, and menus
- `Enter`/`Space` activate buttons
- Focus moves **into** a dialog on open and **returns** to the trigger on close

### Focus

Focus must be visible. Never remove an outline without replacing it with something at least as
clear. At AA, the indicator itself has contrast requirements.

### Decorative content

Icons paired with a text label are decorative — mark them `aria-hidden="true"` so screen readers
don't announce the same thing twice.

### Live regions

- `aria-live="assertive"` — user-triggered results: validation errors, save confirmations
- `aria-live="polite"` — background updates that shouldn't interrupt

Use sparingly. Several competing live regions are worse than none.

### Motion

Respect `prefers-reduced-motion`. Never convey information through motion alone.

## Automated testing catches roughly half

axe finds missing names, contrast failures, bad roles, and structural problems. It **cannot** tell
you whether tab order is sensible, whether an `aria-label` is meaningful, whether focus lands
somewhere useful, or whether an error message explains anything.

A passing axe run is a floor, not a pass mark. Keyboard-test anything with real interaction.

## What must be checked and recorded

**Accessibility is a floor, not something that scales.** The universal rules above hold for anything
built, always. What changes is how much is **verified and recorded** — never whether the rules apply.

| Work | Must check | Must record |
|---|---|---|
| **Anything that ships** | The full manual checklist below, across every state, plus the automated run | The whole checklist, each item pass / fail / not run with the reason, and what remains |
| **Work made to answer a question** | Semantic elements, accessible names, and visible focus as you build | What you checked and what you did not. A rough artifact may leave items unrun — it may not leave them unstated |

**"Not run" is always an acceptable answer. Silence is not.**

## The manual checklist

Automated tooling cannot fully answer any of these: a tool may measure part of one (a Tab walk finds
a trap), and the check is still a person's. Both the review record and the hardening report use this
same list, so they can be compared across iterations.

| # | Check | Pass means |
|---|---|---|
| 1 | **Keyboard reachability** | Every interactive element can be reached and operated by keyboard alone |
| 2 | **Tab order** | Focus moves in an order that matches the visual layout, with no traps |
| 3 | **Focus visibility** | The focused element is always visibly indicated |
| 4 | **Focus management** | Opening a drawer, dialog, or menu moves focus into it; closing returns focus somewhere sensible. Focus is never lost to the body |
| 5 | **Accessible names** | Every control, icon-button, and meaningful image announces something a user can act on. Icon-only buttons are the usual miss |
| 6 | **Heading structure** | Levels descend without skipping, and describe the content |
| 7 | **Status announcement** | Loading, error, and success are announced, not only shown |
| 8 | **Non-color signals** | No status is carried by color alone |
| 9 | **Error messages** | Say what failed and what to do — adjacent to the field and announced |
| 10 | **Reduced motion** | Nothing essential is conveyed by motion alone |

## Reporting rules

These are not stylistic. They are what keeps the evidence honest.

- **A check that was not run is reported as "not run," with the reason.** Never as a pass, never
  silently omitted. "Cypress would not launch" is a complete and acceptable reason.
- **A bypass is never a pass.** Skipping, disabling, or scoping a rule out to make a run go green is
  recorded as a bypass with its justification — it does not become a passing check.
- **A passing automated scan is not complete validation**, and must never be reported as one.
- **Never state a conformance level in this file or any other.** The target lives in
  the consuming product's `.dsnr/manifest.md` alone. Report what you checked and what you found; let that file say what the
  product is claiming.
