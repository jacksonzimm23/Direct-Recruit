import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { logo } from "../../AiRaDemo";

/**
 * S4 — The Matches (VERTICAL 1080×1920). Same beats + timing as scenes/S4Matches,
 * reflowed for 9:16: the DR logo + caption sit in the top safe zone (larger text),
 * and the 3 best-fit school cards stack CENTERED with bigger type and the AI Match
 * badge wrapped UNDER the school name (the horizontal badge won't fit the narrower
 * card). Logo/caption geometry MUST match the other vertical scenes so nothing
 * moves across the S3V→S4V→S5V→S6V cuts.
 */

const WHITE = colors.white;
const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ── Shared 4:5 (1080×1350) layout constants (identical across S3–S6 feed) ─────
// Frame is 570px shorter than 9:16, so tops + card stack are tightened to fit; text
// stays big. 3 cards × V_CARD_H + 2 × V_CARD_GAP must fit under the caption.
export const V_LOGO_W = 130; // DR logo width (slightly smaller for the shorter frame)
export const V_LOGO_TOP = 90; // logo top — clear of the top safe area
export const V_CAPTION_TOP = 250; // caption line y
export const V_CARD_W = 980; // card width unchanged (1080 wide → 50px side margins)
export const V_CARD_H = 236; // card height (tighter than 9:16's 258 so 3 stack in 1350)
export const V_CARD_GAP = 26; // vertical gap between stacked cards
export const V_CARDS_TOP = 470; // card stack start (470 + 3×236 + 2×26 = 1230, fits 1350)
export const V_CAPTION_SIZE = 56; // caption font (still large)

const fitTier = (s: number): string => {
  if (s >= 90) return "#1f9d4d";
  if (s >= 75) return "#86efac";
  if (s >= 60) return "#eab308";
  if (s >= 45) return "#f97316";
  if (s >= 30) return "#ef4444";
  return "#7f1d1d";
};

export type School = { name: string; div: string; score: number };
// School names are FICTIONAL and the crest is a generic graduation cap — no real
// college names or logos appear in the demo. Divisions/scores are unchanged.
export const SCHOOLS: School[] = [
  { name: "Lakemont State University", div: "D1 FCS", score: 92 },
  { name: "University of Fairhaven", div: "D1 FCS", score: 85 },
  { name: "Brookfield State University", div: "D2", score: 78 },
];

// Generic graduation-cap mark used in place of a school logo. Sized/positioned to
// occupy the exact 104×104 slot the logo images used, so the card geometry (and
// the S4→S5 flip faces) are unchanged.
export const GradCapMark: React.FC = () => (
  <div style={{ width: 104, height: 104, minWidth: 104, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: colors.cerulean }}>
    <svg viewBox="0 0 24 24" width="88" height="88" fill="currentColor" style={{ filter: `drop-shadow(0 0 14px ${colors.cerulean}66)` }}>
      <path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3z" />
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
    </svg>
  </div>
);

// AI Match badge — full-width row UNDER the name: "AI MATCH · bar · number".
// (Landscape puts it inline at 340px; vertical stacks it so the bar can breathe.)
export const VFitBadge: React.FC<{ score: number; fill: number }> = ({ score, fill }) => {
  const color = fitTier(score);
  const shown = Math.round(score * fill);
  const pct = Math.max(4, Math.min(100, score)) * fill;
  return (
    <div style={{ ...base, width: "100%", display: "flex", alignItems: "center", gap: 20 }}>
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: WHITE, flexShrink: 0 }}>
        AI Match
      </span>
      <div style={{ position: "relative", flex: 1, height: 14, borderRadius: 7, background: "rgba(254,252,251,0.08)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 7, boxShadow: `0 0 12px -1px ${color}` }} />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 20,
            height: 20,
            marginLeft: -10,
            marginTop: -10,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: `0 0 10px 1px ${color}`,
          }}
        />
      </div>
      <span style={{ fontSize: 56, fontWeight: 800, color, flexShrink: 0, minWidth: 82, textAlign: "right", lineHeight: 1 }}>{shown}</span>
    </div>
  );
};

const SchoolCard: React.FC<{ s: School; enter: number; fill: number }> = ({ s, enter, fill }) => {
  const y = interpolate(enter, [0, 1], [34, 0]);
  const scale = interpolate(enter, [0, 1], [0.96, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  return (
    <div
      style={{
        ...base,
        width: V_CARD_W,
        height: V_CARD_H, // fixed height so S5's flip cards match this shape exactly
        background: "rgba(254,252,251,0.03)",
        border: "1px solid rgba(18,130,162,0.2)",
        borderRadius: 26,
        padding: "36px 44px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between", // top row pinned top, badge pinned bottom
        transform: `translateY(${y}px) scale(${scale})`,
        opacity,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* top row: grad-cap mark + name/division */}
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <GradCapMark />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ color: WHITE, fontWeight: 700, fontSize: 40, lineHeight: 1.1 }}>
            {s.name}
          </div>
          <div style={{ color: "rgba(254,252,251,0.55)", fontWeight: 600, fontSize: 28, letterSpacing: "0.03em", textTransform: "uppercase", marginTop: 10 }}>
            {s.div}
          </div>
        </div>
      </div>
      {/* bottom row: full-width AI Match badge */}
      <VFitBadge score={s.score} fill={fill} />
    </div>
  );
};

// Shared logo + caption header (reused by S5V/S6V so positions match exactly).
export const VHeader: React.FC<{ caption: string; capOpacity: number }> = ({ caption, capOpacity }) => (
  <>
    <div style={{ position: "absolute", top: V_LOGO_TOP, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <Img src={logo} style={{ width: V_LOGO_W }} />
    </div>
    <div
      style={{
        ...base,
        position: "absolute",
        top: V_CAPTION_TOP,
        left: 0,
        right: 0,
        textAlign: "center",
        fontWeight: 800,
        fontSize: V_CAPTION_SIZE,
        letterSpacing: "-0.03em",
        color: WHITE,
        opacity: capOpacity,
        padding: "0 70px",
        lineHeight: 1.1,
      }}
    >
      {caption}
    </div>
  </>
);

export const S4MatchesV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const S4_END = 122; // matches S4_DUR in AiMatchLaunchFeed (+0.75s longer hold)
  const capOpacity = interpolate(frame, [4, 16, S4_END - 12, S4_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const ROW_START = 12;
  const ROW_STAGGER = 13;
  const FILL_DELAY = 6;
  const FILL_DUR = 18;

  return (
    <AbsoluteFill>
      <SlideBG />
      <VHeader caption="Players find schools that fit their needs" capOpacity={capOpacity} />

      {/* 3 stacked school cards, appearing one by one, AI Match rising. */}
      <div style={{ position: "absolute", top: V_CARDS_TOP, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: V_CARD_GAP }}>
        {SCHOOLS.map((s, i) => {
          const start = ROW_START + i * ROW_STAGGER;
          const enterS = spring({ frame: frame - start, fps, config: { damping: 200 } });
          const fill = interpolate(frame, [start + FILL_DELAY, start + FILL_DELAY + FILL_DUR], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return <SchoolCard key={i} s={s} enter={enterS} fill={fill} />;
        })}
      </div>
    </AbsoluteFill>
  );
};
