import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface HelpArticle {
  slug: string;
  title: string;
  content: string;
}

const articles: HelpArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    content: `## Getting Started

Screenetic is a web-based mobile device testing tool. Enter any URL and see how it renders across different phones, tablets, and browsers — all from your own browser.

### How It Works

1. **Enter a URL** on the home screen. Screenetic validates the format before proceeding.
2. **Choose a mode**: Side-by-Side Comparison (desktop only) lets you view two devices next to each other. Report Mode runs an automated audit across multiple devices.
3. **Configure devices** using the device selector — pick a model, resolution, browser, and orientation.
4. **View results** with screenshots, performance metrics, and detected issues.

### Modes

**Side-by-Side** is ideal for quick visual comparisons between two specific devices. You get sync scroll, shared zoom, and per-viewport screenshots.

**Report Mode** is for comprehensive audits. Select up to 25 devices (50 if logged in), choose network conditions, and generate a full report with PDF export.

### Tips

- Screenetic renders pages using your browser and network, so it works behind firewalls and on private networks.
- Use the Automatic Audit option in Report Mode to quickly test the most popular devices without manual selection.
- Save device lists as presets (requires login) to reuse across reports.`,
  },
  {
    slug: 'browser-simulation',
    title: 'Browser Simulation',
    content: `## Browser Simulation

Screenetic simulates mobile browsers by applying user-agent strings and viewport settings. It does not replace the host browser's rendering engine.

### What Is Simulated

- **Viewport size**: The iframe renders at the device's CSS pixel resolution (e.g., 390×844 for iPhone 14).
- **Device pixel ratio (DPR)**: Media queries targeting DPR (like \`@media (-webkit-min-device-pixel-ratio: 3)\`) evaluate correctly.
- **User-agent string**: The browser's UA string is spoofed to match the selected device and browser, so server-side UA detection responds appropriately.
- **Touch events**: Mouse interactions are translated into touch events so pages with touch-specific listeners respond correctly.

### What Is Not Simulated

- **Rendering engine differences**: If you're running Chrome, all viewports use the Blink engine regardless of whether you select Safari or Firefox. WebKit-specific or Gecko-specific CSS behaviors won't be reflected.
- **JavaScript API differences**: Browser-specific JS APIs (e.g., Safari's \`webkitAudioContext\`) are not polyfilled.
- **Codec and font rendering**: Media codec support and font rendering follow your host browser, not the simulated device.

### Native vs UA Simulation

When your host browser matches the selected browser (e.g., you're running Chrome and select Chrome), the viewport is labeled **"Native"**. Otherwise it shows **"UA simulation"** to remind you that engine-specific differences may not be reflected.`,
  },
  {
    slug: 'iframe-blocking',
    title: 'Iframe Blocking',
    content: `## Iframe Blocking

Some websites prevent themselves from being loaded inside iframes. When this happens, Screenetic cannot render the page and will show an error in the viewport area.

### Why Sites Block Iframes

Sites use HTTP headers to prevent iframe embedding as a security measure against clickjacking attacks. The two main mechanisms are:

- **X-Frame-Options**: A header with values \`DENY\` (no iframe embedding anywhere) or \`SAMEORIGIN\` (only same-domain embedding).
- **Content-Security-Policy (CSP)**: The \`frame-ancestors\` directive controls which domains can embed the page. \`frame-ancestors 'none'\` blocks all embedding.

Most major sites (Google, Facebook, banking sites) use these headers.

### Iframe Blocking Extensions

**Browser extensions** can strip X-Frame-Options and CSP headers for testing purposes. Search for "Ignore X-Frame headers" or "Disable Content-Security-Policy" in your browser's extension store. Only enable these during testing — they reduce your browser's security.

### DevTools Emulation

Your browser's built-in DevTools device emulation is an alternative for sites that block iframes. In Chrome, open DevTools (F12), click the device toggle toolbar, and select a device. This uses native engine rendering and bypasses iframe restrictions.

### Staging Environments

If you control the site, test against a staging or development environment where iframe restrictions may not be enforced. This is often the most reliable approach for internal tools and pre-production sites.

### In Reports

When a device fails to render due to iframe blocking during report generation, it's included in the report with a "Blocked by site policy" status rather than being silently omitted.`,
  },
  {
    slug: 'performance-metrics',
    title: 'Performance Metrics',
    content: `## Performance Metrics

Screenetic measures performance using standard Web Performance APIs available in your browser. All metrics are labeled **"Simulated"** because they reflect your host browser's performance, not the actual device hardware.

### Metrics Measured

- **Load Time**: Time from navigation start to the \`load\` event, via the Navigation Timing API. Represents when all resources (images, scripts, stylesheets) have finished loading.
- **First Contentful Paint (FCP)**: Time until the first text or image appears on screen, via the Paint Timing API.
- **Largest Contentful Paint (LCP)**: Time until the largest visible content element renders, via the LCP API. A key Core Web Vital.
- **Cumulative Layout Shift (CLS)**: Sum of unexpected layout shift scores during load, via the Layout Instability API. Values above 0.1 are flagged.
- **Resource Count**: Total number of network requests during page load.
- **Total Transfer Size**: Sum of all resource sizes in KB, via the Resource Timing API.

### Accuracy Notes

Metrics are collected in your host browser environment. CPU speed, memory, network conditions, and rendering engine all affect the numbers. Metrics are comparable within a single report run but not necessarily across separate runs.

When a performance API isn't available in your browser, that metric shows "Not available" instead of an inaccurate value.`,
  },
  {
    slug: 'issue-detection',
    title: 'Issue Detection',
    content: `## Issue Detection

Screenetic uses heuristic analysis to detect common mobile rendering problems. Findings are classified as **Issues** (likely to degrade UX) or **Observations** (notable but not necessarily problematic).

### The 8 Issue Types

1. **Horizontal overflow** — Content extends beyond the viewport width, causing a horizontal scrollbar.
2. **Viewport content clipping** — Visible content is cut off at viewport edges without scrollability.
3. **Fixed element occlusion** — Fixed-position elements (headers, footers, modals) cover more than 30% of the viewport.
4. **CLS above threshold** — Cumulative Layout Shift score exceeds 0.1 (the "good" threshold per Web Vitals).
5. **Tap target too small** — Interactive elements (links, buttons, inputs) have a tap area below 48×48 CSS pixels.
6. **Text too small** — Body text renders below 12px on the simulated device.
7. **Missing viewport meta** — The page lacks a properly configured \`<meta name="viewport">\` tag.
8. **Unresponsive layout** — The page renders at a fixed width that doesn't match the device viewport.

### Heuristic-Based

All detection is heuristic-based. False positives are expected and findings should be verified manually. Each report includes a disclaimer about this. For cross-origin pages, only observable symptoms (like horizontal overflow) can be detected since DOM access is restricted.

### Annotations

Detected issues with a known location are annotated directly on the device screenshot with colored overlays and numbered badges. A legend at the bottom maps numbers to issue types.`,
  },
  {
    slug: 'network-simulation',
    title: 'Network Simulation',
    content: `## Network Simulation

Screenetic can simulate constrained network conditions during report generation to test how pages perform on slower connections.

### Throttle Profiles

- **5G** — High bandwidth (~100 Mbps), low latency (~10ms). Represents modern urban mobile connections.
- **4G / LTE** — Moderate bandwidth (~20 Mbps), moderate latency (~50ms). The most common mobile connection worldwide.
- **3G** — Low bandwidth (~1.5 Mbps), high latency (~300ms). Still common in many regions.
- **Slow 3G** — Very low bandwidth (~400 Kbps), very high latency (~2000ms). Worst-case mobile scenario.
- **Offline** — No network access. Tests how the page handles complete disconnection.

### How It Works

For same-origin pages, throttling is applied via a Service Worker that intercepts network requests and adds artificial delays. For cross-origin pages, delays are approximated at the iframe level. CPU throttling scales reported metrics by a multiplier (4x for low-end, 2x for mid-range).

### Limitations

Network simulation approximates real conditions but can't perfectly replicate them. Actual device hardware, cell tower congestion, and protocol-level behavior all affect real-world performance in ways that can't be simulated in a browser tab.`,
  },
  {
    slug: 'screenshots-export',
    title: 'Screenshots & Export',
    content: `## Screenshots & Export

Screenetic captures viewport screenshots and supports multiple export formats for sharing and archiving results.

### Screenshot Capture

Screenshots are captured at the device's CSS pixel resolution using html2canvas. Each screenshot includes a watermark bar at the bottom showing the device name, resolution, DPR, browser, and tested URL.

Filenames are auto-generated in the format: \`{device}_{width}x{height}_{orientation}_{timestamp}.png\`. If multiple captures happen in the same second, a suffix (\`_2\`, \`_3\`) is appended.

### Export Formats

- **PDF** — Full report with title page, table of contents, executive summary, per-device pages with annotated screenshots, metrics, issues, and a limitations disclaimer. A4 portrait, 15mm margins.
- **JSON** — Complete report data in structured format, suitable for programmatic analysis.
- **CSV** — Summary table with one row per device, ideal for spreadsheets.
- **Screenshots ZIP** — All raw (unannotated) screenshots bundled in a ZIP file.

### Sharing

Reports can be shared via a unique URL. Set visibility to "Unlisted" and generate a share link with an optional expiry (1 hour, 24 hours, 7 days, or 30 days). On mobile, the native share sheet is available if your browser supports it.`,
  },
  {
    slug: 'device-database',
    title: 'Device Database',
    content: `## Device Database

Screenetic maintains a comprehensive catalog of mobile devices including iPhones, Android phones, tablets, and desktop presets.

### What's Included

Each device entry contains: model name, manufacturer, screen resolution (width and height in CSS pixels), device pixel ratio (DPR), default browser, device category (phone, tablet, desktop), and release year.

The database is versioned (format: YYYY.MM.N) and updated periodically to include new device releases. Your browser caches the database and checks for updates every 60 minutes.

### Automatic Audit Baseline

The Automatic Audit feature uses a curated baseline set of the most commonly used devices. This baseline is updated alongside the device database to reflect current market share data.

### Custom Resolutions

If a specific device isn't in the database, you can manually set any resolution between 320×480 and 7680×4320 using the custom resolution option in the device selector.`,
  },
  {
    slug: 'keyboard-navigation',
    title: 'Keyboard Navigation',
    content: `## Keyboard Navigation

Screenetic's interface is designed to be fully operable via keyboard.

### Tab Order

All interactive elements — buttons, dropdowns, toggles, links — are reachable via Tab in a logical order. Each element has a visible focus indicator (3px blue outline) that meets contrast requirements.

### Focus Management

When switching between screens (e.g., from URL entry to Side-by-Side mode), focus moves to the first interactive element of the new screen. Modal dialogs trap focus within themselves until dismissed.

### Viewport Escape

When a viewport iframe receives focus, press **Escape** to return focus to the Screenetic UI controls. For same-origin pages, Escape is detected inside the iframe. For cross-origin pages, a transparent overlay captures the Escape key. A hint below each viewport reads: "Press Escape to return to controls."

### Screen Reader Support

Status messages (errors, loading states, report completion) are announced via ARIA live regions. All form controls have associated labels or aria-label attributes. The interface uses semantic HTML landmarks for region-based navigation.`,
  },
  {
    slug: 'privacy-data',
    title: 'Privacy & Data',
    content: `## Privacy & Data

Screenetic is designed to minimize data collection and give you control over your information.

### What Happens Locally

All page rendering happens in your browser. The tested URL is loaded in a sandboxed iframe on your machine — Screenetic's server never sees or processes the content of the pages you test. Screenshots are captured client-side. PDF reports are generated client-side using jsPDF.

### Anonymous Usage

You can use Screenetic without creating an account. Anonymous reports are assigned a unique ID and stored for 7 days before automatic deletion. They're linked to a session cookie, not to any personal information.

### Authenticated Usage

Creating an account requires an email and password. Authenticated reports are stored indefinitely and linked to your account. You can delete individual reports or your entire account at any time — account deletion purges all associated data.

### Report Storage

When you save a report, metadata (URL, device configs, metrics, issues) is stored in the database. Screenshots are stored in encrypted (AES-256) object storage. Share links can be set to expire and can be revoked at any time.

### Data Retention

Anonymous reports: 7 days. Authenticated reports: until you delete them. Server logs: 30-day rotation. No analytics or tracking beyond what's needed for the service to function.`,
  },
  {
    slug: 'sharing-reports',
    title: 'Sharing Reports',
    content: `## Sharing Reports

Generated reports can be shared with others via unique URLs.

### Visibility Settings

- **Private** (default) — Only you can view the report. Requires authentication.
- **Unlisted** — Anyone with the link can view the report. The report won't appear in search results or public listings.

### Share Links

Generate a share link from the report detail page. You can set an expiry period: 1 hour, 24 hours, 7 days, or 30 days. Links use a 128-bit random token for security. You can revoke a share link at any time, immediately preventing further access.

### Link Previews

Shared report links include Open Graph metadata so they display rich previews in Slack, Teams, email clients, and social media. The preview shows the tested URL, device count, issue count, and a thumbnail of the first device screenshot.

### Expired Links

When someone visits an expired or revoked share link, they see a clear message that the report is no longer available. The report data is not exposed.

### Mobile Sharing

On mobile devices, the native share sheet is available (if supported by your browser) in addition to the copy-link option. This lets you share directly to messaging apps, email, or other installed apps.`,
  },
];

