import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../brand";
import { SlideBG } from "../components/primitives";
import { logo } from "../AiRaDemo";

/**
 * S6 — The Breakdown. The 3 player cards from S5 are shown; a fast CLICK pulse hits
 * the 2nd card (Jordan Vance), the cards fade away, and a glass AI Match panel shows
 * WHY that player scored 84 — score + tier + the per-dimension reasons (✓ / ~).
 * Panel is styled to match the video's glass look and sits BELOW the logo + caption
 * (both stay visible). No ⓘ icon, no cursor, no disclaimer.
 */

const WHITE = colors.white;
const CERULEAN = colors.cerulean;
const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ── Layout — matches S4/S5 so logo + caption + cards don't move across the cut ──
const LOGO_W = 120;
const LOGO_TOP = 56;
const CAPTION_TOP = 210;
const CARD_W = 1160;
const CARD_GAP = 26;
const CARD_H = 132;

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

// ── The 3 S5 player cards (2 HS + 1 transfer) ───────────────────────────────
type Player = { transfer: boolean; name: string; line2: string; sub: string; score: number };
const PLAYERS: Player[] = [
  { transfer: false, name: "Marcus Ellison", line2: "QB · 6'3\" · 212 lbs · 2026", sub: "Westlake High, TX · 6 offers", score: 92 },
  { transfer: true, name: "Jordan Vance", line2: "QB · 6'2\" · 205 lbs · YOE: 2", sub: "Previously: Delta State (D2)", score: 84 },
  { transfer: false, name: "Tyler Brooks", line2: "QB · 6'1\" · 198 lbs · 2027", sub: "Mater Dei, CA · 4 offers", score: 71 },
];
const CLICK_IDX = 1; // 2nd card — Jordan Vance

const PersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const FitBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = fitTier(score);
  const pct = Math.max(4, Math.min(100, score));
  return (
    <div style={{ ...base, flexShrink: 0, width: 340, display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: WHITE, flexShrink: 0 }}>AI Match</span>
      <div style={{ position: "relative", flex: 1, height: 10, borderRadius: 5, background: "rgba(254,252,251,0.08)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 5, boxShadow: `0 0 10px -1px ${color}` }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: "50%", width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: "50%", background: "#fff", boxShadow: `0 0 8px 1px ${color}` }} />
      </div>
      <span style={{ fontSize: 40, fontWeight: 800, color, flexShrink: 0, minWidth: 60, textAlign: "right" }}>{score}</span>
    </div>
  );
};

// A player card. `press` (0..1) is a fast click-pulse (scale dip + orange glow ring).
const PlayerCard: React.FC<{ p: Player; press: number }> = ({ p, press }) => {
  const ring = p.transfer ? "#dc2626" : CERULEAN;
  const dip = 1 - Math.sin(press * Math.PI) * 0.02; // brief scale dip
  return (
    <div
      style={{
        ...base,
        width: CARD_W,
        height: CARD_H,
        background: press > 0 ? "rgba(255,107,53,0.10)" : "rgba(254,252,251,0.03)",
        border: `1px solid ${press > 0 ? colors.accentOrange : p.transfer ? "rgba(220,38,38,0.3)" : "rgba(18,130,162,0.3)"}`,
        borderRadius: 20,
        padding: "28px 40px",
        display: "flex",
        alignItems: "center",
        gap: 30,
        transform: `scale(${dip})`,
        boxShadow: press > 0 ? `0 0 0 2px ${colors.accentOrange}66, 0 8px 30px rgba(255,107,53,0.25)` : "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div style={{ width: 76, height: 76, minWidth: 76, borderRadius: "50%", border: `3px solid ${ring}`, background: p.transfer ? "rgba(220,38,38,0.15)" : "rgba(18,130,162,0.15)", color: ring, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PersonSvg />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 5 }}>
        <div style={{ color: WHITE, fontWeight: 800, fontSize: 32, whiteSpace: "nowrap" }}>{p.name}</div>
        <div style={{ color: ring, fontWeight: 700, fontSize: 22, whiteSpace: "nowrap" }}>{p.line2}</div>
        <div style={{ color: "rgba(254,252,251,0.6)", fontWeight: 600, fontSize: 20, whiteSpace: "nowrap" }}>{p.sub}</div>
      </div>
      <FitBadge score={p.score} />
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
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#37c46f" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const PartialMark: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
);

// The glass AI Match panel — light, on-brand, sits BELOW the caption (logo + line
// stay visible). Shows score + tier + the 5 reasons (no header/close/disclaimer).
// `walk` (0..1) drives the post-load emphasis pass: a spotlight travels down the
// reasons one at a time (see S6Breakdown). -1 = pass hasn't started.
const BreakdownPanel: React.FC<{ enter: number; walk: number; scorePulse: number; dimAmount: number }> = ({ enter, walk, scorePulse, dimAmount }) => {
  const score = 84;
  const color = fitTier(score);
  const label = tierLabel(score);
  const scale = interpolate(enter, [0, 1], [0.94, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const y = interpolate(enter, [0, 1], [24, 0]);

  // Which reason row the spotlight is on, and how "lit" it is (0..1 triangular so
  // it rises as the spotlight arrives and falls as it leaves). walk spans the 5
  // rows across 0..1; each row owns a 1/5 slice with a little overlap for glide.
  const N = MATCH_ROWS.length;
  const rowSpot = (i: number): number => {
    if (walk < 0) return 0; // pass not started → all rows neutral
    const center = (i + 0.5) / N;
    const half = 0.62 / N; // window half-width (slight overlap between rows)
    const d = Math.abs(walk - center);
    return Math.max(0, 1 - d / half);
  };
  // `dimAmount` (0..1) eases the non-spotlighted dimming in as the pass starts and
  // back out as it ends, so the panel settles to a clean fully-lit state instead
  // of ending dim, with no snap at either edge.
  // The tier LABEL ("Strong Fit") gets a brief pulse (scale bump + glow) as the
  // pass kicks off — it's the verdict, so it's what we punch.
  const labelScale = 1 + Math.sin(Math.max(0, Math.min(1, scorePulse)) * Math.PI) * 0.14;
  const labelGlow = Math.sin(Math.max(0, Math.min(1, scorePulse)) * Math.PI);
  return (
    <div
      style={{
        ...base,
        position: "absolute",
        top: 288, // below the caption; nudged up closer to the caption text
        left: "50%",
        transform: `translateX(-50%) translateY(${y}px) scale(${scale})`,
        opacity,
        width: 900,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(18,130,162,0.35)",
        borderRadius: 24,
        padding: "40px 48px",
        boxShadow: "0 30px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(6px)",
      }}
    >
      {/* score + rating — the tier label bumps + glows as the emphasis pass begins */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
        <span style={{ fontSize: 76, fontWeight: 800, lineHeight: 1, color }}>{score}</span>
        <span style={{ fontSize: 30, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color, display: "inline-block", transform: `scale(${labelScale})`, transformOrigin: "left center", textShadow: labelGlow > 0.01 ? `0 0 ${18 * labelGlow}px ${color}` : "none" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, color: "rgba(254,252,251,0.82)", marginTop: 16, lineHeight: 1.5 }}>
        <strong style={{ color: WHITE }}>Jordan Vance</strong> is a <strong style={{ color: WHITE }}>{label}</strong> for your program.
      </div>

      {/* reasons */}
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(254,252,251,0.55)", margin: "34px 0 20px" }}>
        What this player matches you on
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {MATCH_ROWS.map((r, i) => {
          const rowEnter = interpolate(enter, [0.25 + i * 0.11, 0.5 + i * 0.11], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          // Emphasis pass: this row's spotlight strength, and how much everything
          // ELSE should dim while any row is lit (so the eye follows the spotlight).
          const spot = rowSpot(i);
          const accent = r.strength === "strong" ? "#37c46f" : "#eab308";
          // Non-spotlighted rows dim toward 0.5 while the pass runs; the lit one
          // rides to full and lifts slightly toward the reader. dimAmount fades the
          // whole effect in/out so the start and end are clean.
          const dimFloor = 1 - 0.5 * dimAmount; // 1 (no dim) → 0.5 (full dim)
          const dim = interpolate(spot, [0, 1], [dimFloor, 1]);
          const lift = -8 * spot;
          const iconPulse = 1 + Math.sin(spot * Math.PI) * 0.28; // icon "beats" as the spotlight passes
          return (
            <div
              key={i}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                gap: 18,
                padding: "10px 18px",
                borderRadius: 14,
                // Full accent border traces the whole box as the spotlight arrives;
                // a soft glow blooms around it and a tint fills behind.
                border: `2px solid rgba(${r.strength === "strong" ? "55,196,111" : "234,179,8"},${0.85 * spot})`,
                boxShadow: spot > 0.02 ? `0 0 ${22 * spot}px ${accent}66, inset 0 0 ${16 * spot}px ${accent}22` : "none",
                background: `rgba(${r.strength === "strong" ? "55,196,111" : "234,179,8"},${0.1 * spot})`,
                opacity: rowEnter * dim,
                transform: `translateX(${interpolate(rowEnter, [0, 1], [-14, 0])}px) translateY(${lift}px)`,
              }}
            >
              <div style={{ marginTop: 3, flexShrink: 0, transform: `scale(${iconPulse})`, filter: spot > 0.02 ? `drop-shadow(0 0 ${6 * spot}px ${accent})` : "none" }}>{r.strength === "strong" ? <CheckMark /> : <PartialMark />}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 27, fontWeight: 700, color: WHITE }}>{r.label}</div>
                <div style={{ fontSize: 21, color: `rgba(254,252,251,${0.65 + 0.3 * spot})`, lineHeight: 1.4 }}>{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const S6Breakdown: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const capOpacity = interpolate(frame, [4, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Timing: brief pause, fast click-pulse on card 2, cards fade → panel. ──
  const CLICK = 20; // fast click pulse hits the 2nd card
  const MODAL_START = 34; // cards fade → panel pops
  // Fast click-pulse: 0→1→0 over ~10 frames on the clicked card.
  const press = frame >= CLICK && frame < CLICK + 10 ? Math.sin(interpolate(frame, [CLICK, CLICK + 10], [0, 1]) * Math.PI) : 0;

  // Cards fade out as the panel appears.
  const cardsOpacity = interpolate(frame, [MODAL_START - 2, MODAL_START + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const panelEnter = spring({ frame: frame - MODAL_START, fps, config: { damping: 200 } });

  // ── Emphasis pass (fills the ~4s the panel would otherwise sit static) ──
  // Once the panel + all 5 rows have loaded, a spotlight walks down the reasons
  // one at a time so the viewer is GUIDED through why the fit works, instead of
  // being handed a static list. The score bumps first to kick it off.
  const WALK_START = MODAL_START + 44; // after the last reason row has landed
  const WALK_DUR = 92;                 // ~3s to travel all 5 rows, leaving a 1s
                                       // clean fully-lit hold before the scene end
  const scorePulse = interpolate(frame, [WALK_START - 8, WALK_START + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // walk = -1 until the pass starts, then 0→1.15 across the rows. It travels PAST
  // 1 so the spotlight fully exits the last row (center 0.9 + window 0.124), which
  // guarantees its accent border/glow clears completely before the hold — no
  // lingering yellow box on the final row.
  const walk = frame < WALK_START
    ? -1
    : interpolate(frame, [WALK_START, WALK_START + WALK_DUR], [0, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
  // Dimming of the non-focused rows fades in over the pass's first ~10f and back
  // out over its last ~14f, so the panel starts and ends fully lit (no snap).
  const dimAmount = interpolate(
    frame,
    [WALK_START, WALK_START + 10, WALK_START + WALK_DUR - 14, WALK_START + WALK_DUR],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* DR logo — SAME spot (pinned, always visible). */}
      <div style={{ position: "absolute", top: LOGO_TOP, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Img src={logo} style={{ width: LOGO_W }} />
      </div>

      {/* Caption — SAME position; S6 line (always visible). */}
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
        See exactly why the fit works
      </div>

      {/* 3 player cards — same as S5, fade out when the panel opens. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: cardsOpacity }}>
        <div style={{ display: "flex", flexDirection: "column", gap: CARD_GAP, marginTop: 90 }}>
          {PLAYERS.map((p, i) => (
            <PlayerCard key={i} p={p} press={i === CLICK_IDX ? press : 0} />
          ))}
        </div>
      </AbsoluteFill>

      {/* The breakdown panel — pops after the click, below the logo + caption.
          After it loads, the spotlight walk (walk/scorePulse) emphasizes each
          reason in turn. */}
      {frame >= MODAL_START && <BreakdownPanel enter={panelEnter} walk={walk} scorePulse={scorePulse} dimAmount={dimAmount} />}
    </AbsoluteFill>
  );
};
