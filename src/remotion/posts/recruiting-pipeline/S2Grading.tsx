import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { AddGradeModal, EvaluationPanel, type CoachEval } from "./eval-ui";

/**
 * S2 — GRADING (static, 1080x1350).
 *
 * Two real panels down the left, an explanation beside each on the right:
 *   top     Add Grade modal          -> one scale for the whole staff
 *   bottom  Evaluation tab list      -> every read on the record, easy hand-off
 *
 * No animation anywhere. Exported as a PNG via the RecruitingPipeline-S2
 * Still; nothing here reads useCurrentFrame().
 */

// ── Layout ────────────────────────────────────────────────────────────
// Panels hug the left margin, copy sits to their right and stops at x=946 so
// nothing runs under TikTok's action rail. The lowest element bottoms out
// above y=1148, the caption band. See social-post-formats.md.
const PANEL_X = 52;
const PANEL_W = 466;
const COPY_X = 552;
const COPY_W = 394;

const TOP_Y = 176;
const BOTTOM_Y = 706;

const EVALS: CoachEval[] = [
  { coach: "Coach Delgado", grade: 92, colorTag: "dark_green", date: "Mar 18, 2026" },
  { coach: "Coach Whitmore", grade: 88, colorTag: "dark_green", date: "Mar 16, 2026" },
  { coach: "Coach Ruiz", grade: 81, colorTag: "light_green", date: "Mar 15, 2026" },
  {
    coach: "Coach Hall",
    grade: 74,
    colorTag: "yellow",
    date: "Mar 12, 2026",
    notes: "Elite arm talent, quick release. Needs to speed up his reads against man coverage.",
  },
];

// Matches S3's callout treatment: orange bold heading over white body copy at
// 25px. S3 sets its headings at 27; 28 is kept here because it was measured
// against this column's nowrap constraint, and the difference is invisible
// across two slides of a carousel.
const Explainer: React.FC<{ y: number; heading: string; body: string }> = ({ y, heading, body }) => (
  <div style={{ position: "absolute", left: COPY_X, top: y, width: COPY_W }}>
    {/* 28px is sized so the longest heading ("Every read, on the record")
        holds a single row inside COPY_W without reaching TikTok's rail. */}
    <div
      style={{
        ...brandType.heading,
        fontSize: 28,
        color: colors.accentOrange,
        marginBottom: 16,
        whiteSpace: "nowrap",
      }}
    >
      {heading}
    </div>
    <div style={{ ...brandType.body, fontSize: 25, lineHeight: 1.5, color: colors.white }}>{body}</div>
  </div>
);

export const S2Grading: React.FC = () => (
  <AbsoluteFill style={{ fontFamily }}>
    <SlideBG />

    {/* Logo — same position as S1 so the carousel holds its anchor. */}
    <div style={{ position: "absolute", top: 48, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <Img src={staticFile("dr-logo.png")} style={{ width: 92, display: "block" }} />
    </div>

    {/* ── Top: the Add Grade modal ─────────────────────────────────── */}
    <div style={{ position: "absolute", left: PANEL_X, top: TOP_Y }}>
      <AddGradeModal
        width={PANEL_W}
        grade={78}
        selected="light_green"
        notes="Strong arm, high effort player. Potential to be a key starter."
      />
    </div>
    <Explainer
      y={TOP_Y + 78}
      heading="Grade it, then explain it"
      body="Grade a player 0 to 100 and assign a color tag. Then leave notes. That is where the evaluation actually lives: what you saw on film, what he needs to clean up, and why you landed on that number."
    />

    {/* ── Bottom: the evaluation history ───────────────────────────── */}
    <div style={{ position: "absolute", left: PANEL_X, top: BOTTOM_Y }}>
      <EvaluationPanel
        width={PANEL_W}
        recruitName="Marcus Ellison"
        recruitLine={"QB • 6'3\" • 212 lbs"}
        evals={EVALS}
      />
    </div>
    <Explainer
      y={BOTTOM_Y + 96}
      heading="Every read, on the record"
      body="Pass a recruit to anyone on staff and their evaluation stacks onto his history with a name and a date attached. You get real depth on every prospect instead of one opinion."
    />
  </AbsoluteFill>
);
