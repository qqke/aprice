# Live Mobile Audit Notes

Target: `https://outlets.stbf.online/`
Viewport: iPhone 13 mobile profile.

## Evidence

- `01-home-before-login.png`: deployed home before login.
- `02-login-empty.png`: deployed login page initial state.
- `03-login-filled.png`: login form filled before submission.
- `04-after-login-submit.png`: login blocked by Cloudflare Turnstile.
- `05-me-after-login-attempt.png`: `me` page after blocked login attempt.
- `06-scan-after-login-attempt.png`: scan page after blocked login attempt.

## Step Health

1. Home before login: fair. Search is obvious, but bottom nav cuts into the transition between search results and nearby comparison.
2. Login empty state: weak. The fixed bottom nav overlaps the login area, and Cloudflare is visually close to the primary submit action.
3. Login filled state: weak. Password entry is fine, but Turnstile plus bottom nav makes the submit area feel blocked.
4. Login submit: blocked. Cloudflare requires human verification, so the provided credentials could not complete login in automation.
5. My page logged-out state: weak. The page shows logged-out gate and disabled-looking inputs, but the quick record form still dominates the screen.
6. Scan page logged-out state: fair. Main scan CTA is clear, but manual input/result areas are pushed down and intersect with fixed nav spacing.

## Findings

1. Fixed bottom nav needs more avoidance space. It overlaps or visually interrupts login, scan, and quick-record sections.
2. Login should treat Turnstile as part of the primary flow. The verification box, error text, and submit button should remain visible together without the footer covering them.
3. Login page has duplicate supporting copy: "登录后保存价格与收藏。" appears twice, adding height without helping.
4. Utility pages use too much hero scale. Login, scan, and my page headings consume the first screen before the user reaches the task controls.
5. My page should not expose the full quick-record form while logged out. Show the login gate first, then reveal form after login.
6. Scan page should place manual barcode input above or beside the camera fallback status on mobile, because camera support often fails in browser/headless contexts.
7. shadcn is still not the shortest fix. The issues are layout, information hierarchy, and fixed-footer spacing, not missing component primitives.

## Accessibility Risks From Screenshots

- Footer overlap can hide focused controls when the keyboard opens.
- Turnstile failure text may not be enough if the checkbox is out of view or hidden behind fixed UI.
- Placeholder-heavy form fields need persistent labels for filled and error states.
- Disabled-looking logged-out controls should not be focusable unless they explain the login requirement.

## Limits

- Login could not complete because Cloudflare Turnstile required manual verification.
- Logged-in-only states such as real personal records, favorites, and authenticated price submission were not audited.
