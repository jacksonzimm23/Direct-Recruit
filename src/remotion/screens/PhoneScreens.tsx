import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { fontFamily } from "../brand";

/**
 * Native mobile-styled replicas of two Direct Recruit HS-player screens, built to
 * match the real iOS app (colors/layout from the platform). Rendered as tall PNG
 * stills, then textured onto the 3D phone in S3 of AiMatchLaunch.
 *
 * Phone screen canvas: 1080 × 2160 (portrait, ~18:9). Content is built at this
 * size; the slow-scroll in S3 pans the texture down the tall image.
 */
export const SCREEN_W = 1080;
export const SCREEN_H = 2160;

// ── Brand tokens (from landingpage/styles.css :root) ──────────────────────
const NAVY_GRAD = "linear-gradient(160deg, #0a1128 0%, #001f54 55%, #034078 100%)";
const CERULEAN = "#1282a2";
const WHITE = "#fefcfb";
const ORANGE = "#ff6b35";
const CARD_BG = "rgba(254,252,251,0.05)";
const CARD_BORDER = "1px solid rgba(18,130,162,0.2)";
const INPUT_BG = "rgba(254,252,251,0.05)";
const INPUT_BORDER = "2px solid rgba(18,130,162,0.3)";
const LABEL = WHITE;
const HINT = "rgba(254,252,251,0.6)";
const SECTION = CERULEAN;

// Fit-score tier colors (from :root --fit-*)
export const fitTier = (s: number): string => {
  if (s >= 90) return "#1f9d4d";
  if (s >= 75) return "#86efac";
  if (s >= 60) return "#eab308";
  if (s >= 45) return "#f97316";
  if (s >= 30) return "#ef4444";
  return "#7f1d1d";
};

const base: React.CSSProperties = { fontFamily, boxSizing: "border-box" };

// ══════════════════════════════════════════════════════════════════════════
// SCREEN 1 — Sign-up: the "Recruiting Fit" section of Create HS Player Profile
// ══════════════════════════════════════════════════════════════════════════
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...base, color: LABEL, fontWeight: 600, fontSize: 30, marginBottom: 14 }}>{children}</div>
);
const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...base, color: HINT, fontSize: 24, marginTop: 10 }}>{children}</div>
);
const Field: React.FC<{ children?: React.ReactNode; placeholder?: string; value?: string }> = ({
  placeholder,
  value,
}) => (
  <div
    style={{
      ...base,
      width: "100%",
      minHeight: 88,
      background: INPUT_BG,
      border: INPUT_BORDER,
      borderRadius: 16,
      padding: "24px 28px",
      color: value ? WHITE : "rgba(254,252,251,0.4)",
      fontSize: 30,
      display: "flex",
      alignItems: "center",
    }}
  >
    {value ?? placeholder}
  </div>
);

const Radio: React.FC<{ label: string; checked?: boolean }> = ({ label, checked }) => (
  <div style={{ ...base, display: "flex", alignItems: "center", gap: 16, color: WHITE, fontSize: 30 }}>
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: `3px solid ${checked ? CERULEAN : "rgba(254,252,251,0.4)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
      gap: 16,
      padding: "22px 26px",
      background: on ? "rgba(18,130,162,0.18)" : "rgba(254,252,251,0.03)",
      border: `2px solid ${on ? CERULEAN : "rgba(18,130,162,0.2)"}`,
      borderRadius: 14,
      color: WHITE,
      fontSize: 29,
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `2px solid ${on ? CERULEAN : "rgba(254,252,251,0.35)"}`,
        background: on ? CERULEAN : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
    {label}
  </div>
);

const Slider: React.FC<{ label: string; value: number; left: string; right: string }> = ({
  label,
  value,
  left,
  right,
}) => {
  const pct = ((value - 1) / 4) * 100;
  return (
    <div style={{ ...base, marginBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ color: WHITE, fontWeight: 600, fontSize: 29 }}>{label}</div>
        <div style={{ color: CERULEAN, fontWeight: 800, fontSize: 30, minWidth: 44, textAlign: "right" }}>{value}</div>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 6, background: "rgba(18,130,162,0.25)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: CERULEAN, borderRadius: 6 }} />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 40,
            height: 40,
            marginLeft: -20,
            marginTop: -20,
            borderRadius: "50%",
            background: CERULEAN,
            border: `3px solid ${WHITE}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
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

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...base, color: SECTION, fontWeight: 700, fontSize: 40, letterSpacing: "-0.02em", margin: "8px 0 30px" }}>
    {children}
  </div>
);

