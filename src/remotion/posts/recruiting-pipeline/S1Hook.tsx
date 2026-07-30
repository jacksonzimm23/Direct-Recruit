import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { SAFE_BOTTOM } from "../post-kit";
import { RecruitCard, type BoardRecruit } from "./rp-kit";

/**
 * S1 — HOOK (animated, 1080x1350).
 *
 * Constellation layout: a centered text block, with real recruiting-board
 * cards emerging FROM the center of that text on hairlines, settling into
 * orbit, drifting, then shrinking back into the middle.
 *
 * Beat map (30fps, 540 frames = 18s):
 *   f0        logo, title and body are ALREADY on screen (no entrance)
 *   f0-63     four cards emerge from center, staggered and overlapping
 *   f63-470   cards hold and drift (~15s of float, per spec)
 *   f470-525  cards shrink back into the center, staggered
 *   f525-540  text alone
 *
 * Because the text never animates and the cards start and end tucked inside
 * it, frame 539 is identical to frame 0 — the clip loops seamlessly, which is
 * what Instagram does with carousel video slides.
 */

const CARDS_START = 0;
const CARD_STAGGER = 11;
const RETRACT_START = 470;
const RETRACT_STAGGER = 9;
const RETRACT_DUR = 26;

export const S1_HOOK_DURATION = 540;

// Where the cards are born and where they return. Sits in the middle of the
// title block so they appear to come out of the words themselves.
const ORIGIN_X = 540;
const ORIGIN_Y = 616;

// Resting card positions (center coords). Two above the text, two below.
// Every card is kept inside x<950 and y<1148 so the frozen still survives
// TikTok's rail and caption bands — see social-post-formats.md.
type Placed = { r: BoardRecruit; x: number; y: number; phase: number };

const CARDS: Placed[] = [
  {
    r: { name: "Marcus Ellison", position: "QB", height: "6'3\"", weight: "212 lbs", grade: 92, colorTag: "dark_green" },
    x: 292,
    y: 375,
    phase: 0,
  },
  {
    r: { name: "Darius Whitfield", position: "WR", height: "6'1\"", weight: "194 lbs", grade: 84, colorTag: "light_green" },
    x: 740,
    y: 310,
    phase: 40,
  },
  {
    r: { name: "Jordan Vance", position: "QB", height: "6'2\"", weight: "205 lbs", grade: 71, colorTag: "yellow", transfer: true },
    x: 288,
    y: 995,
    phase: 80,
  },
  {
    r: { name: "Elijah Grant", position: "CB", height: "5'11\"", weight: "182 lbs", grade: 63, colorTag: "orange" },
    x: 736,
    y: 1045,
    phase: 120,
  },
];

const BODY_COPY =
  "Every prospect runs the same path: graded, passed to any coach on staff for a second read, then ranked on a board everyone shares. Every grade stays attached to the player's history with the coach's name on it.";

/**
 * How far a card is extended from the origin, 0 (in the center, invisible) to
 * 1 (fully out at rest). One value drives position, scale and opacity so the
 * emerge and the retract are exact mirrors of each other.
 *
 * A plain function, not a hook: spring() and interpolate() are pure in
 * Remotion, and the connector-line layer needs to compute this for all four
 * cards inside a map (where calling a hook would be illegal).
 */
const extensionAt = (frame: number, fps: number, index: number): number => {
  const emergeStart = CARDS_START + index * CARD_STAGGER;
  const emerge = spring({
    frame: frame - emergeStart,
    fps,
    config: { damping: 200 },
  });

  const retractStart = RETRACT_START + index * RETRACT_STAGGER;
  const retract = interpolate(frame, [retractStart, retractStart + RETRACT_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    // Accelerates as it goes so the card looks pulled back in.
    easing: Easing.in(Easing.cubic),
  });

  return emerge * (1 - retract);
};

// Bounding box of the text block. Cards are invisible while inside it (they
// read as emerging from behind the words) and connector lines start at its
// edge rather than dead center, so nothing slashes across the headline.
const TEXT_BOX = { left: 140, right: 940, top: 575, bottom: 856 };

/**
 * Where a ray from the origin to a card exits the text box. Returns null when
 * the card is still inside the box, which is the signal to draw no line yet.
 * Standard slab method.
 */
const exitPoint = (cx: number, cy: number): { x: number; y: number } | null => {
  const dx = cx - ORIGIN_X;
  const dy = cy - ORIGIN_Y;
  const tx = dx > 0 ? (TEXT_BOX.right - ORIGIN_X) / dx : dx < 0 ? (TEXT_BOX.left - ORIGIN_X) / dx : Infinity;
  const ty = dy > 0 ? (TEXT_BOX.bottom - ORIGIN_Y) / dy : dy < 0 ? (TEXT_BOX.top - ORIGIN_Y) / dy : Infinity;
  const t = Math.min(tx, ty);
  if (!Number.isFinite(t) || t >= 1) return null; // card still behind the text
  return { x: ORIGIN_X + dx * t, y: ORIGIN_Y + dy * t };
};

