# Building UI in a Flock product

**Shared by every product, and for every agent.** How to build UI here, in whatever tool you work in: Claude Code, GitHub
Copilot or another. It is what `dsnr.md` starts from; DSNR's own workflow (its paths, projects, receipts, reviews and
Handoff) is in that file, and none of it is needed to follow this one. **DSNR puts this file at the start of every task
it gives an agent** (a prototype, a fix, the move into the code, codebase work, Handoff), so following it never depends
on opening it. Everything true of a product is in its `.dsnr/` folder, in the files listed under **What to read**;
nothing here names a product's stack, paths, components or commands.

You build **from the same components, patterns and constraints engineering uses in production**, so the path from idea
to implementation is continuous rather than a translation exercise. Engineering remains responsible for production
architecture and readiness.

## What to read, in order

Don't skip: most mistakes come from skipping the product's patterns or the design system.

1. **Hard rules:** `../standards/non-negotiables.md`, then the product's `.dsnr/standards/non-negotiables.md`. Both
   override everything below.
2. **The product:** its `.dsnr/README.md`, which lists its files and what each is for, and `.dsnr/manifest.md` in full:
   its stack, conventions, accessibility target, where things are, and what is off-limits. Then what its README says to
   read for the job (its patterns, composition and import rules) before importing anything from its source.
3. **The design system:** its `.dsnr/README.md`, in the design system's own folder: the checkout beside the product named as its package
   (`designSystem.package` in `.dsnr/workspace.json`), or the folder `designSystem.folder` names when it is a folder of the product's
   own repository. It says how to read the installed package (the version the product
   has, which a checkout may be ahead of), and holds Flock's conventions (`product-native-ui.md`) and voice and tone
   (`voice-and-tone.md`).
4. **The product's repository docs** (`AGENTS.md`, `CLAUDE.md` and the like) for architecture and conventions. They win on
   stack and tooling questions and never override the hard rules.
5. **Standards**, in the order `../standards/README.md` gives. Read the product's conventions, Flock's, and accessibility
   every time; the universal design tier when the job needs judgment the others don't cover.

**If you cannot read one of these** (a sibling folder that is not open in your editor, a checkout that is missing), say
so and stop before building, naming which: never guess at what it holds, least of all component APIs or token names.

## The contract

**Always:**

- resolve the design system's version from the installed package before naming a component as available;
- name your source for every significant layout, pattern, or interaction choice: an existing product view, a `.dsnr`
  rule, or an explicitly labeled proposal;
- keep generated code inside its place: the change boundary you were given;
- state which data is mocked, which behavior is simulated, and which is omitted;
- report a check you could not run as "not run," with the reason.

**Never:**

- claim a conformance level the repository's configuration and evidence do not support, or state one anywhere but the
  product's manifest;
- couple a prototype to the product's real API, state, flags, auth or analytics to make it feel real;
- modify files outside the declared change boundary, including "helpful" unrelated fixes;
- rewrite a `.dsnr` standard, pattern, or validator directly: propose a patch and let a human approve it;
- present a rough prototype as evidence of feasibility, or a passing automated scan as complete accessibility validation;
- substitute your own assertion for a validation you did not actually run.

## Building it

### Understand the job

If the direction is unclear (who it is for, what decision it supports, what happens next) **ask before building**. A
prototype that quietly invents a product decision is worse than one that stops and asks. If it is clear, proceed.

### Place it in the product

Work out where it lives: host page, real route, nav item, what it sits next to, and say so in your report. If the right
placement is genuinely ambiguous, that is a product question: ask. How the product's host is reproduced is in its own
files.

### Reuse before inventing

Search the product for how it already solves the problem, then the design system for what it ships, so most UI is
composition rather than construction. `../skills/choose-existing-patterns.md` is the order. Build something new only when
nothing fits, and **say so explicitly**.

### Real components, fake data

Real design system components, real tokens, real product patterns. Mock data typed with the product's real types where
they exist: real types, fake values, believable for the product, and **fixed**: written in the file, never random or relative
to today's date. A comment is pinned to the text near it, and a value that changes on every load cannot be found again.

**Use a component as it ships.** An override of its size, spacing, type or look needs a source: the person asked for it, the
product's own views do it, or the default fails accessibility. Name the source in what you say when you finish, and, only when
no prop or size the component supports gives it, mark it in the code with `@override` (see the build skill). A default that is
wrong everywhere is the design system's to fix, not each view's.

### When a reference disagrees with the product

A reference (a Figma frame, a screenshot, a sketch) is what the person means, drawn somewhere else. **Sizes, spacing, colours,
type, corners and shadows: the product wins.** Use the real component at its real size and never copy a number from the
reference: a frame drawn with a 64px nav does not make the product's 48px one wrong. **Wording and structure: follow the
reference** (its labels, which tabs, how things group), and say so: a person may have renamed something on purpose, and
quietly using the product's old word undoes it. Theme is not a difference: a prototype's review bar switches light and dark.
`../skills/recreate-from-reference.md` is the full method.

### Build what was asked for, and no more

**There is no rigor setting, and grounding is not one.** Real components and patterns are always on. **What varies is
how much you build:** what was asked for. One screen means one screen; "click through the states" means build them.

**Everything runs and clicks, at any scope.** If it does not open and click, it is not finished. **A single-screen
piece of work is finished work**: do not add states nobody asked for. If the scope is unclear, ask one plain question:
*is one screen enough, or do you want the other states too?* When you build states, they are the ones in
`../standards/universal/interaction-states.md`. **If you can't write the empty state, the feature isn't defined yet: flag
it,** whatever the scope.

## Checking it

Run the product's checks and report their real output: never claim one passed without running it. They are the commands
its repository docs and its `.dsnr/workspace.json` name. While you build, run only the tests for what you changed, never
the whole suite.

## When you finish, say

- What you built and where, and **where it sits in the product**
- Which existing patterns you reused
- **Anything you invented, and why nothing existing fit**
- Product questions you had to guess at
- **Where the reference and the product differ,** if you built from one: a line each (the reference says X, the product says Y, what you did)
- What would need to change for production

## When something goes wrong

Log it in the product's `.dsnr/knowledge/agent-gaps.md`, as `../knowledge/gap-logs.md` says. That log decides what gets
written next, not speculation.
