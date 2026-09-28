# Flock Designer

Two things live here.

**`projects/`** — one folder per project. Drop in whatever context you have.

**`standards/`** — the design standards that are not specific to any one product. The product's own
patterns and boundaries stay in the product repository; these are the ones that hold anywhere.

## Starting a project

Make a folder under `projects/`. Put whatever you already have into it — a markdown file, a PRD, a
few screenshots, some links, a paragraph. There is no required format and no minimum.

`projects/_template.md` exists in case a blank page is annoying. Ignore it otherwise. Three
sentences is a legitimate way to start a project, and "here's the Figma, make it work on mobile" is
a legitimate way to start a project.

Everything the agent writes for that project lands in the same folder — the brief it wrote from your
context, what it read before building, the review, and the decisions you confirmed. One project, one
place, so picking up someone else's work means reading one folder.

## What is not here

Prototype code. That lives in the product repository it was built against, on its own branch, where
it can actually run.
