# Flock Designer

Three things live here.

**[`PLAN.md`](PLAN.md)** — the plan. What Flock Designer is, every contract, the 17-step sequence and
where it currently stands, the decision gates, and the change log. **It is the single document**; if
you are picking this up, start with its "Where we are" block.

**`projects/`** — one folder per project. Drop in whatever context you have.

**`skills/`** — workflows the agent follows that are the same in every product, such as acting on a
reviewer's comments. The app puts the right one in the agent's task, so nobody has to find or install
it, and a product repository does not carry a copy.

**`standards/`** — the design standards that are not specific to any one product. The product's own
patterns and boundaries stay in the product repository; these are the ones that hold anywhere. See
[`standards/README.md`](standards/README.md) for how a product resolves them and which tier wins.

## Starting a project

Make a folder under `projects/`. Put whatever you already have into it — a markdown file, a PRD, a
few screenshots, some links, a paragraph. There is no required format and no minimum.

`projects/_template.md` exists in case a blank page is annoying. Ignore it otherwise. Three
sentences is a legitimate way to start a project, and "here's the Figma, make it work on mobile" is
a legitimate way to start a project.

Everything the agent writes for that project lands in the same folder — the brief it wrote from your
context, what it read before building, the review, and the decisions you confirmed. One project, one
place, so picking up someone else's work means reading one folder.

A **quick prototype** is kept in its project's folder too, under `quick/`: one React file and the page
built from it, so anyone can open it without the product. Large files those pages share are kept once in
`projects/_shared/`, which is not a project.

## What is not here

Code that runs inside the product. A codebase feature lives in the product repository it was built
against, on its own branch, where it can actually run.
