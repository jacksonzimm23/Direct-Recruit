import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { logo } from "../../AiRaDemo";
import { V_LOGO_SETTLE_Y, V_ANCHOR_TITLE_TOP } from "./bookends";

/**
 * Shared AI RA UI kit — VERTICAL (1080×1920).
 * Faithful reflow of the landscape RA components in AiRaDemo.tsx: the titled anchor,
 * chatbox, prompt bubble, fit badge, result rows, cursor, thinking dots. All widths
 * fit within 1080 and fonts are bumped for the tall frame. Geometry constants are
 * exported so the three vertical RA scenes stay pixel-aligned across cuts.
 */

const WHITE = colors.white;
export const V_FRAME_W = 1080;
export const V_FRAME_H = 1350; // 4:5 feed size
export const V_CENTER_X = 540;
export const V_CENTER_Y = 675; // 1350 / 2

// ── Titled anchor (logo + "AI Recruiting Assistant") ──────────────────────────
// Landscape title is 96px (≈700px wide) — too wide for 1080. Use 58px (≈430px).
export const RA_ANCHOR_LOGO_W = 175; // bigger logo relative to the title (matches bookends V_ANCHOR_LOGO_W)
const RA_ANCHOR_TITLE_SIZE = 76; // bigger S2/S3 title (matches bookends V_ANCHOR_TITLE_SIZE)
const RA_ANCHOR_GAP = 26;

// The anchor is built the SAME WAY S1 builds it (bookends OpenTitledV): the logo is
// centered on V_LOGO_SETTLE_Y and the title hangs off that spot at V_ANCHOR_TITLE_TOP,
// both absolutely positioned. It used to be a flex COLUMN that got vertically centered
// and then nudged by a lift + S2_ANCHOR_BASE_Y, which landed the title ~6px lower than
// S1 → the title visibly dropped at the S1→S2 cut. Sharing the two constants makes the
// cut pixel-identical by construction instead of by hand-tuned offsets.
// Rendered inside a zero-size box centred in the frame so the callers' existing
// translateY()/scale() transforms (the S2→S3 outro morph) still apply about frame
// centre exactly as before.
const RA_ANCHOR_LOGO_DY = V_LOGO_SETTLE_Y - V_CENTER_Y; // -78
const RA_ANCHOR_TITLE_DY = V_ANCHOR_TITLE_TOP - V_CENTER_Y; // +35.5

export const RaAnchorV: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ position: "relative", width: 0, height: 0, ...style }}>
    <div style={{ position: "absolute", top: RA_ANCHOR_LOGO_DY, left: -V_CENTER_X, width: V_FRAME_W, display: "flex", justifyContent: "center", transform: "translateY(-50%)" }}>
      <Img src={logo} style={{ width: RA_ANCHOR_LOGO_W, display: "block" }} />
    </div>
    <div style={{ position: "absolute", top: RA_ANCHOR_TITLE_DY, left: -V_CENTER_X, width: V_FRAME_W, textAlign: "center" }}>
      <div style={{ ...brandType.hero, color: WHITE, fontSize: RA_ANCHOR_TITLE_SIZE, padding: 0 }}>AI Recruiting Assistant</div>
    </div>
  </div>
);

// Output/keep-ask anchor: shrunk + lifted toward the top of the tall frame.
export const RAO_ANCHOR_SCALE = 0.72;
export const RAO_ANCHOR_CENTER_Y = 300; // title center y near the top of a 1920 frame

// ── The prompt text (identical to landscape) ──────────────────────────────────
export const RA_PROMPT = "Find me HS and transfer QBs who are 6ft+, 190lbs+, 3.0+ GPA, and have 1000+ passing yards last season";

// ── Conversation column geometry ──────────────────────────────────────────────
export const V_COL_W = 1000; // narrower than landscape's 1560, fits 1080
export const V_ROWS_W = 1000; // rows container (was 1140)
export const RA_CONV_TOP = RAO_ANCHOR_CENTER_Y + 150; // prompt bubble marginTop

