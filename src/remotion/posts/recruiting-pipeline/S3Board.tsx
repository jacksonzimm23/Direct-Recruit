import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { RecruitCard, type BoardRecruit } from "./rp-kit";

/**
 * S3 — SHARED BOARD (static, 1080x1350). Final slide of the carousel.
 *
 * Composition follows the reference layout: logo top center, a two-line white
 * title, then a browser window pushed off the right and bottom edges so only
 * its top-left corner is on frame. Annotation callouts sit down the left with
 * curved arrows into the screenshot.
 *
 * The window shows the college-coach recruiting board zoomed to roughly a
 * quarter of the screen: one full position column of graded, ranked recruits
 * plus most of the next. Deliberately no board name, no toggles, no control
 * buttons. The board itself is the whole subject.
 *
 * Type outside the board screenshot is white, except the callout headings,
 * which are orange to tie them to their arrows. Cerulean is left entirely to
 * the product UI inside the window (the position label pills). S2 follows the
 * same orange-heading-over-white-body treatment.
 *
 * Sources for the board chrome:
 *   recruiting-board.css  .football-field, .position-label-input,
 *                         .recruits-list, .recruit-card
 *   recruiting-board.js   renderBoard(), createPlayerCard()
 *
 * WHY QB LEADS THE COLUMNS. The default offense layout opens with the OL row
 * (LT/LG/C/RG/RT, DEFAULT_OFFENSE_POSITIONS). Position labels are editable
 * inputs and whole columns are drag-reorderable in the product, so a
 * QB-first board is a real state a coach can save, and QB/RB read instantly
 * at feed size where LT/LG do not.
 *
 * Static only. Nothing here reads useCurrentFrame(), so the Still and any
 * later video reuse render identically.
 */

// ── Left column: annotation callouts ──────────────────────────────────
// Ends at x=336, just clear of the window. Narrower than it looks like it
// wants to be: the column gave up 40px so the window could move left and put
// the second position column properly on frame.
const CALLOUT_X = 44;
const CALLOUT_W = 292;

// ── Browser window ────────────────────────────────────────────────────
// Runs off the right and bottom edges. Width/height only have to be large
// enough to clear the frame; the frame does the cropping.
const WIN_X = 356;
const WIN_Y = 396;
const WIN_W = 780; // right edge at 1184, off frame
const WIN_H = 1010; // bottom edge at 1406, off frame
const CHROME_H = 58;

// ── Board geometry ────────────────────────────────────────────────────
// Every number is the product's CSS times ~2.2, the same scale rp-kit uses.
// These are explicit rather than flowed because the arrow tips below are
// aimed at exact card coordinates, and a flexed layout would leave them
// guessing.
const FIELD_INSET = 24; // gap between the window edge and .football-field
const FIELD_PAD = 33; // .football-field padding: 1.5rem
const LABEL_H = 74; // .position-label-input
const LABEL_GAP = 24; // its margin-bottom: 0.75rem
const LIST_PAD = 18; // .recruits-list padding: 0.5rem
// 360 is the floor. rp-kit's card spends 48px on padding, 22px on the gap and
// ~70px on a two-digit grade pill, leaving 220px of text column, and the
// longest name here ("Marcus Ellison" at 30px Inter Bold) measures ~205px. Any
// narrower and a name overflows, because the card is whiteSpace: nowrap.
const CARD_W = 360;
const CARD_H = 110;
const CARD_GAP = 30; // .recruit-card margin-bottom: 0.5rem, opened up slightly
const COL_W = CARD_W + LIST_PAD * 2;
const COL_GAP = 26; // .position-group gap: 0.75rem

const FIELD_X = WIN_X + FIELD_INSET; // 380
const FIELD_Y = WIN_Y + CHROME_H + FIELD_INSET; // 478
const COL1_X = FIELD_X + FIELD_PAD; // 413
const LABEL_Y = FIELD_Y + FIELD_PAD; // 511
const LIST_Y = LABEL_Y + LABEL_H + LABEL_GAP; // 609
const CARD_X = COL1_X + LIST_PAD; // 431

/** Top edge of the nth card in a column. */
const cardTop = (i: number) => LIST_Y + LIST_PAD + i * (CARD_H + CARD_GAP);

// Grade pill center, derived from rp-kit's card: 22px right padding, ~70px
// pill for a two-digit grade, 53px tall and vertically centered.
const PILL_W = 70;
const PILL_X = CARD_X + CARD_W - 22 - PILL_W; // 699

