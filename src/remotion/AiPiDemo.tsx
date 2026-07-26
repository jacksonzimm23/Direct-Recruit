import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  Video,
  Img,
  staticFile,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, gradients, fontFamily, type as brandType } from "./brand";
import {
  SlideBG,
  WordReveal,
  TypeOn,
  KeywordSwap,
  ChipSnap,
  PulseRing,
  OrangeSweep,
} from "./components/primitives";

/**
 * AI RA LAUNCH — "Zoom Into the Machine"
 * Composition id: AiPiDemo · 1920×1080 · 30fps · 1800 frames (60s)
 *
 * Clips are ~12–14.5s; per direction they're trimmed to ~7s each via `startFrom`.
 * Each scene is its own <Sequence> (scene-local frames) so scenes can be versioned
 * (Scene05 V2) per scene-revisioning.md.
 */

// ── Shared bits ───────────────────────────────────────────────────────
export const logo = staticFile("dr-logo.png");

// Trim plan: show 210 frames (7s) of each clip, starting a little in so the
// action is mid-flow (avoids dead lead-in). Nudge these after scrubbing.
const CLIP = {
  rec1: { src: staticFile("ra/rec-1.mp4"), startFrom: 30 },
  rec2: { src: staticFile("ra/rec-2.mp4"), startFrom: 20 },
  rec3: { src: staticFile("ra/rec-3.mp4"), startFrom: 20 },
  rec4: { src: staticFile("ra/rec-4.mp4"), startFrom: 20 },
};

// Frosted caption band anchored bottom, holds one keyword line.
const CaptionBand: React.FC<{ children: React.ReactNode; progress?: number }> = ({
  children,
  progress,
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 70,
      height: 140,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(10,17,40,0.55)",
      backdropFilter: "blur(8px)",
      borderTop: "1px solid rgba(255,255,255,0.10)",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
    }}
  >
    <div
      style={{
        ...brandType.hero,
        fontWeight: 800,
        fontSize: 58,
        letterSpacing: "-0.04em",
        color: colors.white,
      }}
    >
      {children}
    </div>
    {progress !== undefined && (
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 4, width: `${progress * 100}%`, background: gradients.orangeSweep }} />
    )}
  </div>
);

// Ken Burns push-in wrapper for a full-frame clip.
const ClipFrame: React.FC<{
  src: string;
  startFrom: number;
  durationInFrames: number;
  from?: number;
  to?: number;
}> = ({ src, startFrom, durationInFrames, from = 1.0, to = 1.05 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [from, to], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue, overflow: "hidden" }}>
      <Video
        src={src}
        startFrom={startFrom}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};

// Typed prompt chip (glass bar, top-center) used on clip scenes.
const PromptChip: React.FC<{ text: string; startFrame: number; top?: number }> = ({
  text,
  startFrame,
  top = 60,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 200 } });
  const y = interpolate(s, [0, 1], [-30, 0]);
  const opacity = interpolate(frame - startFrame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: "50%",
        transform: `translateX(-50%) translateY(${y}px)`,
        opacity,
        maxWidth: 1400,
        background: "rgba(10,17,40,0.6)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16,
        padding: "18px 28px",
        backdropFilter: "blur(10px)",
        fontFamily,
        fontWeight: 600,
        fontSize: 34,
        letterSpacing: "-0.01em",
        color: colors.white,
        whiteSpace: "nowrap",
      }}
    >
      <TypeOn text={text} startFrame={startFrame + 6} charsPerFrame={0.7} />
    </div>
  );
};

// Eyebrow (all-caps, positive tracking).
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = colors.cerulean }) => (
  <div style={{ ...brandType.eyebrow, color, fontSize: 34, marginBottom: 22 }}>{children}</div>
);

const heroStyle: React.CSSProperties = {
  ...brandType.hero,
  color: colors.white,
  fontSize: 118,
  textAlign: "center",
  padding: "0 80px",
};

// Floating monitor mockup (Scenes 1–2).
// `reveal` (0→1) drives the lockup: 0 = logo alone, centered; 1 = logo slid
// left with the name + slogan slid out from behind it and faded in (S2 zoom).
const LOGO_W = 190;
const LOCKUP_GAP = 34;
const TEXT_BLOCK_W = 440; // approx width of "Direct Recruit" @78px
// How far the logo shifts left from center to reach its lockup position:
// half of (text block + gap), so the whole row ends up centered.
const LOGO_SHIFT = (TEXT_BLOCK_W + LOCKUP_GAP) / 2;
const Monitor: React.FC<{ scale: number; bezelOpacity: number; y?: number; reveal?: number }> = ({ scale, bezelOpacity, y = 0, reveal = 0 }) => {
  const logoX = -LOGO_SHIFT * reveal; // slides left as reveal 0→1
  // text sits to the logo's right; starts tucked behind the logo, slides out
  const textX = interpolate(reveal, [0, 1], [-((TEXT_BLOCK_W / 2) + 20), 0]);
  const textOpacity = interpolate(reveal, [0.15, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ transform: `translateY(${y}px) scale(${scale})`, transformOrigin: "center center" }}>
      <div
        style={{
          width: 1100,
          height: 620,
          borderRadius: 18,
          border: `2px solid rgba(255,255,255,${0.08 * bezelOpacity})`,
          boxShadow: `0 60px 120px rgba(0,0,0,${0.5 * bezelOpacity})`,
          overflow: "hidden",
          position: "relative",
          background: gradients.landingHero,
        }}
      >
        {/* Logo — centered at reveal 0, slides left as reveal→1 */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <Img src={logo} style={{ width: LOGO_W, transform: `translateX(${logoX}px)` }} />
        </AbsoluteFill>
        {/* Name + slogan — anchored to the logo's right lockup position; slides
            out from behind the logo and fades in. Tucked behind logo via z-order. */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "row" }}>
          <div style={{ transform: `translateX(${(LOGO_W / 2) + (LOCKUP_GAP / 2) + textX}px)`, opacity: textOpacity, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily, fontWeight: 800, letterSpacing: "-0.02em", fontSize: 78, color: "#ffffff", lineHeight: 1, whiteSpace: "nowrap" }}>
              Direct Recruit
            </div>
            <div style={{ fontFamily, fontWeight: 700, textTransform: "uppercase", fontSize: 24, color: colors.cerulean, letterSpacing: "2.5px", marginTop: 12, whiteSpace: "nowrap" }}>
              Get Recruited · The Right Way
            </div>
          </div>
        </AbsoluteFill>
        {/* faux reflection */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg, rgba(255,255,255,0.10), transparent 40%)", opacity: bezelOpacity }} />
      </div>
    </div>
  );
};

