import React from "react";
import { Composition } from "remotion";
import { HelloDirectRecruit } from "./HelloDirectRecruit";
import { AiRaDemo } from "./AiRaDemo";

/**
 * Composition registry. Add a <Composition> per video/scene here.
 * Story/reel default: 1080×1920 @ 30fps.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HelloDirectRecruit"
        component={HelloDirectRecruit}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="AiRaDemo"
        component={AiRaDemo}
        durationInFrames={1122}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
