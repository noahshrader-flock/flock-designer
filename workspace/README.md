# Flock Designer Workspace

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

## What it can and cannot do

| It can | It cannot |
|---|---|
| Open a repository the designer picks | Reach any path outside that repository |
| Run commands the repository declares | Run anything else, or a shell of any kind |
| Create and switch iteration branches | Rewrite, discard, or force anything in git |
| Invoke a locally installed agent | Hold model credentials, or carry its own prompts |
| Read and write project records | Become the only place those records exist |

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

## Where things live

Project records go to **`flock-designer/projects/<project-id>/`**, not into the product checkout.
The plan settled this and gave the reason: a record on the prototype branch means picking up
someone's work requires knowing which branch to check out, and it needs a standing rule to keep
per-project state off `develop`. It also dirties the working tree, which then blocks the next
iteration on its own bookkeeping — which is how the tests here caught it.

The code stays on its branch in the product repository, where it can actually run.

## Security posture

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and a CSP with no remote origins.
- The renderer sees one object: the named operations in `src/shared/contract.ts`. There is no generic
  `invoke(channel, …)`, so a capability without a method is a capability it does not have.
- Every root is checked against the repositories this window actually opened. The renderer cannot
  name a directory and have the main process act on it.
- Every path is resolved through `resolveInside`, which follows symlinks — the check string
  comparison alone gets wrong.
- Links open in the real browser; the app window itself cannot be navigated.

## Its own FUI version is not the product's

This app is built with its own pinned FUI. A context receipt shows the version the **opened
repository** resolves, read from that repository's lockfile. They are unrelated facts, and showing
one where the other belongs would make the receipt confidently wrong.

## A note on npm

`.npmrc` here points public packages at npmjs.org and `@flocksafety` at GitHub Packages. The
machine-level `~/.npmrc` routes everything through Flock's CodeArtifact mirror, whose token expires
and needs a browser login to refresh. Coke needs that mirror; this app does not.