// ── SCENE 1 — Intro (f0–150) ──────────────────────────────────────────
const Scene01Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(enter, [0, 1], [0.6, 0.72]);
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const bob = Math.sin(frame / 30) * 6;
  const captionFade = interpolate(frame, [140, 150], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const swap = frame >= 75;
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        <Monitor scale={scale} bezelOpacity={1} y={bob} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 130, textAlign: "center", opacity: captionFade }}>
        <div style={{ opacity: interpolate(frame, [20, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <Eyebrow>RECRUITING</Eyebrow>
        </div>
        <div style={{ ...heroStyle, fontSize: 92 }}>
          {!swap ? (
            <WordReveal text="Hours of scrolling." startFrame={30} />
          ) : (
            <div style={{ color: colors.textSubtle }}>
              Hours of scrolling.
            </div>
          )}
        </div>
        {swap && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <OrangeSweep startFrame={75} width={420} />
            </div>
            <div style={{ ...heroStyle, fontSize: 92 }}>
              <WordReveal text="It doesn't have to be." startFrame={80} />
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ── SCENE 1 V2 - Intro (f0–150) ───────────────────────────────────────
// Revision (scene-revisioning.md): eyebrow → "AI COLLEGE FOOTBALL RECRUITING";
// one fixed-position caption cycling 3 lines one-at-a-time (each in, then out,
// before the next — never stacked, no upward shift). "AI" orange on line 3.
const Scene01Intro_V2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(enter, [0, 1], [0.6, 0.72]); // desktop unchanged
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const bob = Math.sin(frame / 30) * 6;
  const eyebrowOpacity = interpolate(frame, [20, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Each line: fade in over `in`, hold, fade out over `out` before the next.
  const lineOpacity = (start: number, end: number, hold = true) => {
    const inEnd = start + 8;
    const outStart = end - 8;
    if (!hold) return interpolate(frame, [start, inEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return interpolate(
      frame,
      [start, inEnd, outStart, end],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  };

  // A small rise on entry for life, settling to 0 (position otherwise fixed).
  const lineRise = (start: number) => {
    const s = spring({ frame: frame - start, fps, config: { damping: 200 } });
    return interpolate(s, [0, 1], [22, 0]);
  };

  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        <Monitor scale={scale} bezelOpacity={1} y={bob} />
      </AbsoluteFill>
      {/* Eyebrow — pinned above the caption region */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 820, textAlign: "center", opacity: eyebrowOpacity }}>
        <div style={{ ...brandType.eyebrow, color: colors.cerulean, fontSize: 26, whiteSpace: "nowrap" }}>
          AI COLLEGE FOOTBALL RECRUITING
        </div>
      </div>

      {/* Caption — each line's vertical CENTER anchored at y=1005, the midpoint
          between the eyebrow's bottom (≈930) and the screen bottom (1080).
          lineHeight:1 + translateY(-50%) centers the glyph box on that point so
          it doesn't drift low. Eyebrow above is untouched. */}
      {[
        { text: <>Stop scrolling on social media</>, start: 20, end: 60, hold: true },
        { text: <>Stop scrolling databases</>, start: 62, end: 100, hold: true },
        { text: <>Start searching with <span style={{ color: colors.accentOrange }}>AI</span></>, start: 102, end: 150, hold: false },
      ].map((l, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 908,
            textAlign: "center",
            ...heroStyle,
            fontSize: 84,
            lineHeight: 1,
            opacity: lineOpacity(l.start, l.end, l.hold),
            transform: `translateY(-50%) translateY(${lineRise(l.start)}px)`,
          }}
        >
          {l.text}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ── SCENE 2 — Zoom into the desktop (f150–210) ────────────────────────
const Scene02Zoom: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 26, mass: 1.1, stiffness: 90 } });
  const scale = interpolate(s, [0, 1], [0.72, 2.4]);
  const bezelOpacity = interpolate(frame, [0, 45], [1, 0], { extrapolateRight: "clamp" });
  const blur = interpolate(frame, [15, 30, 45], [0, 3, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // crossfade into rec-1's first frame at the end
  const clipReveal = interpolate(frame, [52, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", filter: `blur(${blur}px)` }}>
        <Monitor scale={scale} bezelOpacity={bezelOpacity} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: clipReveal }}>
        <Video src={CLIP.rec1.src} startFrom={CLIP.rec1.startFrom} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 2 V2 - Zoom into the desktop (f150–210) ─────────────────────
// Revision (scene-revisioning.md): blur removed (crisp). S1 shows the logo
// ALONE; here the logo slides left as the name + slogan slide out from behind
// it and fade in, resolving to the centered full lockup that fills the frame.
const Scene02Zoom_V2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 26, mass: 1.1, stiffness: 90 } });
  const scale = interpolate(s, [0, 1], [0.72, 2.4]);
  const bezelOpacity = interpolate(frame, [0, 45], [1, 0], { extrapolateRight: "clamp" });
  // logo slides left + name/slogan reveal (0→1) as the zoom begins
  const revealS = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const reveal = interpolate(revealS, [0, 1], [0, 1]);
  // crossfade into rec-1's first frame at the end
  const clipReveal = interpolate(frame, [52, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Monitor scale={scale} bezelOpacity={bezelOpacity} reveal={reveal} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: clipReveal }}>
        <Video src={CLIP.rec1.src} startFrom={CLIP.rec1.startFrom} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 2+4 MERGED - Zoom → brand lockup → Meet the RA (150f) ────────
// Revision (scene-revisioning.md): S3 removed; S2 (zoom + logo-reveals-lockup)
// merged with S4 (Meet the RA). Flow: monitor zooms in and the logo reveals the
// name + slogan (original S2 animation) → the full lockup moves UP and SHRINKS →
// the S4 lines (AI Portal Intelligence + orange subtitle) appear below it.
// Continuous lockup: logo + name + slogan as ONE centered flex row.
// - `reveal` (0→1): the S2 logo→name/slogan reveal.
// - `textOpacity` (1→0): collapses back to logo-only for the Meet-RA state.
// The row is a real flex row (gap = tight LOCKUP_TIGHT_GAP). We translate the
// whole row so the logo's center sits at frame-center whenever text is hidden,
// which keeps the logo centered both before the reveal and in the Meet-RA state.
export const LOGO_SIZE = 170;
const LOCKUP_TIGHT_GAP = 14; // logo ↔ name spacing (tightened)
const NAME_BLOCK_W = 456; // width of "Direct Recruit" @70px — used to center the logo+name pair
// The logo MOVES: when the name+slogan are hidden it sits dead-center; when they
// reveal, the logo slides LEFT by half the (gap + name width) so the whole pair
// is centered. Both endpoints are exact, and the motion is driven by ONE
// continuous parameter (textVisible), so the reveal/collapse is smooth and the
// collapsed endpoint lands the logo precisely at frame-center (= the RaAnchor
// logo spot), keeping the scene-to-scene handoff seamless.
const LOCKUP_LOGO_SHIFT = (LOCKUP_TIGHT_GAP + NAME_BLOCK_W) / 2; // logo's leftward travel when fully revealed
export const ContinuousLockup: React.FC<{ reveal: number; textOpacity: number }> = ({ reveal, textOpacity }) => {
  const textReveal = interpolate(reveal, [0.15, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const textVisible = textReveal * textOpacity;
  // Logo center: frame-center when collapsed → LOCKUP_LOGO_SHIFT left when revealed.
  const logoX = interpolate(textVisible, [0, 1], [0, -LOCKUP_LOGO_SHIFT]);
  // Name+slogan left edge sits just right of the logo; it rides along with the logo.
  const textLeft = logoX + LOGO_SIZE / 2 + LOCKUP_TIGHT_GAP;
  return (
    <div style={{ position: "relative", width: 0, height: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Logo — slides left to reveal, back to center to collapse */}
      <Img src={logo} style={{ width: LOGO_SIZE, display: "block", position: "absolute", left: logoX - LOGO_SIZE / 2, top: -LOGO_SIZE / 2 }} />
      {/* Name + slogan — anchored just right of the logo; fades in/out on reveal. */}
      <div
        style={{
          position: "absolute",
          left: textLeft,
          top: 0,
          transform: "translateY(-50%)",
          opacity: textVisible,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily, fontWeight: 800, letterSpacing: "-0.02em", fontSize: 70, color: "#ffffff", lineHeight: 1, whiteSpace: "nowrap" }}>
          Direct Recruit
        </div>
        <div style={{ fontFamily, fontWeight: 700, textTransform: "uppercase", fontSize: 21, color: colors.cerulean, letterSpacing: "2.3px", marginTop: 11, whiteSpace: "nowrap" }}>
          Get Recruited · The Right Way
        </div>
      </div>
    </div>
  );
};

export const Scene02Meet_Merged: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Phase A (f0→): DR logo appears centered, then MOVES LEFT to reveal the
  //    name + slogan (no monitor). The lockup sits at a fixed comfortable scale. ──
  const entrance = 1; // logo shown immediately at frame 0 (no fade-in)
  // Reveal (logo slides left, name+slogan slide out) starts after a brief beat.
  const revealS = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const reveal = interpolate(revealS, [0, 1], [0, 1]);
  const lockupZoom = 1.35; // fixed revealed size (no zoom)
  const carryBob = 0;

  // ── HOLD the revealed lockup before Phase B. Shrink starts at f72. ──
  const SHRINK_START = 72;
  // ── Phase B (f72→): ONE continuous spring shrinks the SAME lockup from its
  //    zoomed size down to the Meet-RA logo size, moving it up toward the heading.
  //    The lockup element renders continuously (no swap), so there is no seam. ──
  const shrinkS = spring({ frame: frame - SHRINK_START, fps, config: { damping: 200 } });
  // The reveal lockup (logo + name + slogan) shrinks and rises during Phase B.
  // Its ONLY job now is the motion during the collapse; the SETTLED end state is
  // rendered by the SAME <RaAnchor> component S5 uses, so the geometry at the cut
  // is pixel-identical (no 4px title jump / logo size change / flash).
  // Land the animated logo at EXACTLY the settled anchor's size (RA_ANCHOR_LOGO_W)
  // so the hard swap has no size pop. (Was 121.5/170 → ~1.5px larger than the
  // anchor, which showed as a tiny size flicker at the swap.)
  const groupScale = interpolate(shrinkS, [0, 1], [1.35, RA_ANCHOR_LOGO_W / LOGO_SIZE]);
  const groupY = interpolate(shrinkS, [0, 1], [0, -139]);
  // name + slogan fade OUT during the shrink. This ALSO drives the logo's
  // re-centering inside ContinuousLockup (logoX tracks textVisible), so we finish
  // it EARLY — by f90 — so the logo is back at frame-center and holds there while
  // the shrink spring finishes settling, BEFORE the handoff. Otherwise the logo is
  // still ~28px left of center when the settled anchor (dead-center) appears, and
  // you see a faint double logo / rightward jump (~f92).
  const textFadeOut = interpolate(frame, [SHRINK_START, SHRINK_START + 18], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Settled anchor handoff (HARD SWAP, not a crossfade) ──
  // The animated lockup shrinks + re-centers straight onto the settled anchor's
  // exact spot (frame-center, 120px logo). We swap only once the shrink spring has
  // FULLY settled (so logo size/Y also match, not just X), then HARD-SWAP to the
  // settled RaAnchor — NO opacity crossfade. Crossfading two logos blends two
  // semi-transparent copies at slightly different positions → the faint double
  // logo / rightward jump you saw. By the swap frame all three (x, y, size) are
  // pixel-aligned, so the instant swap is invisible.
  const ANCHOR_SWAP = 100;                  // shrink FULLY settled (size+Y exact) + logo re-centered by here
  const useSettledAnchor = frame >= ANCHOR_SWAP;
  // Title fades in right after the swap and finishes BEFORE the first subtitle
  // line, so the full "AI Portal Intelligence" lockup is shown on its own first,
  // THEN the 3 "Stop scrolling…" lines play under it.
  const titleFadeIn = interpolate(frame, [ANCHOR_SWAP, ANCHOR_SWAP + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* Phase A/B MOTION: the reveal lockup (logo reveals name+slogan, then
          shrinks + rises + re-centers). Rendered only until it lands on the
          settled anchor; then hard-swapped out (no fade). */}
      {!useSettledAnchor && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: entrance }}>
          <div
            style={{
              transform:
                frame < SHRINK_START
                  ? `scale(${lockupZoom})` // fixed revealed size, then holds
                  : `translateY(${groupY}px) scale(${groupScale})`,
            }}
          >
            <ContinuousLockup reveal={reveal} textOpacity={textFadeOut} />
          </div>
        </AbsoluteFill>
      )}

      {/* SETTLED STATE: the exact RaAnchor S5/S2 renders (logo + AI RA title as ONE
          centered column). Hard-swapped in once the motion lockup lands on it, then
          holds perfectly still → seamless into S2. Title fades in a touch later. */}
      {useSettledAnchor && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${-RA_ANCHOR_LIFT}px)` }}>
            <Img src={logo} style={{ width: RA_ANCHOR_LOGO_W, marginBottom: RA_ANCHOR_GAP, display: "block" }} />
            <div style={{ ...heroStyle, fontSize: RA_ANCHOR_TITLE_SIZE, padding: 0, opacity: titleFadeIn }}>
              AI Portal Intelligence
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Subtitle slot — 2 lines FLASH one at a time (each fades in, holds, fades
          out before the next; line 2 holds to the scene end). Same fixed position. */}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
        {[
          // Both lines are the SAME duration (53f each: 6f in · 41f hold · 6f out),
          // with a 3f gap between them, so the pacing is perfectly consistent. They
          // span the same 114→223 window the old 3 lines used (ending 2f before the
          // S1 cut at 225) — the extra hold per line is the point: line 1 states the
          // stat, line 2 is the payoff, and both need reading time.
          { text: <>The portal is open as little as <span style={{ color: colors.accentOrange }}>15 days</span></>, start: 114, end: 167 },
          { text: <>Start recruiting <span style={{ color: colors.accentOrange }}>before</span> it opens</>, start: 170, end: 223 },
        ].map((l, i) => {
          // All lines fade in (rise), hold, then fade out before the next / the
          // scene cut. Snappier 6f fades leave each line at its FINAL state a touch
          // longer (subtle extra hold) without overrunning the S1→S2 cut.
          const op = interpolate(frame, [l.start, l.start + 6, l.end - 6, l.end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          // Same rise-in animation as the old S1 lines: spring 22px → 0 on entry.
          const riseS = spring({ frame: frame - l.start, fps, config: { damping: 200 } });
          const rise = interpolate(riseS, [0, 1], [22, 0]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: `calc(50% + ${RA_SUBTITLE_TOP}px)`,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily,
                fontWeight: 700,
                fontSize: 58,
                letterSpacing: "-0.02em",
                color: colors.white,
                opacity: op,
                transform: `translateY(${rise}px)`,
              }}
            >
              {l.text}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 3 — REC-1 (f210–420) ────────────────────────────────────────
const Scene03Rec1: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 210], [0, 1], { extrapolateRight: "clamp" });
  const wipe = interpolate(frame, [200, 210], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <ClipFrame src={CLIP.rec1.src} startFrom={CLIP.rec1.startFrom} durationInFrames={210} />
      <CaptionBand progress={progress}>
        <KeywordSwap
          items={[
            { at: 20, text: "THE OLD WAY" },
            { at: 120, text: "ENDLESS SCROLLING" },
            { at: 185, text: "THAT ENDS NOW.", color: colors.accentOrange },
          ]}
        />
      </CaptionBand>
      {/* orange sweep wipe out */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${wipe}%`, background: gradients.landingHero, borderRight: `6px solid ${colors.accentOrange}` }} />
    </AbsoluteFill>
  );
};

// ── SCENE 4 — Slide: meet the AI RA (f420–555) ────────────────────────
const Scene04MeetRA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoS = spring({ frame, fps, config: { damping: 200 } });
  const logoY = interpolate(logoS, [0, 1], [-30, 0]);
  const pills = ["HIGH SCHOOL", "TRANSFER PORTAL"];
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img src={logo} style={{ width: 90, marginBottom: 40, transform: `translateY(${logoY}px)`, filter: `drop-shadow(0 0 24px ${colors.accentOrange}55)` }} />
        <div style={heroStyle}>
          <WordReveal text="AI Recruiting Assistant" startFrame={10} />
        </div>
        <div style={{ marginTop: 24, fontFamily, fontWeight: 600, fontSize: 42, letterSpacing: "-0.02em", color: colors.cerulean }}>
          <TypeOn text="The only recruiting tool you'll need." startFrame={45} charsPerFrame={0.9} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <OrangeSweep startFrame={60} width={460} />
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 40 }}>
          <ChipSnap labels={pills} startFrame={70} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 4 V2 - Slide: meet the AI RA (f420–555) ─────────────────────
// Revision (scene-revisioning.md): removed HIGH SCHOOL / TRANSFER PORTAL pills
// and the orange sweep line; cursor hides when typing finishes (no constant
// blink); the "only recruiting tool" line is now orange.
const Scene04MeetRA_V2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoS = spring({ frame, fps, config: { damping: 200 } });
  const logoY = interpolate(logoS, [0, 1], [-30, 0]);
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img src={logo} style={{ width: 90, marginBottom: 40, transform: `translateY(${logoY}px)`, filter: `drop-shadow(0 0 24px ${colors.accentOrange}55)` }} />
        <div style={heroStyle}>
          <WordReveal text="AI Recruiting Assistant" startFrame={10} />
        </div>
        <div style={{ marginTop: 24, fontFamily, fontWeight: 600, fontSize: 42, letterSpacing: "-0.02em", color: colors.accentOrange }}>
          <TypeOn text="The only recruiting tool you'll need." startFrame={45} charsPerFrame={0.9} hideCursorWhenDone />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 5 — REC-2: one prompt → best fit (f555–765) ─────────────────
const Scene05Rec2: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <ClipFrame src={CLIP.rec2.src} startFrom={CLIP.rec2.startFrom} durationInFrames={210} />
      <PromptChip text={`"Find me tall QBs, class of 2027, 6'+, 180+ lbs"`} startFrame={10} />
      {frame >= 85 && (
        <div style={{ position: "absolute", top: 180, left: 0, right: 0 }}>
          <ChipSnap
            labels={["POSITION: QB", "CLASS 2027", `HEIGHT 6'0"+`, "WEIGHT 180+"]}
            startFrame={85}
          />
        </div>
      )}
      {frame >= 145 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <PulseRing startFrame={145} size={300} />
        </AbsoluteFill>
      )}
      <CaptionBand>
        <KeywordSwap
          items={[
            { at: 25, text: "ONE PROMPT" },
            { at: 145, text: "BEST FIT, INSTANTLY", color: colors.accentOrange },
          ]}
        />
      </CaptionBand>
    </AbsoluteFill>
  );
};

