# Direct Recruit — Text & Color Style (for Remotion videos)

This is the source of truth for **typography and color** in Direct Recruit videos.
Everything below is pulled from the live platform CSS so videos match the product.

> **Video heading feel:** headings should feel **bold, premium, tight, and high-impact.**
> **Video letter-spacing:** for these videos, letter-spacing should be **very tight — letters close together, almost touching.**

---

## 1. Typeface

**Inter** is the only typeface on the platform (used in 500+ CSS declarations). Use it for everything in videos.

- **Family:** `Inter`
- **Fallback stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Weights available on the platform:** `400, 500, 600, 700, 800, 900`
- **Monospace (rare, for numbers/code only):** `ui-monospace, 'SF Mono', Menlo, monospace`

**Loading Inter in Remotion** (do NOT use a Google Fonts `<link>` — Remotion bundles fonts):

```ts
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
});
// then: style={{ fontFamily }}
```

### Weight usage

| Role in video | Weight | Notes |
|---|---|---|
| **Hero / big display headings** | **800–900** | Maximum impact. This is the "premium, high-impact" look. |
| Section headings / titles | 700 | Platform's dominant heading weight (864 uses). |
| Subheadings / emphasis | 600 | Second-most common weight (847 uses). |
| Body / labels | 500 | Readable but still substantial. |
| Fine print / captions | 400 | Use sparingly in video (thin at scale). |

---

## 2. Letter-spacing (video spec)

The platform's tightest value today is `-0.02em`. **Video headings go tighter than the site** to hit the "almost touching" look.

| Element | Letter-spacing | Feel |
|---|---|---|
| **Big display / hero headings (800–900)** | **`-0.05em`** (range `-0.04em` to `-0.06em`) | Letters nearly touching. Bold, premium, high-impact. **This is the signature look for these videos.** |
| Section headings (700) | `-0.03em` to `-0.04em` | Tight, confident. |
| Subheadings (600) | `-0.02em` | Matches the tightest platform value. |
| Body text | `-0.01em` to `0` | Keep near-neutral so it stays legible. |
| All-caps labels / eyebrows / kickers | `+0.05em` to `+0.08em` | The ONE exception — small all-caps text needs POSITIVE tracking to breathe (matches platform's `0.05em`/`0.08em` on labels). |

**Rules of thumb**
- Tighter with **higher weight and larger size** — heavy + big can take `-0.06em`; thin + small cannot.
- Never apply negative tracking to small all-caps or body copy — it turns to mush at video scale.
- If strokes visibly collide on thin verticals (e.g. `ll`, `il`), back off one step.

```ts
// Remotion display heading example
const heading: React.CSSProperties = {
  fontFamily,           // Inter
  fontWeight: 900,
  letterSpacing: "-0.05em",
  lineHeight: 0.95,     // tight vertical rhythm reinforces the "high-impact" block feel
  color: "#0a1128",
};
```

---

## 3. Color system

Canonical brand tokens (from `frontend/landingpage/styles.css` `:root`).

### Core brand palette

| Token | Hex | Use |
|---|---|---|
| **Accent Orange** | **`#ff6b35`** | **THE Direct Recruit signature color.** Most-used color on the platform (240+ uses). Primary video accent — CTAs, highlights, key words, energy. |
| Oxford Blue | `#0a1128` | Darkest brand navy. Great as a heading color on light bg, or a rich dark background. |
| Penn Blue | `#001f54` | Deep brand blue. Backgrounds, depth. |
| Indigo Dye | `#034078` | Mid blue. Gradients, secondary surfaces. |
| **Cerulean** | **`#1282a2`** | Bright brand blue (208+ uses). Secondary accent, links, player-side energy. |
| Cerulean Dark | `#0e6b87` | Hover/pressed variant of cerulean. |
| White | `#fefcfb` | Brand off-white (slightly warm). Use instead of pure `#ffffff` for text/surfaces on dark. |
| Accent Red | `#e63946` | Alert/energy red. |

### Primary video accent — recommendation

**Use Accent Orange `#ff6b35` as the main accent in videos.** It is the platform's signature color and reads instantly as Direct Recruit. Role colors (below) are situational, not the default.

### Signature brand gradients (pulled from the platform)

```css
/* Brand diagonal — cerulean into orange (hero backgrounds, big fills) */
linear-gradient(135deg, #1282a2 0%, #ff6b35 140%)

/* Orange CTA sweep (buttons, accent bars, underlines) */
linear-gradient(90deg, #ff6b35, #ff8c5a)
```

### Role accent colors (situational)

The platform tints UI by user role. Reach for these only when a video is clearly about one audience; otherwise default to orange.

| Role | Accent | Hex |
|---|---|---|
| Players (HS / college) | Cerulean | `#1282a2` |
| Coaches (HS / college) | Orange | `#ff6b35` |
| Transfer players | Red | `#b91c1c` |

### Text & neutral colors (on light backgrounds)

| Token | Hex | Use |
|---|---|---|
| Text | `#1f2937` | Default body/heading text on light. |
| Text Muted | `#6b7280` | Secondary text, captions. |
| Text Subtle | `#9ca3af` | De-emphasized / placeholder. |
| Border | `#e5e7eb` | Hairlines, dividers. |
| Border Strong | `#d1d5db` | Stronger dividers. |
| Background | `#f5f6f8` | App light background. |
| Surface | `#ffffff` | Cards on light bg. |
| Surface Alt | `#fafbfc` | Subtle raised surface. |

**Text on dark backgrounds:** use White `#fefcfb` for primary text and Cerulean `#1282a2` / Orange `#ff6b35` for accents. Avoid pure black text — brand navy `#0a1128` is the "black."

### State colors

| Meaning | Hex |
|---|---|
| Success / positive | `#16a34a` |
| Error / negative | `#d32f2f` |

### Fit-score scale (match quality)

Direct Recruit visualizes player↔program match quality on a 6-step scale (deep green = great fit, dark maroon = poor fit). Use these exact colors any time a video shows a fit/match score.

| Score band | Token | Hex | Color |
|---|---|---|---|
| 90–99 | `--fit-6` | `#1f9d4d` | deep green |
| 75–89 | `--fit-5` | `#86efac` | mint green |
| 60–74 | `--fit-4` | `#eab308` | gold |
| 45–59 | `--fit-3` | `#f97316` | orange |
| 30–44 | `--fit-2` | `#ef4444` | red |
| < 30  | `--fit-1` | `#7f1d1d` | dark maroon |

---

## 4. Quick reference — video defaults

- **Font:** Inter, always.
- **Hero heading:** weight **900**, letter-spacing **`-0.05em`**, line-height ~**0.95**, color `#0a1128` (light bg) or `#fefcfb` (dark bg).
- **Primary accent:** `#ff6b35`.
- **Feel to hit:** bold, premium, tight, high-impact — heavy weight + very tight tracking + tight leading, letters almost touching.
- **The one exception to tight tracking:** small all-caps eyebrows/labels get **positive** tracking (`+0.05em`–`+0.08em`).
