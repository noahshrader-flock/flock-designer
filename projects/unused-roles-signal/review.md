# Review record — unused-roles-signal

## Iteration i1 — codebase path

**Branch:** `feature/unused-roles-signal` in `flock-coke` · **Baseline:** `noah/flock-designer` ·
**FUI:** 5.5.4 · **Level:** Ground · **Path:** codebase

**Written 2026-09-29, after the work.** The handoff record said both reviews were "not run" because
that session had no way to dispatch the reviewer subagents and nothing told it what to do instead.
The fallback is now documented (`.flkd/agents/flock-designer.md` §6) and dispatch was available this
time, so **both reviews ran as separate subagents** — the preferred path, not self-review.

Reviewing after the fact is weaker than reviewing before the handoff was written: the work was
already finished, so nothing here changed the design, only the record and one defect. Weigh it
accordingly.

### Product parity

Run as a subagent against `.flkd/agents/product-parity-reviewer.md`. Comparison views used:
`policyRow.tsx:97-107`, `lastLoginDisplay.tsx:90` (the peer branch), `packageCard.tsx:49`,
`authorizedAccessListRowCard.tsx`.

**Verdict: no blocking findings.** Design-system compliance passes on every count — no hardcoded
colour, no deprecated components, no new MUI icon imports, no raw MUI over FUI, `spacing={1}` on the
base scale, and every prop (`variant="status"`, `size="small"`, `color="warning"`, `label`) confirmed
against the installed 5.5.4 typings rather than assumed.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Should fix | The name/chip row had no wrap guard, so a long role name could squeeze the chip into an ellipsised "Unu…". `policyRow.tsx:97` — the one production view composing a name plus a `warning` chip on one line — guards it with `flexWrap: 'wrap'` | **Fixed.** `flexWrap="wrap"` added to the stack, matching the precedent |
| 2 | Consider | **"Unused" is a new user-facing word in this product.** The form is right — every status chip label in Coke is a state word — but the product's existing phrasing for this exact condition is the Delete tooltip at `rolesList.tsx:151-152`, which frames it as *assignment*, not usage | **Open.** `brief.md` already flags the label as the one thing worth reacting to; this is the evidence for that conversation |
| 3 | Consider | **The chip names a problem some admins cannot act on.** `rolesList.tsx:94-96` returns no actions without `canEditRoles`, and a `readOnly` role gets "View" only. For those audiences the chip is information-only. `list-and-table-patterns.md:82`: *"A grid that names a problem and offers no way to act on it is a gap, not a style choice"* | **Open, and a real asymmetry.** For `canEditRoles` users the wiring is exact — the chip fires on the same boolean as `canDeleteRoles` |
| 4 | Consider | **Colour budget if unused roles are common.** Status colour earns attention because most of the page is not coloured. The branch's own fixture is 3 unused of 5; no production distribution was available | **Open, explicitly inferred.** If it turns out common, the answer is a filter or sort, which is a second project |
| 5 | Note | **This is the first status chip in a Mode A card row.** Neither sibling `*RowCard.tsx` uses `FSChip` at all; the nearest comparables are adjacent (an accordion row, a Mode B table cell), not in-family | **Recorded.** "The chip pattern is proven" and "proven *in this container*" are different claims, and only the first is supported |

**What the review said was working, recorded because a parity pass that only lists faults is not a
review:** the chip is prop-for-prop identical to the precedent the brief cites; `warning` is the
right rung (`error` is reserved for Rejected/Unknown, and a role nobody uses is not broken); no `sx`
override, following the majority convention rather than the nearest file; nothing else on the row
moved, so the chip is the scan-time cue and the "0 Users" link is still the detail path; and the
signal and the affordance read the same boolean, so they cannot drift.

**One boundary note.** `brief.md` and `HANDOFF.md` both say "one new test file, 5 RTL specs." There
are now two — `roleListRowCard.a11y.spec.tsx` was added afterwards, by step B3. Additive test
coverage, but the boundary statement was stale and is corrected here.

### Accessibility

| Check | Result |
|---|---|
| Automated axe scan | **Run, 2026-09-29.** `npm run a11y` — axe-core 4.10.3, WCAG 2 A, both states (`roleListRowCard.a11y.spec.tsx`). Clean apart from the inherited violation below |
| Non-colour status signal | **Pass.** The chip always carries visible text; the meaning never rides on the fill colour |
| Accessible name | **Pass.** `roleListRowCard.tsx:109` prepends `", Unused"` to the row's existing `aria-label`, so assistive tech gets the escalation a sighted scan gets, not just the literal "0 users" |
| Hierarchy | **Pass.** The role name stays dominant — `h6`/bold against a `size="small"` chip |
| Focus visibility | **Not applicable.** No focusable element added; the chip has no `onClick` or `onDelete`, and the existing "0 Users" link is untouched |
| Colour contrast | **Not run** — needs a browser in both themes; happy-dom has no layout, so axe's `color-contrast` rule is disabled there by design. Owner: the first browser-based accessibility pass |
| Screen-reader read-through | **Not run** — needs a person with a screen reader; no tool substitutes. Owner: whoever takes the branch |

