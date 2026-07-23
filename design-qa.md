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

## Blueprint receipt scan redesign

- Source visual truth: `C:\Users\GIGAp\.codex\generated_images\019f7daa-a631-78a0-b730-008b2e07edb1\call_EPU41ynokVeEyebLBXf01HkW.png`
- Implementation screenshot: `C:\work\aprice\artifacts\design-exploration-2026-07-23\implementation-blueprint-mobile-pass-3.png`
- Comparison image: `C:\work\aprice\artifacts\design-exploration-2026-07-23\comparison-pass-3.png`
- Viewport: 390 × 844 requested; in-app content capture measured 375 × 812 because browser chrome consumed 15 × 32 pixels.
- Density normalization: source 853 × 1844 resized to 390 × 844; implementation padded to 390 × 844 without scaling.
- State: logged out, initial scanner state, camera not yet granted.
- Full-view comparison: source and implementation were normalized and combined side by side in `comparison-pass-3.png`.
- Focused comparison: not needed; headline, scanner viewport, JAN input, result heading, and bottom navigation remain legible in the combined full-view comparison.

**Comparison history**

- Pass 1: P1 density mismatch. The implementation showed only the hero and scanner above the fold; manual JAN entry and results were pushed below it.
- Fix: reduced hero type scale and spacing, changed the scanner to a 1.45:1 receipt proportion, removed inherited panel padding, and compressed the manual-entry rhythm.
- Pass 3: the scanner, manual entry, results heading, and active bottom navigation are visible in the first viewport with no horizontal overflow.

**Required fidelity surfaces**

- Fonts and typography: heavy cobalt Chinese headline, compact receipt metadata, and restrained utility copy reproduce the source hierarchy with system CJK fallbacks.
- Spacing and layout rhythm: full-width scanner, thin receipt rules, dense form controls, and fixed navigation match the source composition.
- Colors and visual tokens: warm paper, cobalt ink, deep-blue scanner, and chartreuse action are consistent and accessible.
- Image quality and asset fidelity: generated 960 × 720 WebP barcode artwork is used only before camera activation; the real video replaces it after permission is granted.
- Copy and content: existing functional copy, routes, form fields, and result behavior are preserved.

**Interaction evidence**

- Empty JAN submission displayed `请输入条码。`.
- Browser console warnings/errors: none.
- Camera permission was not accepted during visual QA; existing automated scanner regression remains the functional check for camera controls.

**Follow-up polish**

- P3: the source mock includes a decorative pharmacy stamp and crop marks. They were omitted to avoid non-functional UI decoration and custom CSS art.
- P3: the mock shows a sample product result; the implementation correctly keeps the real empty state until a barcode resolves.

final result: passed

## Scan and account follow-up

- Source visual truth: the selected scanner-first mobile direction above.
- Implementation screenshots: `C:\work\aprice\artifacts\scan-mobile-redesign.png` and `C:\work\aprice\artifacts\me-mobile-redesign.png`
- Viewport: 390 × 844
- State: logged out; scan page initial camera state and account gate state.

**Findings**

- No actionable P0/P1/P2 differences. The scan page makes the camera preview and start action primary, while manual JAN entry remains immediately below.
- No actionable P0/P1/P2 differences. The account page keeps the existing auth gate but gives it a focused, single-action presentation.
- Expected deviation: account-specific data panels remain hidden until login, as required by the existing auth behavior.

**Interaction evidence**

- `node tests/scan-page-browser.test.mjs` passed.
- `node tests/me-page-browser.test.mjs` passed.

final result: passed