// ── Chatbox ───────────────────────────────────────────────────────────────────
// 1000 wide (40px frame margins) so the box fills the frame and shows much more
// of the typed prompt before it scrolls. The landing zoom is kept to ~1.05x so
// the box (→~1050px) still fits within 1080 without edge clipping.
export const RA_BOX_W = 1000;
export const RA_BOX_CX = V_CENTER_X; // 540
export const RA_CONTENT_TOP = 220; // chatbox center px below frame-center — below the title with a clear gap; zoom grows it in place (no upward travel)
export const RA_BOX_CY = V_CENTER_Y + RA_CONTENT_TOP;
export const RA_BOX_LEFT = RA_BOX_CX - RA_BOX_W / 2; // 40
export const RA_DESCRIBE_X = RA_BOX_LEFT + 34 + 90; // over "Describe"
export const RA_SEND_CX = RA_BOX_CX + RA_BOX_W / 2 - 22 - 31; // right edge - pad - half button
export const RA_CHAR_W = 13.9; // px/char at 24px Inter-500 (vertical box uses 24px text)
// Visible text width = box − padLeft(34) − gap(12) − button(66) − padRight(20). This
// must match the ACTUAL flex text region so the caret scrolls right up to the send
// button (no gap between the end of the text and the button). We subtract a small
// CARET_PAD so the newest char sits a hair off the button, not touching it.
const CARET_PAD = 14;
export const RA_TEXT_VIEW_W = RA_BOX_W - 34 - 12 - 66 - 20 - CARET_PAD; // ≈ 854

