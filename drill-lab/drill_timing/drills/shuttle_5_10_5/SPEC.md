# Drill Spec — 5-10-5 Pro-Agility Shuttle

> **Drill-specific spec.** The shared engine, operating principles, governance
> rules (Rule 0-4), the phase build plan (Phase -1 → 9), tech stack, and config
> schema live in the top-level **`PLATFORM_SPEC.md`** and apply to every drill.
> This file covers ONLY what's specific to the 5-10-5 shuttle. Its test runbook +
> dated results are in this folder's **`testing.md`**; tuning history in
> **`CHANGELOG_TUNING.md`**; sealed ground truth in **`ground_truth.json`**.
>
> **Status (2026-06-26): paused** pending higher-resolution footage. The pipeline
> machinery works end-to-end (ingest → sticky athlete-lock → pose → onset →
> yard-line detection), but the single 396×480 TikTok dev clip is below the
> signal-quality floor for PRECISE measurement (onset ±2, yard-line calibration,
> total time). Resume when footage framed per `PLATFORM_SPEC.md` Section 8 exists.

## Drill definition

`drills/shuttle_5_10_5/__init__.py` implements the shared `DrillDefinition`
interface (`drills/base.py`) and self-registers via `@register_drill`
(name `shuttle_5_10_5`; aliases `shuttle`, `5-10-5`, `pro_agility`).

**Layout:** three lines 5 yards apart — **L (left)**, **C (center/start)**,
**R (right)**. Athlete straddles **C** in a stance.

**Canonical sequence** (athlete may open left or right; detect direction from the
first onset):
1. **Onset @ C** → clock starts (committed first step toward first line).
2. Sprint **5 yd** to first line (say **R**), **touch** (reversal #1).
3. Sprint **10 yd** across to the far line (**L**), **touch** (reversal #2).
4. Sprint **5 yd** back **through C** → clock stops when torso crosses **C**.

**Total distance 20 yd. Expected signature:** onset → reversal → reversal → final
center-cross. **Exactly two reversals.** ≠2 clean reversals, or touches not near
the detected outer lines → reject (`BAD_EVENT_SEQUENCE`).

**Splits to report:** C→first touch (5), first→second touch (10), second→finish
(5), and total.

**Direction handling:** auto-detect initial direction; mirror logic so left-open
and right-open reps both work.

**Yard-calibrated validation (per Phase 4):** the two turn lines must be the yard
lines ~**5 yards** either side of center; **each touch must be made with a HAND —
the lowest fingertip must reach its turn line within `touch_tolerance_yd`
(fingers count; a foot at the line does NOT count); a valid hand touch is required
at BOTH turn lines**; the finish requires the torso to fully **cross** the center
line; reconstructed total path ~**20 yards**. Any failure → matching Phase 4 reject.

> **HAND-TOUCH RULE (non-negotiable):** total time is onset → finish-cross only,
> but the rep **does not count** unless the athlete touches **both** turn lines
> **with a hand** (fingertips count). Foot-only touches are invalid. Reach point =
> hand/fingertip keypoint, never the foot (`anti_cheat.touch_keypoint: hand`).

**Drill-specific rejects:** wrong number of reversals; a touch that doesn't reach
the line **with a hand** in real yards, **including a foot-only touch**
(`SHORT_TOUCH`); turn lines not ~5 yd from center (`BAD_GEOMETRY`); athlete leaves
frame during a touch; final cross never detected (`NO_FINISH_CROSS`); total
distance short (`DISTANCE_SHORT`).

## Run it
```
python -m drill_timing.run --video drill_timing/drills/shuttle_5_10_5/footage/<clip>.mp4 --drill shuttle_5_10_5
python tools/score.py --drill shuttle_5_10_5 --result drill_timing/drills/shuttle_5_10_5/debug_out/<clip>_result.json
```

## LEARNINGS (shuttle-specific)
- See `testing.md` (this folder) for the full dated build/test log and
  `PLATFORM_SPEC.md` Global Learnings for cross-phase insights. Summary of the
  shuttle's known limits on the current dev clip: athlete-lock works (drill-likeness
  scoring beats the bystander); pose stays on the athlete through the touch; but
  onset (no clean signal) and yard-line calibration (faint lines) both need
  higher-res footage to validate accuracy.
- *(append shuttle-specific learnings here)*
