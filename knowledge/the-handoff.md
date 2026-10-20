# The handoff

The handoff is how codebase work becomes something engineering can take: checked, reviewed, fixed, and with a clear
answer to "is it ready?". It is run by the agent, in your window, and it ends with a file on the branch that says ready or
not ready, and why.

## Do it

1. Open the work's branch in the product.
2. In the panel, open the project's menu and choose **Hand off**.
3. Read what will happen, then press **Start handoff**. The agent opens with the task.
4. Watch it, and step in when you like. When it commits its verdict, DSNR tells you what it says.

## What happens

1. *The product's gate runs.* The gate is the product's own full check: every test, accessibility, the app bundling, the
   standards. It runs first, and again at the end.
2. *Accessibility is measured* in a real browser, and recorded with its evidence.
3. *Two independent reviews.* The product parity reviewer asks whether the work feels native to the product. The
   implementation reviewer checks the code: its structure, its imports, that no prototype shortcut remains. Both are
   written into the project's `review.md`, in the design repository.
4. *Fixes, one at a time.* What the reviews block on is fixed and committed on the branch, one fix per commit.
5. *The verdict.* The agent commits `HANDOFF.md` at the root of the branch. Its first line is either "Ready for
   engineering" or "Not ready", and the rest says why.

Nothing is pushed during a handoff.

## What DSNR says at the end

- *Ready:* DSNR says so, and offers **Open a draft pull request** to send it to engineering (see
  [Committing](committing.md)).
- *Not ready:* DSNR says so. `HANDOFF.md` lists what is left.
- *Something it did not expect:* if the agent pushed the branch, or changed files a handoff should leave alone (the
  product's build settings, its lockfile, its workspace file), DSNR points it out. A handoff that pushed is not counted as
  ready.

You can run it again after more work: **Start handoff** runs the whole check again.

## If the branch is behind

If the product's main branch has moved on since the work started, the handoff says how far behind the branch is, and
whether it would merge cleanly. The agent does not merge it in during a handoff. Bring it up to date first; see
[Staying up to date](staying-up-to-date.md).

## Why it works this way

- *One clear answer.* Engineering gets a single file that says ready or not, with the reasons, rather than a
  conversation to piece together.
- *Two reviewers, not one.* Whether it feels like the product and whether the code is sound are different questions, and
  each reviewer only answers its own.
- *Nothing leaves your computer during it.* The handoff checks and fixes; sending the work on is a separate step you take.

## If something goes wrong

- *"Open … first: a handoff checks the work where it is."* Check out the work's branch in the product, then hand off again.
- *The verdict never comes.* DSNR waits until `HANDOFF.md` is committed. If the agent stopped before that, ask it to
  finish.
