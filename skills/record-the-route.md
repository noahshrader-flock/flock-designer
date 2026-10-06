# Record where the work is

**Shared by every product.** Nothing here names a product's routes or tools.

When you build or change a view on a **codebase** iteration — work on a `feature/<project-id>` branch
that runs inside the real product — record where that work is, so Flock Designer opens on it instead
of wherever the product happens to start.

Without this, opening the iteration lands on the product's front door and the designer has to find
the change themselves. That has already put a comment on a page the iteration never touched.

## What to write

In the design repository, `projects/<project-id>/iterations.json`, on this iteration's entry, add a
`route`: the path within the running app where the work is reached.

```json
{
  "name": "codebase",
  "branch": "feature/role-comparison",
  "route": "/roles/compare"
}
```

- **A path within the app, nothing more.** `/roles/compare`, or `/roles/compare?state=error` to land
  on a particular state. Never a full address, a host or a scheme: the app joins it onto whatever
  address the preview is serving on, and anything that would leave that address is ignored.
- **The plainest form of the route.** Where a route has both a plain and a nested form
  (`/roles/compare` and `/organization/:id/roles/compare`), record the one with no parameters in it.
  A path with an unfilled `:id` in it does not load.
- **Where the work begins.** For a flow over several pages, record the first page of the flow, not
  the middle of it.

## When to write it

- **New work:** when the view first loads, as part of building it.
- **Existing work:** if you change where a view is reached, update the route in the same commit.
- **Prototypes** (`fd/<project-id>/iN`) do not need one: they serve one prototype, which already
  opens on itself.

If you cannot tell which route is right, leave it out and say so. A wrong landing place is worse than
none: none opens where it always did.
