# Design System plan: surface the component library in the app, and leave room to change it

**Written 2026-10-08. Every decision is made and every unknown I could measure was measured the same day. S1 to S3 are built
(2026-10-08), and P0 (**Connect the design system**, which replaced S4) the same evening. P1 and P2 (previews) were built the same day.
P3 (pictures in the list) was dropped.** Tokens (T1 to T8) were laid out on 2026-10-09, after reading how Claude Design does it; T1 and T2 were built the same day. The plan for filling the **Design System** tab (`renderer/DesignSystem.tsx`) with the components
from `flock-react-component-lib` (FUI), without copying Storybook and without building the editing yet.

This is the detail behind one candidate in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), which points here and does
not repeat it. **This file holds only what is still to do or decide.** What is built, and its evidence, goes to
[dsnr.md](dsnr.md) when a milestone is done, and leaves this file.

## What it is for

Noah, 2026-10-08: surface the components here, **do not duplicate Storybook**, and lay the framework so that, in a later
version, a component can be adjusted in this app and pushed as a pull request to the library. Version 1 therefore does
one thing: **show what is on the library's `develop` branch, and send you to Storybook and the source for the rest.**

**Then previews** (Noah, 2026-10-08, evening): "I would like to actually have the preview of the component, so you can
actually see the component," the way Claude Design shows one. Previews render **the library's own stories**, from
`develop`, in the app. Nothing is copied or redrawn: a story is the library's code, run as the library's Storybook runs
it.

## Requirements that do not move