// ── SCENE 8 — Slide: keep asking ──────────────────────────────────────
// (S6 Transfers + S7 REC-3 removed — transfer players will be folded into
//  the S5 recording later.)
const Scene08KeepAsking: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bubbles = ['"What are their offers?"', '"Who has the highest GPA?"', '"Any from Texas?"'];
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Eyebrow>AND THERE'S MORE</Eyebrow>
        <div style={heroStyle}>
          <WordReveal text="Just keep asking." startFrame={8} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 46, alignItems: "flex-end", width: 720 }}>
          {bubbles.map((b, i) => {
            const local = frame - 30 - i * 8;
            const s = spring({ frame: local, fps, config: { damping: 200 } });
            const y = interpolate(s, [0, 1], [30, 0]);
            const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ transform: `translateY(${y}px)`, opacity, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px 18px 4px 18px", padding: "16px 24px", fontFamily, fontWeight: 500, fontSize: 34, color: colors.white }}>
                {b}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 8 V2 - Keep Asking (revised) ─────────────────────────────────
// Revision: removed "AND THERE'S MORE" eyebrow; kept "Just keep asking."; three
// chat-bubble options (3rd is "Who has the best stats?"); a cursor appears and
// CLICKS the third option (which leads into RA Output 2).
const S8_OPTIONS = ['"What are their offers?"', '"Who has the highest GPA?"', '"Who has the best stats?"'];
const S8_CURSOR_IN = 60; // cursor rises
const S8_AT_OPT = 84; // reaches the 3rd option
const S8_CLICK = 88; // clicks it
const Scene08KeepAsking_V2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 3rd (bottom) bubble center — cursor click target (measured from render).
  const opt3X = 1085;
  const opt3Y = 730;

  // Cursor path: rise from bottom → 3rd option → hold (click).
  let curX = opt3X;
  let curY = 1180;
  if (frame < S8_AT_OPT) {
    const t = interpolate(frame, [S8_CURSOR_IN, S8_AT_OPT], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const e = t * t * (3 - 2 * t);
    curX = interpolate(e, [0, 1], [opt3X + 80, opt3X]);
    curY = interpolate(e, [0, 1], [1180, opt3Y]);
  }
  const cursorVisible = frame >= S8_CURSOR_IN;
  const click = frame >= S8_CLICK && frame < S8_CLICK + 14 ? interpolate(frame, [S8_CLICK, S8_CLICK + 14], [0, 1]) : 0;

  // Entrance transition from RA Output: quick fade + subtle scale-up.
  const enter = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const enterScale = interpolate(frame, [0, 14], [1.04, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: enter, transform: `scale(${enterScale})` }}>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={heroStyle}>
          <WordReveal text="Just keep asking." startFrame={8} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 46, alignItems: "flex-end", width: 720 }}>
          {S8_OPTIONS.map((b, i) => {
            const local = frame - 30 - i * 8;
            const s = spring({ frame: local, fps, config: { damping: 200 } });
            const y = interpolate(s, [0, 1], [30, 0]);
            const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            // 3rd option highlights when clicked
            const isThird = i === 2;
            const highlight = isThird ? click : 0;
            return (
              <div
                key={i}
                style={{
                  transform: `translateY(${y}px) scale(${1 + highlight * 0.03})`,
                  opacity,
                  background: isThird && click > 0 ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isThird && click > 0 ? colors.accentOrange : "rgba(255,255,255,0.12)"}`,
                  borderRadius: "18px 18px 4px 18px",
                  padding: "16px 24px",
                  fontFamily,
                  fontWeight: 500,
                  fontSize: 34,
                  color: colors.white,
                }}
              >
                {b}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      {cursorVisible && <CursorArrow x={curX} y={curY} clicking={click} />}
    </AbsoluteFill>
  );
};

// ── SCENE 9 — REC-4: it remembers (f1200–1410) ────────────────────────
const Scene09Rec4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ghostOpacity = interpolate(frame, [10, 25], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const arrow = spring({ frame: frame - 25, fps, config: { damping: 200 } });
  const arrowH = interpolate(arrow, [0, 1], [0, 70]);
  return (
    <AbsoluteFill>
      <ClipFrame src={CLIP.rec4.src} startFrom={CLIP.rec4.startFrom} durationInFrames={210} />
      {/* continuity: ghosted prior prompt → connecting arrow → new prompt */}
      <div style={{ position: "absolute", top: 50, left: 60 }}>
        <div style={{ opacity: ghostOpacity, fontFamily, fontWeight: 500, fontSize: 26, color: colors.white, background: "rgba(10,17,40,0.5)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 18px", display: "inline-block" }}>
          "...transfer WRs, 500+ yds, D2 offers"
        </div>
        <div style={{ width: 3, height: arrowH, background: colors.accentOrange, marginLeft: 20, marginTop: 6 }} />
      </div>
      <PromptChip text={`"What are their D2 offers?"`} startFrame={30} top={190} />
      <CaptionBand>
        <KeywordSwap
          items={[
            { at: 15, text: "IT REMEMBERS" },
            { at: 120, text: "GO DEEPER", color: colors.accentOrange },
          ]}
        />
      </CaptionBand>
    </AbsoluteFill>
  );
};

// ── SCENE 10 — Capabilities cards (f1410–1605) ────────────────────────
const CAP_CARDS = [
  { label: "Size", sub: "Height · Weight" },
  { label: "Position", sub: "QB · WR · CB · …" },
  { label: "Stats", sub: "Pass · Rush · Rec" },
  { label: "PFF Grade", sub: "Transfer only", tag: true },
  { label: "Academics", sub: "GPA · SAT · ACT" },
  { label: "Offers", sub: "By division" },
  { label: "Location", sub: "State · Region" },
  { label: "Athleticism", sub: "Track · other sports" },
  { label: "& More", sub: "", more: true },
];
const Scene10Capabilities: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "60px 120px" }}>
        <Eyebrow color={colors.accentOrange}>ASK ABOUT ANYTHING</Eyebrow>
        <div style={{ ...heroStyle, fontSize: 88, marginBottom: 44 }}>
          <WordReveal text="Everything on a player." startFrame={6} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, width: 1200 }}>
          {CAP_CARDS.map((c, i) => {
            const local = frame - 40 - i * 4;
            const s = spring({ frame: local, fps, config: { damping: 200 } });
            const y = interpolate(s, [0, 1], [24, 0]);
            const scale = interpolate(s, [0, 1], [0.9, 1]);
            const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const morePulse = c.more ? 1 + Math.sin(Math.max(0, frame - 90) / 8) * 0.02 : 1;
            return (
              <div
                key={i}
                style={{
                  transform: `translateY(${y}px) scale(${scale * morePulse})`,
                  opacity,
                  background: c.more ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.06)",
                  border: c.more ? `2px dashed ${colors.accentOrange}` : "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 16,
                  padding: "26px 28px",
                  minHeight: 130,
                  boxShadow: c.more ? `0 0 40px ${colors.accentOrange}44` : "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontFamily, fontWeight: 700, fontSize: 38, letterSpacing: "-0.02em", color: colors.white }}>
                  {c.label}
                </div>
                {c.sub && (
                  <div style={{ fontFamily, fontWeight: 500, fontSize: 26, color: colors.textSubtle, marginTop: 8 }}>
                    {c.sub}
                  </div>
                )}
                {c.tag && (
                  <div style={{ display: "inline-block", marginTop: 10, fontFamily, fontWeight: 600, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.cerulean, border: `1px solid ${colors.cerulean}55`, borderRadius: 8, padding: "3px 10px" }}>
                    Transfer Only
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE 11 — End card ────────────────────────────────────────────────
// Original lockup animation (logo scale + word reveal + tagline settle + orange
// sweep), PLUS availability lines that fade in as the sweep pans: the official
// Apple "Download on the App Store" badge and "directrecruit.net".
export const Scene11EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const logoScale = interpolate(s, [0, 1], [0.8, 1]);
  const tagTrack = interpolate(frame, [30, 55], [6, 2.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // ── Entrance from RA Output 2: the brand gradient WIPES up from the bottom
  //    over the previous scene, and the lockup RISES + settles into place. ──
  const wipeS = spring({ frame, fps, config: { damping: 40, mass: 0.9, stiffness: 60 } });
  const wipeUp = interpolate(wipeS, [0, 1], [100, 0]); // gradient covers from bottom → full
  // Lockup rises up + fades in on its own spring, slightly after the wipe.
  const riseS = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const lockupRise = interpolate(riseS, [0, 1], [70, 0]);
  const lockupOpacity = interpolate(frame, [8, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Availability block fades/rises in as the orange sweep pans (sweep starts f55).
  const availS = spring({ frame: frame - 60, fps, config: { damping: 200 } });
  const availY = interpolate(availS, [0, 1], [24, 0]);
  const availOpacity = interpolate(frame, [60, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      {/* Brand gradient wipes up from the bottom over the previous scene. */}
      <AbsoluteFill style={{ transform: `translateY(${wipeUp}%)` }}>
        <SlideBG />
      </AbsoluteFill>
      {/* Lockup row — vertically centered; rises + fades in on entrance. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 50, opacity: lockupOpacity, transform: `translateY(${lockupRise}px)` }}>
        <div style={{ transform: `scale(${logoScale})` }}>
          <Img src={logo} style={{ width: 275 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily, fontWeight: 800, letterSpacing: "-0.02em", fontSize: 96, color: "#ffffff" }}>
            <WordReveal text="Direct Recruit" startFrame={10} style={{ justifyContent: "flex-start" }} />
          </div>
          <div style={{ fontFamily, fontWeight: 700, textTransform: "uppercase", fontSize: 32, color: colors.cerulean, letterSpacing: `${tagTrack}px`, opacity: tagOpacity, marginTop: 12 }}>
            Get Recruited · The Right Way
          </div>
          <div style={{ marginTop: 22 }}>
            <OrangeSweep startFrame={55} width={520} />
          </div>
        </div>
      </AbsoluteFill>

      {/* Availability — App Store badge + directrecruit.net, hanging below the
          centered lockup (absolute, so it doesn't affect the lockup's centering). */}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
        <div style={{ position: "absolute", top: "calc(50% + 230px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: availOpacity, transform: `translateY(${availY}px)` }}>
          <Img src={staticFile("app-store-badge.svg")} style={{ height: 84 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily, fontWeight: 700, fontSize: 34, color: colors.white }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={colors.accentOrange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            directrecruit.net
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SHARED ANCHOR (Meet-RA ↔ RA landing) ──────────────────────────────
// The logo + "AI Portal Intelligence" title render IDENTICALLY in both the
// Meet-RA scene and the RA-landing scene, centered as a pair, so they don't
// move across the scene cut. Only the content BELOW changes (subtitle → box).
export const RA_ANCHOR_LOGO_W = 120; // matches Meet-RA's shrunken lockup logo (170 × 0.7 ≈ 119)
const RA_ANCHOR_TITLE_SIZE = 96;
const RA_ANCHOR_GAP = 30; // logo bottom ↔ title top
// The TITLE is vertically centered (logo sits above it). We lift the whole pair
// up by half the (logo + gap) height so the title's center lands at frame-center.
const RA_ANCHOR_LIFT = (RA_ANCHOR_LOGO_W + RA_ANCHOR_GAP) / 2; // = 75
const RaAnchor: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${-RA_ANCHOR_LIFT}px)`, ...style }}>
    <Img src={logo} style={{ width: RA_ANCHOR_LOGO_W, marginBottom: RA_ANCHOR_GAP, display: "block" }} />
    <div style={{ ...heroStyle, fontSize: RA_ANCHOR_TITLE_SIZE, padding: 0 }}>AI Portal Intelligence</div>
  </div>
);

// The sent-prompt orange user bubble, in the SAME right-aligned conversation
// column both S5's outro and RA Output use — so it can fly from S5 into RA
// Output's resting spot with a pixel-identical endpoint (no flash at the cut).
// RA_CONV_TOP is the column's marginTop (matches RA Output). `opacity`/`offsetY`
// animate the fly-in; at rest (opacity 1, offsetY 0) it sits exactly where RA
// Output draws it.
const RA_CONV_TOP = 286; // = RAO_ANCHOR_CENTER_Y (176) + 110; inlined to avoid a forward ref
const RaPromptBubble: React.FC<{ opacity?: number; offsetY?: number }> = ({ opacity = 1, offsetY = 0 }) => (
  <AbsoluteFill style={{ alignItems: "center" }}>
    <div style={{ width: 1560, marginTop: RA_CONV_TOP, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", opacity, transform: `translateY(${offsetY}px)` }}>
        <div style={{ maxWidth: 1050, background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 24, lineHeight: 1.4, padding: "16px 24px", borderRadius: 18, borderBottomRightRadius: 6 }}>
          {RA_PROMPT}
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ── SCENE 5 (NEW) - AI RA landing (look-alike of the in-platform UI) ───
// Replaces the S5 screen recording. Format follows the reference photo
// (centered: mark → title → chat input), on the DR brand. Static for now;
// typing/results animation comes later.
const RaSendIcon: React.FC = () => (
  // Paper-plane send icon (matches the real .ra-send-btn svg)
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// The chatbox — shared between the RA landing entrance and later animation.
const RaChatBox: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      width: 1200,
      background: "rgba(254,252,251,0.04)",
      border: "1.5px solid rgba(255,107,53,0.28)",
      borderRadius: 22,
      padding: "22px 22px 22px 34px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 24,
      boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
      ...style,
    }}
  >
    <div style={{ fontFamily, fontWeight: 500, fontSize: 34, letterSpacing: "-0.01em", color: "rgba(254,252,251,0.35)", whiteSpace: "nowrap" }}>
      Describe the player you're looking for...
    </div>
    <div
      style={{
        width: 62,
        height: 62,
        borderRadius: 16,
        flexShrink: 0,
        background: colors.accentOrange,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 8px 24px ${colors.accentOrange}55`,
      }}
    >
      <RaSendIcon />
    </div>
  </div>
);

// Vertical offset from screen-center to where below-content (subtitle / chatbox)
// hangs. Same value used in BOTH scenes so the anchor pair stays centered and
// the content lines up. The anchor pair is centered; content sits below it.
const RA_CONTENT_TOP = 140; // chatbox: px below frame-center (kept — good spot)
const RA_SUBTITLE_TOP = 95; // orange subtitle: closer to the title than the chatbox

// ── Web cursor (macOS-style arrow) for the demo interaction ───────────
const CursorArrow: React.FC<{ x: number; y: number; clicking?: number }> = ({ x, y, clicking = 0 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-3px,-3px)", pointerEvents: "none", zIndex: 50 }}>
    {/* click ripple */}
    {clicking > 0 && (
      <div
        style={{
          position: "absolute",
          left: 2,
          top: 2,
          width: 40,
          height: 40,
          marginLeft: -20,
          marginTop: -20,
          borderRadius: "50%",
          border: `2px solid ${colors.accentOrange}`,
          transform: `scale(${0.4 + clicking * 0.9})`,
          opacity: (1 - clicking) * 0.9,
        }}
      />
    )}
    <svg width="30" height="30" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }}>
      <path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18.5 13.5 Z" fill="#fff" stroke="#0a1128" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  </div>
);

// Chatbox positions (frame coords, 1920×1080). Chatbox is 1200 wide, centered
// (x 360→1560), vertical center y = 540 + RA_CONTENT_TOP = 680.
const RA_BOX_CX = 960;
const RA_BOX_CY = 540 + RA_CONTENT_TOP; // 680
const RA_BOX_LEFT = RA_BOX_CX - 600; // 360
const RA_DESCRIBE_X = RA_BOX_LEFT + 34 + 90; // left padding + ~middle of "Describe"
const RA_SEND_CX = RA_BOX_CX + 600 - 22 - 31; // right edge - padding - half button ≈ 1507
const RA_PROMPT = "Find me QBs who may hit the portal that are 6ft 2in+, 195lb+, and threw over 15TD last season";
// Approx px width per character at 34px Inter weight-500 (for text-scroll math).
const RA_CHAR_W = 18.2;
// Visible text width inside the box (box 1200 - left pad 34 - gap 24 - button 62 - right pad 22).
const RA_TEXT_VIEW_W = 1200 - 34 - 24 - 62 - 22; // ≈ 1058

// The chatbox with TYPED text (single line, clips + scrolls left as it grows).
// `sendPulse` (0→1) presses the send button (scale dip) like a real click.
const RaChatBoxTyped: React.FC<{ typed: string; showPlaceholder: boolean; textScroll: number; sendPulse?: number }> = ({ typed, showPlaceholder, textScroll, sendPulse = 0 }) => (
  <div
    style={{
      width: 1200,
      background: "rgba(254,252,251,0.04)",
      border: "1.5px solid rgba(255,107,53,0.28)",
      borderRadius: 22,
      padding: "22px 22px 22px 34px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 24,
      boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
      boxSizing: "border-box",
    }}
  >
    {/* text region — LEFT-anchored: letters appear from the left and the whole
        line slides left (negative margin) once it exceeds the visible width, so
        the growing end (caret) stays in view. */}
    <div style={{ flex: 1, overflow: "hidden", minWidth: 0, display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          fontFamily,
          fontWeight: 500,
          fontSize: 34,
          letterSpacing: "-0.01em",
          color: showPlaceholder ? "rgba(254,252,251,0.35)" : colors.white,
          whiteSpace: "nowrap",
          marginLeft: showPlaceholder ? 0 : `-${textScroll}px`, // slide left as it grows
        }}
      >
        {showPlaceholder ? "Describe the player you're looking for..." : typed}
      </div>
    </div>
    <div
      style={{
        width: 62,
        height: 62,
        borderRadius: 16,
        flexShrink: 0,
        // Button-press pulse: dip to 0.88 then back to 1 (sin bump on 0→1).
        transform: `scale(${1 - Math.sin(sendPulse * Math.PI) * 0.12})`,
        background: sendPulse > 0 ? "#ff7d4d" : colors.accentOrange,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 8px 24px ${colors.accentOrange}${sendPulse > 0 ? "88" : "55"}`,
      }}
    >
      <RaSendIcon />
    </div>
  </div>
);

// ── S5 interaction timing (local frames) ──────────────────────────────
const S5_CURSOR_IN = 30; // cursor rises from bottom
const S5_AT_DESCRIBE = 50; // reaches "Describe"
const S5_CLICK1 = 52; // clicks Describe (ON the box)
const S5_ZOOM_START = 60;
const S5_ZOOM_END = 80;
const S5_TYPE_START = 84;
const S5_TYPE_CPS = 1.4; // a little slower typing
const S5_TYPE_END = S5_TYPE_START + Math.ceil(RA_PROMPT.length / S5_TYPE_CPS);
const S5_TO_SEND_START = S5_TYPE_END + 10; // begin moving cursor to send after typing
const S5_CLICK2 = S5_TO_SEND_START + 26; // slower move to send (26 frames), then click
const S5_END = S5_CLICK2 + 45; // trailing time for later additions

const Scene05_RaLanding: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Chatbox entrance (unchanged).
  const boxS = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const boxY = interpolate(boxS, [0, 1], [40, 0]);
  const boxOpacity = interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Typing ──
  const typedCount = Math.max(0, Math.min(RA_PROMPT.length, Math.floor((frame - S5_TYPE_START) * S5_TYPE_CPS)));
  const typed = RA_PROMPT.slice(0, typedCount);
  const showPlaceholder = frame < S5_CLICK1; // placeholder until the click
  // Text scroll: once the typed line exceeds the visible width, slide it left so
  // the growing end stays in view (letters enter from the left, line scrolls left).
  const textScroll = Math.max(0, typedCount * RA_CHAR_W - RA_TEXT_VIEW_W);

  // ── Zoom into the chatbox (scale up, centered on the box) ──
  // 1.4x so the 1200px box (→1680px) still fits within the 1920 frame width.
  const zoomS = spring({ frame: frame - S5_ZOOM_START, fps, config: { damping: 200 } });
  const zoomIn = interpolate(zoomS, [0, 1], [1, 1.4], { extrapolateLeft: "clamp" });
  const zoomInShiftY = interpolate(zoomS, [0, 1], [0, -(RA_BOX_CY - 540) * 0.65], { extrapolateLeft: "clamp" });
  // OUTRO (after the send click): zoom back out to 1x smoothly for the handoff
  // into RA Output. The chatbox fades; the anchor morphs to the top (below).
  const outroS = spring({ frame: frame - (S5_CLICK2 + 6), fps, config: { damping: 200 } });
  const zoom = interpolate(outroS, [0, 1], [zoomIn, 1]);
  const zoomShiftY = interpolate(outroS, [0, 1], [zoomInShiftY, 0]);
  // Anchor morph: centered/normal (S5) → compact + top (matches RA Output's anchor).
  // RA Output anchor: logo 84px, title 60px, at marginTop 46 in a centered column.
  const anchorScale = interpolate(outroS, [0, 1], [1, 84 / RA_ANCHOR_LOGO_W]); // logo 120→84
  const anchorY = interpolate(outroS, [0, 1], [0, RAO_ANCHOR_CENTER_Y - 540]); // center → top
  // chatbox fades out a bit later in the outro so the prompt stays on screen
  // closer to the cut (then RA Output's bubble slides up into place).
  const boxOutOpacity = interpolate(frame, [S5_CLICK2 + 12, S5_CLICK2 + 26], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorOutOpacity = interpolate(frame, [S5_CLICK2 + 4, S5_CLICK2 + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Web cursor path ──
  // The cursor tip is the div's (left,top). Targets are frame-space points.
  const TIP_OFFSET = 40;                // push targets down so the tip sits ON the element
  const boxClickX = RA_DESCRIBE_X;      // click point ON the box (over "Describe")
  const boxClickY = RA_BOX_CY + TIP_OFFSET;
  const restY = RA_BOX_CY - 55;         // "slightly above the box" rest spot (less high)
  let cursorX: number;
  let cursorY: number;
  if (frame < S5_AT_DESCRIBE) {
    // rise from bottom to the box click point
    const t = interpolate(frame, [S5_CURSOR_IN, S5_AT_DESCRIBE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = t * t * (3 - 2 * t);
    cursorX = interpolate(ease, [0, 1], [RA_BOX_CX + 100, boxClickX]);
    cursorY = interpolate(ease, [0, 1], [1180, boxClickY]);
  } else if (frame < S5_ZOOM_START) {
    // hold on the box briefly during/after the click
    cursorX = boxClickX;
    cursorY = boxClickY;
  } else if (frame < S5_TO_SEND_START) {
    // after clicking, drift SLIGHTLY ABOVE the box and rest there while typing
    const t = interpolate(frame, [S5_ZOOM_START, S5_ZOOM_START + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = t * t * (3 - 2 * t);
    cursorX = boxClickX;
    cursorY = interpolate(ease, [0, 1], [boxClickY, restY]);
  } else {
    // smooth, slower move from the rest spot over to the send button. Tip lands
    // squarely on the button center (nudge down ~14px for the arrow-tip offset).
    const t = interpolate(frame, [S5_TO_SEND_START, S5_CLICK2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = t * t * (3 - 2 * t);
    cursorX = interpolate(ease, [0, 1], [boxClickX, RA_SEND_CX]);
    cursorY = interpolate(ease, [0, 1], [restY, RA_BOX_CY + TIP_OFFSET]);
  }
  const cursorVisible = frame >= S5_CURSOR_IN;
  // click ripples
  const click1 = frame >= S5_CLICK1 && frame < S5_CLICK1 + 12 ? interpolate(frame, [S5_CLICK1, S5_CLICK1 + 12], [0, 1]) : 0;
  const click2 = frame >= S5_CLICK2 && frame < S5_CLICK2 + 12 ? interpolate(frame, [S5_CLICK2, S5_CLICK2 + 12], [0, 1]) : 0;
  // Send-button press pulse (scale dip) synced with the click.
  const sendPulse = frame >= S5_CLICK2 && frame < S5_CLICK2 + 10 ? interpolate(frame, [S5_CLICK2, S5_CLICK2 + 10], [0, 1]) : 0;

  // ── Sent prompt flies up into the conversation as an orange bubble ──
  // After the send click, the same RaPromptBubble RA Output shows flies from
  // lower (near the chatbox) up to its resting spot and SETTLES before the cut,
  // so at f454→f455 the bubble is pixel-identical on both sides (no pop/slide).
  const S5_BUBBLE_START = S5_CLICK2 + 8;   // 201
  const S5_BUBBLE_SETTLE = S5_CLICK2 + 30; // 223 (settled ~6f before the cut)
  const bubbleFlyS = spring({ frame: frame - S5_BUBBLE_START, fps, config: { damping: 200 } });
  const promptBubbleY = interpolate(bubbleFlyS, [0, 1], [200, 0], { extrapolateRight: "clamp" });
  const promptBubbleOp = interpolate(frame, [S5_BUBBLE_START, S5_BUBBLE_START + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Settled anchor handoff ──
  // The animated anchor lives inside the zoom wrapper (nested transforms), which
  // rasterizes the logo/title edges SLIGHTLY differently than S3's single clean
  // transform → a sub-pixel edge shimmer at the cut. To kill it, once the outro
  // has fully landed we swap to an anchor drawn with the EXACT SAME single
  // transform S3 uses (translateY + scale(0.7), outside the zoom wrapper).
  //
  // This is a HARD SWAP on one frame — NOT an opacity crossfade. A crossfade
  // blends two semi-transparent copies, and semi-transparent text over
  // semi-transparent text doesn't sum to full opacity, so the logo/title wash
  // out to near-invisible mid-fade (the "logo disappears, line jumps" artifact).
  // By the swap frame the outro spring has settled, so the animated anchor and
  // the settled anchor are at the identical position/size → the swap is invisible.
  const S5_ANCHOR_SWAP = S5_CLICK2 + 30; // 223 — outro settled; ~7f before the cut
  const useSettledAnchor = frame >= S5_ANCHOR_SWAP;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      {/* ANCHOR — in the zoom wrapper during the interaction, but its OUTRO morph
          (shrink + move to top) is applied on top so it lands on RA Output's anchor
          exactly (seamless handoff). */}
      <AbsoluteFill
        style={{
          transform: `translateY(${zoomShiftY}px) scale(${zoom})`,
          transformOrigin: `${RA_BOX_CX}px ${RA_BOX_CY}px`,
        }}
      >
        {!useSettledAnchor && (
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <div style={{ transform: `translateY(${anchorY}px) scale(${anchorScale})` }}>
              <RaAnchor />
            </div>
          </AbsoluteFill>
        )}
        {/* Chatbox — fades out during the outro */}
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
          <div style={{ position: "absolute", top: `calc(50% + ${RA_CONTENT_TOP}px)`, transform: `translateY(${boxY}px)`, opacity: boxOpacity * boxOutOpacity }}>
            <RaChatBoxTyped typed={typed} showPlaceholder={showPlaceholder} textScroll={textScroll} sendPulse={sendPulse} />
          </div>
        </AbsoluteFill>
        {/* Web cursor — fades out during the outro */}
        {cursorVisible && (
          <div style={{ opacity: cursorOutOpacity }}>
            <CursorArrow x={cursorX} y={cursorY} clicking={Math.max(click1, click2)} />
          </div>
        )}
      </AbsoluteFill>

      {/* SETTLED anchor — drawn with the EXACT same single transform S3 (RA Output)
          uses, outside the zoom wrapper. Hard-swapped in (no crossfade) once the
          outro has settled, so the final S2 frames rasterize the logo/title
          identically to S3 → no edge shimmer, and no wash-out mid-fade. */}
      {useSettledAnchor && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ transform: `translateY(${RAO_ANCHOR_CENTER_Y - 540}px) scale(${RAO_ANCHOR_SCALE})` }}>
            <RaAnchor />
          </div>
        </AbsoluteFill>
      )}

      {/* Sent prompt bubble — flies up to RA Output's resting spot BEFORE the cut.
          Rendered in frame space (outside the zoom wrapper), same as RA Output, so
          the endpoint is pixel-identical across the scene boundary. */}
      {frame >= S5_BUBBLE_START && (
        <RaPromptBubble opacity={promptBubbleOp} offsetY={promptBubbleY} />
      )}
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════
// RA OUTPUT — result rows (faithful to the real AI RA), fit badge, dataset
// ══════════════════════════════════════════════════════════════════════

// AI Match fit badge — mirrors frontend/shared/fit-display.js/.css. `fill` (0→1)
// animates the bar fill in. Tier color drives the number, fill, and spark.
const fitTierColor = (score: number): string => {
  if (score >= 90) return "#1f9d4d";
  if (score >= 75) return "#86efac";
  if (score >= 60) return "#eab308";
  if (score >= 45) return "#f97316";
  if (score >= 30) return "#ef4444";
  return "#7f1d1d";
};
const RaFitBadge: React.FC<{ score: number; fill: number }> = ({ score, fill }) => {
  const color = fitTierColor(score);
  const pct = Math.max(4, Math.min(100, score)) * fill;
  return (
    <div style={{ flexShrink: 0, width: 132, marginLeft: "auto", display: "grid", gridTemplateColumns: "1fr auto", gridTemplateAreas: `"label num" "track track"`, alignItems: "baseline", columnGap: 8, rowGap: 6 }}>
      <span style={{ gridArea: "label", fontFamily, fontSize: 15, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.white }}>AI Match</span>
      <span style={{ gridArea: "num", fontFamily, fontSize: 30, fontWeight: 800, justifySelf: "end", color }}>{Math.round(score * fill)}</span>
      <div style={{ gridArea: "track", position: "relative", height: 8, borderRadius: 5, background: "rgba(254,252,251,0.08)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 5, boxShadow: `0 0 10px -1px ${color}` }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: "50%", width: 11, height: 11, marginLeft: -5, marginTop: -5, borderRadius: "50%", background: "#fff", boxShadow: `0 0 8px 1px ${color}` }} />
      </div>
    </div>
  );
};

// Person silhouette (no-picture avatar fallback), color = ring color.
const RaPersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="34" height="34">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth={2} />
  </svg>
);

type RaPlayer = {
  transfer: boolean;
  name: string;
  position: string;
  height: string;
  weight: string;
  gradYear?: string; // HS
  eligibility?: number; // transfer YOE
  school?: string; // HS: current school; used for state
  state?: string; // HS
  offers?: number; // HS
  prevSchool?: string; // transfer
  division?: string; // transfer
  logo?: string; // transfer: school-logo filename in public/logos
  score: number;
};

// Curated 5-player result set matching the prompt (QB, 6ft+, 190lbs+). 3 HS + 2
// transfer. Transfer schools per the user: Delta State (D2), Eastern Washington (D1 FCS).
const RA_PLAYERS: RaPlayer[] = [
  { transfer: false, name: "Marcus Ellison", position: "QB", height: "6'3\"", weight: "212 lbs", gradYear: "2026", school: "Westlake High", state: "TX", offers: 6, score: 92 },
  { transfer: true, name: "Jordan Vance", position: "QB", height: "6'2\"", weight: "205 lbs", eligibility: 2, prevSchool: "Delta State University", division: "D2", logo: "delta_state.png", score: 84 },
  { transfer: false, name: "Tyler Brooks", position: "QB", height: "6'1\"", weight: "198 lbs", gradYear: "2027", school: "Mater Dei", state: "CA", offers: 4, score: 71 },
  { transfer: true, name: "Cameron Diaz", position: "QB", height: "6'4\"", weight: "220 lbs", eligibility: 3, prevSchool: "Eastern Washington University", division: "D1 FCS", logo: "eastern_washington.png", score: 63 },
  { transfer: false, name: "Devin Carter", position: "QB", height: "6'2\"", weight: "195 lbs", gradYear: "2026", school: "Bishop Gorman", state: "NV", offers: 3, score: 58 },
];

// One result row — faithful to .ra-player-row. `fitFill` (0→1) fills the AI Match bar.
const RaPlayerRow: React.FC<{ p: RaPlayer; fitFill: number }> = ({ p, fitFill }) => {
  const ringColor = p.transfer ? "#dc2626" : "#1282a2";
  const line2 = [p.position, p.height, p.weight, p.transfer ? `YOE: ${p.eligibility} year${(p.eligibility ?? 0) > 1 ? "s" : ""}` : p.gradYear]
    .filter(Boolean)
    .join(" • ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 22px", borderBottom: "1px solid rgba(254,252,251,0.06)", minHeight: 80 }}>
      {/* avatar with colored ring + person SVG */}
      <div style={{ width: 62, height: 62, minWidth: 62, borderRadius: "50%", border: `3px solid ${ringColor}`, background: p.transfer ? "rgba(220,38,38,0.15)" : "rgba(18,130,162,0.15)", color: ringColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <RaPersonSvg />
      </div>
      {/* info */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 26, color: colors.white, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          {p.name}
          {p.transfer && p.logo && (
            <Img
              src={staticFile(`logos/${p.logo}`)}
              style={{ width: 26, height: 26, objectFit: "contain", borderRadius: 3, filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)" }}
            />
          )}
        </div>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 21, color: ringColor, whiteSpace: "nowrap" }}>{line2}</div>
        <div style={{ fontFamily, fontWeight: 600, fontSize: 21, color: "rgba(254,252,251,0.6)", whiteSpace: "nowrap" }}>
          {p.transfer ? (
            <>
              <span style={{ color: "rgba(254,252,251,0.4)" }}>Previously:</span> {p.prevSchool} ({p.division})
            </>
          ) : (
            <>
              {p.school}, {p.state} • <span style={{ color: colors.accentOrange, fontWeight: 700 }}>Offers: {p.offers}</span>
            </>
          )}
        </div>
      </div>
      {/* AI Match badge */}
      <RaFitBadge score={p.score} fill={fitFill} />
      {/* actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontFamily, fontWeight: 600, fontSize: 20, color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          Save
        </div>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 20, color: colors.white, background: p.transfer ? "#dc2626" : "#1282a2", borderRadius: 10, padding: "12px 22px" }}>View Profile</div>
      </div>
    </div>
  );
};

// ── SCENE: RA Output — prompt bubble → thinking → 5 result rows ────────
// Opens by shrinking the logo + "AI Portal Intelligence" to their normal size
// but positioned toward the TOP; the sent prompt appears as an orange user
// bubble below; a "…" typing indicator thinks briefly; then 5 rows reveal one
// at a time (cinematic stagger).
// The RA-Output header uses the SAME centered RaAnchor as Meet-RA / S5, shrunk
// (0.7) and lifted to the top, so S5's outro can morph into it seamlessly (no
// "new scene render" look). These must match S5's outro end-state exactly.
const RAO_ANCHOR_SCALE = 0.7;             // RaAnchor logo 120→84
const RAO_ANCHOR_CENTER_Y = 176;          // y of the anchor's (shrunk) title center near top
const RAO_BUBBLE_IN = 0; // prompt bubble appears immediately
const RAO_THINK_START = 0; // loading/thinking bubble appears at frame 0 (no gap after the prompt)
const RAO_THINK_END = 78; // typing dots show f0→78
const RAO_ROWS_START = 82; // the PI card lands
const RAO_ROW_STAGGER = 12; // frames between staggered reveals
const RAO_FIT_DELAY = 6; // fit bar starts filling after the card lands
// The card's three evidence sections stagger in after the card itself has settled.
const RAO_SECTIONS_START = RAO_ROWS_START + 14;
const RAO_SECTION_COUNT = 3;
// How far the conversation eases upward as the card's sections reveal, so the
// full card (through the browsing section) ends up inside the frame. Tuned to
// the card's rendered height — dropping the AI Match bar made the card ~70px
// shorter, so this scrolls less and the header stays in view longer.
const RAO_SCROLL_UP = 235;
// The scene is DONE the moment the scroll-up settles — the last section has
// already faded in 12 frames earlier, so anything past this is a static hold.
// S3 cuts here so it moves straight into S4's push-in with no dead beat.
// (Must match the scrollUp interpolate's end frame below.)
const RAO_END = RAO_SECTIONS_START + RAO_SECTION_COUNT * RAO_ROW_STAGGER + 8;

// ══════════════════════════════════════════════════════════════════════
// PI OUTPUT CARD — a faithful rebuild of .pi-player-card
// (frontend/collegecoach/tabs/portal-intelligence.js createPlayerCard +
//  frontend/collegecoach/tabs/transfer-portal.css)
//
// The real card is sized in rem for a ~380px sidebar column. Here it renders at
// PI_CARD_W (1140 — the SAME width as the AI RA output rows, per direction), so
// every font/padding from the CSS is multiplied by PI_S. Ratios, colors, border
// radii, and section order are all preserved exactly; only the scale changes.
//
// Per direction, "bio + film" is treated as the bio signal, so this card shows
// the two signals the user named (bio change, profile viewing) PLUS the third
// one the real product has — portal keywords — which is the strongest signal.
const PI_CARD_W = 1140; // matches the RA output row block width
// rem→px scale. The card must fit between the prompt bubble (~y416) and the
// frame bottom, so the whole thing — header, stats, fit bar, badges, and all
// three evidence sections — is visible at once. 1.5 keeps the smallest text
// (0.65rem stat labels → ~16px) readable at 1080p while fitting that budget.
const PI_S = 1.5;
const px = (rem: number) => Math.round(rem * 16 * PI_S);

// Signal palette — exact hex values from transfer-portal.css.
const PI_SIGNAL = {
  portal_keywords: { label: "Portal Keywords", color: "#ef4444", rgb: "239, 68, 68" },
  bio_and_film: { label: "Bio + New Film", color: "#f59e0b", rgb: "245, 158, 11" },
  browsing_coaches: { label: "Browsing Coaches", color: "#8b5cf6", rgb: "139, 92, 246" },
} as const;

// The demo player: a Delta State QB flagged on all three signals. Bio is drawn
// from SIGNALING_BIOS in backend/scripts/seed-demo-bots.js, so the matched
// keywords below are real PORTAL_KEYWORDS hits.
const PI_PLAYER = {
  name: "Jordan Vance",
  position: "QB",
  height: `6'2"`,
  weight: "205 lbs",
  gpa: "3.4",
  school: "Delta State University",
  division: "D2",
  logo: "delta_state.png",
  score: 88,
  bio: "Weighing my options. Open to the transfer portal for the right fit.",
  matchedKeywords: ["weighing my options", "transfer", "portal"],
  bioUpdated: "Mar 14, 2026",
  highlights: [
    { title: "2025 Season Highlights", type: "Season", uploaded: "Mar 14, 2026" },
    { title: "vs. Valdosta State - 4 TD", type: "Game", uploaded: "Mar 11, 2026" },
  ],
  programsBrowsed: 4,
  totalViews: 11,
  recentActivity: "Mar 15, 2026, Mar 12, 2026, Mar 9, 2026",
};

// Small colored pill (.pi-signal-badge). Icons mirror the real SVGs.
const PiSignalBadge: React.FC<{ kind: keyof typeof PI_SIGNAL }> = ({ kind }) => {
  const s = PI_SIGNAL[kind];
  const ic = px(0.75);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: px(0.25),
        fontFamily,
        fontSize: px(0.7),
        fontWeight: 600,
        padding: `${px(0.19)}px ${px(0.5)}px`,
        borderRadius: px(0.75),
        color: s.color,
        background: `rgba(${s.rgb}, 0.12)`,
        border: `1px solid rgba(${s.rgb}, 0.25)`,
        whiteSpace: "nowrap",
      }}
    >
      <svg width={ic} height={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        {kind === "portal_keywords" && (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>)}
        {kind === "bio_and_film" && (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>)}
        {kind === "browsing_coaches" && (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>)}
      </svg>
      {s.label}
    </span>
  );
};

// One evidence block (.pi-signal-section) — left border tinted per signal.
const PiSection: React.FC<{ kind: keyof typeof PI_SIGNAL; icon: string; title: string; children: React.ReactNode }> = ({ kind, icon, title, children }) => (
  <div
    style={{
      background: "rgba(0,0,0,0.2)",
      borderRadius: px(0.5),
      padding: `${px(0.625)}px ${px(0.75)}px`,
      borderLeft: `${px(0.19)}px solid rgba(${PI_SIGNAL[kind].rgb}, 0.6)`,
    }}
  >
    <div style={{ fontFamily, fontSize: px(0.78), fontWeight: 700, color: "rgba(254,252,251,0.85)", marginBottom: px(0.375), display: "flex", alignItems: "center", gap: px(0.375) }}>
      <span style={{ fontSize: px(0.85) }}>{icon}</span> {title}
    </div>
    {children}
  </div>
);

const PiMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily, fontSize: px(0.72), color: "rgba(254,252,251,0.45)", marginBottom: px(0.25) }}>{children}</div>
);

const PiBioLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily, fontSize: px(0.7), fontWeight: 600, color: "rgba(254,252,251,0.55)", marginBottom: px(0.19), textTransform: "uppercase", letterSpacing: px(0.3) / 16 }}>{children}</div>
);

// Bio text with each matched keyword wrapped in the red <mark> highlight, exactly
// like the real card's regex pass over kw.matched_keywords.
const PiHighlightedBio: React.FC<{ bio: string; keywords: string[] }> = ({ bio, keywords }) => {
  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = bio.split(pattern);
  return (
    <div style={{ fontFamily, fontSize: px(0.75), color: "rgba(254,252,251,0.7)", lineHeight: 1.5, background: "rgba(0,0,0,0.15)", padding: `${px(0.5)}px ${px(0.625)}px`, borderRadius: px(0.375), border: "1px solid rgba(254,252,251,0.06)" }}>
      {parts.map((part, i) =>
        keywords.some(k => k.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} style={{ background: "rgba(239,68,68,0.25)", color: "#fca5a5", padding: `0 ${px(0.19)}px`, borderRadius: px(0.19), fontWeight: 600 }}>{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </div>
  );
};

// The full PI card. `sectionReveal` (one 0→1 per signal) staggers the three
// evidence sections — and their matching badges — in.
const PiPlayerCard: React.FC<{ sectionReveal: number[] }> = ({ sectionReveal }) => {
  const p = PI_PLAYER;
  return (
    <div
      style={{
        width: PI_CARD_W,
        boxSizing: "border-box",
        background: "rgba(254,252,251,0.04)",
        border: "1px solid rgba(18,130,162,0.2)",
        borderRadius: px(0.75),
        padding: px(0.875),
      }}
    >
      {/* Header — avatar, name, position badge */}
      <div style={{ display: "flex", alignItems: "center", gap: px(0.625), marginBottom: px(0.625) }}>
        <div style={{ width: px(2.6), height: px(2.6), borderRadius: "50%", border: `${px(0.19)}px solid #1282a2`, background: "rgba(18,130,162,0.15)", color: "#1282a2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <RaPersonSvg />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily, fontSize: px(0.95), fontWeight: 700, color: colors.white, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: px(0.375) }}>
            {p.name}
            <Img src={staticFile(`logos/${p.logo}`)} style={{ width: px(1.0), height: px(1.0), objectFit: "contain", borderRadius: 3, filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)" }} />
          </div>
          <div style={{ display: "flex", gap: px(0.25), marginTop: px(0.19) }}>
            <span style={{ fontFamily, fontSize: px(0.7), fontWeight: 600, color: "#1282a2", background: "rgba(18,130,162,0.12)", padding: `${px(0.06)}px ${px(0.375)}px`, borderRadius: px(0.25) }}>{p.position}</span>
          </div>
        </div>
      </div>

      {/* Stat row — Height / Weight / GPA, hairline rules top and bottom */}
      <div style={{ display: "flex", gap: px(0.75), marginBottom: px(0.5), padding: `${px(0.5)}px 0`, borderTop: "1px solid rgba(254,252,251,0.06)", borderBottom: "1px solid rgba(254,252,251,0.06)" }}>
        {[["Height", p.height], ["Weight", p.weight], ["GPA", p.gpa]].map(([label, value]) => (
          <div key={label} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily, fontSize: px(0.65), color: "rgba(254,252,251,0.4)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em" }}>{label}</div>
            <div style={{ fontFamily, fontSize: px(0.85), fontWeight: 700, color: colors.white, marginTop: px(0.125) }}>{value}</div>
          </div>
        ))}
      </div>

      {/* School line */}
      <div style={{ display: "flex", alignItems: "center", gap: px(0.375), fontFamily, fontSize: px(0.8), color: "rgba(254,252,251,0.6)", marginBottom: px(0.625) }}>
        <svg width={px(0.875)} height={px(0.875)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
        {p.school} ({p.division})
      </div>

      {/* NOTE: the real PI card renders an AI Match fit bar here (FitDisplay,
          'bar' variant) between the school line and the signal badges. It is
          intentionally omitted in this video so the card reads purely as portal
          SIGNALS — the fit score is an AI RA idea and splits the focus. Restore
          by dropping <RaFitBadge score={p.score} fill={fitFill} /> back in. */}

      {/* Signal badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: px(0.375), marginBottom: px(0.5) }}>
        {(["portal_keywords", "bio_and_film", "browsing_coaches"] as const).map((k, i) => (
          <div key={k} style={{ opacity: sectionReveal[i] ?? 0 }}>
            <PiSignalBadge kind={k} />
          </div>
        ))}
      </div>

      {/* Evidence sections — same order the real card builds them:
          keywords → bio+film → browsing. */}
      <div style={{ display: "flex", flexDirection: "column", gap: px(0.5) }}>
        <div style={{ opacity: sectionReveal[0] ?? 0 }}>
          <PiSection kind="portal_keywords" icon="🔍" title="Portal Keywords Detected">
            <div style={{ display: "flex", flexWrap: "wrap", gap: px(0.25), marginBottom: px(0.375) }}>
              {p.matchedKeywords.map(k => (
                <span key={k} style={{ fontFamily, fontSize: px(0.68), padding: `${px(0.125)}px ${px(0.5)}px`, borderRadius: px(0.625), background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)", fontWeight: 500 }}>{k}</span>
              ))}
            </div>
            <div style={{ margin: `${px(0.375)}px 0` }}>
              <PiBioLabel>Player's Bio:</PiBioLabel>
              <PiHighlightedBio bio={p.bio} keywords={p.matchedKeywords} />
            </div>
            <PiMeta>Bio last updated: {p.bioUpdated}</PiMeta>
          </PiSection>
        </div>

        <div style={{ opacity: sectionReveal[1] ?? 0 }}>
          <PiSection kind="bio_and_film" icon="🎬" title="Bio Updated + New Film Uploaded">
            {/* Bio intentionally NOT repeated here — the real card suppresses it
                when the keywords section already showed it (bioAlreadyShown). */}
            <div style={{ marginTop: px(0.375) }}>
              <PiBioLabel>Recent Highlights:</PiBioLabel>
              {p.highlights.map(hl => (
                <div key={hl.title} style={{ display: "flex", flexDirection: "column", padding: `${px(0.3)}px ${px(0.5)}px`, marginTop: px(0.19), background: "rgba(245,158,11,0.06)", borderRadius: px(0.3), border: "1px solid rgba(245,158,11,0.12)" }}>
                  <span style={{ fontFamily, fontSize: px(0.74), fontWeight: 600, color: "rgba(254,252,251,0.8)" }}>{hl.title}</span>
                  <span style={{ fontFamily, fontSize: px(0.68), color: "rgba(254,252,251,0.4)" }}>{hl.type} · Uploaded {hl.uploaded}</span>
                </div>
              ))}
            </div>
          </PiSection>
        </div>

        <div style={{ opacity: sectionReveal[2] ?? 0 }}>
          <PiSection kind="browsing_coaches" icon="👁" title="Browsing Coaches From Other Programs">
            <PiMeta>{p.programsBrowsed} different programs · {p.totalViews} total coach profile views</PiMeta>
            <PiMeta>Recent activity: {p.recentActivity}</PiMeta>
          </PiSection>
        </div>
      </div>
    </div>
  );
};

const RaThinkingDots: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", gap: 8, padding: "18px 24px", background: "rgba(254,252,251,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 20, borderBottomLeftRadius: 8 }}>
      {[0, 1, 2].map((i) => {
        const t = ((frame - i * 6) % 42) / 42;
        const bounce = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
        return <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(255,107,53,0.6)", transform: `translateY(${-8 * bounce}px)`, opacity: 0.4 + 0.6 * bounce }} />;
      })}
    </div>
  );
};

const SceneRaOutput: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entry: the S5 view was zoomed ~1.4x on the chatbox. Shrink back to 1x AND
  // move the logo/title up to the top. Anchor scale 1 (normal size).
  const settle = spring({ frame, fps, config: { damping: 200 } });
  // Anchor group: normal size, positioned toward the top.
  // logo at RAO_ANCHOR_TOP; title just below it.

  // The prompt bubble is ALREADY AT REST from f0 — S5's outro flies the same
  // orange bubble up to this exact spot and settles it BEFORE the cut, so at the
  // scene boundary the bubble is pixel-identical on both sides (no slide/fade/pop).
  const bubbleIn = 1;
  const bubbleY = 0;
  const thinking = frame >= RAO_THINK_START && frame < RAO_THINK_END;
  // Fully visible at frame 0 (no fade-in gap), fades out just before the rows.
  const thinkOpacity = interpolate(frame, [RAO_THINK_START, RAO_THINK_END - 4, RAO_THINK_END], [1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Conversation scroll-up ──
  // The PI card is much taller than a single RA row: with the anchor + prompt
  // bubble above it, the third evidence section would sit below the frame. So as
  // the sections stagger in, the whole conversation (bubble + card) eases upward
  // — exactly how the real chat keeps the newest content in view, and the same
  // idea S4 uses with its bottom-anchored column. The anchor/header stays put.
  const scrollUp = interpolate(
    frame,
    [RAO_SECTIONS_START, RAO_SECTIONS_START + RAO_SECTION_COUNT * RAO_ROW_STAGGER + 8],
    [0, -RAO_SCROLL_UP],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) }
  );
  // Header fades as it pans off the top, so it doesn't crowd the card's edge.
  const anchorFade = interpolate(
    frame,
    [RAO_SECTIONS_START, RAO_SECTIONS_START + RAO_ROW_STAGGER * 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      {/* SHARED anchor — same centered RaAnchor as S5, shrunk (0.7) and lifted to
          the top. S5's outro morphs into this exact state, so the handoff has no
          "new scene render" look. Origin center → translate up to RAO_ANCHOR_CENTER_Y. */}
      {/* The header scrolls up WITH the conversation (rather than staying pinned)
          so the card never slides underneath it — the whole view pans, like a real
          chat scrolling. It also fades as it leaves, keeping the card the focus. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `translateY(${scrollUp}px)`, opacity: anchorFade }}>
        <div style={{ transform: `translateY(${RAO_ANCHOR_CENTER_Y - 540}px) scale(${RAO_ANCHOR_SCALE})` }}>
          <RaAnchor />
        </div>
      </AbsoluteFill>
      {/* Sent prompt — shared bubble, already at rest (S5 flew it here). It rides
          the same scroll-up as the card so the conversation stays coherent. */}
      <div style={{ transform: `translateY(${scrollUp}px)` }}>
        <RaPromptBubble opacity={bubbleIn} offsetY={bubbleY} />
      </div>
      {/* Conversation column — thinking / card, below the anchor+bubble. */}
      <AbsoluteFill style={{ alignItems: "center", transform: `translateY(${scrollUp}px)` }}>
        <div style={{ width: 1560, marginTop: RAO_ANCHOR_CENTER_Y + 110, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Spacer matching the bubble's height so rows sit below it */}
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", visibility: "hidden" }}>
            <div style={{ maxWidth: 1050, fontFamily, fontWeight: 500, fontSize: 24, lineHeight: 1.4, padding: "16px 24px" }}>
              {RA_PROMPT}
            </div>
          </div>

          {/* Thinking dots (assistant) */}
          {thinking && (
            <div style={{ width: "100%", display: "flex", marginTop: 18, opacity: thinkOpacity }}>
              <RaThinkingDots />
            </div>
          )}

          {/* PI result — ONE card (a Delta State QB flagged on all three portal
              signals), LEFT-aligned at the same 1140 width the RA rows used.
              It lands with the SAME entrance the RA rows used (spring rise +
              scale-up + fade), then its three evidence sections stagger in on the
              same RAO_ROW_STAGGER beat, so the rhythm matches the RA output. */}
          {frame >= RAO_ROWS_START && (() => {
            const cardS = spring({ frame: frame - RAO_ROWS_START, fps, config: { damping: 200 } });
            const y = interpolate(cardS, [0, 1], [26, 0]);
            const scale = interpolate(cardS, [0, 1], [0.96, 1]);
            const opacity = interpolate(frame, [RAO_ROWS_START, RAO_ROWS_START + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            // Three evidence sections fade in one at a time, one RAO_ROW_STAGGER apart.
            const sectionReveal = [0, 1, 2].map((i) => {
              const s = RAO_SECTIONS_START + i * RAO_ROW_STAGGER;
              return interpolate(frame, [s, s + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            });
            return (
              <div style={{ width: PI_CARD_W, alignSelf: "flex-start", marginTop: 18, transform: `translateY(${y}px) scale(${scale})`, opacity }}>
                <PiPlayerCard sectionReveal={sectionReveal} />
              </div>
            );
          })()}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── SCENE: RA Output 2 — follow-up "Who has the best stats?" ───────────
// A continuing chat (no logo/title): the prior prompt + its 5-row output are
// shown, the new prompt bubble slides in, thinking dots, then a text answer.
// ══════════════════════════════════════════════════════════════════════
// S4 — SIGNAL TOUR: zoom the PI card and walk the three portal signals
// ══════════════════════════════════════════════════════════════════════
// The card from S3 stays on screen and the CAMERA moves: it pushes in on the
// keywords section (explainer text beside it), then cranes down to bio+film,
// then down again to browsing. One continuous camera — never cuts — so it reads
// as a single considered move rather than three separate shots.
//
// Geometry: the card renders at its S3 resting position (the S3 scroll-up is
// already baked in below), so a section's on-screen center is a known point.
// scale() is about the frame center (960,540); to land a section's center on the
// target point we solve dx/dy analytically — see SIGNAL_STOPS.
// A section is 1098px wide at rest, so at any zoom that makes body copy readable
// it is wider than the room left beside a text panel. Rather than shrink the
// zoom until the text is illegible, we anchor the section's LEFT EDGE near the
// frame's left margin and let its right edge slide under the panel — all of a
// section's content (header, keyword tags, bio, meta) is left-aligned, so the
// meaningful part is fully visible and the empty right tail is what's covered.
const TOUR_ZOOM = 1.55;       // body copy reads comfortably at 1080p
const TOUR_SECTION_LEFT = 201; // section left edge at rest (card left 180 + pad 21)
const TOUR_FOCUS_LEFT = 90;   // where that edge lands on screen
const TOUR_FOCUS_Y = 540;     // section vertically centered
// Section centers at rest, measured from the S3 render with its scroll applied.
const TOUR_SECTION_CY = { keywords: 540, biofilm: 761.5, browsing: 939 };
const tourOffset = (cy: number) => ({
  dx: TOUR_FOCUS_LEFT - (960 + (TOUR_SECTION_LEFT - 960) * TOUR_ZOOM),
  dy: TOUR_FOCUS_Y - (540 + (cy - 540) * TOUR_ZOOM),
});

// The three explainer beats. Copy is plain-English and coach-facing: what the
// signal is, and why it means the player may be about to move.
const SIGNAL_STOPS = [
  {
    key: "keywords" as const,
    color: PI_SIGNAL.portal_keywords.color,
    eyebrow: "SIGNAL 01",
    title: "Portal Keywords",
    body: "We scan every bio for portal language. When a player starts writing like they're leaving, they usually are.",
    cy: TOUR_SECTION_CY.keywords,
  },
  {
    key: "biofilm" as const,
    color: PI_SIGNAL.bio_and_film.color,
    eyebrow: "SIGNAL 02",
    title: "New Film",
    body: "Fresh highlights uploaded out of season. Players don't rebuild their film unless someone new is meant to see it.",
    cy: TOUR_SECTION_CY.biofilm,
  },
  {
    key: "browsing" as const,
    color: PI_SIGNAL.browsing_coaches.color,
    eyebrow: "SIGNAL 03",
    title: "Browsing Coaches",
    body: "They're viewing staffs at other programs. It happens long before anything is official.",
    cy: TOUR_SECTION_CY.browsing,
  },
];

// Per-stop timing (local frames). Each stop: camera eases in, text writes on,
// holds, then text clears just before the camera moves on.
const TOUR_IN = 18;           // frames of camera travel between stops
// Frames parked on a stop. Each description is ~3 lines, and the panel doesn't
// finish writing on until ~TOUR_IN+14, so the actual read window is HOLD minus
// that lead-in. 110 makes each stop TOUR_IN+110 = 128 frames = 4.25s, equal for
// all three signals.
const TOUR_HOLD = 110;
const TOUR_STOP = TOUR_IN + TOUR_HOLD;
const TOUR_START = 10;        // beat before the first push-in
// No trailing pad: S4 ends the instant the last stop's time is up, so all three
// signals get EXACTLY one TOUR_STOP on screen (the third no longer lingers before
// the cut to the end card).
const TOUR_END = TOUR_START + SIGNAL_STOPS.length * TOUR_STOP;

// The explainer panel that sits to the right of the zoomed section.
const TourPanel: React.FC<{ stop: typeof SIGNAL_STOPS[number]; local: number }> = ({ stop, local }) => {
  const { fps } = useVideoConfig();
  // Text enters after the camera has mostly arrived, so the eye isn't tracking
  // two moving things at once.
  const t = local - TOUR_IN + 4;
  const enter = spring({ frame: t, fps, config: { damping: 200 } });
  const x = interpolate(enter, [0, 1], [46, 0]);
  const fadeIn = interpolate(t, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Clear out before the camera leaves for the next stop.
  const fadeOut = interpolate(local, [TOUR_STOP - 12, TOUR_STOP - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = fadeIn * fadeOut;
  // The rule under the eyebrow draws itself open.
  const ruleW = interpolate(enter, [0, 1], [0, 132]);
  return (
    <>
      {/* Scrim — the zoomed card runs under the panel, so fade the right side of
          the frame to the brand navy. Keeps the copy legible without a hard box
          edge, and gives the panel somewhere to sit. */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, rgba(10,17,40,0) 0%, rgba(10,17,40,0.72) 26%, rgba(10,17,40,0.94) 42%, ${colors.oxfordBlue} 60%)`,
          left: "48%",
          opacity,
        }}
      />
      {/* Vertically centered rather than pinned to a fixed top: the copy is short
          and varies by a line between stops, so centering keeps every stop
          optically balanced against the section it describes. */}
      <div style={{ position: "absolute", left: 1150, top: "50%", width: 640, opacity, transform: `translateY(-50%) translateX(${x}px)` }}>
      <div style={{ ...brandType.eyebrow, color: stop.color, fontSize: 26, marginBottom: 14 }}>{stop.eyebrow}</div>
      <div style={{ height: 4, width: ruleW, background: stop.color, borderRadius: 2, marginBottom: 26 }} />
      <div style={{ fontFamily, fontWeight: 800, fontSize: 72, lineHeight: 1.04, letterSpacing: "-0.03em", color: colors.white, marginBottom: 26 }}>
        {stop.title}
      </div>
      <div style={{ fontFamily, fontWeight: 500, fontSize: 32, lineHeight: 1.5, color: colors.white }}>
        {stop.body}
      </div>
      </div>
    </>
  );
};

const SceneSignalTour: React.FC = () => {
  const frame = useCurrentFrame();

  // Which stop are we on, and how far into it?
  const raw = Math.floor((frame - TOUR_START) / TOUR_STOP);
  const idx = Math.max(0, Math.min(SIGNAL_STOPS.length - 1, raw));
  const local = frame - TOUR_START - idx * TOUR_STOP;

  // ── Camera ──
  // Zoom eases in once at the top and then HOLDS for the whole tour; only the
  // vertical pan changes between stops. Keeping the zoom constant is what makes
  // the move read as a crane rather than a series of punch-ins.
  const zoom = interpolate(frame, [0, TOUR_START + TOUR_IN], [1, TOUR_ZOOM], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // Vertical travel: ease from the previous stop's offset to this one's.
  const target = tourOffset(SIGNAL_STOPS[idx].cy);
  const prev = tourOffset(SIGNAL_STOPS[Math.max(0, idx - 1)].cy);
  const travel = interpolate(local, [0, TOUR_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  // Before the first stop the camera is still zooming from the wide S3 view, so
  // blend the offset in from zero rather than snapping to stop 1's framing.
  const introBlend = interpolate(frame, [0, TOUR_START + TOUR_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const dx = target.dx * introBlend;
  const dy = idx === 0
    ? target.dy * introBlend
    : interpolate(travel, [0, 1], [prev.dy, target.dy]);

  // The section being discussed stays lit; the other two dim back so the eye
  // knows where to look. This is the only thing that changes inside the card.
  //
  // S3 ends with all three sections at FULL opacity, so the dimming must ease in
  // from 1 over the opening push-in rather than being applied at frame 0 —
  // otherwise the cut shows an instant brightness dip on every section.
  const dimIn = interpolate(frame, [0, TOUR_START + TOUR_IN], [1, 0.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const focusOpacity = SIGNAL_STOPS.map((_, i) => {
    if (i !== idx) return dimIn;
    // The focused section rises back to full as the camera settles on it.
    return interpolate(local, [0, TOUR_IN], [idx === 0 ? dimIn : 0.28, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      {/* The card, framed exactly as S3 left it, moved by the camera transform. */}
      <AbsoluteFill
        style={{
          transform: `translate(${dx}px, ${dy}px) scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        <AbsoluteFill style={{ alignItems: "center", transform: `translateY(${-RAO_SCROLL_UP}px)` }}>
          <div style={{ width: 1560, marginTop: RAO_ANCHOR_CENTER_Y + 110, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Same hidden spacer S3 uses, so the card sits at the identical y. */}
            <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", visibility: "hidden" }}>
              <div style={{ maxWidth: 1050, fontFamily, fontWeight: 500, fontSize: 24, lineHeight: 1.4, padding: "16px 24px" }}>
                {RA_PROMPT}
              </div>
            </div>
            <div style={{ width: PI_CARD_W, alignSelf: "flex-start", marginTop: 18 }}>
              <PiPlayerCard sectionReveal={focusOpacity} />
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Explainer panel — outside the camera transform so the type stays crisp
          and perfectly still while the card moves behind it. */}
      <TourPanel stop={SIGNAL_STOPS[idx]} local={local} />
    </AbsoluteFill>
  );
};

// ── SCENE: RA Output 2 — follow-up "Who has the best stats?" ───────────
// (Superseded by SceneSignalTour above; kept for reference / rollback.)
const RA_PROMPT2 = "Who has the best stats?";
const RA_ANSWER2 =
  "Jordan Vance has the strongest overall résumé here. As a proven transfer QB with 2 years of eligibility, he brings the most college-level production — 2,900+ passing yards and a 28:6 TD-to-INT ratio last season at Delta State — plus the mobility to extend plays. Marcus Ellison has the higher long-term ceiling, but Jordan is the most stats-proven fit right now.";

// ── Merged "Keep Asking → RA Output 2" timeline (local frames) ─────────
// Phase 1: keep-asking intro + cursor clicks the 3rd option.
const M_HEAD_IN = 8; // "Just keep asking." reveals
const M_CURSOR_IN = 34;
const M_AT_OPT = 58;
const M_CLICK = 62; // click the 3rd option
const M_MORPH_START = 74; // options/headline fade, clicked flies to bubble
const M_MORPH_END = 100; // clicked option has become the chat bubble & appended
// Phase 2: output 2
const M_THINK_START = 108;
const M_THINK_END = 150;
const M_ANSWER_START = 154;
const M_ANSWER_CPS = 2.4; // answer typing speed
const M_ANSWER_END = M_ANSWER_START + Math.ceil(RA_ANSWER2.length / M_ANSWER_CPS);
const M_END = 320; // scene ends at local frame 320
// Flying-bubble morph path (screen coords). Start = clicked 3rd option's top-left;
// End = the chat's new-prompt bubble top-left (measured from the appended layout).
const FLY_START_X = 745;
const FLY_START_Y = 688;
const FLY_END_X = 1237; // tuned to land on the chat bubble (bottom-right)
const FLY_END_Y = 942;

// Compact result-row summary (smaller, for the scrolled-up prior output).
const RaMiniRow: React.FC<{ p: RaPlayer }> = ({ p }) => {
  const ring = p.transfer ? "#dc2626" : "#1282a2";
  const line2 = [p.position, p.height, p.weight, p.transfer ? `YOE: ${p.eligibility}y` : p.gradYear].filter(Boolean).join(" • ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 18px", borderBottom: "1px solid rgba(254,252,251,0.06)" }}>
      <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: "50%", border: `2.5px solid ${ring}`, background: p.transfer ? "rgba(220,38,38,0.15)" : "rgba(18,130,162,0.15)", color: ring, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth={2} /></svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 19, color: colors.white, whiteSpace: "nowrap" }}>{p.name}</div>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 15, color: ring, whiteSpace: "nowrap" }}>{line2}</div>
      </div>
      <div style={{ marginLeft: "auto", fontFamily, fontWeight: 800, fontSize: 20, color: fitTierColor(p.score) }}>{p.score}</div>
    </div>
  );
};

// Merged scene: Keep-Asking intro → click 3rd option → it morphs into the chat
// bubble and appends to the existing RA output → thinking → 2nd text answer.
const SceneKeepAsk_Output2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Phase 1: keep-asking intro ──
  const S8_OPTIONS = ['"What are their offers?"', '"Who has the highest GPA?"', '"Who has the best stats?"'];
  const opt3X = 1085, opt3Y = 730; // 3rd bubble center (cursor target)
  let curX = opt3X, curY = 1180;
  if (frame < M_AT_OPT) {
    const t = interpolate(frame, [M_CURSOR_IN, M_AT_OPT], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const e = t * t * (3 - 2 * t);
    curX = interpolate(e, [0, 1], [opt3X + 80, opt3X]);
    curY = interpolate(e, [0, 1], [1180, opt3Y]);
  }
  const cursorVisible = frame >= M_CURSOR_IN && frame < M_MORPH_START;
  const click = frame >= M_CLICK && frame < M_CLICK + 14 ? interpolate(frame, [M_CLICK, M_CLICK + 14], [0, 1]) : 0;
  // Morph progress 0→1: clicked option flies to the chat + everything else fades.
  const morph = interpolate(frame, [M_MORPH_START, M_MORPH_END], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Keep-asking overlay fades out as the morph completes.
  const keepAskOpacity = interpolate(frame, [M_MORPH_START, M_MORPH_START + 14], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // The existing chat (prior prompt + rows + new bubble) is revealed as the morph
  // begins (so it "appends" seamlessly).
  const chatReveal = interpolate(frame, [M_MORPH_START, M_MORPH_START + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Phase 2: output 2 ──
  const thinking = frame >= M_THINK_START && frame < M_THINK_END;
  const thinkOpacity = interpolate(frame, [M_THINK_START, M_THINK_START + 6, M_THINK_END - 4, M_THINK_END], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const answerCount = Math.max(0, Math.min(RA_ANSWER2.length, Math.floor((frame - M_ANSWER_START) * M_ANSWER_CPS)));
  const answer = RA_ANSWER2.slice(0, answerCount);

  // Bottom-anchored chat: newest content sits low; the column grows upward, so
  // as thinking/answer appear the older messages scroll up off the top.
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />

      {/* Existing chat — bottom-anchored column (revealed as the morph starts) */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", opacity: chatReveal }}>
        <div style={{ width: 1200, paddingBottom: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          {/* Prior prompt */}
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
            <div style={{ maxWidth: 950, background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 24, lineHeight: 1.4, padding: "16px 24px", borderRadius: 18, borderBottomRightRadius: 6 }}>
              {RA_PROMPT}
            </div>
          </div>
          {/* Prior output — FULL rows, matching the RA Output scene exactly */}
          <div style={{ width: 1140, alignSelf: "flex-start", display: "flex", flexDirection: "column", background: "rgba(254,252,251,0.02)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,107,53,0.10)" }}>
            {RA_PLAYERS.map((p, i) => <RaPlayerRow key={i} p={p} fitFill={1} />)}
          </div>
          {/* New prompt bubble — hidden until the flying bubble has LANDED (morph
              complete), then it takes over seamlessly (identical → invisible swap). */}
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", opacity: morph >= 1 ? 1 : 0 }}>
            <div style={{ background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 24, padding: "16px 24px", borderRadius: 18, borderBottomRightRadius: 6 }}>
              {RA_PROMPT2}
            </div>
          </div>
          {/* Thinking */}
          {thinking && (
            <div style={{ width: "100%", display: "flex", opacity: thinkOpacity }}>
              <RaThinkingDots />
            </div>
          )}
          {/* Answer */}
          {frame >= M_ANSWER_START && (
            <div style={{ width: "100%", display: "flex", justifyContent: "flex-start" }}>
              <div style={{ maxWidth: 980, background: "rgba(254,252,251,0.06)", border: "1px solid rgba(255,107,53,0.12)", color: colors.white, fontFamily, fontWeight: 500, fontSize: 24, lineHeight: 1.55, padding: "18px 26px", borderRadius: 20, borderBottomLeftRadius: 6 }}>
                {answer}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Keep-Asking overlay (Phase 1) — fades out during the morph */}
      {keepAskOpacity > 0.01 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: keepAskOpacity }}>
          <div style={heroStyle}>
            <WordReveal text="Just keep asking." startFrame={M_HEAD_IN} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 46, alignItems: "flex-end", width: 720 }}>
            {S8_OPTIONS.map((b, i) => {
              const local = frame - 30 - i * 8;
              const s = spring({ frame: local, fps, config: { damping: 200 } });
              const y = interpolate(s, [0, 1], [30, 0]);
              const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const isThird = i === 2;
              // The first two fade during morph; the third stays (it flies away
              // separately, below), so hide it here once morph starts.
              const fadeOut = isThird ? 1 : 1 - morph;
              if (isThird && frame >= M_MORPH_START) return null;
              return (
                <div
                  key={i}
                  style={{
                    transform: `translateY(${y}px) scale(${isThird ? 1 + click * 0.03 : 1})`,
                    opacity: opacity * fadeOut,
                    background: isThird && click > 0 ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isThird && click > 0 ? colors.accentOrange : "rgba(255,255,255,0.12)"}`,
                    borderRadius: "18px 18px 4px 18px",
                    padding: "16px 24px",
                    fontFamily,
                    fontWeight: 500,
                    fontSize: 34,
                    color: colors.white,
                  }}
                >
                  {b}
                </div>
              );
            })}
          </div>
          {cursorVisible && <CursorArrow x={curX} y={curY} clicking={click} />}
        </AbsoluteFill>
      )}

      {/* The clicked option FLYING to the chat bubble spot during the morph — it
          stays FULLY OPAQUE and becomes the resting bubble (the in-flow bubble
          above only appears once this lands, so there's no fade-away/reappear).
          Starts at the 3rd-option location; ends exactly on the chat bubble spot. */}
      {frame >= M_MORPH_START && morph < 1 && (
        <div
          style={{
            position: "absolute",
            left: interpolate(morph, [0, 1], [FLY_START_X, FLY_END_X]),
            top: interpolate(morph, [0, 1], [FLY_START_Y, FLY_END_Y]),
            transformOrigin: "top left",
            // Font shrinks 34→24 to match the chat bubble; solid orange throughout.
            fontSize: interpolate(morph, [0, 1], [34, 24]),
            background: colors.accentOrange,
            borderRadius: "18px 18px 6px 18px",
            padding: "16px 24px",
            fontFamily,
            fontWeight: 500,
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {RA_PROMPT2}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── AUDIO ───────────────────────────────────────────────────────────
// All SFX live in the pi/ folder (PI-specific mix; the click/typing/whoosh are
// the same files as ra/, but the Background Music is a NEW PI track).
// Each SFX file has LEADING SILENCE before the actual sound. We trim it with
// `startFrom` so the sound's ONSET lands exactly on the visual beat (measured
// via `npx remotion ffmpeg -af silencedetect=-40dB`, converted to 30fps frames):
//   Background Music : 0.211s → 6f    Mouse Click : 0.141s → 4f
//   Typing           : 0.437s → 13f   Whoosh      : 0.067s → 2f
// NOTE: the PI music has LESS leading silence than the old ra track (6f vs 15f),
// so its trim is measured fresh — reusing 15 would have clipped ~0.28s of onset.
const SFX_TRIM = { music: 6, click: 4, typing: 13, whoosh: 2 };
const AUDIO = {
  music: staticFile("pi/Background Music.mp3"),
  click: staticFile("pi/Mouse Click.mp3"),
  typing: staticFile("pi/Typing.mp3"),
  whoosh: staticFile("pi/Whoosh.mp3"),
};

// GLOBAL cue frames (composition-level) = scene offset + the scene-local timing
// constant. These are COMPUTED from the same constants the visuals use (not
// hardcoded), so editing RA_PROMPT — which shifts S5_TYPE_END/S5_CLICK2 via the
// character count — keeps the typing and click SFX locked to the visuals instead
// of silently drifting out of sync.
const S2_FROM = 225;
const S3_FROM = 455;
// (No S4_FROM needed anymore — S4's signal tour has no audio cues; the only
//  whooshes are the 3 S3 portal-sign reveals below.)
const CUE = {
  typingStart: S2_FROM + S5_TYPE_START,   // S2 typing begins
  typingEnd: S2_FROM + S5_TYPE_END,       // S2 typing ends
  sendClick: S2_FROM + S5_CLICK2,         // S2 send-button click
  // S3: one whoosh as EACH of the 3 portal signs (the evidence sections) appears.
  // These are the ONLY whooshes in the video — no card-landing whoosh, and no S4
  // camera-move whooshes. Just the 3 signs.
  signs: Array.from({ length: RAO_SECTION_COUNT }, (_, i) => S3_FROM + RAO_SECTIONS_START + i * RAO_ROW_STAGGER),
};

// Timeline ──────────────────────────────────────────────────────────
export const AiPiDemo: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <Sequence from={0} durationInFrames={225} name="S1"><Scene02Meet_Merged /></Sequence>
      <Sequence from={225} durationInFrames={230} name="S2"><Scene05_RaLanding /></Sequence>
      {/* S3 cuts the instant its scroll-up settles (RAO_END), so the card is
          still and centered exactly as S4's push-in expects — no static hold. */}
      <Sequence from={455} durationInFrames={RAO_END} name="S3"><SceneRaOutput /></Sequence>
      {/* S4 runs exactly the tour's length (TOUR_END) so there's no dead air
          parked on the last signal before the end card. */}
      <Sequence from={455 + RAO_END} durationInFrames={TOUR_END} name="S4"><SceneSignalTour /></Sequence>
      <Sequence from={455 + RAO_END + TOUR_END} durationInFrames={180} name="S5"><Scene11EndCard /></Sequence>

      {/* ─────────────── AUDIO ─────────────── */}
      {/* Background music — whole video, low bed. Fades in over the first ~1s and
          out over the last ~1.5s. startFrom skips the file's leading silence. */}
      <Audio
        src={AUDIO.music}
        startFrom={SFX_TRIM.music}
        volume={(f) =>
          interpolate(
            f,
            [0, 20, durationInFrames - 45, durationInFrames - 1],
            [0, 0.28, 0.28, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }
        name="Background Music"
      />

      {/* S2 — typing in the chatbox (trimmed to the typing window). */}
      <Sequence from={CUE.typingStart} durationInFrames={CUE.typingEnd - CUE.typingStart} name="SFX Typing">
        <Audio src={AUDIO.typing} startFrom={SFX_TRIM.typing} volume={0.7} name="Typing" />
      </Sequence>

      {/* S2 — mouse click on the send button. */}
      <Sequence from={CUE.sendClick} durationInFrames={30} name="SFX Send Click">
        <Audio src={AUDIO.click} startFrom={SFX_TRIM.click} volume={0.9} name="Send Click" />
      </Sequence>

      {/* S3 — a whoosh as each of the 3 portal signs appears. These are the only
          whooshes in the video; S4's camera moves are intentionally silent. */}
      {CUE.signs.map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={20} name={`SFX Whoosh ${i + 1}`}>
          <Audio src={AUDIO.whoosh} startFrom={SFX_TRIM.whoosh} volume={0.1625} name={`Whoosh ${i + 1}`} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
