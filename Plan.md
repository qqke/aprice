# Aprice (搜比价) UI/UX Usability Improvement Implementation Plan

This plan details technical changes to improve the usability, readability, responsiveness, and accessibility of the Aprice application based on the recent UX audit. The goal is to make the interface more professional, intuitive, and accessible while ensuring 100% test coverage and functionality.

## User Review Required

> [!IMPORTANT]
> The changes proposed below will modify core navigation behaviors and search styles. Please review the following key decisions:
> - **Navigation Deduplication:** Mobile navigation will now rely solely on the bottom sticky bar (`.footer__links`), and the redundant top navigation burger toggle (`.nav-toggle`) and expandable menu will be hidden.
> - **Immediate Search:** Typing in the search input on the home page will automatically trigger results after a 300ms debounce once 2 or more characters are entered.
> - **Minimum Font-Sizes:** The minimum font size will be bumped to 12px (`0.75rem`) to ensure Chinese characters remain fully readable on all devices.

## Proposed Changes

We will group our modifications logically by component:

---

### 1. Style & Theme Foundation

We will optimize typography, contrast, accessibility, and visual feedback states globally in `global.css`.

#### [MODIFY] [global.css](file:///c:/work/aprice/src/styles/global.css)

- **Contrast Enhancement:** Bump contrast parameters for `--muted` and `--muted-strong` on both home and inner pages:
  - From `--muted: rgba(16, 35, 61, 0.62)` to `rgba(16, 35, 61, 0.72)`.
  - From `--muted-strong: rgba(16, 35, 61, 0.84)` to `rgba(16, 35, 61, 0.88)`.
- **Deduplicate Mobile Nav:** Add a media query rule at the bottom/responsive section of `global.css` to hide `.nav-toggle` and `.mobile-nav` on viewports `<= 720px`.
- **Active Navigation States:** Add strong active navigation styles for the footer bar so the current page is clearly distinguished:
  ```css
  .footer__links a[aria-current="page"] {
    font-weight: 800;
    background: rgba(42, 109, 245, 0.12);
    box-shadow: inset 0 -3px 0 var(--accent);
  }
  ```
- **Font-Sizes Bump:** Find all occurrences of small font-sizes below `0.75rem` (such as `0.64rem`, `0.68rem`, `0.72rem`) and increase them to a minimum of `0.75rem` (12px), specifically `.brand__tag`, `.brand__name` (bump to `0.88rem`), sub-hints, eyebrow labels, and statuses.
- **Touch Targets:** Ensure `.home-map__marker` is at least `36px` to meet the mobile touch target guidelines.
- **Feedback States:**
  - Introduce `.home-loading::after` spin animations for dynamic searches.
  - Introduce `.notice--success` (greenish background/border/text) and `.notice--error` (reddish background/border/text) styles to replace the generic white-and-gray notice styling.

---

### 2. Homepage & Interactive Search Component

We will optimize the homepage layout, introduce debounced immediate search, and improve visual hierarchy.

#### [MODIFY] [index.astro](file:///c:/work/aprice/src/pages/index.astro)

- **Debounced Instant Search:**
  - Add an `input` event listener to `#home-search`.
  - Introduce a 300ms debounce wrapper before running the query (`runSearch()`), triggering only when value length is at least 2 characters.
  - Retain the manual search button/submit logic as a fallback.
- **Collapsible Nearby Panel:**
  - Add an expand/collapse toggle button next to the "附近比价" (Nearby comparison) panel header.
  - Store the collapsed state in local state/session memory to persist user preference.
- **Dynamic Loading State:**
  - Append the `.home-loading` class during async searches so a CSS-based spinner appears naturally.

---

### 3. Auth Form Labels & Transitions

We will improve the usability of the login screen by ensuring inputs have persistent, clear labels instead of relying solely on disappearing placeholders.

#### [MODIFY] [login.astro](file:///c:/work/aprice/src/pages/login.astro)

- **Persistent Visual Labels:**
  - Add a visible label title inside each field wrapper using a `<span class="field__label">` so the user knows what the field is even when typing has begun and placeholders are hidden.
  - Modernize layout margins to support the added label heights.

---

### 4. Personal Dashboard Layout ("My" Page)

We will improve the information architecture and action semantics on the `me` (profile) page.

#### [MODIFY] [me.astro](file:///c:/work/aprice/src/pages/me.astro)

- **Semantics for Actions:**
  - Style dashboard quick-record buttons with subtle prefix markers or distinct colors (e.g. outline/solid styling) to clearly distinguish between primary "Save" operations and "Favorite" toggles.
- **Dashboard Visual Hierarchy:**
  - Ensure high-frequency panels (like "快速记录" and "个人价格记录") default to `open` (open attribute set on details).
  - Low-frequency panels default to closed, styled with lighter border-colors for clear visual distinction.

---

### 5. Camera Scan Layout & Accessibility

We will streamline the QR/Barcode scanning flow and improve screen reader support.

#### [MODIFY] [scan.astro](file:///c:/work/aprice/src/pages/scan.astro)

- **Streamlined Camera Actions:**
  - Automatically hide the "启动相机" (Start Camera) button once the camera is successfully initialized and running.
  - Style auxiliary controls ("停止" and "识别当前帧") as smaller, elegant ghost buttons on top of the camera overlay.
- **A11y Tagging:**
  - Add `aria-label="相机扫码预览"` and `role="img"` to the `<video id="camera">` element to make it visible to assistive technologies.

---

## Verification Plan

### Automated Tests
- Build the project using `npm run build` and run all tests with `npm run test` to verify no regressions in router, state synchronizer, or auth middleware.
- Create or adapt smoke tests specifically validating changes if necessary.

### Manual Verification
- Verify the mobile navigation layout behavior using standard responsive design rules.
- Test debounced instant search behavior in real-time, observing the CSS spinner feedback.
- Confirm notice styling colors and login label layouts.
