# Mobile home redesign QA

- Source visual truth: `C:\Users\GIGAp\.codex\generated_images\019f4ed0-bf44-7bb2-9735-c1132abf15f1\exec-1ae908ce-e873-484b-932b-45c80c582e1e.png`
- Implementation screenshot: `C:\work\aprice\artifacts\home-scan-mobile-redesign.png`
- Viewport: 390 × 844
- State: logged out, initial homepage
- Full-view comparison: both source and implementation were opened together for visual review.
- Focused comparison: not needed; the screen has one above-the-fold composition and all key controls are legible in the full view.

**Findings**

- No actionable P0/P1/P2 differences. The scanner-first hierarchy, large primary scan target, manual search field, utility links, and fixed three-item navigation are present.
- Expected deviation: the active navigation item remains 首页 on the homepage instead of making 扫码 active as in the concept. This preserves the existing route state and the user's no-logic-change constraint.

**Required fidelity surfaces**

- Fonts and typography: strong two-line headline, compact supporting copy, and readable 16px search text match the intended hierarchy.
- Spacing and layout rhythm: the primary scan target is centered in the thumb zone; the search and utility actions have clear separation and do not clip at 390px.
- Colors and visual tokens: warm ivory base, cobalt primary action, navy display text, and low-contrast dividers are consistent.
- Image quality and asset fidelity: the generated pharmacy-goods hero image is crisp and used as the decorative background; existing brand and scan SVGs were retained rather than replacing product behavior.
- Copy and content: labels preserve the actual product routes and search meaning.

**Interaction evidence**

- `node tests/home-page-browser.test.mjs` passed after the redesign; search, nearby-price state, state restoration, auth fallback, and mobile input focus are intact.

**Follow-up polish**

- P3: add bespoke bottom-navigation icons only if an existing icon asset set is approved; the current text navigation preserves the established route semantics.

final result: passed
