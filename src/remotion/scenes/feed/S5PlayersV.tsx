import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../../brand";
import { SlideBG } from "../../components/primitives";
import {
  VHeader,
  VFitBadge,
  GradCapMark,
  SCHOOLS,
  V_CARD_W,
  V_CARD_H,
  V_CARD_GAP,
  V_CARDS_TOP,
  type School,
} from "./S4MatchesV";

/**
 * S5 — The Coach's Side (VERTICAL 1080×1920). The 3 school cards from S4V stay put,
 * then FLIP in 3D (Y-axis, staggered wave) to reveal PLAYER cards on the back — the
 * same match from the coach's side. Same beats + timing as scenes/S5Players, reflowed
 * for 9:16 (stacked, larger, AI Match badge wrapped under the content on both faces).
 */

const WHITE = colors.white;
const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// V_CARD_H is imported from S4MatchesV (single source of truth) so the flip container,
// both flip faces, and the S4 school cards are all the exact same shape — the badge
// lands in the identical spot on the school (front) and player (back) faces.

type Player = { transfer: boolean; name: string; line2: string; sub: string; score: number };

// SCHOOLS is imported from S4MatchesV (single source of truth) so the front faces
// here are the exact cards S4 just showed — fictional names, grad-cap mark, no
// real college logos.

const PLAYERS: Player[] = [
  { transfer: false, name: "Marcus Ellison", line2: "QB · 6'3\" · 212 lbs · 2026", sub: "Westlake High, TX · 6 offers", score: 92 },
  { transfer: true, name: "Jordan Vance", line2: "QB · 6'2\" · 205 lbs · YOE: 2", sub: "Previously: Northfield State (D2)", score: 84 },
  { transfer: false, name: "Tyler Brooks", line2: "QB · 6'1\" · 198 lbs · 2027", sub: "Mater Dei, CA · 4 offers", score: 71 },
];

// Both faces fill the SAME flip container (inset:0 → V_CARD_H) and pin the top row
// to the top + the AI Match badge to the BOTTOM via space-between. This keeps the
// badge at the identical vertical position on the school (front) and player (back)
// faces, regardless of the top row being 2 vs 3 lines — so the flip reveals a card
// of the exact same shape with the bar/score in the same place.
const cardShell: React.CSSProperties = {
  ...base,
  position: "absolute",
  inset: 0,
  width: V_CARD_W,
  background: "rgba(254,252,251,0.03)",
  border: "1px solid rgba(18,130,162,0.2)",
  borderRadius: 26,
  padding: "36px 44px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
};

// FRONT face — school card (matches S4V's SchoolCard layout).
const SchoolFace: React.FC<{ s: School; fill: number }> = ({ s, fill }) => (
  <div style={cardShell}>
    <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
      <GradCapMark />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ color: WHITE, fontWeight: 700, fontSize: 40, lineHeight: 1.1 }}>{s.name}</div>
        <div style={{ color: "rgba(254,252,251,0.55)", fontWeight: 600, fontSize: 28, letterSpacing: "0.03em", textTransform: "uppercase", marginTop: 10 }}>{s.div}</div>
      </div>
    </div>
    <VFitBadge score={s.score} fill={fill} />
  </div>
);

const PersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// BACK face — player card (pre-rotated 180° so it reads after the flip).
const PlayerFace: React.FC<{ p: Player; fill: number }> = ({ p, fill }) => {
  const ring = p.transfer ? "#dc2626" : colors.cerulean;
  return (
    <div style={{ ...cardShell, transform: "rotateY(180deg)", border: `1px solid ${p.transfer ? "rgba(220,38,38,0.3)" : "rgba(18,130,162,0.3)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <div style={{ width: 104, height: 104, minWidth: 104, borderRadius: "50%", border: `4px solid ${ring}`, background: p.transfer ? "rgba(220,38,38,0.15)" : "rgba(18,130,162,0.15)", color: ring, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <PersonSvg />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 7 }}>
          <div style={{ color: WHITE, fontWeight: 800, fontSize: 40, whiteSpace: "nowrap" }}>{p.name}</div>
          <div style={{ color: ring, fontWeight: 700, fontSize: 28, whiteSpace: "nowrap" }}>{p.line2}</div>
          <div style={{ color: "rgba(254,252,251,0.6)", fontWeight: 600, fontSize: 25, whiteSpace: "nowrap" }}>{p.sub}</div>
        </div>
      </div>
      <VFitBadge score={p.score} fill={fill} />
    </div>
  );
};

export const S5PlayersV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const S5_END = 122; // matches S5_DUR in AiMatchLaunchFeed (+0.75s longer hold)
  const capOpacity = interpolate(frame, [4, 16, S5_END - 12, S5_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const FLIP_START = 10;
  const FLIP_STAGGER = 9;
  const FLIP_DUR = 34;

  return (
    <AbsoluteFill>
      <SlideBG />
      <VHeader caption="Coaches find players that fit their program" capOpacity={capOpacity} />

      {/* 3 flipping cards, stacked — SAME positions as S4V. */}
      <div style={{ position: "absolute", top: V_CARDS_TOP, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: V_CARD_GAP }}>
        {SCHOOLS.map((s, i) => {
          const p = PLAYERS[i];
          const start = FLIP_START + i * FLIP_STAGGER;
          const flipS = spring({ frame: frame - start, fps, config: { damping: 30, mass: 1, stiffness: 75 } });
          const flip = interpolate(flipS, [0, 1], [0, 180], { extrapolateRight: "clamp" });
          const past90 = flip >= 90;
          const playerFillStart = start + FLIP_DUR * 0.55;
          const playerFill = interpolate(frame, [playerFillStart, playerFillStart + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ width: V_CARD_W, height: V_CARD_H, perspective: 1600 }}>
              <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: `rotateY(${flip}deg)` }}>
                <SchoolFace s={s} fill={1} />
                <PlayerFace p={p} fill={past90 ? playerFill : 0} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