// ── Board contents ────────────────────────────────────────────────────
// Ranked best to worst down each column, which is the whole point of the
// first callout. One transfer in the QB room so the red card treatment shows
// up, same as S1.
const QB_COLUMN: BoardRecruit[] = [
  { name: "Marcus Ellison", position: "QB", height: "6'3\"", weight: "212 lbs", grade: 92, colorTag: "dark_green" },
  { name: "Trey Beaumont", position: "QB", height: "6'4\"", weight: "208 lbs", grade: 86, colorTag: "light_green" },
  { name: "Jordan Vance", position: "QB", height: "6'2\"", weight: "205 lbs", grade: 71, colorTag: "yellow", transfer: true },
  { name: "Chase Mullen", position: "QB", height: "6'1\"", weight: "196 lbs", grade: 64, colorTag: "orange" },
  { name: "Rowan Kessler", position: "QB", height: "6'0\"", weight: "188 lbs", grade: 52, colorTag: "red" },
];

// Second column runs off the right edge: stripe, name and measurables land on
// frame, the grade pill does not. Names are all kept short enough to clear
// x=1080 in that position so none of them break mid-word.
const RB_COLUMN: BoardRecruit[] = [
  { name: "Amari Boone", position: "RB", height: "5'11\"", weight: "205 lbs", grade: 89, colorTag: "light_green" },
  { name: "Silas Draper", position: "RB", height: "6'0\"", weight: "212 lbs", grade: 77, colorTag: "light_green" },
  { name: "Kade Nowak", position: "RB", height: "5'10\"", weight: "198 lbs", grade: 68, colorTag: "yellow" },
  { name: "Marquez Hill", position: "RB", height: "5'9\"", weight: "191 lbs", grade: 55, colorTag: "red" },
];

// ── Browser chrome ────────────────────────────────────────────────────
// Only the top-left corner is rounded; the other three run off frame.
const TrafficLights: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
      <div key={c} style={{ width: 26, height: 26, borderRadius: "50%", background: c }} />
    ))}
  </div>
);

/**
 * One position column: the cerulean label pill over the dashed drop list.
 * Cards are absolutely positioned off cardTop() so the arrow targets stay
 * honest.
 */
