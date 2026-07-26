import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { logo } from "../../AiRaDemo";
import {
  RaChatBoxTypedV,
  CursorArrowV,
  RaThinkingDotsV,
  RaPromptBubbleV,
  RA_BOX_CX,
  RA_BOX_CY,
  RA_CONTENT_TOP,
  RA_DESCRIBE_X,
  RA_SEND_CX,
  RA_CHAR_W,
  RA_TEXT_VIEW_W,
  V_CENTER_X,
  V_CENTER_Y,
  V_COL_W,
  RA_CONV_TOP,
  RAO_ANCHOR_SCALE,
  RAO_ANCHOR_CENTER_Y,
} from "./ra-kit";
import {
  V_ANCHOR_LOGO_W,
  V_ANCHOR_TITLE_SIZE,
  V_LOGO_SETTLE_Y,
  V_ANCHOR_TITLE_TOP,
} from "./bookends";

/**
 * AI Portal Intelligence — VERTICAL scenes (1080×1920).
 * - PiLandingV: reuses the RA chatbox/cursor interaction, but with the PI title and
 *   the PI prompt. Ends handing the prompt bubble up to the PI output.
 * - PiCardV (SceneRaOutput equivalent): thinking → the PI PLAYER CARD for Jordan
 *   Vance with the 3 portal-signal sections.
 * - PiSignalTourV: a continuous vertical crane over the card, lighting each signal
 *   section while a BOTTOM explainer panel writes on (right-side panel has no room
 *   in 9:16, so it moves to the bottom).
 */

const WHITE = colors.white;

// ── PI titled anchor (logo + "AI Portal Intelligence") ────────────────────────
// Sizes + positions are taken STRAIGHT from the S1 bookend so the S1→S2 cut is
// pixel-identical. These used to be a smaller, independently-tuned set (130px logo /
// 58px title, flex-centred column), which made the logo jump ~30px down and visibly
// shrink at the cut while the title changed size — by far the worst of the three.
const PI_ANCHOR_LOGO_W = V_ANCHOR_LOGO_W; // 175 — matches S1
const PI_ANCHOR_TITLE_SIZE = V_ANCHOR_TITLE_SIZE; // 76 — matches S1
const heroStyleV: React.CSSProperties = { ...brandType.hero, color: WHITE, textAlign: "center", padding: "0 60px" };

const PI_ANCHOR_LOGO_DY = V_LOGO_SETTLE_Y - V_CENTER_Y;
const PI_ANCHOR_TITLE_DY = V_ANCHOR_TITLE_TOP - V_CENTER_Y;

// Zero-size box centred in the frame (same construction as RaAnchorV) so callers'
// translateY()/scale() outro transforms keep working about frame centre.
const PiAnchorV: React.FC = () => (
  <div style={{ position: "relative", width: 0, height: 0 }}>
    <div style={{ position: "absolute", top: PI_ANCHOR_LOGO_DY, left: -V_CENTER_X, width: 1080, display: "flex", justifyContent: "center", transform: "translateY(-50%)" }}>
      <Img src={logo} style={{ width: PI_ANCHOR_LOGO_W, display: "block" }} />
    </div>
    <div style={{ position: "absolute", top: PI_ANCHOR_TITLE_DY, left: -V_CENTER_X, width: 1080, textAlign: "center" }}>
      <div style={{ ...heroStyleV, fontSize: PI_ANCHOR_TITLE_SIZE, padding: 0 }}>AI Portal Intelligence</div>
    </div>
  </div>
);

const PI_PROMPT = "Find me QBs who may hit the portal that are 6ft 2in+, 195lb+, and threw over 15TD last season";

// ══════════════════════════════════════════════════════════════════════
// PI LANDING (VERTICAL)
// ══════════════════════════════════════════════════════════════════════
const S5_CURSOR_IN = 30;
const S5_AT_DESCRIBE = 50;
const S5_CLICK1 = 52;
const S5_ZOOM_START = 60;
const S5_TYPE_START = 84;
const S5_TYPE_CPS = 1.4;
const S5_TYPE_END = S5_TYPE_START + Math.ceil(PI_PROMPT.length / S5_TYPE_CPS);
const S5_TO_SEND_START = S5_TYPE_END + 10;
const S5_CLICK2 = S5_TO_SEND_START + 26;
const S5_BUBBLE_START = S5_CLICK2 + 8;
const S5_ANCHOR_SWAP = S5_CLICK2 + 30;

