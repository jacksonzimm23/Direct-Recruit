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
import { SlideBG } from "./components/primitives";
import {
  Scene11EndCard,
  logo,
  ContinuousLockup,
  LOGO_SIZE,
  RA_ANCHOR_LOGO_W,
} from "./AiRaDemo";
import { S3Recruiting } from "./scenes/S3Recruiting";
import { S4Matches } from "./scenes/S4Matches";
import { S5Players } from "./scenes/S5Players";
import { S6Breakdown } from "./scenes/S6Breakdown";

/**
 * AI MATCH LAUNCH
 * Composition id: AiMatchLaunch · 1920×1080 · 30fps
 *
 * The open is split into TWO independently-editable scenes:
 *   S1 "Open"  — logo reveal → lockup → shrink-and-center, settling on the
 *                logo-only anchor (reuses AiRaDemo's Scene02Meet_Merged motion,
 *                minus the "AI Recruiting Assistant" title + flash lines).
 *   S2 "Hook"  — starts on the SAME settled logo (pixel-identical → seamless cut)
 *                and plays the AI hook lines one at a time, ending on "Meet AI Match."
 * See Videos/ai-match-launch-script.md (Scenes 1–2).
 */

// ── Shared settled-logo geometry ──────────────────────────────────────────
// The shrunk logo settles at frame-center, then lifts UP so hook lines have room
// below. Both S1 (end state) and S2 (start state) draw the logo with THIS EXACT
// transform so the scene cut is seamless (production-craft.md §4).
const OPEN_LOGO_LIFT = 150; // px the settled logo sits above frame-center

// The settled logo, drawn identically in both scenes. No title — just the mark.
const SettledLogo: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
    <Img
      src={logo}
      style={{
        width: RA_ANCHOR_LOGO_W,
        transform: `translateY(${-OPEN_LOGO_LIFT}px)`,
        display: "block",
      }}
    />
  </AbsoluteFill>
);

// ══════════════════════════════════════════════════════════════════════════
// SCENE 1 — Open: logo reveal → lockup → shrink-and-center → settle (logo only)
// Phase A/B: IDENTICAL to Scene02Meet_Merged — logo appears, reveals name+slogan,
// then shrinks + rises + re-centers, hard-swapping onto the settled logo spot.
// Ends HOLDING the settled logo so S2 can pick it up seamlessly.
// ══════════════════════════════════════════════════════════════════════════
const SceneOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Timing — IDENTICAL to AiRaDemo's Scene02Meet_Merged (unchanged pacing). ──
  // Reveal f16 → hold → shrink starts f72 → logo fully settled + hard-swap f100.
  // We keep this EXACTLY as the original so the shrink-and-settle feels the same;
  // S1 is simply CUT once the logo has settled (see OPEN_DUR below).
  const SHRINK_START = 72;
  const ANCHOR_SWAP = 100; // shrink fully settled (size+Y exact) → swap to settled logo

  // ── Phase A: logo shown immediately, then slides left to reveal name+slogan ──
  const revealS = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const reveal = interpolate(revealS, [0, 1], [0, 1]);
  const lockupZoom = 1.35; // fixed revealed size

  // ── Phase B: shrink the SAME lockup down to the settled logo size, rising up. ──
  // Land the animated logo at EXACTLY the settled anchor size (no size pop at swap).
  const shrinkS = spring({ frame: frame - SHRINK_START, fps, config: { damping: 200 } });
  const groupScale = interpolate(shrinkS, [0, 1], [1.35, RA_ANCHOR_LOGO_W / LOGO_SIZE]);
  const groupY = interpolate(shrinkS, [0, 1], [0, -OPEN_LOGO_LIFT]);
  // Name+slogan fade out during the shrink (finished by ~f90 so the logo re-centers
  // before the settled-logo hard-swap).
  const textFadeOut = interpolate(frame, [SHRINK_START, SHRINK_START + 18], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Settled logo hard-swap (no crossfade) once the shrink has fully landed ──
  const useSettledLogo = frame >= ANCHOR_SWAP;

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* Phase A/B MOTION lockup — rendered until it lands on the settled logo. */}
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

      {/* SETTLED logo — hard-swapped in once the motion lands, held to the scene
          end so S2 begins on the identical frame (seamless cut). */}
      {useSettledLogo && <SettledLogo />}
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// SCENE 2 — Hook: settled logo (held) + AI hook lines, one at a time
// Opens on the SAME settled logo S1 ended on (pixel-identical → seamless), then
// plays the 4 hook lines below it: 3 "what if" questions (each reveals word-by-
// word, holds, fades out before the next) → "Meet AI Match." payoff (holds).
// ══════════════════════════════════════════════════════════════════════════
const OPEN_HOOK_TOP = 40; // vertical center of the hook line, px below frame-center
const openHookStyle: React.CSSProperties = {
  fontFamily,
  fontWeight: 900,
  fontSize: 76,
  letterSpacing: "-0.045em",
  lineHeight: 1.02,
  textAlign: "center",
};

