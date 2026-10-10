# Non-negotiables

**Hard rules, the same in every product.** Every DSNR agent and skill inherits these, and so do the product's own, in its
`.dsnr/standards/non-negotiables.md`, which names what each rule means in that product (its plumbing, its mock layer, its
conventions). If a request conflicts with one, say so rather than complying.

## 1. Know which path you are on

**Prototype** ("should we, and what should it look like?") or **codebase** ("build this, we know we want it"), decided
as `../agents/dsnr.md` says. Rules 2 and 3 are the prototype path's; 4 is the codebase path's; the rest hold on both.

## 2. A prototype touches no production plumbing

A prototype **never imports or calls** what makes the product real: its API and data store, its feature flags, its auth,
its telemetry and analytics. The product's `.dsnr/implementation/` names them and says what may be imported instead.
**Instead:** mock data, typed with the product's real types where they exist. Real types, fake values. If a prototype
genuinely can't be built without one of these, stop and say so. Don't work around it.

## 3. A prototype is built in product context

A view is never a page on its own. Establish its **host page, route, nav item and neighbours**, state them in your report,
and reproduce enough of that context to make the placement legible. Import the product's real chrome wherever it is free
of plumbing rather than building a lookalike; where the only version is coupled to plumbing, recreate it and say so. **A
boundary violation is worse than drift.**

## 4. On the codebase path, only the network is fake

- **Data comes from the product's mock layer**, following its existing handlers. Say in your report which endpoints you
  stubbed: that list is what engineering swaps for real ones.
- **Everything else is real.** State, routing, permissions, feature flags, error handling, wired the way the product
  already does, following its own repository docs.
- **A new view is behind a new flag**, on wherever the product shows work for review. Name the flag in your report.
- **Changing a handler or fixture other screens use:** test that each existing caller still gets what it got, with the
  request it really sends.
- **Do not invent a parallel data layer**, and never send real telemetry from stubbed interactions or call a production
  API directly. Stub the boundary; do not cross it.
- **Tests are not optional here.**

The handoff bar: a branch engineering takes over, where the frontend is complete and to spec and their remaining work is
wiring the plumbing, not rebuilding what you did.

## 5. The design system first

Its rules (its components before the base library's, tokens and never hardcoded color, its icons, nothing deprecated) are
in its `.dsnr/README.md`, and its facts are in the installed package. **Never guess at a component, prop or token name:**
if the design system's guidance cannot be read, say so.

## 6. The product's conventions

Read its repository docs before writing code. They win on stack and tooling questions; they do not override these rules.

## 7. Accessibility is not optional

The rules are `universal/accessibility.md`; the product's target is in its `.dsnr/manifest.md`, and nowhere else. It is a
floor: the product may raise it, nothing lowers it. Run the product's accessibility check on what you build.

## 8. Build what the work needs

No view is complete with only its happy path. **On the codebase path, every state the feature really has.** On the
prototype path, what was asked for: a single-screen prototype is finished. **What never varies:** if you cannot write the
empty state, the feature isn't defined yet. Say so whatever the scope.

## 9. Run the check, or say you didn't

The most repeated failure, by a wide margin, is not wrong code: it is *claims about code that nobody ran*.

- **Run the command before describing what it does.** Not "this should work": run it.
- **Cite what you actually saw.** A file and line you read, not one you expect to exist.
- **"Not run" is always an acceptable answer. Silence is not.** An unstated check reads as a passing one.
- **But "not run" must say what would make it runnable, and who owns that**, or it is a release valve: a gap recorded
  and then ignored.
- **A check that cannot be run is a blocker, not a note.** If nothing will make it runnable, say so and stop.
- **A verification you did not perform is worse than none**, because it stops anyone else looking.

This applies to writing instructions as much as writing code. An instruction nobody has followed is a guess with
formatting.

## 10. Humans decide

Surface trade-offs, flag risks, and recommend. Don't resolve genuine product questions silently: ask. A prototype that
quietly invents a product decision is worse than one that stops and asks.
