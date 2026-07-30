import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { colors } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { S1Hook, S1_HOOK_DURATION } from "./S1Hook";

/**
 * RECRUITING PIPELINE — college coach recruiting board carousel (1080x1350).
 *
 * Lives under posts/ because these are social POSTS, not launch videos. The
 * frame rules come from Videos/Resources/social-post-formats.md, and the
 * slides reuse posts/post-kit.tsx (PostFrame, safe-area guide) so they inherit
 * the same TikTok caption/rail bounds as every other post.
 *
 * Beats. Slide 1 is ANIMATED; the rest are static. Three slides, not five:
 * S2's second explainer already covers passing a recruit across the staff and
 * the stacked record, which were originally going to be their own slides.
 *
 *   S1  Hook      Every prospect. One pipeline.            [animated]
 *   S2  Grading   Grade it, then explain it.               [static]
 *   S3  Board     Shared recruiting boards across staff.   [static, last]
 *
 * HOW SCENES GET ADDED
 * Append to SCENES below. Duration is derived from the array, so a scene can
 * never fall out of sync with a hardcoded total the way the AI RA offsets did.
 * Each static slide ALSO gets registered as its own <Still> in Root.tsx — that
 * is what actually gets exported as a PNG to post. This composition exists so
 * the animated hook has a timeline and so the whole set can be previewed in
 * order.
 *
 * NAMING: every registered id carries its frame size, matching the existing
 * feed cuts. This composition is `RecruitingPipeline-1080x1350`; the per-slide
 * stills follow as `RecruitingPipeline-S2-Grading-1080x1350`, and so on.
 */

export type PipelineScene = {
  /** Sequence name shown in the Studio timeline. */
  name: string;
  durationInFrames: number;
  component: React.FC;
};

// Scenes get appended here one at a time.
export const SCENES: PipelineScene[] = [
  { name: "S1 · Hook", durationInFrames: S1_HOOK_DURATION, component: S1Hook },
];

// Remotion rejects a composition with duration 0, so hold a blank branded frame
// until the first scene lands.
const EMPTY_DURATION = 30;

export const RECRUITING_PIPELINE_DURATION =
  SCENES.reduce((total, s) => total + s.durationInFrames, 0) || EMPTY_DURATION;

export const RecruitingPipeline: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      {SCENES.map((scene) => {
        const Comp = scene.component;
        const start = from;
        from += scene.durationInFrames;
        return (
          <Sequence
            key={scene.name}
            from={start}
            durationInFrames={scene.durationInFrames}
            name={scene.name}
          >
            <Comp />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
