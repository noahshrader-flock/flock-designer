# Design System plan: surface the component library in the app, and leave room to change it

**Written 2026-10-08. Every decision is made and every unknown I could measure was measured the same day. S1 to S3 are built
(2026-10-08), and P0 (**Connect the design system**, which replaced S4) the same evening. P1 and P2 (previews) were built the same day.
P3 (pictures in the list) was dropped.** Tokens (T1 to T6) were laid out on 2026-10-09, after reading how Claude Design does it; T1 and T2 were built the same day. The plan for filling the **Design System** tab (`renderer/DesignSystem.tsx`) with the components
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
| **Colors are two layers of TypeScript.** Ten colour families ("tones", about 20 steps each) in `src/colors/tones/*.ts` (`pineGreen[50]`), and palette roles (`primary`, `primaryContainer`, `secondary`, `surface0`, the priority colours, each with `main`, `light`, `dark`, `contrastText`) in `src/colors/theme/light.ts`, `dark.ts` and `shared.ts`, which point at the tones (`primary.main = pineGreen[50]`) | Flat objects of literals, readable as text as stories are. A colour control maps cleanly: change a role or a tone, and what reads it follows |
| **Components read the roles through the MUI theme at run time,** made by `createFSTheme(mode)` in `src/utils/theme.ts` | A change of theme reaches every component with nothing per component |
| **The library's own `FSApp` wrapper takes a `theme` prop** (`<FSApp theme={...}>`), and the library's `.storybook/preview.tsx` already wraps every story in `FSApp` | The hook for a changed theme **already exists**: P1 builds nothing to reserve for it |
| **Spacing and radius are set once in the theme** (spacing 8, radius 8), **but about a dozen component styles hardcode `8px` and `360px`** instead of reading them | A radius control would move most things and not those. A library cleanup for the Design System owner; the tab need not work around it |
| **Some component styles are built from the palette when the theme is created** (`getFSVariantStyles(palette)`) | A theme changed afterwards may not reach those. To check, cheaply, before the controls are built (T3's spike); not a P1 concern |
| **The 259-variable CSS file** (`flock-colors.css`) **is "kept for backward compatibility"** by the library's own words | Not a source for tokens; ignored |
| **The library's own Storybook cannot be built from `develop` alone.** A build from a `git archive` of `develop` failed on `../symbols.generated`, a file the library generates at install time and does not keep in git (it is missing from the clone on Noah's checked-out branch too) | Embedding Storybook means running the clone's own dev server on whatever branch is checked out: not `develop`, not read-only, and a server to start and stop. Why decision 15 chooses the build in decision 8 |

**Read for T1 (2026-10-09, from `origin/develop`):**

| Fact | What it means here |
|---|---|
| **The colour values take two forms in the palettes:** a tone step (`pineGreen[50]`), or the same with an opacity after it (`` `${pineGreen[20]}66` ``); the tone files are flat `step: '#HEX'` objects, in descending order of step, and both modes spread in one shared palette (`...sharedPalette`, the priority colours) | All three read as text. A shared role is one token in each mode, both pointing at where it is written (`shared.ts`) |
| **Three of `neutral`'s steps are written wrong:** 94 is `'@ECEEEB'`, 70 is `'AEB0B2'` and 4 is `'0B0F0D'` (an `@`, and two with no `#`) | Not read, and named with their lines; never guessed. **For the Design System owner to fix.** No palette role points at them today |
| **627 tokens:** eleven tone families, the light and dark palettes, spacing and radius (both `8`) | The panel needs its groups collapsed by default, as decision 21 has it |