/**
 * How far a point sits OUTSIDE the text box, in px (0 when over the text).
 * Card opacity keys off this rather than off travel progress, so a card is
 * invisible whenever it overlaps the words — on the way out AND on the way
 * back in. Keying off progress alone left cards visible on top of the body
 * copy during the retract.
 */
const distanceOutsideText = (x: number, y: number): number => {
  const dx = Math.max(0, TEXT_BOX.left - x, x - TEXT_BOX.right);
  const dy = Math.max(0, TEXT_BOX.top - y, y - TEXT_BOX.bottom);
  return Math.sqrt(dx * dx + dy * dy);
};

/** Drift offset for a settled card, faded out by `e` so it dies with the card. */
const driftAt = (frame: number, phase: number, e: number) => ({
  x: Math.sin((frame + phase) * 0.021) * 8 * e,
  y: Math.cos((frame + phase * 1.4) * 0.017) * 11 * e,
});

/** Live center of a card at a given frame. Shared by the card and its line. */
const centerAt = (frame: number, fps: number, item: Placed, index: number) => {
  const e = extensionAt(frame, fps, index);
  const drift = driftAt(frame, item.phase, e);
  return {
    e,
    x: interpolate(e, [0, 1], [ORIGIN_X, item.x]) + drift.x,
    y: interpolate(e, [0, 1], [ORIGIN_Y, item.y]) + drift.y,
  };
};

const FloatingCard: React.FC<{ item: Placed; index: number }> = ({ item, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { e, x, y } = centerAt(frame, fps, item, index);

  const scale = interpolate(e, [0, 1], [0.16, 1]);
  // Invisible while over the text, fading up as it clears. Symmetric, so the
  // retract hides the card again on the way back in.
  const opacity = interpolate(distanceOutsideText(x, y), [0, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
      }}
    >
      <RecruitCard r={item.r} />
    </div>
  );
};

/** Hairlines from the center of the text out to each card, Claude-post style. */
const ConnectorLines: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <svg width={1080} height={1350} style={{ position: "absolute", inset: 0 }}>
        {CARDS.map((item, i) => {
          const { e, x, y } = centerAt(frame, fps, item, i);
          if (e <= 0.01) return null;
          const start = exitPoint(x, y);
          if (!start) return null; // card has not cleared the text yet
          return (
            <line
              key={i}
              x1={start.x}
              y1={start.y}
              x2={x}
              y2={y}
              stroke="rgba(254,252,251,0.9)"
              strokeWidth={1.5}
              opacity={e * 0.22}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const S1Hook: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily }}>
      {/* Paint order: lines, then cards, then text on top. The text has to be
          last so a card emerging from the middle passes BEHIND the words
          rather than over them. */}
      <ConnectorLines />

      {/* ── Orbiting board cards ──────────────────────────────────────── */}
      {CARDS.map((item, i) => (
        <FloatingCard key={item.r.name} item={item} index={i} />
      ))}

      {/* ── Centered text block. Fully static: on screen from frame 0, never
             animates, which is what makes the clip loop. ─────────────────── */}
      <AbsoluteFill>
        {/* Logo, top center */}
        <div style={{ position: "absolute", top: 48, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Img src={staticFile("dr-logo.png")} style={{ width: 92, display: "block" }} />
        </div>

        {/* Title — white, one line. Sized so the line stays inside x<950 and
            never runs under TikTok's action rail. */}
        <div
          style={{
            ...brandType.hero,
            position: "absolute",
            top: 584,
            left: 0,
            right: 0,
            textAlign: "center",
            // 61 is the ceiling for this string on ONE line at 1080 wide: any
            // larger and the centered line pushes past x=950 into TikTok's
            // action rail. Two lines would allow ~76.
            fontSize: 61,
            color: colors.white,
            whiteSpace: "nowrap",
          }}
        >
          Every Prospect. One Pipeline.
        </div>

        {/* Body */}
        <div
          style={{
            ...brandType.body,
            position: "absolute",
            top: 686,
            left: 0,
            right: 0,
            margin: "0 auto",
            maxWidth: 800,
            textAlign: "center",
            fontSize: 27,
            lineHeight: 1.45,
            color: colors.white,
          }}
        >
          {BODY_COPY}
        </div>
      </AbsoluteFill>

      {/* Reserved TikTok caption band. Nothing is allowed to land here. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SAFE_BOTTOM }} />
    </AbsoluteFill>
  );
};
