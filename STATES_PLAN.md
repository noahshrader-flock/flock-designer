# States plan: comments made in a prototype's state

**Written 2026-10-09.** This file holds only what is still to do. What is built is in
[flock-designer.md](flock-designer.md) (Change log, 2026-10-09: "A prototype's states are in the top bar", and "Comments
read a prototype's state the same way everywhere"). When a step is done, its result moves there and the step leaves
this file.

## Where it stands

- A prototype declares its states, and the app and the published page show a **State** dropdown in the top bar.
- A comment records the state it was made in (`anchor.state`). A comment from another state gets no pin, and its card
  names the state ("State: panel") and says "Made in a different state of this page. Switch to that state to see where
  it was."
- The first state is the same whether it is asked for by name or not at all, when comparing and on the card.

## What is left

1. **The card says to switch, but cannot.** There is no button to do it.

## Steps

Tests first for each step. Every step applies to both the app's review screen and the published page, which share
`CommentList` and `pageScripts`.

1. **Put a "Show" button on an other-state card.** Next to the note, add a button: **Show in panel**. It sets the State
   dropdown to that state, which reopens the page in it. The pin is then drawn and the card is "found". `CommentList` gets
   one optional `onShowState(name)`. Review and the Viewer each pass the setter they already have for the dropdown.
   *Tests:* in both places, pressing it reopens the page with `?state=panel` and the dropdown says `panel`.
   No button for a state the prototype no longer has; the note stays.
2. **Check the comments already made.** List the existing review comments whose state is `?state=<first state>`, and
   confirm their pins are now drawn on the default view. Nothing in GitHub is rewritten.
3. **Finish.** Run all tests, typecheck and build. Add one change-log row to `flock-designer.md`, back up first, and copy
   it to the repository. Then remove this file.

## Not doing

- **A second field for the state on a comment.** `anchor.state` already carries it.
- **Switching state when a comment is only hovered or listed.** Only pressing **Show** changes the view.
- **Rewriting old comments in GitHub.** They are read correctly as they are.
