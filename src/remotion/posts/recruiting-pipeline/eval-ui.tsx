import React from "react";
import { colors, fontFamily } from "../../brand";
import { COLOR_HEX, type ColorTag } from "./rp-kit";

/**
 * Evaluation UI: ports of the Grade Entry modal and the Evaluation tab list.
 *
 * Sources:
 *   recruiting-board.html  #gradeEntryModal, #evaluationModal, #evalEvaluationsList
 *   recruiting-board.js    renderEvaluationsList()
 *   recruiting-board.css   .eval-*, .recruiting-board-modal-*
 *
 * App CSS sits at a ~16px root; everything here is scaled roughly 1.4x so it
 * stays legible at phone size in a feed. Static only, no hooks.
 */

// The real modal declares `background: var(--rich-black)` with an orange
// border, but that custom property is never defined anywhere in the frontend
// CSS. For the post these are treated as blue glass instead: a translucent
// blue fill, a light rim, an inner top highlight and a backdrop blur, so the
// navy gradient reads through them. A deliberate departure from the product's
// orange-on-black modal chrome.
const GLASS: React.CSSProperties = {
  background: "linear-gradient(160deg, rgba(30,140,175,0.20) 0%, rgba(3,64,120,0.30) 100%)",
  border: "1px solid rgba(125, 200, 230, 0.28)",
  boxShadow: "0 26px 60px -22px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.14)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};
const DIVIDER = "1px solid rgba(125, 200, 230, 0.18)";

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 17,
      fontWeight: 700,
      color: "rgba(255,255,255,0.7)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      margin: "16px 0 8px",
    }}
  >
    {children}
  </div>
);

/**
 * "Add Grade" modal: 0-100 slider with live readout, the locked 6-swatch
 * palette plus the clear button, and the notes field. `selected` gets the
 * white ring and orange halo that .eval-color-swatch.selected applies.
 */
export const AddGradeModal: React.FC<{
  width: number;
  grade: number;
  selected: ColorTag;
  notes: string;
}> = ({ width, grade, selected, notes }) => (
  <div
    style={{
      fontFamily,
      boxSizing: "border-box",
      width,
      ...GLASS,
      borderRadius: 22,
      overflow: "hidden",
    }}
  >
    <div style={{ padding: "20px 28px", borderBottom: DIVIDER }}>
      <div style={{ color: colors.white, fontSize: 26, fontWeight: 700 }}>Add Grade</div>
    </div>

    <div style={{ padding: "8px 28px 22px" }}>
      <FieldLabel>Score</FieldLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Hand-drawn to match Chrome's accent-color range rendering. */}
        <div style={{ position: "relative", flex: 1, height: 8 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 4, background: "rgba(255,255,255,0.2)" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${grade}%`,
              borderRadius: 4,
              background: colors.accentOrange,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${grade}%`,
              top: "50%",
              width: 22,
              height: 22,
              marginLeft: -11,
              marginTop: -11,
              borderRadius: "50%",
              background: colors.accentOrange,
            }}
          />
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: colors.accentOrange, minWidth: 54, textAlign: "right" }}>
          {grade}
        </div>
      </div>

      <FieldLabel>Color Tag</FieldLabel>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {(Object.keys(COLOR_HEX) as ColorTag[]).map((tag) => {
          const isOn = tag === selected;
          return (
            <div
              key={tag}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: COLOR_HEX[tag],
                border: isOn ? "3px solid #ffffff" : "3px solid rgba(255,255,255,0.2)",
                boxShadow: isOn ? `0 0 0 3px ${colors.accentOrange}` : "none",
                boxSizing: "border-box",
              }}
            />
          );
        })}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: "3px solid rgba(255,255,255,0.2)",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 21,
            fontWeight: 600,
          }}
        >
          ×
        </div>
      </div>

      <FieldLabel>Notes</FieldLabel>
      <div
        style={{
          minHeight: 96,
          background: "rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 11,
          padding: "13px 16px",
          color: colors.white,
          fontSize: 19,
          lineHeight: 1.45,
        }}
      >
        {notes}
      </div>
    </div>

    <div style={{ display: "flex", gap: 15, justifyContent: "flex-end", padding: "18px 28px", borderTop: DIVIDER }}>
      <div
        style={{
          background: "rgba(255,255,255,0.1)",
          color: colors.white,
          border: "1px solid rgba(255,255,255,0.2)",
          padding: "13px 26px",
          borderRadius: 11,
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        Cancel
      </div>
      <div
        style={{
          background: colors.accentOrange,
          color: colors.white,
          padding: "13px 32px",
          borderRadius: 11,
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        Save
      </div>
    </div>
  </div>
);

export type CoachEval = {
  coach: string;
  grade: number;
  colorTag: ColorTag;
  date: string;
  /** Only the expanded row shows its notes blockquote. */
  notes?: string;
};

/**
 * The Evaluation tab: recruit header, tab row, then every coach's grade
 * newest first. One row is expanded to reveal the notes blockquote that the
 * caret toggles in the product.
 */
export const EvaluationPanel: React.FC<{
  width: number;
  recruitName: string;
  recruitLine: string;
  evals: CoachEval[];
}> = ({ width, recruitName, recruitLine, evals }) => (
  <div
    style={{
      fontFamily,
      boxSizing: "border-box",
      width,
      ...GLASS,
      borderRadius: 22,
      overflow: "hidden",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 15, padding: "16px 24px", borderBottom: DIVIDER }}>
      <div
        style={{
          width: 50,
          height: 50,
          minWidth: 50,
          borderRadius: "50%",
          border: `3px solid ${colors.cerulean}`,
          background: "rgba(18,130,162,0.15)",
          color: colors.cerulean,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={27} height={27}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: colors.white, fontSize: 24, fontWeight: 700, whiteSpace: "nowrap" }}>{recruitName}</div>
        <div style={{ color: "rgba(254,252,251,0.6)", fontSize: 17, fontWeight: 500, marginTop: 3 }}>{recruitLine}</div>
      </div>
    </div>

    <div style={{ display: "flex", gap: 26, padding: "0 24px", borderBottom: DIVIDER }}>
      {["Info", "Evaluation"].map((t) => {
        const active = t === "Evaluation";
        return (
          <div
            key={t}
            style={{
              padding: "12px 2px",
              fontSize: 18,
              fontWeight: active ? 700 : 500,
              color: active ? colors.white : "rgba(255,255,255,0.5)",
              borderBottom: active ? `3px solid ${colors.accentOrange}` : "3px solid transparent",
            }}
          >
            {t}
          </div>
        );
      })}
    </div>

    <div style={{ padding: "14px 24px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      {evals.map((e) => (
        <div
          key={e.coach}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 11,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <span
              style={{
                width: 18,
                height: 18,
                minWidth: 18,
                borderRadius: "50%",
                background: COLOR_HEX[e.colorTag],
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            />
            <span style={{ flex: 1, fontWeight: 600, color: "rgba(255,255,255,0.92)", fontSize: 20, whiteSpace: "nowrap" }}>
              {e.coach}
            </span>
            <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.95)", fontSize: 20, minWidth: 36, textAlign: "right" }}>
              {e.grade}
            </span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, whiteSpace: "nowrap" }}>{e.date}</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, width: 16, textAlign: "center" }}>▾</span>
          </div>
          {e.notes ? (
            <div
              style={{
                margin: "11px 0 0 31px",
                padding: "9px 15px",
                borderLeft: "2px solid rgba(255,255,255,0.2)",
                color: "rgba(255,255,255,0.75)",
                fontSize: 17,
                lineHeight: 1.45,
              }}
            >
              {e.notes}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);