// Word-by-word reveal, driven by an EXTERNAL opacity (so the whole line can fade
// out after it holds). Words spring up + fade in, staggered.
const HookLine: React.FC<{
  text: string;
  startFrame: number; // when this line's words begin revealing (scene-local)
  stagger?: number;
  lineOpacity: number; // whole-line envelope (fade-in is per-word; this fades OUT)
  accentWords?: string[]; // words rendered in orange (e.g. ["AI"] or ["AI","Match"])
}> = ({ text, startFrame, stagger = 2.5, lineOpacity, accentWords }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  const accentSet = new Set(accentWords ?? []);
  return (
    <div
      style={{
        position: "absolute",
        top: `calc(50% + ${OPEN_HOOK_TOP}px)`,
        left: 0,
        right: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "0 0.28em",
        justifyContent: "center",
        padding: "0 120px",
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

  // Hook lines (scene-local frames). Lines 1–3 are the "what if" questions:
  // reveal, hold, fade OUT before the next. Line 4 ("Meet AI Match.") is the
  // resolution: reveals and HOLDS to the scene end, with an orange sweep underline.
  const LINES: {
    text: string;
    accentWords?: string[];
    start: number;
    end: number;
    hold?: boolean;
  }[] = [
    {
      text: "What if AI could make recruiting smarter for both sides?",
      accentWords: ["AI"],
      start: 8,
      end: 76, // ~68f window: reveal (~45f) + short hold + fade → snappier pace
    },
    {
      text: "A way to connect players and programs that actually fit.",
      start: 82,
      end: 150,
    },
    // (Removed "So both sides know exactly who to reach out to." — line 1 now
    //  covers "both sides", so this was redundant and made the scene drag.)
    {
      text: "Meet AI Match.",
      accentWords: ["AI", "Match"],
      start: 156, // pulled up 74f (was 230) to close the gap the deleted line left
      end: 215, // fades out at the (earlier) scene end; hold:true keys off SCENE_END
      hold: true, // stays on screen to the scene end (the payoff)
    },
  ];

  // The payoff holds, then fades out over S2's LAST frames so only the settled logo
  // remains at the cut — S3 picks up that same logo and glides it to the top, a
  // continuous logo hand-off with no text popping away. S2 = HOOK_DUR (215) frames:
  // the scene is cut earlier (ends at global frame 305), so the payoff fade lands
  // at 215 instead of 266 — everything else (line reveals) unchanged.
  const SCENE_END = 215;
  const payoffFadeOut = interpolate(frame, [SCENE_END - 14, SCENE_END - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Whole-line envelope. Questions fade out over the last 8f of their window; the
  // payoff (hold:true) fades in, holds, then fades out at the scene end.
  const lineEnvelope = (start: number, end: number, hold?: boolean) =>
    hold
      ? payoffFadeOut
      : interpolate(frame, [start, start + 2, end - 8, end], [1, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });


  return (
    <AbsoluteFill>
      <SlideBG />

      {/* Settled logo — IDENTICAL to S1's end state, held still → seamless cut. */}
      <SettledLogo />

      {/* Hook lines, one at a time below the settled logo. */}
      {LINES.map((l, i) => {
        // Only mount a line while its window is active (keeps exactly one on screen).
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

      {/* (Orange sweep underline removed per direction — the "Meet AI Match."
          payoff now stands on its own with no underline.) */}
    </AbsoluteFill>
  );
};

// ── Durations ─────────────────────────────────────────────────────────────
const OPEN_DUR = 90; // S1: original pacing (reveal f16 → shrink f72 → settle+swap f100), cut at f90
const HOOK_DUR = 215; // S2: cut earlier — ends at global frame 305 (was 266). Payoff fade retimed to 215.
const S3_DUR = 99; // S3: 90 + 10%. Scroll + fades retimed to 99 in S3Recruiting (also slower scroll).
const S4_DUR = 99; // S4: 90 + 10%. Caption fade retimed to 99 in S4Matches.
const S5_DUR = 99; // S5: 90 + 10%. Caption fade retimed to 99 in S5Players.
const S6_DUR = 200; // S6: click the ⓘ on player 2 → AI Match breakdown modal
const FINISH_DUR = 180; // Scene11EndCard from AiRaDemo
export const AI_MATCH_DURATION = OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR + S6_DUR + FINISH_DUR;

// ── AUDIO ───────────────────────────────────────────────────────────────────
// All SFX live in the am/ folder. The Whoosh + Mouse Click are the SAME files as
// the AI RA video (byte-identical), so they keep RA's leading-silence trims; the
// Background Music is a NEW AI-Match track. Trims = leading silence measured via
// `npx remotion ffmpeg -af silencedetect=-40dB`, in 30fps frames:
//   Background Music : 0.194s → 6f    Whoosh : 0.067s → 2f    Mouse Click : 0.141s → 4f
const AM_TRIM = { music: 6, whoosh: 2, click: 4 };
const AM_AUDIO = {
  music: staticFile("am/Background Music.mp3"),
  whoosh: staticFile("am/Whoosh.mp3"),
  click: staticFile("am/Mouse Click.mp3"),
};

// Global cue frames = scene offset + scene-local timing. Computed from the same
// duration constants the visuals use, so re-timing a scene keeps SFX locked.
const AM_S4_FROM = OPEN_DUR + HOOK_DUR + S3_DUR;               // S4 start
const AM_S6_FROM = OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR; // S6 start
const AM_S4_ROW_START = 12; // S4 first card lands (matches S4Matches ROW_START)
const AM_S4_ROW_STAGGER = 13; // matches S4Matches ROW_STAGGER
const AM_S6_CLICK = 20; // matches S6Breakdown CLICK
const AM_CUE = {
  // S4: one whoosh as each of the 3 school cards appears.
  cards: [0, 1, 2].map((i) => AM_S4_FROM + AM_S4_ROW_START + i * AM_S4_ROW_STAGGER),
  // S6: mouse click as the card is clicked.
  click: AM_S6_FROM + AM_S6_CLICK,
};

export const AiMatchLaunch: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      {/* S1 — Open: logo reveal → lockup → shrink-and-center → settle */}
      <Sequence from={0} durationInFrames={OPEN_DUR} name="S1 · Open">
        <SceneOpen />
      </Sequence>

      {/* S2 — Hook: settled logo (held) → 4 AI hook lines, one at a time */}
      <Sequence from={OPEN_DUR} durationInFrames={HOOK_DUR} name="S2 · Hook">
        <SceneHook />
      </Sequence>

      {/* S3 — Recruiting profile: logo rises smoothly to the top, then the recruiting
          section slow-scrolls. The logo starts at S2's settled spot → seamless hand-off. */}
      <Sequence from={OPEN_DUR + HOOK_DUR} durationInFrames={S3_DUR} name="S3 · Recruiting">
        <S3Recruiting />
      </Sequence>

      {/* S4 — Matches: logo + caption stay in the SAME spot (no move across the cut);
          caption swaps to the matches line, 3 best-fit schools appear one by one. */}
      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR} durationInFrames={S4_DUR} name="S4 · Matches">
        <S4Matches />
      </Sequence>

      {/* S5 — Players: the same 3 school cards FLIP in 3D → player cards (coach's
          side); logo + card layout stay put, caption swaps to the coach line. */}
      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR} durationInFrames={S5_DUR} name="S5 · Players">
        <S5Players />
      </Sequence>

      {/* S6 — Breakdown: cursor clicks the ⓘ on player 2 → cards fade, the AI Match
          fit-info modal pops up showing WHY they scored 84. */}
      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR} durationInFrames={S6_DUR} name="S6 · Breakdown">
        <S6Breakdown />
      </Sequence>

      {/* Finish — end card */}
      <Sequence from={OPEN_DUR + HOOK_DUR + S3_DUR + S4_DUR + S5_DUR + S6_DUR} durationInFrames={FINISH_DUR} name="Finish">
        <Scene11EndCard />
      </Sequence>

      {/* ─────────────── AUDIO ─────────────── */}
      {/* Background music — whole video, low bed. Fades in over the first ~0.7s
          and out over the last ~1.5s. startFrom skips the file's leading silence. */}
      <Audio
        src={AM_AUDIO.music}
        startFrom={AM_TRIM.music}
        volume={(f) =>
          interpolate(
            f,
            [0, 20, AI_MATCH_DURATION - 45, AI_MATCH_DURATION - 1],
            [0, 0.28, 0.28, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }
        name="Background Music"
      />

      {/* S4 — a whoosh as each of the 3 school cards appears (same level as AI RA). */}
      {AM_CUE.cards.map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={20} name={`SFX Whoosh ${i + 1}`}>
          <Audio src={AM_AUDIO.whoosh} startFrom={AM_TRIM.whoosh} volume={0.1625} name={`Whoosh ${i + 1}`} />
        </Sequence>
      ))}

      {/* S6 — mouse click as the player card is clicked. */}
      <Sequence from={AM_CUE.click} durationInFrames={30} name="SFX Card Click">
        <Audio src={AM_AUDIO.click} startFrom={AM_TRIM.click} volume={0.9} name="Card Click" />
      </Sequence>
    </AbsoluteFill>
  );
};
