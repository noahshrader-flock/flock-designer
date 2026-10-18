# Start or change a prototype from an agent

**Shared by every product.** For an agent in a product repository (Claude Code reaches this through its `dsnr` shim; any
other agent reads this file), asked for a prototype or for a change to one. The app is not needed: this uses the same code the app runs, so the work appears in DSNR like
any other. Started from the app, a prototype never needs this file.

## Start it

From the product repository, run:

```bash
node ../flock-designer/workspace/bin/dsnr.mjs new-prototype --project <id> --title "<project title>" --note "<what they asked for>"
```

- **`<id>`** is the project's folder in `../flock-designer/projects/`: the existing one when this continues a
  project, otherwise a short kebab-case name for it (`admin-usage`) that you choose from the request: do not ask the
  person about it. `--title` is needed only for a new project.
- **Each run is a new version from the brief** (`v1`, then `v2`): run it again for "a different idea", once per idea
  asked for, finishing each before starting the next. Another version of one that exists is `--new-version` (below).
- **"Based on V1"** is not a new run of this: it is `change-prototype --name v1 --new-version` (below), which starts
  the new version from V1's source and records that it did. Without that, a new version starts from the brief.
- **`--note`** is the idea, in the person's own words: it becomes the project's brief, which reviewers read. Leave
  out instructions about how to make it ("mock data only", "a prototype, not codebase work"): the skills already
  say those.
- It is modeled on the branch the repository is on; `--from <branch>` names another.

If you were sent here, the path is decided: it is a prototype. Do not ask whether to prototype or build it in the
codebase.

If it says something must be installed first, tell the person what, and stop.

## Or change one

When asked to change a prototype that exists, run:

```bash
node ../flock-designer/workspace/bin/dsnr.mjs change-prototype --project <id> --name <v1> --note "<what they asked to change>"
```

- **`--name`** is the version to change (`v1`, `v2`); the change is made in it, in place.
- **Add `--new-version` only when the person asks for a new version** ("make a new version", "try it as another
  version"). Then the change is made in a copy of it, the next version, and what they had stays as it was. Never start
  one on your own, whoever has commented.
- **When others have commented on the version, the command says so:** changing it in place can leave their pins on the
  wrong element. Say that in your summary, with how many comments.
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
`node ../flock-designer/workspace/bin/dsnr.mjs unpublish --project <id> --name <v2>`. It removes the saved page and
source, pushes, and deploys the site without it; the record and comments stay. Pass on what it printed.