const PositionColumn: React.FC<{ x: number; label: string; recruits: BoardRecruit[] }> = ({ x, label, recruits }) => (
  <>
    <div
      style={{
        position: "absolute",
        left: x,
        top: LABEL_Y,
        width: COL_W,
        height: LABEL_H,
        background: colors.cerulean,
        border: "1px solid rgba(18,130,162,0.4)",
        borderRadius: 18,
        color: colors.white,
        fontWeight: 800,
        fontSize: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      {label}
    </div>

    {/* .recruits-list — dashed drop target. Runs off the bottom of the frame,
        so no explicit height: it is clipped by the window. */}
    <div
      style={{
        position: "absolute",
        left: x,
        top: LIST_Y,
        width: COL_W,
        bottom: 0,
        background: "rgba(11,37,69,0.3)",
        border: "1px dashed rgba(18,130,162,0.3)",
        borderRadius: 18,
        boxSizing: "border-box",
      }}
    />

    {recruits.map((r, i) => (
      <div key={r.name} style={{ position: "absolute", left: x + LIST_PAD, top: cardTop(i) }}>
        <RecruitCard r={r} width={CARD_W} showPosition={false} />
      </div>
    ))}
  </>
);

// ── Callout arrows ────────────────────────────────────────────────────
// Orange so the annotation layer reads as drawn ON the screenshot rather than
// as part of it. Cerulean is reserved for the slide title, and white would
// read as UI.
const ARROW = colors.accentOrange;
type Pt = { x: number; y: number };

/**
 * Quadratic curve with a head at the end. The head angle comes from the
 * curve's own tangent at t=1, which for a quadratic is simply (to - ctrl), so
 * the head always points along the line instead of being hand-rotated.
 */
const CalloutArrow: React.FC<{ from: Pt; ctrl: Pt; to: Pt }> = ({ from, ctrl, to }) => {
  const angle = Math.atan2(to.y - ctrl.y, to.x - ctrl.x);
  const HEAD = 26;
  const SPREAD = 0.42; // radians off the shaft
  const barb = (sign: number) => ({
    x: to.x - HEAD * Math.cos(angle + sign * SPREAD),
    y: to.y - HEAD * Math.sin(angle + sign * SPREAD),
  });
  const a = barb(-1);
  const b = barb(1);
  const stroke = { stroke: ARROW, strokeWidth: 4, fill: "none", strokeLinecap: "round" as const };
  return (
    <>
      <path d={`M ${from.x} ${from.y} Q ${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`} {...stroke} />
      <path d={`M ${a.x} ${a.y} L ${to.x} ${to.y} L ${b.x} ${b.y}`} {...stroke} strokeLinejoin="round" />
    </>
  );
};

const Callout: React.FC<{ y: number; heading: string; body: string }> = ({ y, heading, body }) => (
  <div style={{ position: "absolute", left: CALLOUT_X, top: y, width: CALLOUT_W }}>
    {/* Orange, matching the arrows: heading and arrow are one annotation
        gesture, and it separates them from the white body copy. */}
    <div style={{ ...brandType.heading, fontSize: 27, color: colors.accentOrange, marginBottom: 14 }}>{heading}</div>
    {/* Full white, not the 78% used elsewhere. On a 292px column at 25px this
        wraps to 3-4 lines, which is what sets the callout block heights the
        arrow start points below are spaced against. */}
    <div style={{ ...brandType.body, fontSize: 25, lineHeight: 1.5, color: colors.white }}>{body}</div>
  </div>
);

// Callout blocks, and the arrows that leave them. Arrow 1 lands on the left
// edge of the top card (the No. 1 in the room). Arrow 2 runs right through
// the empty channel between cards 3 and 4 and hooks up under a grade pill, so
// it never crosses a name.
//
// Both tails start ~20px under the last line of their body copy. Each body
// wraps to exactly three lines at 25px in a 292px column, so a block runs
// 27px of heading + 14px margin + 112px of copy; change the copy length and
// these two numbers have to move with it.
const A1_TAIL_Y = 634; // A1_TOP + 153 + 19
const A2_TAIL_Y = 1000; // A2_TOP + 153 + 21
const A1_TOP = 462;
const A2_TOP = 826;

export const S3Board: React.FC = () => (
  <AbsoluteFill style={{ fontFamily }}>
    <SlideBG />

    {/* Logo — same spot as S1 and S2 so the carousel holds its anchor. */}
    <div style={{ position: "absolute", top: 48, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <Img src={staticFile("dr-logo.png")} style={{ width: 92, display: "block" }} />
    </div>

    {/* Title — white, two lines. At 66 the longer line measures x 161..922,
        clear of x=950 where TikTok's action rail starts. ~71 is the hard
        ceiling for that string on two lines. */}
    <div
      style={{
        ...brandType.hero,
        position: "absolute",
        top: 186,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 66,
        color: colors.white,
      }}
    >
      Shared Recruiting Boards
      <br />
      Across Your Staff
    </div>

    {/* ── The board, in a browser window cropped to its top-left corner ── */}
    <div
      style={{
        position: "absolute",
        left: WIN_X,
        top: WIN_Y,
        width: WIN_W,
        height: WIN_H,
        background: colors.oxfordBlue,
        border: "1px solid rgba(125,200,230,0.22)",
        borderTopLeftRadius: 24,
        boxShadow: "0 34px 80px -26px rgba(0,0,0,0.8)",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          height: CHROME_H,
          background: "rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(125,200,230,0.16)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 28,
        }}
      >
        <TrafficLights />
      </div>

      {/* .football-field container. Positioned relative to the FRAME, not the
          window, because everything above is in frame coordinates: the window
          is only here to clip and to draw the chrome. */}
      <div
        style={{
          position: "absolute",
          left: FIELD_X - WIN_X,
          top: FIELD_Y - WIN_Y,
          right: -1,
          bottom: -1,
          background: "rgba(18,130,162,0.05)",
          border: "1px solid rgba(18,130,162,0.2)",
          borderTopLeftRadius: 16,
        }}
      />
      <div style={{ position: "absolute", left: -WIN_X, top: -WIN_Y, width: 1080, height: 1350 }}>
        <PositionColumn x={COL1_X} label="QB" recruits={QB_COLUMN} />
        <PositionColumn x={COL1_X + COL_W + COL_GAP} label="RB" recruits={RB_COLUMN} />
      </div>
    </div>

    {/* ── Annotation layer, over the window ─────────────────────────── */}
    <Callout
      y={A1_TOP}
      heading="Ranked, top to bottom"
      body="Drag and drop recruits into the order your staff wants them"
    />
    <Callout
      y={A2_TOP}
      heading="Final grade on the card"
      body="The staff's agreed grade and color travel with every recruit."
    />

    <svg width={1080} height={1350} style={{ position: "absolute", inset: 0 }}>
      {/* to the left edge of the top card */}
      <CalloutArrow from={{ x: 160, y: A1_TAIL_Y }} ctrl={{ x: 320, y: 676 }} to={{ x: CARD_X - 8, y: cardTop(0) + CARD_H / 2 }} />
      {/* along the gap between cards 3 and 4, then up under the grade pill */}
      <CalloutArrow
        from={{ x: 210, y: A2_TAIL_Y }}
        ctrl={{ x: 620, y: 1040 }}
        to={{ x: PILL_X + 13, y: cardTop(2) + CARD_H / 2 + 36 }}
      />
    </svg>
  </AbsoluteFill>
);
