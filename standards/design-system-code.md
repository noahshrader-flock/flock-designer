# Changing a design system's code

**When an agent changes a component's value in the design system's own source** (adjusting a component: a value written where
there is no literal to swap, or a component's own value made to follow a token). DSNR gives the facts (the component, the value,
its variant, the stories that draw it, what it draws now and what it should draw) and checks the result itself: it draws every
story with the change, and a change that does not draw as asked is not saved. These rules are what makes the change one the
design system's owners would write.

**Which wins:** the design system's own repository docs (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` and the like) on how its
code is written; then these.

## 1. Its own source only

Change the design system's source: its theme, its components, their styles. **Never** its stories, tests, docs, Storybook
set-up, generated files, or the packages it installs. A value that only a package sets is changed where the design system
already changes that package's styles (a theme's override of it), not in the package.

## 2. Written as its code writes such values

Use what the code already uses: its theme and the overrides it keeps there, its helpers (a spacing function, a size table), its
units. **A token is reached the way the code reaches theme values** (the theme object, the library's own way of saying "the
shared radius"), never by copying its value. A raw value only where nothing in the code gives it, and say so.

## 3. The smallest change that does it

Change what was asked, for the component and the variant asked: no reformatting, no renaming, nothing tidied on the way.

## 4. Say what else it touches

A place other components or variants also draw from (a shared override, a size table) is changed only when it is the only way,
and **always said**: DSNR shows everything a change moves, and the person decides with that in front of them.

## 5. Leave checking to DSNR

Install nothing, run no build or test, commit nothing: DSNR draws the stories with the change and reads the value back. When it
does not draw as asked, DSNR says what it drew instead, once; find why, and fix it under the same rules.

## 6. Say what was done

End with two lines: `Changed: <file>:<line>, …` and `Why: <one sentence>`. They are what the person reads beside the change.