**How Claude Design does it (read 2026-10-09, from [Anthropic's help centre](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design) and third-party write-ups such as [this one](https://nitayneeman.com/blog/how-to-sync-a-design-system-with-claude-design/); marked where it is only third-party):**

| Fact | What it means here |
|---|---|
| **It builds a design system from sources it is given** (a repository, decks, screenshots, assets) and extracts a colour palette, typography, components and layout patterns; a repository is the strongest input (Anthropic) | Ours is read from the library's own source, so nothing is guessed from pictures. The decision is only how to find the tokens in code that is laid out differently (decision 18) |
| **For a React library, `/design-sync` in Claude Code is React-only** and uploads a compiled copy: one bundle, the stylesheet, the fonts, and for each component a preview page (the card), type definitions, a usage guide, and a conventions file with rules like "never hand-style a component"; it checks each preview visually first (third-party; the copy is a one-way snapshot) | The same shape as P1 and P2 (a card per component, from the stories) and the library's own `.dsnr/authoring` guidance. Nothing to add |
| **Changes are made in chat only:** open the system, press Remix, talk to Claude; there is a "Let Claude clean it up" button and a Published switch. **No token editor, no versions, diffs or rollback are documented** (Anthropic) | Controls, a branch with its history, and a pull request are beyond what it documents: T3 to T5. Chat comes after, as T6 |
| **Its known failure is tokens that do not arrive:** the cards look right while the tokens are missing, fonts are dropped, and copies of the stylesheet drift apart (third-party) | Our version of it is a control that moves nothing. T3 checks, per token, that a change reaches the components, and says so on the control |
| **Tokens reach it through the code's stylesheet** (CSS variables, Tailwind) in the examples written up; nothing is said of other sources (third-party) | FUI's are TypeScript, and other libraries differ, so T1 reads in layers behind one list (decision 18) |

**Left unmeasured, deliberately:** how long a fetch takes on a slow network. It runs while the tab shows the list it
already has (decision 4), so a slow fetch costs nothing the person waits on.

## Decisions (all made; 1, 4 and 11 to 14 by Noah, 2026-10-08, and 18 to 22 on 2026-10-09; the rest settled in this plan and cheap to change)

| # | Question | Decided | Why |
|---|---|---|---|
| 1 | **Where does the catalog read from?** | **A local clone of the library** (Noah: design is to contribute to the design system, so the clone is what that needs), found by its `origin` remote (`flocksafety/flock-react-component-lib`) in the usual folders and the clone folder. When there is none, the tab shows **Connect the design system** (decision 11): clone it, or locate a clone already on the computer | Matches what editing needs later; no GitHub App change. A GitHub API reader is a second implementation of the same function, built only if people without a clone need the tab |
| 2 | **How are stories read?** | **The `meta` block as text,** by a small, tested reader for four string fields: `title`, `componentSubtitle`, `githubUrl`, `figmaPageUrl`. No TypeScript compiler, no running Storybook | All 80 titles are literals; a standard, documented shape; milliseconds; nothing installed in the library. A story that departs from it still appears, under its folder name in `Ungrouped`, never missing |
| 3 | **What does a component link to?** | **Storybook** (its docs page, built from its title and the design system's hosted Storybook address, when it has one) and **Source** (its folder on GitHub, on the design system's branch, built from the story file's path). Both in the More menu on the component's page; the list has only a chevron (Noah, 2026-10-08) | The path is on every story and cannot be wrong; the Storybook address is the one thing per library the app cannot read from the library, so it is in the design system's entry. **No Figma link** (Noah, 2026-10-08) |
| 4 | **Which branch is read, and how is it kept current?** | **`develop`, read as `origin/develop`** (Noah: `develop` is the source of truth). **The app fetches that one ref when the tab opens and when the person presses Sync,** and reads git's copy, not the folder. No local branch and no file is touched, so the person's checked-out branch and unfinished work make no difference. The header shows `develop`, the short commit and its date, and "Updated just now" or "Could not update: <reason>, showing <date>". Branches built on top of `develop` are the later expansion of this plan | A local `develop` was measured eight days stale; reading `origin/develop` and fetching it is what makes "the source of truth" true without making anyone remember a step (requirement 3). The list shows at once from what is already there, and the fetch replaces it if it brought anything. A failed fetch (offline, no credentials) never blanks the tab |
| 5 | **Are parts (`FSCardContent`) listed?** | **No longer** (2026-10-08, with decision 17). A component with no story is not in Storybook, so it is not in the list, and the "No story" mark, the part rule and the part page are gone | Storybook is the source of truth: the list is what the library's Storybook lists, no more |
| 6 | **What does the tab say about Chromatic access?** | **Nothing, for now** (Noah, 2026-10-08) | It was one line under the header; removed with the **Without a story** filter, which Noah also did not want. The **No story** badge on a gap stays |
| 8 | **How is a preview made?** | **Storybook's portable stories** (`composeStories` and `setProjectAnnotations` from `@storybook/react`, made for rendering stories outside Storybook), with the library's own `.storybook/preview.tsx`, so every story gets the FUI theme and decorators it has in Storybook. **One build of every story per `develop` commit,** by the app's own esbuild and Sass, from a copy of `develop` made with `git archive` into the app's folder and **the clone's own installed packages**; cached until `develop` moves | Measured: every story builds in 1.8 s, the same as one, so one build serves the whole tab. `git archive` leaves no trace in the clone (a worktree would add one to its `.git`). No Storybook server, no second copy of anything, and no network or login |
| 9 | **Where is a preview shown?** | **Click a component (its row, or the toolbar's finder), and it opens on its own page in the tab:** its name, subtitle and links, then **each of its story files in a card**, live, in a frame of its own, as tall as it renders. Back returns to the list where it was. **Built (P2) as frames in the window, not the native preview view:** each frame is sandboxed to the local server's origin, which is not the window's | One frame per story file: a dialog or drawer renders into its frame's body, and one broken file cannot take the others down. Frames in the window need none of the native view's workarounds (a picture of the page under every menu), and the window's own menus draw over them as over anything else |
| 10 | **Pictures in the list itself?** | **No** (Noah, 2026-10-08: "I just wanted the actual components"). P3 is dropped | The components are seen live on their own page (P2). Pictures would have been a second way to render every component, with files kept per commit and blank or misleading pictures for anything that opens on a click |
| 15 | **Embed Storybook for the preview instead?** | **No, not for reading** (Noah and Claude, 2026-10-08). The preview renders **the library's own stories** with the library's own `FSApp`, as decision 8 says, and Storybook stays where docs, controls and prop tables live | It costs nothing per component: the catalog already lists every story file, and the generated entry imports them all, so **a new component appears with nothing added here**. It is not a second Storybook: no docs, no controls, no rewritten stories. Embedding Storybook needs its dev server on the working tree (see the facts above). **It is the right tool for the later editing stage** (edit a branch, watch Storybook update, open the pull request), and the preview build runs on a branch as well as on `develop`, so choosing this now closes nothing |
| 16 | **Where do token controls go?** | **A separate later series, T1 onward, after P2,** not inside P2 (Noah, 2026-10-08: "a P2 step"; kept apart so P2 stays small). Nothing for it is built in P1 | The library's `FSApp` already takes a theme, so the T steps need no hook from P1. Keeping it out of P2 keeps the component page about seeing a component |
| 18 | **How are tokens found?** | **By layers, behind one reader** (Noah confirmed, 2026-10-09): (1) theme files (MUI's way, and FUI's: tone families, palettes with a mode, the theme's spacing and radius), **found by their shape and not their folder**; (2) CSS variables, shadcn's and Tailwind's (`:root`, `.dark`, `@theme`); (3) design token files in the standard JSON format; (4) an agent reading what is there, when none of the first three finds anything. **The first three are built** (Noah, 2026-10-09: "truly automatically detect a design system, not just FUI"), each a small source in `services/tokens/` returning the same list, tried in that order, the first to find tokens winning; the agent is not. Which tab a token is on is one rule for all of them (`categoryOf`). Decision 13 still allows one library to be connected, so the other two are proven by tests, not yet by a second library | Claude Design reads tokens from the code's stylesheet and says nothing of other sources, and libraries differ. One list means no screen learns where a token came from |
| 19 | **What is a change?** | **A short list of token overrides (path and value), and nothing else** (Noah confirmed, 2026-10-09). The preview applies it as a theme, **Reset** is the empty list, and the branch step writes the same list into the files. The controls produce it, a typed value does, and the agent could later | One representation, so seeing a change, undoing it and saving it are the same change at three moments, and nothing is kept in two shapes |
| 20 | **Controls, or only words?** | **Controls** (Noah, 2026-10-09: "I do like the sliders and controllers as long as we can do this cleanly"), **built from the kind of token, not token by token:** one colour control (a picker and its hex) and one dimension control (a slider and its number), each token getting the one its kind says, with its range from the kind. Claude Design changes things only by chat; asking in words comes later (T6) and makes the same list | "Cleanly" means no code per token: a token the reader finds gets its control with nothing written, and a new kind of token is one new control |
| 21 | **Where do the tokens live on the screen?** | **In a resizable panel at the right of the Design System tab, always there** (Noah, 2026-10-09: "it should just always be under the design system tab, on the right side"; **this replaces** the earlier "component page only", which he confirmed and then reversed on seeing it). It sits beside the list and beside a component alike, and does not move when either changes. **Open when the tab is, with a Tokens button in the toolbar to hide it and show it again.** It is the review screen's own panel (`ResizablePanel`), its width remembered by the same code (`panelWidth.ts`), **stored separately** from the comments panel's, with a larger largest width since swatch rows need room. One panel for browsing and for editing, so there is no separate Tokens page. **In line tabs by category (Colour, Spacing, Shape), each tab with its own search** (Noah, 2026-10-09); the third is Shape because radius is the theme's shape, where shadows and the like would also go; the reader names each token's category, so one the library gains is a tab with nothing else changed | A change is seen where it is made: one control, and every card on a component's page moves. Dragging the panel wider is how the whole palette is browsed, so nothing like a "wide" switch is built |
| 22 | **The Storybook token pages in the components list** | **Hidden from it** (Noah, 2026-10-09: "hidden from the components list because they're moving to the sidebar"), **when T2 ships,** not before, so the tokens are never in neither place | The panel shows the same from the source, with the controls. Their stories stay in the library, and the list still shows what the library's Storybook lists as components |
| 17 | **What is a component?** | **Whatever the library's Storybook lists** (Noah, 2026-10-08: "using Storybook as that source of truth … anytime you add something that has Storybook in it, it would just get the list from the Storybook"). Every `*.stories.(js|jsx|mjs|ts|tsx)` file on the design system's branch, anywhere in the repository, is one component, named by the last part of its title and grouped by the first, in the order decision 7 gives. **What the app cannot read from the library is in its entry in `DESIGN_SYSTEMS`:** the repository, the branch that is its source of truth, and the hosted Storybook address, if any | It is what makes the tab automatic for any Storybook library: no folder layout, naming or location is assumed, a story added to the library is in the list, and a second design system is one more entry (shown by a test with a library on `main`, stories under `packages/`, and no hosted Storybook). It also removed a layer: the folder rules, parts, gaps and their marks |
| 11 | **How does the tab get a library when it has none?** | **A centred "Connect the design system" screen, laid out like the GitHub sign-in,** with two tabs: **Clone** and **Locate** (P0). Whichever is used, the connection is **remembered** (the folder's path, in the app's own settings, as the checkout and the clone folder are) and checked every time the app starts | Noah, 2026-10-08: connecting is something a person does on purpose, once, like signing in, and the app remembers it. Locate lets someone who already has the library anywhere on the computer use that clone, and Clone gives everyone else one with no terminal |
| 12 | **Does the app still find a clone by itself?** | **Yes** (Noah, 2026-10-08), **as a convenience.** What is remembered wins; otherwise a clone of the library in the clone folder or the usual places is used, with no screen. The Connect screen shows only when neither exists, or the remembered folder is gone | A designer with the library already in `~/Documents/GitHub` should not have to say so, and Noah's own reason: **a connection can be removed and replaced later,** which a find-by-itself rule does not get in the way of. Finding trusts nothing: the app only reads git's copy of `develop` from it (decision 4) |
| 13 | **What may be connected?** | **The design system library, and nothing else; no forks** (Noah, 2026-10-08). It is recognised in **one place**, `isDesignSystem`, over a short list of accepted repositories with one entry, `flocksafety/flock-react-component-lib`: **by name** when a repository is chosen in Clone (so nothing is downloaded that would be refused), and **by the folder's `origin`** when one is located or found (any remote form, any case, any folder name). A clone of a fork has a different `origin`, so it is refused with the others | The tab shows one library, and a refusal comes before anything is built on a wrong folder. A second design system later is one more line in that list, not a new rule |
| 14 | **What does Clone offer?** | **The New modal's own repository picker and clone panel, reused as they are** (Noah, 2026-10-08): the same `SearchSelect` of the person's repositories, the same place line with **Change**, the same progress and **Stop**, the same `clonePlan`, `cloneFolder` and `cloneProgress`. They are moved out of `NewWork.tsx` into shared components, so there is one of each. **Choosing a repository that is not the design system** is said at once ("That is not the design system library"), before any clone is offered; choosing the library offers **Clone** | One clone picker in the app, as Noah asked. The detection (decision 13) happens on the name, which is known before a byte is downloaded |
| 7 | **In what order are groups and rows?** | **The library's own sidebar order,** read from its `.storybook/preview` (`storySort.order`, the top level), then any other group alphabetically, `Ungrouped` last; components alphabetically within a group. Alphabetical when the library sets no order | Storybook's order, from Storybook itself, with nothing copied here: a group the library adds or moves is where Storybook puts it |

## Milestones

**Small milestones, each finished, tested and committed on its own, each leaving the app working.** Same rules as
the other plans: a test first for every behaviour, one commit each, the state document updated in the same change, and
nothing on GitHub changed.

| # | Milestone | Needs | Size | Risk |
|---|---|---|---|---|
| **S1** (done) | **The catalog reader:** a pure function that turns what `origin/develop` holds into a list of components | Decisions 2, 3, 5, 7 | S | Low |
| **S2** (done) | **Finding the library, bringing it up to date, and reading it:** locate the clone, fetch `origin/develop`, read it through git; one named operation on the contract | S1, decisions 1, 4 | M | Low |
| **S3** (done) | **The tab:** grouped list, search, links, header, the four states | S2, decisions 3, 5 to 7 | M | Low |
| **P0** (done) | **Connect the design system:** the centred screen with **Clone** and **Locate**, and a connection that is remembered. **Replaces S4** | S2, S3, decisions 11 to 14 | M | Medium |
| **P1** (done) | **Build the previews:** one page of every story from `develop`, cached by commit, one story per address | P0, decision 8 | M | **Medium** |
| **P2** (done) | **The component page:** click a row, see its stories as live cards | P1, decision 9 | M | Medium |
| **T1** (done) | **Find the tokens:** a reader that returns the library's tokens as one typed list (colours, spacing, radius), found and not listed | P2, decisions 16, 18 | M | Low |
| **T2** (done) | **Show the tokens, in a panel:** a resizable panel at the right of the tab, always there, in line tabs by category (Colour, Spacing, Shape), each with its own search and its tokens in collapsible groups, each with its value and where it comes from | T1, decision 21 | M | Low |
| **T3** | **Adjust tokens in the same panel, seen live, written nowhere:** a control on each row, from its kind; a **Changed** group at the top with a reset for each and for all; the change is the overrides list, applied as a theme to every card on the page | T2, decisions 19, 20 | L | Medium |
| **T4** | **Try it on a branch:** each save is a commit on a new branch of the library, so the branch's history is the iterations; the preview can run on the branch | T3 | L | Medium |
| **T5** | **Propose it:** a draft pull request from that branch, with Chromatic's link | T4 | M | Medium |
| **T6** (candidate) | **Ask in words:** "make the primary a little warmer" produces the same overrides list | T3 | S | Low |

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

### T1 to T6: tokens, from finding them to proposing a change

**Not built, and T3 onward is not specified in detail until T2 has been used.** Like Claude Design, the app looks at the
connected library and shows **what can be adjusted**; it goes further, in that a change is made with controls, seen
live, and carried to a branch and a pull request.

**How it stays clean (the rule for every T step):**
- **One list of tokens** (T1). The panel and its controls take it, and none knows where a token came from
  (decision 18).
- **One kind of control for one kind of token** (decision 20): a colour (a picker and its hex), a dimension (a slider
  and its number). The range comes from the kind (a radius from zero, spacing as a multiple of the base), never
  written per token.
- **One representation of a change** (decision 19), applied in one place: the library's own `FSApp` theme prop, in the
  preview frame. No code per component, which is the rule previews already follow.
- **A test first for each behaviour,** and each step finished, committed and leaving the app working, like the other
  milestones.

**T1: Find the tokens (done 2026-10-09).** What it built, and the evidence, is in [dsnr.md](dsnr.md#change-log)
(2026-10-09). In short: `services/designTokens.ts`'s `readTokens(reads)` takes the catalog's reads, lists the library's own
files once, and tries the sources in `services/tokens/` in order (decision 18); it returns `DesignTokens`
(`shared/contract.ts`): one list of `DesignToken`s, each with its kind, category and file and line, what was not read,
and how they were found. **For T4:** the line is exact for theme files and CSS variables, and found by key for token
files; T4 writes to theme files first. **The library has three steps written wrong,** which the panel shows as the reader reports them (see "What
is known").

**T2: Show the tokens, in a panel (done 2026-10-09).** What it built, and the evidence, is in
[dsnr.md](dsnr.md#change-log) (2026-10-09). In short: `TokensPanel` (line tabs by category, each with its own search) in the shared `ResizablePanel` at the right of the tab, open by default and hidden or shown by **Tokens** in
the toolbar, with its own width (`TOKENS_PANEL`); the tokens come with the
catalog (`Catalog.tokens`), and the library's `Design Tokens` pages are out of the list (decision 22). **For T3:** the
controls go on `TokenRow`, one per kind; the theme goes to the frames on a component's page. **On the list there is
nothing live to change,** so the panel there is for browsing, and says to open a component to see a change.

**T3: Adjust tokens in the same panel, seen live, written nowhere.** **First, the one cheap spike:** how far a changed
theme reaches the component styles built from the palette when the theme is created (`getFSVariantStyles(palette)`),
and the `8px` and `360px` values that ignore the theme. The answer is kept **for each token** and said on its row
("not used by every component"); the rest is a list for the Design System owner. Then each row gets the control its kind
says (decision 20), and a **Changed** group at the top lists what has been adjusted, with a reset for each and one for
all. A change builds a theme (MUI's `createTheme` over the library's `createFSTheme`) and passes it to `FSApp` in the
preview frames, so every card on a component's page moves at once, and **Reset** empties the list. No file is touched.

**T4: Try it on a branch.** Starts from `origin/develop` and makes a branch in the library as prototypes make theirs,
in a separate working copy, so the person's checkout is never touched. Saving writes the overrides list into the tone and
palette files as an exact text edit of the literal, read back and compared before it is kept, and each save is one
commit, so the branch's history is the list of iterations (and the History button can read it). The panel's foot gets **Save to branch**. The preview build runs
on the branch instead of `develop`.

**T5: Propose it.** A draft pull request from the branch through the existing share path (`share.ts`,
`shareTools.ts`), with the Chromatic link the library's CI already makes. Who reviews, and how comments come back, is
the editing plan's question (the library's pull requests go to the Design System owners, `CODEOWNERS`).

**T6 (candidate): Ask in words.** Words produce the same list, through the agent and the library's authoring standards;
nothing else changes. Built only if the controls leave a gap.

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
| **A theme change does not reach every component (T3)** | A colour control that moves some things and not others looks broken | Checked for each token before T3 is built, and said on the control for what does not follow; the hardcoded `8px` and `360px` are a library cleanup |
| **A token that quietly does not arrive** (Claude Design's own failure: the cards look right while tokens are missing) | A control that moves nothing, and is trusted | T3's spike and its note for each token, and a test that a changed value reaches a rendered component |
| **The reader finds nothing, or the wrong thing, in a library laid out differently** | An empty or misleading panel | It says "no tokens found" and where it looked. Layer 1 is FUI's only; the others come with a second library (decision 18) |
| **Writing a change into a source file breaks it (T4)** | A branch that does not compile | An exact edit of the literal, read back and compared before it is kept; the preview build runs on the branch, so a broken one shows at once |
| **A slider makes an unusable value** | Unreadable text, or a radius of nothing everywhere | Ranges come from the kind, with sensible bounds, and Reset is one press |
| **Building runs code** | Trust | The app's own esbuild and Sass run in its process, on a copy of `develop` taken out of git; the library's code runs only in the sandboxed preview view, which has no bridge to the app (`pageView.ts`), as prototypes do. The page's only message out is its height |
| **A build is slow or large** | A wait the first time, and disk | 5.5 s measured; built once per `develop` commit, in the background, with the old one removed. 7.3 MB a build |

## Next

**S1 to S3 and P0 to P2 are done,** with Storybook as the source of truth for what a component is (decision 17), and
stories responding as they should. **T1 and T2 are done (the tokens, read, in the panel). T3 (the controls, seen live) is next,** and waits for Noah to say so; T4 to T6 are laid out but not specified. P3 was dropped
(decision 10).

**By hand, Noah:** restart the dev session (the main process changed), open the Design System tab, and try a few
components: FSToggle and FSCheckbox (they switch), FSTabs (they move), FSPopovers' entries, FSSelect (the note about
what is not installed here, until `npm install` is run in the library), and Back.
