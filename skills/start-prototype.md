# Start or change a prototype from Claude Code

**Shared by every product.** For an agent in Claude Code, in a product repository, asked for a prototype or for a
change to one. The app is not needed: this uses the same code the app runs, so the work appears in Flock Designer like
any other. Started from the app, a prototype never needs this file.

## Start it

From the product repository, run:

```bash
node ../flock-designer/workspace/bin/flkd.mjs new-prototype --project <id> --title "<project title>" --note "<what they asked for>"
```

- **`<id>`** is the project's folder in `../flock-designer/projects/`: the existing one when this continues a
  project, otherwise a short kebab-case name for it (`admin-usage`) that you choose from the request: do not ask the
  person about it. `--title` is needed only for a new project.
- **Each run is a new version** (`v1-i1`, then `v2-i1`): run it again for "another version" or "a different idea",
  once per version asked for, finishing each before starting the next.
- **"Based on V1"**: say so in the note, and start from that version's newest source,
  `../flock-designer/projects/<id>/prototypes/v1-i<n>.tsx` (the highest `n`), changing what the new idea changes.
  Without that, a new version starts from the brief.
- **`--note`** is the idea, in the person's own words: it becomes the project's brief, which reviewers read. Leave
  out instructions about how to make it ("mock data only", "a prototype, not codebase work"): the skills already
  say those.
- It is modelled on the branch the repository is on; `--from <branch>` names another.

If you were sent here, the path is decided: it is a prototype. Do not ask whether to prototype or build it in the
codebase.

If it says something must be installed first, tell the person what, and stop.

## Or change one

When asked to change a prototype that exists (a refinement of the same idea, not a different one), run:

```bash
node ../flock-designer/workspace/bin/flkd.mjs change-prototype --project <id> --name <v1-i1> --note "<what they asked to change>"
```

- **`--name`** is any iteration of the version to change; the change goes in that version's newest iteration.
- **It decides where the change goes**, and says so: in that iteration, or, when someone other than its makers has
  commented on it, in the version's next iteration (`v1-i2`), so what they commented on is never changed under them.
  Say which in your summary.
- **Save each change before starting another:** a change not yet saved is only on this machine, and the next
  `change-prototype` would start again from what people saw.
- A different idea is a new version: `new-prototype`, as above.

## Then build it

It prints your task: `build-prototype.md`, where to write the prototype, the command that checks it builds, the command
that saves it, and the one that publishes it to its page. Do exactly that, and finish as that skill says, ending with the
page: the link the publish command printed, or, when it printed none, why. Never give a link it did not print.

The command opens the page in the person's browser the first time a page goes up, and not for later changes to it;
you do nothing for that, and say nothing of it unless they ask. Pass `--no-open` only if they ask for no tab.

Say who can open the page in the publish command's words: it says when the site is public, as it is while the design
repository is.

## Taking a page down

Only when the person asks for an iteration to come off its page:
`node ../flock-designer/workspace/bin/flkd.mjs unpublish --project <id> --name <v1-i2>`. It removes the saved page and
source, pushes, and deploys the site without it; the record and comments stay. Pass on what it printed.
