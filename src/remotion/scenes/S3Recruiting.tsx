import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily } from "../brand";
import { SlideBG } from "../components/primitives";
import { logo } from "../AiRaDemo";

/**
 * S3 — The Player's Side (desktop UI). DR logo pinned near the top, a caption line,
 * then the hsplayer "Recruiting Fit" section of the Create Profile page scrolls
 * slowly upward as new fields appear. Faithful to frontend/hsplayer/create-profile
 * (profile-form.css) — cerulean accents, glass card, dark navy gradient.
 */

// ── Brand tokens (from landingpage/styles.css :root + profile-form.css) ──────
const CERULEAN = colors.cerulean; // #1282a2
const WHITE = colors.white; // #fefcfb
const CARD_BG = "rgba(254,252,251,0.05)";
const CARD_BORDER = "1px solid rgba(18,130,162,0.2)";
const INPUT_BG = "rgba(254,252,251,0.05)";
const INPUT_BORDER = "2px solid rgba(18,130,162,0.3)";
const HINT = "rgba(254,252,251,0.6)";

const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ── Small form primitives (desktop scale) ───────────────────────────────────
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...base, color: WHITE, fontWeight: 600, fontSize: 22, marginBottom: 12 }}>{children}</div>
);

const Field: React.FC<{ value?: string; placeholder?: string; tall?: boolean }> = ({ value, placeholder, tall }) => (
  <div
    style={{
      ...base,
      width: "100%",
      minHeight: tall ? 120 : 62,
      background: INPUT_BG,
      border: INPUT_BORDER,
      borderRadius: 10,
      padding: tall ? "18px 20px" : "16px 20px",
      color: value ? WHITE : "rgba(254,252,251,0.4)",
      fontSize: 22,
      display: "flex",
      alignItems: tall ? "flex-start" : "center",
      lineHeight: 1.5,
    }}
  >
    {value ?? placeholder}
  </div>
);

