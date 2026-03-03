# Responsiveness audit

**Date:** 2025-03  
**Scope:** Dashboard (track), Device pages, Admin dashboard. Layout + responsiveness only; no new styling system; reuse existing design tokens and `web/app/globals.css`.

**Styling system:** Global CSS only (no Tailwind, CSS Modules, styled-components, or MUI). Design tokens in `:root`: `--content-max: 1200px`, `--page-pad` (16px / 24px @600 / 32px @960), `--radius`, `--radius-sm`, `--surface`, `--border`, etc.

---

## 1. Problem components

| Component / class | Issue |
|-------------------|--------|
| `.device-view-map-wrap` | Fixed height `280px` / `340px` @600 – not fluid; can feel cramped on small laptops. |
| `.device-view-grid` | At 720px: `grid-template-columns: 1fr 320px` – fixed 320px sidebar can cramp at 1024px. |
| Modals (e.g. `.tracker-settings-modal`, trip detail) | `min-width: 460px` – can overflow on narrow viewports. |
| `.dashboard-sidebar` | Fixed `260px`; at 767px becomes full-width horizontal nav – no intermediate state for 1024px. |
| `.admin-dashboard-sidebar` | Fixed `280px`; only collapses at one breakpoint. |
| Tables (admin, trips, toolkit) | Some tables lack `overflow-x: auto` wrapper – can cause horizontal page scroll. |
| `.dashboard-cards` | 3→2→1 columns at 768/479px – no 1024px-specific column count. |
| `.admin-metric-grid` | `repeat(auto-fill, minmax(160px, 1fr))` – good; at 624px goes 2 cols, 380px 1 col. |
| Button groups / action rows | Fixed `min-width` (e.g. 460px) or no wrap – can overflow at 1024px. |

---

## 2. Problem pages

| Page | Issues |
|------|--------|
| **Track (customer) dashboard** (`/track`, DevicesList) | Grid 1fr 320px at 720px; map fixed height; no AppContainer; 1024px feels cramped. |
| **Device detail** (DeviceDetail, DevicesListView) | Same grid + map; modals min-width 460px; settings panels can overflow. |
| **Admin dashboard** (`/admin/dashboard`) | admin-dashboard-body flex; sidebar 280px; no 1024px handling; metric grid OK. |
| **Trips tab** | Table now has `.trips-table-wrap` (overflow); modal max-width 480px – OK. |

---

## 3. Hardcoded values to replace or make responsive

| Location | Current | Recommendation |
|----------|---------|----------------|
| `--content-max` | 1200px | Keep or increase to 1280–1440 for large screens. |
| `--page-pad` | 16/24/32 @ 600/960 | Already responsive; align with AppContainer (16/24/32 @ 768/1024). |
| `.device-view-map-wrap` height | 280px, 340px @600 | Use `clamp(280px, 40vh, 500px)` and responsive class. |
| `.device-view-grid` at 720px | `1fr 320px` | At 1024px use `1fr minmax(280px, 360px)`; at 768px stack (1fr). |
| `.dashboard-sidebar` width | 260px | At 1024px: 72px icon-only (optional) or 200px; at 768px drawer/full row. |
| Modal min-width | 460px | Use `min(460px, 100vw - 32px)` or max-width + padding. |
| `.dashboard-cards` | 3/2/1 cols @ 769/768/479 | Add 1024px: 2 cols; 1280px: 3–4 cols. |
| Map containers (DashboardMap, TripRouteMap) | Various fixed heights | Single class: `height: clamp(280px, 40vh, 500px)`. |

---

## 4. Grid misuse

- **Dashboard (track):** No central max-width wrapper; content can stretch to full width. Use `AppContainer` with max-width.
- **Device view:** Grid uses fixed 320px column – should be `minmax(260px, 360px)` or similar for fluidity.
- **Admin dashboard:** `.admin-dashboard-body` flex with fixed sidebar – add 1024px breakpoint for sidebar width or stacking.
- **Cards:** Some cards use fixed padding (e.g. 20px) – OK; ensure no fixed height so content can grow.

---

## 5. Breakpoints in use (before refactor)

- **480px** – small mobile
- **560px** – mobile
- **599px** – mobile
- **600px** – tablet start (page-pad 24px)
- **624px** – admin metric grid 2 cols
- **720px** – device-view-grid 2 cols
- **767px** – dashboard sidebar full width, nav row
- **768px** – dashboard-cards 2 cols
- **769px** – dashboard-cards gap
- **960px** – page-pad 32px
- **1024px** – **missing** (target for small laptop)
- **1280px** – **missing** (target for desktop)

---

## 6. Changes delivered

1. **Layout primitives** – `AppContainer`, `ResponsiveGrid`, `Card`, `ResponsiveTable` (see `web/components/layout/`).
2. **CSS** – New utility classes in `globals.css`: `.app-container`, `.responsive-grid`, `.layout-card`, `.responsive-table-wrap`; 1024px and 1280px breakpoints; responsive map height; body `overflow-x: hidden` (already present). `.app-container.dashboard-content` gets padding-top and flex/min-width for dashboard.
3. **Dashboard (track)** – Uses `AppContainer`; `.dashboard-cards` breakpoints at 1024px (2 cols) and 1280px (3–4 cols); sidebar at 1024px: `--dashboard-sidebar-width: 220px` with reduced padding and ellipsis for nav text. `.dashboard-map-wrap` uses `clamp(280px, 40vh, 500px)` with 768px/1024px overrides.
4. **Device pages** – `.device-view-grid` responsive at 768px (`1fr minmax(260px, 360px)`) and 1024px (`1fr minmax(280px, 380px)`); `.device-view-map-wrap` uses clamp height; `.device-view-table-wrap` has overflow-x; device-view uses `var(--page-pad)` and `var(--content-max)`.
5. **Admin dashboard** – At 901px–1279px: sidebar width 240px, reduced gap; at ≤900px: column stack, sidebar full width.
6. **Navigation** – Sidebar at 1024px: 220px width; at 768px: full-width horizontal nav (existing). No new drawer JS.
7. **Mobile polish** – `.tracker-settings-modal`: `max-width: min(480px, calc(100vw - 32px))`, `max-height: 90vh`, overflow hidden with scroll on `.tracker-settings-modal-body` / `.tracker-settings-modal-panel`. Body `overflow-x: hidden`. Trips detail modal already had max-height 90vh.
8. **Typography** – `.device-view-title` and `.dashboard-settings-title` / `.dashboard-alerts-title` use `clamp()` for responsive sizes; vertical rhythm preserved.

---

## 7. Testing viewports

- **390px** – Mobile
- **768px** – Tablet
- **1024px** – Small laptop (priority)
- **1280px** – Desktop
- **1440px** – Large desktop

Check: no horizontal scroll, no overlapping, no clipped buttons, sidebar/drawer behavior correct.

**Dev utility:** `/dev/viewport` — shows current viewport size, document scroll width, and warns when horizontal overflow is detected (and logs to console). Use to quickly verify at 390, 768, 1024, 1280, 1440px.
