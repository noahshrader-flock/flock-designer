# Implementation plan: faster builds, and a Handoff process

**Written 2026-10-06**, after the first real *Build in the codebase* run (`admin-usage` q1 → Coke
`feature/admin-usage`). This plan is separate from `PLAN.md`; it is the work that run taught us.

## Why

The run took 47 minutes and $22.74, ended with its review fixes half done and uncommitted, and shipped real
bugs that only the independent reviews caught. The audit and the code that moved over were good. The failures
were ours: the agent could not read some guidance, the app switched the branch under it, Coke's rules did not
say which lists were for prototypes only, and a fix pass was left running in the background when the turn
ended.

**The decision this plan carries out (Noah, 2026-10-06):** two tiers of checking.

| | While building in the code | Handoff |
|---|---|---|
| When | Every iteration, automatic | Once, when someone chooses Handoff |
| Purpose | Stay on standard, don't veer | Prove it is fit for engineering |
| Checks | Type check and lint on changed files, only the related specs, the bare `src/…` import rule, branch | Full suite, accessibility, the app bundles, both reviews, fixes, `HANDOFF.md` |
| Time | Target 30 to 35 minutes per build | The expensive pass, run once |

## Rules for whoever does this

- **Shared things go in this repo; product-specific things stay in the product repo.** Handoff's judgment is
  shared (`skills/handoff.md`); its gate and Coke's standards stay in Coke.
- **Nothing may depend on a person remembering a step.** If a step matters, the app or the agent does it.
- **Never edit main-process files (`workspace/src/main/`) while an agent is running** in the dev app: it
  restarts and can kill the run. Check first, or work in a temporary `git worktree` and bring the commit over.
- **Never `git checkout` in Noah's Coke repo.** Make Coke edits in a temporary worktree of
  `noah/flock-designer`, and remove it afterwards.
- **Commit only your own files**, as Noah, with **no `Co-Authored-By` trailer**. Never push.
- **Ask before changing a contract, or a step's order or meaning.** Phase 1's reversal of where the reviews
  happen was approved by Noah on 2026-10-06.
- Prototypes and runs use mock data only.

## Already done (2026-10-06, committed)

| Commit | What |
|---|---|
| flock-designer `ccbf80d` | Hand codebase work to VS Code: open the checkout, take a run over, continue its conversation |
| flock-designer `1a2b00d` | No scheduling tools in headless runs; uncommitted changes mean unfinished; no branch switch under a running agent; shared skills and standards readable; read-only git allowed |
| flock-designer `ed79bcb`, merged | **Phase 3:** Hand off to engineering in the app, its report, the uncommitted-changes warning; VS Code pieces renamed to editor |
| flock-designer `1520ac1`, Coke `99ebaf62` | **Phase 2:** the shared handoff skill, Coke's handoff slimmed to its own gate, specs type-checked |
| flock-designer `50751e9`, Coke `6b1ab916` | **Phase 1:** the light check, related tests only, reviews moved to Handoff, commit as you go |
| flock-designer `fe04eff` | `move-to-code`: unattended, finish before stopping, existing actions keep their rules, every data state owed, shared mocks checked against callers |
| Coke `48924d9d` (on `noah/flock-designer`, unpushed) | Off-limits lists and the import line scoped to the prototype path; codebase rules for flags and shared handlers; reviewer codebase sections; gaps logged |

---

## Phase 1: Faster builds, and the light check

**Goal:** a Build in the codebase run takes 30 to 35 minutes, and still keeps the standards.
**Where:** Coke guidance (via a temporary worktree of `noah/flock-designer`), and `skills/`.

| # | Item | Status |
|---|---|---|
| 1.1 | Add `npm run check:iteration` to Coke (`scripts/check-iteration.mjs`): type check, lint on the changed files, only the specs related to the changed files, no bare `src/…` value imports in the diff, branch is not `develop`. Fast, and it exits non-zero on failure | **done** (Coke `6b1ab916`): about 30 s on the admin-usage work; caught a bare import that tsc, lint and tests passed, and the failing test in the unfinished fixes. Also named in `workspace.json`, with the handoff gate |
| 1.2 | Rule: while building, run the changed specs only; the full suite runs once, at Handoff. In Coke's `flock-designer.md` and the shared skills | **done** (Coke `6b1ab916`, `50751e9`): `vitest related` on what changed |
| 1.3 | Move the reviews and the fix pass out of the build run, into Handoff. Shared `move-to-code.md` (`50751e9`); Coke's `flock-designer.md` §6 and Verification, and `CLAUDE.md` (`6b1ab916`). Kept: wait for any subagent in the foreground, never leave a reminder | **done** |
| 1.4 | Permission denials (44 in the first run, 18 for the builder): re-measure after the next run, then widen the allowlist only for what is still denied | after Phase 4 |

**Done when:** a build run ends after the light check passes, with nothing running, and the guidance no longer
asks the build run for reviews.

## Phase 2: The Handoff process (guidance)

**Goal:** one shared description of what Handoff is, and Coke's gate behind it.
**Where:** `skills/` in this repo; `.flkd/` in Coke.

