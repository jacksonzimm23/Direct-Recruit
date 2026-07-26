import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { SlideBG, WordReveal, OrangeSweep } from "../../components/primitives";
import { logo, ContinuousLockup, LOGO_SIZE } from "../../AiRaDemo";

/**
 * Shared VERTICAL bookends (1080×1920) for the RA / PI vertical cuts.
 * - OpenTitledV: the logo-reveal → lockup → shrink motion (reused ContinuousLockup),
 *   settling on a titled anchor (logo + a product title) centered, then flashing
 *   subtitle lines below. Mirrors landscape Scene02Meet_Merged, retimed identical.
 * - EndCardV: the stacked end card (logo, name, slogan, App Store badge, URL).
 * Both are parameterized so RA ("AI Recruiting Assistant") and PI ("AI Portal
 * Intelligence") share one implementation.
 */

const WHITE = colors.white;
const V_CENTER_Y = 675; // 4:5 frame is 1080×1350 → center y = 675

// Settled titled anchor geometry (vertical). Title kept small enough to fit 1080.
export const V_ANCHOR_LOGO_W = 175; // bigger logo relative to the title (matches ra-kit RA_ANCHOR_LOGO_W)
export const V_ANCHOR_TITLE_SIZE = 76; // bigger S1 title (kept in sync with ra-kit RA_ANCHOR_TITLE_SIZE so S1↔S2↔S3 match)
export const V_ANCHOR_GAP = 26;

// The animated ContinuousLockup collapses to a logo whose CENTER sits at
// frame-center + LOGO_SETTLE_DY (the shrink's groupY endpoint). The settled anchor
// MUST draw its logo centered on that SAME point so the hard-swap has zero jump.
// (Previously the settled column was vertically centered, putting its logo ~48px
// higher than the animated endpoint → the logo "jumped" at the swap.)
// ContinuousLockup positions its logo with `top: -LOGO_SIZE/2`, i.e. it assumes the
// asset is SQUARE. dr-logo.png is 1932×2048 (taller than wide), so at width LOGO_SIZE
// the real height is LOGO_SIZE*(2048/1932) and the logo actually sits ~5px BELOW the
// group origin. The settled <Img> below is centred properly, so the hard-swap snapped
// the logo up by that amount — this is the "logo jumps up when the first subtitle
// line appears" the brief describes. Compensate the animated group by the same amount
// so both paths put the logo on the identical line.
const LOGO_ASPECT = 2048 / 1932;
const LOCKUP_LOGO_CENTER_ERR = (LOGO_SIZE * LOGO_ASPECT - LOGO_SIZE) / 2; // ≈5.10px low

const LOGO_SETTLE_DY = -78; // groupY endpoint of the shrink (kept in sync below)
export const V_LOGO_SETTLE_Y = V_CENTER_Y + LOGO_SETTLE_DY; // logo center y = 597

// The EXACT top edge of the S1 title box. S2/S3 anchors must place their title on this
// same line or the title visibly shifts at the S1→S2 cut (it was dropping 6px because
// S2 flex-centered the whole logo+title column instead of hanging it off the logo).
export const V_ANCHOR_TITLE_TOP = V_LOGO_SETTLE_Y + V_ANCHOR_LOGO_W / 2 + V_ANCHOR_GAP;

const heroStyleV: React.CSSProperties = { ...brandType.hero, color: WHITE, textAlign: "center", padding: "0 80px" };

export type SubLine = { text: React.ReactNode; start: number; end: number };

