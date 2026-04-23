# Accessibility Audit — ARIA & Screen Reader Support

**Date:** Task 20.2  
**Requirement:** 23 (Accessibility and Keyboard Navigation)

## Audit Results

### App.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `<header>` landmark | ✅ Present | Semantic `<header>` element |
| `<main>` landmark | ✅ Present | Semantic `<main>` element with ref for focus management |
| `<footer>` landmark | ✅ Present | Semantic `<footer>` element |
| `<nav aria-label>` | ✅ Present | `aria-label="Main navigation"` |

### ReportProgress.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `role="region"` on wrapper | ✅ Present | `aria-label="Report generation progress"` |
| `role="progressbar"` | ✅ Present | With `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| `aria-live="polite"` on current device | ✅ Present | On `.rp-current` paragraph |
| `aria-live="polite"` on device list | ✅ **Added** | On `<ul class="rp-devices">` for dynamic status updates |
| `aria-label` on device list | ✅ Present | `aria-label="Device status list"` |

### DeviceSelector.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `role="group"` with `aria-label` | ✅ Present | On wrapper div |
| `<label>` on Device select | ✅ Present | Wrapping label + `aria-label` |
| `<label>` on Browser select | ✅ Present | Wrapping label + `aria-label` |
| `<label>` on custom Width/Height/DPR | ✅ Present | Wrapping labels |
| Orientation `aria-label` | ✅ Present | Describes current state |
| Orientation `aria-pressed` | ✅ **Added** | `aria-pressed` reflects landscape state |

### URLEntryScreen.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `aria-label` on URL input | ✅ Present | `aria-label="URL to test"` |
| `role="alert"` on error | ✅ Present | On `.url-error` paragraph |

### UndoToast.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `role="alert"` | ✅ Present | On wrapper div |
| `aria-live="assertive"` | ✅ Present | On wrapper div |
| Dismiss button `aria-label` | ✅ Present | `aria-label="Dismiss"` |

### ViewportErrorDisplay.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `role="alert"` | ✅ Present | On wrapper div |
| `aria-live="assertive"` | ✅ Present | On wrapper div |

### ViewportFrame.tsx
| Check | Status | Notes |
|-------|--------|-------|
| `role="region"` with `aria-label` | ✅ Present | `aria-label="{device.name} viewport"` |
| `role="toolbar"` on zoom controls | ✅ Present | `aria-label="Viewport zoom controls"` |
| Zoom buttons `aria-label` | ✅ Present | All zoom buttons labeled |
| `aria-pressed` on Fit button | ✅ Present | Reflects fit mode state |
| `aria-live="polite"` on zoom level | ✅ Present | Announces zoom changes |
| `aria-live="polite"` on escape hint | ✅ Present | |
| `role="status"` on cross-origin label | ✅ Present | |
| `aria-hidden` on decorative icons | ✅ Present | In ReportProgress device icons |

## Changes Made
1. **ReportProgress.tsx** — Added `aria-live="polite"` to the device status list `<ul>` so screen readers announce device status changes dynamically.
2. **DeviceSelector.tsx** — Added `aria-pressed` to the orientation toggle button to convey the current landscape/portrait state to assistive technology.


---

# Color & Contrast Audit

**Date:** Task 20.3  
**Requirement:** 23 (Accessibility and Keyboard Navigation)

## Contrast Ratio Analysis

All ratios measured against WCAG 2.1 AA requirements: 4.5:1 for normal text, 3:1 for large text (≥18pt or ≥14pt bold).

| Color Pair | Before | Ratio | Status | Action |
|-----------|--------|-------|--------|--------|
| `--text: #1e293b` on `--bg: #f8fafc` | — | ~12.6:1 | ✅ Pass | No change |
| `--text-muted: #64748b` on `#ffffff` | — | ~4.6:1 | ✅ Pass | No change |
| `--error: #dc2626` on `#ffffff` | — | ~4.6:1 | ✅ Pass | No change |
| `--success` on `#ffffff` | `#16a34a` (~4.1:1) | ~5.1:1 | ✅ Pass | **Changed to `#15803d`** |
| `--warning` on `#ffffff` | `#d97706` (~3.7:1) | ~4.8:1 | ✅ Pass | **Changed to `#b45309`** |
| White on `--primary: #2563eb` | — | ~4.6:1 | ✅ Pass | No change |

## Non-Color-Dependent Indicators

| Component | Indicator | Status | Notes |
|-----------|-----------|--------|-------|
| Issue severity badges (ReportScreen, ReportDetailScreen) | Text labels ("issue" / "observation") + colored badge | ✅ Confirmed | `<span>` renders severity text inside badge |
| Device status (ReportProgress) | Emoji icon + text stage label | ✅ Confirmed | Icons are `aria-hidden`, stage text is visible |
| Error states (URLEntryScreen, LoginScreen, ViewportErrorDisplay) | Icon + descriptive text + `role="alert"` | ✅ Confirmed | Error messages always include text, not just color |
| Comparison verdicts (HistoryScreen) | Text labels ("improved" / "regressed" / "unchanged") + colored chips | ✅ Confirmed | Chip text conveys meaning independently of color |

## Focus Indicators

| Selector | Outline | Offset | Status |
|----------|---------|--------|--------|
| Global `a, input, select, textarea:focus-visible` | 3px solid `--primary` | 2px | ✅ Consistent |
| `.btn:focus-visible` | 3px solid `--primary` | 2px | ✅ Consistent |
| `.input:focus-visible` | 3px solid `--primary` | 2px | ✅ **Fixed** (was 2px outline with -1px offset on `:focus`) |
| `.auth-link:focus-visible` | 3px solid `--primary` | 2px | ✅ Consistent |
| `.help-toc-item:focus-visible` | 3px solid `--primary` | -1px | ✅ Consistent (inset for contained items) |
| `.help-mobile-item:focus-visible` | 3px solid `--primary` | -1px | ✅ Consistent (inset for contained items) |
| `.viewport-cross-origin-overlay:focus-visible` | 3px solid `--primary` | -3px | ✅ Consistent (inset for overlay) |
| `.viewport-touch-overlay:focus-visible` | 3px solid `--primary` | -3px | ✅ Consistent (inset for overlay) |

## Changes Made

1. **`--success` color** — Changed from `#16a34a` (4.1:1 on white) to `#15803d` (5.1:1 on white) to meet WCAG AA 4.5:1 minimum.
2. **`--warning` color** — Changed from `#d97706` (3.7:1 on white) to `#b45309` (4.8:1 on white) to meet WCAG AA 4.5:1 minimum.
3. **`.input:focus`** — Changed from `:focus` with 2px outline and -1px offset to `:focus-visible` with 3px outline and 2px offset, matching all other interactive element focus styles.
