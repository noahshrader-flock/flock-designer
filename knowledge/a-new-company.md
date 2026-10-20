# A new company

DSNR is not tied to Flock. Any company can use it, with its own design repository and its own products. This page is how to
start one.

## What you do

1. *Copy the design repository.* Make a new repository on your company's GitHub from a copy of `flock-designer`. It keeps
   DSNR itself (`workspace/`), the shared guidance (`agents/`, `skills/`, `standards/`) and these pages (`knowledge/`).
2. *Clear out what is Flock's* (below).
3. *Clone it* beside your company's products, and run `npm ci` in its `workspace` folder.
4. *Set up each product* with **Set up**, as [Setting a product up](setting-up.md) describes. When DSNR asks which
   design repository it belongs to, pick your new clone, even if Flock's is offered first. The product's workspace file then names it (as `"designRepository"`), so the
   product's projects, comments and pages go to your company's repository, never Flock's.

## What is Flock's, to clear

- *The projects*: everything in `projects/` except `projects/_template.md`, including `projects/_shared/`, which holds the
  fonts and images Flock's pages share. These are Flock's work.
- *Flock's name in the shared guidance.* The shared files are almost entirely general. Where they say "Flock", it should
  say your company (in `agents/ui-guide.md`, `agents/dsnr.md`, `agents/product-parity-reviewer.md`,
  `agents/request-guide.md`, `skills/move-to-code.md`, `standards/README.md` and the five files in
  `standards/universal/`), and where they give Coke as an example, use your own product. This is renaming, not
  rewriting.
- *The published pages' sign-in.* People sign in to comment on a published page through a GitHub sign-in app that belongs
  to the company. Flock's is built in; another company sets up its own and gives DSNR its details
  (`DSNR_PAGES_CLIENT_ID` and `DSNR_PAGES_EXCHANGE`).
- *Flock's own Storybook address*, which DSNR knows for Flock's design system. Yours is asked for once, the first time you
  open a component in Storybook.

Everything else is shared, and works as it is.

## What stays the same everywhere

The guidance any good product needs: how to build UI from a real design system, the hard rules, accessibility, layout,
copy and states. Your products add their own conventions in their own `.dsnr/` folders, and those win over the shared ones
for that product (see [The agent files](agent-files.md)).

## Hosts

Today DSNR works with GitHub: comments, published pages and pull requests are GitHub's. A design repository on GitLab is
planned and not built yet.

## Why it works this way

- *A copy, not a product.* Each company owns its design repository outright, edits its guidance freely, and is never
  surprised by a change from somewhere else.
- *Nothing global.* Each product names its own design repository, so two companies on one computer never mix: each
  window reads and writes only its own.
