# Flock Designer

A local coordination layer over real Flock product repositories. It opens a checkout, shows what was
grounded before anything is generated, creates and continues iteration branches, hands a task to the
agent you already have installed, and runs the preview commands the repository declares.

**It is not the source of truth for anything.** Standards, product patterns, prototype source and
design-system facts live in the repositories. Every artifact stays usable by someone who never
installs this app — that is the constraint the design is built around, not a nice-to-have.

```bash
npm install
npm run dev       # the app, with the renderer hot-reloading
npm run build     # typecheck both projects, then bundle
npm test          # 88 tests
npm run smoke     # boot the real app and prove the window opens
```

**Without the app:** `node bin/flkd.mjs` makes a prototype from Claude Code in VS Code (`new-prototype`,
`save-prototype`), with the same code the app runs. `skills/build-prototype.md` tells an agent when to use it.

## What the window shows

A fixed top bar (there is no native title bar; on macOS the window buttons sit inside it): **Flock
Designer** on the left, the **Projects** tab beside it, and the account on the right, showing your GitHub
picture and name, with **Sign out** in its menu. Projects is the only section. Its toolbar carries
**Sync**, with where syncing stands beside it, and **New**. The window opens at the size and place it was
left in.

It reads projects, iterations and comments through GitHub's API, so it needs only a GitHub account with
read access to the design repository: no checkout, no git, no toolchain. **Comments are issue comments**
in the design repository, one issue per iteration, so GitHub does the storing and the notifying and
there is no server of ours anywhere.

**Building on this machine** is part of Projects, not a separate mode. **New** opens one dialog with two
kinds, switched at the top, both starting from a repository and a branch in it:

- **Prototype**: one page built from the product's real components, with nothing run and no
  environment setup. It needs the repository with its packages installed here; the dialog says whether
  they are, and will not start without them. The agent writes one React file, the app bundles it against
  the product's installed packages into one page, and both are kept in the project's folder
  (`prototypes/v1-i1.tsx`, `prototypes/v1-i1.html`: the version and the iteration; older ones are `i1`). Large files the pages embed (the design system's fonts) are kept once,
  in `projects/_shared/`, and served beside every page. **Build in the codebase** (in the review menu) moves one into the code: it asks first, shows the branch it will create and what would stop it (uncommitted changes, an existing codebase branch, Claude Code not ready), and starts from the branch the prototype was modelled on.
- **Codebase work**: real work on the project's `feature/<project>` branch, which needs the full setup.

Each runs the agent, then shows the result with pins. The product repository is **suggested** on its own
— found in the usual places by its `.flkd/workspace.json` — and you accept it once with a click; after that it
is remembered. Older prototype branches (`fd/<project>/iN`) appear from the repository with no record needed;
a `feature/<project>` branch appears only when a project already has a record for it, because that is also
how the whole product team names ticket branches. The design repository is expected beside the product one.
The agent runs unattended: it may edit and run the repository's own scripts and local git, and nothing
that pushes, switches branch or deletes. `npm run smoke:local` runs a real prototype from a real Coke
checkout through the app's own services (see the script for its two variables).

## Signing in

`Sign in with GitHub` uses the **device flow**: the app shows a code, you enter it on
github.com/login/device, and the app receives a token. A desktop app needs no client secret for this,
which is why nothing here runs a backend. The token is encrypted with the OS keychain
(`safeStorage`) and never reaches the renderer.

Tokens last 8 hours and are refreshed silently. A refresh that fails signs you out rather than
failing a call mysteriously.

The app is configured for a GitHub App that must have device flow enabled, be installed on the design
repository, and carry two repository permissions:

| Permission | Level | Why |
|---|---|---|
| **Contents** | Read and write | Reads project folders and iteration records. Writes only into `projects/`: an iteration's record, and, for a prototype made on a machine without the design repository cloned, its brief, page, source and the shared files it points at. With a clone, those go through git instead, one writer per machine. The app never writes product code through the API — authoring writes go through git in a real checkout |
| **Issues** | Read and write | Comments are issue comments |

Changing a permission later also requires approving the update on the installation; GitHub does not
apply it until then. Point a development build elsewhere with
`FLOCK_DESIGNER_CLIENT_ID`, `FLOCK_DESIGNER_REPO_OWNER` and `FLOCK_DESIGNER_REPO_NAME`.

## What it can and cannot do

| It can | It cannot |
|---|---|
| Open a repository the designer picks | Reach any path outside that repository |
| Read and write issue comments in the design repository | Reach any repository the GitHub App is not installed on |
| Run commands the repository declares | Run anything else, or a shell of any kind |
| Create and switch iteration branches | Rewrite, discard, or force anything in git |
| Invoke a locally installed agent | Hold model credentials, or carry its own prompts |
| Let a prototype's agent read the product's code, guidance and installed packages, and build its page from them | Let that agent change anything in the product repository, or run the product |
| Read and write project records | Become the only place those records exist |
| Show a prototype's preview in the window and place comments on elements | Let that preview call back into the app, or leave the preview's origin |
| Push the person's own work branches (`fd/*`, `feature/<project>`) and commit and push the design repository's `projects/` folder, by itself | Push anything else, force-push, publish a teammate's branch, or push other unpublished work along with the records |
| Push an iteration's branch and open a **draft** pull request, as the designer, through their own `git` and `gh` | Force-push, open a pull request that is ready for review, merge one, or see the designer's GitHub token |

## How a repository joins

A repository declares itself in `.flkd/workspace.json`. Nothing about any product is compiled into
this app.

```json
{
  "version": 1,
  "product": "Coke (Flock Admin)",
  "contextDir": ".flkd",
  "prototypeRoot": "src/prototypes",
  "branchPattern": { "prototype": "fd/<project-id>/i<n>", "codebase": "feature/<project-id>" },
  "commands": [
    { "id": "preview", "label": "Run the prototype", "argv": ["npm", "run", "start:prototype"], "servesPreviewOn": 3100 }
  ],
  "designSystem": { "package": "@flocksafety/flock-react-component-lib" }
}
```

`commands` is the allowlist, and it is the whole allowlist. `argv` is an already-split array, never a
shell string: there is no interpreter to hand a pipe or a semicolon to. A repository with no
descriptor can be opened, but nothing can be run in it.

### Sharing, and what it needs

*Share for review* (author mode only) pushes the iteration's branch to `origin`, opens a **draft** pull
request for it, waits for the repository's deploy workflow, and records the preview address on the
iteration, so a reviewer who opens the app sees it. A repository opts in with a `share` block:

```json
"share": {
  "url": "https://dev-coke-pr-<pr>.flocksafety.com",
  "workflow": "PR Deployment",
  "kinds": ["prototype"]
}
```

`url` is the address with the pull request number where `<pr>` is, `workflow` is the name of the CI
workflow whose success means the preview is up, and `kinds` is which work gets a preview. Without the
block a repository cannot be shared from here.

The designer needs the [GitHub CLI](https://cli.github.com) (`gh auth login` once). The app's own
GitHub sign-in is deliberately limited to the design repository, so it is not used for the product's
pull request, and the app never sees the designer's token. Only committed work is shared.

## Where things live

Project records go to **`flock-designer/projects/<project-id>/`**, not into the product checkout.
The plan settled this and gave the reason: a record on the prototype branch means picking up
someone's work requires knowing which branch to check out, and it needs a standing rule to keep
per-project state off `develop`. It also dirties the working tree, which then blocks the next
iteration on its own bookkeeping — which is how the tests here caught it.

Codebase work's code stays on its branch in the product repository, where it can actually run; a prototype's
source and page are in its project folder.

## Security posture

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and a CSP with no remote origins.
- The renderer sees one object: the named operations in `src/shared/contract.ts`. There is no generic
  `invoke(channel, …)`, so a capability without a method is a capability it does not have.
- Every root is checked against the repositories this window actually opened. The renderer cannot
  name a directory and have the main process act on it.
- **Discovery suggests; it never trusts.** A repository's own `.flkd/workspace.json` is the list of
  commands the app may run in it, so finding that file on disk grants nothing: the repository is
  offered, and accepting it is what admits it. `useCheckout` will only accept a path discovery itself
  found, and a remembered choice is restored only if the person made one. `__tests__/ipc.spec.ts`
  asserts this at the handler level — the gate was briefly bypassed while every service test stayed
  green, which is why those tests exist.
- A project id is validated before it reaches a command's argv **and** before it reaches the agent's
  prompt; the agent runs unattended with edit permission, so an unchecked id there is prompt
  injection rather than argv injection.
- Every path is resolved through `resolveInside`, which follows symlinks — the check string
  comparison alone gets wrong.
- Links open in the real browser; the app window itself cannot be navigated.
- **The preview is untrusted web content.** It runs in its own view with no preload script, no Node, a
  sandbox, and an in-memory session that is granted no permissions. The app reads it by running a
  script in the page and taking the return value; the page has no function to call in the other
  direction. Everything the page returns is validated before use. A page cannot navigate the view
  elsewhere (other origins open in the real browser), and only `https` or a local `http` address can
  be opened. `npm run smoke:page` checks all of this in real Electron, against a real click.
- A pin reports a click or a drop back through the page's console, tagged with a secret that is new for
  every preview. The app accepts a message only if it carries that secret and has exactly the shape of
  a click or a move; `smoke:page` checks that a forged message is ignored. The worst a page that learned
  the secret could do is select a pin, or move one of the viewer's own pins.
- The window may load images from `avatars.githubusercontent.com`, and nothing else from the network.

## The app's interface is not the product's design system

This app is built with **shadcn/ui, Radix and Tailwind**, on the stock Neutral theme. It is
deliberately not Flock's design system: the app is the tool, not the product, and the shell around a
prototype should not claim to be any company's. It also means the app can be built for another
product with nothing to re-skin.

What a *prototype* uses is a separate question with a different answer: whichever design system its
own product repository depends on. A context receipt shows the version the **opened repository**
resolves, read from that repository's lockfile. The two are unrelated facts, and showing one where
the other belongs would make the receipt confidently wrong.

The components under `src/renderer/ui/` are vendored source, not a dependency: shadcn/ui is copied in
and owned here, so it is edited directly rather than themed around. They are the official files,
pulled with the shadcn CLI in the **Nova** style (`"style": "radix-nova"` in `components.json`), which
is what ui.shadcn.com shows; the older `new-york` style looks different (shadowed cards, no card sizes).
Nova needs `tw-animate-css` and `shadcn/tailwind.css` imported in `index.css` for its open and close
animations. React 19, which is what shadcn targets. Additions are marked in place: `warning` and `success` variants on Alert, and
`success` on Badge, which the stock theme has no colour for. One change to stock behaviour: dialogs sit 10% from the
top instead of vertically centred, so one that changes height grows downward and does not jump. `DialogBody` is also ours: the part that scrolls, so the header and footer stay fixed. The dialog and sheet backdrops start below the top bar, so the bar is never dimmed or covered.

**When adding a component with `npx shadcn@latest add <name>`**, the CLI currently leaves the
registry's placeholder `import { cn } from "cn"` unrewritten and installs an unrelated npm package
called `cn`. After running it: `npm uninstall cn`, and change that import to `"@/lib/utils"`.

Styling is classes, not inline styles. The only two inline `style` props are runtime values Tailwind
cannot express: the sidebar width a person has dragged to, and the position of the comment box.

## If the window shows "Invalid hook call" while developing

Only under `npm run dev`, and never in a built app. Vite pre-bundles each package the first
time something imports it. If a change brings in a package the running window has not seen
before (a new icon is the usual one), Vite rebuilds its cache mid-session and the window ends
up holding modules from two generations of it, which React reports as two copies of itself:
`Invalid hook call`, then `Cannot read properties of null (reading 'useContext')`. There is only
one React installed (`npm ls react` shows it deduplicated), so nothing is actually duplicated.

**Reload the window (Cmd+R).** If it persists, stop and restart `npm run dev`. The packaged and
`npm start` builds bundle everything up front and are not affected.

## A note on npm

`.npmrc` here points everything at npmjs.org. The machine-level `~/.npmrc` routes everything through
Flock's CodeArtifact mirror, whose token expires and needs a browser login to refresh. Coke needs
that mirror; this app does not.

It used to need a GitHub Packages token as well, for Flock's component library. That went when the
interface moved to shadcn/ui, so a fresh clone now installs with **no Flock credentials at all**.
