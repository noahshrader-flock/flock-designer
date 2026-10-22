# Start or change a prototype from an agent

**Shared by every product.** For an agent in a product repository (one reaches this through the product's `dsnr` agent file, any
other reads this file), asked for a prototype or for a change to one. This is how every prototype is started: it uses the same code the app runs, so the work appears
in DSNR like any other.

## Start it

From the product repository, run:

```bash
node ../flock-designer/workspace/bin/dsnr.mjs new-prototype --prototype <id> --title "<prototype title>" --note "<what they asked for>"
```

- **`<id>`** is the prototype's folder in `../flock-designer/prototypes/`: the existing one when this continues a
  prototype, otherwise a short kebab-case name for it (`admin-usage`) that you choose from the request: do not ask the
  person about it. `--title` is needed only for a new prototype.
- **Each run is a new version from the brief** (`v1`, then `v2`): run it again for "a different idea", once per idea
  asked for, finishing each before starting the next. Another version of one that exists is `--new-version` (below).
- **"Based on V1"** is not a new run of this: it is `change-prototype --name v1 --new-version` (below), which starts
  the new version from V1's source and records that it did. Without that, a new version starts from the brief.
- **`--note`** is the idea, in the person's own words: it becomes the prototype's brief, which reviewers read, and DSNR
  keeps it in the version's `requests-<version>.md`. Leave out instructions about how to make it ("mock data only",
  "a prototype, not codebase work"): the skills already say those. Pass what they asked, not what they pasted in:
  never a secret, and no customer's or person's details. DSNR takes out secrets, email addresses and phone numbers from
  what it keeps, but it cannot tell a name from any other word.
- It is modeled on the branch the repository is on; `--from <branch>` names another.
- **A prototype of what you have been working on together** ("make a quick prototype of this"): a prototype is a new page
  built from the real components, not a copy of the branch, so what was worked on reaches it only as you carry it.
  Write `--note` from what the person asked for and decided in the conversation, as a short brief rather than the
  conversation. Read the uncommitted changes this conversation made (`git status`, `git diff`) and build what they show;
  other changes in the working tree are not part of it. Leave every change as it is: they are the person's work in
  progress, not the prototype's, and are neither reverted nor committed for it.

If you were sent here, the path is decided: it is a prototype. Do not ask whether to prototype or build it in the
codebase.

If it says something must be installed first, tell the person what, and stop.

## Or change one

When asked to change a prototype that exists, run:

```bash
node ../flock-designer/workspace/bin/dsnr.mjs change-prototype --prototype <id> --name <v1> --note "<what they asked to change>"
```

- **`--name`** is the version to change (`v1`, `v2`); the change is made in it, in place. Your `--note` is kept, in
  order, with what was asked of that version before.
- **Add `--new-version` only when the person asks for a new version** ("make a new version", "try it as another
  version"). Then the change is made in a copy of it, the next version, and what they had stays as it was. Never start
  one on your own, whoever has commented.
- **When others have commented on the version, the command says so:** changing it in place can leave their pins on the
  wrong element. Say that in your summary, with how many comments.
- **"Process" or "address" the comments on a version** is a change to it, with the comments as the request. Run:

  ```bash
  node ../flock-designer/workspace/bin/dsnr.mjs change-prototype --prototype <id> --name <v1> --note "Address the open comments"
  ```

  It writes the version's open comments to a file and says where, and prints the task: the source to change, the command
  that builds the page, and the one that saves it. Do not work from the comments alone: without that task there is no
  build and no save, and the page the reviewers see does not change.
- **Edit only the file the task names**, in the app's own folder. The version's source in the design repository
  (`../flock-designer/prototypes/<id>/`) is the saved copy: saving writes it from the working one, so an edit
  made there is lost, and the page is not rebuilt. The product repository's own scripts (`scripts/smoke-prototype.mjs`)
  are for code in the product, not for a prototype.
- **Save each change before starting another:** a change not yet saved is only on this machine, and the next
  `change-prototype` would start again from what was saved.
- A different idea, not started from this one, is a new version too: `new-prototype`, as above.

## Then build it

It prints your task: `build-prototype.md`, where to write the prototype, the command that checks it builds, the command
that saves it, and the one that publishes it to its page. Do exactly that, and finish as that skill says, ending with the
page: the link the publish command printed, or, when it printed none, why. Never give a link it did not print.

The command opens the page in the person's browser the first time a page goes up, and not for later changes to it;
you do nothing for that, and say nothing of it unless they ask. Pass `--no-open` only if they ask for no tab.

Say who can open the page in the publish command's words: it says when the site is public, as it is while the design
repository is.

## Taking a page down

Only when the person asks for a version to come off its page:
`node ../flock-designer/workspace/bin/dsnr.mjs unpublish --prototype <id> --name <v2>`. It removes the saved page and
source, pushes, and deploys the site without it; the record and comments stay. Pass on what it printed.
