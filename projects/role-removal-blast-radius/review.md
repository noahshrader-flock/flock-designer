# Review record — role-removal-blast-radius

## Iteration i1 — 2026-09-28

**Branch:** `fd/role-removal-blast-radius/i1` · **Baseline:** `flock-coke` `noah/flock-designer`
(`14d0be46`) · **FUI:** 5.5.4 · **Level:** Test (agent-reasoned, not yet stakeholder-confirmed)

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — 0 errors in the prototype (two real errors found and fixed first: `FSToggleButtonGroup` doesn't accept `size`, and `FSToggleButton`'s `size` is `FSSize` (`'sm'|'md'|'lg'|'xl'`), not MUI's `'small'` — both caught by `tsc` against the installed 5.5.4 types, not by the manifest) |
| `npm run lint` (Biome) | Pass, after `biome check --write` fixed formatting/import-order in 4 files |
| Bare `src/…` value-import grep | Pass — no matches |
| `npm run smoke:prototype -- role-removal-blast-radius` | **Pass — bundles** |
| `npm run check:boundary` | Pass, after committing — only `src/prototypes/role-removal-blast-radius/` touched |

### Product parity

**Observed, with named sources** (also in `context-receipt.md`):

- The confirm-on-Save dialog adapts `src/components/common/warningDialog.tsx`'s exact structure —
  title + manual close-X, `FSDialogContent`/`FSDialogActions`, `destructivePrimary` proceed button.
  This is the same mechanism (`WarningDialog`) the real Role edit form **already** uses for
  VMS-permission toggle-off, just extended with the removed-permission list and affected-user
  summary that mechanism doesn't currently carry.
- The inline banner reuses the exact visual mechanism already in
  `rolePermissionSection.tsx:81-85` (`FSAlert severity="warning"` under a checkbox row,
  `ml:5 mr:1.5 mt:-1`), on the opposite trigger condition.
- The addition-comparison banner uses `severity="neutral" variant="filled"`, matching the product's
  existing informational-banner convention rather than reusing the removal warning's visual weight
  — a deliberate, visible distinction, not an accident.
- Sticky footer reuses `StickyFooterActions` (real component, imported directly, confirmed
  plumbing-free) with the same Cancel-secondary / Save-primary arrangement as
  `roleFormActionsFooter.tsx`.

**Not reviewed.** No human has looked at this against the real product view yet. Everything above
is the agent's own reading of the source files, not a design review.

**One thing to watch in review, named here rather than silently decided:** the confirmation
dialog's copy ("Confirm role changes" / "Save anyway") is this prototype's own, not lifted from
`WarningDialog`'s real callers — the real dialog's title defaults to "Are you sure you want to
proceed?", which `.flkd/standards/flock/product-native-ui.md` explicitly calls out as the kind of
generic phrasing Flock's direct-language convention prefers naming the object and action instead
of. Copy in this dialog follows that convention; if a reviewer prefers matching the *existing*
generic default for consistency with other `WarningDialog` callers instead, that's a real trade-off
to weigh, not something resolved here.

### Accessibility

Target is the consuming product's (Level A / `wcag2a`), per `flock-coke/.flkd/manifest.md`. **No
conformance level is claimed here.**

| # | Check | Result |
|---|---|---|
| 1 | Keyboard reachability | **Not run** — needs a human at a keyboard |
| 2 | Tab order | **Not run** |
| 3 | Focus visibility | **Not run** |
| 4 | Focus management | **Built for, not verified** — `FSDialog` is FUI's own (MUI-based) dialog, which traps and returns focus by construction; not independently confirmed here |
| 5 | Accessible names | **Built for, not verified.** Every checkbox carries both a visible `label` and an explicit `aria-label` (matching the real `rolePermissionSection.tsx` pattern); every icon-only button (`FSIconButton` close, in the dialog and the recreated breadcrumb) has an `aria-label`. Not screen-reader-tested |
| 6 | Heading structure | **Fixed, not just built-for** — see the real-page gap named in `context-receipt.md`: this prototype's own heading is `h4`-visual/`h1`-semantic → `h6`-visual/`h2`-semantic, correcting a skip found in the real `RoleFormPage` rather than reproducing it |
| 7 | Status announcement | **Not run.** The post-save `FSAlert severity="success"` is not wired to a live region beyond whatever `FSAlert` provides by default — not confirmed |
| 8 | Non-color signals | Pass by construction — every banner and the confirmation dialog carry the affected-user count and permission names as text, never color alone |
| 9 | Error messages | Not applicable — this prototype has no error state (see "states owed," below) |
| 10 | Reduced motion | Not applicable — no motion beyond `FSDialog`'s own built-in transition |

**Automated scan: not run.** No Cypress invocation attempted this iteration — this is a
`src/prototypes/` artifact, never routed, and isn't under `cy.checkPageA11y()` coverage regardless.

### States built, and why not others

Per Test's table in `../flock-designer's interaction-states.md` ("every state that carries the
decision — typically loading, empty, error, and the partial or success state the interaction
produces"):

- **Built:** default/loaded (untouched form); the state each toggle-off produces (inline warning,
  where the treatment shows one); the state Save produces (confirmation dialog, where the
  treatment blocks); the success/changed state after confirming (a summary alert naming what
  changed and for how many users, not a silent return to the loaded state).
- **Not built, deliberately:** page-level loading and fetch-error. These are identical to the
  existing `RoleFormPage`'s spinner/`FSAlert severity="error"` and don't carry this project's
  decision — building them would be padding, not evidence, per brief.md's "Level" reasoning.
- **Not built:** a permission/disabled variant (e.g., a read-only viewer). The real page has one
  (`roleFormActionsFooter.tsx`'s "Read only" message), but nothing in the stakeholder's ask turns
  on that axis — flagged rather than silently added.

### Open questions

Restated from `brief.md`'s "left open" section, plus one raised during the build:

1. **Is Test the right level, or should this have stayed Explore-static?** The agent's own call,
   not yet confirmed — see brief.md.
2. **Do additions deserve any of this treatment?** Built as an off-by-default comparison toggle,
   not resolved.
3. **Is >10 users the right graduated-treatment threshold?** Arbitrary, called out as such.
4. **Does "who" need real names, or is a count enough?** Both are shown; not resolved.
5. **Should the existing VMS-toggle `WarningDialog` (no user count, fires regardless of role size)
   be replaced by whichever treatment is chosen here, or left as a separate mechanism?** Not
   decided.
6. **Dialog copy convention** — this prototype's direct phrasing vs. matching `WarningDialog`'s
   existing generic default across its other callers. See "Product parity" above.

### Decisions

**None.** Nothing here has been confirmed by a person yet.
