# A prototype, start to finish

A prototype is a working page of the product, built from its real components and filled with made-up data. It can be
clicked, it can be commented on, and it can be shared with a link. It is never part of the product's code: it lives in the
design repository, so making one changes nothing engineering owns.

## Start one

1. In the DSNR panel, press **New prototype** (or the + at the top of the panel).
2. Give it a name, and say what it should explore. Write it the way you would brief a colleague. A Figma link to one
   screen helps, and you can drag screenshots into the agent's conversation before you start it.
3. Pick a folder for it if you like, so related projects sit together.
4. Press **Create prototype**.

The agent opens with the task typed in. In Claude Code and Copilot, press Enter there to start it; Codex starts at once in
a terminal. DSNR tells you where it went, and which code it is modeled on.

If the product's packages are not installed on your computer, DSNR says so first and offers **Install packages**.

You can also start one by asking your agent in the product ("prototype a history of alerts"). It runs the same steps
through `dsnr new-prototype`.

## What happens while it builds

- DSNR records the project and its first version, *Version 1*, in the design repository, with your words as its brief.
- The prototype is *modeled on* the branch the product is on: DSNR notes exactly which commit, fetching the latest of it
  first. The agent reads the product's code as it was at that moment, so the prototype matches it.
- The agent writes one React file and builds it into a page. It uses the product's own components and design system, and
  invents only the data.
- When the page is built, DSNR saves it to the design repository by itself, draws its picture for the project list, and
  publishes it. You do not press anything.

## Review it

Press the project in the panel to open its newest prototype in a tab. It is always the newest as the project is when you
press, including a version an agent made in a terminal a moment ago. The bar along the top has:

- the version menu, to switch between versions;
- the states menu, when the prototype has more than one state (empty, loading, filtered…), to see each;
- **Theme**, to see it in **Light** and **Dark**;
- **Comment**, to leave comments.

The project's menu in the panel has **Copy link** and **Open published page**, to share it, and **Open locally**, to open
it in your browser from this computer.

## Comments

Anyone who can see the design repository on GitHub can comment, in VS Code or on the published page.

- *To pin a comment* to something on the page, press **Comment**, click the thing, write, and press **Save**. Hold Shift
  to see what a click will attach to.
- *To comment on the whole page*, write in the box at the bottom and press **Send**.
- *Each comment's menu* has **Resolve** (and **Reopen**), and **Delete**. Only its author, or someone who can write to the
  design repository, can delete a comment.

Comments are kept on GitHub, in the design repository, one conversation for each version. A comment remembers what it was
pinned to, the page's state and theme, and a picture of it, so it can be found again.

## Address a comment

To have the agent act on a comment, open its menu in VS Code and choose:

- **Address**, to change this version, or
- **Address in a new version**, to make the change in a new version and leave this one as it was.

If other people have commented on this version, **Address** asks first. Changing a version in place can move what their
pins point at, so you can choose between updating it and starting the next version from it.

The agent changes only the prototype, rebuilds it, and says what it did. DSNR saves and publishes the page again. You
resolve the comment once you have looked at the change: the agent never resolves comments.

## Versions

A prototype's versions are *Version 1*, *Version 2* and so on. A change is made in place unless you ask for a new version.
A new version starts as a copy of the one it came from, which stays exactly as it was, with its comments. A new version
starts with no comments. A change in place keeps its comments, pinned where they were made.

A different idea for the same project is a new prototype in it, with its own brief.

## Publishing

Every saved version is published to the design repository's site, on GitHub Pages, with its own link. DSNR does it for
you each time a version is saved. **Open published page** opens it and **Copy link** copies it.

Who can open the link depends on the design repository: if it is private, people signed in to GitHub who can see it; if it
is public, anyone with the link. DSNR says which when it publishes.

To take a version off the site, use `dsnr unpublish`. Its record and comments are kept.

## Keep it current

The product keeps moving after a prototype is made. When the branch it was modeled on has newer commits, the review bar
says how far behind it is, and **Refresh to latest** rebuilds it on the latest code: see
[Staying up to date](staying-up-to-date.md).

## Where it all lives

In the design repository, under `projects/` and the project's id:

- `brief.md`: what you asked for.
- `work.json`: the record of every version, and what each was modeled on.
- `prototypes/`: each version's source (`v1.tsx`) and page (`v1.html`).
- `covers/`: the pictures in the project list.

DSNR commits and pushes these to GitHub for you, whenever they change: see [Committing](committing.md).

## If something goes wrong

- *"A prototype is built from … and its packages are not installed on this machine yet."* Press **Install packages**, or run
  the product's install yourself.
- *"No agent is signed in here."* Sign in to Claude Code, Codex or GitHub Copilot, then start again.
- *"The product is not on a branch."* Check out a branch in the product first.
- *"The prototype did not build."* The agent sees the error and fixes it. If it stopped, ask it to try again.
- *The records are not syncing.* See [Committing](committing.md): other changes of yours waiting to be pushed hold them
  back.
