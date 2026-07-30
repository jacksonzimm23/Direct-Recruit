import React from "react";
import { fontFamily } from "../../brand";

/**
 * Shared UI kit for the Recruiting Pipeline carousel.
 *
 * Everything here is a faithful rebuild of the real college-coach recruiting
 * board UI, scaled up for a 1080x1350 frame. Source of truth:
 *   frontend/collegecoach/tabs/recruiting-board.js  (createPlayerCard)
 *   frontend/collegecoach/tabs/recruiting-board.css (.recruit-card et al)
 *
 * Nothing here reads useCurrentFrame(). Motion belongs to the scene; these are
 * pure presentational pieces so a still and a video render them identically.
 */

// ── The locked 6-color grade palette ──────────────────────────────────
// Tokens live in the DB, hex is render-only. Mirrors COLOR_HEX in
// recruiting-board.js. Do not invent colors outside this set.
export const COLOR_HEX = {
  dark_green: "#15803d",
  light_green: "#86efac",
  yellow: "#facc15",
  orange: "#f97316",
  red: "#ef4444",
  dark_red: "#7f1d1d",
} as const;

export type ColorTag = keyof typeof COLOR_HEX;

/**
 * Black or white grade-pill text based on background luminance. This is a
 * direct port of gradePillTextColor() so light tags (yellow, light green)
 * get black text exactly as they do in the product.
 */
export const gradePillTextColor = (hex: string): string => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? "#1a1a1a" : "#ffffff";
};

export type BoardRecruit = {
  name: string;
  position: string;
  /** Rendered as `6'2" • 205 lbs`, matching the card's details line. */
  height: string;
  weight: string;
  grade: number;
  colorTag: ColorTag;
  /** Transfers render red, HS players cerulean — same as the real card. */
  transfer?: boolean;
};

// The app card is ~13.6px type at browser scale. Everything below is that CSS
// multiplied by ~2.2 so it reads on a phone-sized feed post. Widened to 420 to
// fit the longest name plus the position-prefixed details line on one row.
export const RP_CARD_W = 420;

/**
 * One recruit card exactly as it appears on a recruiting board: a color stripe
 * pinned to the left edge, name over height/weight, and a grade pill whose
 * background is the same color tag.
 *
 * `showPosition` exists because the position travels with the card only when
 * the card floats free (S1). Sitting in a board column it is redundant: the
 * column's own label already says QB, exactly as in the product. `width`
 * narrows the card for the S3 board crop, where two columns have to fit.
 */
export const RecruitCard: React.FC<{
  r: BoardRecruit;
  width?: number;
  showPosition?: boolean;
}> = ({ r, width = RP_CARD_W, showPosition = true }) => {
  const hex = COLOR_HEX[r.colorTag];
  const tint = r.transfer ? "185, 28, 28" : "18, 130, 162";
  return (
    <div
      style={{
        fontFamily,
        boxSizing: "border-box",
        position: "relative",
        width,
        background: `rgba(${tint}, 0.15)`,
        border: `1px solid rgba(${tint}, 0.3)`,
        borderRadius: 16,
        padding: "20px 22px 20px 26px",
        display: "flex",
        alignItems: "center",
        gap: 22,
        // The card floats free here rather than sitting in a column, so it
        // needs its own lift off the background to read as a surface.
        boxShadow: "0 18px 40px -18px rgba(0,0,0,0.65)",
      }}
    >
      {/* Final-color stripe — absolute on the left edge, .recruit-final-color */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 11,
          background: hex,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontWeight: 700, color: "#fefcfb", fontSize: 30, lineHeight: 1.2, whiteSpace: "nowrap" }}>
          {r.name}
        </div>
        {/* Position leads the details line, matching how the pipeline row
            reads in-app (`QB • 6'2" • 205 lbs`). On the board itself position
            is the column header, but these cards float free with no column to
            sit under, so it has to travel with the card. */}
        <div style={{ fontWeight: 500, color: "rgba(254,252,251,0.7)", fontSize: 24, lineHeight: 1.2, whiteSpace: "nowrap" }}>
          {showPosition ? `${r.position} • ` : ""}
          {r.height} • {r.weight}
        </div>
      </div>
      {/* Grade pill — background mirrors the stripe so color + number read as
          one signal, text auto-contrasted. .recruit-final-grade */}
      <div
        style={{
          flex: "0 0 auto",
          minWidth: 62,
          height: 53,
          padding: "0 18px",
          borderRadius: 26,
          background: hex,
          color: gradePillTextColor(hex),
          fontWeight: 700,
          fontSize: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {r.grade}
      </div>
    </div>
  );
};

