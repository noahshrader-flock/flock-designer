# DSNR

A local coordination layer over real Flock product repositories. It opens a checkout, shows what was
grounded before anything is generated, creates and continues iteration branches, hands a task to the
agent you already have installed, and runs the preview commands the repository declares.

**It is not the source of truth for anything.** Standards, product patterns, prototype source and
design-system facts live in the repositories. Every artifact stays usable by someone who never
installs this app — that is the constraint the design is built around, not a nice-to-have.

```bash
npm ci
npm run check            # format, lint, typecheck, then every test
npm run extension:dev    # build the extension and open it in a development window
npm run extension:test   # the extension's tests, in a real VS Code
npm run extension:install  # package it and install it into your VS Code
```

**From the command line:** `node bin/dsnr.mjs` makes and changes a prototype from Claude Code in VS Code (`new-prototype`,
`change-prototype`, `save-prototype`), with the same code the extension runs. `skills/start-prototype.md` tells an agent how to
use it. `node bin/dsnr.mjs build-site --serve` builds the site prototypes are published as, and shows it on this machine;
`publish` puts an iteration on it and says who can open it, and `unpublish` takes one off. Run it with no command for
the full usage.

## Building a prototype
**Building on this machine** is part of Projects, not a separate mode. **New** opens one dialog with two
kinds, switched at the top, both starting from a repository and a branch in it:

