# Setting a product up

Before DSNR can work in a product, the product needs its DSNR files: the workspace file and a little guidance for agents.
You do not write them yourself. An agent reads the product and writes them, and you review them before anything is
committed.

## What you do

1. Open the product in VS Code, with the design repository's clone beside it (`flock-designer`, or your company's
   copy). The design repository's own packages must be installed once: run `npm ci` in its `workspace` folder.
2. Sign in to GitHub at the top of the DSNR panel. Until you do, the panel says to sign in first.
3. Press **Set up**. The panel shows it when the open repository has no workspace file. DSNR then asks which design
   repository the product belongs to, starting at Flock's clone when it finds one: pick your company's, if it is not
   Flock's. Every project, comment and page of the product will go there.
4. Choose your agent, if DSNR has not asked before, and let it work. It opens in its own window, with the task
   typed in. In Claude Code and Copilot, press Enter there to start it.
5. Press **Review** when the agent is done. The panel shows it until the new files are committed. It lists what still has
   to be fixed, what the product does not have that DSNR would use, and every command the workspace file lets DSNR run.
   Read the commands carefully: they are what DSNR will run in the product.
6. Commit the files yourself, when you are happy with them. The **Review** message goes away once they are committed.

## What the agent writes

The agent follows one set of instructions, `skills/set-up-a-product.md`, which is the same for every company:

- `.dsnr/workspace.json`, the workspace file: the product's name, how its feature branches are named, the package its
  components come from, and the commands DSNR may run, each one a script the product already has. It never invents a
  script.
- `.dsnr/manifest.md`: what the product is, its stack, its conventions, where things are, how to run it, and what is
  off limits. It includes the product's accessibility target only if the product already states one. Otherwise it leaves
  the target as a question for your team: the level the product must meet is the team's decision, not an agent's.
- `.dsnr/standards/non-negotiables.md`: what each of DSNR's hard rules means in this product: how it fetches data,
  where its fake data lives, what a prototype must never import.
- `.dsnr/README.md`: a list of the files in `.dsnr/` and what each is for.
- The agent files, which send every agent to DSNR's guidance (see [The agent files](agent-files.md)).

Anything the agent could not tell from the code is marked as a question for the team, never guessed.

## How DSNR checks the work

The agent checks its own work with `dsnr check-setup`, and repeats until nothing is left to fix. The panel's **Review**
shows the same check, so you see what the agent saw. It has three parts:

- **To fix**: a workspace file DSNR cannot read; a command that runs a script the product does not have, or runs
  something other than `npm`, `npx` or `node`; a missing guidance file; agent files that are not as DSNR writes them.
- **What it does not have, which DSNR would use**: for example no command to run the app on fake data, which
  codebase work needs, or no handoff gate. These are not failures. Each is a decision for your team, said with what it is
  for.
- **The commands it lets DSNR run**: the full list, so you know exactly what will run.

## Why it works this way

- *The agent reads, DSNR checks, you decide.* Working out which of a product's scripts does what is a judgment call an
  agent is good at. A fixed checklist is better at checking it. You decide what is committed.
- *Nothing happens without you.* DSNR never commits the files, never installs packages in the product, and never runs
  anything in it during setup.
- *One check, everywhere.* What the agent checks, what the panel shows and what `dsnr check-setup` prints are the same
  check, so they can never disagree.

## Doing it by hand

You can write the files yourself, in the same order:

1. Clone the design repository and the design system beside the product, and run `npm ci` in the design repository's
   `workspace` folder.
2. Write `.dsnr/workspace.json`, `.dsnr/manifest.md`, `.dsnr/standards/non-negotiables.md` and `.dsnr/README.md`.
   Follow `skills/set-up-a-product.md`; it has an example workspace file. Coke's `.dsnr/` is a complete example of a
   product that has grown its guidance over time.
3. Run `dsnr agent-files` in the product to write the agent files.
4. Run `dsnr check-setup` until it has nothing to fix.
5. Commit.

## If something goes wrong

- *The panel does not offer* **Set up**. The open folder already has a workspace file, or it is not a git repository, or it
  is a design repository.
- *The design repository you picked is refused.* DSNR recognises a design repository by its agent guide,
  `agents/ui-guide.md`, and needs its GitHub address to know which one it is. Pick the clone itself, not a folder above it.
- *The setup says to run `npm ci` first.* The `dsnr` command the agent runs is built from the design repository's own
  `workspace` folder, which needs its packages installed once.
- *A branch pattern is refused.* DSNR fills in only `<project-id>` in a branch name. A part that changes per branch, like
  a ticket number, cannot be in the pattern.