export const PiLandingV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const boxS = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const boxY = interpolate(boxS, [0, 1], [40, 0]);
  const boxOpacity = interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const typedCount = Math.max(0, Math.min(PI_PROMPT.length, Math.floor((frame - S5_TYPE_START) * S5_TYPE_CPS)));
  const typed = PI_PROMPT.slice(0, typedCount);
  const showPlaceholder = frame < S5_CLICK1;
  const textScroll = Math.max(0, typedCount * RA_CHAR_W - RA_TEXT_VIEW_W);

  // No chatbox zoom (removed per direction) — the box stays a fixed size + position.
  const zoomIn = 1;
  const zoomInShiftY = 0;
  const outroS = spring({ frame: frame - (S5_CLICK2 + 6), fps, config: { damping: 200 } });
  const zoom = interpolate(outroS, [0, 1], [zoomIn, 1]);
  const zoomShiftY = interpolate(outroS, [0, 1], [zoomInShiftY, 0]);
  const anchorScale = interpolate(outroS, [0, 1], [1, RAO_ANCHOR_SCALE]);
  // Start the S2 anchor at S1's settled logo spot so the logo doesn't jump at the cut.
  // PiAnchorV positions itself absolutely at S1's settled spot, so no extra nudge.
  const S2_ANCHOR_BASE_Y = 0;
  const anchorY = interpolate(outroS, [0, 1], [S2_ANCHOR_BASE_Y, RAO_ANCHOR_CENTER_Y - V_CENTER_Y]);
  const boxOutOpacity = interpolate(frame, [S5_CLICK2 + 12, S5_CLICK2 + 26], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorOutOpacity = interpolate(frame, [S5_CLICK2 + 4, S5_CLICK2 + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const TIP_OFFSET = 40;
  const boxClickX = RA_DESCRIBE_X;
  const boxClickY = RA_BOX_CY + TIP_OFFSET;
  const restY = RA_BOX_CY - 55;
  let cursorX: number;
  let cursorY: number;
  if (frame < S5_AT_DESCRIBE) {
    const t = interpolate(frame, [S5_CURSOR_IN, S5_AT_DESCRIBE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = t * t * (3 - 2 * t);
    cursorX = interpolate(ease, [0, 1], [RA_BOX_CX + 80, boxClickX]);
    cursorY = interpolate(ease, [0, 1], [1300, boxClickY]);
  } else if (frame < S5_ZOOM_START) {
    cursorX = boxClickX;
    cursorY = boxClickY;
  } else if (frame < S5_TO_SEND_START) {
    const t = interpolate(frame, [S5_ZOOM_START, S5_ZOOM_START + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = t * t * (3 - 2 * t);
    cursorX = boxClickX;
    cursorY = interpolate(ease, [0, 1], [boxClickY, restY]);
  } else {
    const t = interpolate(frame, [S5_TO_SEND_START, S5_CLICK2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = t * t * (3 - 2 * t);
    cursorX = interpolate(ease, [0, 1], [boxClickX, RA_SEND_CX]);
    cursorY = interpolate(ease, [0, 1], [restY, RA_BOX_CY + TIP_OFFSET]);
  }
  const cursorVisible = frame >= S5_CURSOR_IN;
  const click1 = frame >= S5_CLICK1 && frame < S5_CLICK1 + 12 ? interpolate(frame, [S5_CLICK1, S5_CLICK1 + 12], [0, 1]) : 0;
  const click2 = frame >= S5_CLICK2 && frame < S5_CLICK2 + 12 ? interpolate(frame, [S5_CLICK2, S5_CLICK2 + 12], [0, 1]) : 0;
  const sendPulse = frame >= S5_CLICK2 && frame < S5_CLICK2 + 10 ? interpolate(frame, [S5_CLICK2, S5_CLICK2 + 10], [0, 1]) : 0;

  const bubbleFlyS = spring({ frame: frame - S5_BUBBLE_START, fps, config: { damping: 200 } });
  const promptBubbleY = interpolate(bubbleFlyS, [0, 1], [200, 0], { extrapolateRight: "clamp" });
  const promptBubbleOp = interpolate(frame, [S5_BUBBLE_START, S5_BUBBLE_START + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const useSettledAnchor = frame >= S5_ANCHOR_SWAP;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />

      {/* ANCHOR (logo + title) — OUTSIDE the chatbox zoom so it stays PUT while the
          chatbox appears/zooms. Its outro morph still lifts it to the S3 spot. */}
      {!useSettledAnchor && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ transform: `translateY(${anchorY}px) scale(${anchorScale})` }}>
            <PiAnchorV />
          </div>
        </AbsoluteFill>
      )}
      {useSettledAnchor && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ transform: `translateY(${RAO_ANCHOR_CENTER_Y - V_CENTER_Y}px) scale(${RAO_ANCHOR_SCALE})` }}>
            <PiAnchorV />
          </div>
        </AbsoluteFill>
      )}

      {/* Chatbox + cursor — these DO zoom (dive into the box), anchor stays still. */}
      <AbsoluteFill style={{ transform: `translateY(${zoomShiftY}px) scale(${zoom})`, transformOrigin: `${RA_BOX_CX}px ${RA_BOX_CY}px` }}>
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
          <div style={{ position: "absolute", top: `calc(50% + ${RA_CONTENT_TOP}px)`, transform: `translateY(${boxY}px)`, opacity: boxOpacity * boxOutOpacity }}>
            <RaChatBoxTypedV typed={typed} showPlaceholder={showPlaceholder} textScroll={textScroll} sendPulse={sendPulse} />
          </div>
        </AbsoluteFill>
        {cursorVisible && (
          <div style={{ opacity: cursorOutOpacity }}>
            <CursorArrowV x={cursorX} y={cursorY} clicking={Math.max(click1, click2)} />
          </div>
        )}
      </AbsoluteFill>

      {frame >= S5_BUBBLE_START && <PiPromptBubbleV opacity={promptBubbleOp} offsetY={promptBubbleY} />}
    </AbsoluteFill>
  );
};

// PI prompt bubble (same shape as RA's, PI text).
const PiPromptBubbleV: React.FC<{ opacity?: number; offsetY?: number }> = ({ opacity = 1, offsetY = 0 }) => (
  <AbsoluteFill style={{ alignItems: "center" }}>
    <div style={{ width: V_COL_W, marginTop: RA_CONV_TOP, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", opacity, transform: `translateY(${offsetY}px)` }}>
        <div style={{ maxWidth: 900, background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 28, lineHeight: 1.4, padding: "18px 26px", borderRadius: 20, borderBottomRightRadius: 6 }}>
          {PI_PROMPT}
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ══════════════════════════════════════════════════════════════════════
// THE PI PLAYER CARD (shared by PiCardV and PiSignalTourV)
// ══════════════════════════════════════════════════════════════════════
const PI_CARD_W = 940; // narrowed from landscape 1140; leaves margins even when craned 1.08x

const PI_SIGNAL = {
  portal_keywords: { label: "Portal Keywords", color: "#ef4444", rgb: "239, 68, 68" },
  bio_and_film: { label: "Bio + New Film", color: "#f59e0b", rgb: "245, 158, 11" },
  browsing_coaches: { label: "Browsing Coaches", color: "#8b5cf6", rgb: "139, 92, 246" },
};

const PI_PLAYER = {
  name: "Jordan Vance",
  position: "QB",
  height: "6'2\"",
  weight: "205 lbs",
  gpa: "3.4",
  // Fictional program (no real college names or logos in the demo). Kept as
  // Northfield State so Jordan Vance matches the AI RA / AI Match feed cuts,
  // where he shows as "Previously: Northfield State (D2)".
  school: "Northfield State University",
  division: "D2",
  bio: "Weighing my options. Open to the transfer portal for the right fit.",
  matchedKeywords: ["weighing my options", "transfer", "portal"],
  bioUpdated: "Mar 14, 2026",
  highlights: [
    { title: "2025 Season Highlights", type: "Season", uploaded: "Mar 14, 2026" },
    { title: "vs. Brookfield State - 4 TD", type: "Game", uploaded: "Mar 11, 2026" },
  ],
  programsBrowsed: 4,
  totalViews: 11,
  recentActivity: "Mar 15, 2026, Mar 12, 2026, Mar 9, 2026",
};

const PersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" width="40" height="40">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth={2} />
  </svg>
);

const PiSection: React.FC<{ kind: keyof typeof PI_SIGNAL; icon: string; title: string; children: React.ReactNode }> = ({ kind, icon, title, children }) => {
  const sig = PI_SIGNAL[kind];
  return (
    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 14, padding: "18px 22px", borderLeft: `6px solid rgba(${sig.rgb},0.6)` }}>
      <div style={{ fontSize: 23, fontWeight: 700, color: "rgba(254,252,251,0.85)", marginBottom: 12, display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ fontSize: 24 }}>{icon}</span> {title}
      </div>
      {children}
    </div>
  );
};

// The PI player card. `reveal` = [s0,s1,s2] opacities for the 3 signal sections.
export const PiPlayerCardV: React.FC<{ reveal: [number, number, number] }> = ({ reveal }) => {
  const p = PI_PLAYER;
  // highlight matched keywords in the bio
  let bioNodes: React.ReactNode = p.bio;
  {
    let text = p.bio;
    const parts: React.ReactNode[] = [];
    let key = 0;
    p.matchedKeywords.forEach((kw) => {
      const idx = text.toLowerCase().indexOf(kw.toLowerCase());
      if (idx >= 0) {
        parts.push(text.slice(0, idx));
        parts.push(<mark key={key++} style={{ background: "rgba(239,68,68,0.25)", color: "#fca5a5", borderRadius: 4, padding: "0 3px" }}>{text.slice(idx, idx + kw.length)}</mark>);
        text = text.slice(idx + kw.length);
      }
    });
    parts.push(text);
    bioNodes = parts;
  }

  return (
    <div style={{ width: PI_CARD_W, boxSizing: "border-box", background: "rgba(254,252,251,0.04)", border: "1px solid rgba(18,130,162,0.2)", borderRadius: 22, padding: 28 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
        <div style={{ width: 78, height: 78, minWidth: 78, borderRadius: "50%", border: "5px solid #1282a2", background: "rgba(18,130,162,0.15)", color: "#1282a2", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PersonSvg />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: WHITE }}>{p.name}</span>
          <span style={{ fontSize: 21, fontWeight: 600, color: "#1282a2", background: "rgba(18,130,162,0.12)", padding: "2px 12px", borderRadius: 8 }}>{p.position}</span>
        </div>
      </div>

      {/* stat row */}
      <div style={{ display: "flex", gap: 24, marginBottom: 16, padding: "16px 0", borderTop: "1px solid rgba(254,252,251,0.06)", borderBottom: "1px solid rgba(254,252,251,0.06)" }}>
        {[["Height", p.height], ["Weight", p.weight], ["GPA", p.gpa]].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 19, textTransform: "uppercase", color: "rgba(254,252,251,0.4)" }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: WHITE, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* school line */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 24, color: "rgba(254,252,251,0.6)", marginBottom: 18 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        {p.school} ({p.division})
      </div>

      {/* signal badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 11, marginBottom: 16 }}>
        {(Object.keys(PI_SIGNAL) as (keyof typeof PI_SIGNAL)[]).map((k, i) => {
          const sig = PI_SIGNAL[k];
          return (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 21, fontWeight: 600, padding: "6px 15px", borderRadius: 22, color: sig.color, background: `rgba(${sig.rgb},0.12)`, border: `1px solid rgba(${sig.rgb},0.25)`, opacity: reveal[i] }}>
              ● {sig.label}
            </span>
          );
        })}
      </div>

      {/* evidence sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ opacity: reveal[0] }}>
          <PiSection kind="portal_keywords" icon="🔍" title="Portal Keywords Detected">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {p.matchedKeywords.map((kw) => (
                <span key={kw} style={{ fontSize: 20, padding: "3px 14px", borderRadius: 15, background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}>{kw}</span>
              ))}
            </div>
            <div style={{ fontSize: 21, fontWeight: 600, color: "rgba(254,252,251,0.55)", textTransform: "uppercase", marginBottom: 8 }}>Player's Bio:</div>
            <div style={{ fontSize: 23, color: "rgba(254,252,251,0.7)", lineHeight: 1.5, background: "rgba(0,0,0,0.15)", padding: "14px 18px", borderRadius: 11, border: "1px solid rgba(254,252,251,0.06)" }}>{bioNodes}</div>
            <div style={{ fontSize: 20, color: "rgba(254,252,251,0.45)", marginTop: 10 }}>Bio last updated: {p.bioUpdated}</div>
          </PiSection>
        </div>

        <div style={{ opacity: reveal[1] }}>
          <PiSection kind="bio_and_film" icon="🎬" title="Bio Updated + New Film Uploaded">
            <div style={{ fontSize: 21, fontWeight: 600, color: "rgba(254,252,251,0.55)", textTransform: "uppercase", marginBottom: 8 }}>Recent Highlights:</div>
            {p.highlights.map((h) => (
              <div key={h.title} style={{ padding: "9px 15px", marginTop: 7, background: "rgba(245,158,11,0.06)", borderRadius: 9, border: "1px solid rgba(245,158,11,0.12)" }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: "rgba(254,252,251,0.8)" }}>{h.title}</div>
                <div style={{ fontSize: 19, color: "rgba(254,252,251,0.4)" }}>{h.type} · Uploaded {h.uploaded}</div>
              </div>
            ))}
          </PiSection>
        </div>

        <div style={{ opacity: reveal[2] }}>
          <PiSection kind="browsing_coaches" icon="👁" title="Browsing Coaches From Other Programs">
            <div style={{ fontSize: 21, color: "rgba(254,252,251,0.45)", marginBottom: 6 }}>{p.programsBrowsed} different programs · {p.totalViews} total coach profile views</div>
            <div style={{ fontSize: 21, color: "rgba(254,252,251,0.45)" }}>Recent activity: {p.recentActivity}</div>
          </PiSection>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
// PI OUTPUT (VERTICAL) — thinking → PI card, sections stagger in
// ══════════════════════════════════════════════════════════════════════
const RAO_THINK_END = 78;
const RAO_ROWS_START = 82;
const RAO_ROW_STAGGER = 12;
const RAO_SECTIONS_START = RAO_ROWS_START + 14; // 96
export const PI_RAO_END = RAO_SECTIONS_START + 3 * RAO_ROW_STAGGER + 8; // 140

// S3's card top before scroll ≈ RA_CONV_TOP(450) + hidden prompt spacer(~72) +
// gap(22) ≈ 544. S4 pins the card at top:120. So scroll the card up by (120 − 544)
// to land it exactly at S4's start position → seamless S3→S4 cut.
const S3_CARD_TOP_BEFORE_SCROLL = RA_CONV_TOP + 72 + 22;
const S4_CARD_TOP = 120;
const S3_END_SCROLL = S4_CARD_TOP - S3_CARD_TOP_BEFORE_SCROLL; // ≈ -424

export const PiCardV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const thinking = frame >= 0 && frame < RAO_THINK_END;
  const thinkOpacity = interpolate(frame, [0, RAO_THINK_END - 4, RAO_THINK_END], [1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const cardS = spring({ frame: frame - RAO_ROWS_START, fps, config: { damping: 200 } });
  const cardY = interpolate(cardS, [0, 1], [26, 0]);
  const cardScale = interpolate(cardS, [0, 1], [0.96, 1]);
  const cardOpacity = interpolate(frame, [RAO_ROWS_START, RAO_ROWS_START + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const sectionReveal = [0, 1, 2].map((i) =>
    interpolate(frame, [RAO_SECTIONS_START + i * RAO_ROW_STAGGER, RAO_SECTIONS_START + i * RAO_ROW_STAGGER + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  ) as [number, number, number];

  // Scroll the whole conversation up as the card grows. By S3's END the scroll
  // lands the CARD at the exact spot S4 (PiSignalTourV) pins it (top:120), so the
  // S3→S4 cut is seamless, and the prompt + anchor have scrolled up and faded out
  // so S4 shows only the card (no prompt). See S3_CARD_TOP_AT_END below.
  const scrollUp = interpolate(frame, [RAO_SECTIONS_START, PI_RAO_END], [0, S3_END_SCROLL], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
  const anchorFade = interpolate(frame, [RAO_SECTIONS_START, RAO_SECTIONS_START + 24], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Prompt fades out as it scrolls up toward the top edge (so S4 has no prompt).
  const promptFade = interpolate(frame, [PI_RAO_END - 40, PI_RAO_END - 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `translateY(${scrollUp}px)`, opacity: anchorFade }}>
        <div style={{ transform: `translateY(${RAO_ANCHOR_CENTER_Y - V_CENTER_Y}px) scale(${RAO_ANCHOR_SCALE})` }}>
          <PiAnchorV />
        </div>
      </AbsoluteFill>
      <div style={{ transform: `translateY(${scrollUp}px)` }}>
        <PiPromptBubbleV opacity={promptFade} offsetY={0} />
      </div>
      <AbsoluteFill style={{ alignItems: "center", transform: `translateY(${scrollUp}px)` }}>
        <div style={{ width: V_COL_W, marginTop: RA_CONV_TOP, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", visibility: "hidden" }}>
            <div style={{ maxWidth: 900, fontFamily, fontWeight: 500, fontSize: 28, lineHeight: 1.4, padding: "18px 26px" }}>{PI_PROMPT}</div>
          </div>
          {thinking && (
            <div style={{ width: "100%", display: "flex", marginTop: 22, opacity: thinkOpacity }}>
              <RaThinkingDotsV />
            </div>
          )}
          {frame >= RAO_ROWS_START && (
            <div style={{ alignSelf: "center", marginTop: 22, transform: `translateY(${cardY}px) scale(${cardScale})`, opacity: cardOpacity }}>
              <PiPlayerCardV reveal={sectionReveal} />
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════
// PI SIGNAL TOUR (VERTICAL) — vertical crane over the card + BOTTOM explainer
// ══════════════════════════════════════════════════════════════════════
// The card already ~fills 1080 wide, so a big zoom would clip its sides. Keep the
// crane a gentle 1.08x (mostly a vertical pan) — the focus comes from dimming the
// off-target sections + the bottom explainer, not from zooming into a clipped card.
const TOUR_ZOOM = 1.04;
const TOUR_IN = 18;
const TOUR_HOLD = 110;
const TOUR_STOP = TOUR_IN + TOUR_HOLD; // 128
const TOUR_START = 10;
export const PI_TOUR_END = TOUR_START + 3 * TOUR_STOP; // 394

// The card is rendered at the same resting spot as PiCardV's scrolled-up end state.
// We crane by translating the card so each signal SECTION sits in the CLEAR band above
// the bottom explainer panel.
//
// `lift` = px to slide the card UP for that stop (0 = the S3 hand-off position, so the
// S3→S4 cut stays pixel-identical on signal 01). Signals 02 and 03 sit lower on the
// card and were rendering BEHIND the explainer panel — they are lifted so their whole
// section clears it. Values derived from the rendered card at rest:
//   S1 y 490→745, S2 y 760→1015, S3 y 1035→1165; panel content starts at y≈913.
// Lift each so the section's bottom lands at CLEAR_BOT (880).
const SIGNAL_STOPS = [
  { key: "portal_keywords", eyebrow: "SIGNAL 01 · Portal Keywords", color: "#ef4444", title: "Portal Keywords", body: "We scan every bio for portal language. When a player starts writing like they're leaving, they usually are.", lift: 0 },
  { key: "bio_and_film", eyebrow: "SIGNAL 02 · New Film", color: "#f59e0b", title: "New Film", body: "Fresh highlights uploaded out of season. Players don't rebuild their film unless someone new is meant to see it.", lift: -135 },
  { key: "browsing_coaches", eyebrow: "SIGNAL 03 · Browsing Coaches", color: "#8b5cf6", title: "Browsing Coaches", body: "They're viewing staffs at other programs. It happens long before anything is official.", lift: -285 },
];

const TourPanelV: React.FC<{ stop: (typeof SIGNAL_STOPS)[number]; local: number }> = ({ stop, local }) => {
  const { fps } = useVideoConfig();
  const enterS = spring({ frame: local - TOUR_IN + 4, fps, config: { damping: 200 } });
  const y = interpolate(enterS, [0, 1], [46, 0]);
  const fadeIn = interpolate(local, [TOUR_IN - 6, TOUR_IN + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(local, [TOUR_STOP - 12, TOUR_STOP - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = fadeIn * fadeOut;
  const ruleW = interpolate(enterS, [0, 1], [0, 150]);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, padding: "0 80px", opacity, transform: `translateY(${y}px)` }}>
      {/* scrim so the panel reads over the card */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: -90, height: 560, background: "linear-gradient(0deg, #0a1128 0%, rgba(10,17,40,0.94) 34%, rgba(10,17,40,0.72) 60%, rgba(10,17,40,0) 100%)", zIndex: -1 }} />
      <div style={{ ...brandType.eyebrow, color: stop.color, fontSize: 30, marginBottom: 16 }}>{stop.eyebrow}</div>
      <div style={{ height: 5, width: ruleW, background: stop.color, borderRadius: 2, marginBottom: 26 }} />
      <div style={{ fontFamily, fontWeight: 800, fontSize: 84, lineHeight: 1.04, letterSpacing: "-0.03em", color: WHITE, marginBottom: 26 }}>{stop.title}</div>
      <div style={{ fontFamily, fontWeight: 500, fontSize: 38, lineHeight: 1.5, color: WHITE }}>{stop.body}</div>
    </div>
  );
};

export const PiSignalTourV: React.FC = () => {
  const frame = useCurrentFrame();

  const idx = Math.max(0, Math.min(2, Math.floor((frame - TOUR_START) / TOUR_STOP)));
  const local = frame - TOUR_START - idx * TOUR_STOP;
  const stop = SIGNAL_STOPS[idx];

  // Vertical crane: the card slides UP between stops so the focused signal section
  // clears the bottom explainer panel. Signals 02 and 03 sit low on the card and were
  // being covered by the panel; each stop's `lift` puts its section fully in the clear
  // band. Stop 01 has lift 0, so the S3→S4 hand-off is still pixel-identical.
  // The move is eased over the stop's lead-in (TOUR_IN) — it settles as the new
  // description writes on, so the card is already in place by the time you read it.
  const prevLift = SIGNAL_STOPS[Math.max(0, idx - 1)].lift;
  const craneY = interpolate(local, [0, TOUR_IN + 10], [idx === 0 ? stop.lift : prevLift, stop.lift], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const zoom = interpolate(frame, [0, TOUR_START + TOUR_IN], [1, TOUR_ZOOM], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });

  // Section dimming. S4 must OPEN fully-lit (matching S3's crisp card at the cut) —
  // the non-focused sections only dim once the FIRST signal description has appeared,
  // so there's no abrupt crisp→dim pop at the S3→S4 boundary. `dimAmount` ramps the
  // dimming in over the panel's write-on window (starts at TOUR_IN, when the title/
  // body of Signal 01 land) on the first stop; on later stops dimming is already on.
  const isFirstStop = idx === 0;
  const dimAmount = isFirstStop
    ? interpolate(local, [TOUR_IN, TOUR_IN + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const DIM = 1 - 0.72 * dimAmount; // 1 (fully lit) → 0.28 (dimmed) as dimAmount ramps
  const focusOpacity = [0, 1, 2].map((i) => (i === idx ? 1 : DIM)) as [number, number, number];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      {/* The card is drawn with the EXACT SAME column structure S3 (PiCardV) ends on
          — same marginTop (RA_CONV_TOP), same hidden prompt spacer, same card wrapper
          — translated by the SAME S3_END_SCROLL. So S3's last frame and S4's first
          frame are pixel-identical (no jump). The gentle tour zoom applies on top. */}
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "center 34%" }}>
        <AbsoluteFill style={{ alignItems: "center", transform: `translateY(${S3_END_SCROLL + craneY}px)` }}>
          <div style={{ width: V_COL_W, marginTop: RA_CONV_TOP, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", visibility: "hidden" }}>
              <div style={{ maxWidth: 900, fontFamily, fontWeight: 500, fontSize: 28, lineHeight: 1.4, padding: "18px 26px" }}>{PI_PROMPT}</div>
            </div>
            <div style={{ alignSelf: "center", marginTop: 22 }}>
              <PiPlayerCardV reveal={focusOpacity} />
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* bottom explainer panel (outside the zoom transform, stays crisp) */}
      <TourPanelV stop={stop} local={local} />
    </AbsoluteFill>
  );
};
