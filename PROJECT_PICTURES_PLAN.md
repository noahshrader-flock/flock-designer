# Project pictures plan: a picture of each prototype on its Project card

**Written 2026-10-10.** The plan for filling the empty picture on the Projects grid's cards (`ProjectCard` already has the
slot: a `PictureArea` at the 2:1 shape components use) with a picture of the project's newest prototype.

This is the detail behind one candidate in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). **This file holds only what is
still to do or decide.** When a phase is built, its result moves to [dsnr.md](dsnr.md) and it leaves this file.

## The answer in one paragraph

**It is a small lift, because nearly all of it already exists, and it has been tried on real prototypes.** The app already
draws a saved prototype in a hidden window (the accessibility check, T7), already shows a picture with a skeleton and a
fade (`PictureArea`), already keeps a derived pointer on an iteration's record that merges between machines
(`previewUrl`), and already writes files to the design repository two ways. The new parts are a binary write, one field on
the record, one hidden-window capture, one idempotent `ensureCover`, one IPC channel and a line in `ProjectCard`. About
3 days with tests; no new store, listing or heuristic about who draws or when.

## What "at build time" has to mean (the one thing the earlier idea got wrong)

A prototype is saved by `dsnr save-prototype`, which runs **from the command line, with no Electron**, so it cannot take a
screenshot (`capturePage` is Electron's). So the picture cannot be taken when the page is saved. It is taken **by the app,
the first time it needs one**: when a card asks for the project's picture and the newest prototype has none that is
current. Nobody has to remember a step (no onus on the person), and a prototype saved from Claude Code with the app
closed gets its picture the next time the app is opened.

## What already exists, and what each piece is reused for

| Existing | Where | Reused as |
|---|---|---|
| Hidden, sandboxed window with a timeout helper | `sandboxedPage.ts`: `hiddenWindow`, `within` | the window the page is drawn in, exactly as `checkInWindow` does |
| Load a saved page, wait for fonts and a settle, read it | `accessibilityCheck.ts`: `checkInWindow`, `SETTLE_MS` | the same load and settle, then `capturePage` instead of axe |
| Light or dark by `prefers-color-scheme` on one window | `storyMeasure.ts`: `Emulation.setEmulatedMedia` | draw in light, always (decision 3) |
| Serve a saved page on the local server, with its shared fonts | `ipc.ts`: `servePrototype`, `prototypePage` | the address the window loads; this machine's build first, else the saved page |
| "Kept beside the page, made again only when its key changes, written whole" | `accessibilityOf`, `keyOf` | the keeper: same shape, key is the page's hash |
| One run per key at a time | `ipc.ts`: `once(key, fn)` | so two cards asking for one project draw it once |
| Picture fits a shape, jpeg, resized | `storyMeasure.ts`: `pictureOf`; `picture.ts`: `toPicture` | resize and encode; the sizes differ, the calls do not |
| A record that points at a derived thing, set after the fact, merged between machines | `Iteration.previewUrl`, `mergeIterationRecords` (mine wins, never blanks theirs) | the iteration's record gets one more field, `cover`; no new store, index or listing |
| A file written by the clone or by GitHub's API (which already sends base64) | `cloneStore.write`, `DesignRepo.writeFile` | both accept bytes as well as text: a few lines each, so the picture is a real `.jpg` |
| A subfolder of a project that is not a "record" | `comment-pictures/` | `covers/`, so a picture never shows in the Share menu's list of documents (`project.records` lists files only) |
| The card's picture box, skeleton and fade | `PictureArea` | unchanged: it already waits, fades in, and falls back to the soft color |
| Writers: the clone when there is one, else GitHub, never both | `recordStore()`, `cloneStore` | the cover is written the way every other record is |

## Decisions

Noah's, 2026-10-10: **every version stores an image, and the latest is what the project's card shows; light only, for
components and projects alike; and it is built the way a production app would, with little overhead.** The rest follow
from that.

**The shape of it, in one line:** a picture is a file, the iteration's record says which one, and one idempotent function
makes sure each prototype has a current one. That is how a production app keeps a thumbnail (a stored blob, a record that
points at it, made by one reconcile step), and it needs no listing, no name parsing and no heuristic about who or when.

1. **Every prototype keeps its picture; the card shows the newest.** "Version" is each saved prototype (V1 · I1, V1 · I2,
   V2 · I1…), so history is kept. The card shows the newest prototype's picture, else the newest earlier one that has
   one.
2. **The picture is a binary file; the record points at it.** `projects/<id>/covers/<name>-<hash>.jpg`, written in the
   design repository, and one new field on that iteration's record in `iterations.json`: `cover`, the hash of the page the
   picture was drawn from. The file's path is derived (`<name>-<hash>`), so nothing is parsed out of a name. The record
   is the single source of truth: **a cover is current exactly when `cover` equals the hash of the page**
   (`prototypeVersionOf`, already there). The hash is in the path, so a file never changes under its address and a viewer
   may keep it by path for good. It follows the way `previewUrl` is already kept, and `mergeIterationRecords` already
   keeps it across machines. Files sit in a `covers/` subfolder so they never appear in the Share menu's documents.
3. **Light only.** The hidden window follows the machine's theme (measured: the real prototypes drew **dark** with no
   override), so light is forced on the window the way the component pass does it (`Emulation.setEmulatedMedia`).
