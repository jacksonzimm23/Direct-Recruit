import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { VHeader, VFitBadge, V_CARD_W, V_CARD_H, V_CARD_GAP, V_CARDS_TOP, V_CAPTION_TOP } from "./S4MatchesV";

/**
 * S6 — The Breakdown (VERTICAL 1080×1920). The 3 player cards from S5V show; a fast
 * CLICK pulse hits card 2 (Jordan Vance), the cards fade, and a glass AI Match panel
 * shows WHY he scored 84 — score + tier + per-dimension reasons, with the spotlight
 * "walk" emphasis pass. Same beats + timing as scenes/S6Breakdown, reflowed for 9:16.
 */

const WHITE = colors.white;
const CERULEAN = colors.cerulean;
const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

const fitTier = (s: number): string => {
  if (s >= 90) return "#1f9d4d";
  if (s >= 75) return "#86efac";
  if (s >= 60) return "#eab308";
  if (s >= 45) return "#f97316";
  if (s >= 30) return "#ef4444";
  return "#7f1d1d";
};
const tierLabel = (s: number): string => {
  if (s >= 90) return "Elite Fit";
  if (s >= 75) return "Strong Fit";
  if (s >= 60) return "Good Fit";
  if (s >= 45) return "Fair Fit";
  if (s >= 30) return "Low Fit";
  return "Poor Fit";
};

type Player = { transfer: boolean; name: string; line2: string; sub: string; score: number };
const PLAYERS: Player[] = [
  { transfer: false, name: "Marcus Ellison", line2: "QB · 6'3\" · 212 lbs · 2026", sub: "Westlake High, TX · 6 offers", score: 92 },
  { transfer: true, name: "Jordan Vance", line2: "QB · 6'2\" · 205 lbs · YOE: 2", sub: "Previously: Northfield State (D2)", score: 84 },
  { transfer: false, name: "Tyler Brooks", line2: "QB · 6'1\" · 198 lbs · 2027", sub: "Mater Dei, CA · 4 offers", score: 71 },
];
const CLICK_IDX = 1;
// V_CARD_H imported from S4MatchesV — same card shape as S4/S5 so the S5→S6 cut is
// seamless and the badge sits in the same spot.

const PersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// Player card matching S5V's back face (stacked: info row + AI Match badge row).
const PlayerCard: React.FC<{ p: Player; press: number }> = ({ p, press }) => {
  const ring = p.transfer ? "#dc2626" : CERULEAN;
  const dip = 1 - Math.sin(press * Math.PI) * 0.02;
  return (
    <div
      style={{
        ...base,
        width: V_CARD_W,
        height: V_CARD_H,
        background: press > 0 ? "rgba(255,107,53,0.10)" : "rgba(254,252,251,0.03)",
        border: `1px solid ${press > 0 ? colors.accentOrange : p.transfer ? "rgba(220,38,38,0.3)" : "rgba(18,130,162,0.3)"}`,
        borderRadius: 26,
        padding: "36px 44px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        transform: `scale(${dip})`,
        boxShadow: press > 0 ? `0 0 0 2px ${colors.accentOrange}66, 0 8px 30px rgba(255,107,53,0.25)` : "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
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
      <VFitBadge score={p.score} fill={1} />
    </div>
  );
};

// ── AI Match reasons ────────────────────────────────────────────────────────
const MATCH_ROWS: { label: string; detail: string; strength: "strong" | "medium" }[] = [
  { label: "Academics", detail: "GPA falls within your admitted range", strength: "strong" },
  { label: "Level", detail: "Open to playing at your division", strength: "strong" },
  { label: "Location", detail: "Open to playing in your recruiting region", strength: "strong" },
  { label: "Campus", detail: "Prefers a campus environment like yours", strength: "strong" },
  { label: "Financial fit", detail: "Some overlap on financial needs", strength: "medium" },
];

const CheckMark: React.FC = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#37c46f" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const PartialMark: React.FC = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
);

// The glass AI Match panel — enlarged for vertical, centered below the caption.
const BreakdownPanel: React.FC<{ enter: number; walk: number; scorePulse: number; dimAmount: number }> = ({ enter, walk, scorePulse, dimAmount }) => {
  const score = 84;
  const color = fitTier(score);
  const label = tierLabel(score);
  const scale = interpolate(enter, [0, 1], [0.94, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const y = interpolate(enter, [0, 1], [30, 0]);

  const N = MATCH_ROWS.length;
  const rowSpot = (i: number): number => {
    if (walk < 0) return 0;
    const center = (i + 0.5) / N;
    const half = 0.62 / N;
    const d = Math.abs(walk - center);
    return Math.max(0, 1 - d / half);
  };
  const labelScale = 1 + Math.sin(Math.max(0, Math.min(1, scorePulse)) * Math.PI) * 0.14;
  const labelGlow = Math.sin(Math.max(0, Math.min(1, scorePulse)) * Math.PI);
  return (
    <div
      style={{
        ...base,
        position: "absolute",
        // CENTER the modal vertically between the title line's bottom (~310) and the
        // screen bottom (1350) → midpoint 830. Anchored by its own center.
        top: (310 + 1350) / 2,
        left: "50%",
        transform: `translateX(-50%) translateY(calc(-50% + ${y}px)) scale(${scale})`,
        opacity,
        width: 1000,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(18,130,162,0.35)",
        borderRadius: 30,
        padding: "36px 60px",
        boxShadow: "0 30px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(6px)",
      }}
    >
      {/* score + rating */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 26 }}>
        <span style={{ fontSize: 108, fontWeight: 800, lineHeight: 1, color }}>{score}</span>
        <span style={{ fontSize: 42, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color, display: "inline-block", transform: `scale(${labelScale})`, transformOrigin: "left center", textShadow: labelGlow > 0.01 ? `0 0 ${18 * labelGlow}px ${color}` : "none" }}>{label}</span>
      </div>
      <div style={{ fontSize: 33, color: "rgba(254,252,251,0.82)", marginTop: 16, lineHeight: 1.5 }}>
        <strong style={{ color: WHITE }}>Jordan Vance</strong> is a <strong style={{ color: WHITE }}>{label}</strong> for your program.
      </div>

      {/* reasons */}
      <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(254,252,251,0.55)", margin: "24px 0 18px" }}>
        What this player matches you on
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MATCH_ROWS.map((r, i) => {
          const rowEnter = interpolate(enter, [0.25 + i * 0.11, 0.5 + i * 0.11], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const spot = rowSpot(i);
          const accent = r.strength === "strong" ? "#37c46f" : "#eab308";
          const dimFloor = 1 - 0.5 * dimAmount;
          const dim = interpolate(spot, [0, 1], [dimFloor, 1]);
          const lift = -10 * spot;
          const iconPulse = 1 + Math.sin(spot * Math.PI) * 0.28;
          return (
            <div
              key={i}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                gap: 24,
                padding: "16px 26px",
                borderRadius: 18,
                border: `2px solid rgba(${r.strength === "strong" ? "55,196,111" : "234,179,8"},${0.85 * spot})`,
                boxShadow: spot > 0.02 ? `0 0 ${26 * spot}px ${accent}66, inset 0 0 ${18 * spot}px ${accent}22` : "none",
                background: `rgba(${r.strength === "strong" ? "55,196,111" : "234,179,8"},${0.1 * spot})`,
                opacity: rowEnter * dim,
                transform: `translateX(${interpolate(rowEnter, [0, 1], [-16, 0])}px) translateY(${lift}px)`,
              }}
            >
              <div style={{ marginTop: 4, flexShrink: 0, transform: `scale(${iconPulse})`, filter: spot > 0.02 ? `drop-shadow(0 0 ${8 * spot}px ${accent})` : "none" }}>{r.strength === "strong" ? <CheckMark /> : <PartialMark />}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 37, fontWeight: 700, color: WHITE }}>{r.label}</div>
                <div style={{ fontSize: 29, color: `rgba(254,252,251,${0.65 + 0.3 * spot})`, lineHeight: 1.4 }}>{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const S6BreakdownV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const capOpacity = interpolate(frame, [4, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const CLICK = 20;
  const MODAL_START = 34;
  const press = frame >= CLICK && frame < CLICK + 10 ? Math.sin(interpolate(frame, [CLICK, CLICK + 10], [0, 1]) * Math.PI) : 0;

  const cardsOpacity = interpolate(frame, [MODAL_START - 2, MODAL_START + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const panelEnter = spring({ frame: frame - MODAL_START, fps, config: { damping: 200 } });

  const WALK_START = MODAL_START + 44;
  const WALK_DUR = 92;
  const scorePulse = interpolate(frame, [WALK_START - 8, WALK_START + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const walk = frame < WALK_START
    ? -1
    : interpolate(frame, [WALK_START, WALK_START + WALK_DUR], [0, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
  const dimAmount = interpolate(
    frame,
    [WALK_START, WALK_START + 10, WALK_START + WALK_DUR - 14, WALK_START + WALK_DUR],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <SlideBG />
      <VHeader caption="See exactly why the fit works" capOpacity={capOpacity} />

      {/* 3 player cards — same spot as S5V, fade out when the panel opens. */}
      <div style={{ position: "absolute", top: V_CARDS_TOP, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: V_CARD_GAP, opacity: cardsOpacity }}>
        {PLAYERS.map((p, i) => (
          <PlayerCard key={i} p={p} press={i === CLICK_IDX ? press : 0} />
        ))}
      </div>

      {/* The breakdown panel — pops after the click, below the logo + caption. */}
      {frame >= MODAL_START && <BreakdownPanel enter={panelEnter} walk={walk} scorePulse={scorePulse} dimAmount={dimAmount} />}
    </AbsoluteFill>
  );
};
