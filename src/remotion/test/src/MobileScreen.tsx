import React from "react";
import { AbsoluteFill } from "remotion";

// Mobile AI RA NEW-CHAT (welcome) screen as a college coach sees it — used as
// the phone's screen texture. Matches the real UI: orange chat-bubble icon,
// "AI Recruiting Assistant" title, description, suggestion chips, input bar.
const NAVY = "#0a1128";
const ORANGE = "#ff6b35";
const WHITE = "#fefcfb";
const font =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const Suggestion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 24,
      padding: "34px 36px",
      background: "rgba(255,107,53,0.06)",
      border: "2px solid rgba(255,107,53,0.18)",
      borderRadius: 30,
    }}
  >
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <span style={{ fontFamily: font, fontWeight: 500, fontSize: 40, color: "rgba(254,252,251,0.82)", lineHeight: 1.25 }}>{children}</span>
  </div>
);

export const MobileScreen: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, #001f54 55%, #034078 100%)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* iOS status bar */}
      <div
        style={{
          height: 118,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 66px",
          fontFamily: font,
          color: WHITE,
          fontSize: 44,
          fontWeight: 600,
        }}
      >
        <span>9:41</span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
            {[12, 18, 24, 30].map((h, i) => (
              <div key={i} style={{ width: 9, height: h, background: WHITE, borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ width: 46, height: 28, borderRadius: 7, border: `3px solid ${WHITE}`, display: "flex", alignItems: "center", padding: 3 }}>
            <div style={{ width: "75%", height: "100%", background: WHITE, borderRadius: 2 }} />
          </div>
        </div>
      </div>

      {/* app header: "Recruiting Assistant" + AI badge */}
      <div style={{ padding: "14px 60px 0", display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span style={{ fontFamily: font, fontWeight: 700, fontSize: 46, color: WHITE }}>Recruiting Assistant</span>
        <span style={{ fontFamily: font, fontWeight: 800, fontSize: 30, letterSpacing: "0.05em", color: ORANGE, background: "rgba(255,107,53,0.2)", border: `2px solid rgba(255,107,53,0.3)`, borderRadius: 50, padding: "6px 20px" }}>AI</span>
      </div>

      {/* welcome content */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 64px" }}>
        {/* welcome icon */}
        <div style={{ width: 168, height: 168, borderRadius: "50%", background: "rgba(255,107,53,0.12)", border: `3px solid rgba(255,107,53,0.28)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 46 }}>
          <svg width="82" height="82" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 78, letterSpacing: "-0.02em", color: WHITE, textAlign: "center", marginBottom: 30 }}>
          AI Recruiting Assistant
        </div>
        <div style={{ fontFamily: font, fontWeight: 500, fontSize: 42, color: "rgba(254,252,251,0.55)", textAlign: "center", lineHeight: 1.4, marginBottom: 60, maxWidth: 860 }}>
          Describe your ideal recruit and I'll find them, ranked by best fit to your program.
        </div>
        {/* suggestion chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26, width: "100%" }}>
          <Suggestion>6'2"+ CBs from Texas who run track, 3.5+ GPA</Suggestion>
          <Suggestion>Class of 2026 WRs open to my level</Suggestion>
          <Suggestion>Transfer QBs, 2+ yrs eligibility, need a scholarship</Suggestion>
        </div>
      </AbsoluteFill>

      {/* input bar */}
      <div style={{ padding: "0 60px 24px" }}>
        <div
          style={{
            width: "100%",
            background: "rgba(254,252,251,0.05)",
            border: `2px solid rgba(255,107,53,0.3)`,
            borderRadius: 40,
            padding: "30px 30px 30px 44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <span style={{ fontFamily: font, fontWeight: 500, fontSize: 44, color: "rgba(254,252,251,0.4)" }}>
            Describe the player...
          </span>
          <div style={{ width: 92, height: 92, borderRadius: 24, background: ORANGE, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
        </div>
      </div>

      {/* home indicator */}
      <div style={{ height: 84, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 340, height: 12, borderRadius: 6, background: "rgba(254,252,251,0.4)" }} />
      </div>
    </AbsoluteFill>
  );
};
