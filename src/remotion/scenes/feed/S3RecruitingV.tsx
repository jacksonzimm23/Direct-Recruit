import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../../brand";
import { SlideBG } from "../../components/primitives";
import { logo } from "../../AiRaDemo";
import { V_LOGO_W, V_LOGO_TOP, V_CAPTION_TOP, V_CAPTION_SIZE } from "./S4MatchesV";

/**
 * S3 — The Player's Side (VERTICAL 1080×1920). DR logo hands off from the vertical
 * open (rises to the top pinned spot), a caption, then the hsplayer "Recruiting Fit"
 * card scrolls slowly upward through a tall masked viewport. Same beats + timing as
 * scenes/S3Recruiting, reflowed for 9:16 (wider card, taller viewport, bigger type).
 */

const CERULEAN = colors.cerulean;
const WHITE = colors.white;
const CARD_BG = "rgba(254,252,251,0.05)";
const CARD_BORDER = "1px solid rgba(18,130,162,0.2)";
const INPUT_BG = "rgba(254,252,251,0.05)";
const INPUT_BORDER = "2px solid rgba(18,130,162,0.3)";
const HINT = "rgba(254,252,251,0.6)";

const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ── Where the feed OPEN settles the logo center (frame center 675 − lift).
// The feed composition's open/hook scenes MUST settle the logo so its CENTER
// sits at this Y, so S3V can pick it up with zero jump. (See AiMatchLaunchFeed
// V_OPEN_LOGO_LIFT.) Logo center when pinned at top = V_LOGO_TOP + V_LOGO_W/2.
export const V_OPEN_LOGO_CENTER_Y = 500; // 4:5: 675 − 175 lift (logo settle for S2 handoff)
const V_LOGO_PINNED_CENTER = V_LOGO_TOP + V_LOGO_W / 2; // = 155 (4:5)
// The logo enters S3 at the BIG hook size and shrinks to V_LOGO_W during the rise.
// MUST equal AiMatchLaunchFeed's HOOK_LOGO_W (175).
const S3_LOGO_START_W = 175;

// ── Form primitives (vertical scale — larger than landscape) ─────────────────
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...base, color: WHITE, fontWeight: 600, fontSize: 30, marginBottom: 16 }}>{children}</div>
);

const Field: React.FC<{ value?: string; placeholder?: string; tall?: boolean }> = ({ value, placeholder, tall }) => (
  <div
    style={{
      ...base,
      width: "100%",
      minHeight: tall ? 150 : 78,
      background: INPUT_BG,
      border: INPUT_BORDER,
      borderRadius: 12,
      padding: tall ? "22px 24px" : "20px 24px",
      color: value ? WHITE : "rgba(254,252,251,0.4)",
      fontSize: 28,
      display: "flex",
      alignItems: tall ? "flex-start" : "center",
      lineHeight: 1.5,
    }}
  >
    {value ?? placeholder}
  </div>
);

