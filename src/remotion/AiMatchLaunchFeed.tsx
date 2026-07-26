import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "./brand";
import { SlideBG, WordReveal, OrangeSweep } from "./components/primitives";
import { logo, ContinuousLockup, LOGO_SIZE, RA_ANCHOR_LOGO_W } from "./AiRaDemo";
import { S3RecruitingV, V_OPEN_LOGO_CENTER_Y } from "./scenes/feed/S3RecruitingV";
import { S4MatchesV } from "./scenes/feed/S4MatchesV";
import { S5PlayersV } from "./scenes/feed/S5PlayersV";
import { S6BreakdownV } from "./scenes/feed/S6BreakdownV";

/**
 * AI MATCH LAUNCH — 4:5 FEED (1080×1350)
 * Composition id: "AiMatchLaunch (1080x1350)" · 30fps
 *
 * A 4:5 in-feed cut of AiMatchLaunch (fits Instagram + X in-feed, plays on TikTok).
 * Scene beats, durations, and audio cues are IDENTICAL to the landscape/vertical cuts;
 * only the layout is reflowed for the shorter 1350 frame (tightened spacing, big text)
 * via the scene copies in scenes/feed/. The landscape + 9:16 versions are untouched.
 */

const FEED_CENTER_Y = 675; // 1350 / 2

// ── 4:5 open geometry ─────────────────────────────────────────────────────────
// The settled logo's CENTER sits at V_OPEN_LOGO_CENTER_Y (S3 feed picks it up there).
const V_OPEN_LOGO_LIFT = FEED_CENTER_Y - V_OPEN_LOGO_CENTER_Y; // = 175

// S1 + S2 show the logo at the BIGGER "hook" size and HOLD it big; the shrink to the
// normal size happens in S3 during the rise (shrink-while-moving). S3RecruitingV's
// S3_LOGO_START_W MUST equal this (175) so the S2→S3 cut is seamless.
const HOOK_LOGO_W = 175;

// ContinuousLockup places its logo with `top: -LOGO_SIZE/2`, assuming a SQUARE asset.
// dr-logo.png is 1932×2048, so the logo actually renders ~5px BELOW the group origin
// while the settled <Img> below is centred correctly — that mismatch is the small
// "logo slides into its S2 spot at the end of S1" shift. Cancel it on the animated side.
const LOGO_ASPECT = 2048 / 1932;
const LOCKUP_LOGO_CENTER_ERR = (LOGO_SIZE * LOGO_ASPECT - LOGO_SIZE) / 2; // ≈5.10px low
const SettledLogo: React.FC<{ width?: number }> = ({ width = HOOK_LOGO_W }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
    <Img
      src={logo}
      style={{
        width,
        transform: `translateY(${-V_OPEN_LOGO_LIFT}px)`,
        display: "block",
      }}
    />
  </AbsoluteFill>
);

// ══════════════════════════════════════════════════════════════════════════
// SCENE 1 — Open: logo reveal → lockup → shrink-and-center → settle (logo only)
// Same motion/timing as AiMatchLaunch SceneOpen, but settles at the vertical lift.
// ══════════════════════════════════════════════════════════════════════════
const SceneOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const SHRINK_START = 60;
  // Open is 90 frames. Swap animated→settled WITHIN the scene (84) so S1 ends on the
  // exact settled logo S2 draws — no size/wordmark pop at the cut. Snappier shrink.
  const ANCHOR_SWAP = 84;

  const revealS = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const reveal = interpolate(revealS, [0, 1], [0, 1]);
  const lockupZoom = 1.35;

  // This spring is only ~0.998 settled at ANCHOR_SWAP, which left the animated logo
  // ~6px BELOW the settled logo at the swap frame — that residual is the "logo slides
  // into place at the very end of S1" pop. Normalising by the spring's own value at the
  // swap frame forces shrinkS === 1 exactly at the swap, so animated and settled are
  // pixel-identical there and the S1→S2 handoff is dead still.
  const SHRINK_CFG = { damping: 30, mass: 0.8, stiffness: 90 };
  const shrinkRaw = spring({ frame: frame - SHRINK_START, fps, config: SHRINK_CFG });
  const shrinkAtSwap = spring({ frame: ANCHOR_SWAP - SHRINK_START, fps, config: SHRINK_CFG });
  const shrinkS = Math.min(1, shrinkRaw / shrinkAtSwap);
  const groupScale = interpolate(shrinkS, [0, 1], [1.35, HOOK_LOGO_W / LOGO_SIZE]); // settle at big hook size
  // Second term cancels ContinuousLockup's square-asset centring error (see above),
  // scaled because it rides inside the scaled group and ramped in with the shrink so
  // it is fully applied exactly where the settled logo takes over.
  const groupY =
    interpolate(shrinkS, [0, 1], [0, -V_OPEN_LOGO_LIFT]) -
    shrinkS * LOCKUP_LOGO_CENTER_ERR * groupScale;
  const textFadeOut = interpolate(frame, [SHRINK_START, SHRINK_START + 18], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const useSettledLogo = frame >= ANCHOR_SWAP;

  return (
    <AbsoluteFill>
      <SlideBG />
      {!useSettledLogo && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              transform:
                frame < SHRINK_START
                  ? `scale(${lockupZoom})`
                  : `translateY(${groupY}px) scale(${groupScale})`,
            }}
          >
            <ContinuousLockup reveal={reveal} textOpacity={textFadeOut} />
          </div>
        </AbsoluteFill>
      )}
      {useSettledLogo && <SettledLogo />}
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// SCENE 2 — Hook: settled logo (held) + AI hook lines, one at a time
// Identical text + timing to AiMatchLaunch SceneHook; hook lines sit BELOW the
// vertically-settled logo (larger, wraps naturally in the narrow frame).
// ══════════════════════════════════════════════════════════════════════════
const openHookStyle: React.CSSProperties = {
  fontFamily,
  fontWeight: 900,
  fontSize: 84,
  letterSpacing: "-0.045em",
  lineHeight: 1.06,
  textAlign: "center",
};

