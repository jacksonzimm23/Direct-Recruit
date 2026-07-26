import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily, type as brandType } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { WordReveal } from "../../components/primitives";
import {
  RaAnchorV,
  RaChatBoxTypedV,
  RaPromptBubbleV,
  CursorArrowV,
  RaThinkingDotsV,
  RaPlayerRowV,
  RA_PLAYERS,
  RA_PROMPT,
  RAO_ANCHOR_SCALE,
  RAO_ANCHOR_CENTER_Y,
  RA_CONV_TOP,
  V_COL_W,
  V_ROWS_W,
  V_CENTER_X,
  V_CENTER_Y,
  RA_BOX_CX,
  RA_BOX_CY,
  RA_CONTENT_TOP,
  RA_DESCRIBE_X,
  RA_SEND_CX,
  RA_CHAR_W,
  RA_TEXT_VIEW_W,
} from "./ra-kit";

const WHITE = colors.white;
const heroStyleV: React.CSSProperties = { ...brandType.hero, color: WHITE, fontSize: 84, textAlign: "center", padding: "0 80px" };

// ══════════════════════════════════════════════════════════════════════
// RA LANDING (VERTICAL) — cursor types the prompt, clicks send, prompt flies up
// ══════════════════════════════════════════════════════════════════════
const S5_CURSOR_IN = 30;
const S5_AT_DESCRIBE = 50;
const S5_CLICK1 = 52;
const S5_ZOOM_START = 60;
const S5_TYPE_START = 84;
const S5_TYPE_CPS = 1.4;
const S5_TYPE_END = S5_TYPE_START + Math.ceil(RA_PROMPT.length / S5_TYPE_CPS);
const S5_TO_SEND_START = S5_TYPE_END + 10;
const S5_CLICK2 = S5_TO_SEND_START + 26;
const S5_BUBBLE_START = S5_CLICK2 + 8;
const S5_ANCHOR_SWAP = S5_CLICK2 + 30;

export const RaLandingV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const boxS = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const boxY = interpolate(boxS, [0, 1], [40, 0]);
  const boxOpacity = interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const typedCount = Math.max(0, Math.min(RA_PROMPT.length, Math.floor((frame - S5_TYPE_START) * S5_TYPE_CPS)));
  const typed = RA_PROMPT.slice(0, typedCount);
  const showPlaceholder = frame < S5_CLICK1;
  const textScroll = Math.max(0, typedCount * RA_CHAR_W - RA_TEXT_VIEW_W);

  // Zoom into the chatbox. 1.25x (box 980→1225 still ~fits within 1080 with a little
  // clip); origin on the box. Less aggressive than landscape 1.4x because the box is
  // already near the frame width.
  // No chatbox zoom (removed per direction) — the box stays a fixed size + position.
  const zoomIn = 1;
  const zoomInShiftY = 0;
  const outroS = spring({ frame: frame - (S5_CLICK2 + 6), fps, config: { damping: 200 } });
  const zoom = interpolate(outroS, [0, 1], [zoomIn, 1]);
  const zoomShiftY = interpolate(outroS, [0, 1], [zoomInShiftY, 0]);
  const anchorScale = interpolate(outroS, [0, 1], [1, RAO_ANCHOR_SCALE]);
  // RaAnchorV now positions itself absolutely at S1's settled spot (it shares
  // V_LOGO_SETTLE_Y / V_ANCHOR_TITLE_TOP with the bookends), so S2 needs NO extra
  // nudge — the old hand-tuned +72 lift is what left the title 6px low at the cut.
  const S2_ANCHOR_BASE_Y = 0;
  const anchorY = interpolate(outroS, [0, 1], [S2_ANCHOR_BASE_Y, RAO_ANCHOR_CENTER_Y - V_CENTER_Y]);
  const boxOutOpacity = interpolate(frame, [S5_CLICK2 + 12, S5_CLICK2 + 26], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorOutOpacity = interpolate(frame, [S5_CLICK2 + 4, S5_CLICK2 + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Cursor path (X centered-relative, Y re-derived for the tall frame).
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
    cursorY = interpolate(ease, [0, 1], [1300, boxClickY]); // rise from near the bottom of 1920
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
            <RaAnchorV />
          </div>
        </AbsoluteFill>
      )}
      {useSettledAnchor && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ transform: `translateY(${RAO_ANCHOR_CENTER_Y - V_CENTER_Y}px) scale(${RAO_ANCHOR_SCALE})` }}>
            <RaAnchorV />
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

      {frame >= S5_BUBBLE_START && <RaPromptBubbleV opacity={promptBubbleOp} offsetY={promptBubbleY} />}
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════
// RA OUTPUT (VERTICAL) — anchor at top, prompt bubble, thinking → 5 rows
// ══════════════════════════════════════════════════════════════════════
const RAO_THINK_END = 78;
const RAO_ROWS_START = 82;
const RAO_ROW_STAGGER = 12;
const RAO_FIT_DELAY = 6;

