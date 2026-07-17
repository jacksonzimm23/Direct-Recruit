/**
 * Direct Recruit brand tokens for Remotion videos.
 * Source of truth: src/remotion/Videos/Resources/text-style.md
 * Pulled from the live platform CSS so videos match the product.
 */

import { loadFont } from "@remotion/google-fonts/Inter";

// Load Inter — the only typeface on the platform. Never use a Google Fonts <link>.
export const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
});

// ── Core brand palette ────────────────────────────────────────────────
export const colors = {
  accentOrange: "#ff6b35", // THE signature color — primary video accent
  oxfordBlue: "#0a1128", // darkest navy; "black" on light, or rich dark bg
  pennBlue: "#001f54",
  indigoDye: "#034078",
  cerulean: "#1282a2", // secondary accent, player-side energy
  ceruleanDark: "#0e6b87",
  white: "#fefcfb", // warm off-white; use instead of pure #fff on dark
  accentRed: "#e63946",

  // Text / neutrals (light backgrounds)
  text: "#1f2937",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  background: "#f5f6f8",
  surface: "#ffffff",
  surfaceAlt: "#fafbfc",

  // State
  success: "#16a34a",
  error: "#d32f2f",
} as const;

// ── Role accent colors (situational — default to orange otherwise) ────
export const roleAccent = {
  player: "#1282a2", // cerulean
  coach: "#ff6b35", // orange
  transfer: "#b91c1c", // red
} as const;

// ── Fit-score scale (match quality) ───────────────────────────────────
export const fitScale = {
  fit6: "#1f9d4d", // 90–99 deep green
  fit5: "#86efac", // 75–89 mint
  fit4: "#eab308", // 60–74 gold
  fit3: "#f97316", // 45–59 orange
  fit2: "#ef4444", // 30–44 red
  fit1: "#7f1d1d", // <30 dark maroon
} as const;

// ── Signature gradients ───────────────────────────────────────────────
export const gradients = {
  brandDiagonal: "linear-gradient(135deg, #1282a2 0%, #ff6b35 140%)",
  orangeSweep: "linear-gradient(90deg, #ff6b35, #ff8c5a)",
  // Landing-page hero navy (frontend/landingpage/styles.css .hero) — bg for all text/preview slides
  landingHero: "linear-gradient(135deg, #0a1128 0%, #001f54 50%, #034078 100%)",
} as const;

// ── Typography scale (video spec) ─────────────────────────────────────
// Tighter tracking with higher weight + larger size. Small all-caps is the
// ONE exception — it needs POSITIVE tracking.
export const type = {
  hero: {
    fontFamily,
    fontWeight: 900,
    letterSpacing: "-0.05em", // letters nearly touching — signature look
    lineHeight: 0.95,
  },
  heading: {
    fontFamily,
    fontWeight: 700,
    letterSpacing: "-0.035em",
    lineHeight: 1.0,
  },
  subheading: {
    fontFamily,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  },
  body: {
    fontFamily,
    fontWeight: 500,
    letterSpacing: "-0.005em",
    lineHeight: 1.3,
  },
  eyebrow: {
    fontFamily,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em", // small all-caps needs positive tracking
    lineHeight: 1.2,
  },
} as const;