const HookLine: React.FC<{
  text: string;
  startFrame: number;
  stagger?: number;
  lineOpacity: number;
  accentWords?: string[];
}> = ({ text, startFrame, stagger = 2.5, lineOpacity, accentWords }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  const accentSet = new Set(accentWords ?? []);
  return (
    <div
      style={{
        position: "absolute",
        // Sits below the settled logo; the logo center is at 660, so start the
        // hook block a bit under it. Vertically it reads as upper-third headline.
        top: V_OPEN_LOGO_CENTER_Y + 170,
        left: 0,
        right: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "0 0.28em",
        justifyContent: "center",
        padding: "0 90px",
        opacity: lineOpacity,
        ...openHookStyle,
      }}
    >
      {words.map((w, i) => {
        const local = frame - startFrame - i * stagger;
        const s = spring({ frame: local, fps, config: { damping: 200 } });
        const y = interpolate(s, [0, 1], [34, 0]);
        const op = interpolate(local, [0, 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const isAccent = accentSet.has(w.replace(/[?.,]/g, ""));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: op,
              color: isAccent ? colors.accentOrange : colors.white,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();

  const LINES: { text: string; accentWords?: string[]; start: number; end: number; hold?: boolean }[] = [
    { text: "What if AI could make recruiting smarter for both sides?", accentWords: ["AI"], start: 8, end: 76 },
    { text: "A way to connect players and programs that actually fit.", start: 82, end: 150 },
    { text: "Meet AI Match.", accentWords: ["AI", "Match"], start: 156, end: 215, hold: true },
  ];

  const SCENE_END = 215;
  const payoffFadeOut = interpolate(frame, [SCENE_END - 14, SCENE_END - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineEnvelope = (start: number, end: number, hold?: boolean) =>
    hold
      ? payoffFadeOut
      : interpolate(frame, [start, start + 2, end - 8, end], [1, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  // Logo HELD at the big hook size through all of S2; the shrink happens in S3 during
  // the rise (shrink-while-moving). S2 ends big, S3 starts big → seamless.
  return (
    <AbsoluteFill>
      <SlideBG />
      <SettledLogo width={HOOK_LOGO_W} />
      {LINES.map((l, i) => {
        if (frame < l.start || frame > l.end) return null;
        return (
          <HookLine
            key={i}
            text={l.text}
            startFrame={l.start}
            accentWords={l.accentWords}
            lineOpacity={lineEnvelope(l.start, l.end, l.hold)}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// FINISH — Vertical end card (stacked lockup + App Store badge + URL)
// ══════════════════════════════════════════════════════════════════════════
const EndCardV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const logoScale = interpolate(s, [0, 1], [0.8, 1]);
  const tagTrack = interpolate(frame, [30, 55], [6, 2.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wipeS = spring({ frame, fps, config: { damping: 40, mass: 0.9, stiffness: 60 } });
  const wipeUp = interpolate(wipeS, [0, 1], [100, 0]);
  const riseS = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const lockupRise = interpolate(riseS, [0, 1], [70, 0]);
  const lockupOpacity = interpolate(frame, [8, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const availS = spring({ frame: frame - 60, fps, config: { damping: 200 } });
  const availY = interpolate(availS, [0, 1], [24, 0]);
  const availOpacity = interpolate(frame, [60, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <AbsoluteFill style={{ transform: `translateY(${wipeUp}%)` }}>
        <SlideBG />
      </AbsoluteFill>

      {/* Stacked lockup — logo on top, name + slogan below, vertically centered. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", opacity: lockupOpacity, transform: `translateY(${lockupRise - 80}px)` }}>
        <div style={{ transform: `scale(${logoScale})` }}>
          <Img src={logo} style={{ width: 330 }} />
        </div>
        <div style={{ fontFamily, fontWeight: 800, letterSpacing: "-0.02em", fontSize: 104, color: "#ffffff", marginTop: 44, textAlign: "center" }}>
          <WordReveal text="Direct Recruit" startFrame={10} />
        </div>
        <div style={{ fontFamily, fontWeight: 700, textTransform: "uppercase", fontSize: 34, color: colors.cerulean, letterSpacing: `${tagTrack}px`, opacity: tagOpacity, marginTop: 20, textAlign: "center" }}>
          Get Recruited · The Right Way
        </div>
        <div style={{ marginTop: 30 }}>
          <OrangeSweep startFrame={55} width={560} />
        </div>
      </AbsoluteFill>

      {/* Availability — CENTERED between the orange line's bottom (≈930) and the
          screen bottom (1350) → midpoint 1140. Center-anchored so it sits on it. */}
      <div
        style={{
          position: "absolute",
          top: (930 + 1350) / 2,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          opacity: availOpacity,
          transform: `translateY(calc(-50% + ${availY}px))`,
        }}
      >
        <Img src={staticFile("app-store-badge.svg")} style={{ height: 108 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily, fontWeight: 700, fontSize: 44, color: colors.white }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={colors.accentOrange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          directrecruit.net
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Durations — IDENTICAL to AiMatchLaunch (keeps timing + audio in sync) ─────
const OPEN_DUR = 90;
const HOOK_DUR = 215;
// S3/S4/S5 each +23 frames (0.75s @ 30fps); scene internal end-timing bumped to match.
const S3_DUR = 122;
const S4_DUR = 122;
const S5_DUR = 122;
const S6_DUR = 200;
const FINISH_DUR = 180;
export const AI_MATCH_FEED_DURATION = OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR + S6_DUR + FINISH_DUR;

// ── AUDIO — same am/ files, same trims + cues as AiMatchLaunch ─────────────────
const AM_TRIM = { music: 6, whoosh: 2, click: 4 };
const AM_AUDIO = {
  music: staticFile("am/Background Music.mp3"),
  whoosh: staticFile("am/Whoosh.mp3"),
  click: staticFile("am/Mouse Click.mp3"),
};
const AM_S4_FROM = OPEN_DUR + HOOK_DUR + S3_DUR;
const AM_S6_FROM = OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR;
const AM_S4_ROW_START = 12;
const AM_S4_ROW_STAGGER = 13;
const AM_S6_CLICK = 20;
const AM_CUE = {
  cards: [0, 1, 2].map((i) => AM_S4_FROM + AM_S4_ROW_START + i * AM_S4_ROW_STAGGER),
  click: AM_S6_FROM + AM_S6_CLICK,
};

export const AiMatchLaunchFeed: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <Sequence from={0} durationInFrames={OPEN_DUR} name="S1 · Open">
        <SceneOpen />
      </Sequence>

      <Sequence from={OPEN_DUR} durationInFrames={HOOK_DUR} name="S2 · Hook">
        <SceneHook />
      </Sequence>

      <Sequence from={OPEN_DUR + HOOK_DUR} durationInFrames={S3_DUR} name="S3 · Recruiting">
        <S3RecruitingV />
      </Sequence>

      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR} durationInFrames={S4_DUR} name="S4 · Matches">
        <S4MatchesV />
      </Sequence>

      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR} durationInFrames={S5_DUR} name="S5 · Players">
        <S5PlayersV />
      </Sequence>

      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR} durationInFrames={S6_DUR} name="S6 · Breakdown">
        <S6BreakdownV />
      </Sequence>

      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR + S6_DUR} durationInFrames={FINISH_DUR} name="Finish">
        <EndCardV />
      </Sequence>

      {/* ─────────────── AUDIO ─────────────── */}
      <Audio
        src={AM_AUDIO.music}
        startFrom={AM_TRIM.music}
        volume={(f) =>
          interpolate(
            f,
            [0, 20, AI_MATCH_FEED_DURATION - 45, AI_MATCH_FEED_DURATION - 1],
            [0, 0.28, 0.28, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }
        name="Background Music"
      />

      {AM_CUE.cards.map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={20} name={`SFX Whoosh ${i + 1}`}>
          <Audio src={AM_AUDIO.whoosh} startFrom={AM_TRIM.whoosh} volume={0.1625} name={`Whoosh ${i + 1}`} />
        </Sequence>
      ))}

      <Sequence from={AM_CUE.click} durationInFrames={30} name="SFX Card Click">
        <Audio src={AM_AUDIO.click} startFrom={AM_TRIM.click} volume={0.9} name="Card Click" />
      </Sequence>
    </AbsoluteFill>
  );
};
