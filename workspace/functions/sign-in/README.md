# Sign-in function

Trades a published prototype page's one-time GitHub `code` (and its PKCE `verifier`) for the person's access token. It is the one
thing signing in to comment needs a server for: GitHub's token endpoint does not accept calls from a web page. It stores nothing,
logs nothing, and returns the access token only, never the refresh token. The design is in `PUBLISHED_COMMENTS_PLAN.md` (Phase 1).

`POST /api/exchange` with `{ "code": "...", "verifier": "..." }` (exactly those two) answers
`{ "access_token", "token_type": "bearer", "expires_in" }`, or `{ "error": "origin" | "method" | "size" | "shape" | "refused" |
"unreachable" | "misconfigured" }`.

## Deploy it to Vercel (a test)

1. **A throwaway GitHub App** (GitHub → Settings → Developer settings → GitHub Apps → New): callback URL
   `https://noahshrader-flock.github.io/flock-designer/`, **Request user authorization (OAuth) during installation** off, expire user
   tokens **on**, webhook **off**, permissions: Issues read and write, Contents read. Install it on the design repository. Note the
   **Client ID**, and generate a **client secret**.
2. **A Vercel project** whose root directory is `workspace/functions/sign-in`. No build command, no framework.
3. **Environment variables** (Production):

   | Name | Value |
   |---|---|
   | `GITHUB_CLIENT_ID` | the App's client ID |
   | `ALLOWED_ORIGIN` | `https://noahshrader-flock.github.io` (the site's origin: no path, no trailing slash) |
   | `REDIRECT_URI` | `https://noahshrader-flock.github.io/flock-designer/` (exactly the App's callback URL) |
   | `GITHUB_CLIENT_SECRET` | the secret, **if** GitHub requires it with PKCE (Phase 1.2 finds out; try without first) |

4. Deploy, then check it answers: `curl -i -X OPTIONS -H 'Origin: https://noahshrader-flock.github.io' https://<project>.vercel.app/api/exchange`
   should say `204` with `access-control-allow-origin` set; the same without that `Origin` says `403`.

Use it for the Phase 1.2 checks (does PKCE alone work, is the re-sign-in quiet, does single sign-on give a working token), signed in
as yourself only. **The shipped one belongs under the company's account** (Phase 1.3), since it handles people's tokens.

It is GitHub's. A GitLab twin is the same shape with GitLab's token endpoint (the GitLab plan, Phase 7).