const Radio: React.FC<{ label: string; checked?: boolean }> = ({ label, checked }) => (
  <div style={{ ...base, display: "flex", alignItems: "center", gap: 12, color: WHITE, fontSize: 22 }}>
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: `2.5px solid ${checked ? CERULEAN : "rgba(254,252,251,0.4)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {checked && <div style={{ width: 12, height: 12, borderRadius: "50%", background: CERULEAN }} />}
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
      gap: 12,
      padding: "16px 20px",
      background: on ? "rgba(18,130,162,0.18)" : "rgba(254,252,251,0.03)",
      border: `2px solid ${on ? CERULEAN : "rgba(18,130,162,0.2)"}`,
      borderRadius: 10,
      color: WHITE,
      fontSize: 21,
    }}
  >
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        border: `2px solid ${on ? CERULEAN : "rgba(254,252,251,0.35)"}`,
        background: on ? CERULEAN : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {on && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
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
    <div style={{ ...base, marginBottom: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: WHITE, fontWeight: 600, fontSize: 21 }}>{label}</div>
        <div style={{ color: CERULEAN, fontWeight: 800, fontSize: 22, minWidth: 32, textAlign: "right" }}>{value}</div>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(18,130,162,0.25)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: CERULEAN, borderRadius: 4 }} />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 28,
            height: 28,
            marginLeft: -14,
            marginTop: -14,
            borderRadius: "50%",
            background: CERULEAN,
            border: `2.5px solid ${WHITE}`,
            boxShadow: "0 1px 5px rgba(0,0,0,0.35)",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, color: "rgba(254,252,251,0.55)", fontSize: 17 }}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
};

const Group: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginBottom: 40 }}>{children}</div>
);

// ── The scrolling recruiting-profile card content ────────────────────────────
// Built once, tall; S3 pans it upward slowly. Each Group reveals as it enters view.
const RecruitingCard: React.FC = () => (
  <div
    style={{
      ...base,
      width: 1080,
      background: CARD_BG,
      border: CARD_BORDER,
      borderRadius: 24,
      padding: "56px 60px",
    }}
  >
    <div style={{ color: CERULEAN, fontWeight: 700, fontSize: 34, letterSpacing: "-0.02em", marginBottom: 10 }}>
      Recruiting Fit
    </div>
    <div style={{ color: HINT, fontSize: 21, marginBottom: 44, lineHeight: 1.4 }}>
      Helps coaches find players who truly fit their program.
    </div>

    <Group>
      <Label>Will you need financial aid?</Label>
      <div style={{ display: "flex", gap: 34 }}>
        <Radio label="Yes" checked />
        <Radio label="No" />
        <Radio label="Unsure" />
      </div>
    </Group>

    <Group>
      <Label>Do you need athletic scholarship money?</Label>
      <div style={{ display: "flex", gap: 34 }}>
        <Radio label="Yes" checked />
        <Radio label="No" />
        <Radio label="Unsure" />
      </div>
    </Group>

    <Group>
      <Label>Levels open to playing</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
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
      <div style={{ marginTop: 18 }}>
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

// ── Layout constants ─────────────────────────────────────────────────────────
const LOGO_W = 120; // DR logo width (matches the S1/S2 settled anchor size)
const LOGO_TOP = 56; // logo's FINAL pinned position near the top (div top)
const CAPTION_TOP = 210; // caption line y
const VIEWPORT_TOP = 320; // where the scrolling card viewport begins
const VIEWPORT_H = 1080 - VIEWPORT_TOP - 20; // room under the caption to the bottom

// The logo hands off SMOOTHLY from S2. S2 ends with the logo centered in the frame
// at translateY(-150) from center → its center sits at y = 540 - 150 = 390, and its
// TOP edge at 390 - LOGO_W/2 = 330. S3's logo div is pinned at top:LOGO_TOP(56), so
// to start where S2 left it we offset the div down by (330 - 56) = 274px, then glide
// that offset to 0 (the top spot). This makes the logo appear to rise continuously
// across the S2→S3 cut with zero jump.
const S2_LOGO_LIFT = 150; // MUST match AiMatchLaunch OPEN_LOGO_LIFT (S2's settled logo)
const LOGO_HANDOFF_OFFSET = 540 - S2_LOGO_LIFT - LOGO_W / 2 - LOGO_TOP; // = 274

export const S3Recruiting: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Logo rises from S2's settled spot up to the top (smooth hand-off). ──
  // Starts at LOGO_HANDOFF_OFFSET (S2's position), eases to 0 over ~22f.
  const riseS = spring({ frame, fps, config: { damping: 200 } });
  const logoOffset = interpolate(riseS, [0, 1], [LOGO_HANDOFF_OFFSET, 0]);
  const logoOpacity = 1; // already visible from S2 — no fade-in (seamless)

  // Caption + card fade in AFTER the logo travels up, then fade OUT at the S3 cut
  // (f99) so only the logo remains — S4 keeps the logo in the same spot and swaps
  // in its own caption/content (seamless logo hand-off, S3→S4).
  const S3_END = 99; // 90 + 10% longer
  const capOpacity = interpolate(frame, [24, 38, S3_END - 12, S3_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardOpacity = interpolate(frame, [28, 44, S3_END - 12, S3_END - 2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Upward scroll of the tall card. Starts after the logo settles + card appears.
  // SLOWER than before: the pan now runs the full window (scrollStart→scrollEnd)
  // AND covers a bit less distance, so it's a gentler glide through the content
  // instead of a brisk rush. Finishes just as the card begins to fade (S3_END-12).
  const CARD_H = 1660; // approx rendered card height
  const scrollStart = 38;
  const scrollEnd = S3_END - 12; // 87 — done exactly as the fade-out begins
  const maxScroll = (CARD_H - VIEWPORT_H + 40) * 0.82; // pan ~82% of the way (slower feel)
  const scroll = interpolate(frame, [scrollStart, scrollEnd], [0, maxScroll], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SlideBG />

      {/* DR logo — rises smoothly from S2's settled center up to the top. */}
      <div style={{ position: "absolute", top: LOGO_TOP, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: logoOpacity }}>
        <Img src={logo} style={{ width: LOGO_W, transform: `translateY(${logoOffset}px)` }} />
      </div>

      {/* Caption — under the logo, with room to breathe */}
      <div
        style={{
          ...base,
          position: "absolute",
          top: CAPTION_TOP,
          left: 0,
          right: 0,
          textAlign: "center",
          fontWeight: 800,
          fontSize: 46,
          letterSpacing: "-0.03em",
          color: WHITE,
          opacity: capOpacity,
          padding: "0 120px",
        }}
      >
        Fill out your recruiting profile
      </div>

      {/* Scrolling card viewport — masks the tall card, pans it up slowly. Top and
          bottom fade so fields appear/disappear softly at the edges. */}
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
          maskImage: "linear-gradient(to bottom, transparent 0, #000 60px, #000 calc(100% - 90px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 60px, #000 calc(100% - 90px), transparent 100%)",
        }}
      >
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          <RecruitingCard />
        </div>
      </div>
    </AbsoluteFill>
  );
};
