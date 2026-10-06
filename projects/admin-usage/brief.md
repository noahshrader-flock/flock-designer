# Admin Usage

Add a new tab called "Usage" to the Organization page, after the last existing tab in the tab bar.

The tab is new, not a variation of an existing one. Use the existing tabs only for the frame: the page header, the tab bar, spacing, and the product's own components. Do not reuse the layout or content of any current tab.

Build it inside the whole app as a person really sees it: the full top bar and navigation as they appear in the product, not just the page.

What it's for: showing how each role is actually being used, so an admin can decide which roles to clean up.

Who uses it: an org admin with around 200 people to look after and far too many roles.

What it shows and lets them do:
- a usage chart per role over the last 90 days
- a list of roles nobody has used in 90 days, with a bulk archive action
- a side panel that opens when you pick a role, showing who holds it

States: default, empty, loading, and archiving a role that is still assigned to 40 people.

Open question I want to react to: should "unused" just be a filter on the Roles list, or does it earn its own tab?
