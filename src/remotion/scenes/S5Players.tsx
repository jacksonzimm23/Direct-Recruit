import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../brand";
import { SlideBG } from "../components/primitives";
import { logo } from "../AiRaDemo";

/**
 * S5 — The Coach's Side. The 3 best-fit SCHOOL cards from S4 stay on screen, then
 * FLIP in 3D (Y-axis, staggered wave) to reveal PLAYER cards on the back — the same
 * match seen from the coach's side. 2 HS players + 1 transfer, AI Match rising.
 * Logo + caption stay pinned; caption swaps to the coach line.
 */

const WHITE = colors.white;
const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ── Layout — MUST match S4 so logo + caption + cards don't move across the cut ──
const LOGO_W = 120;
const LOGO_TOP = 56;
const CAPTION_TOP = 210;
const CARD_W = 1160;
const CARD_GAP = 26;

const fitTier = (s: number): string => {
  if (s >= 90) return "#1f9d4d";
  if (s >= 75) return "#86efac";
  if (s >= 60) return "#eab308";
  if (s >= 45) return "#f97316";
  if (s >= 30) return "#ef4444";
  return "#7f1d1d";
};

// ── AI Match badge (shared look with S4) ────────────────────────────────────
const FitBadge: React.FC<{ score: number; fill: number }> = ({ score, fill }) => {
  const color = fitTier(score);
  const shown = Math.round(score * fill);
  const pct = Math.max(4, Math.min(100, score)) * fill;
  return (
    <div style={{ ...base, flexShrink: 0, width: 340, display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: WHITE, flexShrink: 0 }}>
        AI Match
      </span>
      <div style={{ position: "relative", flex: 1, height: 10, borderRadius: 5, background: "rgba(254,252,251,0.08)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 5, boxShadow: `0 0 10px -1px ${color}` }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: "50%", width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: "50%", background: "#fff", boxShadow: `0 0 8px 1px ${color}` }} />
      </div>
      <span style={{ fontSize: 40, fontWeight: 800, color, flexShrink: 0, minWidth: 60, textAlign: "right" }}>{shown}</span>
    </div>
  );
};

// ── Data: the S4 schools (front) and the coach-side players (back) ──────────
type School = { name: string; div: string; logo: string; score: number };
type Player = {
  transfer: boolean;
  name: string;
  line2: string; // position · height · weight · gradYear / YOE
  sub: string; // school, state · offers  /  previously school (div)
  score: number;
};

const SCHOOLS: School[] = [
  { name: "Eastern Washington University", div: "D1 FCS", logo: "eastern_washington.png", score: 92 },
  { name: "University of San Diego", div: "D1 FCS", logo: "san_diego.png", score: 85 },
  { name: "Delta State University", div: "D2", logo: "delta_state.png", score: 78 },
];

// 2 HS players + 1 transfer (mirrors AiRaDemo's dataset).
const PLAYERS: Player[] = [
  { transfer: false, name: "Marcus Ellison", line2: "QB · 6'3\" · 212 lbs · 2026", sub: "Westlake High, TX · 6 offers", score: 92 },
  { transfer: true, name: "Jordan Vance", line2: "QB · 6'2\" · 205 lbs · YOE: 2", sub: "Previously: Delta State (D2)", score: 84 },
  { transfer: false, name: "Tyler Brooks", line2: "QB · 6'1\" · 198 lbs · 2027", sub: "Mater Dei, CA · 4 offers", score: 71 },
];

const cardShell: React.CSSProperties = {
  ...base,
  position: "absolute",
  inset: 0,
  width: CARD_W,
  background: "rgba(254,252,251,0.03)",
  border: "1px solid rgba(18,130,162,0.2)",
  borderRadius: 20,
  padding: "28px 40px",
  display: "flex",
  alignItems: "center",
  gap: 30,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
};

// FRONT face — school card (identical to S4).
const SchoolFace: React.FC<{ s: School; fill: number }> = ({ s, fill }) => (
  <div style={cardShell}>
    <Img src={staticFile(`logos/${s.logo}`)} style={{ width: 76, height: 76, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)" }} />
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{ color: WHITE, fontWeight: 700, fontSize: 32, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
      <div style={{ color: "rgba(254,252,251,0.55)", fontWeight: 600, fontSize: 21, letterSpacing: "0.03em", textTransform: "uppercase", marginTop: 6 }}>{s.div}</div>
    </div>
    <FitBadge score={s.score} fill={fill} />
  </div>
);

// Person silhouette (no-picture avatar), color = ring color.
const PersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// BACK face — player card (pre-rotated 180° so it reads after the flip).
const PlayerFace: React.FC<{ p: Player; fill: number }> = ({ p, fill }) => {
  const ring = p.transfer ? "#dc2626" : colors.cerulean;
  return (
    <div style={{ ...cardShell, transform: "rotateY(180deg)", border: `1px solid ${p.transfer ? "rgba(220,38,38,0.3)" : "rgba(18,130,162,0.3)"}` }}>
      <div style={{ width: 76, height: 76, minWidth: 76, borderRadius: "50%", border: `3px solid ${ring}`, background: p.transfer ? "rgba(220,38,38,0.15)" : "rgba(18,130,162,0.15)", color: ring, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PersonSvg />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 5 }}>
        <div style={{ color: WHITE, fontWeight: 800, fontSize: 32, whiteSpace: "nowrap" }}>{p.name}</div>
        <div style={{ color: ring, fontWeight: 700, fontSize: 22, whiteSpace: "nowrap" }}>{p.line2}</div>
        <div style={{ color: "rgba(254,252,251,0.6)", fontWeight: 600, fontSize: 20, whiteSpace: "nowrap" }}>{p.sub}</div>
      </div>
      <FitBadge score={p.score} fill={fill} />
    </div>
  );
};

export const S5Players: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Caption: fades in (coach line), holds, then fades OUT at the S5 end (f90) so
  // S6's line takes over. Cards stay (S6 opens on the same player cards).
  const S5_END = 99; // 90 + 10% longer; flips finish ~f70, well before this
  const capOpacity = interpolate(frame, [4, 16, S5_END - 12, S5_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // The flip: each card rotates Y 0→180°, staggered as a wave. School fill holds at
  // 1 (carried from S4); player fill rises AFTER that card passes 90° (new score in).
  const FLIP_START = 10;
  const FLIP_STAGGER = 9; // tighter — next card flips before the prior slider is done
  const FLIP_DUR = 34;

  // Card slot height (approx) so we can lay out 3 with CARD_GAP.
  const CARD_H = 132;

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* DR logo — SAME spot as S3/S4 (pinned, no movement). */}
      <div style={{ position: "absolute", top: LOGO_TOP, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Img src={logo} style={{ width: LOGO_W }} />
      </div>

      {/* Caption — SAME position; coach-side line. */}
      <div
        style={{
          ...base,
          position: "absolute",
          top: CAPTION_TOP,
          left: 0,
          right: 0,
          textAlign: "center",
          fontWeight: 800,
          fontSize: 46,
          letterSpacing: "-0.03em",
          color: WHITE,
          opacity: capOpacity,
          padding: "0 120px",
        }}
      >
        Coaches find players that fit their program
      </div>

      {/* 3 flipping cards, centered — SAME layout as S4. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: CARD_GAP, marginTop: 90 }}>
          {SCHOOLS.map((s, i) => {
            const p = PLAYERS[i];
            const start = FLIP_START + i * FLIP_STAGGER;
            const flipS = spring({ frame: frame - start, fps, config: { damping: 30, mass: 1, stiffness: 75 } });
            const flip = interpolate(flipS, [0, 1], [0, 180], { extrapolateRight: "clamp" });
            const past90 = flip >= 90;
            // Player score rises once the card has turned past 90° (new score reveals).
            const playerFillStart = start + FLIP_DUR * 0.55;
            const playerFill = interpolate(frame, [playerFillStart, playerFillStart + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ width: CARD_W, height: CARD_H, perspective: 1600 }}>
                <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: `rotateY(${flip}deg)` }}>
                  <SchoolFace s={s} fill={1} />
                  <PlayerFace p={p} fill={past90 ? playerFill : 0} />
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
