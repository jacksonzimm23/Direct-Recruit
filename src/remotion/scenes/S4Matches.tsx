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
 * S4 — The Matches. Continues from S3 with the DR logo + caption pinned in the SAME
 * spots (logo top, caption below — no movement across the cut). The caption swaps to
 * the AI-Match line, and 3 best-fit school cards appear ONE BY ONE, centered, each
 * with its AI Match score + bar rising in (like the RA output in AiRaDemo).
 */

const CERULEAN = colors.cerulean;
const WHITE = colors.white;
const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ── Layout constants — MUST match S3 so logo + caption don't move across the cut ──
const LOGO_W = 120;
const LOGO_TOP = 56;
const CAPTION_TOP = 210;

// ── Fit-tier color (6-tier scale from brand :root --fit-*) ──────────────────
const fitTier = (s: number): string => {
  if (s >= 90) return "#1f9d4d";
  if (s >= 75) return "#86efac";
  if (s >= 60) return "#eab308";
  if (s >= 45) return "#f97316";
  if (s >= 30) return "#ef4444";
  return "#7f1d1d";
};

// ── The 3 best-fit schools (ranked high→low, varied tiers) ──────────────────
type School = { name: string; div: string; logo: string; score: number };
const SCHOOLS: School[] = [
  { name: "Eastern Washington University", div: "D1 FCS", logo: "eastern_washington.png", score: 92 },
  { name: "University of San Diego", div: "D1 FCS", logo: "san_diego.png", score: 85 },
  { name: "Delta State University", div: "D2", logo: "delta_state.png", score: 78 },
];

// AI Match badge — horizontal "AI MATCH · bar · number", number counts up + bar fills.
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
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: `0 0 8px 1px ${color}`,
          }}
        />
      </div>
      <span style={{ fontSize: 40, fontWeight: 800, color, flexShrink: 0, minWidth: 60, textAlign: "right" }}>{shown}</span>
    </div>
  );
};

const SchoolCard: React.FC<{ s: School; enter: number; fill: number }> = ({ s, enter, fill }) => {
  const y = interpolate(enter, [0, 1], [30, 0]);
  const scale = interpolate(enter, [0, 1], [0.96, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  return (
    <div
      style={{
        ...base,
        width: 1160,
        background: "rgba(254,252,251,0.03)",
        border: "1px solid rgba(18,130,162,0.2)",
        borderRadius: 20,
        padding: "28px 40px",
        display: "flex",
        alignItems: "center",
        gap: 30,
        transform: `translateY(${y}px) scale(${scale})`,
        opacity,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <Img
        src={staticFile(`logos/${s.logo}`)}
        style={{ width: 76, height: 76, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)" }}
      />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ color: WHITE, fontWeight: 700, fontSize: 32, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.name}
        </div>
        <div style={{ color: "rgba(254,252,251,0.55)", fontWeight: 600, fontSize: 21, letterSpacing: "0.03em", textTransform: "uppercase", marginTop: 6 }}>
          {s.div}
        </div>
      </div>
      <FitBadge score={s.score} fill={fill} />
    </div>
  );
};

export const S4Matches: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Caption fades in at the start (swaps from S3's line at the cut).
  // Caption fades in, holds, then fades OUT at the S4 end (f90) so S5's coach line
  // takes over cleanly. Cards stay (S5 opens on the same school cards and flips them).
  const S4_END = 99; // 90 + 10% longer
  const capOpacity = interpolate(frame, [4, 16, S4_END - 12, S4_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Cards appear one by one, quickly — the next starts before the prior slider is
  // done (tighter stagger). Each row's fit bar fills a few frames after it lands.
  const ROW_START = 12;
  const ROW_STAGGER = 13;
  const FILL_DELAY = 6;
  const FILL_DUR = 18;

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* DR logo — SAME spot as S3 (pinned top, no movement across the cut). */}
      <div style={{ position: "absolute", top: LOGO_TOP, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Img src={logo} style={{ width: LOGO_W }} />
      </div>

      {/* Caption — SAME position as S3's caption; text swapped for the matches line. */}
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
        Players find schools that fit their needs
      </div>

      {/* 3 centered school cards, appearing one by one, AI Match rising. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 90 }}>
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
    </AbsoluteFill>
  );
};
