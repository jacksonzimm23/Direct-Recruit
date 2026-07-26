import React from "react";
import { Composition } from "remotion";
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
    </>
  );
};
