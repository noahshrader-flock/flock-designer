# Which instructions each kind of work follows

**Shared by every product.** One row per kind of work. Each starts from the entry files listed, and every entry
file sends the agent to the same three layers of guidance underneath it, in the same order. Nothing is
read because it happens to be nearby, and nothing about one kind of work leaks into another's file.

| Work | Started by | Where the agent works | Entry file | Produces |
|---|---|---|---|---|
| **Prototype** | New → Prototype, or asking an agent for one | The app's own folder. The product's code, guidance and installed packages are **read-only** | `skills/build-prototype.md` (this repo); from an agent, `skills/start-prototype.md` first, which runs `dsnr` | One React file built from the real components, `projects/<id>/prototypes/<name>.tsx`, and its page, `<name>.html`, where the name is its version (`v2`) |
| **Move a prototype into the code** | Build in the codebase, on a prototype | The product repository, on `feature/<id>` | `skills/move-to-code.md` (this repo), then the product's agent instructions | `projects/<id>/audit-<name>.md` first (from the prototype's `@standin`, `@mock` and `@remove` marks), then real code |
| **Hand off** | Hand off, on codebase work | The product repository, on `feature/<id>` | `skills/handoff.md` (this repo), then the product's gate and reviewers | The gate passing, `projects/<id>/review.md`, fixes committed, and `HANDOFF.md` on the branch |
| **Address a comment** | Address, on one comment | Codebase work: its branch in the product repository. A prototype: the app's own folder, where it was built | `skills/address-comments.md` (this repo); on a prototype, `skills/build-prototype.md` too | Codebase work: one commit for that comment. A prototype: its page changed and saved, no commit, in the version commented on, or in a new version from it when the person chose that |
| **Record where the work is** | Part of any codebase work | The design repository's records | `skills/record-the-route.md` (this repo) | A `route` on the codebase work's record |
| **Set up a product** | Set up, in the panel, on a repository open with no `.dsnr/workspace.json` | The product repository, writing only its DSNR files | `skills/set-up-a-product.md` (this repo), with the paths and `dsnr` commands the task gives | `.dsnr/workspace.json`, `.dsnr/README.md`, `manifest.md` and `standards/non-negotiables.md`, and the agent files (`dsnr agent-files`), until `dsnr check-setup` has nothing to fix; nothing committed |

## The three layers, always in this order

1. **The product's guidance**: its DSNR folder (`.dsnr/` in Coke). How the app is put together,
   its patterns, its rules. Product-specific, so it lives in the product repository, never here.
2. **The design system's guidance**: its tokens and components, in the version the product installs.
3. **Shared standards**: `standards/` in this repository. What holds for every product, in the order
   `standards/README.md` gives. The app puts the accessibility rules and the design system's voice and tone in every
   task, so no entry file has to name them.

A layer only ever adds to the one below it, and a product's rule wins over a shared one for that
product. Anything true of one product goes in that product's guidance; anything true of every product
goes here. If a file in this folder starts naming one product's components, it is in the wrong place.
