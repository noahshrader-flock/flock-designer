# Set up a product for DSNR

**Shared by every product.** DSNR hands you this when a repository open in its window has no `.dsnr/workspace.json`.
Your task gives the product's folder, its design repository, and the exact `dsnr` command to run. Work only in the
product's folder. Write the files below and nothing else: never commit, never install packages, never change the
product's code, scripts or `package.json`.

## 1. Read before writing

Read the product's `package.json` (every one, in a monorepo), its lockfile, its `README.md`, its `AGENTS.md` and
`CLAUDE.md` if it has them, and its own docs. Note what its scripts do, which package its components come from, and
how its app runs.

## 2. Write `.dsnr/workspace.json`

```json
{
	"version": 1,
	"product": "Acme Admin",
	"contextDir": ".dsnr",
	"branchPattern": { "codebase": "feature/<prototype-id>" },
	"designSystem": { "package": "@acme/ui" },
	"commands": [
		{ "id": "install", "label": "Install packages", "argv": ["npm", "ci"] },
		{ "id": "typecheck", "label": "Typecheck", "argv": ["npx", "tsc", "--noEmit"] },
		{ "id": "lint", "label": "Lint", "argv": ["npm", "run", "lint"] }
	]
}
```

- **`product`**: the product's name as its team says it.
- **`branchPattern.codebase`**: how this team names a feature branch, from its recent branches or its docs, with
  `<prototype-id>` where the name goes, once. DSNR fills in nothing else, so a part that changes per branch (a ticket
  number) is left out: `feature/<prototype-id>` when nothing says.
- **`designSystem.package`**: the package its components come from (the one its views import buttons and inputs from).
  When the repository is that package itself, or holds it, give that package's name: DSNR finds it by name. Add
  `"folder"` only when two packages share the name.
- **`designRepository`**: only when the task names one other than Flock's, as `"owner/repo"`.
- **`commands`**: only what its scripts already do, each as the words split (`["npm", "run", "lint"]`), run through
  `npm`, `npx` or `node`. Use these ids where the product has the thing: `install`, `typecheck`, `lint`, `test`,
  `design-mode` (the real app on mock data, with `"servesPreviewOn"` its port), `check-iteration` (a fast check),
  `handoff` (its gate for engineering, taking `<prototype-id>`), `a11y`. **Leave out what it does not have**: never invent
  a script, and never point at one `package.json` does not have.

## 3. Write what every agent reads first

In `.dsnr/`, from what you read, plainly, saying where each thing came from:

- **`manifest.md`**: what the product is, its stack, its conventions, where things are, how to run it, and what is
  off limits. Add the section `## Accessibility conformance target` with a `| **Target** | … |` row **only when the
  product states one**; otherwise leave the section's row as a question for the team. It is their decision.
- **`standards/non-negotiables.md`**: what each of the shared hard rules (the design repository's
  `standards/non-negotiables.md`) means here: its data plumbing, its mock layer, what a prototype must never import.
- **`README.md`**: each file in `.dsnr/` and what it is for.

Write what you found; mark what you could not tell as a question. Never guess at a rule.

## 4. Write the agent files, then check

1. Run the `dsnr agent-files` command your task gives. It writes the files that send every agent to DSNR's guidance,
   and leaves a file that is the product's own (a `CLAUDE.md` with its own rules), saying why: leave it, and say so.
2. Run the `dsnr check-setup` command your task gives. Fix everything under **To fix**, then run it again, until it
   has nothing to fix. What it says the product **does not have** is for the team: do not create it.

## 5. Say what you did

List each file you wrote, the commands you declared and the script each runs, what `check-setup` says the product does
not have, and every question you left for the team. Say that nothing was committed: the person reviews the files, and
commits them.
