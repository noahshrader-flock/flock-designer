<!-- dsnr:accessibility v1 -->
## Accessibility: integration-credentials v1's page

Measured 2026-10-21 with axe-core 4.14.0 at WCAG 2.0 Level A, and the probe at light, at build depth, by `dsnr accessibility`. Written from `projects/integration-credentials/accessibility/v1.ledger.json`: run it again rather than editing this. Automated checks are never a pass: each "measured" says only that none was found of what was measured. Each check is still a person's to make, with the last column what is left of it; the reviews record its outcome, and why when it was not run.

| # | Check | Measured | A person checks |
|---|---|---|---|
| 1 | Keyboard reachability | 2.1.1 Keyboard: not run, because keyboard-reach, in success: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; keyboard-reach, in large: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; keyboard-operate was not run in this measure (at light, at build depth) | the whole check |
| 2 | Tab order | 2.4.3 Focus Order: not run, because focus-order, in success: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; focus-order, in large: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them<br>2.1.2 No Keyboard Trap: not run, because keyboard-trap, in success: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; keyboard-trap, in large: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them | whether a mismatch matters |
| 3 | Focus visibility | 2.4.7 Focus Visible (above the target): found (probe focus-visible, in default: 1 finding)<br>2.4.11 Focus Not Obscured (Minimum) (above the target): not run, because focus-obscured, in success: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; focus-obscured, in large: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them | indicator is clear |
| 4 | Focus management | No machine measures it here | the whole check |
| 5 | Accessible names | 4.1.2 Name, Role, Value: not run, because name-role-value, in success: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; name-role-value, in large: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them<br>1.1.1 Non-text Content: measured, none found by axe<br>2.5.3 Label in Name (above the target): left to check by hand | names make sense; state is exposed; what axe flagged to review (aria-valid-attr-value, aria-hidden-focus); alt text is meaningful; decorative vs informative; visible label against name |
| 6 | Heading structure | 1.3.1 Info and Relationships: measured, none found by axe and probe<br>2.4.6 Headings and Labels (above the target): left to check by hand<br>best practice, beside WCAG: heading-order: 1 element | markup carries what the layout shows; headings and labels describe their content |
| 7 | Status announcement | 4.1.3 Status Messages (above the target): not run, because status-messages was not run in this measure (at light, at build depth) | message is worth announcing |
| 8 | Non-color signals | 1.4.1 Use of Color: not run, because color-only was not run in this measure (at light, at build depth) | state still readable |
| 9 | Error messages | 3.3.1 Error Identification: not run, because error-identification was not run in this measure (at light, at build depth)<br>3.3.3 Error Suggestion (above the target): left to check by hand | the message is clear; error says how to fix it |
| 10 | Reduced motion | No machine measures it here | the whole check |

### The other criteria at the target

- 1.3.2 Meaningful Sequence: not run, because reading-order was not run in this measure (at light, at build depth)
- 2.2.1 Timing Adjustable: not run, because timing was not run in this measure (at light, at build depth)
- 2.2.2 Pause, Stop, Hide: not run, because pause-stop-hide was not run in this measure (at light, at build depth)
- 2.3.1 Three Flashes or Below Threshold: not run, because flashing was not run in this measure (at light, at build depth)
- 3.2.1 On Focus: not run, because on-focus, in success: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them; on-focus, in large: the page has more than 60 Tab stops: the first 60 were measured, and none of these was found in them
- 3.2.2 On Input: not run, because on-input was not run in this measure (at light, at build depth)
- Measured, none found: 1.2.1, 1.2.2, 1.4.2, 2.4.1, 2.4.2, 2.4.4, 3.1.1, 3.3.2.
- Does not apply here: none.
- A person's alone (no automated measure reaches them): 1.2.3, 1.3.3.

Above the target (readiness, not counted as it): 2.4.7 found.
<!-- /dsnr:accessibility v1 -->