| # | Item | Status |
|---|---|---|
| 2.1 | Shared `skills/handoff.md` (gate first, both reviews as foreground subagents, fix and re-check, `HANDOFF.md`), and its row in `skills/README.md` | **done** (`1520ac1`) |
| 2.2 | Commit after each fix, in `handoff.md` and `move-to-code.md`, so an interruption loses minutes, not the whole pass | **done** (`1520ac1`, `50751e9`, Coke `6b1ab916`) |
| 2.3 | Slim Coke's `.flkd/skills/prepare-handoff.md` to Coke's own gate and standards, pointing at the shared skill. The generic judgment sections (what engineering picks up, decisions that were not yours, accessibility as run or not run) are already in the shared skill. Coke's `scripts/check-handoff.mjs` stays: it already runs the full suite, accessibility, the bundle check, the standards against the diff, and checks both reviews are recorded | **done** (Coke `99ebaf62`): keeps the gate, the reviewers, and what Coke engineers pick up (stubbed MSW endpoints, the feature flag) |
| 2.4 | Type-check the test files. Coke's `tsconfig.json` leaves `__tests__/` out, so a spec with a type error passed every check. Add `tsconfig.test.json`, and fail both the light check and the handoff gate on type errors in the specs this work changed (the baseline already has 10 errors in 8 specs it did not write; those are not counted) | **done** (Coke `99ebaf62`): a planted error in a changed spec fails the light check; about 9 s |

**Done when:** an agent given only `skills/handoff.md` and Coke's guidance can run Handoff without a person
telling it which command.

## Phase 3: Handoff in the app

**Goal:** Handoff is a button, not a command someone remembers.
**Where:** `workspace/src/` (main-process files: check no agent is running first, or use a worktree).

| # | Item | Status |
|---|---|---|
| 3.1 | A **Handoff** item in the More menu for codebase work. It starts an agent run with `skills/handoff.md` as its task, tags it with the branch, saves its session (so Continue in Claude Code works), and refuses while the agent is busy | **done** (`ed79bcb`, merged) |
| 3.2 | Show the outcome: ready, or what still blocks, taken from the run's last message and whether the branch is clean. A run that leaves uncommitted changes is reported unfinished, as build runs already are | **done** (`ed79bcb`): "Ready for engineering" only when the agent says so and `HANDOFF.md` is committed |
| 3.3 | Opening codebase work that has uncommitted changes with no agent running says so, and offers Continue in Claude Code. Today the warning appears only while the app waits on a run | **done** (`ed79bcb`): an "Uncommitted changes" button in the toolbar |
| 3.4 | Tests for the above; typecheck (with unused locals), the test suite, the build and the smoke boot | **done** (`ed79bcb`): 740 tests, typecheck, build, smoke; the screens driven end to end with a fake workspace |

**Done when:** from a codebase iteration, choosing Handoff runs the gate, the reviews and the fixes

unattended, and the screen says whether it is ready.

## Phase 4: Finish `admin-usage` as the first real Handoff

**Goal:** prove the new guidance on the branch that exposed the gaps. **Noah's call**: it touches his Coke
checkout, which has 14 uncommitted files from the run that was cut off.

| # | Item | Status |
|---|---|---|
| 4.1 | Run Handoff on `feature/admin-usage` once Phase 3 exists (or by hand with `skills/handoff.md` before then) | waiting on Noah |
| 4.2 | The open review findings, which Handoff must clear or record: the feature flag (declared, and on in design mode); a11y scans scoped narrower instead of the violation recorded; the "Add New Role" action nobody asked for; the stale audit; sample data that drifted from the prototype's; the type error; the unwired test helper; the removed test timeouts | with 4.1 |
| 4.3 | Judge it: the Users page works, the Usage tab appears behind its flag, and engineering would accept the diff. Then run a second, different prototype through the same path | after 4.1 |

**Done when:** `npm run handoff -- admin-usage` passes, `HANDOFF.md` is on the branch, and a second prototype
finishes in one pass without repeating these classes of bug.

## Phase 5: Decisions for Noah or engineering

Nothing here blocks Phases 1 to 3.

| # | Decision | Notes |
|---|---|---|
| 5.1 | How design mode turns a new view's flag on | Guidance now says to add it to the LaunchDarkly mock in `src/mocks/handlers.ts`; engineering may prefer another way |
| 5.2 | Coke's `.github/instructions` still says to use `src/…` imports, which crash the app on load | Engineering's file; agents may not edit `.github/` |
| 5.3 | Does Coke support dark mode? | Prototypes render dark on a dark Mac |
| 5.4 | May prototypes carry the MUI X licence key? | The grid shows a watermark without it |
| 5.5 | When does `.flkd` go onto `develop`? | Agents read guidance from the code branch, else the accepted checkout |
| 5.6 | Pin a model per agent, or use a different one for the reviewers? | Not planned unless asked. Today every agent uses the default (Opus 5.5 in the first run) |

## Phase 6: Verify and tidy up

| # | Item | Status |
|---|---|---|
| 6.1 | Noah: click **Take over in Claude Code** during a codebase build and confirm the conversation opens in VS Code's Claude Code panel. Not yet seen working | Noah |
| 6.2 | `PLAN.md`: add a change-log row (newest first), completed steps to Appendix B, back up to `/tmp/phases/` first, one write, no broken `](#anchor)` links, copy to `FLCKDSNR/flock-designer.md` | at the end |
| 6.3 | Commit only your own files in this repo; the other uncommitted app changes here are not part of this plan. Coke commits go on `noah/flock-designer` only. Pushing is Noah's | each phase |
| 6.4 | Update the open-items memory as phases land | each phase |

## Order

1. **Phase 1, 2** (guidance only, no app restart), together.
2. **Phase 3** (app).
3. **Phase 6.2 to 6.4**, as each phase lands.
4. **Phase 4** when Noah says; **Phase 5** and **6.1** are Noah's.
