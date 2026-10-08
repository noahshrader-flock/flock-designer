# Start a prototype from Claude Code

**Shared by every product.** For an agent in Claude Code, in a product repository, asked for a prototype. The app is
not needed: this starts it with the same code the app runs, so it appears in Flock Designer like any other. Started
from the app, a prototype never needs this file.

## Start it

From the product repository, run:

```bash
node ../flock-designer/workspace/bin/flkd.mjs new-prototype --project <id> --title "<project title>" --note "<what they asked for>"
```

- **`<id>`** is the project's folder in `../flock-designer/projects/`: the existing one when this continues a
  project, otherwise a short kebab-case name for it (`admin-usage`). `--title` is needed only for a new project.
- **Each run is a new version** (`v1-i1`, then `v2-i1`): run it again for "another version" or "a different idea",
  once per version asked for, finishing each before starting the next.
- **"Based on V1"**: say so in the note, and start from that version's newest source,
  `../flock-designer/projects/<id>/prototypes/v1-i<n>.tsx` (the highest `n`), changing what the new idea changes.
  Without that, a new version starts from the brief.
- It is modelled on the branch the repository is on; `--from <branch>` names another.

If it says something must be installed first, tell the person what, and stop.

## Then build it

It prints your task: `build-prototype.md`, where to write the prototype, the command that checks it builds, and the
command that saves it. Do exactly that, and finish as that skill says.