**A defect the scan found, which predates the branch.** `aria-required-children`, critical: the
permission icon strip at `roleListRowCard.tsx:25-92` is a `role="list"` whose children are
`role="img"`, and a list may only own list items. It is on `develop` today. Recorded as an
`InheritedViolation` with an owner rather than fixed here — changing a role changes what a screen
reader announces on a shipped component, which deserves a deliberate decision rather than a drive-by
fix in a feature branch. Written up in the branch's `HANDOFF.md` with both candidate fixes. The spec
fails if it ever stops firing, so the record cannot outlive the defect.

### Implementation

Run as a subagent against `.flkd/agents/implementation-reviewer.md`, in a detached worktree so the
working tree was never touched.

**Boundary: clean.** Three files — the row card, its unit spec, and the a11y spec added later by step
B3. No Redux, no `src/api/`, no `injectEndpoints`, no flags, no telemetry, no dependency added by the
feature, no route registered, and `rolesList.tsx`'s `canDeleteRoles` untouched as the brief required.

**Conventions: clean.** camelCase filenames, 4-space indent, single quotes, no `any`, no force cast,
no `style` prop, no hardcoded colour. `variant="status"` verified against the installed FUI 5.5.4
typings rather than assumed.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | **The "Unused" fact reaches assistive tech through an attribute axe will not endorse.** The row root is a `div` with an `aria-label` and no `role` — implicit role `generic`, which ARIA prohibits naming. axe returns `aria-prohibited-attr` as *undecided*. Both the label and the row's `onClick` predate the branch; this change only appends to the label | **Claim corrected.** `HANDOFF.md` said assistive tech gets the same fact a sighted scan gets. It now says that is undecided, and names the fix — giving the row root a real role, which also settles the `onClick`-on-a-`div` — as the engineer's call |
| 2 | Major (harness) | **`expectNoAxeViolations` read only `results.violations` and discarded `results.incomplete` entirely** — so no spec in the repo could ever surface a needs-review item | **Fixed on the baseline.** Undecided results are reported as `NEEDS REVIEW` and carried only by the same named record a violation needs. This is what found finding 1 |
| 3 | Note | **The inherited-violation call on `aria-required-children` is right** — confirmed three ways: it is identical on `develop`, it is the only violation the card produces at any tag, and the spec fails if it stops firing. One qualification: the standard says "cannot fix from here," and the defect is in the file this branch already edits. The reasoning that actually carries it is the one `HANDOFF.md` gives — changing an announced role on shipped UI is a product decision | **Wording noted.** Leaning on "product decision" rather than "cannot fix" |
| 4 | Minor | The unit spec hand-rolled the `FSApp` wrapper and its own `cleanup()`, while `renderInShell` already does both | **Fixed** |
| 5 | Minor | `render.tsx` cited `roleListRowCard.spec.tsx` as precedent — a file added one commit later on the same branch. Self-citation | **Fixed.** Only `policyRow.spec.tsx`, which is on `develop`, is cited |
| 6 | Minor | The brief's boundary says two files; there are three | **Corrected** in the parity section above |
| 7 | Minor | `HANDOFF.md` lists "a read-only role with 0 users" as a state. `readOnly` is not on `RoleListRow` — the card cannot vary on it | **Not a missing test; a non-state.** Worth rewording rather than covering |

**A limit worth knowing before trusting a green run.** `tsconfig.json` excludes `__tests__` and
`biome.json` ignores it, so a spec living there is type-checked and linted only when something under
`src/` imports it. Prototype specs are (they sit in `src/prototypes/`); codebase-path specs are not —
their type errors surface as test failures rather than in `tsc`. Recorded in `__tests__/support/axe.ts`
where the next person will hit it.

### Not run, and why

| | |
|---|---|
| Screen-reader read-through | Needs a person with a screen reader. Owner: whoever takes the branch. Directly relevant to finding 1 |
| Colour contrast | Needs a browser; happy-dom has no layout, so axe's rule is disabled there by design. Owner: the first browser-based pass |
| `cy.checkPageA11y()`, the repo's own page-level gate | Cypress will not launch on this platform. The vitest scan closes the component-level gap; it does not replace the page-level one |
