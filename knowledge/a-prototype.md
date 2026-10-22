# A prototype, start to finish

A prototype is a working page of the product, built from its real components and filled with made-up data. It can be
clicked, it can be commented on, and it can be shared with a link. It is never part of the product's code: it lives in the
design repository, so making one changes nothing engineering owns.

## Start one

Ask your agent, in the product: "Create a prototype of a history of alerts, filterable by camera and by day." Write it
the way you would brief a colleague. A Figma link to one screen helps, and you can drag screenshots into the conversation.

The agent runs `dsnr new-prototype`, which starts the prototype with your words as its brief and gives the agent its task,
including which code it is modeled on. To put the prototype in a folder, use **Assign folder…** from its menu in the panel.

If the product's packages are not installed on your computer, the agent is told so, with what to run, before anything
is made.

## What happens while it builds

- DSNR starts the prototype, with your words as its brief, and your list shows it under its name as *Building…* while the agent works.
  Nothing of it is shared yet: it is recorded as *Version 1*, and reaches everyone, once its first page is saved. If it
  is never built, nothing is made for anyone else; delete it from its menu.
- The prototype is *modeled on* the branch the product is on: DSNR notes exactly which commit, fetching the latest of it
  first. The agent reads the product's code as it was at that moment, so the prototype matches it.
- The agent writes one React file and builds it into a page. It uses the product's own components and design system, and
  invents only the data.
- When the page is built, the agent saves it to the design repository, as its task says, and DSNR draws its picture for
  the prototype list and publishes it. You do not press anything.

## Review it

Press the prototype in the panel to open its newest version in a tab. It is always the newest as the prototype is when you
press, including a version an agent made in a terminal a moment ago. The bar along the top has:

- the version menu, to switch between versions;
- the states menu, when the prototype has more than one state (empty, loading, filtered…), to see each;
- **Theme**, to see it in **Light** and **Dark**;
- **Comment**, to leave comments.

The prototype's menu in the panel has **Copy link** and **Open published page**, to share it, and **Open locally**, to open
it in your browser from this computer.

To change its name, choose **Rename…** from the prototype's menu, type the new name, and press **Save**. Only the name
people see changes: its link, its comments and its folder in the design repository keep the name they were made with.

## Comments

Anyone who can see the design repository on GitHub can comment, in VS Code or on the published page.

- *To pin a comment* to something on the page, press **Comment**, click the thing, write, and press **Save**. Hold Shift
  to see what a click will attach to.
- *To comment on the whole page*, write in the box at the bottom and press **Send**.
- *Each comment's menu* has **Resolve** (and **Reopen**), and **Delete**. Only its author, or someone who can write to the
  design repository, can delete a comment.
- *A version's comments are one issue on GitHub*, open while any of them is: resolving or deleting the last open one closes
  it, and reopening one, or writing a new one, opens it again. The open issues are what still needs doing.

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

A different idea for the same prototype is a new prototype in it, with its own brief.

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

## An open review keeps up with the page

While a prototype is open for review in VS Code, a page saved for it (by you, by your agent, or arriving from a teammate)
appears there by itself, within a moment: the review reloads, and its scroll position starts again. If you are in the middle of
a comment it waits until you have saved or cancelled it, so nothing you typed is lost.

## Where it all lives

In the design repository, under `prototypes/` and the prototype's id:

- `brief.md`: what the prototype is, from the first request.
- `requests-v1.md`, `requests-v2.md`: what you asked for each version, in your words and in order, the first request and every
  change after it. Secrets, email addresses and phone numbers are taken out before anything is saved, here and in the brief
  and the record; a name or a customer's details look like any other words, so leave them out of a request.
- `work.json`: the record of every version, and what each was modeled on.
- `v1.tsx`, `v1.html`: each version's source and page.
- `covers/`: the pictures in the prototype list.

DSNR commits and pushes these to GitHub for you, whenever they change: see [Committing](committing.md).

## If something goes wrong

- *"Prototypes are built from the real design system, and … is not installed in …"* Run the product's install, as the
  message says, then ask again.
- *"No agent is signed in here."* Sign in to Claude Code, Codex or GitHub Copilot, then start again.
- *"The product is not on a branch."* Check out a branch in the product first.
- *"The prototype did not build."* The agent sees the error and fixes it. If it stopped, ask it to try again.
- *The records are not syncing.* See [Committing](committing.md): other changes of yours waiting to be pushed hold them
  back.
