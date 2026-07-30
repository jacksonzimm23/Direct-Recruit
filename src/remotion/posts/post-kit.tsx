import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { colors, fontFamily, type as brandType } from "../brand";
import { SlideBG } from "../components/primitives";

/**
 * Shared kit for STATIC photo posts (1080x1350).
 *
 * See Videos/Resources/social-post-formats.md for the frame decision and the
 * export workflow. The short version: every post is registered as a <Still>,
 * never as a scene inside a video composition, so exports need no frame math.
 *
 * Nothing in here reads useCurrentFrame() on purpose. These components must
 * render identically at any frame so a Still and a video reuse of the same
 * artwork can never drift.
 */

export const POST_W = 1080;
export const POST_H = 1350;
export const POST_PAD = 72;

// ── TikTok safe area ──────────────────────────────────────────────────
// Instagram and X do not overlay the feed image; TikTok does. Its caption
// block eats the bottom band and its like/comment/share rail eats the right
// band. TEXT AND LOGOS must stay inside these bounds. Photos may run past
// them: a rail sitting over the edge of an image is fine, over a word is not.
export const SAFE_BOTTOM = Math.round(POST_H * 0.15); // 202px of dead space
export const SAFE_RIGHT = Math.round(POST_W * 0.12); // 130px of dead space
export const SAFE_MAX_X = POST_W - SAFE_RIGHT; // text must end by x=950
export const SAFE_MAX_Y = POST_H - SAFE_BOTTOM; // text must end by y=1148
export const TEXT_MAX_W = SAFE_MAX_X - POST_PAD; // 878px usable text column

// ── Safe-area guide ───────────────────────────────────────────────────
// Dev-only overlay. Flip `showSafeArea` on a Still's defaultProps in Root.tsx
// to check a layout, then flip it back off before exporting.
export const SafeAreaGuide: React.FC = () => {
  const band: React.CSSProperties = {
    position: "absolute",
    background: "rgba(255,107,53,0.12)",
    border: `2px dashed ${colors.accentOrange}`,
  };
  const label: React.CSSProperties = {
    ...brandType.eyebrow,
    position: "absolute",
    fontSize: 18,
    color: colors.accentOrange,
  };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ ...band, left: 0, right: 0, bottom: 0, height: SAFE_BOTTOM }} />
      <div style={{ ...band, top: 0, bottom: 0, right: 0, width: SAFE_RIGHT }} />
      <div style={{ ...label, left: 16, bottom: SAFE_BOTTOM - 30 }}>
        TikTok caption ({SAFE_BOTTOM}px)
      </div>
      <div style={{ ...label, right: SAFE_RIGHT + 12, top: 16 }}>rail ({SAFE_RIGHT}px)</div>
    </AbsoluteFill>
  );
};

// ── PostFrame ─────────────────────────────────────────────────────────
// The 1080x1350 shell every post sits in: brand background, padding, and the
// explicit fontFamily. That fontFamily is not optional. A component that omits
// it inherits the browser default and silently renders in a serif fallback,
// which is easy to miss in a moving video frame and glaring on a still where
// type is the whole design.
export const PostFrame: React.FC<{
  children: React.ReactNode;
  showSafeArea?: boolean;
}> = ({ children, showSafeArea = false }) => (
  <AbsoluteFill style={{ fontFamily, backgroundColor: colors.oxfordBlue }}>
    <SlideBG />
    {/* paddingBottom is SAFE_BOTTOM, not POST_PAD. The content column has to
        END at the safe line, otherwise any flex:1 child (the photo grid) grows
        into the caption band and shoves the footer under TikTok's UI. The band
        below reads as deliberate bottom margin on Instagram and X. */}
    <AbsoluteFill
      style={{
        paddingTop: POST_PAD,
        paddingLeft: POST_PAD,
        paddingRight: POST_PAD,
        paddingBottom: SAFE_BOTTOM,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </AbsoluteFill>
    {showSafeArea ? <SafeAreaGuide /> : null}
  </AbsoluteFill>
);

// Accepts either a resolved staticFile() URL (what defaultProps gives you) or a
// bare path relative to public/ (what you can type into --props on the CLI,
// where staticFile() cannot be called). Anything already absolute is passed
// through untouched.
export const resolveSrc = (src: string): string =>
  /^(https?:|blob:|data:|\/)/.test(src) ? src : staticFile(src);

// ── PhotoSlot ─────────────────────────────────────────────────────────
// One cell of the collage. Renders a placeholder when no src is supplied so a
// layout can be composed and reviewed before the photography exists.
export const PhotoSlot: React.FC<{ src?: string; span?: boolean }> = ({ src, span }) => {
  const shell: React.CSSProperties = {
    position: "relative",
    gridColumn: span ? "span 2" : undefined,
    borderRadius: 20,
    overflow: "hidden",
    background: "rgba(254,252,251,0.04)",
    border: "1px solid rgba(18,130,162,0.25)",
  };
  if (!src) {
    return (
      <div style={{ ...shell, borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...brandType.eyebrow, fontSize: 20, color: "rgba(254,252,251,0.35)" }}>Photo</span>
      </div>
    );
  }
  return (
    <div style={shell}>
      <Img src={resolveSrc(src)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
};

// ── Footer lockup ─────────────────────────────────────────────────────
// Logo + handle. Pinned inside the safe area, never in the TikTok caption band.
export const PostFooter: React.FC<{ handle?: string }> = ({ handle = "@directrecruit" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 28 }}>
    <Img src={staticFile("dr-logo.png")} style={{ width: 64, display: "block" }} />
    <span style={{ ...brandType.subheading, fontSize: 28, color: "rgba(254,252,251,0.75)" }}>{handle}</span>
  </div>
);
