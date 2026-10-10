# What DSNR learns, and how it is recorded

**Shared by every product.** Each product keeps its own evidence, rows only: an **agent gap log**
(`.dsnr/knowledge/agent-gaps.md`) and a **setup friction log** (`.dsnr/knowledge/setup-friction.md`). This file is how to write them, and what
the pilot measures against.

## The agent gap log

Every time DSNR gets something wrong, log it in the product's gap log. **That log decides which files and checks
get written**: add one when the log shows it is needed, not in anticipation. Log the small stuff too: a pattern of small
misses says more than one big failure.

| Column | What goes in it |
|---|---|
| Date | When it happened |
| What it got wrong | Concretely: wrong component, invented pattern, missed convention |
| Category | One of the four below |
| Would fix it | Which file or check, or "none: needs a different approach" |

**The category decides whether the answer is a document at all:**

| Category | Means | What fixes it |
|---|---|---|
| **missing context** | A file the agent needed was absent, wrong, or said the opposite of what it should | Write or correct that file |
| **missing runtime support** | The context was right, but nothing could run, build, or check the thing that failed | Add the command, check, or fixture, not another document |
| **design decision** | The standard and the product genuinely disagree, or the answer is a judgment call | A person decides. No file change until they do |
| **model behavior** | The context was there, correct and reachable, and the agent still erred | More files will not help. Clearer, shorter, or better-placed ones might |

**Two more tables belong in the same log:** component gaps (the design system lacks something: the product works around
it and says so, and the gap goes to the design system's repository as its `.dsnr/README.md` says) and version drift
(the agent used something the installed design system lacks).

## The setup friction log

What it actually took each person to get running, in the product's friction log. **Not the gap log:** that records
what the agent got wrong; this records what it took a human to reach the point where the agent could be used at all. One
row per person per attempt, successes included: a two-hour success is a finding.

| Column | What goes in it |
|---|---|
| Date | When |
| Who | Name, and whether a designer, an engineer, or the author of the setup |
| Trying to run | A prototype, the real app on mock data, or both |
| What it took | Elapsed time, and what consumed it: installs, versions, credentials, a missing checkout, asking someone |
| Got there? | Yes, yes with help, or no |
| Would it stop someone else? | Would a designer with no frontend background and nobody to ask have got through? |

**Record your own friction too.** The author of a setup is the worst judge of how hard it is, so those rows are the least
informative, but leaving them out makes the log look better than reality.

## Baselines

What today looks like, recorded **before** the workflow changes it, so there is something honest to compare against.
Measured after the fact, every number is a reconstruction, and a reconstruction flatters whatever was just built. Rough
is fine: "about two weeks, based on the last three" is usable; a precise number nobody can source is not.

| Measure | Today | How it was established | Date | Who |
|---|---|---|---|---|
| How long a comparable design decision takes, from request to something a stakeholder can react to | | | | |
| How often engineering has to re-ask what was intended, per handed-over design | | | | |
| How much rework a handoff currently causes, once implementation starts | | | | |

## The pilot's exit questions

Answered from the products' gap logs, not from impression:

1. Would a designer actually show these prototypes to a stakeholder?
2. How do the gaps split across the four categories? A pile of **missing context** means keep writing files; a pile of
   **model behavior** means stop, and make the existing ones clearer or shorter.
3. Did a second person resume work from its project folder alone?
4. Did engineering review find production coupling?
5. Did engineering rewrite the prototype from scratch?
6. Is local setup genuinely blocking anyone?
