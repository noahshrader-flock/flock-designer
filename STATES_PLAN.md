# States plan: comments made in a prototype's state

**Written 2026-10-09.** This file holds only what is still to do. What is built is in
[flock-designer.md](flock-designer.md) (Change log, 2026-10-09: "A prototype's states are in the top bar", "Comments read
a prototype's state the same way everywhere", and "A comment made in another state can be shown in it"). When a step is
done, its result moves there and the step leaves this file.

## Where it stands

- A prototype declares its states, and the app and the published page show a **State** dropdown in the top bar.
- A comment records the state it was made in (`anchor.state`). A comment from another state gets no pin; its card names
  the state ("State: panel") and has a **Show in panel** button that opens the page in it.
- The first state is the same whether it is asked for by name or not at all, when comparing and on the card.

## Steps

1. **Check the comments already made.** List the existing review comments whose state is `?state=<first state>`, and
   confirm their pins are now drawn on the default view. Nothing in GitHub is rewritten.
2. **Finish.** Run all tests, typecheck and build. Add one change-log row to `flock-designer.md`, back up first, and copy
   it to the repository. Then remove this file.

## Not doing

- **A second field for the state on a comment.** `anchor.state` already carries it.
- **Switching state when a comment is only hovered or listed.** Only pressing **Show** changes the view.
- **Rewriting old comments in GitHub.** They are read correctly as they are.
