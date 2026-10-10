# DSNR manifest — Coke (the accessibility section, as on noah/dsnr, 2026-10-10)

## Accessibility conformance target

**This is the single source of truth for this repo's target.** Other files reference it; none
restate it.

| | |
|---|---|
| **Target** | WCAG 2.0 Level A |
| **axe tags** | `['wcag2a']` |
| **Enforced by** | `cy.checkPageA11y()` — `cypress/support/commands.js:58` |
| **Coverage** | Pages under Cypress E2E |

## Stack

| | |
|---|---|
| Tests | Vitest, Cypress + cypress-axe |