const Group: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginBottom: 44 }}>{children}</div>
);

export const SignupScreen: React.FC = () => (
  <AbsoluteFill style={{ ...base, background: NAVY_GRAD }}>
    {/* status bar spacer */}
    <div style={{ height: 60 }} />
    <div style={{ padding: "0 44px 80px" }}>
      {/* card */}
      <div
        style={{
          background: CARD_BG,
          border: CARD_BORDER,
          borderRadius: 40,
          padding: "56px 48px",
        }}
      >
        {/* header */}
        <div style={{ color: WHITE, fontWeight: 800, fontSize: 56, lineHeight: 1.1, marginBottom: 16 }}>
          Create Your HS Player Profile
        </div>
        <div style={{ color: "rgba(254,252,251,0.7)", fontSize: 30, marginBottom: 56 }}>
          Showcase your talent and connect directly with college coaches.
        </div>

        {/* Recruiting Fit section */}
        <Section>Recruiting Fit</Section>
        <div style={{ color: HINT, fontSize: 26, marginBottom: 44, lineHeight: 1.4 }}>
          Helps coaches find players who truly fit their program.
        </div>

        <Group>
          <Label>Will you need financial aid?</Label>
          <div style={{ display: "flex", gap: 40 }}>
            <Radio label="Yes" checked />
            <Radio label="No" />
            <Radio label="Unsure" />
          </div>
        </Group>

        <Group>
          <Label>Do you need athletic scholarship money?</Label>
          <div style={{ display: "flex", gap: 40 }}>
            <Radio label="Yes" checked />
            <Radio label="No" />
            <Radio label="Unsure" />
          </div>
        </Group>

        <Group>
          <Label>Levels open to playing</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <CheckPill label="D1 FBS" />
            <CheckPill label="D1 FCS" on />
            <CheckPill label="D2" on />
            <CheckPill label="D3" on />
            <CheckPill label="NAIA" />
            <CheckPill label="NJCAA" />
          </div>
        </Group>

        <Group>
          <Label>Preferred region(s)</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
          <div style={{ marginTop: 24 }}>
            <Slider label="Early playing time" value={4} left="Not important" right="Very important" />
            <Slider label="Staying close to home" value={2} left="Not important" right="Very important" />
            <Slider label="Academics vs. football" value={4} left="Football-first" right="Academics-first" />
            <Slider label="Level of competition" value={5} left="Not important" right="Very important" />
          </div>
        </Group>

        <Group>
          <Label>What I'm looking for in a program</Label>
          <div
            style={{
              ...base,
              width: "100%",
              minHeight: 180,
              background: INPUT_BG,
              border: INPUT_BORDER,
              borderRadius: 16,
              padding: "24px 28px",
              color: WHITE,
              fontSize: 29,
              lineHeight: 1.5,
            }}
          >
            A program where I can compete for early playing time and grow both on the field and in the classroom.
          </div>
        </Group>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
          <div
            style={{
              ...base,
              background: ORANGE,
              color: WHITE,
              fontWeight: 700,
              fontSize: 36,
              padding: "34px 0",
              width: "100%",
              borderRadius: 20,
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              boxShadow: "0 12px 30px rgba(255,107,53,0.4)",
            }}
          >
            Create Profile
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

// ══════════════════════════════════════════════════════════════════════════
// SCREEN 2 — AI Match: the "Best-Fit Schools" list (hsplayer ai-rep)
// ══════════════════════════════════════════════════════════════════════════
type School = { name: string; div: string; logo: string; score: number };
const SCHOOLS: School[] = [
  { name: "Eastern Washington University", div: "D1 FCS", logo: "eastern_washington.png", score: 92 },
  { name: "University of San Diego", div: "D1 FCS", logo: "san_diego.png", score: 85 },
  { name: "Delta State University", div: "D2", logo: "delta_state.png", score: 78 },
  { name: "West Texas A&M University", div: "D2", logo: "west_texas_am.png", score: 71 },
];

const FitBar: React.FC<{ score: number }> = ({ score }) => {
  const color = fitTier(score);
  const pct = Math.max(4, Math.min(100, score));
  return (
    <div style={{ ...base, display: "flex", alignItems: "center", gap: 20, marginTop: 22, width: "100%" }}>
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: WHITE, flexShrink: 0 }}>
        AI Match
      </span>
      <div style={{ position: "relative", flex: 1, height: 16, borderRadius: 8, background: "rgba(254,252,251,0.08)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 8, boxShadow: `0 0 12px -1px ${color}` }} />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 22,
            height: 22,
            marginLeft: -11,
            marginTop: -11,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: `0 0 8px 1px ${color}`,
          }}
        />
      </div>
      <span style={{ fontSize: 42, fontWeight: 800, color, flexShrink: 0, minWidth: 70, textAlign: "right" }}>{score}</span>
    </div>
  );
};

