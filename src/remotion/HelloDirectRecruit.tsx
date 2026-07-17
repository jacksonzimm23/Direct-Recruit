import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, gradients, type } from "./brand";

/**
 * Starter composition — proves the brand system renders on-brand.
 * Chronixel style: dark cinematic bg, subtle grid, off-white text, orange accent.
 */
export const HelloDirectRecruit: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(enter, [0, 1], [40, 0]);
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      {/* subtle grid overlay */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translateY(${y}px)`,
          opacity,
        }}
      >
        <div
          style={{
            ...type.eyebrow,
            color: colors.accentOrange,
            fontSize: 34,
            marginBottom: 24,
          }}
        >
          DIRECT RECRUIT
        </div>
        <div
          style={{
            ...type.hero,
            color: colors.white,
            fontSize: 150,
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          Get Recruited.
        </div>
        <div
          style={{
            marginTop: 40,
            width: 320,
            height: 10,
            borderRadius: 999,
            background: gradients.orangeSweep,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