- **Prototype**: one page built from the product's real components, with nothing run and no
  environment setup. It needs the repository with its packages installed here; the dialog says whether
  they are, and will not start without them. The agent writes one React file, the app bundles it against
  the product's installed packages into one page, and both are kept in the project's folder
  (`prototypes/v1-i1.tsx`, `prototypes/v1-i1.html`: the version and the iteration; older ones are `i1`). Large files the pages embed (the design system's fonts) are kept once,
  in `projects/_shared/`, and served beside every page. **Build in the codebase** (in the review menu) moves one into the code: it asks first, shows the branch it will create and what would stop it (uncommitted changes, an existing codebase branch, Claude Code not ready), and starts from the branch the prototype was modeled on.
- **Codebase work**: real work on the project's `feature/<project>` branch, which needs the full setup.

Each runs the agent, then shows the result with pins. The product repository is **suggested** on its own
— found in the usual places by its `.dsnr/workspace.json` — and you accept it once with a click; after that it
is remembered. Older prototype branches (`fd/<project>/iN`) appear from the repository with no record needed;
a `feature/<project>` branch appears only when a project already has a record for it, because that is also
how the whole product team names ticket branches. The design repository is expected beside the product one.
The agent runs unattended: it may edit and run the repository's own scripts and local git, and nothing
that pushes, switches branch or deletes.

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

A repository declares itself in `.dsnr/workspace.json`. Nothing about any product is compiled into
this app.

```json
{
  "version": 1,
  "product": "Coke (Flock Admin)",
  "contextDir": ".dsnr",
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
- **Discovery suggests; it never trusts.** A repository's own `.dsnr/workspace.json` is the list of
  commands the app may run in it, so finding that file on disk grants nothing: the repository is
  offered, and accepting it is what admits it. `useCheckout` will only accept a path discovery itself
  found, and a remembered choice is restored only if the person made one. `__tests__/ipc.integration.spec.ts`
  asserts this at the handler level — the gate was briefly bypassed while every service test stayed
  green, which is why those tests exist.
- A project id is validated before it reaches a command's argv **and** before it reaches the agent's
  prompt; the agent runs unattended with edit permission, so an unchecked id there is prompt
  injection rather than argv injection.
- Every path is resolved through `resolveInside`, which follows symlinks — the check string
  comparison alone gets wrong.
- Links open in the real browser.
- **A prototype's page cannot reach its review bar** (Review isolation, below). In VS Code it is served
  from another address than the bar and sandboxed; the bar's address serves nothing a repository wrote
  that could open as a page; and the review tab, the panel and the Design System tabs hear only VS Code. On the
  published site it is sandboxed with no origin of its own, so it cannot reach the bar or the token the bar keeps.

## DSNR, the VS Code extension

DSNR is moving into VS Code as an extension, which lives in `extension/` with its own manifest
(`extension/package.json`, which VS Code reads for its icon, views and commands). It runs the same core as the app
(`createCore`), with VS Code's shell: its dialogs and clipboard, the person's GitHub account through VS Code's own
sign-in, no native preview, and its files in the extension's own storage, never the app's settings folder.

There is nothing to clone or connect: it works on the folders open in VS Code (`findContext`). The product is the open
folder with `.dsnr/workspace.json`, which DSNR trusts as VS Code does; its design system is where the product names it,
else another open folder that holds one, else one the person locates; the design repository is beside the product, as
the app finds it. Its panel, in the activity bar, lists the projects (opening one opens its newest prototype for
review) and shows the design system it found. Sign in is at the far right of VS Code's own DSNR title bar, which shows
the username beside the mark once signed in. A prototype's review is its page on the site, built from the design
repository and served from this machine, in an editor tab.

With no product open, the panel says so and offers **Get started** (**DSNR: Get started**): VS Code's own Git: Clone,
which offers to open what it cloned; New prototype then offers the install.

**Dialogs and menus are in the panel**, in VS Code's own look, rather than boxes at the top of the window: a webview
cannot draw outside its side bar, so a dialog covers the panel, as Claude Code's popovers are in its own. Each project has
an ellipsis menu (on hover or focus) with Open for review, Open in browser (the same review page, served from this
machine, in your browser outside VS Code, where commenting is still VS Code's), Build in the codebase…, its codebase
work's items when it has some (below) and Assign folder…; the right-click items open the same dialogs. The account (the
title bar's account action: Sign out of DSNR) and the sync (the status bar's item) are dialogs in the panel too. The
quick pick at the top is kept for the command palette's lists of many: **Open a component…** and **Open a prototype for
review**.

**New prototype** (the **+** in its title bar, **DSNR: New prototype**, or the panel's button) says first, before
anything is asked, what stands in the way (no product open, Claude Code missing or signed out), then opens a dialog in
the panel for the name, what it should explore (as many lines as it takes) and its folder, then says if the product's
packages are not installed (with Install packages when it says how), and builds it from the branch the product is on,
with the app's own build: its progress is a notification with Stop, the agent's log is in View › Output ›
DSNR: Agent, and when it is saved its review opens. The command can also be given its answers
(`{ title, task, folder }`), as **DSNR: Open a prototype for review** can be given its review, so a keybinding or another
extension can run them; called that way, a failure is also returned to the caller. The `.vsix` carries esbuild, which
builds a prototype's page, for the machine it was packaged on.

**Commenting in a review:** the page's own review bar comments through DSNR rather than with a token of its own. The
page asks DSNR's review tab, and the tab asks the extension (`shared/reviewRelay.ts`): the core's comment calls, only on
that review's project's prototypes and only on comments the tab has been shown or made; signing in, which is VS Code's; and **Address**, on an open comment's menu, which runs the agent
as a build does (a notification with Stop, its log beside the editor) and then shows the changed page in the same tab.
The bar listens for DSNR only when it is served from this machine and framed, and takes only a VS Code webview that
says hello; on the published site it comments with GitHub itself (once sign-in is there). Each project's reviews share
one tab.

**Review isolation: how a review's page and its bar talk.** A review is three windows, one inside the other: DSNR's
review tab (VS Code's webview), the review bar (`src/viewer`, the site's `index.html` for that prototype), and the
prototype's own page in the bar's frame (`page.html`), which is a repository's code and is not trusted.

- **The bar asks the page, by message, and never reaches into it** (`shared/pageChannel.ts`). Every page the site builds
  loads the page agent first (`src/page/agent.ts`, built as `_viewer/page-agent.js`), which runs the same page code the
  app's preview runs (`src/page`). The bar (`framePage` in `src/viewer/browserAdapter.ts`) says hello with a new secret
  each time the frame loads; the agent answers only the window above it, only at the address that said hello, and every
  message back carries the secret: ready (with its route), an answer to a pick or to drawing the pins, the route moving,
  a pin clicked or moved. Each side reads what it is told through the same readers (`shared/pageReaders.ts`). A page
  with no agent (a site built before it) has no pins, and the bar says so after eight seconds.
- **In VS Code the page is on an address of its own.** This machine's server (`PrototypeServer`) answers on two ports.
  Its own (`origin`) serves only what DSNR wrote: a site's index pages, the bar among them, its scripts, styles, fonts
  and raster pictures. The pages' (`pagesOrigin`) serves everything that came from a repository: a site's `page.html`
  and its SVGs, a prototype given whole (the app's preview, covers, checks), and story previews. So the page is another
  origin than the bar: it cannot read or script it, and opening its own copy on the bar's address finds nothing there.
  Each port answers only to its own name, and every file says what it is (`nosniff`).
- **The bar frames the page sandboxed** there (`buildSite`'s `pagesAt`): scripts, its own origin (its cookies and
  storage, which a design system's code uses), forms, pop-ups and alerts, and never the window above.
- **The review tab passes on only the bar's messages, up, and VS Code's, down** (`reviewPage` in
  `extension/src/review.ts`): nothing the page or any frame it makes posts goes to the extension or reaches the bar as
  if VS Code had said it. The relay acts only on that review's project, and on comments the tab was shown or made. The
  panel and the Design System tabs likewise hear only VS Code (`extension/webview/host.ts`), not the stories they frame.
- **The published site frames the page beside its bar, with no origin of its own** (`SANDBOX_BESIDE`: sandboxed without
  `allow-same-origin`), since GitHub Pages has one address. The page cannot read or rewrite the bar, take the sandbox off,
  or read the bar's storage, where a signed-in person's token is kept; its messages come from the origin `null`, which the
  bar accepts only from its frame's own window and with its secret, and answers at `*`. The browser refuses such a page
  its storage and cookies, so the page agent installs stand-ins for `localStorage`, `sessionStorage` and `document.cookie`,
  in memory, before the prototype's own code runs (`src/page/standIns.ts`). Every real prototype rendered the same with them
  (2026-10-15), and a hostile page proves the rest in the real browser (`reviewIsolation.integration.spec.ts`).

`__tests__/reviewIsolation.integration.spec.ts` proves this in real Chrome, nested as VS Code nests it, with a hostile
page; `pageAgent.integration.spec.ts` proves the pins on both kinds of address.

**Projects, by product.** DSNR in VS Code is scoped to what is open, so the Projects tab focuses on the product open:
**This product** (the default) shows its projects, by folder, and **Everyone's** shows every project, by product, the open one
first and "No product" last. It is a focus, not a lock: every project can be opened and commented on from either, since who can
see what is the design repository's permission on GitHub. A project's products are worked out from its work (`productsOf`): a
prototype records the product it was made on as `basedOn.product`, the `owner/repo` its clone's `origin` names (the same on every
machine; `basedOn.repository` is still the clone's folder name, which this machine compares with the open folder), and codebase
work its `repository`. A project with none on record (made before products were recorded) is never hidden: it is in This
product, marked "No product" once any project has one. The rules are `shared/projectScope.ts`. **With no product open**, the
tab lists everyone's, by product, and a review opens with no checkout: that project alone is read through GitHub into DSNR's
storage (`copyProject`) and kept only while a review uses it. What changes a prototype's code (Build in the codebase, Address)
says to open the product it was made on (`needsProduct`).

**Pictures and the accessibility check:** with no hidden windows, a prototype's picture and its accessibility check are
drawn by the browser already on the machine (Chrome, Edge or Chromium, or `CHROME_BIN`), headless, through
`puppeteer-core`, which downloads no browser of its own (`chromeHeadless.ts`); a machine with none is told what to
install. The panel's rows show the pictures, made once the list is read, as the app makes them.

**The numbers keep up without reloading VS Code:** a comment made, moved, resolved or deleted in a review, or addressed,
reads the projects again at once, and so does coming back to VS Code after a minute away (for comments made in the app
or on GitHub); the list stays on screen while it is read, and the badge on each project changes when the new count is
there.

**Search:** a box at the left of the grid and list icons narrows the projects as you type, as the app's does (every word, in any case, in the name, id, folder or people); Escape clears it.

**Folders:** the panel lists the projects under a section for each folder, those in none last, as a grid of cards, which it
starts in, or a list of rows (the icons at the right above them, remembered with the tab). **Assign folder…**, from a
project's menu, its right-click menu or a review tab's menu, opens a dialog in the panel to put it in a folder, a new
one, or none, with the same folder choice New prototype has; it uses the projects the panel already has, so it opens at
once. The app's one setting, its theme, is VS Code's here; DSNR's one setting is where Claude Code opens what it is handed
(`dsnr.claudeCode.location`, below).

**Moving into the code (Phase 5):** a prototype's menu has **Build in the codebase…** (and a review tab's menu does,
for the prototype in front): a dialog says what it would do in the product open here (the branch, where it starts
from, a clean checkout), then hands the task to Claude Code in this window, which writes the audit and builds it.
Codebase work's menu has **Open the preview** (the branch's own dev server, at its recorded route, in your browser, with
Stop), **Open on GitHub** (its pull request, else its branch), **Comments…** (read only: comments on codebase work go on
its pull request, and there are no pins on it), **Hand off to engineering…** (the product's gate, both reviews, the
fixes and HANDOFF.md, as a notification with Stop and its log, then the verdict; nothing is pushed) and **Share for
review** (a draft pull request, with a preview, said step by step). A project only in the code opens on GitHub when
pressed. Build in the codebase checks its own work once before it reports: Claude Code asks the implementation reviewer
(a read-only subagent, where there are subagents) about the branch's changes, fixes what blocks, and checks once more;
product parity and the full gate stay at Handoff. VS Code is the editor here: work handed to Claude Code opens in this window's Claude Code, in its side panel by
default, or in an editor tab if you set `dsnr.claudeCode.location` to `editor`; it uses Claude Code's own commands for
this, and a Claude Code without them opens an editor tab through its link.

**The Design System tab (Phase 6):** the design system found beside the product (the one it names, any open folder
with stories or tokens, or **Locate design system…**), read from its branch on GitHub as its clone has it. **Components**,
as a grid or a list with a search, under their groups, with pictures drawn by the browser here and what axe found;
pressed, a component opens in an editor tab with its stories live, what it is made from, what it sets itself and its
accessibility, and its menu has Storybook and Source. **Tokens**, by primitive: colors as the app has them, **Semantic**
first (a row for each role, a column for Light and Dark, each swatch its own control) and **Palette** a press away (each
step with its value, and a button that opens its own file at its line). A token's control points a role at another step
of its tone, gives a color a picker and a hex, or a length a slider, and says the contrast it leaves and what else it
moves; the change is tried in every component tab open and in **Primitives** (the design system drawn whole, from the
tab's menu, or **DSNR: Open Primitives**), then **Save to a branch**, **Propose** (a draft pull request) and **Start
over**. **Voice and Tone** (the menu, or **DSNR: Open Voice and Tone**) is a Markdown document in the editor: ⌘S saves it
to DSNR's branch; a save refused because the file changed on GitHub meanwhile offers Compare, Keep mine and Use theirs;
Propose and Start over are in its title bar.

**Sync and share:** whether the person's work is synced is in VS Code's status bar (Synced, Syncing, Not synced);
pressing it opens a dialog in the panel with what is held back and why, and Sync now. A review tab's title bar opens its page on the published site,
or copies its link; when it is not there yet, it says why and offers Publish.

Like the app, it publishes the person's work branches and records when the project list is read and when VS Code is
focused, so it pushes with their own git credentials.

It is drawn in VS Code's own design language, with none of the app's shadcn components or Tailwind and no colour of its
own (a test fails if one creeps in), so it follows every theme.

```bash
npm run extension:dev            # build it as you edit, in a VS Code window of its own
npm run extension:build          # build it once, into extension/dist/
npm run extension:test           # run it from source in VS Code, on a throwaway world (below)
npm run extension:test:packaged  # the same, installed from its package, as it runs for everyone else
npm run extension:package        # make extension/dsnr.vsix, for this machine's platform
npm run extension:install        # make it, and install it into your own VS Code
```

`extension:dev` opens a second VS Code window with DSNR loaded from here, on a throwaway profile in the
temporary folder, so your own VS Code, its settings and its extensions are never touched. Saving a file
rebuilds it: a change to the panel reloads it in place, and a change to the extension restarts it (both
are said in View › Output › DSNR). Quit that window with ⌘Q to stop the build: on a Mac, closing its last
window leaves it running.

### Installing DSNR in VS Code

1. From `workspace/`, run `npm run extension:install`. It builds DSNR, packages it as `extension/dsnr.vsix`, and installs
   it into your VS Code, replacing any DSNR already there. (Or run `npm run extension:package` and install the file from
   VS Code: Extensions › … › Install from VSIX….)
2. Reload VS Code's windows: **Developer: Reload Window** from the command palette.
3. Open a product's folder, one with `.dsnr/workspace.json`, with `flock-designer` checked out beside it. DSNR's icon is
   in the activity bar. If the product is not on this machine, the panel's **Get started** clones it.
4. Sign in at the far right of DSNR's title bar.

The package is for the platform it was made on (this is said when it is made, for example `darwin-arm64`), since it
carries esbuild's binary: make it on a Mac with Apple silicon for one, on an Intel Mac for another. It needs, on the
machine it runs on, Claude Code (to build), and Chrome, Edge or Chromium (for pictures and the accessibility check). To
install it somewhere VS Code is not in `/Applications`, set `CODE_CLI` to its `code` command. To remove it: Extensions ›
DSNR › Uninstall.

### Testing it

**Automatically.** `npm run extension:test` runs DSNR from its source in the VS Code installed here, and
`npm run extension:test:packaged` runs it installed from its package, in VS Code's production mode, which is what proves
it works outside development. Each takes about a minute and opens a VS Code window of its own, on a throwaway profile and
a throwaway world: a product and a design repository made for the run, with no remotes, so nothing is pushed, and a
stand-in for Claude Code, so no agent runs. It checks that DSNR starts and has every command its manifest declares, opens a saved
prototype's review, then starts a new prototype, builds it, checks it and pictures it with the real browser, saves it and
opens its review. When the design system the tests use is on this machine (Flock's FUI beside this repository, or
`FUI_ROOT`), a copy of it is in the world too, its fetches pointed at the clone here: it is read, FSButton and Primitives
open in their tabs, and its components are pictured. Neither is part of `npm run check`.

**By hand, on purpose (Phase 4.6 of the plan): the comments test.** It publishes to the real design repository and runs
Claude Code, so do it on a test project you can delete:

1. Install DSNR (above) and open a product. Sign in.
2. **New prototype** (the **+** in DSNR's title bar): name it something like "DSNR test", say what it explores, and choose
   no folder. Watch the notification and View › Output › DSNR: Agent. When it is built, its review opens.
3. In the review: **Sign in to comment** if it asks, then **Comment**, click something on the page, write a comment, and
   save it. Check the comment is on the design repository's GitHub issues, and in the app.
4. On the comment's menu: **Resolve**, then **Reopen**.
5. On the comment's menu: **Address**. When the agent has finished, the review shows the changed page, or says why
   nothing changed.
6. The review's title bar: **Open the published page** (once it is published) and **Copy the published page's link**.
   The status bar says whether your work is synced.
7. In the panel: the project's **⋯** menu (or right-click it) › **Assign folder…**, and check it moves under its folder.
8. When you are done: DSNR has no Delete, so remove the project's folder (`projects/dsnr-test`) from the design
   repository and push, and close its review issue on GitHub.

**By hand, on purpose (Phase 5): into the code, and Handoff.** It makes a branch in the product, runs Claude Code
there, and pushes a draft pull request at the end, so use the same test project, and a product checkout with no
uncommitted changes:

1. The test project's **⋯** menu › **Build in the codebase…**. Check the branch it names and where it starts from, then
   **Build in Claude Code**. Claude Code's panel in this window should open with the task typed in, on that branch:
   press Enter there, and let it write the audit, then the code, and commit.
2. When it has committed, the project's menu has codebase work: **Open the preview** opens the branch's own dev server
   in your browser (then **Stop it**), and **Open on GitHub** opens the branch.
3. **Hand off to engineering…** › **Start handoff**. Watch the notification and View › Output › DSNR: Agent while it
   runs the product's gate, both reviews and the fixes, and writes HANDOFF.md. It ends with the verdict.
4. When it is **Ready for engineering**, **Open a draft pull request** (or the menu's **Share for review**): it pushes the
   branch, opens a draft pull request and builds its preview, then offers both.
5. **Comments…** lists the comments on the codebase work, read only.
6. When you are done: close the draft pull request, delete the branch, and remove the project from the design
   repository, as above.

## A note on npm

`.npmrc` here points everything at npmjs.org. The machine-level `~/.npmrc` routes everything through
Flock's CodeArtifact mirror, whose token expires and needs a browser login to refresh. Coke needs
that mirror; this app does not.

It used to need a GitHub Packages token as well, for Flock's component library. That went when the
interface moved to shadcn/ui, so a fresh clone now installs with **no Flock credentials at all**.
