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
import { PiLandingV, PiCardV, PiSignalTourV, PI_RAO_END, PI_TOUR_END } from "./scenes/feed/pi-scenes";

/**
 * AI PORTAL INTELLIGENCE — VERTICAL (9:16, 1080×1920)
 * A vertical cut of AiPiDemo for TikTok / Reels / Shorts / Stories. Scene beats,
 * durations, and audio cues are IDENTICAL to the landscape AiPiDemo — only the
 * layout is reflowed (the right-side signal-tour panel becomes a bottom panel).
 * Landscape composition untouched.
 *
 * S1 Open (225) → S2 Landing (230) → S3 PI Card (PI_RAO_END=140) →
 * S4 Signal Tour (PI_TOUR_END=394) → S5 End (180) = 1169 frames.
 */

const OPEN_DUR = 225;
const LANDING_DUR = 230;
const CARD_DUR = PI_RAO_END; // 140
const TOUR_DUR = PI_TOUR_END; // 394
const END_DUR = 180;
export const AI_PI_FEED_DURATION = OPEN_DUR + LANDING_DUR + CARD_DUR + TOUR_DUR + END_DUR; // 1169

// ── Audio — same pi/ files, trims, and cues as landscape AiPiDemo ─────────────
const SFX_TRIM = { music: 6, click: 4, typing: 13, whoosh: 2 };
const AUDIO = {
  music: staticFile("pi/Background Music.mp3"),
  click: staticFile("pi/Mouse Click.mp3"),
  typing: staticFile("pi/Typing.mp3"),
  whoosh: staticFile("pi/Whoosh.mp3"),
};
const S2_FROM = OPEN_DUR; // 225
const S3_FROM = OPEN_DUR + LANDING_DUR; // 455
// PI prompt is 92 chars → same type window as landscape.
const CUE = {
  typingStart: S2_FROM + 84, // 309
  typingEnd: S2_FROM + 150, // 375
  sendClick: S2_FROM + 186, // 411
  // one whoosh per portal-signal section reveal (S3): RAO_SECTIONS_START=96 + i*12
  signs: [0, 1, 2].map((i) => S3_FROM + 96 + i * 12), // [551, 563, 575]
};

const OPEN_SUBS = [
  { text: <>The portal is open as little as <span style={{ color: colors.accentOrange }}>15 days</span></>, start: 120, end: 170 },
  { text: <>Start recruiting <span style={{ color: colors.accentOrange }}>before</span> it opens</>, start: 172, end: 222 },
];

export const AiPiDemoFeed: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <Sequence from={0} durationInFrames={OPEN_DUR} name="S1 · Open">
        <OpenTitledV title="AI Portal Intelligence" subLines={OPEN_SUBS} />
      </Sequence>

      <Sequence from={OPEN_DUR} durationInFrames={LANDING_DUR} name="S2 · Landing">
        <PiLandingV />
      </Sequence>

      <Sequence from={OPEN_DUR + LANDING_DUR} durationInFrames={CARD_DUR} name="S3 · PI Card">
        <PiCardV />
      </Sequence>

      <Sequence from={OPEN_DUR + LANDING_DUR + CARD_DUR} durationInFrames={TOUR_DUR} name="S4 · Signal Tour">
        <PiSignalTourV />
      </Sequence>

      <Sequence from={OPEN_DUR + LANDING_DUR + CARD_DUR + TOUR_DUR} durationInFrames={END_DUR} name="Finish">
        <EndCardV />
      </Sequence>

      {/* ─────────────── AUDIO ─────────────── */}
      <Audio
        src={AUDIO.music}
        startFrom={SFX_TRIM.music}
        volume={(f) =>
          interpolate(
            f,
            [0, 20, AI_PI_FEED_DURATION - 45, AI_PI_FEED_DURATION - 1],
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

      {CUE.signs.map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={20} name={`SFX Whoosh ${i + 1}`}>
          <Audio src={AUDIO.whoosh} startFrom={SFX_TRIM.whoosh} volume={0.1625} name={`Whoosh ${i + 1}`} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
