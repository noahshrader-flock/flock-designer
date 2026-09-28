# Production readiness

What has to be true before prototype work is handed to engineering. Applies when a prototype is being
considered for graduation — **not** a checklist every prototype must satisfy. Most prototypes should
never graduate, and that's the system working.

## Graduation is a rewrite, not a merge

Prototype code is **never merged to `develop`.** It lives on `fd/<project-id>/iN` and is rewritten into the real
structure by engineering.

That's deliberate: a prototype is optimised for answering a design question fast, with mock data and
no plumbing. Production code is optimised for correctness, performance, and maintenance. Merging the
first into the second imports every shortcut as tech debt on day one.

**What actually transfers** is the resolved design: component choices, layout, hierarchy, copy,
interaction model, and the view states. That's the valuable output — not the code.

## The handoff produces a report, not just a checklist

A graduation candidate is accompanied by an **accessibility and hardening report**, written into
`projects/<project-id>/handoff.md`. It states what was actually run, what was checked by hand, what
was bypassed and why, and what remains — using the same manual checklist as the review record, in
`universal/accessibility.md`, so the two can be compared.

The list below is the bar for reaching that point. It is deliberately not a second, competing
definition of what the report contains. **The full revision of this file happens in step 10**, after
the first real handoff shows what an engineer actually needed.

## Ready for engineering review

Before proposing graduation:

| | |
|---|---|
| **Design settled** | Not still iterating. Engineering reviewing a moving target wastes everyone's time |
| **The states the level owes are built** | Per `universal/interaction-states.md` — designed, not stubbed. Handoff owes every decision-relevant state |
| **Copy final** | Real labels, real error messages, real empty-state text |
| **Boundaries intact** | `implementation-reviewer` clean. No production plumbing |
| **Verifies clean** | `npx tsc --noEmit` and `npm run lint` |
| **Parity reviewed** | `product-parity-reviewer` run, blocking findings resolved |
| **Accessibility** | Meets the conformance target in the consuming product's `.flkd/manifest.md` |
| **Open questions listed** | Everything guessed at, written down |

Who signs off is named in the consuming product's `.flkd/manifest.md`. If it isn't, that's a gap to close before the first
graduation, not after.

## The handoff document

What engineering needs, which is more than the code:

1. **The job** — what decision or task this view supports, and for whom
2. **What's real vs. mocked** — every mock, and what would replace it
3. **Data requirements** — what the real endpoints would need to return, in the shape the view uses
4. **Permission model** — who sees what; which states depend on role
5. **Open questions** — every assumption made without an answer
6. **Deliberate deviations** — where this departs from existing patterns, and why

Item 3 is usually the most valuable. A prototype built against realistic mock data has already
specified the API contract — capture it rather than making engineering re-derive it.

## What a prototype does not answer

Be explicit about this, because it's where expectations break:

- **Performance at real scale.** Mock data is 20 rows; production is 20,000.
- **Error handling depth.** Prototypes model one error state; real systems have many.
- **Permissions.** Modelled with local state, not real role evaluation.
- **Edge cases in real data.** Nulls, truncation, unexpected enum values.
- **Cross-browser and responsive behaviour**, unless explicitly tested.

A prototype proves a design works. It does not prove an implementation will.