1. **The library repository is the only source of truth.** The app holds an index of it, read when the tab opens. It
   never stores a copy of a component, a story, a prop table or a screenshot. A built preview is a cache in the app's
   own folder, keyed by the `develop` commit it was built from, and thrown away when that moves on. (Same rule as
   [step 1.7](dsnr.md#17--stop-copying-the-design-system-point-at-it-was-d1): point at it, do not copy it.)
2. **Storybook stays where controls, prop tables and docs live.** The app renders a component's stories as they are
   written, to show what it looks like (P1, P2), and links to Storybook for everything else. It does not embed or run
   Storybook, and it never writes a story of its own.
3. **Nothing is a step someone must remember.** The catalog is read from the library as it is, and brought up to date by
   the app itself; no generate step, no committed index file.
4. **A component has one stable identity,** its story file's path from the library's root
   (`src/components/FSButton/FSButton.stories.tsx`). A later edit feature, a branch, and a pull request all key on it,
   and its folder is the component's folder.
5. **Read-only.** Version 1 changes nothing in the library's files or branches, and nothing on GitHub.
6. **`develop` is the source of truth** (Noah, 2026-10-08). The catalog is `develop`'s, whatever branch the person's
   clone has checked out, and reading it never switches a branch or touches their files.

## What is known (read from both repositories on 2026-10-08)

| Fact | Where | What it means here |
|---|---|---|
| **The Design System tab is an empty `<div>`** | `renderer/App.tsx` | Nothing to replace; the section and its nav item exist |
| **Storybook lists 83 entries on FUI's `develop`: one per story file** (56 under `src/components`, 24 under `src/compositeComponents`, one icon page, two design-token pages); a folder can hold several (`FSPopovers` holds five, each its own entry), and a component with no story is not one of them | **The catalog is Storybook's** (decision 17): every story file in the repository is a component, wherever it is, so nothing here knows how a library lays out its folders |
| **On `origin/develop`: 87 component folders in `components` and 20 in `compositeComponents`; 80 story files** (56 and 24; `icons` has 1 and `uxDocs` 2, which are not components). Every composite has a story, though some are nested (`FSInputModal/FSFormInput`) or several to a folder (`FSPopovers`) | same | A folder's stories are found **anywhere under it**, and a folder can have more than one |
| **All 80 story titles are plain string literals** (measured), e.g. `'Buttons/FSButton'`, `'Inputs/Composite Components/FSInputModal/FSFormInput'`, `'Components/Window/FSDynamicWindow'`, `'Popovers/PopoverHeader'` | every `*.stories.tsx` on `develop` | A text reader is enough. Titles can have two to four parts, so the group is the first part and the rest is the path |
| **`componentSubtitle` is in 71 of the 80 stories; `githubUrl` and `figmaPageUrl` are in only 30** | same | A Source link cannot depend on `githubUrl` (decision 3), and a Figma link is often absent |
| **Storybook's id rule is verified** with the library's own `toId` from Storybook: `Buttons/FSButton` is `buttons-fsbutton--docs`; `Data Display/FSAvatar` is `data-display-fsavatar--docs`; `Inputs/Composite Components/FSInputModal/FSFormInput` is `inputs-composite-components-fsinputmodal-fsforminput--docs` | `storybook/internal/csf` in the library | The link is built from the title. The tests carry these three as fixtures |
| **The hosted Storybook is Chromatic's** (`https://develop--6617f3c579abb5c5e780fddc.chromatic.com/`, built from `develop`) **and is behind a Chromatic login** (`index.json` answers with a login address) | `README.md`, `chromatic.yaml`; fetched 2026-10-08 | The app cannot check a link, and a person without Chromatic access lands on a login page. Said in the tab (decision 6); not a code problem |
| **Storybook's sidebar order is set in `.storybook/preview.tsx`:** Buttons, Inputs, Data Display, Feedback, Surfaces, Navigation, Layout, Tables | the library | The tab uses the same order, then any other group alphabetically (`Components`, `Popovers`, `Utils`) |
| **A clone's local `develop` goes stale, and it is real:** on Noah's clone the local `develop` is at 2026-09-29 and `origin/develop` at 2026-10-07, eight days apart | `git log` in the library | Decision 4: read `origin/develop`, and the app fetches it |
| **`git fetch origin develop` works with the person's own credentials** (checked with `--dry-run`), and **changes only `origin/develop`:** no local branch, no working file | the library | Safe to do on opening the tab. Fails fast on no credentials or no network, with `GIT_TERMINAL_PROMPT=0` as `git.ts` already sets |
| **The library has `.dsnr/` but no `.dsnr/workspace.json`,** so discovery does not list it | the library | Needs its own lookup, not a descriptor |
| **The app can already find a clone by its `origin` remote** (`originOf`, `gitHubRepoOf`) in the usual folders and the clone folder, and **can clone a named repository with progress** (`Cloner`) | `repositories.ts`, `discovery.ts`, `cloneFolder.ts`, `clone.ts` | Finding and cloning the library is reuse |
| **Reads of a ref go through `git.ts`** (argv only, `GIT_TERMINAL_PROMPT=0`, `runGit` exported) | `git.ts` | `ls-tree` and `show` need no new way to run git |
| **The renderer has only the named operations on `contract.ts`;** the window never sends a path | `shared/contract.ts` | One new operation; the library's path is found in the main process |
| **The app's GitHub token reaches only repositories the GitHub App is installed on** | [CLONE_PLAN.md](CLONE_PLAN.md) | Why the catalog reads a clone and not the API (decision 1) |
| **`typescript` is a dev dependency of the app only** | `workspace/package.json` | Parsing stories with the compiler would ship it in the main process. Decision 2 avoids that |

**Measured for previews (a spike on 2026-10-08, built and rendered in a scratch folder, nothing written to the
library):**

| Fact | What it means here |
|---|---|
| **Portable stories work on this library.** An entry that imports a story file, `composeStories` and the library's `.storybook/preview.tsx` builds with Vite and renders FSButton's 15 stories in the FUI theme (green primary, the real variants, the icon font) | P1 is a build step, not a research project |
| **All 80 story files build in one page in 5.5 s** (7.3 MB, of which 3.9 MB is the icon font), and **all 359 stories render**, none failing to compose | One build per `develop` commit serves every component page |
| **Ten stories render blank on one shared page:** `FSDialog`, `FSDrawer` (7), `FSMenu`, `FSPipWindow`, which open into the page's body or a new window | Decision 9's one frame per story. Some (a closed menu) will still be blank until clicked, as they are in Storybook's own canvas, and a card says "Opens on click" rather than looking broken: P2 |
| **Three things the library's Storybook gets from its own setup had to be given:** a Sass compiler (some components import `.scss`), an alias for `react-image-gallery`'s stylesheet (its package hides the path), and an empty stand-in for `.mdx` files (the docs template `preview.tsx` imports) | P1's build config. Each is one line, and each is tested |
| **The build is the app's own esbuild plus Sass, not Vite** (measured 2026-10-08 against `develop`: all story files in **1.8 s**, against 5.5 s with Vite, **362 stories rendering**) | The app already depends on `esbuild`; P1 adds `sass`, with no new audit finding. No library tool runs in the app. The library's code runs only in the sandboxed preview view |
| **`develop`'s own packages cannot be installed from here without a registry login:** npm goes through Flock's internal registry (CodeArtifact), and the login on this machine had expired (HTTP 401 on every package, public ones too) | **Not needed.** Built against the clone's own installed packages, `develop` needs only one thing missing: `src/icons/symbols.generated.ts`, a file the library generates at install time (from a package its generator, not its components, imports) and does not keep in git. Only `FSSelect` uses it. A build sets aside exactly what it cannot resolve, once, and a story that reaches for it says "Not installed here: … Run npm install in the library" in its own card. **No npm, no registry, no login** |

**Read for tokens and for embedding Storybook (2026-10-08, from `origin/develop` and a scratch build; nothing written to
the library):**

| Fact | What it means here |
|---|---|
| **Colors are two layers of TypeScript.** Ten color families ("tones", about 20 steps each) in `src/colors/tones/*.ts` (`pineGreen[50]`), and palette roles (`primary`, `primaryContainer`, `secondary`, `surface0`, the priority colors, each with `main`, `light`, `dark`, `contrastText`) in `src/colors/theme/light.ts`, `dark.ts` and `shared.ts`, which point at the tones (`primary.main = pineGreen[50]`) | Flat objects of literals, readable as text as stories are. A color control maps cleanly: change a role or a tone, and what reads it follows |
| **Components read the roles through the MUI theme at run time,** made by `createFSTheme(mode)` in `src/utils/theme.ts` | A change of theme reaches every component with nothing per component |
| **The library's own `FSApp` wrapper takes a `theme` prop** (`<FSApp theme={...}>`), and the library's `.storybook/preview.tsx` already wraps every story in `FSApp` | P1 builds nothing to reserve for a changed theme. T3 does not use this hook (decision 26) |
| **Spacing and radius are set once in the theme** (spacing 8, radius 8), **but about a dozen component styles hardcode `8px` and `360px`** instead of reading them | A radius control would move most things and not those. A library cleanup for the Design System owner; the tab need not work around it |
| **Some component styles are built from the palette when the theme is created** (`getFSVariantStyles(palette)`) | A theme handed over afterwards may not reach those. **T3 does not hand a theme over:** it edits the token in the source and rebuilds (decision 26), so what is built from the palette follows. The hardcoded `8px` and `360px` still ignore the theme, and are a library cleanup |
| **The 259-variable CSS file** (`flock-colors.css`) **is "kept for backward compatibility"** by the library's own words | Not a source for tokens; ignored |
| **The library's own Storybook cannot be built from `develop` alone.** A build from a `git archive` of `develop` failed on `../symbols.generated`, a file the library generates at install time and does not keep in git (it is missing from the clone on Noah's checked-out branch too) | Embedding Storybook means running the clone's own dev server on whatever branch is checked out: not `develop`, not read-only, and a server to start and stop. Why decision 15 chooses the build in decision 8 |

**Read for T1 (2026-10-09, from `origin/develop`):**

| Fact | What it means here |
|---|---|
| **The color values take two forms in the palettes:** a tone step (`pineGreen[50]`), or the same with an opacity after it (`` `${pineGreen[20]}66` ``); the tone files are flat `step: '#HEX'` objects, in descending order of step, and both modes spread in one shared palette (`...sharedPalette`, the priority colors) | All three read as text. A shared role is one token in each mode, both pointing at where it is written (`shared.ts`) |
| **Three of `neutral`'s steps are written wrong:** 94 is `'@ECEEEB'`, 70 is `'AEB0B2'` and 4 is `'0B0F0D'` (an `@`, and two with no `#`) | Not read, and named with their lines; never guessed. **For the Design System owner to fix.** No palette role points at them today |
| **627 tokens:** eleven tone families, the light and dark palettes, spacing and radius (both `8`) | The panel needs its groups collapsed by default, as decision 21 has it |

**How Claude Design does it (read 2026-10-09, from [Anthropic's help center](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design) and third-party write-ups such as [this one](https://nitayneeman.com/blog/how-to-sync-a-design-system-with-claude-design/); marked where it is only third-party):**

| Fact | What it means here |
|---|---|
| **It builds a design system from sources it is given** (a repository, decks, screenshots, assets) and extracts a color palette, typography, components and layout patterns; a repository is the strongest input (Anthropic) | Ours is read from the library's own source, so nothing is guessed from pictures. The decision is only how to find the tokens in code that is laid out differently (decision 18) |
| **For a React library, `/design-sync` in Claude Code is React-only** and uploads a compiled copy: one bundle, the stylesheet, the fonts, and for each component a preview page (the card), type definitions, a usage guide, and a conventions file with rules like "never hand-style a component"; it checks each preview visually first (third-party; the copy is a one-way snapshot) | The same shape as P1 and P2 (a card per component, from the stories) and the library's own `.dsnr/authoring` guidance. Nothing to add |
| **Changes are made in chat only:** open the system, press Remix, talk to Claude; there is a "Let Claude clean it up" button and a Published switch. **No token editor, no versions, diffs or rollback are documented** (Anthropic) | Controls, a branch with its history, and a pull request are beyond what it documents: T3 to T5. Chat comes after, as T8 |
| **Its known failure is tokens that do not arrive:** the cards look right while the tokens are missing, fonts are dropped, and copies of the stylesheet drift apart (third-party) | Our version of it is a control that moves nothing. T3 checks, per token, that a change reaches the components, and says so on the control |
| **Tokens reach it through the code's stylesheet** (CSS variables, Tailwind) in the examples written up; nothing is said of other sources (third-party) | FUI's are TypeScript, and other libraries differ, so T1 reads in layers behind one list (decision 18) |

**Left unmeasured, deliberately:** how long a fetch takes on a slow network. It runs while the tab shows the list it
already has (decision 4), so a slow fetch costs nothing the person waits on.

## Decisions (all made; 1, 4 and 11 to 14 by Noah, 2026-10-08, and 18 to 31 on 2026-10-09; the rest settled in this plan and cheap to change)

| # | Question | Decided | Why |
|---|---|---|---|
| 1 | **Where does the catalog read from?** | **A local clone of the library** (Noah: design is to contribute to the design system, so the clone is what that needs), found by its `origin` remote (`flocksafety/flock-react-component-lib`) in the usual folders and the clone folder. When there is none, the tab shows **Connect the design system** (decision 11): clone it, or locate a clone already on the computer | Matches what editing needs later; no GitHub App change. A GitHub API reader is a second implementation of the same function, built only if people without a clone need the tab |
| 2 | **How are stories read?** | **The `meta` block as text,** by a small, tested reader for four string fields: `title`, `componentSubtitle`, `githubUrl`, `figmaPageUrl`. No TypeScript compiler, no running Storybook | All 80 titles are literals; a standard, documented shape; milliseconds; nothing installed in the library. A story that departs from it still appears, under its folder name in `Ungrouped`, never missing |
| 3 | **What does a component link to?** | **Storybook** (its docs page, built from its title and the design system's hosted Storybook address, when it has one) and **Source** (its folder on GitHub, on the design system's branch, built from the story file's path). Both in the More menu on the component's page; the list has only a chevron (Noah, 2026-10-08) | The path is on every story and cannot be wrong; the Storybook address is the one thing per library the app cannot read from the library, so it is in the design system's entry. **No Figma link** (Noah, 2026-10-08) |
| 4 | **Which branch is read, and how is it kept current?** | **Changed by decision 24** (2026-10-09): the branch is the repository's default branch, not a fixed `develop`; for FUI that is `develop`. **`develop`, read as `origin/develop`** (Noah: `develop` is the source of truth). **The app fetches that one ref when the tab opens and when the person presses Sync,** and reads git's copy, not the folder. No local branch and no file is touched, so the person's checked-out branch and unfinished work make no difference. The header shows `develop`, the short commit and its date, and "Updated just now" or "Could not update: <reason>, showing <date>". Branches built on top of `develop` are the later expansion of this plan | A local `develop` was measured eight days stale; reading `origin/develop` and fetching it is what makes "the source of truth" true without making anyone remember a step (requirement 3). The list shows at once from what is already there, and the fetch replaces it if it brought anything. A failed fetch (offline, no credentials) never blanks the tab |
| 5 | **Are parts (`FSCardContent`) listed?** | **No longer** (2026-10-08, with decision 17). A component with no story is not in Storybook, so it is not in the list, and the "No story" mark, the part rule and the part page are gone | Storybook is the source of truth: the list is what the library's Storybook lists, no more |
| 6 | **What does the tab say about Chromatic access?** | **Nothing, for now** (Noah, 2026-10-08) | It was one line under the header; removed with the **Without a story** filter, which Noah also did not want. The **No story** badge on a gap stays |
| 8 | **How is a preview made?** | **Storybook's portable stories** (`composeStories` and `setProjectAnnotations` from `@storybook/react`, made for rendering stories outside Storybook), with the library's own `.storybook/preview.tsx`, so every story gets the FUI theme and decorators it has in Storybook. **One build of every story per `develop` commit,** by the app's own esbuild and Sass, from a copy of `develop` made with `git archive` into the app's folder and **the clone's own installed packages**; cached until `develop` moves | Measured: every story builds in 1.8 s, the same as one, so one build serves the whole tab. `git archive` leaves no trace in the clone (a worktree would add one to its `.git`). No Storybook server, no second copy of anything, and no network or login |
| 9 | **Where is a preview shown?** | **Click a component (its row, or the finder above the list), and it opens on its own page in the tab:** its name, subtitle and links, then **each of its story files in a card**, live, in a frame of its own, as tall as it renders. Back returns to the list where it was. **Built (P2) as frames in the window, not the native preview view:** each frame is sandboxed to the local server's origin, which is not the window's | One frame per story file: a dialog or drawer renders into its frame's body, and one broken file cannot take the others down. Frames in the window need none of the native view's workarounds (a picture of the page under every menu), and the window's own menus draw over them as over anything else |
| 10 | **Pictures in the list itself?** | **No** (Noah, 2026-10-08: "I just wanted the actual components"). P3 is dropped | The components are seen live on their own page (P2). Pictures would have been a second way to render every component, with files kept per commit and blank or misleading pictures for anything that opens on a click |
| 15 | **Embed Storybook for the preview instead?** | **No, not for reading** (Noah and Claude, 2026-10-08). The preview renders **the library's own stories** with the library's own `FSApp`, as decision 8 says, and Storybook stays where docs, controls and prop tables live | It costs nothing per component: the catalog already lists every story file, and the generated entry imports them all, so **a new component appears with nothing added here**. It is not a second Storybook: no docs, no controls, no rewritten stories. Embedding Storybook needs its dev server on the working tree (see the facts above). **It is the right tool for the later editing stage** (edit a branch, watch Storybook update, open the pull request), and the preview build runs on a branch as well as on `develop`, so choosing this now closes nothing |
| 16 | **Where do token controls go?** | **A separate later series, T1 onward, after P2,** not inside P2 (Noah, 2026-10-08: "a P2 step"; kept apart so P2 stays small). Nothing for it is built in P1 | The library's `FSApp` already takes a theme, so the T steps need no hook from P1 (decision 26 says how a change is applied). Keeping it out of P2 keeps the component page about seeing a component |
| 18 | **How are tokens found?** | **By layers, behind one reader** (Noah confirmed, 2026-10-09): (1) theme files (MUI's way, and FUI's: tone families, palettes with a mode, the theme's spacing and radius), **found by their shape and not their folder**; (2) CSS variables, shadcn's and Tailwind's (`:root`, `.dark`, `@theme`); (3) design token files in the standard JSON format; (4) an agent reading what is there, when none of the first three finds anything. **The first three are built** (Noah, 2026-10-09: "truly automatically detect a design system, not just FUI"), each a small source in `services/tokens/` returning the same list, tried in that order, the first to find tokens winning; the agent is not. Which tab a token is on is one rule for all of them (`categoryOf`). Decision 13 still allows one library to be connected, so the other two are proven by tests, not yet by a second library | Claude Design reads tokens from the code's stylesheet and says nothing of other sources, and libraries differ. One list means no screen learns where a token came from |
| 19 | **What is a change?** | **A short list of token edits (path and new value), and nothing else** (Noah confirmed, 2026-10-09). It is applied by writing each edit into the token's own place in the library's source (decision 26), **Reset** is the empty list, and the branch step (T4) writes the same list into a real branch. The controls produce it, a typed value does, and the agent could later | One representation, so seeing a change, undoing it and saving it are the same change at three moments, and nothing is kept in two shapes |
| 20 | **Controls, or only words?** | **Controls, chosen by what the token is and whether it points at another** (Noah, 2026-10-09: "I do like the sliders and controllers as long as we can do this cleanly"; refined the same day: "we can always expand if need be"). **A role that points at a tone** (`primary.main = pineGreen[50]`) **is re-pointed to a different tone step by default,** which keeps the link, so a later change to the tone still moves it. **A tone, or a color with no link, gets a color picker and its hex.** **"Use a custom color"** (the hex replaces the pointer) is a rare, plainly marked second choice, since it cuts the link. A dimension (the base spacing, the base radius) gets a slider and its number, with its range from the kind. **No picker or slider is put on every row by default:** most rows are read, and a control appears where a person is changing something. Claude Design changes things only by chat; asking in words comes later (T8) and makes the same list | "Cleanly" means no code per token: the reader finds the token and says what it points at, and the control follows from that. A design team keeps its roles attached to its tones; a hex typed over a pointer is how a system drifts |
| 21 | **Where do the tokens live on the screen?** | **In a resizable panel at the right of the Design System tab, always there** (Noah, 2026-10-09: "it should just always be under the design system tab, on the right side"; **this replaces** the earlier "component page only", which he confirmed and then reversed on seeing it). It sits beside the list and beside a component alike, and does not move when either changes. **Always shown: there is no button to hide it** (Noah, 2026-10-09, on seeing the toggle: "remove the tokens toggle, that sidebar will always be present"). It is the review screen's own panel (`ResizablePanel`), its width remembered by the same code (`panelWidth.ts`), **stored separately** from the comments panel's, with a larger largest width since swatch rows need room. One panel for browsing and for editing, so there is no separate Tokens page. **In line tabs by category (Color, Spacing, Shape), each tab with its own search** (Noah, 2026-10-09); the third is Shape because radius is the theme's shape, where shadows and the like would also go; the reader names each token's category, so one the library gains is a tab with nothing else changed **Two views since (Noah, 2026-10-09):** Tokens and Component, a button group in the toolbar between Sync and More; opening a component switches to Component, leaving it switches back, and the tokens are only hidden meanwhile. What the Component view holds is T6: the component's tokens, and who shares them (decision 29) | A change is seen where it is made: one control, and every card on a component's page moves. Dragging the panel wider is how the whole palette is browsed, so nothing like a "wide" switch is built |
| 22 | **The Storybook token pages in the components list** | **Hidden from it** (Noah, 2026-10-09: "hidden from the components list because they're moving to the sidebar"), **when T2 ships,** not before, so the tokens are never in neither place | The panel shows the same from the source, with the controls. Their stories stay in the library, and the list still shows what the library's Storybook lists as components |
| 23 | **What may be connected?** | **Any repository the person can reach** (Noah, 2026-10-09: "as flexible as possible"; **replaces 12 and 13**). Chosen from the same repository picker the clone uses, or located as a folder; **there is no list of accepted libraries,** so the app does not gate by name or refuse forks. It is accepted or rejected by what it finds in it (decision 25). **Several can be connected, one shown at a time** (Noah, 2026-10-09: a switcher in the toolbar, with the design system's name, and Remove in the More menu; when none is left, the Connect screen); all are remembered, and nothing is found by itself. **The picker lists every repository the person's account reaches** (Noah, 2026-10-09: "every single repository accessible from the account that's logged in"): through their own GitHub command line, signed in as them, every organization's included, then any the app's GitHub App sees that it did not; the app's own sign-in sees only the repositories it is installed on. **Connect is the repository picker and one button,** centered like the sign-in; Locate (choosing a folder) is not offered, as the repository picker already finds a copy that is on the computer | The gate was FUI's name in a list in code, which a monorepo, a fork or another company's library could never pass. What the app needs is a design system, and it can see for itself whether there is one. Building and previewing still run only in the sandboxed frame, as before |
| 24 | **Which branch is read?** | **The repository's default branch,** found when it is connected (Noah, 2026-10-09; **changes 4**). Read as git's copy of it, fetched when the tab opens and on Sync, as before. A branch picker on the Connect screen can come later | For FUI the default is `develop`, so nothing changes for it. A fixed branch in a list does not exist any more |
| 25 | **What is a design system, and where is it in a monorepo?** | **A folder with Storybook stories or tokens, either** (Noah, 2026-10-09). When connected the app looks for folders that have stories or tokens: **one place, and it is used; several (two packages, say), and the person chooses,** the choice remembered with the repository. **Rejected, with what it looked for,** when it finds neither. The design system's folder then scopes the list, the tokens and the previews, so an app's own theme in the same repository is not taken for it | Detecting from the contents is what lets any repository connect (23). The scope is what makes a monorepo safe to read: tokens are found by their shape, and without it the first source to find any, anywhere, wins |
| 26 | **How is a change applied?** | **By editing the token's literal in the library's source and rebuilding the previews with esbuild** (Noah, 2026-10-09: "I think we should update the plan that way"), **not** by passing a theme object to the library's `FSApp`. The build is from the temporary copy previews are already built from (`copyAt` in `storyPreviews.ts`); the person's checkout is never touched. **As built (T3):** the copy is not written either: the build reads the edited text in place of the token's file, so there is nothing to undo and nothing left over if the app quits. **It applies on release (the end of a drag, a typed value), not on every frame,** with a "Building…" state. **One mechanism serves T3 and T4:** T4 writes the same edit to a real branch. The only per-source part is a small edit-writer: a theme file's literal, a CSS `--x: value;`, a token file's `$value`. JSON line numbers had to be made exact first, since an edit by line is only safe when the line is (done in T3). **Measured, 2026-10-09,** on the real library at `origin/develop` (83 story files, one tone edit, the new color confirmed in the output): a full rebuild, cold, **about 2.1 s** (2.2 s the first time, 2.09 s again); an incremental rebuild (`context().rebuild()`) **about 0.95 s** (1.44 s to build the context the first time); with only one to four story files, **about 0.8 s** (about 1.0 s the first time); unminified, about 1.0 s, so **minifying is not the cost**. The fixed cost is probably the Sass and font work in the library's plugin (not confirmed); **caching what each file loads to is the next optimization** if a second feels slow. **As built, measured the same day:** the first change about 2.2 s (it opens the build), each after about 1.0 s, of which the rebuild is about 0.95 s; reading the theme files from git again for each change had added 0.65 s, so a commit's reads are kept | An edit to the source reaches everything the build reaches, including styles built from the palette when the theme is created and any component that reads the token another way, which a theme passed to `FSApp` would miss. One writer, not two, for seeing a change and saving it. About a second is not instant, so a drag is not previewed frame by frame |
| 27 | **What does a design team need to see, and where does a change end?** | **A change is tried safely, with its contrast and its reach shown, and it always ends as a draft pull request: the panel is not an editor** (Noah, 2026-10-09). **Contrast:** a role's `main` against its `contrastText`, as a WCAG ratio on the row (the data is already read). **Reach:** how far a change goes, as "used by N roles"; counting components is harder and is left out for now. **Review:** the pull request step is visible, and **nothing is written silently** to a branch someone has not been shown. Components are not counted and nothing is applied to a shared branch from this panel | A professional team changes a color to answer "does it still pass, and what else did it move?", and needs the review step in sight. Showing contrast and reach is what separates trying a change from guessing at one |
| 28 | **How is a change kept, and proposed?** | **As commits on a branch DSNR makes for it, `dsnr/tokens-…`, written by git's own plumbing, with no working copy and nothing checked out; proposed as a draft pull request through the person's own git and GitHub command line** (Noah, 2026-10-09: "let's take care of T4 and T5"; replaces the plan's "separate working copy"). Each save is one commit, made from the library's commit the change was made on plus the whole change, with the last save as its parent, so the history is the iterations and a token reset since is back as the library has it; a save that changes nothing makes no commit. The branch only moves from where DSNR left it. Proposing pushes and opens a **draft**; every save after is pushed. Chromatic's build is linked once the library's CI has made one. Which branch a design system's change is on is remembered on disk, so closing the app keeps it and the panel gets the change back; **Start over** forgets it, leaving the branch and any pull request where they are | The person's checkout, its index and its uncommitted work are never touched, as with the previews (decision 26). A working copy would have been a second copy of the library to keep, clean and remove. The person's own tools mean the pull request is theirs, with whatever they may do, as Share does |
| 29 | **How are a component's tokens found, and how is one adjusted?** | **By tagging every token with a unique value, building once, rendering each story and reading what it draws** (Noah, 2026-10-09: "is this the cleanest way... any design system"; proved by a spike the same day). Not by reading the component's source (every library references tokens differently, and FUI's components have their colors in the shared theme, not their files), and not by matching the colors a component draws to token values (several tokens share a value, so it is approximate). Each token gets a value nothing else has (a color by its index, an odd size for the spacing and for the radius); the one build is made with the writers T3 and T4 already have; each value read back names its token. **A component is adjusted only at its tokens, never alone:** a per-component override would be a hardcoded value in its source, the inconsistency a design system exists to avoid. What is shared is shown before anything is changed ("Radius base is used by FSButton, FSTextField, FSCard, FSToggleButtonGroup"); a value set in the component (the chip's `360px`) is shown as "not a token" and is the library's to change | One mechanism for any library the writers support, exact for what is drawn directly, and it makes the reach count (decision 27) a count of components. **Spike, 2026-10-09, on FUI at `fc2658f`:** 595 tags built in 2.5 s; eight components rendered; radius decoded exactly (FSButton 73 elements, FSTextField, FSCard and FSToggleButtonGroup on the one radius token, FSChip's `360px` and FSCheckbox's `50%` hardcoded); colors told apart that a value match cannot (`primary.main` from `primary.contrastText`, FSButton 66% from tokens). **What it shows about the library:** FSTextField, FSSelect, FSCard, FSCheckbox, FSTabs and FSToggleButtonGroup draw 0 to 22% of their colors from tokens (the text color is MUI's default `rgba(0,0,0,0.87)` and a hardcoded gray, neither a token), and most spacing is hardcoded pixels |
| 30 | **How does accessibility reach what is built, and how is it measured?** | **Through the standard that already exists, delivered and measured by the app, with one definition of WCAG in code** (Noah, 2026-10-09: "make sure that's baked into the agent files... something centralized"). **What exists:** `standards/universal/accessibility.md` (the rules, the ladder as axe tags, a manual checklist, honest reporting) and each product's declared target in its `.dsnr/manifest.md` (Coke: WCAG 2.0 Level A, `['wcag2a']`, enforced by cypress-axe; FUI declares none). **What is missing:** the standard reaches an agent only by being named (the prototype skill has one line among the shared standards, the codebase and comment skills none), and nothing measures what an agent builds, so a claim cannot be checked. **So:** (A) the app **puts the rules and the product's declared target into every build task** instead of naming the folder, from the one standard and the one manifest, copying neither; (B) the app **runs axe-core on a built prototype page** in a hidden, sandboxed window with the manifest's tags, gives the failures back to the agent as its own check (as a build error is), and keeps the result on the iteration's record for the review screen; for codebase work the skill tells the agent to run the product's own axe command, declared in its setup; (C) **one definition of WCAG in code** (`shared/wcag.ts`: each threshold with its success criterion and W3C link, and the tag ladder), read by the Design System's contrast display and by the prototype check alike, both taking the target from the manifest. **Reported honestly:** "no issues found by automated checks", with the ones axe cannot decide counted as incomplete, never "passes WCAG" (axe finds about 57% of WCAG issues, per Deque); never a conformance level stated anywhere but the manifest. **Confirmed by Noah, 2026-10-09:** (1) **where a product declares no target** (FUI), check at **WCAG 2.2 AA and label it informational**, "no target declared", never a claim (the levels are cumulative, so that is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` together); a product that does declare one (Coke's Level A) is measured at exactly that, with nothing added; (2) **a failing check is sent back to the agent and reported, and does not block the person while exploring:** on a prototype the agent gets the failures as part of its own check, as a build error is, and tries to fix them for up to **two rounds**, and what is left is reported on the iteration, not hidden; **a hard stop is only at handoff**, where the production-readiness gate already requires meeting the declared target and the product's own axe command runs as part of its checks; a rule skipped to get a green run is recorded as a bypass, never as a pass | The standard is already one file and the target already one declaration, so this adds delivery and measurement, not a second standard. The rule that nothing depends on a person remembering applies: the app delivers the rules and runs the check, so no designer or agent has to. Our contrast display shows AA ratios always; at Coke's Level A there is no contrast criterion, so it must say "not required at your target" |
| 31 | **Pictures of the components, after all?** | **Yes, in a grid view of the components beside the list** (Noah, 2026-10-09: "a list view like we currently have, but then also add a grid view... like the projects cards, except the top part would be the preview thumbnail"; **replaces decision 10** for the grid only: the list stays words). A picture is a screenshot of a story file's first story, taken in the drawing pass T6 already makes (the drawing as the library has it, in light), found from the pixels and centered on a white canvas of the cover's own shape (twice as wide as tall), so it fills the cover edge to edge. **Kept as good apps keep thumbnails:** each component's picture stays until a newer one replaces it (never blanked during an update), kept across restarts, in a fixed-size cover so nothing moves when one arrives, a soft placeholder until there is one, faded in. The card is the Projects card's pieces (`CardGrid`, `CardCover`, `Card`), so the two grids look and work alike | Decision 10's reasons were a second way to render every component, files kept per commit, and misleading pictures of what opens on a click. The first two no longer hold: the drawing pass exists, and a picture is one per component, replaced in place. The third still holds and is said plainly: a dialog's card shows its trigger, as its story first draws. **Spike, 2026-10-09, on FUI:** 80 of 81 listed story files pictured, 10 ms and about 2 KB each at 320 px; recognizable (FSButton's sizes, FSChip's variants, FSTabs, FSCheckbox); soft at that size, so taken at twice the size shown |
| 17 | **What is a component?** | **Whatever the library's Storybook lists** (Noah, 2026-10-08: "using Storybook as that source of truth … anytime you add something that has Storybook in it, it would just get the list from the Storybook"). Every `*.stories.(js|jsx|mjs|ts|tsx)` file on the design system's branch, anywhere in the repository, is one component, named by the last part of its title and grouped by the first, in the order decision 7 gives. **What the app cannot read from the library is in its entry in `DESIGN_SYSTEMS`:** the repository, the branch that is its source of truth, and the hosted Storybook address, if any | It is what makes the tab automatic for any Storybook library: no folder layout, naming or location is assumed, a story added to the library is in the list, and a second design system is one more entry (shown by a test with a library on `main`, stories under `packages/`, and no hosted Storybook). It also removed a layer: the folder rules, parts, gaps and their marks |
| 11 | **How does the tab get a library when it has none?** | **A centered "Connect the design system" screen, laid out like the GitHub sign-in,** with two tabs: **Clone** and **Locate** (P0). Whichever is used, the connection is **remembered** (the folder's path, in the app's own settings, as the checkout and the clone folder are) and checked every time the app starts | Noah, 2026-10-08: connecting is something a person does on purpose, once, like signing in, and the app remembers it. Locate lets someone who already has the library anywhere on the computer use that clone, and Clone gives everyone else one with no terminal |
| 12 | **Does the app still find a clone by itself?** | **Superseded by decision 23** (2026-10-09): there is no list of accepted libraries to find a clone by, so the app finds nothing by itself; the one connected is remembered. **Yes** (Noah, 2026-10-08), **as a convenience.** What is remembered wins; otherwise a clone of the library in the clone folder or the usual places is used, with no screen. The Connect screen shows only when neither exists, or the remembered folder is gone | A designer with the library already in `~/Documents/GitHub` should not have to say so, and Noah's own reason: **a connection can be removed and replaced later,** which a find-by-itself rule does not get in the way of. Finding trusts nothing: the app only reads git's copy of `develop` from it (decision 4) |
| 13 | **What may be connected?** | **Superseded by decision 23** (2026-10-09): any repository can be connected, and is accepted by what the app finds in it (decision 25), not by its name. **The design system library, and nothing else; no forks** (Noah, 2026-10-08). It is recognized in **one place**, `isDesignSystem`, over a short list of accepted repositories with one entry, `flocksafety/flock-react-component-lib`: **by name** when a repository is chosen in Clone (so nothing is downloaded that would be refused), and **by the folder's `origin`** when one is located or found (any remote form, any case, any folder name). A clone of a fork has a different `origin`, so it is refused with the others | The tab shows one library, and a refusal comes before anything is built on a wrong folder. A second design system later is one more line in that list, not a new rule |
| 14 | **What does Clone offer?** | **Changed by decision 23:** the picker offers every repository the person can reach, and the line that refuses a repository that is not the library is gone; the rest stands. **The New modal's own repository picker and clone panel, reused as they are** (Noah, 2026-10-08): the same `SearchSelect` of the person's repositories, the same place line with **Change**, the same progress and **Stop**, the same `clonePlan`, `cloneFolder` and `cloneProgress`. They are moved out of `NewWork.tsx` into shared components, so there is one of each. **Choosing a repository that is not the design system** is said at once ("That is not the design system library"), before any clone is offered; choosing the library offers **Clone** | One clone picker in the app, as Noah asked. The detection (decision 13) happens on the name, which is known before a byte is downloaded |
| 7 | **In what order are groups and rows?** | **The library's own sidebar order,** read from its `.storybook/preview` (`storySort.order`, the top level), then any other group alphabetically, `Ungrouped` last; components alphabetically within a group. Alphabetical when the library sets no order | Storybook's order, from Storybook itself, with nothing copied here: a group the library adds or moves is where Storybook puts it |

## Milestones

**Small milestones, each finished, tested and committed on its own, each leaving the app working.** Same rules as
the other plans: a test first for every behavior, one commit each, the state document updated in the same change, and
nothing on GitHub changed.

| # | Milestone | Needs | Size | Risk |
|---|---|---|---|---|
| **S1** (done) | **The catalog reader:** a pure function that turns what `origin/develop` holds into a list of components | Decisions 2, 3, 5, 7 | S | Low |
| **S2** (done) | **Finding the library, bringing it up to date, and reading it:** locate the clone, fetch `origin/develop`, read it through git; one named operation on the contract | S1, decisions 1, 4 | M | Low |
| **S3** (done) | **The tab:** grouped list, search, links, header, the four states | S2, decisions 3, 5 to 7 | M | Low |
| **P0** (done) | **Connect the design system:** the centered screen with **Clone** and **Locate**, and a connection that is remembered. **Replaces S4** | S2, S3, decisions 11 to 14 | M | Medium |
| **P1** (done) | **Build the previews:** one page of every story from `develop`, cached by commit, one story per address | P0, decision 8 | M | **Medium** |
| **P2** (done) | **The component page:** click a row, see its stories as live cards | P1, decision 9 | M | Medium |
| **P5** (done) | **A grid view of the components, with pictures:** a List and Grid switch over the components; the grid is the Projects card, its cover a picture of the component taken in T6's drawing pass, kept until replaced and across restarts | P2, T6, decision 31 | M | Medium |
| **P4** (done) | **Connect any repository:** the picker offers every repository the person can reach, the connection is accepted by what is found in it (stories or tokens), a monorepo's design system folder is found, or chosen when there are several, and scopes the list, tokens and previews; the default branch is read. **Replaces the accepted list** | P0, decisions 23 to 25 | L | **Medium** |
| **T1** (done) | **Find the tokens:** a reader that returns the library's tokens as one typed list (colors, spacing, radius), found and not listed | P2, decisions 16, 18 | M | Low |
| **T2** (done) | **Show the tokens, in a panel:** a resizable panel at the right of the tab, always there, in line tabs by category (Color, Spacing, Shape), each with its own search and its tokens in collapsible groups, each with its value and where it comes from | T1, decision 21 | M | Low |
| **T3** (done) | **Try a change safely, with contrast and reach shown:** a change is an edit to the token's literal, and the previews rebuild with it when it is released (decision 26); a linked role is re-pointed to another tone step, a tone or plain color has a picker and hex, with "use a custom color" as the rare second choice (decision 20); the contrast ratio and "used by N roles" are on the row (decision 27); a **Changed** group at the top with a reset for each and for all; nothing is kept past the session | T2, decisions 19, 20, 26, 27 | L | Medium |
| **T4** (done) | **Try it on a branch:** each save writes the same edits (T3's writer) to a new branch of the library, one commit each, so the branch's history is the iterations; the preview can run on the branch | T3 | M | Medium |
| **T5** (done) | **Propose it:** a draft pull request from that branch, with Chromatic's link | T4 | M | Medium |
| **T6** (done) | **Show a component's tokens, and who shares them:** every token tagged with a unique value, built once, each story rendered and read back (decision 29); the Component view shows **Made from** (the component's tokens, as the same rows with the same editor), **Shared with** (the other components that use a token) and **Not tokens** (what is set in the component); run in the background once per library commit, in both modes | T3, decision 29 | M | Medium |
| **T7** (done) | **Accessibility, delivered and measured:** the rules and the product's declared target put into every build task (A); axe-core run on a built prototype page in a hidden sandboxed window, its failures given back to the agent and kept on the iteration's record (B); one definition of WCAG in code, shared by the contrast display and the check, both reading the target from the manifest (C); each component's own count on its card and panel (D); tests that keep the standard from drifting | decision 30, T3, T6 (the hidden windows) | M | Medium |
| **T8** (candidate) | **Ask in words:** "make the primary a little warmer" produces the same list of edits | T3 | S | Low |
| **T9** (done) | **Voice and tone:** the tab gets a row of three tabs, **Components**, **Primitives** and **Voice and Tone**, and the Components frame two rows of its own, with the Component and Tokens switch across the top of the right panel (step 1); the company's voice and tone is one file in the design repository, read and shown (2), changed in the app as a branch and a draft pull request or in the repository (3), and put into every build task the way accessibility is (4) | T7's task brief, decisions 17 to 31 | M | Medium |

### S1: The catalog reader (done 2026-10-08)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-08). In
short: `services/componentCatalog.ts`'s `readCatalog(reads)` takes two reads (every file under a folder, one file's text)
and returns `CatalogComponent[]` in the tab's order. **Superseded by decision 17:** the folder rules, `isGap` and `STORYBOOK_URL` as the one
constant for the hosted Storybook. **For S2:** the reads are `git ls-tree -r --name-only` and `git show` on
`refs/remotes/origin/develop`; the real-library test in `__tests__/componentCatalog.spec.ts` already does exactly that
with `execFileSync`, and S2 moves it into `git.ts`'s runner. **Where it differs from the plan:** the field reader takes
the first `title` in the file, which on every story today is the `meta` block's; a story that put another `title:`
first would show that one, and the real-library test would catch it as a wrong group only if it changed the group.

### S2: Finding the library, bringing it up to date, and reading it (done 2026-10-08)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-08). In
short: `services/designLibrary.ts` finds the clone by its origin (`findLibrary`), reads `origin/develop` through git
(`libraryReads`, with the stories in one `cat-file --batch`), fetches only that ref (`updateLibrary`), and `DesignLibrary`
answers the new `designSystemCatalog(refresh)` channel. **For S3:** call it with `false` when the tab is first shown
(the list comes back at once, with `update: 'updating'`), then at once with `true` and replace the list with the
answer; Sync calls it with `true`. The types are `Catalog`, `CatalogComponent` and `CatalogUpdate` in `contract.ts`;
`isGap` is in `componentCatalog.ts`, which the window cannot import, so S3 either moves it to `shared/` or repeats its
one line. **Where it differs from the plan:** `CatalogUpdate` has a fourth value, `'updating'`, for the first answer, and
`no-develop` carries the clone's path so the tab can say which clone. **Not tried:** a fetch from the real GitHub
(a `--dry-run` was, on 2026-10-08); the first open of the tab will do one.

### S3: The tab (done 2026-10-08)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-08). In
short: `renderer/DesignSystem.tsx`, mounted in `App.tsx` and kept mounted while hidden; the toolbar, the Chromatic line,
search, the kind tabs, **Without a story (n)**, grouped rows with their links, and every state; the two-step first read
and Sync. **For P0:** the `no-clone` state is a `Notice` in `DesignSystem.tsx` saying to clone it by hand; P0 replaces
it with the Connect screen and, when a connection is made, calls the same first read again. **Where it differs from the plan:**
none in what it does. The `Ungrouped` count the risks table mentions is not a separate figure in the header: a
component with no readable title appears in an **Ungrouped** group like any other, with its count beside the heading.
**Not seen in the running app yet** (Noah's own session was running; nothing was launched against his settings).

### P0: Connect the design system (done 2026-10-08)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-08). In
short: `renderer/ConnectDesignSystem.tsx` (Clone and Locate), `connectLibrary`, `locateLibrary` and `whyNotLibrary` in
`services/designLibrary.ts`, the `locateDesignSystem` and `cloneDesignSystem` channels, and, shared on the way,
`services/folderMemory.ts`, `renderer/Clone.tsx`, `cloneAsPlanned` in `ipc.ts` and `isDesignSystem` in
`shared/catalog.ts`. **Where it differs from the plan:** none in what it does. **For P1:** the library's folder is
`LibraryLocation.root`, from `libraryFinder`, the same place the catalog reads it. **Not seen in the running app yet;
Noah to try:** Clone from nothing, Locate on the real clone, and the connection surviving a restart.

## Settled before P0 (Noah, 2026-10-08)

Clone reuses the New modal's picker and clone panel (decision 14); the app still finds a clone by itself (decision 12);
no forks (decision 13); and removing or replacing a connection is not in P0, but is expected later, which is why
decision 12's automatic find stays out of its way. Nothing is open.

### P1: Build the previews (done 2026-10-08)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-08). In
short: `services/storyPreviews.ts` (`StoryPreviews`) builds one page of every story file of `develop`, once per commit,
into the app's own folder, and `PrototypeServer.serveFolder` serves it on this machine only; the new `storyPreview`
channel answers `ready` (with the page's address), `no-library`, `no-packages` (React or Storybook's stories not
installed in the clone) or `failed` (with the build's own words). A story file's page is `<base>?file=<path>`, and
draws every story in it, each by name in its own error boundary, telling the frame that holds it how tall it is
(`postMessage({ flockPreviewHeight })`). The window's frame source is allowed in its security policy. **For P2:** the
channel waits for the build (about two seconds the first time, then at once), so the window shows "Building…" while it
waits; `CatalogComponent.id` (the story file) is the `file` to ask for. **The frame must be `<iframe sandbox="allow-scripts
allow-same-origin">`** (checked in a real Electron window, 2026-10-08): the library reads `document.cookie` as it loads,
which throws in a frame with no origin of its own, so the page drew nothing. With `allow-same-origin` the frame has the
local server's origin, which is not the app window's, so the window still cannot be reached from it (that was checked
too) and nothing has to be shared with another origin. The combination is only unsafe when the frame shares its
parent's origin, which it never does here. **Stories respond** (2026-10-08): the page supplies the one part of Storybook's preview
portable stories leave out, redrawing a story that updates its own args with `useArgs` (tabs, selects, drawers); and a
story that only sets args, with no render of its own, gets a `checked` it sets as `defaultChecked`, React's own rule for
a checkable control, so a switch or checkbox responds. Only `checked`: `value` is also what a display shows (FUI's
PopoverLineItem), so it is never touched. A build is kept per commit **and** per how the app builds (a fingerprint of
the page, its script and the build's set-up), so a newer app never shows a build an older one made. **Where it differs from the plan:** no Vite, no
`Install packages` step and no `no-packages` fix beyond saying to run `npm install` in the library: the build needs no
registry, and sets aside only what the clone has not installed. **Not seen in the app yet:** P2 is the first thing that
shows it.

### P2: The component page (done 2026-10-08)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-08). In
short: `renderer/ComponentPage.tsx` (the page, the shared More menu `ComponentLinks`, and `StoryFrame`), opened from a
row or the finder in `renderer/DesignSystem.tsx`, which keeps the list mounted underneath. **Where it differs from the
plan:** the stories are frames in the window, not the native preview view (decision 9), so there is no picture of the
page under menus and nothing to place over a native layer; there are no cards per story, but one per story file, with
the file's stories drawn by name inside it, since the names come from Storybook itself (decision in P1); a story that
opens on a click is not marked "Opens on click", and shows as it does in Storybook's own canvas. **Not seen in the
running app yet; Noah to try:** open FSButton, FSPopovers (several files), FSSelect (the note about what is not
installed) and FSDrawer (opens on a click), and Back.

### P5: A grid view of the components, with pictures (done 2026-10-09)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-09): on FUI, 80 of 81 components
pictured in the background pass (about 18 s cold, 1.4 MB in all), each the first story alone, found from the pixels and
centered on white in the cover's own shape, filling the cover edge to edge, taken at twice the size so it is sharp.

**What it is** (decision 31): beside the finder, a **List** and **Grid** switch, remembered. The grid shows the same
groups as the list, each a `CardGrid` of component cards: the Projects card (`Card`, `CardCover`), its cover a picture of
the component, its footer the name and its group; the whole card opens the component, by pointer or keyboard, as a
project card does. **The pictures:** in the drawing pass T6 makes (`storyMeasure.ts`), the run that draws the library as
it is, in light, also captures each story file's first story alone (the others and its name hidden), at twice the size a card shows
it; `services/pictureComposition.ts` finds what was painted from the pixels and puts it in the middle of a white canvas
twice as wide as it is tall (never under 480 px of the page across, so a small component is not stretched), as JPEG; a
story that painted nothing has no picture. They are kept by `services/componentPictures.ts`: one per component, per design
system, in the app's own folder (not the previews' build folder, which is removed when the library moves), each file
named by its content, so a new picture is a new address and an old one is removed when replaced; with a small record of
which picture is whose, written whole, with a fingerprint of the code that takes them (`PICTURE_RECIPE`), so a picture
taken another way, after that code changes, is not shown. The window asks for them (`componentPictures`), and again every few seconds
while the pass runs. **Reliable before pretty:** a story that does not draw keeps its last picture or has none, never a
broken one; the cover is the same size with or without one; a picture fades in once loaded (not with reduced motion); it
is decorative to a screen reader, since the name is beside it. **Not in P5:** pictures in the list rows, or in place of
the live view while it loads; a mark for a component whose picture changed in an update.

### P4: Connect any repository (done 2026-10-09)

**Done.** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-09). In short: the design
systems connected are a list (`services/designSystems.ts`'s `DesignSystemsMemory`), one shown; connecting clones or uses
a repository, reads its default branch, and finds its design systems with `findDesignSystems` (each package with
stories or tokens of its own); the library service and the previews read the one shown, scoped to its package. **Left
for a real monorepo:** its previews (Risks); everything else is tested on fixtures, and FUI reads as before. **Not done,
by choice:** a branch picker (the default branch is read), and Locate.

### T1 to T8: tokens, from finding them to proposing a change

**Not built, and T3 onward is not specified in detail until T2 has been used.** Like Claude Design, the app looks at the
connected library and shows **what can be adjusted**; it goes further, in that a change is made with controls, seen
live, and carried to a branch and a pull request.

**How it stays clean (the rule for every T step):**
- **One list of tokens** (T1). The panel and its controls take it, and none knows where a token came from
  (decision 18).
- **One kind of control for one kind of token, and one that keeps a link** (decision 20): a role that points at a tone is
  re-pointed to another step; a tone or plain color is a picker and its hex; a dimension is a slider and its number,
  with its range from the kind, never written per token.
- **One representation of a change** (decision 19), applied in one place (decision 26): the token's own text edited, and
  the previews rebuilt with it. No code per component, which is the rule previews already follow; the only per-source
  code is the small edit-writer.
- **A test first for each behavior,** and each step finished, committed and leaving the app working, like the other
  milestones.

**T1: Find the tokens (done 2026-10-09).** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log)
(2026-10-09). In short: `services/designTokens.ts`'s `readTokens(reads)` takes the catalog's reads, lists the library's own
files once, and tries the sources in `services/tokens/` in order (decision 18); it returns `DesignTokens`
(`shared/contract.ts`): one list of `DesignToken`s, each with its kind, category and file and line, what was not read,
and how they were found. The line is exact for every source (token files' made exact in T3, decision 26). **The library has three steps written wrong,** which the panel shows as the reader reports them (see "What
is known").

**T2: Show the tokens, in a panel (done 2026-10-09).** What it built, and the evidence, is in
[dsnr.md](dsnr.md#change-log) (2026-10-09). In short: `TokensPanel` (line tabs by category, each with its own search) in the shared `ResizablePanel` at the right of the tab, open by default and hidden or shown by **Tokens** in
the toolbar, with its own width (`TOKENS_PANEL`); the tokens come with the
catalog (`Catalog.tokens`), and the library's `Design Tokens` pages are out of the list (decision 22). **For T3:** the
controls go on `TokenRow`, by kind and link (decision 20); a change rebuilds the previews (decision 26). **On the list there is
nothing live to change,** so the panel there is for browsing, and says to open a component to see a change.

**T3: Try a change safely, with contrast and reach shown (done 2026-10-09).** What it built, and the evidence, is in
[dsnr.md](dsnr.md#change-log) (2026-10-09). In short: a row of the tokens panel opens its token's control
(`TokenEditor`); the change is a list of `TokenEdit`s held by the tab; `services/tokenEdits.ts`'s `editedFiles` writes it
through the source that read each token (`TokenSource.edit`) and reads the files back against what `shared/tokens.ts`'s
`withEdits` says they will be (the panel shows the same); and `StoryPreviews` builds the commit's previews again with
those files in place of the copy's, on a build kept open, served at a new address for each change. **Two things found in
building it:** a role written once in a palette both modes spread in (FUI's `shared.ts`) is one place read as a Light and
a Dark token, so a change to either changes both, and the panel says so ("Also changes Dark priority0 main"); the
read-back found this on the real library before it could be shown wrongly. **What is not done, on purpose:** re-pointing
offers the steps of the tone a role already uses (another tone needs an import the writer does not add, so it says so);
contrast is shown only for hex colors (CSS variables in `oklch` say none); a change to a token file or a stylesheet
reaches the previews only when the stories import that file, not a build step's output (Style Dictionary's); and
components are not counted in the reach.

**T4 and T5: Keep it on a branch, and propose it (done 2026-10-09).** What they built, and the evidence, is in
[dsnr.md](dsnr.md#change-log) (2026-10-09). In short (decision 28): **Save to a branch** under the Changed list makes
`dsnr/tokens-…` and commits the change there by git's plumbing (`services/tokenBranches.ts`), with the same writer the
previews are tried with; **Save** again when the change is not the one saved; **Propose** pushes and opens a draft pull
request with the change in its description; Chromatic's build is linked when the library's CI has made it; **Start
over** forgets the branch. Who reviews, and how comments come back, is still the editing plan's question (the library's
pull requests go to the Design System owners, `CODEOWNERS`). **Found in building it:** the library's files were read
trimmed, so a file written back would have lost its last newline; files are now read exactly as committed. **Not done:**
a branch's base stays the commit its first save was made on, even after the library's branch moves; and the previews
are of the change on the library's current commit, not of the branch itself.

**T6: Show a component's tokens, and who shares them (done 2026-10-09).** What it built, and the evidence, is in
[dsnr.md](dsnr.md#change-log) (2026-10-09). In short (decision 29): `services/componentTokens.ts` tags every token
(`tagsFor`: a color by its number, a length by a prime number of pixels), has the previews built once with the tags
beside the change being tried (`StoryPreviews.tagged`), draws every listed component's story file tagged in light and
dark and plain in light (`services/storyMeasure.ts`: hidden, sandboxed windows, the mode set per window, the page loaded
once per window and each file drawn in it in turn), and reads back what each drew (`decode`). The index is kept for the
library's commit, and **got ready in the background** (below) so it is there by the first ask. The Component view (`ComponentPanel`) shows **Made from** as the tokens
panel's own rows, with each token's uses and the other components that share it, and **Not tokens**. **Measured on FUI:**
the whole library, 83 story files drawn three times, in **7.4 s** (2.7 s for the tagged build, 4.2 s for the drawing);
the radius token is shared by FSButton and 44 other components, `primary.main` by 35. **Background:** three seconds after the app opens, and again whenever the library has been read (it may have moved), the main process builds the previews and the index for the shown design system, three windows at a time; cold on FUI it is ready in about 14 s, after which a component's first ask is answered in tens of milliseconds. Asking before it is ready waits for the same build. **Known limits:** a color worked
out from a token (a hover's darker shade) is counted, not named; a state no story shows is not read; tokens only for
color, spacing and radius; lengths in `em` are not tagged; a role both modes share is named as Light in light and Dark in
dark.

**T7: Accessibility, delivered and measured (done 2026-10-10).** What it built, and the evidence, is in
[dsnr.md](dsnr.md#change-log) (2026-10-10). **What building it changed from the plan below:** (1) there was no check loop
for a prototype to put the failures into (the agent was only told to build until its build stops failing), so B made one:
a newly built page is checked before it is shown, and the agent is given what was found, up to two rounds; (2) a result is
kept beside the page on each machine, with what it was made with (the page, axe-core's version, the tags, the target), not
on the shared record: anyone who opens the same page gets the same result, made again when any of that changes, and moving
to code checks it when it was not; (3) the standard's tag ladder named three tags axe-core has no rules for (`wcag22a`,
`wcag21aaa`, `wcag22aaa`), which run nothing: corrected, and held to axe-core by a test; (4) a product's own copies of its
tags are already held to its manifest by the product's own check (FUI's `.dsnr/validate.py`, rule 9), so the app does not
check them a second time (that check covers Coke's `cypress/support/commands.js` but not its `__tests__/support/axe.ts`,
which also repeats `wcag2a`: Coke's to add); (5) Coke declares its own `a11y` command, which its handoff gate already
runs, so codebase tasks name it to run as the work goes, rather than a new command; (6) the Design System's contrast is
judged at the design system's own target (FUI declares none, so the default, informational), not a product's; (7)
`shared/wcag.ts` holds only the criteria the app judges (1.4.3 and 1.4.6, as text): 1.4.11 and the large-text ratios are
added with whatever first judges them, since the token panel knows neither a text's size nor that a color is a control's.
Decision 30 says what and why; this is the order, each step leaving the app working.
**A, deliver the standard.** The task an agent is given for a prototype, for codebase work, and for addressing a comment
carries the accessibility rules (the universal rules section and the reporting rules, read from
`standards/universal/accessibility.md` as the skills are) and the product's declared target and axe tags (read from its
`.dsnr/manifest.md`), where now it names a folder. A product with no manifest, or no target in it, is told so, and the
agent is told to report that it could not check against one. `codebase-work.md` and `address-comments.md` each gain the
one line that sends the agent to the rules. **Moving a prototype to code** (Noah, 2026-10-10: moving to React "should
automatically try to move towards an accessible standard") is codebase work, so it has the same task, plus the prototype's
own remaining findings (what B kept on its iteration, and what needs a person), which the agent fixes in the real code or
says why not; none is dropped by the move. It is told to build toward the product's target as it goes, not at the end. The
formal checks are at handoff, where the product's own axe command runs and the readiness gate requires the target. **B, measure.** After a prototype is built, `services/accessibility.ts` runs
axe-core (bundled; MPL-2.0) in a hidden window held as the story-drawing windows are (`sandboxedPage.ts`), against the
saved page and in each of its states, with `runOnly` the manifest's tags. Its violations go back to the agent in its own
check loop, up to two rounds, then are left as they are and reported; the result (violations by rule and success criterion,
incomplete, and what was run) is kept on the iteration's record and shown in review as "N automated issues, M need a
person". It is never shown as a pass. For codebase work the product declares an `accessibility` command in its setup
(Coke's is its cypress-axe run) and the skill tells the agent to run it; the app cannot run a product's Cypress itself.
**C, one definition.** `shared/wcag.ts` holds the thresholds the app uses, each with its success criterion number and
W3C link (1.4.3 text, 1.4.6, 1.4.11 non-text, large text), and the tag ladder `accessibility.md` describes; the contrast
display reads the connected design system's or product's target and says "not required at your target" where it is
below the criterion. **Not in T7:** a full contrast check of every pair in a system (worth doing, and uses the same hidden windows); typography, which has no thresholds here yet.
**D, visible on each component** (Noah, 2026-10-10: yes). Once B can run axe on a page, it runs it over each component's
first story in the drawing pass T6 already makes, at the product's or system's target, and a component's card and its
panel say "N automated issues, M need a person" in the same words as review. Last, since it needs B and C and costs a
second axe run per component.
**Staying true to WCAG, with nobody to remember** (Noah: "I don't want this drifting"). Each place a standard could drift
has a test that fails when it does, so a change is seen when it happens, not found later:
- **One declaration of the target:** the manifest. The app reads it and copies it nowhere. A product's own copies of it
  (Coke's cypress and test setup repeat `wcag2a`) are held to it by the product's own check (FUI's `.dsnr/validate.py`,
  rule 9); the app does not edit a product for this.
- **The thresholds** (`shared/wcag.ts`) are tested against the W3C's own numbers (4.5:1, 3:1, 7:1) and its known boundary
  cases (black on white 21:1; #767676 on white, the lightest gray that passes 4.5:1), and each carries its success
  criterion and W3C link, so a wrong number cannot be typed in unseen.
- **The tag ladder** is tested against axe-core's own list of tags, and against the ladder in `accessibility.md`, so an
  axe upgrade that renames or adds a tag, or an edit to the doc, fails a test instead of drifting. Where axe-core is
  upgraded the suite says whether the ladder still holds.
- **A result says what it was made with:** axe-core's version, the tags, and when. One made with another version or target
  than now is shown as out of date and run again, never as current.
- **Never more than was measured:** no screen says "compliant" or "passes", whatever the numbers; conformance is a person's
  judgment (axe finds about 57% of WCAG issues), and the review says what is left for one.
- **WCAG itself changing** (Noah: "as WCAG updates things... capture those updates"). The edition the app's numbers were
  taken from (`WCAG_EDITION`: version and the W3C's date for it, today WCAG 2.2, 12 December 2024) is recorded in
  `shared/wcag.ts`. A scheduled check (a weekly GitHub workflow beside `publish-prototypes.yml`) reads the W3C's
  latest-published address (`w3.org/TR/WCAG2/`, which names its version and date) and, when either differs from the
  record, opens an issue saying so: a new version, or a republished edition with corrections. A person decides what it
  means; the check is what makes sure it is seen, and a test keeps the record and the check reading the same fields. An
  axe-core upgrade is caught the same way, by the tag-ladder test. A new WCAG version is then one change to
  `shared/wcag.ts`, its tests and the manifest's target.
**Confirmed by Noah:** the default where no target is declared (WCAG 2.2 AA, informational), and that a failing check
is fixed in up to two rounds and reported, with the hard stop only at handoff (decision 30). Nothing is waiting on him.

**T8 (candidate): Ask in words.** Words produce the same list, through the agent and the library's authoring standards;
nothing else changes. Built only if the controls leave a gap.

### T9: Voice and tone (done 2026-10-10)

What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log) (2026-10-10). **What building it changed from the plan
below:** (1) the file is read through `DesignRepo.readFileAt(path, ref)`, which gives its sha with its text and which `readFile` is
now made from, so there is one way to read a file from the design repository; (2) a save checks the default branch's file against the sha the text was
opened at on *every* save, not only the first, and GitHub's 409 is the backstop when the default branch moves between that check
and the branch being made (the branch is then deleted and the save refused); (3) a remembered branch that is not `dsnr/voice-…` is
never taken for a change kept, so it is never written to; (4) whether a branch was merged or closed is asked of the person's `gh`
where there is one, else of the app's session, and when GitHub cannot tell, the change is kept, not lost; (5) a file with only
only its headings and comments, or nothing, is not put in a task, and a file that cannot be read is said to be in
the task, which goes ahead; (6) the section reaches every task through a required `voice` field on each task builder, so the
compiler names any new kind of task that leaves it out: prototype build and its accessibility fix, prototype address, every
codebase run (`startTracked`), the move-to-code task file, and the `dsnr` command; (7) the old bar was named by more tests than
the four "Find a component" lines (the bar's order, the alert, the count of tab lists, opening from the finder): those were
rewritten for the new layout, and every other token and component test passed unchanged; (8) the tab's two panes are Radix's own,
since shadcn's sets a text size on everything in them; (9) steps 2 and 3 were built as one, sharing the service and the page.
**Final review (Noah: "make sure that it is absolutely clean", 2026-10-10):** what T9 had copied is now one piece each:
the branch's line and Save, Propose and Start over (`BranchActions`, which the tokens' `TokenBranchActions` is now made from),
the link out (`OutLink`), the `dsnr/<kind>-<day>-<hex>` naming and pattern (`dsnrBranch.ts`, the tokens' too), a search's word
match (`shared/search.ts`, the Projects search's too), the "No … matches" line (`NoMatches`, the Projects screen's too), the bar
of tabs (later removed: see (10) below), GitHub's status on a failed call
(`httpStatus`, `github.ts`), and every task reading the file through `work.voice()`. A redundant call went (whether a branch
exists, which reading the file on it already says). Found in passing and fixed: `DesignRepo` took only the app's own errors for
"not there", so a missing file read through the person's `gh` (the `dsnr` command) failed instead of being null. A save also
takes a blob's 64-hex sha, for a repository on SHA-256.
**After using it (Noah, 2026-10-10):** (10) the bar of tabs went through three forms the same day: an exception in the toolbar, removed; the shared tabs stretched across the width like the panel's, which Noah did not want; and last, **the shared `LineTabs` with one option, `bar`** (renamed from `PanelTabs`, since it is no longer a panel's only), which sets a toolbar's height and inset and tabs as wide as their labels, inside the component and on nothing where it is used. The toolbar is as it was before T9, and the tab fills the window under the top bar with each pane scrolling on its own, so nothing counts the toolbar's height; (11) the panel's switch is **Component, then Tokens**, across the panel's whole width, which is an option of the toggle group itself (`fullWidth`), not of the panel; the tokens are still what shows until a component is opened; (12) a third tab, **Primitives**, sits between Components and Voice and Tone; (13) the top bar's switch between Projects and Design System is the large size of tabs (`TabsList size="lg"`, a Button's large height; the default is a Button's default), a size option the tab list did not have; (14) the voice and tone has no "Start the file": the text area is always there, blank with no file (Noah), so the skeleton of headings was removed, and a file of only headings or comments adds nothing to a task, as a blank one does; (15) a tab's label is in title case whatever it was written in, by the tab component (`titleCase`, `shared/titleCase.ts`), for every tab in the app. **What it holds is not decided:** it is an empty page, with no side panel, until Noah says.

**Why (Noah, 2026-10-10):** what prototypes and code say should use Flock's tone of voice, and the voice should be changed in
the app or in the repository with the same effect: someone commits a change and it shows in the app, or a change made in the app
reaches the repository. Today there is only the generic `standards/universal/copy-and-microcopy.md`, which says a product's own
Flock-tier standard overrides it; Coke's `.dsnr/standards/flock/product-native-ui.md` has a few vocabulary lines, and no document of
the company's voice was found in any of the five repositories.

**How Claude Design does it (third-party guides only, nothing official found):** its setup form asks for a voice and tone
statement of two or three sentences and at least three anti-patterns, with a notes field; a published system is chosen when a new
project starts. Guides say adjectives alone work badly and concrete rules, paired good and bad sentences and an anti-pattern
list work well. **No sync with a repository is described:** it is a snapshot made once inside their tool. That sync is what T9 adds.

**Where it sits (Noah, 2026-10-10):** Design System is the company's, not any one library, and has three tabs: Components, Primitives (what it holds is not decided), and
**Voice and tone** (first called Brand guidelines; it holds only voice and tone at first, and the name can widen later). It sits
beside the connected library, so switching the system or branch does not change it. A product's own differences stay in its
`.dsnr/standards/flock/`, which already wins over anything shared.

**Decided (2026-10-10; Noah left 1 to 3 to me and agreed 4):**
1. **The file lives in the shared layer, in a new `standards/flock/` beside `universal/`.** Flock's voice is not universal
   (`universal/` is "would hold at any company") and not one product's (a product's `.dsnr/standards/flock/` is for what differs
   in that product); Noah's layers put what is common to all products in `flock-designer`; and it is where the app already reads
   and writes. The component library is the wrong place: a package consumed by products, and the voice is not about components.
   **Precedence becomes:** a product's own Flock tier, then `standards/flock/`, then `universal/` (accessibility a floor under all).
2. **No source exists to start from** (below). **Noah writes the content himself;** nothing is invented for it, and
   nobody else has to confirm anything before it is used. **The file is always part of the system** (Noah, 2026-10-10): the
   tab is always the text area, blank until the file has been written, with nothing to start, and a blank file adds nothing to
   a task.
3. **The editor is one plain text area over one file,** not fields. The file is what the agent reads, and Claude Design's own
   form (statement, anti-patterns, notes) also ends as one document; headings give the structure, and fields can come later.
4. **The branch stays shown, not chosen.** The previews, tokens, component pictures and their caches are all built from one
   commit of the library's default branch (P4), so a choice reaches all of them: a step of its own. The branches a person would
   want to see are the ones the app makes (T4, T5), seen by trying the change and by the draft pull request's Chromatic build.
   Revisit when someone asks to open a colleague's branch.

**What exists already (searched 2026-10-10: Google Drive, public Slack, this machine; nothing a person could use as the file):**
a 2023 "Flock Safety-Brand Guidelines" document, nearly all of it marked "Copy in progress"; and a technical-writing skill shared
in Slack (July 2026), which is how documents are written, not how the product speaks. **Nothing on interface copy,** and nothing
from either is copied into this plan.

**In the agent files too (Noah, 2026-10-10):** the file is **committed blank** in the design repository (an empty file, so it is
always there, to be written in, and ignored while it is), and **Coke's agent files name it**, so a run that does not come from
the app (Claude Code in VS Code) reads it as well: in `.dsnr/README.md` (the standards tree, the precedence, as the shared Flock
tier between Coke's own and the universal), in what the DSNR agent reads (`agents/dsnr.md`), in what the parity reviewer reads and
checks the view's words against (`agents/product-parity-reviewer.md`), and in `standards/non-negotiables.md`'s precedence. Blank, each
says there is nothing to apply and that it is not a finding; written, it is read every time. The component library's agent files do
not name it: they are the design system's layer, which is about components.

**The file:** `standards/flock/voice-and-tone.md` in `flock-designer`, **blank until Noah writes it**: the tab shows its text area
whether the file exists or not, and Save makes the file. What goes in it is his: the guides suggest a voice in two or three
sentences, concrete rules (reading level, sentence length, words banned; only what is Flock-wide, since the generic rules stay
in `copy-and-microcopy.md`), paired examples, and at least three anti-patterns. **Coke's vocabulary stays in Coke:** its lines on Devices, "Fleet", and no
"Oops" rest on one product's evidence (its own file says so, and `standards/README.md` says one product's habit is not a
Flock-wide rule), so nothing is moved out of it. A line there that Noah says is company-wide is lifted into the shared
file then, and removed from Coke's, so each fact still lives once.

**The layout (Noah, 2026-10-10).** Today one bar holds the system's name, a branch icon, the problem with a sync, Sync, the
Tokens and Component switch and More, and a Find a component menu sits over the list (`DesignSystem.tsx`). It becomes:

```
┌───────────────────────────────────────────────────────────────┬──────────────────┐
│ Components   Primitives   Voice and Tone                      │                  │  the tabs
├───────────────────────────────────────────────────────────────┼──────────────────┤
│ [ Design system name ▾ ]  branch          [Sync]  [More ⋯]    │ [Component|Tokens]  the switch
│ [ Search components…              ]            [List|Grid]    │ the alert, if values cannot be read
│                                                               │ the tokens, or the open component
│ the list or grid, or a component's page                       │
└───────────────────────────────────────────────────────────────┴──────────────────┘
```

- **The tabs** are the app's line tabs (`LineTabs`) as a **bar of tabs** (`LineTabsList bar`): a strip as tall as the toolbar
  under it (and the panel's switch row), inset as they are, each tab as wide as its label and not stretched, the line under the
  chosen one on the strip's own border, and each label in title case (`Voice and Tone`), which the tab component itself does for
  every tab. The tokens panel's Color, Spacing and Shape are the same component without the option, stretched across the panel.
  Nothing about either is set on the screen that uses them: the option is said once, in the component.
- **The Components frame's first row:** the switcher (the design systems connected, and Connect a design system), the branch
  with it, then Sync, with the problem with a sync beside it as now, and **More** to the right of Sync (Remove stays in it).
- **Its second row:** a **search box, "Search components"**, in place of the Find a component menu, and **List or Grid** at the
  far right. The row belongs to the list and goes when a component is open, as the menu does now.
- **The right panel** keeps its place and width. The **Component and Tokens switch moves to its top, across its whole width, above the alert** (the
  one `TokenProblems` shows for what the library has that is not read), so it is above both views. The panel belongs to
  Components only; Voice and tone has none.
- **One behavior changes:** the menu opened a component; a search box **narrows the list or grid** in place, groups with nothing
  left disappearing, with a line saying none matches. Components are opened by their row or card, as they are.
- **No new parts:** the box is the app's `SearchField` (as the Projects bar and the tokens panel use); the rest is the parts
  that exist, moved. The tab is kept mounted while hidden, as the Design System tab is, so neither tab loses what was typed.

**How it stays clean:**
- **One reader, one writer, for the file.** It is read and written through the design repository's own API (`DesignRepo`), which
  works with or without a clone on the machine, so a designer with no checkout can use it. (`writeFile`'s own note says it is for where there is no clone, "one writer per machine": that rule keeps two writers off the default branch's records; a branch of its own that nothing checks out has no second writer, and the file on the default branch only changes when its pull request is merged.) The token path is not reused for it:
  that path makes commits with git's plumbing in a clone of the *library* and writes token edits, none of which applies here. What
  is shared is what the person sees, as one component (`BranchActions`: the branch and its saves, the draft pull request,
  Save, Propose, Start over), and the branch's naming (`dsnrBranch.ts`), not the mechanics.
- **Delivered the way accessibility is** (T7, part A), so nobody has to remember it: `taskAccessibility` reads the standard
  "as the skills are" and puts it into every task, at two places, `ipc.ts` (codebase tasks) and `prototypeWork.ts` (prototype
  tasks). A `taskVoice` beside it reads `standards/flock/voice-and-tone.md` each time a task is made, copied nowhere.
- **A test first for each behavior,** and each step finished, committed and leaving the app working.

**Steps:**

**1. The bar, the two rows, the switch, the search (nothing else).** `DesignSystem.tsx`: a tab bar (Components, Voice and tone) in
place of today's bar; the two rows inside the Components frame; `PanelSwitcher` moved to the top of the `ResizablePanel`, above
`TokenProblems`, in both views; the `SearchSelect` finder replaced by `SearchField` filtering `catalog.components`, groups
without a match left out. **Voice and tone shows an empty page** until step 2 and has no right panel. *Tests, in
`designSystem.spec.ts`, which names the old bar in four places* (lines 140, 307, 370, 547, "Find a component"): those four are
rewritten for the search box; new ones for: both tabs, Components selected, and Voice and tone showing no tokens panel; More after
Sync in the first row; the switch the first thing in the panel and above the alert; the search narrowing the list and the grid
(the same rule), a group with no match gone, the none-match line, and Escape clearing it; the second row gone with a component open
and back after Back; what was typed in the search kept when switching tabs and back. The existing token and component tests must
pass unchanged: they are the proof nothing else moved.

**2. Read the file, read only.** `DesignRepo.readFile` (which already gives null for a missing file) gets an optional ref;
a `voice` channel (named like `tokenBranch`'s) returns the text, its blob sha, and whether the file exists. The page shows the
text, read only, a **Refresh** that reads again (a commit made in the repository shows after it, and when the tab is opened), and,
with no file, a blank text area (there is nothing to start). *Tests:* the service with a fake API (text and sha; 404 gives "no file";
an error is said, not swallowed); the page for each (text, empty, error, refreshed after a change in the repository).

**3. Change it in the app.** The text area becomes editable; **Save** keeps the text on a branch of the design repository,
`dsnr/voice-<day>-<4 hex>` (the pattern is checked, as `TOKEN_BRANCH` is, so a save can never land on anyone's work), made from
the default branch's head on the first save, with one commit by the signed-in person on each save after (a save that changes
nothing makes none). **Propose** opens a draft pull request; **Start over** forgets the branch, which stays on GitHub. The branch,
the file's sha it was made on and the last commit are remembered on disk, as `tokenBranchesFile` does, so the app can be closed;
on opening, a remembered branch whose pull request is merged or closed is forgotten, and the text shown is the default branch's.
**If the file changed on the default branch since the text was opened** (its sha is not the one held), **Save refuses** and says
so, keeping the person's text beside the new one to choose from; nothing is overwritten. **Without write access,** the first save
says so, in the repository's own words as `writeFile` does today, and the text stays.

**Tested on the real repository, 2026-10-10** (a throwaway branch, through the calls the service will make, with Noah's `gh`
login; the branch was deleted and its draft pull request, #11, left closed):
- A file that is not there reads as **404**, as `readFile` already treats it: "no file" needs nothing new.
- A branch cut from the default branch's head (`git/refs`) works; **each Contents PUT with `branch` is one commit** (two saves
  were two commits ahead of the default).
- **A save on a stale file sha is refused with 409.** The branch is cut from the current head, so giving the sha the text was
  opened at on the *first* save makes the same call detect a change on the default branch since: one mechanism, no separate check.
- A pull request made with `draft: true` is a draft; **a second for the same branch is refused (422)**, so the existing one is
  found by its branch first (`pulls?head=<owner>:<branch>&state=all`, which also gives open, closed or merged, for the rule that a
  merged branch is forgotten).
- **The repository's default branch is `noah/flock-designer`, its only branch.** A voice pull request is made against it, and the
  service asks GitHub for `default_branch` rather than naming one, so a `main` later changes nothing.
- No workflow runs on a pull request here (`publish-prototypes.yml` is `workflow_dispatch` only), so a proposal builds nothing.

**Decided from the test: the pull request is opened by the person's own `gh`,** as Share does ("the designer's own `gh` is
already them", and the app's GitHub App needs no new permission), with the branch and its commits through `DesignRepo`. **Not
testable from outside the app:** the App's own token is in the keychain, and whether the installation holds *Pull requests* is
unknown and no longer matters. The branch and commits need *Contents: read and write* on the installation, which the record
publishing (`writeFile`) already depends on; without it the first save says so. Without `gh`, saving still works and the page gives
GitHub's compare link instead of Propose, saying `gh` is needed, as Share's dialog does. What a real run of the service, as the
app, adds is Noah's check (below).
*Tests:* the service with a fake API (branch from the default
head; one commit per save; none when unchanged; refusal on a changed sha; remembered across a restart; start over; the pattern;
propose opens a **draft** and never a ready one); the page (save, propose, a refusal, no write access).

**4. Put it into every task, and the documents that describe it.** `taskVoice(readStandard)` in `accessibilityBrief.ts`'s style
(its own file, `voiceBrief.ts`), called at the two places `taskAccessibility` is, so every prototype, codebase, move-to-code and
address task carries the file's text, with one sentence: the product's own guidance wins where it differs. **With no file the
section is left out, with no error** (the file is not required). The context receipt names it, if it names the accessibility
target (read `ContextReceipt` at the start of this step to see). Documents: `standards/README.md` (tree, tiers and precedence),
`skills/README.md` (the third layer), a line at the head of `copy-and-microcopy.md`. **A run from the app needs nothing in Coke** (the task
carries the file); **a run in VS Code, with no app, reads Coke's agent files, so they name it too** (decided 2026-10-10, below). *Tests:* the section is in a prototype task, a
codebase task and an address task; absent with no file; the text read afresh each time (an edit shows in the next task); and the
words in a task are the file's own, not a copy kept anywhere.

**Noah's check (what tests cannot show):** in the app, Design System, Voice and Tone: write a line in the text area, **Save to a branch**. That is the first real save through the app's own GitHub session (the probe used `gh`): if it says write access is needed, the GitHub App's Contents permission is not approved on the installation. Then see the branch on GitHub, **Propose**, see the draft pull request, merge it, **Refresh** and see the merged text; then build a prototype and see `## Voice and tone` in its task. Coke's agent files name the file too, on Coke's `noah/dsnr` (`fda6b052`, one commit, not pushed: the agent never pushes).

**Not in T9:** logos, color and typography beyond the tokens; choosing the library's branch; fields in place of the text area;
checking written copy against the voice automatically (a candidate once the file is in use).

## What this leaves ready for editing (not built)

Nothing below is built, and nothing is shaped now except the first line.

| Later step | What it will use from version 1 |
|---|---|
| **Pick a component to adjust** | `CatalogComponent.id` (its story file; its folder is the component's) |
| **Try a token change** | T3 to T5, above |
| **Make the change with the agent** | The authoring standards already in the library (`.dsnr/authoring/components.md`, `stories.md`), the same agent run as prototypes |
| **Start from `develop`** | `origin/develop`, already fetched and current; a branch for the component is made from it, as prototypes make theirs, so the catalog and the work start from the same commit |
| **See it** | P1's preview build, run on the person's branch instead of `develop`: the same page, the same cards, showing the change |
| **Propose it** | A branch and a draft pull request to the library, through the existing share path (`share.ts`, `shareTools.ts`). The library's CI already publishes a Chromatic build for each pull request (`chromatic.yaml`) |
| **Review it** | The pull request's Chromatic link, and comments the way prototypes have them |

**The one question that waits for then, not now:** the library's pull requests are reviewed by the Design System owners
(`CODEOWNERS`), not the design repository's reviewers, so "comments come back into the app" is a separate question from
"open a pull request". It belongs to the editing plan.

## Out of scope for version 1

- **Editing, branching and pull requests** (above).
- **Embedding or running Storybook, and controls or prop tables.** Previews render the stories as written; changing
  their arguments is Storybook's.
- **Tokens, colors, icons and the `uxDocs` pages in the list.** They are not components, so the list does not show them.
  Finding, showing and adjusting tokens is T1 to T5; icons and the `uxDocs` pages are not planned.
- **Any branch but `develop`, and any tagged version of the library.** Branches are the later expansion of this plan.
- **Reading the library over the GitHub API** (a person with no clone). A second reader of the same function, built if
  asked for.
- **Updating the clone's own branches.** The app fetches one ref and moves nothing. It does not pull, switch or clean.
- **A generated index file** committed in either repository (requirement 3).

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **The text reader misses a story that departs from the standard** | A component appears ungrouped or without links | All 83 read today (measured). It still appears under its folder name, and the `Ungrouped` count is shown in the header, which is the signal for the Design System owner to fix the story. The real-library test catches it first |
| **A Storybook link is wrong for a title** | The first thing people click | The id rule is Storybook's own `toId`, with three real titles as fixtures. **Opened once by hand against the hosted Storybook before S3 ships,** by someone with Chromatic access |
| **The hosted Storybook address changes** (Chromatic URLs are per project and branch) | Every Storybook link breaks at once | One constant in one file; the address is in the library's `README.md`, and the Design System owner is asked to say if it moves |
| **The fetch fails: offline, no credentials, a protected network** | The list could be old and look current | The header always shows the commit date, and a failed fetch is a visible line with the reason. Nothing blanks |
| **A person's git is not signed in to GitHub** | Fetch and clone both fail | Fails fast (`GIT_TERMINAL_PROMPT=0`), with the fix named (`gh auth setup-git`), as the clone plan does |
| **A person has no access to the library** | They see the tab and no components | The Connect screen's Clone tab says to ask for access, and Locate still works if they have a copy; they are no worse off than before |
| **A connected folder is moved or deleted** | The tab would show an error or nothing | The connection is re-checked on every read; a missing folder returns the Connect screen with what was lost, never a blank tab |
| **Locate connects something that is not the library** | The tab would show the wrong list | Decision 13: the folder's `origin` is checked before it is connected, and again on every read |
| **The tab becomes a second Storybook** | The thing Noah said not to do | Requirement 2 is the test for every addition: previews show the stories as written, and anything about controlling or documenting them links to Storybook |
| **A preview build fails on `develop`** (a story that only builds in Storybook's own setup, or a real error in the library) | No previews at all, or blank cards | A package or generated file the clone lacks is set aside, and only the stories that use it say so. Any other build error is said as it is. A single story that throws is shown with its error in its own card. The real-library test builds every story file |
| **A monorepo's previews do not build** (P4) | Stories import workspace packages, path aliases from the repository's own TypeScript config, or rely on its build setup; the preview build has workarounds only FUI needed (Sass, one stylesheet alias, a stand-in for `.mdx`) | Not known until tried on the real repository, so P4 is built against it, and what the build cannot resolve is said by name in the cards, as for FUI's missing packages. Each workaround is applied only when the library needs it |
| **Any repository can be connected, so any repository's code is built** (P4) | Trust: the allow-list was also a guard | The person chose it from repositories their own account reaches. The library's code still runs only in the sandboxed preview frame, which has no bridge to the app (`pageView.ts`), as prototypes do; the app's own build only reads and bundles it |
| **A monorepo's design system is taken for another folder's theme** (P4) | The list or the panel shows an app's own colors | Decision 25: the folder is found from stories or tokens and scopes everything, and when there are several the person chooses |
| **A theme change does not reach every component (T3)** | A color control that moves some things and not others looks broken | Removed by decision 26: the source is edited and rebuilt, so what is built from the palette follows. The hardcoded `8px` and `360px` ignore the theme either way, and are a library cleanup |
| **An edit written to the wrong place (T3, T4)** | A change lands on another line, or a pointer is replaced by a hex | Built in T3: one edit-writer per source, tested for each, the line exact, and the files read back by the same reader and compared with what the change says before anything is built. A linked role is re-pointed, not overwritten (decision 20) |
| **A token that quietly does not arrive** (Claude Design's own failure: the cards look right while tokens are missing) | A control that moves nothing, and is trusted | Tests that a changed value is in the rebuilt output, on a fixture and on the real library, and FSButton seen in both colors and radii by eye (T3) |
| **The reader finds nothing, or the wrong thing, in a library laid out differently** | An empty or misleading panel | It says "no tokens found" and where it looked. Layer 1 is FUI's only; the others come with a second library (decision 18) |
| **Writing a change into a source file breaks it (T4)** | A branch that does not compile | An exact edit of the literal, read back and compared before it is kept; the preview build runs on the branch, so a broken one shows at once |
| **A slider makes an unusable value** | Unreadable text, or a radius of nothing everywhere | Ranges come from the kind, with sensible bounds, and Reset is one press |
| **Building runs code** | Trust | The app's own esbuild and Sass run in its process, on a copy of `develop` taken out of git; the library's code runs only in the sandboxed preview view, which has no bridge to the app (`pageView.ts`), as prototypes do. The page's only message out is its height |
| **A build is slow or large** | A wait the first time, and disk | 5.5 s measured; built once per `develop` commit, in the background, with the old one removed. 7.3 MB a build |

## Next

**S1 to S3 and P0 to P2 are done,** with Storybook as the source of truth for what a component is (decision 17), and
stories responding as they should. **T1 to T5 and P4 are done (the tokens, read, in the panel, a change tried on them, kept on a branch and proposed as a draft pull request; any repository connected).** **T6 is done too (a component's tokens, and who shares them, found by tagging; decision 29).** The next steps are a designer trying T1 to T6 on a real task, and **T7 is done (accessibility, delivered and measured; decision 30): every task carries the rules and the target, each prototype and each component is checked with axe-core, and WCAG's edition is watched weekly.** T8 is a candidate only. **T9 is done too (voice and tone: the tab's own bar and the Components frame's two rows; the file read, edited, saved to a branch and proposed; and carried by every task).** Noah's check is in T9's section. P3 was dropped
(decision 10).

**By hand, Noah:** restart the dev session (the main process changed), open the Design System tab, and try a few
components: FSToggle and FSCheckbox (they switch), FSTabs (they move), FSPopovers' entries, FSSelect (the note about
what is not installed here, until `npm install` is run in the library), and Back. **For T3:** open FSButton, then in
the panel open Light, press primary's `main` and choose another pineGreen step: "Building…", then the buttons in the
new color, about a second later; try a custom color, the radius slider on the Shape tab, and Reset all. **For T4 and
T5:** Save to a branch (your checkout is untouched: `git status` shows nothing new), Propose (a draft pull request on
the library, from your own `gh`), and close and reopen the app to see the change come back.