const DEFAULT_SLUG = 'getting-started';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function HelpScreen() {
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const activeSlug = slug || DEFAULT_SLUG;
  const activeArticle = articles.find((a) => a.slug === activeSlug) || articles[0];

  // Map hash IDs to their parent article slugs for cross-article deep links
  const hashToArticle: Record<string, string> = {
    'iframe-blocking-extensions': 'iframe-blocking',
    'devtools-emulation': 'iframe-blocking',
    'staging-environments': 'iframe-blocking',
  };

  // Handle hash-based deep links (e.g., /help#iframe-blocking-extensions)
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      const targetArticle = hashToArticle[id];
      if (targetArticle && targetArticle !== activeSlug) {
        navigate(`/help/${targetArticle}${location.hash}`, { replace: true });
        return;
      }
      // Small delay to let markdown render
      const timer = setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    } else if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [location.hash, activeSlug, navigate]);

  function handleArticleSelect(articleSlug: string) {
    navigate(`/help/${articleSlug}`);
    setMobileOpen(false);
  }

  return (
    <div className="help-screen">
      {/* Mobile dropdown */}
      <div className="help-mobile-nav">
        <button
          className="btn help-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-controls="help-mobile-menu"
        >
          {activeArticle.title} ▾
        </button>
        {mobileOpen && (
          <ul id="help-mobile-menu" className="help-mobile-menu" role="menu">
            {articles.map((a) => (
              <li key={a.slug} role="none">
                <button
                  role="menuitem"
                  className={`help-mobile-item${a.slug === activeSlug ? ' help-mobile-item--active' : ''}`}
                  onClick={() => handleArticleSelect(a.slug)}
                >
                  {a.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop sidebar */}
      <nav className="help-sidebar" aria-label="Help articles">
        <h2 className="help-sidebar-title">Help Topics</h2>
        <ul className="help-toc">
          {articles.map((a) => (
            <li key={a.slug}>
              <button
                className={`help-toc-item${a.slug === activeSlug ? ' help-toc-item--active' : ''}`}
                onClick={() => handleArticleSelect(a.slug)}
                aria-current={a.slug === activeSlug ? 'page' : undefined}
              >
                {a.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Article content */}
      <article className="help-content" ref={contentRef} aria-label={activeArticle.title}>
        <ReactMarkdown
          components={{
            h3: ({ children }) => {
              const text = String(children);
              const id = slugify(text);
              return <h3 id={id}>{children}</h3>;
            },
            // Handle internal links with client-side navigation
            a: ({ href, children, ...props }) => {
              if (href?.startsWith('/')) {
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(href);
                    }}
                    {...props}
                  >
                    {children}
                  </a>
                );
              }
              return <a href={href} {...props}>{children}</a>;
            },
          }}
        >
          {activeArticle.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
