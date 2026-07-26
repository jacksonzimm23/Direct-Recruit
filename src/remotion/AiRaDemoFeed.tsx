import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  interpolate,
} from "remotion";
import { colors } from "./brand";
import { OpenTitledV, EndCardV } from "./scenes/feed/bookends";
import { RaLandingV, RaOutputV, KeepAskV } from "./scenes/feed/ra-scenes";

/**
 * AI RA DEMO — VERTICAL (9:16, 1080×1920)
 * A vertical cut of AiRaDemo for TikTok / Reels / Shorts / Stories. Scene beats,
 * durations, and audio cues are IDENTICAL to the landscape AiRaDemo — only the
 * layout is reflowed. Landscape composition untouched.
 *
 * S1 Open (255) → S2 Landing (230) → S3 Output (167) → S4 KeepAsk (320) → S5 End (180)
 * = 1152 frames.
 *
 * S1 was extended by +30 frames (225→255) so each of the 3 open subtitle lines holds
 * for 1.5s (45 frames). All downstream scenes + audio cues shift by the same +30.
 */

const OPEN_SHIFT = 30; // frames added to S1 so the 3 lines each get 1.5s
const OPEN_DUR = 225 + OPEN_SHIFT; // 255
const LANDING_DUR = 230;
const OUTPUT_DUR = 167;
const KEEPASK_DUR = 320;
const END_DUR = 180;
export const AI_RA_FEED_DURATION = OPEN_DUR + LANDING_DUR + OUTPUT_DUR + KEEPASK_DUR + END_DUR; // 1177

// ── Audio — same ra/ files + trims as landscape AiRaDemo; cues shift by OPEN_SHIFT
// (their scene-local timing is unchanged, only the S1 offset grew). ──────────────
const SFX_TRIM = { music: 15, click: 4, typing: 13, whoosh: 2 };
const AUDIO = {
  music: staticFile("ra/Background Music.mp3"),
  click: staticFile("ra/Mouse Click.mp3"),
  typing: staticFile("ra/Typing.mp3"),
  whoosh: staticFile("ra/Whoosh.mp3"),
};
// Global cue frames = landscape cue + OPEN_SHIFT (everything after S1 moved back).
const CUE = {
  typingStart: 309 + OPEN_SHIFT,
  typingEnd: 382 + OPEN_SHIFT,
  sendClick: 418 + OPEN_SHIFT,
  rows: [537, 549, 561, 573, 585].map((f) => f + OPEN_SHIFT),
  bestStatsClick: 684 + OPEN_SHIFT,
};

// Open subtitle lines. Each holds 1.5s (45 frames), 2-frame gaps, starting at f114.
const OPEN_SUBS = [
  { text: <>Stop scrolling on social media</>, start: 120, end: 164 },
  { text: <>Stop scrolling databases</>, start: 166, end: 210 },
  { text: <>Start recruiting with <span style={{ color: colors.accentOrange }}>AI</span></>, start: 212, end: 253 },
];

export const AiRaDemoFeed: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <Sequence from={0} durationInFrames={OPEN_DUR} name="S1 · Open">
        <OpenTitledV title="AI Recruiting Assistant" subLines={OPEN_SUBS} />
      </Sequence>

      <Sequence from={OPEN_DUR} durationInFrames={LANDING_DUR} name="S2 · Landing">
        <RaLandingV />
      </Sequence>

      <Sequence from={OPEN_DUR + LANDING_DUR} durationInFrames={OUTPUT_DUR} name="S3 · Output">
        <RaOutputV />
      </Sequence>

      <Sequence from={OPEN_DUR + LANDING_DUR + OUTPUT_DUR} durationInFrames={KEEPASK_DUR} name="S4 · Keep Asking">
        <KeepAskV />
      </Sequence>

      <Sequence from={OPEN_DUR + LANDING_DUR + OUTPUT_DUR + KEEPASK_DUR} durationInFrames={END_DUR} name="Finish">
        <EndCardV />
      </Sequence>

      {/* ─────────────── AUDIO ─────────────── */}
      <Audio
        src={AUDIO.music}
        startFrom={SFX_TRIM.music}
        volume={(f) =>
          interpolate(
            f,
            [0, 20, AI_RA_FEED_DURATION - 45, AI_RA_FEED_DURATION - 1],
            [0, 0.28, 0.28, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }
        name="Background Music"
      />

      <Sequence from={CUE.typingStart} durationInFrames={CUE.typingEnd - CUE.typingStart} name="SFX Typing">
        <Audio src={AUDIO.typing} startFrom={SFX_TRIM.typing} volume={0.7} name="Typing" />
      </Sequence>

      <Sequence from={CUE.sendClick} durationInFrames={30} name="SFX Send Click">
        <Audio src={AUDIO.click} startFrom={SFX_TRIM.click} volume={0.9} name="Send Click" />
      </Sequence>

      {CUE.rows.map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={20} name={`SFX Whoosh ${i + 1}`}>
          <Audio src={AUDIO.whoosh} startFrom={SFX_TRIM.whoosh} volume={0.1625} name={`Whoosh ${i + 1}`} />
        </Sequence>
      ))}

      <Sequence from={CUE.bestStatsClick} durationInFrames={30} name="SFX Best-Stats Click">
        <Audio src={AUDIO.click} startFrom={SFX_TRIM.click} volume={0.9} name="Best-Stats Click" />
      </Sequence>
    </AbsoluteFill>
  );
};
