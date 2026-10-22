# Which way to work

There are two ways to turn an idea into something people can react to: a prototype, which is a page to explore and
discuss, and the code itself, which is what ships. They are for different moments, and the request you make decides which
your agent does.

## Choose

| You want to… | Do this |
|---|---|
| Explore a new idea, or a screen you are not sure of | Ask for a prototype: "Create a prototype of a history of alerts." See [A prototype, start to finish](prototype.md). |
| Share what you have been building with your agent, to get feedback | Say "make a quick prototype of this". See below. |
| Make a small change to something that already exists (a copy edit, a tweak) | Work in the code with your agent. A prototype of a change that small is more work than the change. |
| Turn a prototype everyone agrees on into real code | **Build in the codebase…** See [Working in the codebase](working-in-the-codebase.md). |
| Get finished code reviewed | Its pull request, and its preview link where the product has one. See [The handoff](the-handoff.md). |

The agent reads the words you use. "Prototype", "mock up" and "explore" start a prototype; "build it", "implement" and "in
the codebase" start code. If you say neither, it asks once, "Prototype or codebase?", and does not guess: a prototype where
code was wanted throws work away, and code where a prototype was wanted puts unreviewed changes in the product.

The panel lists prototypes, and the code work built from them. Changes you make in the code yourself leave nothing in
DSNR, so they do not appear there.

## Share what you have been building

1. Work with your agent in the product's code as you normally would.
2. When you want feedback, say "make a quick prototype of this".
3. The agent starts the prototype (it runs `dsnr new-prototype`) and:
   - writes a short brief from what you asked and decided in the conversation, not the conversation itself;
   - reads the uncommitted changes this conversation made, and builds what they show; other changes in your working tree
     are not part of it;
   - builds the page from the product's real components, with made-up data;
   - leaves your changes exactly as they are. It never reverts or commits them.
4. Share the prototype's link and collect comments. See [A prototype, start to finish](prototype.md).
5. To bring feedback back, ask the agent to address the open comments, which changes the prototype. To carry a change into
   your own code, ask the agent to make the same change there. To move the whole prototype into the product on a branch of
   its own, use **Build in the codebase…**, which needs a checkout with nothing uncommitted.

## Why it works this way

- A prototype is a new page, not a copy of your branch. It is made from the real components with stand-ins for what the
  product does not have yet, so what you built reaches it only as the agent carries it across.
- Only the brief is kept, so what you ask for is read by everyone who reviews the prototype. DSNR takes out secrets, email
  addresses and phone numbers from what it keeps, but it cannot tell a name from any other word: leave customers' and
  people's details out of what you ask for.
- Your working tree is yours. A prototype is built from what the agent reads, never by changing your files.
- Comments on a prototype change the prototype. It is not connected to your branch, which is why carrying a change back is
  a step you ask for.

## If something goes wrong

- *"Prototypes are built from the real design system, and … is not installed in …"* Run the product's install, as the
  message says, then ask again.
- *"This checkout is not on a branch, so say which branch to model it on."* Your checkout is detached. Tell the agent which
  branch the prototype should be modeled on.
- *The prototype left out a change of yours.* Only changes from this conversation are built in, on purpose. Tell the agent
  which other change belongs.