const Radio: React.FC<{ label: string; checked?: boolean }> = ({ label, checked }) => (
  <div style={{ ...base, display: "flex", alignItems: "center", gap: 15, color: WHITE, fontSize: 28 }}>
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: `3px solid ${checked ? CERULEAN : "rgba(254,252,251,0.4)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {checked && <div style={{ width: 16, height: 16, borderRadius: "50%", background: CERULEAN }} />}
    </div>
    {label}
  </div>
);

const CheckPill: React.FC<{ label: string; on?: boolean }> = ({ label, on }) => (
  <div
    style={{
      ...base,
      display: "flex",
      alignItems: "center",
      gap: 15,
      padding: "20px 24px",
      background: on ? "rgba(18,130,162,0.18)" : "rgba(254,252,251,0.03)",
      border: `2px solid ${on ? CERULEAN : "rgba(18,130,162,0.2)"}`,
      borderRadius: 12,
      color: WHITE,
      fontSize: 27,
    }}
  >
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: `2px solid ${on ? CERULEAN : "rgba(254,252,251,0.35)"}`,
        background: on ? CERULEAN : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {on && (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
    {label}
  </div>
);

const Slider: React.FC<{ label: string; value: number; left: string; right: string }> = ({ label, value, left, right }) => {
  const pct = ((value - 1) / 4) * 100;
  return (
    <div style={{ ...base, marginBottom: 38 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ color: WHITE, fontWeight: 600, fontSize: 27 }}>{label}</div>
        <div style={{ color: CERULEAN, fontWeight: 800, fontSize: 28, minWidth: 40, textAlign: "right" }}>{value}</div>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(18,130,162,0.25)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: CERULEAN, borderRadius: 5 }} />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 36,
            height: 36,
            marginLeft: -18,
            marginTop: -18,
            borderRadius: "50%",
            background: CERULEAN,
            border: `3px solid ${WHITE}`,
            boxShadow: "0 1px 6px rgba(0,0,0,0.35)",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: "rgba(254,252,251,0.55)", fontSize: 22 }}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
};

const Group: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginBottom: 50 }}>{children}</div>
);

const CARD_W = 980;

const RecruitingCard: React.FC = () => (
  <div
    style={{
      ...base,
      width: CARD_W,
      background: CARD_BG,
      border: CARD_BORDER,
      borderRadius: 28,
      padding: "64px 66px",
    }}
  >
    <div style={{ color: CERULEAN, fontWeight: 700, fontSize: 44, letterSpacing: "-0.02em", marginBottom: 14 }}>
      Recruiting Fit
    </div>
    <div style={{ color: HINT, fontSize: 28, marginBottom: 52, lineHeight: 1.4 }}>
      Helps coaches find players who truly fit their program.
    </div>

    <Group>
      <Label>Will you need financial aid?</Label>
      <div style={{ display: "flex", gap: 42 }}>
        <Radio label="Yes" checked />
        <Radio label="No" />
        <Radio label="Unsure" />
      </div>
    </Group>

    <Group>
      <Label>Do you need athletic scholarship money?</Label>
      <div style={{ display: "flex", gap: 42 }}>
        <Radio label="Yes" checked />
        <Radio label="No" />
        <Radio label="Unsure" />
      </div>
    </Group>

    <Group>
      <Label>Levels open to playing</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <CheckPill label="D1 FBS" on />
        <CheckPill label="D1 FCS" on />
        <CheckPill label="D2" on />
        <CheckPill label="D3" on />
        <CheckPill label="NAIA" />
        <CheckPill label="NJCAA" />
      </div>
    </Group>

    <Group>
      <Label>Preferred region(s)</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <CheckPill label="Northeast" />
        <CheckPill label="Southeast" on />
        <CheckPill label="Midwest" />
        <CheckPill label="South Central" on />
        <CheckPill label="West" on />
        <CheckPill label="Pacific" />
      </div>
    </Group>

    <Group>
      <Label>Preferred campus setting</Label>
      <Field value="Suburban" />
    </Group>

    <Group>
      <Label>How important is each of these to you?</Label>
      <div style={{ marginTop: 22 }}>
        <Slider label="Early playing time" value={4} left="Not important" right="Very important" />
        <Slider label="Staying close to home" value={2} left="Not important" right="Very important" />
        <Slider label="Academics vs. football" value={4} left="Football-first" right="Academics-first" />
        <Slider label="Level of competition" value={5} left="Not important" right="Very important" />
      </div>
    </Group>

    <Group>
      <Label>What I'm looking for in a program</Label>
      <Field tall value="A program where I can compete for early playing time and grow both on the field and in the classroom." />
    </Group>
  </div>
);

// ── Layout ───────────────────────────────────────────────────────────────────
const VIEWPORT_TOP = 420; // below the caption (4:5)
const VIEWPORT_H = 1350 - VIEWPORT_TOP - 50; // room to the bottom safe area (4:5)

export const S3RecruitingV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo rises to the top AND shrinks from the big hook size to V_LOGO_W at the SAME
  // time (one spring) — shrink-while-moving. Center-anchored so the width change never
  // shifts the center off the rise path. S3_LOGO_START_W MUST equal AiMatchLaunchFeed's
  // HOOK_LOGO_W (175).
  const riseS = spring({ frame, fps, config: { damping: 200 } });
  const logoCenterY = interpolate(riseS, [0, 1], [V_OPEN_LOGO_CENTER_Y, V_LOGO_PINNED_CENTER]);
  const logoW = interpolate(riseS, [0, 1], [S3_LOGO_START_W, V_LOGO_W]);

  const S3_END = 122; // matches S3_DUR in AiMatchLaunchFeed (+0.75s longer hold)
  const capOpacity = interpolate(frame, [24, 38, S3_END - 12, S3_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardOpacity = interpolate(frame, [28, 44, S3_END - 12, S3_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Upward scroll of the tall card through the viewport.
  const CARD_H = 2360; // approx rendered card height at vertical scale
  const scrollStart = 38;
  const scrollEnd = S3_END - 12; // 87
  const maxScroll = (CARD_H - VIEWPORT_H + 40) * 0.55; // slower pan
  const scroll = interpolate(frame, [scrollStart, scrollEnd], [0, maxScroll], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* DR logo — rises to the top WHILE shrinking. Center-anchored at logoCenterY. */}
      <div style={{ position: "absolute", top: logoCenterY, left: 0, right: 0, display: "flex", justifyContent: "center", transform: "translateY(-50%)" }}>
        <Img src={logo} style={{ width: logoW, display: "block" }} />
      </div>

      {/* Caption */}
      <div
        style={{
          ...base,
          position: "absolute",
          top: V_CAPTION_TOP,
          left: 0,
          right: 0,
          textAlign: "center",
          fontWeight: 800,
          fontSize: V_CAPTION_SIZE,
          letterSpacing: "-0.03em",
          color: WHITE,
          opacity: capOpacity,
          padding: "0 70px",
          lineHeight: 1.1,
        }}
      >
        Fill out your recruiting profile
      </div>

      {/* Scrolling card viewport */}
      <div
        style={{
          position: "absolute",
          top: VIEWPORT_TOP,
          left: 0,
          right: 0,
          height: VIEWPORT_H,
          overflow: "hidden",
          display: "flex",
          justifyContent: "center",
          opacity: cardOpacity,
          maskImage: "linear-gradient(to bottom, transparent 0, #000 70px, #000 calc(100% - 100px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 70px, #000 calc(100% - 100px), transparent 100%)",
        }}
      >
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          <RecruitingCard />
        </div>
      </div>
    </AbsoluteFill>
  );
};
