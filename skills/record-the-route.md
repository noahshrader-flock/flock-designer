# Record where the work is

**Shared by every product.** Nothing here names a product's routes or tools.

When you build or change a view in **codebase work** — work on a `feature/<project-id>` branch
that runs inside the real product — record where that work is, so DSNR opens on it instead
of wherever the product happens to start.

Without this, opening the work lands on the product's front door and the designer has to find
the change themselves. That has already put a comment on a page the work never touched.

## What to write

In the design repository, `prototypes/<project-id>/work.json`, on the `codebase` entry, add a
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
- **The plainest form of the route, never a route pattern.** Where a route has both a plain and a
  nested form (`/roles/compare` and `/organization/:id/roles/compare`), record the one with no
  parameters in it. A pattern is what a router matches against; as an address, `:id` is taken
  literally and matches nothing. DSNR refuses a route containing `:id`, `{id}` or `*` and
  opens where it would have anyway, so a pattern here means the landing route simply does nothing.
- **Check it loads.** Open the route in the running app before recording it. If it redirects --
  a permission the mock user does not have, a guard, a parameter it needs -- it is not a landing
  place; record the nearest page that does load, or leave it out.
- **Where the work begins.** For a flow over several pages, record the first page of the flow, not
  the middle of it.

## When to write it

- **New work:** when the view first loads, as part of building it.
- **Existing work:** if you change where a view is reached, update the route in the same commit.
- **Prototypes** do not need one: each version is one page, and already opens on itself.

If you cannot tell which route is right, leave it out and say so. A wrong landing place is worse than
none: none opens where it always did.
