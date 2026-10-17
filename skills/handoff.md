# Hand work to engineering

**Shared by every product.** Nothing here names a product's tools, commands or standards: each product
says those for itself, in its own guidance, and this tells you to read it. Used when codebase work is
handed to engineering: the app's **Hand off** puts this file in the task, so nobody has to find it.

Handoff is the one place the heavy checks happen. While work is being built, only a light check runs, so
that building stays fast; **this is where it is proved fit for an engineer.** Take the time. Do not hand
over work that fails its own checks: an engineer acts on what you say.

You are not here to build more. The work is already on its branch. Your job is to prove it, fix what
blocks it, and tell the engineer what they are picking up.

## 1. Run the product's gate first

The product's guidance names its handoff gate (the task gives the command). Run it, and **fix what it
names**. A gate may also check for what the steps below write (the review record, the handoff note):
those fail now and must pass at the last run. The gate reports; it does not decide. Most of what it finds needs judgment (a color that is a deliberate
exception, a check that legitimately cannot run here), so say which it is, and never edit a check to make
it pass.

**Then measure its accessibility in a real browser,** so the reviews read what was measured, not guessed:

```bash
node ../flock-designer/workspace/bin/dsnr.mjs accessibility --project <id>
```

It starts the product's app as the product says (its design mode, on mock data), checks the pages its manifest names
with axe, probes each (the Tab walk, focus, hover, reflow, zoom, text spacing, forced colors, forms and messages), reads
the work's own files, writes what it found and the evidence into the project's folder in the design repository, and
prints it. Fix what it found that is in the work, and run it again. What it says it could not open, or did not run, goes
into the review record as it said it; a finding above the product's target is readiness, not a fault of this work.

## 2. Review it, both ways, independently

Two reviews, because *does this read as the product* and *is it built correctly* are different questions
with different evidence. The reviewers are shared, `../agents/product-parity-reviewer.md` and
`../agents/implementation-reviewer.md`, and, in Claude Code, the product's shims make them subagents.

- **Where the agent runs subagents, run them as subagents, in the foreground,** one after the other or together, and wait for both. Never
  in the background, and never with a reminder to check later: this run ends when you stop, and a review
  still going is lost.
- If subagents are not available, read each definition and follow it directly, one at a time, and say
  that you did. A review of your own work is weaker than a second reader, and much stronger than none.
- **Write both into the project's review record** (`projects/<id>/review.md` in the design repository).
  Its **accessibility section is written by `dsnr accessibility`** from what it measured, between its
  `<!-- dsnr:accessibility -->` lines: never edit it, as `dsnr check-accessibility` refuses a section that
  is not the measure's. Put what each review found about accessibility under that review, as its own
  notes. A check that did not run is recorded as "not run", with what would make it runnable, never as a pass.

## 3. Fix what they block on, and check again

Fix every finding the reviews call blocking, and the ones marked should-fix that are quick and clearly
right. Say in the record which you did not fix, and why.

- **Commit after each fix,** with the product's light check passing, not once at the end. A run that stops
  part way then loses one fix, not the whole pass.
- If the work changed in ways the audit does not say, **update the audit in the same commit.**

**Changing a mock, fixture or component other screens use** needs one more check: each existing caller
still gets what it got, with the request it really sends.

## 4. Write the handoff for the engineer

`HANDOFF.md` at the root of the branch, committed with the work: it is the first thing seen on checkout.
Say in it that it is to be deleted when the work merges.

**The design record stays in the project's folder** (brief, context receipt, audit, both reviews). `HANDOFF.md` tells
engineering what they picked up; the project folder is why it was built that way. Do not duplicate one into the other.

**It tells them what the diff does not say. Not a summary of the diff, not a case for the work.**

- **The job,** in a line: what decision or task this supports, and for whom.
- **What they pick up.** Lead with the list of stand-ins that engineering swaps for the real thing
  (the product's guidance says what these are: for a product with a mock network layer, the stubbed
  endpoints). If nothing was stubbed, say so plainly.
- **What is not real.** Which data is mocked, which behavior is simulated, which states were never built.
- **What the real data has to be:** what each stand-in would have to return, in the shape the view uses.
  Usually the most valuable part: work built on realistic mock data has already specified that contract.
- **Who sees what:** the permissions and roles the states depend on.
- **Decisions you made that were not yours.** Every invented number, every convention chosen without a
  source, every question left open that you answered to keep moving. Lead with the one most likely to be
  wrong. Carry the audit's "Needs a decision" items across: each is still open.
- **Where it departs from the product's own patterns,** and why.
- **Anything a flag, permission or setup needs** before the work can be seen outside design mode.
- **Which files are the feature,** with the exact `git diff` command that shows only those: a branch may
  carry unrelated work that has not merged.
- **Accessibility: the manual list.** `dsnr accessibility` writes it into `HANDOFF.md` from what it
  measured, between its `<!-- dsnr:manual-list -->` lines: what a person must still check, and how. Leave
  it as it is, and never restate or shorten it; if the work changed since, run the command again.

If something is unfinished, say it is unfinished. Do not hedge.

**Commit it, then run the gate a last time: it must pass.** Check the accessibility record too, with
`node ../flock-designer/workspace/bin/dsnr.mjs check-accessibility --project <id>`: it must pass as well.
If either cannot, say why, and that the work is not ready.

## When you have finished

Say whether the work is ready, and what is still open. If the gate or a review still blocks it, say what
and why you could not clear it: that is a complete answer. **The person hands it to the engineer, not you.**
Never push.