const SchoolRow: React.FC<{ s: School }> = ({ s }) => (
  <div
    style={{
      ...base,
      background: "rgba(254,252,251,0.03)",
      border: "1px solid rgba(18,130,162,0.2)",
      borderRadius: 24,
      padding: "34px 36px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
      <Img
        src={staticFile(`logos/${s.logo}`)}
        style={{ width: 84, height: 84, objectFit: "contain", filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)" }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ color: WHITE, fontWeight: 700, fontSize: 34, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.name}
        </div>
        <div style={{ color: "rgba(254,252,251,0.55)", fontWeight: 600, fontSize: 25, letterSpacing: "0.03em", textTransform: "uppercase", marginTop: 6 }}>
          {s.div}
        </div>
      </div>
    </div>
    <FitBar score={s.score} />
  </div>
);

export const AiMatchScreen: React.FC = () => (
  <AbsoluteFill style={{ ...base, background: "#0a1128" }}>
    <div style={{ height: 60 }} />
    <div style={{ padding: "0 44px 80px" }}>
      {/* Hero */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          padding: "44px 44px",
          marginBottom: 50,
          background: "linear-gradient(135deg, rgba(18,130,162,0.12) 0%, rgba(18,130,162,0.03) 100%)",
          border: "1px solid rgba(18,130,162,0.25)",
          borderRadius: 32,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 26,
            background: "linear-gradient(135deg, rgba(18,130,162,0.3), rgba(18,130,162,0.1))",
            border: "1px solid rgba(18,130,162,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={CERULEAN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 52, fontWeight: 900, background: `linear-gradient(135deg, ${CERULEAN}, #00d4ff)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" as unknown as string }}>
            AI Rep
          </div>
          <div style={{ fontSize: 27, color: "rgba(254,252,251,0.5)", marginTop: 8, fontWeight: 500 }}>
            Your personal recruiting representative.
          </div>
        </div>
      </div>

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 12 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={CERULEAN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10L12 5 2 10l10 5 10-5z" />
          <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
        </svg>
        <div style={{ color: WHITE, fontWeight: 800, fontSize: 42 }}>Best-Fit Schools</div>
      </div>
      <div style={{ color: "rgba(254,252,251,0.6)", fontSize: 27, lineHeight: 1.5, marginBottom: 44 }}>
        Schools whose programs best fit you, on and off the field.
      </div>

      {/* School list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {SCHOOLS.map((s, i) => (
          <SchoolRow key={i} s={s} />
        ))}
      </div>
    </div>
  </AbsoluteFill>
);
