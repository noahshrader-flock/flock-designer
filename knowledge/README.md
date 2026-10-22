# How DSNR works

These pages explain DSNR from the start: what each part is, how the work flows, and why it is built the way it is. Read
the one you need. Each starts with what to do, then explains what is happening underneath.

A note on the words: anything in bold type is something you will see on screen, a button, a menu item or a message, written
exactly as DSNR writes it. Anything in `code` is a file, a folder or a command.

## Start here

- [How it fits together](how-it-fits-together.md): the design repository, the product, the design system, the panel, and
  the agents that do the building. Read this first.

## Getting set up

- [The shapes a product can take](product-shapes.md): a product in its own repository, a monorepo, and a repository that is
  its own design system, and how DSNR finds what it needs in each.
- [Setting a product up](setting-up.md): the **Set up** button, what the agent writes, and how to review it. Also how to
  do it by hand.
- [A new company](a-new-company.md): starting DSNR somewhere other than Flock, and what to clear out.

## The work

- [A prototype, start to finish](prototype.md): starting one, versions, review and comments, addressing them,
  publishing, and keeping it current.
- [Which way to work](which-way-to-work.md): a prototype, or straight in the code; and sharing what you have been
  building with your agent to get feedback.
- [Working in the codebase](working-in-the-codebase.md): turning a prototype into real code in the product, and running it.
- [Committing](committing.md): what DSNR saves for you, what you commit yourself, and where each lands.
- [The handoff](the-handoff.md): getting codebase work ready for engineering.
- [Staying up to date, and conflicts](staying-up-to-date.md): what happens when the product moves on under your work.
- [The design system](the-design-system.md): the Design System tab, trying a change, saving and proposing it, and
  choosing which design system a product uses.

## Underneath

- [The agent files](agent-files.md): the guidance agents read, where it lives, which wins, and what a product's own
  files should contain.
- [The dsnr command](the-dsnr-command.md): the same work from a terminal, for agents and for you.
- [From CHEQ's .CQD](from-cqd.md): how Paradome's older agent system maps onto DSNR's.
- [Gap logs](gap-logs.md): how a product records what DSNR got wrong, and what it took to get running.
