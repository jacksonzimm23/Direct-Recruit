import React from "react";
import { Composition, Folder, Still } from "remotion";
import { CollagePost, CollagePostProps } from "./posts/CollagePost";
import {
  RecruitingPipeline,
  RECRUITING_PIPELINE_DURATION,
} from "./posts/recruiting-pipeline/RecruitingPipeline";
import { S2Grading } from "./posts/recruiting-pipeline/S2Grading";
import { S3Board } from "./posts/recruiting-pipeline/S3Board";
import { AiRaDemo } from "./AiRaDemo";
import { AiPiDemo } from "./AiPiDemo";
import { AiMatchLaunch, AI_MATCH_DURATION } from "./AiMatchLaunch";
import { AiMatchLaunchFeed, AI_MATCH_FEED_DURATION } from "./AiMatchLaunchFeed";
import { AiRaDemoFeed, AI_RA_FEED_DURATION } from "./AiRaDemoFeed";
import { AiPiDemoFeed, AI_PI_FEED_DURATION } from "./AiPiDemoFeed";

/**
 * Composition registry. Add a <Composition> per video here.
 * Scene components (S1–S6) live in ./scenes and are composed inside AiMatchLaunch —
 * they are intentionally NOT registered as standalone compositions.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AiRaDemo"
        component={AiRaDemo}
        // 1152 = S1 255 (extended +30 for 1.5s subtitle lines) + S2 230 + S3 167
        // + S4 320 + S5 180. Keep in sync with the scene durations in AiRaDemo.tsx.
        durationInFrames={1152}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AiPiDemo"
        component={AiPiDemo}
        // 455 (S1–S2) + 140 (S3 output) + 394 (S4 signal tour) + 180 (S5 end card)
        durationInFrames={1169}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AiMatchLaunch"
        component={AiMatchLaunch}
        // Derived from the scene durations (see AI_MATCH_DURATION) so dropping a
        // hook line can't leave a stale length here. 1211 after the S2 trim.
        durationInFrames={AI_MATCH_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* ── 4:5 in-feed cuts (1080×1350) — fit Instagram + X in-feed, play on TikTok.
          Remotion composition IDs allow only [a-zA-Z0-9-], so the size is hyphenated. ── */}
      <Composition
        id="AiMatchLaunch-1080x1350"
        component={AiMatchLaunchFeed}
        durationInFrames={AI_MATCH_FEED_DURATION}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="AiRaDemo-1080x1350"
        component={AiRaDemoFeed}
        durationInFrames={AI_RA_FEED_DURATION}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="AiPiDemo-1080x1350"
        component={AiPiDemoFeed}
        durationInFrames={AI_PI_FEED_DURATION}
        fps={30}
        width={1080}
        height={1350}
      />

      {/* ── Static photo posts (1080x1350) ────────────────────────────────
          Registered as <Still>, NOT as scenes in a video, so exporting needs
          no frame numbers: one id in, one PNG out. A new post is a new <Still>
          below with fresh defaultProps — only write a new component when the
          LAYOUT changes. See Videos/Resources/social-post-formats.md. ── */}
      <Folder name="Posts">
        <Still
          id="Post-Example-Collage"
          component={CollagePost}
          width={1080}
          height={1350}
          defaultProps={
            {
              eyebrow: "Recruiting, rebuilt",
              headline: "Every player gets seen.",
              photos: [],
              footnote: "Swap photos in via staticFile() paths.",
              handle: "@directrecruit",
              showSafeArea: false,
            } satisfies CollagePostProps
          }
        />

        {/* ── Recruiting Pipeline carousel ──────────────────────────────
            College coach recruiting board feature. S1 is animated (Instagram
            takes it as a video slide; TikTok and X get a frozen still of it),
            S2-S5 are static. Scenes are appended to SCENES in
            posts/recruiting-pipeline/RecruitingPipeline.tsx; each static slide
            also gets its own <Still> here once it exists, since the PNG is
            what actually gets posted. ── */}
        <Folder name="RecruitingPipeline">
          <Composition
            id="RecruitingPipeline-1080x1350"
            component={RecruitingPipeline}
            durationInFrames={RECRUITING_PIPELINE_DURATION}
            fps={30}
            width={1080}
            height={1350}
          />
          {/* S2 onward are STATIC, so they are Stills and are deliberately NOT
              appended to the composition above — adding them would turn the
              hook video into a multi-scene clip and break its seamless loop. */}
          <Still
            id="RecruitingPipeline-S2-Grading-1080x1350"
            component={S2Grading}
            width={1080}
            height={1350}
          />
          <Still
            id="RecruitingPipeline-S3-Board-1080x1350"
            component={S3Board}
            width={1080}
            height={1350}
          />
        </Folder>
      </Folder>
    </>
  );
};
