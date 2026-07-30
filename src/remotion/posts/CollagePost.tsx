import React from "react";
import { colors, type as brandType } from "../brand";
import {
  PostFrame,
  PhotoSlot,
  PostFooter,
  TEXT_MAX_W,
} from "./post-kit";

/**
 * One parameterised photo-collage post (1080x1350).
 *
 * A NEW POST IS A NEW <Still> IN Root.tsx, NOT A NEW FILE. Duplicate the
 * <Still> line, give it a fresh id, change the defaultProps. Only write a new
 * component when the LAYOUT differs, not when the content does.
 *
 * Props are JSON-serializable so they can also be overridden at render time:
 *   npx remotion still src/remotion/index.ts <id> out/posts/x.png --props='{"headline":"..."}'
 */

export type CollagePostProps = {
  eyebrow: string;
  headline: string;
  /** staticFile() paths. 1 photo spans full width, 3 spans the first. Max 4. */
  photos: string[];
  footnote?: string;
  handle?: string;
  /** Dev overlay showing the TikTok caption + rail bands. Off for exports. */
  showSafeArea?: boolean;
};

export const CollagePost: React.FC<CollagePostProps> = ({
  eyebrow,
  headline,
  photos,
  footnote,
  handle,
  showSafeArea,
}) => {
  const shots = photos.slice(0, 4);
  // 1 photo fills the row; 3 photos give the first one the full top row.
  const spanFirst = shots.length === 1 || shots.length === 3;

  return (
    <PostFrame showSafeArea={showSafeArea}>
      {/* Eyebrow + headline. Constrained to TEXT_MAX_W so the TikTok rail can
          never sit on top of a word. */}
      <div style={{ maxWidth: TEXT_MAX_W }}>
        <div style={{ ...brandType.eyebrow, fontSize: 26, color: colors.accentOrange }}>
          {eyebrow}
        </div>
        <div
          style={{
            ...brandType.hero,
            fontSize: 76,
            color: colors.white,
            marginTop: 16,
          }}
        >
          {headline}
        </div>
      </div>

      {/* Photo grid. Runs the FULL content width on purpose: a rail overlaying
          the edge of an image is acceptable, over type it is not. `flex: 1`
          lets the grid absorb whatever height the headline leaves. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridAutoRows: "1fr",
          gap: 18,
        }}
      >
        {shots.length === 0 ? (
          <>
            <PhotoSlot />
            <PhotoSlot />
            <PhotoSlot />
            <PhotoSlot />
          </>
        ) : (
          shots.map((src, i) => <PhotoSlot key={i} src={src} span={spanFirst && i === 0} />)
        )}
      </div>

      {footnote ? (
        <div
          style={{
            ...brandType.body,
            fontSize: 26,
            color: "rgba(254,252,251,0.6)",
            marginTop: 24,
            maxWidth: TEXT_MAX_W,
          }}
        >
          {footnote}
        </div>
      ) : null}

      <PostFooter handle={handle} />
    </PostFrame>
  );
};
