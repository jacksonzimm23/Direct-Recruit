import { Composition, staticFile } from "remotion";
import { Scene, myCompSchema } from "./Scene";
import { getMediaMetadata } from "./helpers/get-media-metadata";
import { MobileScreen } from "./MobileScreen";
import { PhoneRotate } from "./PhoneRotate";

// Welcome to the Remotion Three Starter Kit!
// Two compositions have been created, showing how to use
// the `ThreeCanvas` component and the `useVideoTexture` hook.

// You can play around with the example or delete everything inside the canvas.

// Remotion Docs:
// https://remotion.dev/docs

// @remotion/three Docs:
// https://remotion.dev/docs/three

// React Three Fiber Docs:
// https://docs.pmnd.rs/react-three-fiber/getting-started/introduction

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MobileScreen"
        component={MobileScreen}
        durationInFrames={1}
        fps={30}
        width={1179}
        height={2556}
      />
      <Composition
        id="PhoneRotate"
        component={PhoneRotate}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene"
        component={Scene}
        fps={30}
        durationInFrames={300}
        width={1280}
        height={720}
        schema={myCompSchema}
        defaultProps={{
          deviceType: "phone",
          phoneColor: "rgba(110, 152, 191, 0.00)" as const,
          baseScale: 1,
          mediaMetadata: null,
          videoSrc: null,
        }}
        calculateMetadata={async ({ props }) => {
          const videoSrc =
            props.deviceType === "phone"
              ? staticFile("phone.mp4")
              : staticFile("tablet.mp4");

          const mediaMetadata = await getMediaMetadata(videoSrc);

          return {
            props: {
              ...props,
              mediaMetadata,
              videoSrc,
            },
          };
        }}
      />
    </>
  );
};
