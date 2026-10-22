# The dsnr command

Everything DSNR does with prototypes can also be done from a terminal, with the `dsnr` command. Agents use it when you ask
them for a prototype directly, outside the panel, and you can too.

## How to run it

It is run from inside a product's repository, with the design repository's clone beside it:

```
node ../flock-designer/workspace/bin/dsnr.mjs <command>
```

It builds itself from the design repository's own code each time, so it is always the same version as the extension. The
first time, install that code's packages: run `npm ci` in the design repository's `workspace` folder. Most commands take
`--product <folder>` to work on a product other than the one you are in.

## The commands

### Prototypes

- `dsnr new-prototype`: records the next version of a prototype (Version 1 of a new one), and prints the task for the agent.
  A new prototype needs `--title`; `--from` models it on another branch.
- `dsnr change-prototype`: a change to a version, in place, or in a new version with `--new-version`.
- `dsnr save-prototype`: builds the version's page and saves its page and source to the design repository. If the saved source
  was changed since this machine saved it (by someone else, or by an edit made there directly), it saves nothing and says so;
  `--replace` says replacing it is meant.

### Publishing

- `dsnr publish`: pushes the prototype's records, deploys the site, and prints the version's link and who can open it.
- `dsnr unpublish`: takes a version off the site. Its record and comments are kept.
- `dsnr build-site`: builds the published site on your computer, and with `--serve` shows it there.

### Accessibility

- `dsnr accessibility`: measures a prototype, or the product itself on made-up data, in a real browser, and records what it
  found with its evidence.
- `dsnr check-accessibility`: checks that record is complete, for a handoff.
- `dsnr read-returned`: reads what testers sent back, and logs each issue a machine missed in the product's gap log.

### Setup

- `dsnr agent-files`: writes the files that send every agent to DSNR's guidance. With `--check`, it changes nothing and
  says whether they are current.
- `dsnr check-setup`: says how far the product is set up, the same check the panel shows.

Publishing needs GitHub's own command line, `gh`, signed in (`gh auth login`).

## Why there is a command at all

A prototype is started by the agent working in the product, so the command is the way in: the panel shows and reviews
what it makes. Both use the same code, so a prototype started from the command is recorded, built and saved exactly as
the panel reads it, and appears there the next time it is open.
