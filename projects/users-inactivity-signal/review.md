# Review record — users-inactivity-signal

## Iteration i1 — 2026-09-29 (codebase path)

**Branch:** `feature/users-inactivity-signal` · **Baseline:** `flock-coke` `develop` · **FUI:** 5.5.4

> **How these reviews were run.** Subagent dispatch was **not available** in this session, so both
> definitions were read and followed directly, one at a time — parity finished before implementation
> began. **This is self-review**, which is weaker than a second agent reading the work, and the reader
> should weigh it accordingly. The fallback path is now documented in
> `.flkd/agents/flock-designer.md` §6; previously nothing said what to do when dispatch failed, which
> is why three earlier projects recorded both reviews as "not run."

---

## Product parity

**Observed.** The status chip matches the convention already on this exact page.
`orgUsersList.tsx:250` renders the Status column as
`<FSChip size="small" variant="status" label={...} color={...} />`. The inactivity chip uses the same
component, variant and size — it is the page's own pattern, not a new one.

**Observed.** `color="warning"` is the product's existing signal for *needs attention rather than
broken* — `orgOverviewTabV2.tsx:389`, `mfaSection.tsx:179`, `policyRow.tsx:102`. Reserving `error`
for genuine failure is consistent with the Status column on this page using `error` for Deactivated.
An inactive user is not an error, so warning is the correct register.

**Observed.** Colour never carries the meaning alone — every chip renders its text
(`4 months inactive`, `Never logged in`), per `pattern-inventory.md`'s rule that label is set on 56
of 58 status chips.

**Proposed, not observed.** The relative-time wording (`Today`, `Yesterday`, `45 days ago`, then
`N months inactive`) follows no existing product convention — nothing else in Coke renders relative
dates. It reads naturally but it is invention, and a second view adopting it would be the moment to
decide whether it is a Flock convention or a one-off.

**Finding — behaviour change, not an addition.** The column previously showed an absolute date
(`09/17/2026`). It now shows relative text. Anyone relying on the exact date loses it. This is the
most consequential parity decision here and it was not asked for.

**Not reviewed.** No human has compared this against the running product.

---

## Implementation review

**Boundary.** Feature changes are confined to `src/components/user/` (3 files), one test file, and
one fixture. No routes registered, no flags added, no Redux touched, no new dependency.

**Finding — the branch is not reviewable as a feature.** Diffed against `develop` it carries the
entire Flock Designer setup — `.flkd/`, the scripts, design mode, ~60 files — because none of that
has merged. An engineer opening this PR sees the feature buried in infrastructure. **The feature
itself is 5 files.** Either the infrastructure lands separately first, or the handoff must say
explicitly which 5 files are the feature. Recorded in `handoff.md`.

**Data layer.** `mapUserToTableRow` no longer formats `lastLogin`; the row carries raw ISO and the
column formats it. Correct separation — display formatting was in the data mapper. Verified
`lastLogin` is read in exactly two places, so the change is contained.

**Mock data.** Confined to `src/mocks/fixtures/searchUsers.json`. No mock import reaches a product
file. The real endpoint already returns `lastLogin` (`searchUserDto.ts:11`), so the fixture is the
only stub and reverting it runs against live data.

**Types.** `ActivatedUserListRow.lastLogin?: string` already existed; no type widening was needed.

**Tests.** 7 specs against a fixed clock, covering the threshold boundary either side, never-logged-in,
an unparseable value, and a future date. The last two return `Unknown` rather than `Never logged in`,
which is right — a data problem must not be reported as a fact about a person.

### Accessibility

Target is `flock-coke/.flkd/manifest.md`. **No conformance level is claimed.**

| # | Check | Result |
|---|---|---|
| 1 | Keyboard reachability | **Pass** — the cell adds no interactive element; row controls are unchanged |
| 2 | Tab order | **Pass** — unchanged; nothing focusable was added |
| 3 | Focus visibility | **Not applicable** — nothing focusable added |
| 4 | Focus management | **Not applicable** — nothing opens |
| 5 | Accessible names | **Pass** — the chip's label is its visible text. No icon-only variant |
| 6 | Heading structure | **Pass** — unchanged |
| 7 | Status announcement | **Not applicable** — static cell content, no live update |
| 8 | Non-color signals | **Pass** — every state renders text; colour is never the only signal |
| 9 | Error messages | **Not applicable** |
| 10 | Reduced motion | **Not applicable** — no motion |
| — | Screen-reader read-through | **Not run.** Needs a person with a screen reader; no tool substitutes. Owner: whoever takes the branch |
| — | Automated axe scan | **Run, clean.** `npm run a11y` — axe-core 4.10.3, WCAG 2 A, all four cell states. Added 2026-09-29 (step B3); it said "not run — Cypress does not launch" until then, and axe never needed Cypress |

**One concern the checklist does not cover.** The chip replaces a date with prose. A screen-reader
user previously heard a date and now hears `4 months inactive`, which is arguably better — but it has
not been heard by anyone. The automated scan cannot settle it: axe checks that the text is exposed,
not that hearing it is better than hearing a date. That one stays open, with an owner.

---

## Open questions

1. **The 90-day threshold is invented.** Nothing encodes an inactivity policy. Most likely wrong.
2. **Losing the absolute date** — is a tooltip with the exact date wanted?
3. **Relative-time wording** is a new convention; adopt deliberately or confine to this view.
