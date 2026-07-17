import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, gradients, fontFamily } from "../brand";

/**
 * Reusable motion primitives for the AI RA demo (and future DR videos).
 * Built once, reused across all scenes so the whole film reads as one system.
 */

// ── SlideBG ───────────────────────────────────────────────────────────
// Landing-gradient background + faint grid + soft vignette. Background for
// every text/preview slide.
export const SlideBG: React.FC = () => (
  <AbsoluteFill style={{ background: gradients.landingHero }}>
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        opacity: 0.6,
      }}
    />
    <AbsoluteFill style={{ boxShadow: "inset 0 0 480px rgba(0,0,0,0.45)" }} />
  </AbsoluteFill>
);

// ── WordReveal ────────────────────────────────────────────────────────
// Words spring up + fade, staggered. Used on all slide hero lines.
export const WordReveal: React.FC<{
  text: string;
  startFrame?: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ text, startFrame = 0, stagger = 4, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 0.28em", justifyContent: "center", ...style }}>
      {words.map((w, i) => {
        const local = frame - startFrame - i * stagger;
        const s = spring({ frame: local, fps, config: { damping: 200 } });
        const y = interpolate(s, [0, 1], [34, 0]);
        const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span key={i} style={{ display: "inline-block", transform: `translateY(${y}px)`, opacity }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

// ── TypeOn ────────────────────────────────────────────────────────────
// Character-by-character reveal with a blinking cursor. Prompt chips / type-on lines.
export const TypeOn: React.FC<{
  text: string;
  startFrame?: number;
  charsPerFrame?: number;
  style?: React.CSSProperties;
  showCursor?: boolean;
  // When true, the cursor disappears once typing completes (no ongoing blink).
  hideCursorWhenDone?: boolean;
}> = ({ text, startFrame = 0, charsPerFrame = 1, style, showCursor = true, hideCursorWhenDone = false }) => {
  const frame = useCurrentFrame();
  const started = frame >= startFrame; // render nothing (not even the cursor) before start
  const local = Math.max(0, frame - startFrame);
  const count = Math.min(text.length, Math.floor(local * charsPerFrame));
  const done = count >= text.length;
  const blinkOn = Math.floor(frame / 15) % 2 === 0;
  // Cursor only shows once typing has begun, while typing (or blinking if not hiding when done).
  const cursorVisible = started && showCursor && (hideCursorWhenDone ? !done : (!done || blinkOn));
  return (
    <span style={style}>
      {text.slice(0, count)}
      {cursorVisible && (
        <span style={{ opacity: blinkOn ? 1 : 0.15, color: colors.accentOrange }}>|</span>
      )}
    </span>
  );
};

// ── KeywordSwap ───────────────────────────────────────────────────────
// Vertical-wipe swap of one keyword for another in the caption band.
export const KeywordSwap: React.FC<{
  items: { at: number; text: string; color?: string }[];
  style?: React.CSSProperties;
}> = ({ items, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // active = last item whose `at` has passed
  let activeIdx = 0;
  for (let i = 0; i < items.length; i++) if (frame >= items[i].at) activeIdx = i;
  return (
    <div style={{ position: "relative", height: "1.1em", overflow: "hidden", ...style }}>
      {items.map((it, i) => {
        const local = frame - it.at;
        const isActive = i === activeIdx;
        const s = spring({ frame: local, fps, config: { damping: 200 } });
        // active rises from below into place; older items are pushed up/out
        const y = isActive ? interpolate(s, [0, 1], [40, 0]) : -40;
        const opacity = isActive ? interpolate(local, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateY(${y}px)`,
              opacity,
              color: it.color ?? colors.white,
            }}
          >
            {it.text}
          </div>
        );
      })}
    </div>
  );
};

// ── ChipSnap ──────────────────────────────────────────────────────────
// Filter chips spring in with stagger + orange left-border. NL→filters metaphor.
export const ChipSnap: React.FC<{
  labels: string[];
  startFrame?: number;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ labels, startFrame = 0, stagger = 5, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", ...style }}>
      {labels.map((l, i) => {
        const local = frame - startFrame - i * stagger;
        const s = spring({ frame: local, fps, config: { damping: 18, mass: 0.8, stiffness: 120 } });
        const scale = interpolate(s, [0, 1], [0.8, 1]);
        const opacity = interpolate(local, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              transform: `scale(${scale})`,
              opacity,
              fontFamily,
              fontWeight: 600,
              fontSize: 30,
              letterSpacing: "-0.01em",
              color: colors.white,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderLeft: `3px solid ${colors.accentOrange}`,
              borderRadius: 12,
              padding: "12px 20px",
              backdropFilter: "blur(8px)",
            }}
          >
            {l}
          </div>
        );
      })}
    </div>
  );
};

// ── PulseRing ─────────────────────────────────────────────────────────
// Orange ring, scale 1.0<->1.06 loop, to highlight a spot in the footage.
export const PulseRing: React.FC<{
  startFrame?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ startFrame = 0, size = 260, color = colors.accentOrange, style }) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - startFrame);
  const scale = 1 + Math.sin(local / 8) * 0.06;
  const opacity = interpolate(local, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `4px solid ${color}`,
        boxShadow: `0 0 40px ${color}66`,
        transform: `scale(${scale})`,
        opacity,
        ...style,
      }}
    />
  );
};

// ── OrangeSweep ───────────────────────────────────────────────────────
// The gradient underline that sweeps L→R. Reused as the slide underline motif.
export const OrangeSweep: React.FC<{
  startFrame?: number;
  width?: number;
  height?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ startFrame = 0, width = 320, height = 10, duration = 18, style }) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - startFrame);
  const w = interpolate(local, [0, duration], [0, width], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        width: w,
        height,
        borderRadius: 999,
        background: gradients.orangeSweep,
        ...style,
      }}
    />
  );
};
