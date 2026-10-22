# Requests: integration-credentials v1

What was asked for this version, in the person's words, in the order it was asked. Secrets, email addresses and phone numbers are taken out before it is kept; anything else that should not be shared does not belong in a request.

## 2026-10-21 · Noah Shrader

> Replace the Export CSV experience on the Integrations page with an in-browser Show Credentials modal where users can view and copy integration credentials (device, username, password) without downloading a file. Keep Credential Expiration and IP Allow List fields. Support many devices, search, copy one or all, and loading, empty, error and success states.

## 2026-10-21 · Noah Shrader

> Fix the layout flaws found when the page was evaluated, in v1, in place. The helper text under the Credential Expiration select touches its border. The dialog changes width between the form, loading and results; keep one width for every step and state. Hostnames break in the middle of a word. The block above the table (notice, summary chips, explanation, filters, count) leaves too little room for it: at 1280 by 900 the table must show its header and at least five rows. Each row repeats three icon buttons; keep at most two icon actions a row. The footer buttons sit past the content's edges. At 800 wide the table is cut off. The caution about earlier credentials is said on the first step and again on the last; say it once.