// The OPEN: logo reveals name+slogan, shrinks + rises to the settled titled anchor,
// then subtitle lines flash one at a time. Timing identical to landscape (225f scene).
export const OpenTitledV: React.FC<{ title: string; subLines: SubLine[] }> = ({ title, subLines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const SHRINK_START = 72;
  // Swap only once the shrink spring has FULLY settled (was 100 — too early, popped).
  const ANCHOR_SWAP = 124;

  const revealS = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const reveal = interpolate(revealS, [0, 1], [0, 1]);
  const lockupZoom = 1.2; // slightly smaller revealed size so the name fits 1080 wide

  // The shrink spring is only ~0.998 settled at ANCHOR_SWAP, so the animated logo was
  // still ~4.5px BELOW (and a hair wider than) the settled anchor at the swap frame —
  // that residual is exactly the "logo jumps up when the first subtitle appears" pop.
  // Normalising by the spring's own value at the swap frame forces shrinkN === 1 at the
  // swap, so the animated and settled logos are pixel-identical there.
  const shrinkRaw = spring({ frame: frame - SHRINK_START, fps, config: { damping: 200 } });
  const shrinkAtSwap = spring({ frame: ANCHOR_SWAP - SHRINK_START, fps, config: { damping: 200 } });
  const shrinkS = Math.min(1, shrinkRaw / shrinkAtSwap);
  const groupScale = interpolate(shrinkS, [0, 1], [1.2, V_ANCHOR_LOGO_W / LOGO_SIZE]);
  // Rise so the collapsed logo's center lands EXACTLY at V_LOGO_SETTLE_Y — the same
  // point the settled anchor draws its logo (below), so the hard-swap has no jump.
  // The -LOCKUP_LOGO_CENTER_ERR*groupScale term cancels the square-asset assumption in
  // ContinuousLockup (see above); it is scaled because the error rides inside the
  // scaled group. Ramped in with shrinkS so the correction is fully applied exactly at
  // the settle (and nothing moves before the shrink starts).
  const groupY =
    interpolate(shrinkS, [0, 1], [0, LOGO_SETTLE_DY]) -
    shrinkS * LOCKUP_LOGO_CENTER_ERR * groupScale;
  const textFadeOut = interpolate(frame, [SHRINK_START, SHRINK_START + 18], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const useSettled = frame >= ANCHOR_SWAP;
  // Title appears AS THE LOGO SETTLES (TITLE_APPEAR), before the subtitle lines.
  const TITLE_APPEAR = 95;
  const titleFadeIn = interpolate(frame, [TITLE_APPEAR, TITLE_APPEAR + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <SlideBG />

      {!useSettled && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ transform: frame < SHRINK_START ? `scale(${lockupZoom})` : `translateY(${groupY}px) scale(${groupScale})` }}>
            <ContinuousLockup reveal={reveal} textOpacity={textFadeOut} />
          </div>
        </AbsoluteFill>
      )}

      {/* SETTLED logo — hard-swapped at the settled spot (no shift). */}
      {useSettled && (
        <AbsoluteFill>
          <div style={{ position: "absolute", top: V_LOGO_SETTLE_Y, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", transform: "translateY(-50%)" }}>
            <Img src={logo} style={{ width: V_ANCHOR_LOGO_W, display: "block" }} />
          </div>
        </AbsoluteFill>
      )}

      {/* TITLE — rendered ALWAYS, fades in as the logo settles (before the subtitles). */}
      {frame >= TITLE_APPEAR && (
        <AbsoluteFill>
          <div style={{ position: "absolute", top: V_ANCHOR_TITLE_TOP, left: 0, right: 0, textAlign: "center" }}>
            <div style={{ ...heroStyleV, fontSize: V_ANCHOR_TITLE_SIZE, padding: 0, opacity: titleFadeIn }}>{title}</div>
          </div>
        </AbsoluteFill>
      )}

      {/* Subtitle lines flash one at a time, below the anchor. */}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
        {subLines.map((l, i) => {
          const op = interpolate(frame, [l.start, l.start + 6, l.end - 6, l.end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const riseS = spring({ frame: frame - l.start, fps, config: { damping: 200 } });
          const rise = interpolate(riseS, [0, 1], [22, 0]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: `calc(50% + 150px)`,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily,
                fontWeight: 700,
                fontSize: 54,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
                color: WHITE,
                opacity: op,
                transform: `translateY(${rise}px)`,
                padding: "0 90px",
              }}
            >
              {l.text}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// The END CARD (stacked, vertical) — same as the AI Match vertical end card.
export const EndCardV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const logoScale = interpolate(s, [0, 1], [0.8, 1]);
  const tagTrack = interpolate(frame, [30, 55], [6, 2.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wipeS = spring({ frame, fps, config: { damping: 40, mass: 0.9, stiffness: 60 } });
  const wipeUp = interpolate(wipeS, [0, 1], [100, 0]);
  const riseS = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const lockupRise = interpolate(riseS, [0, 1], [70, 0]);
  const lockupOpacity = interpolate(frame, [8, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const availS = spring({ frame: frame - 60, fps, config: { damping: 200 } });
  const availY = interpolate(availS, [0, 1], [24, 0]);
  const availOpacity = interpolate(frame, [60, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <AbsoluteFill style={{ transform: `translateY(${wipeUp}%)` }}>
        <SlideBG />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", opacity: lockupOpacity, transform: `translateY(${lockupRise - 80}px)` }}>
        <div style={{ transform: `scale(${logoScale})` }}>
          <Img src={logo} style={{ width: 330 }} />
        </div>
        <div style={{ fontFamily, fontWeight: 800, letterSpacing: "-0.02em", fontSize: 104, color: "#ffffff", marginTop: 44, textAlign: "center" }}>
          <WordReveal text="Direct Recruit" startFrame={10} />
        </div>
        <div style={{ fontFamily, fontWeight: 700, textTransform: "uppercase", fontSize: 34, color: colors.cerulean, letterSpacing: `${tagTrack}px`, opacity: tagOpacity, marginTop: 20, textAlign: "center" }}>
          Get Recruited · The Right Way
        </div>
        <div style={{ marginTop: 30 }}>
          <OrangeSweep startFrame={55} width={560} />
        </div>
      </AbsoluteFill>

      {/* Availability block — CENTERED between the orange line's bottom and the screen
          bottom. Line bottom ≈ 930 (measured), frame = 1350 → midpoint 1140. Anchored
          by its own center so it sits exactly on that midpoint. */}
      <div style={{ position: "absolute", top: (930 + 1350) / 2, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 32, opacity: availOpacity, transform: `translateY(calc(-50% + ${availY}px))` }}>
        <Img src={staticFile("app-store-badge.svg")} style={{ height: 108 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily, fontWeight: 700, fontSize: 44, color: WHITE }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={colors.accentOrange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          directrecruit.net
        </div>
      </div>
    </AbsoluteFill>
  );
};
