# Which instructions each kind of work follows

**Shared by every product.** One row per kind of work. Each starts from one entry file, and every entry
file sends the agent to the same three layers of guidance underneath it, in the same order. Nothing is
read because it happens to be nearby, and nothing about one kind of work leaks into another's file.

| Work | Started by | Where the agent works | Entry file | Produces |
|---|---|---|---|---|
| **Quick prototype** | New → Quick prototype | The app's own folder. The product's code, guidance and installed packages are **read-only** | `skills/build-quick-prototype.md` (this repo) | One React file built from the real components, `projects/<id>/quick/qN.tsx`, and its page, `qN.html` |
| **Codebase feature** | New → Codebase feature | The product repository, on `feature/<id>` | The product's own agent instructions | Real code on the branch |
| **Move a quick prototype into the code** | Build in the codebase, on a quick prototype | The product repository, on `feature/<id>` | `skills/move-to-code.md` (this repo), then the product's agent instructions | `projects/<id>/audit-qN.md` first (from the prototype's `@standin`, `@mock` and `@remove` marks), then real code |
| **Address a comment** | Address, on one comment | The iteration's branch in the product repository | `skills/address-comments.md` (this repo) | One commit for that comment |
| **Record where the work is** | Part of any codebase work | The design repository's records | `skills/record-the-route.md` (this repo) | A `route` on the iteration's record |
| **Prototype on a branch** (older) | No longer offered by New; existing ones still open | The product repository, on `fd/<id>/iN` | The product's own agent instructions | Code in the product's prototype folder |

## The three layers, always in this order

1. **The product's guidance**: its Flock Designer folder (`.flkd/` in Coke). How the app is put together,
   its patterns, its rules. Product-specific, so it lives in the product repository, never here.
2. **The design system's guidance**: its tokens and components, in the version the product installs.
3. **Shared standards**: `standards/` in this repository. What holds for every product.

A layer only ever adds to the one below it, and a product's rule wins over a shared one for that
product. Anything true of one product goes in that product's guidance; anything true of every product
goes here. If a file in this folder starts naming one product's components, it is in the wrong place.