4. **Shape and size:** a 1440 × 720 window (the card's 2:1), the top of the page, resized to 960 across, encoded within
   a 48 KB budget.
5. **One reconcile step, `ensureCover(projectId, iteration)`:** if the iteration's page was **built on this machine** (its
   file is in the app's own prototype folder, the same test `openPrototype` uses to decide to save) and the record's
   `cover` is not the page's hash, draw it, write the file, then set the record's field (**file first, record
   second, so a record never points at a file that is not there**). Idempotent: running it twice does nothing the second
   time. It runs when the Projects list opens (leaving a prototype reopens it, so a save is covered), for the prototypes
   built here that need one, **one window at a time and after the list has drawn**, so it never competes with the screen.
   Nothing is asked of anyone; a prototype saved from Claude Code gets its picture the next time the app opens.
6. **Codebase work has no page,** so a project with only codebase work keeps its empty cover and its link icon.
7. **Read lazily, per visible card:** the card's iteration records already say which picture to show (no directory
   listing, no extra call to find it); one channel, `projectCover(projectId, name, cover)`, returns that file as a data
   URL or null, kept by path.

## Phases

### C1: built 2026-10-11

Draw, keep and show: built and verified; what it is and the evidence are in [dsnr.md](dsnr.md)'s change log (2026-10-11).
What is left is C2 and the known gaps under the risks.

### C2: later, only if wanted

- The same picture as a thumbnail beside each iteration (the list view's thumbnail pattern already exists).
- A prototype that declares when it is ready (a meta tag, as it declares its states), if the settle rule ever fails on a
  real page.

## Directions considered, and why this one

- **Draw on every machine and keep it only as a local cache** (how component pictures work). Simplest, nothing committed.
  Rejected: a viewer would fetch each project's 2 MB page just to draw a card (about 20 MB to open a list of ten) and
  draw it on every machine. Components differ: any machine can build them from one library commit, so a local cache is
  right there. A prototype is an authored thing that only its maker's machine has built.
- **Take the picture in CI when a page is published to Pages.** The most "production" answer, with no dependence on any
  person's app. Rejected for now: it needs a headless browser in the workflow, and the Pages site waits on the org
  approvals (M0). The record's `cover` field is the same pointer such a step would fill, so this can replace the app's
  drawing later without touching the card, the record or the channel.
- **Snapshot whatever the person is looking at when they open a prototype.** Free, but it depends on what happened to be
  on screen, in their theme, at their window size: not reliable. Rejected.
- **A file name that carries the key, and no record field.** Works, but meaning hidden in a name has to be parsed back
  and needs a directory listing to find. The record already exists, merges, and is already read for every card.
  Rejected.

## The risks, each removed by design

### 1. A page that never looks ready: a measured rule, and a wrong picture is never kept

Measured on 2026-10-10, on the two real prototypes (`alert-history` v1-i1 and v2-i1), in a hidden window: loaded in 170 to
530 ms, **the DOM changed 0 to 1 times after load and was quiet within 0.5 s**. A saved prototype is one self-contained
page on mock data with nothing to fetch. The rule:

- **Settled** = fonts ready, no running animation that ends, the DOM quiet for 500 ms, with a **cap of 8 s**.
- **A picture that is not good is not kept:** a blank capture (as `composeOnWhite` already tells for components), or one
  taken because the cap ran out, is dropped. The record is left alone, so the card keeps its empty cover or the older
  picture. **It is tried again at most once per app session per page**, held in memory: no persisted counter, no state to
  go stale. Tests: a page that mutates forever (dropped), a blank page (dropped), a page that settles (kept).
- **Known, not ours to fix:** these pages show the data grid's "MUI X Missing license key" watermark. It is in the page,
  so it is in the picture.

### 2. A race between machines: one writer, and no identity needed to say who

A prototype is built on one machine, and its name is never reused (records are one writer per machine). `ensureCover`
draws only for a page **built on this machine**. A colleague's page that this machine merely fetched or pulled is not in
the app's own prototype folder, so it is never drawn here. That is one writer per iteration with no dependence on being
signed in, which also means **signed-out and "only on this machine" work gets its picture** (a rule keyed on the
contributors list would have skipped it). Every other machine only reads. The file's path has the page's hash in it, so a
write is never over an existing file. Tests: built here draws; fetched or pulled does not; an existing file is left alone;
works signed out.

### 3. The repository growing: a budget, measured

Measured at 960 across: **40 to 50 KB** as JPEG at quality 80 (34 to 42 KB at 70; 20 to 26 KB at 720 across), stored as
the real file, not text. The draw is encoded **within 48 KB**, stepping 80 → 70 → 720 across at 70 → 640 at 60 until it
fits (the `toPicture` ladder, given its widths and budget as arguments), and not kept if nothing fits. Against a page of
**2.1 MB it is about 2 %**; a hundred prototypes is about 5 MB. Every iteration keeps its picture (decision 1), so this
grows with prototypes. A picture replaced because its page changed leaves the old file behind (deleting needs a new call
on the API path, and the cost is one small file); say so now, and add a delete only if it ever matters.

### 4. A private page seen by someone who should not: nothing to do

The picture is in the design repository beside the page it is of, so it is exactly as visible as the page is.

## Not in this plan

Pictures taken at build time from the command line (it has no Electron), a hosted screenshot service (the plan keeps
everything inside the company's GitHub), a picture for codebase work, and pictures per state of a prototype.
