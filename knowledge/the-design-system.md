# The design system

The Design System tab shows the product's design system as the product uses it: every component with its stories, and every
token. It is also where you try a change to it (a color, a spacing, a component's padding), see that change across every
component, and propose it to the design system's team as a pull request.

## Which design system you see

DSNR shows the design system the product uses, found in this order:

1. one you chose for this product, with **Choose design system…**;
2. the package the product names, inside its own repository;
3. its clone beside the product, checked to be the real source of the installed package (see
   [The shapes a product can take](product-shapes.md));
4. with none of those, any other folder open in the window that holds stories or tokens.

The tab's menu (the ⋯ beside its name) has **Sync with GitHub**, to read the latest of the design system's main branch,
**Primitives**, **Voice and Tone**, and **Choose design system…**. The branch it shows is the icon after its name; hover it
to see which.

## Choose another design system

**Choose design system…** names the one in use and where it came from, then offers the others DSNR has seen on this
computer, **Choose a folder…** to pick any folder, and, once you have chosen one, **Use the product's** to go back. Use it
to try a fork, or a branch a colleague is working on.

The choice is kept on this computer, for this product only. Everything reads the one chosen: the tab, the guidance a
prototype is built with, the voice and tone, and codebase work. Choosing another clears what you were trying on the old
one, and closes its tabs. The picker says so first.

## Look around

- **Components** lists every component, by group, as cards or a list, with a search. Pressing one opens its own tab, with its
  stories running live. Beside them are its styles (each value it sets, as an inspector), the tokens it draws with, and
  an accessibility check of its stories. Each card's menu has **Open in Storybook**, which asks once where the Storybook
  is published, and **View on GitHub**.
- **Tokens** lists every token by kind: colors, spacing, shape, type and more, with each one's value and where it is
  defined.
- **Primitives**, from the menu, shows the design system's raw scales (its palette, its spacing steps) side by side.

## Try a change

You can try a change before anyone else sees it:

- *A token*: press it in **Tokens**. Colors, spacing and corner radius can be changed: pick another step of the scale, or a
  custom value. The editor shows the contrast with its partner color and which components draw with it.
- *A component's own value*: in its tab, change a value in its styles (its padding, its gap, a color).

The change is tried at once, in the stories of every component tab open and in **Primitives**, so you see everything it
moves. A count of the changes being tried, and of the components edited in your code (below), appears beside the design
system's name; pressing it opens **Changes**, the list of everything you are trying, grouped by tokens and by component.

Changes you are trying are kept only while VS Code is open, and nothing is written to the design system until you save.

## Save it, then propose it

From **Changes**, each group (the tokens, or one component's values) has its own buttons:

1. **Save to a branch** saves the change to a new branch of the design system (its name starts with `dsnr/`). Nothing in
   your checkout of the design system is touched: DSNR writes the branch directly. After the first save, the button is
   **Save**.
2. **Propose** pushes that branch and opens a draft pull request for the design system's team, with your own GitHub
   sign-in. Its link appears in **Changes**, with the design system's own preview once its checks have built one.
3. **Start over** forgets the change here. The branch and any pull request stay on GitHub.

## Have the agent write it

Some changes are better made in the component's code than as a value: a new variant, a token used in a new place.
**Process changes** hands what you are trying to your agent, which makes a branch of the design system, writes the change
properly in code, and commits it. It does not push.

When it is done, **Preview this branch** shows the agent's branch in every DSNR page, so you can check its work. While it is
shown, saving, proposing and processing other changes wait. Go back to the main branch with the button on the note at the
top. Then **Propose** sends it. DSNR flags a branch that is large or touches files the rules keep out (tests, build
settings, lockfiles), and asks before proposing it.

The design system's checkout must be clean for this, because the agent works in it.

## Edits in your own code

When you change the design system's code yourself, by hand or with an agent of your own, **Changes** lists it under
**Edited in your code**: each component you changed with its files, the files in no component's folder, and the files
outside the design system, which stay in your branch. A file is a component's when it is in the folder of its stories. It
is read from git every few seconds while the panel is open, against where your branch left the design system's, so
others' work on it adds nothing. **Moved by these edits** draws every component with your edits, as a token change is
drawn. Nothing in your checkout is changed: this only shows.

## Voice and tone

**Voice and Tone**, in the menu, opens the design system's guide to how the product speaks. Every agent task includes it.
Edit it like any document and save: it is saved to a branch of its own, and proposed from the editor's title bar. If it
changed on GitHub while you were editing, DSNR asks before overwriting.

## Your changes and prototypes

Prototypes are always built from the design system the product has installed, never from a clone with changes in it. So a
change you are trying shows in the components' own stories here, and reaches prototypes once it is merged and the product
installs the new version. That way a published prototype never shows something that has not been agreed.

## Why it works this way

- *Try before you change.* Seeing a token move across every component, before anything is saved, is the cheapest way to
  find out what a change really does.
- *One pull request per change.* The tokens and each component's values are proposed separately, so each is small enough to
  review.
- *Your checkout is left alone.* Saving writes a branch without touching your files, so you can keep working while a change
  waits for review.

## If something goes wrong

- *"No design system found."* DSNR could not find the package the product names, or its clone. Open the clone beside the
  product, or use **Choose design system…**.
- *"… is not … 's source"* (a clone beside the product is refused). It is another package, or a fork. Use the real clone,
  or choose the fork on purpose with **Choose design system…**.
- *"… has moved since DSNR last saved to it, so nothing was saved."* Someone changed the branch. Start over to save it on
  the latest.
- *"In the design system's checkout, N files are changed or new and not committed."* Commit or stash them, then process the
  changes again.
