# The shapes a product can take

Every company organises its code differently. DSNR works with three shapes, and finds what it needs in each without you
telling it where to look, as long as the product's workspace file names its design system's package.

## A product in its own repository, with the design system in another

This is Flock's shape: the product (`flock-coke`), the design system (`flock-react-component-lib`) and the design
repository (`flock-designer`) are three repositories, cloned side by side in one folder on your computer.

*What you do:* clone all three into the same folder, and open the product in VS Code with the other two beside it.

*How DSNR finds them:* the workspace file says `"designSystem": { "package": "@flocksafety/flock-react-component-lib" }`.
DSNR looks beside the product for a folder named like that package (`flock-react-component-lib`), and for the design
repository by its name (`flock-designer`).

*Why DSNR checks the clone:* a folder beside the product could be anything: an old copy, a fork, someone else's
experiment. Before it builds anything from it, DSNR checks that it really is the source of the package the product has
installed: the same package name, the same repository on GitHub, and a release tagged with the version that is
installed. When it cannot be sure (no release tag, say), it asks you once, with **Use it** and **Not this one**, and keeps
your answer until the clone or the installed version changes. A clone that is plainly something else (another package, a
fork) is refused, and DSNR says why.

## A monorepo: the design system is a package inside the product's repository

Some companies keep everything in one repository, with the design system as one package among several (for example in
`packages/ui`).

*What you do:* nothing extra. Open the repository.

*How DSNR finds it:* it looks through the repository's `package.json` files, up to four folders deep, for the package with
the name the workspace file gives. It goes by that name alone, never by what a folder looks like, and it never looks in
`node_modules`, so an installed copy is never mistaken for the source. If two packages share the name, the workspace file
can say which folder with `"folder"`.

*What is different:* a design system inside the product is the product's own code, so DSNR does not ask whether it is the
real source: it is.

## A repository that is its own design system

CHEQ's Paradome is one repository that is both the product and its component library: there is no separate package.

*What you do:* nothing extra. The workspace file names the repository's own package (Paradome's is `paradome-client`),
and DSNR finds it at the root.

*One thing to know:* because the product and its design system are the same folder, a change to a component and work
on a feature share one checkout. DSNR keeps them from mixing: it will not start one while the other has uncommitted
work, and when it refuses, it says that the two share the checkout.

## The design repository, in every shape

A product belongs to a design repository: Flock's (`flock-designer`) unless its workspace file names another, as
`"designRepository": "owner/repo"`. DSNR looks for its clone beside the product, under its name. If you keep it somewhere
else, run **DSNR: Locate the design repository** and pick the folder: DSNR remembers it on this computer.

## Choosing a different design system

You can point a product at another design system, to try a fork or a branch someone is working on: **Choose design system…** in the Design
System tab's menu. [The design system](the-design-system.md) explains it. The choice is kept on
this computer, for that product, and **Use the product's** goes back.

## One window, one product

A VS Code window works on one product at a time, with its design system and design repository. To work on two products,
open two windows. Each reads its own product's design system and design repository, and neither sees the other's.
