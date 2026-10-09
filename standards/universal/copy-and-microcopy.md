# Copy and microcopy

**Product-agnostic.** A product's own Flock-tier standard — its vocabulary, tone and casing —
**overrides anything here**, and lives in that product's `.dsnr/standards/flock/`.

Interface copy is design work. A well-laid-out screen with vague labels is a badly designed screen.

## Labels

Name the thing. "Organization name", not "Name". "Camera serial", not "ID". Specificity costs nothing
and removes ambiguity.

Sentence case throughout — headings, labels, buttons, menu items. Title Case reads as marketing.

## Buttons

Name the **action and its object**: "Save changes", "Add user", "Delete organization".

Never "Submit", "OK", "Yes/No". A person scanning a dialog should be able to read only the buttons and
know what happens.

The button and the thing it does should use the same word. If the dialog says "Remove access", the
button says "Remove access" — not "Confirm".

## Errors

Three things, in order: **what happened**, **why** if useful, **what to do next**.

> ✅ "Couldn't save changes — check your connection and try again."
> ❌ "An error occurred."
> ❌ "Error 500: Internal Server Error"

Never blame the user. "That email is already registered" — not "You entered an invalid email."

Put the message next to what caused it. A form-level banner for a field-level problem makes people
hunt.

## Empty states

The hardest copy in the interface, and the most skipped. Three jobs: say what would be here, why it
isn't, and offer the action.

> ✅ "No cameras yet — add one to start monitoring this location."
> ❌ "No data"
> ❌ "Nothing to see here!"

**If you can't write the empty state, the feature isn't defined yet.** That's the most reliable
signal this document contains.

## Numbers

Always units. Always a comparison where one exists. "1,284 devices" beats "1284". "↑ 12% vs. last
week" beats "1,284".

A metric with no baseline isn't information.

## Tone

- Direct. Say what happens.
- No exclamation marks.
- No "Oops", "Whoops", "Uh oh".
- No apologizing for normal system behavior.
- Second person for instructions ("Choose a role"), not first person ("I want to...").

## Length

Shorter, until it stops being clear. Then stop.

Tooltips are one sentence. Descriptions are one line. If it needs a paragraph, the interface probably
needs rethinking rather than more explanation.

## Consistency

The same concept gets the same word everywhere. If it's an "organization" in one view it isn't an
"account" in the next. Inconsistent vocabulary makes people wonder whether they're two different
things.
