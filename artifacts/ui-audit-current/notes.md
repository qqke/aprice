# Mobile UI Audit Notes

## Evidence

- `home-mobile.png`: home search, result placeholder, nearby comparison, feature links.
- `login-mobile.png`: email/password login, mode switching actions, account status.
- `scan-mobile.png`: camera scan, manual barcode input, scan result.
- `me-mobile.png`: logged-out personal center and quick price logging form.

## Step Health

1. Home search: fair. Search is prominent, but hero copy and decorative spacing make the first task taller than needed.
2. Search results: fair. Empty state is clear, but the fixed bottom nav interrupts the results/nearby transition.
3. Nearby comparison: weak on mobile. Map, selected product, and price list compete in one long section.
4. Login: fair. Core fields are clear, but secondary actions and status blocks create too many stacked buttons.
5. Scan: fair. Camera action is obvious, but manual input and result are pushed below the fixed nav.
6. My page quick log: weak. Too many form controls appear at once for a mobile-first price-recording flow.

## Recommended Changes

1. Make mobile home a two-action screen: search box plus scan shortcut. Move tips and feature cards below results.
2. Keep bottom nav, but add stronger bottom spacing around all primary actions and result sections.
3. Replace the home "nearby comparison" long panel with a collapsed preview until a product is selected.
4. Simplify login actions: primary login button, then small text buttons for register/reset instead of full-width button stack.
5. Split "quick record" into a progressive flow: product, store, price. Keep note and favorites secondary.
6. Reduce visual weight: fewer gradients, less shadow, smaller hero titles on utility pages.
7. Do not add shadcn yet. This Astro app has no React layer; use existing CSS and native controls first.

## Accessibility Risks From Screenshots

- Some placeholder-only fields need persistent labels or visible context once filled.
- Fixed footer may obscure focused inputs when the mobile keyboard opens.
- Very large headings can reduce visible task area for screen magnification users.
- Disabled-looking logged-out controls on `me` should make required login state explicit before interaction.

## Limits

- Screenshots do not prove keyboard focus order, screen reader output, camera permission behavior, or real Supabase error states.