const RaSendIcon: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// Chatbox with typed text (clips + scrolls left as it grows).
export const RaChatBoxTypedV: React.FC<{ typed: string; showPlaceholder: boolean; textScroll: number; sendPulse?: number }> = ({ typed, showPlaceholder, textScroll, sendPulse = 0 }) => (
  <div
    style={{
      width: RA_BOX_W,
      background: "rgba(254,252,251,0.04)",
      border: "1.5px solid rgba(255,107,53,0.28)",
      borderRadius: 24,
      padding: "24px 20px 24px 34px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
      boxSizing: "border-box",
    }}
  >
    {/* Text region. LEFT-anchored: text starts at the left (where the placeholder was)
        and grows rightward as it's typed — normal typing direction. Once the line is
        long enough to reach the send button it slides LEFT (marginLeft: -textScroll)
        so the growing end (caret) stays in view. */}
    <div style={{ flex: 1, overflow: "hidden", minWidth: 0, display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          fontFamily,
          fontWeight: 500,
          fontSize: 24,
          letterSpacing: "-0.01em",
          color: showPlaceholder ? "rgba(254,252,251,0.35)" : WHITE,
          whiteSpace: "nowrap",
          marginLeft: showPlaceholder ? 0 : `-${textScroll}px`,
        }}
      >
        {showPlaceholder ? "Describe the player you're looking for..." : typed}
      </div>
    </div>
    <div
      style={{
        width: 66,
        height: 66,
        borderRadius: 16,
        flexShrink: 0,
        transform: `scale(${1 - Math.sin(sendPulse * Math.PI) * 0.12})`,
        background: sendPulse > 0 ? "#ff7d4d" : colors.accentOrange,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 8px 24px ${colors.accentOrange}${sendPulse > 0 ? "88" : "55"}`,
      }}
    >
      <RaSendIcon />
    </div>
  </div>
);

// ── Prompt bubble (right-aligned orange user bubble) ──────────────────────────
export const RaPromptBubbleV: React.FC<{ opacity?: number; offsetY?: number }> = ({ opacity = 1, offsetY = 0 }) => (
  <AbsoluteFill style={{ alignItems: "center" }}>
    <div style={{ width: V_COL_W, marginTop: RA_CONV_TOP, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", opacity, transform: `translateY(${offsetY}px)` }}>
        <div style={{ maxWidth: 900, background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 28, lineHeight: 1.4, padding: "18px 26px", borderRadius: 20, borderBottomRightRadius: 6 }}>
          {RA_PROMPT}
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ── Cursor ────────────────────────────────────────────────────────────────────
export const CursorArrowV: React.FC<{ x: number; y: number; clicking?: number }> = ({ x, y, clicking = 0 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-3px,-3px)", pointerEvents: "none", zIndex: 50 }}>
    {clicking > 0 && (
      <div style={{ position: "absolute", left: 2, top: 2, width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: "50%", border: `2px solid ${colors.accentOrange}`, transform: `scale(${0.4 + clicking * 0.9})`, opacity: (1 - clicking) * 0.9 }} />
    )}
    <svg width="34" height="34" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }}>
      <path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18.5 13.5 Z" fill="#fff" stroke="#0a1128" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  </div>
);

// ── Thinking dots ─────────────────────────────────────────────────────────────
export const RaThinkingDotsV: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", gap: 9, padding: "20px 26px", background: "rgba(254,252,251,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 22, borderBottomLeftRadius: 8 }}>
      {[0, 1, 2].map((i) => {
        const t = ((frame - i * 6) % 42) / 42;
        const bounce = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
        return <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(255,107,53,0.6)", transform: `translateY(${-9 * bounce}px)`, opacity: 0.4 + 0.6 * bounce }} />;
      })}
    </div>
  );
};

// ── Fit badge + player row (result list) ──────────────────────────────────────
export const fitTierColor = (score: number): string => {
  if (score >= 90) return "#1f9d4d";
  if (score >= 75) return "#86efac";
  if (score >= 60) return "#eab308";
  if (score >= 45) return "#f97316";
  if (score >= 30) return "#ef4444";
  return "#7f1d1d";
};

const RaFitBadgeV: React.FC<{ score: number; fill: number }> = ({ score, fill }) => {
  const color = fitTierColor(score);
  const pct = Math.max(4, Math.min(100, score)) * fill;
  return (
    <div style={{ flexShrink: 0, width: 150, marginLeft: "auto", display: "grid", gridTemplateColumns: "1fr auto", gridTemplateAreas: `"label num" "track track"`, alignItems: "baseline", columnGap: 8, rowGap: 6 }}>
      <span style={{ gridArea: "label", fontFamily, fontSize: 17, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: WHITE }}>AI Match</span>
      <span style={{ gridArea: "num", fontFamily, fontSize: 34, fontWeight: 800, justifySelf: "end", color }}>{Math.round(score * fill)}</span>
      <div style={{ gridArea: "track", position: "relative", height: 9, borderRadius: 5, background: "rgba(254,252,251,0.08)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 5, boxShadow: `0 0 10px -1px ${color}` }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: "50%", width: 13, height: 13, marginLeft: -6, marginTop: -6, borderRadius: "50%", background: "#fff", boxShadow: `0 0 8px 1px ${color}` }} />
      </div>
    </div>
  );
};

const RaPersonSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" width="38" height="38">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth={2} />
  </svg>
);

export type RaPlayer = {
  transfer: boolean;
  name: string;
  position: string;
  height: string;
  weight: string;
  gradYear?: string;
  eligibility?: number;
  school?: string;
  state?: string;
  offers?: number;
  prevSchool?: string;
  division?: string;
  score: number;
};

// Transfer "Previously" schools are FICTIONAL (no real college names or logos in
// the feed cut) — Northfield State (D2), Riverton State (D1 FCS).
export const RA_PLAYERS: RaPlayer[] = [
  { transfer: false, name: "Marcus Ellison", position: "QB", height: "6'3\"", weight: "212 lbs", gradYear: "2026", school: "Westlake High", state: "TX", offers: 6, score: 92 },
  { transfer: true, name: "Jordan Vance", position: "QB", height: "6'2\"", weight: "205 lbs", eligibility: 2, prevSchool: "Northfield State University", division: "D2", score: 84 },
  { transfer: false, name: "Tyler Brooks", position: "QB", height: "6'1\"", weight: "198 lbs", gradYear: "2027", school: "Mater Dei", state: "CA", offers: 4, score: 71 },
  { transfer: true, name: "Cameron Diaz", position: "QB", height: "6'4\"", weight: "220 lbs", eligibility: 3, prevSchool: "Riverton State University", division: "D1 FCS", score: 63 },
  { transfer: false, name: "Devin Carter", position: "QB", height: "6'2\"", weight: "195 lbs", gradYear: "2026", school: "Bishop Gorman", state: "NV", offers: 3, score: 58 },
];

// One result row — reflowed: badge on its own line under the info so the row fits
// the narrower 1000px column without truncation.
export const RaPlayerRowV: React.FC<{ p: RaPlayer; fitFill: number }> = ({ p, fitFill }) => {
  const ringColor = p.transfer ? "#dc2626" : "#1282a2";
  const line2 = [p.position, p.height, p.weight, p.transfer ? `YOE: ${p.eligibility} year${(p.eligibility ?? 0) > 1 ? "s" : ""}` : p.gradYear]
    .filter(Boolean)
    .join(" • ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "18px 26px", borderBottom: "1px solid rgba(254,252,251,0.06)", minHeight: 96 }}>
      <div style={{ width: 72, height: 72, minWidth: 72, borderRadius: "50%", border: `3px solid ${ringColor}`, background: p.transfer ? "rgba(220,38,38,0.15)" : "rgba(18,130,162,0.15)", color: ringColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <RaPersonSvg />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 30, color: WHITE, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
          {p.name}
        </div>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 23, color: ringColor, whiteSpace: "nowrap" }}>{line2}</div>
        <div style={{ fontFamily, fontWeight: 600, fontSize: 22, color: "rgba(254,252,251,0.6)", whiteSpace: "nowrap" }}>
          {p.transfer ? (
            <>
              <span style={{ color: "rgba(254,252,251,0.4)" }}>Previously:</span> {p.prevSchool} ({p.division})
            </>
          ) : (
            <>
              {p.school}, {p.state} • <span style={{ color: colors.accentOrange, fontWeight: 700 }}>Offers: {p.offers}</span>
            </>
          )}
        </div>
      </div>
      <RaFitBadgeV score={p.score} fill={fitFill} />
    </div>
  );
};