export const RaOutputV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const thinking = frame >= 0 && frame < RAO_THINK_END;
  const thinkOpacity = interpolate(frame, [0, RAO_THINK_END - 4, RAO_THINK_END], [1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `translateY(${RAO_ANCHOR_CENTER_Y - V_CENTER_Y}px) scale(${RAO_ANCHOR_SCALE})` }}>
          <RaAnchorV />
        </div>
      </AbsoluteFill>
      <RaPromptBubbleV opacity={1} offsetY={0} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ width: V_COL_W, marginTop: RA_CONV_TOP, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* hidden spacer matching the bubble height */}
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", visibility: "hidden" }}>
            <div style={{ maxWidth: 900, fontFamily, fontWeight: 500, fontSize: 28, lineHeight: 1.4, padding: "18px 26px" }}>{RA_PROMPT}</div>
          </div>

          {thinking && (
            <div style={{ width: "100%", display: "flex", marginTop: 22, opacity: thinkOpacity }}>
              <RaThinkingDotsV />
            </div>
          )}

          {frame >= RAO_ROWS_START && (
            <div style={{ width: V_ROWS_W, alignSelf: "flex-start", marginTop: 22, display: "flex", flexDirection: "column", background: "rgba(254,252,251,0.02)", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,107,53,0.10)" }}>
              {RA_PLAYERS.map((p, i) => {
                const start = RAO_ROWS_START + i * RAO_ROW_STAGGER;
                if (frame < start) return null;
                const rowS = spring({ frame: frame - start, fps, config: { damping: 200 } });
                const y = interpolate(rowS, [0, 1], [26, 0]);
                const opacity = interpolate(frame, [start, start + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                const scale = interpolate(rowS, [0, 1], [0.96, 1]);
                const fitFill = interpolate(frame, [start + RAO_FIT_DELAY, start + RAO_FIT_DELAY + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                return (
                  <div key={i} style={{ transform: `translateY(${y}px) scale(${scale})`, opacity }}>
                    <RaPlayerRowV p={p} fitFill={fitFill} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════
// KEEP ASKING → OUTPUT 2 (VERTICAL)
// Phase 1: "Just keep asking." + 3 option bubbles; cursor clicks the 3rd; it flies
// down into the chat. Phase 2: bottom-anchored prior output + thinking + typed answer.
// ══════════════════════════════════════════════════════════════════════
const RA_PROMPT2 = "Who has the best stats?";
const RA_ANSWER2 =
  "Jordan Vance has the strongest overall résumé here. As a proven transfer QB with 2 years of eligibility, he brings the most college-level production — 2,900+ passing yards and a 28:6 TD-to-INT ratio last season at Northfield State — plus the mobility to extend plays. Marcus Ellison has the higher long-term ceiling, but Jordan is the most stats-proven fit right now.";
const S8_OPTIONS = ['"What are their offers?"', '"Who has the highest GPA?"', '"Who has the best stats?"'];

const M_HEAD_IN = 8;
const M_CURSOR_IN = 34;
const M_AT_OPT = 58;
const M_CLICK = 62;
const M_MORPH_START = 74;
const M_MORPH_END = 100;
const M_THINK_START = 108;
const M_THINK_END = 150;
const M_ANSWER_START = 154;
const M_ANSWER_CPS = 2.4;

// Phase-1 layout is POSITIONED DETERMINISTICALLY (fixed top values) so the cursor
// lands exactly on the 3rd bubble. Headline sits high; the 3 option bubbles are a
// right-aligned stack below it.
const OPT_COL_W = 860;
const OPT_COL_LEFT = V_CENTER_X - OPT_COL_W / 2; // 110
const OPT_COL_RIGHT = V_CENTER_X + OPT_COL_W / 2; // 970
const HEAD_TOP = 360; // "Just keep asking." headline y (moved up from center)
const OPT_TOP = 560; // top of the option stack
const OPT_H = 74; // each bubble's rendered height (fontSize 40 + padding)
const OPT_GAP = 22;
// 3rd bubble ("Who has the best stats?") ~ 470px wide at fontSize 40, right-aligned.
const OPT3_W = 470;
const OPT3_TOP = OPT_TOP + 2 * (OPT_H + OPT_GAP); // top of the 3rd bubble
const OPT3_X = OPT_COL_RIGHT - OPT3_W / 2; // 3rd bubble center-x ≈ 735
const OPT3_Y = OPT3_TOP + OPT_H / 2; // 3rd bubble center-y
// The flying bubble is anchored by its RIGHT edge + TOP (measured px from the frame
// edges), so it lines up with the settled new-prompt bubble EXACTLY regardless of the
// width change as the font shrinks. Both share these end coordinates → no pop at the
// hand-off.
const FLY_START_RIGHT = 1080 - OPT_COL_RIGHT; // 3rd option's right edge → px from frame right (=110)
const FLY_START_TOP = OPT3_TOP; // 3rd option's top
const FLY_END_RIGHT = 1080 - (V_CENTER_X + V_COL_W / 2); // settled bubble right edge → 40
// Top of the SETTLED new-prompt bubble, verified by measuring the rendered frame
// (orange fill bbox on the first settled frame): top = 902, right inset = 40.
// This was 860 — a stale value from an older layout — so the bubble finished its
// shrink 42px SHORT and then snapped down onto the settled bubble at the swap. That
// 42px snap is the jump. Keep this in sync if the chat column above it changes
// (prompt/rows/gaps all feed the flex layout that places the settled bubble).
const FLY_END_TOP = 902;

export const KeepAskV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cursor rises from the bottom to the 3rd option, then HOLDS on it (click).
  let curX = OPT3_X;
  let curY = OPT3_Y;
  if (frame < M_AT_OPT) {
    const t = interpolate(frame, [M_CURSOR_IN, M_AT_OPT], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const e = t * t * (3 - 2 * t);
    curX = interpolate(e, [0, 1], [OPT3_X + 80, OPT3_X]);
    curY = interpolate(e, [0, 1], [1300, OPT3_Y]);
  }
  const cursorVisible = frame >= M_CURSOR_IN && frame < M_MORPH_START;
  const click = frame >= M_CLICK && frame < M_CLICK + 14 ? interpolate(frame, [M_CLICK, M_CLICK + 14], [0, 1]) : 0;
  // Spring-eased morph (starts fast, settles gently) so the bubble shrinks + glides
  // smoothly onto its final resting spot instead of a linear slide + hard stop.
  // Normalised so the spring reads EXACTLY 1 at the swap frame. Raw spring only reaches
  // ~0.9959 there, which left the flying bubble a fraction short of its endpoint on top
  // of the (now fixed) 42px FLY_END_TOP error — both contributed to the snap.
  const MORPH_CFG = { damping: 26, mass: 0.9, stiffness: 90 };
  const MORPH_SWAP = 97; // first frame the settled bubble takes over (spring ≈ settled)
  const morphRaw = spring({ frame: frame - M_MORPH_START, fps, config: MORPH_CFG });
  const morphAtSwap = spring({ frame: MORPH_SWAP - M_MORPH_START, fps, config: MORPH_CFG });
  const morphS = Math.min(1, morphRaw / morphAtSwap);
  const morph = interpolate(frame, [M_MORPH_START, M_MORPH_END], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Swap flying→settled at the frame the normalised spring hits 1 → both draw the
  // bubble at the identical right edge + top, so the hand-off is invisible.
  const morphDone = frame >= MORPH_SWAP;
  const keepAskOpacity = interpolate(frame, [M_MORPH_START, M_MORPH_START + 14], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chatReveal = interpolate(frame, [M_MORPH_START, M_MORPH_START + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const thinking = frame >= M_THINK_START && frame < M_THINK_END;
  const thinkOpacity = interpolate(frame, [M_THINK_START, M_THINK_START + 6, M_THINK_END - 4, M_THINK_END], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const answerCount = Math.max(0, Math.min(RA_ANSWER2.length, Math.floor((frame - M_ANSWER_START) * M_ANSWER_CPS)));
  const answer = RA_ANSWER2.slice(0, answerCount);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.oxfordBlue }}>
      <SlideBG />

      {/* Chat (prior prompt + full output + new prompt + thinking + answer).
          Top-anchored with a small top offset so the conversation starts high and
          fills the frame (no big empty band above the first prompt). */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", opacity: chatReveal }}>
        <div style={{ width: V_COL_W, paddingTop: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          {/* prior prompt */}
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
            <div style={{ maxWidth: 820, background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 26, lineHeight: 1.4, padding: "16px 24px", borderRadius: 20, borderBottomRightRadius: 6 }}>{RA_PROMPT}</div>
          </div>
          {/* prior output — all 5 rows fully filled */}
          <div style={{ width: V_ROWS_W, alignSelf: "flex-start", display: "flex", flexDirection: "column", background: "rgba(254,252,251,0.02)", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,107,53,0.10)" }}>
            {RA_PLAYERS.map((p, i) => (
              <RaPlayerRowV key={i} p={p} fitFill={1} />
            ))}
          </div>
          {/* new prompt (appears once the flying bubble lands) */}
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", opacity: morphDone ? 1 : 0 }}>
            <div style={{ background: colors.accentOrange, color: "#fff", fontFamily, fontWeight: 500, fontSize: 26, padding: "16px 24px", borderRadius: 20, borderBottomRightRadius: 6 }}>{RA_PROMPT2}</div>
          </div>
          {/* thinking */}
          {thinking && (
            <div style={{ width: "100%", display: "flex", opacity: thinkOpacity }}>
              <RaThinkingDotsV />
            </div>
          )}
          {/* answer (typed) */}
          {frame >= M_ANSWER_START && (
            <div style={{ width: "100%", display: "flex", justifyContent: "flex-start" }}>
              <div style={{ maxWidth: 900, background: "rgba(254,252,251,0.06)", border: "1px solid rgba(255,107,53,0.12)", color: WHITE, fontFamily, fontWeight: 500, fontSize: 27, lineHeight: 1.55, padding: "20px 28px", borderRadius: 22, borderBottomLeftRadius: 6 }}>{answer}</div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Phase 1 — "Just keep asking." + option bubbles (deterministic positions) */}
      {keepAskOpacity > 0.01 && (
        <AbsoluteFill style={{ opacity: keepAskOpacity }}>
          {/* headline, pinned high */}
          <div style={{ ...heroStyleV, position: "absolute", top: HEAD_TOP, left: 0, right: 0 }}>
            <WordReveal text="Just keep asking." startFrame={M_HEAD_IN} />
          </div>
          {/* option stack — right-aligned within a centered column at a fixed top */}
          <div style={{ position: "absolute", top: OPT_TOP, left: OPT_COL_LEFT, width: OPT_COL_W, display: "flex", flexDirection: "column", gap: OPT_GAP, alignItems: "flex-end" }}>
            {S8_OPTIONS.map((b, i) => {
              const local = frame - 30 - i * 8;
              const s = spring({ frame: local, fps, config: { damping: 200 } });
              const y = interpolate(s, [0, 1], [30, 0]);
              const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const isThird = i === 2;
              if (isThird && frame >= M_MORPH_START) return null;
              const fadeOut = isThird ? 1 : 1 - morph;
              return (
                <div
                  key={i}
                  style={{
                    transform: `translateY(${y}px) scale(${isThird ? 1 + click * 0.03 : 1})`,
                    opacity: opacity * fadeOut,
                    background: isThird && click > 0 ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isThird && click > 0 ? colors.accentOrange : "rgba(255,255,255,0.12)"}`,
                    borderRadius: "20px 20px 4px 20px",
                    padding: "18px 28px",
                    fontFamily,
                    fontWeight: 500,
                    fontSize: 40,
                    color: WHITE,
                  }}
                >
                  {b}
                </div>
              );
            })}
          </div>
          {cursorVisible && <CursorArrowV x={curX} y={curY} clicking={click} />}
        </AbsoluteFill>
      )}

      {/* Flying bubble morph (3rd option → new chat prompt). Anchored by its RIGHT
          edge + TOP so it lands EXACTLY on the settled right-aligned new-prompt bubble
          (same right edge + top), shrinking 40→26px along a spring so it glides in and
          settles instead of sliding linearly and stopping. Hidden once fully landed;
          the settled flex bubble (opacity keyed off morph>=1) takes over at the
          identical spot → seamless. */}
      {frame >= M_MORPH_START && !morphDone && (
        <div
          style={{
            position: "absolute",
            right: interpolate(morphS, [0, 1], [FLY_START_RIGHT, FLY_END_RIGHT], { extrapolateRight: "clamp" }),
            top: interpolate(morphS, [0, 1], [FLY_START_TOP, FLY_END_TOP], { extrapolateRight: "clamp" }),
            transformOrigin: "top right",
            fontSize: interpolate(morphS, [0, 1], [40, 26], { extrapolateRight: "clamp" }),
            background: colors.accentOrange,
            borderRadius: "20px 20px 6px 20px",
            padding: "16px 24px",
            fontFamily,
            fontWeight: 500,
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {RA_PROMPT2}
        </div>
      )}
    </AbsoluteFill>
  );
};
