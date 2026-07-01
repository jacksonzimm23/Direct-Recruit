# Tracking & Timing — engineering standard + the MediaPipe-ROI backbone

> **Read this before touching any perception, tracking, or timing code.** It captures
> (1) the CODING STANDARD all tracking/timing work must meet — the level the Fable-5
> `40-test` prototype set and that we now hold every drill to — and (2) how the new
> MediaPipe-first ROI tracking backbone is built and how to work on it. It complements
> `PLATFORM_SPEC.md` (the shared engine + governance) and each drill's `SPEC.md`.

---

## 1. The coding standard (non-negotiable for tracking/timing)

The 40-test tracker was good because of *engineering discipline*, not luck. Every
tracking/timing change must hold to the same bar:

1. **Separate the live signal from the rendered view.** The honest per-frame detection
   flag (`locked_flags`) and the kinematics signal NEVER get inflated by cosmetics.
   Fade-hold, smoothing-for-display, and "carry the last good frame" are RENDER-only —
   they must not touch the number. (40-test invariant: draw on the captured frame, not
   the advanced one; the pose pill reports the *honest* state even while the outline
   fades.)
2. **Real timestamps, never frame index.** All timing is by true per-frame timestamps
   (`compute_motion`, continuity, VIDEO-mode MediaPipe). VFR clips are the norm. Feeding
   fixed steps makes the temporal filter lag a sprinter — a real bug we avoid by design.
3. **Follow the athlete; don't make him fill the frame by luck.** A far/small figure is
   zoomed into via the ROI so the model sees detail. Detection quality must not depend on
   how the operator framed it.
4. **Identity is sticky; would rather coast than swap.** Lock an identity, gate every
   candidate against a believable jump + scale change + (where available) appearance, and
   on doubt return a MISS (None) — never hand the lock to a bystander. Losing track for a
   few frames is recoverable; timing the wrong person is not.
5. **Pick the DRILL PERFORMER, not "whoever moved/whoever is biggest."** Use the
   drill-likeness signal (`select_athlete`) to choose WHO; size/centrality are weak
   tie-breakers only.
6. **Fail loud, never guess (Operating Principle 3).** Low confidence / can't lock / can't
   calibrate → a structured REJECT with a machine reason code, never a fabricated number.
7. **Config-driven, not hardcoded (Principle 7).** Every threshold lives in `config.yaml`.
   Tuning = editing config, not code. No magic numbers in logic.
8. **Athlete-agnostic (Principle 9).** Normalize to the athlete's own scale (body-heights,
   yards) so a 5'6" guard and a 6'4" lineman, a burner and a grinder, all time correctly.
9. **Every module ships a deterministic `_self_check()`** that runs with NO ML and NO clip
   (`python -m drill_timing.core.<mod>`). Pure geometry/logic is proven before it ever
   touches a model. This is how `roi`/`selection`/`continuity` were validated up front.
10. **Two-pass: ML runs ONCE (Pass 1), render is ML-free (Pass 2).** Cache per-frame
    boxes/keypoints/masks in Pass 1; Pass 2 only draws. Never re-run inference to render.
11. **Always inspect the annotated video, not just the number.** The wrong-person lock and
    the vanishing-touch skeleton were both caught ONLY on the video. A good `detection_rate`
    on the wrong person looks fine in the metrics.
12. **Swappable backends with a deterministic rollback (governance).** A new perception path
    is a config option beside the validated one; you never delete the old path. Default
    doesn't flip until the new one is A/B-proven on held-out footage (Rules 1–3) +
    `CHANGELOG_TUNING.md` + Jackson's sign-off.
13. **Determinism (Rule 4).** Seed `random`/`numpy`/`torch` before inference; one fresh
    tracker (and one increasing VIDEO timestamp clock) per clip; record the engine version.
14. **Ground truth is a sealed exam (Rule 0).** The timing path never reads `ground_truth.json`;
    only `tools/score.py` does, after a blind result exists.

If a change can't meet these, it isn't done — it's scaffolding.

---

## 2. The two tracking backbones (`tracker.backend`)

Selected in `config.yaml` under `tracker.backend`. Both produce the **identical
downstream contract** (below), so everything after tracking is shared and unchanged.

### `mediapipe_roi` (DEFAULT — the adopted convention)
The ported 40-test method is the engine's person-tracking convention (Jackson's call,
2026-06-29). It is the default and the path we build on. **Two-stage:**

- **Stage A — WHO (reused, unchanged):** YOLO+ByteTrack → `build_tracks` → `select_athlete`
  picks the drill performer's identity once, over whole-track aggregates (rest→explode +
  traversal + reversals). This is smarter at "which person is doing the drill" than any
  per-frame size/low heuristic, so we keep it. Its output + the HSV fingerprint become an
  **anchor** (`build_anchor`).
- **Stage B — TRACK (new):** `MediaPipeRoiTracker` runs MediaPipe `PoseLandmarker` in VIDEO
  mode (multi-pose + seg masks) on a **digital-zoom ROI** that follows the athlete with
  velocity-lead. Per frame, `RunnerSelector.choose` locks the athlete among the candidates,
  **biased toward the Stage-A anchor** (so a cold re-acquire re-locks the *same* person, not
  a fresh big/low figure). One MediaPipe pass yields landmarks AND the mask, so the separate
  pose/seg step is SKIPPED for this path (Decision B). Fingertips + derived head_center are
  filled by reusing `MediaPipePose`'s helpers.

**Why two-stage:** keep the engine's hard-won "pick the drill performer" intelligence
(Stage A) AND gain the 40-test's per-frame zoom + sticky-lock robustness (Stage B).

### `yolo_bytetrack` (ROLLBACK ONLY — not for new work)
The engine's pre-2026-06-29 path: YOLO person-detect → ByteTrack IDs → `select_athlete`
→ `run_lock` (LOCKED/COAST) → a SEPARATE MediaPipe pose + YOLOv8-seg on the locked box.
Kept as a deterministic rollback (one-line `tracker.backend` switch) in case a clip type
ever regresses under `mediapipe_roi`. Don't build new tracking on it.

---

## 3. The downstream contract (the invariant every tracker must emit)

A tracker produces, per frame, in **FULL-FRAME pixels**:

| field | type | meaning |
|---|---|---|
| `boxes_per_frame[i]`  | `TrackedBox \| None` | locked athlete box (carries `track_id`) |
| `locked_flags[i]`     | `bool`               | HONEST live detection this frame (pre-fade) |
| `kpts_per_frame[i]`   | `Keypoints \| None`  | BLUEPRINT joints, full-frame px (`pose.py`) |
| `masks_per_frame[i]`  | `np.ndarray \| None` | full-frame **uint8 0/255** person mask |

From there the engine is shared and unchanged: `compute_motion(coms, body_heights, ts, cfg)`
→ `detect_onset(...)` → `calibrate_clip(...)` → Pass-2 render (`AnnotatedVideoWriter`,
`PerFrameCSVLogger`) → `write_result_json`. **If your tracker emits those four lists in
full-frame px, the back half of the engine just works.**

ROI→full-frame mapping (the crucial transform): a normalized landmark `(nx, ny)` in a crop
maps to `fx = roi.x + nx*roi.w`, `fy = roi.y + ny*roi.h` (uniform because the crop keeps
video aspect).

---

## 4. Module map (where the tracking/timing logic lives)

| concern | file | key API (signatures) |
|---|---|---|
| digital-zoom crop | `core/roi.py` | `crop_for_detection(frame, roi, detect_max, max_upscale) -> (crop, scale, (ox,oy))`; `RoiTracker(fw,fh,cfg).current()/next_probe()/update(bbox\|None)` |
| per-frame choose + lock | `core/selection.py` | `bbox_of(lm_norm, roi)`, `is_eligible(box, fw, fh, scfg)`, `RunnerSelector(anchor, fw, fh, cfg).choose(cands, frame_idx)`, `build_anchor(track, fingerprint, n) -> Anchor` |
| MediaPipe-ROI backbone | `core/tracker_mediapipe.py` | `MediaPipeRoiTracker(cfg).track(frames_bgr, timestamps, anchor) -> TrackerResult` |
| pose-continuity metric | `core/continuity.py` | `verify_continuity(timestamps, locked_flags, cfg) -> Coverage` |
| WHO selection + lock (Stage A / rollback) | `core/athlete.py` | `select_athlete(...)`, `compute_fingerprint(...)`, `run_lock(...)` |
| pose backends + joints | `core/pose.py` | `Keypoints`, `BLUEPRINT_NAMES`, `_MP_POSE_IDX`, `MediaPipePose` (its `_fill_head_center`/`_fill_fingertips` are reused by the tracker) |
| kinematics | `core/kinematics.py` | `compute_motion(coms, body_heights, timestamps, cfg) -> Motion` |
| onset | `core/events.py` | `detect_onset(speed, accel, valid, cfg) -> int\|None` |
| orchestration | `run.py` | `_perceive(src, cfg, is_measurement)` — branches on `tracker.backend` |
| capability probe | `tools/mp_capability_probe.py` | confirms Python MediaPipe VIDEO + multi-pose + seg-mask |

---

## 5. How to run, validate, and A/B

```powershell
# self-checks (no ML, no clip) — must pass before anything else
.venv\Scripts\python.exe -m drill_timing.core.roi
.venv\Scripts\python.exe -m drill_timing.core.selection
.venv\Scripts\python.exe -m drill_timing.core.continuity
.venv\Scripts\python.exe -m drill_timing.core.tracker_mediapipe

# end-to-end on a clip (default backend = yolo_bytetrack)
.venv\Scripts\python.exe -m drill_timing.run --video <clip> --drill shuttle_5_10_5

# run the new backbone: use a config with tracker.backend: mediapipe_roi
.venv\Scripts\python.exe -m drill_timing.run --video <clip> --drill shuttle_5_10_5 --config <cfg-with-mediapipe_roi>
```

**A/B before flipping the default:** run BOTH backends on the same clips, compare
`detection_rate`, `pose_coverage`, lock stability (0 identity swaps on the annotated
video), onset/event accuracy on a dev/held-out split (`tools/score.py`). Ship `mediapipe_roi`
as default only if held-out ≥ the old path AND the full regression suite passes —
`CHANGELOG_TUNING.md` entry + Jackson approves.

**Verified state (2026-06-29):** capability probe ALL PASS in the 3.12 venv; all module
self-checks pass; both backends run end-to-end on a real clip (`mediapipe_roi`:
detection_rate 1.0, pose_coverage 1.0, 0 gaps). **`mediapipe_roi` is now the adopted
default** (Jackson's call); `yolo_bytetrack` is the rollback only. Still validating
`mediapipe_roi` on varied real footage (dev/held-out A/B) — as the default while we do.
See `PLATFORM_SPEC.md` Global Learnings 2026-06-29.

---

## 5b. FIELD-LINE / TICK TRACKING — the field-gated white-mask overlay

> The **player-INDEPENDENT** counterpart to the athlete tracker. The athlete tracker
> follows the runner; this overlay pins to the **field**. It lives BROWSER-side
> (`frontend/drill-lab/shuttle-test/`) and was **removed from the Python engine** — the
> old yard-line code (`core/lines.py`, `core/calibration.py`, `config.yaml`
> `lines:`/`field_calibration:`, `report.draw_lines`, `result.py`
> `NOT_A_LINED_FIELD`/`CALIBRATION_FAILED`, `run.py` pass-1d) was DELETED. The engine no
> longer does any yard-line detection. Same coding standard (§1), different subject.

**The overlay IS a per-frame mask, not a tracked model.** The reference clip (`Shuttle1.MOV`,
1280×720 portrait shot sideways) is **near-static** — total horizontal camera pan across the
whole clip ≈ 86 full-frame px (~0.18 px/frame). So there is **no pan compensation and no
temporal tracker**: the field-gated white-paint mask, computed fresh each frame, already sits
exactly on the paint. (An earlier design estimated the pan and pan-locked/accumulated oriented
segments; it was removed — it solved a non-problem here and only smeared the overlay.)

### The per-frame pipeline (proc width ~360, mapped back to full-frame px)

1. **FIELD region — `detectField(imgData) -> { mask, topRow }`.** Does NOT assume green:
   samples the dominant surface H/S/V from a lower-center patch, keeps pixels near that
   surface hue, cuts the brighter sky (`sky ceiling = surfaceV + margin`). Then a **BIG
   morphological CLOSE** (`close_px` ≈ 15) bridges the paint-line gaps so the field becomes
   one solid blob, `keepLargestComponent` drops the sky/track/bleacher blobs, and
   **`fillHoles`** (flood the background from the border; enclosed holes = field) turns the
   paint-line holes back into field. Result: a field mask that **CONTAINS the on-field paint**
   (so the AND keeps it) and **EXCLUDES the sky / far track / bleachers**.
2. **WHITE within the field — `whiteMask(imgData, fieldMask) -> mask`.** White paint (low S,
   high V) AND-ed with the field region, then a light `morphOpen` for turf speckle. Two
   rejections for free: the bold **BLUE** soccer/lax line and the **ORANGE** mid-field line
   are dropped **by COLOR**; the **sky / clouds / far track** (a big solid off-field white
   blob, ~9k px/frame) is dropped **by the FIELD gate**. This mask is `det.whiteMask` — the
   whole overlay.
3. **Overlay = the white mask, recolored.** `buildWhiteOverlayBitmap(det, cfg)` recolors
   every `det.whiteMask` pixel BLUE — it hugs the real paint shape (NOT straight strokes),
   pre-rendered once per frame into an `ImageBitmap` so Play is smooth. The "pink" Debug mask
   and the blue overlay are the SAME `det.whiteMask` — blue is pink minus color.

### Module / API map

| concern | file | key API |
|---|---|---|
| field region (close + largest + fill) | `yardLines.js` | `detectField(imgData, w, h, cfg) -> {mask, topRow}` |
| white-within-field mask | `yardLines.js` | `whiteMask(imgData, fieldMask, w, h, cfg)` |
| one-call detect | `yardLines.js` | `detectYardLines(imgData, w, h, scale, ox, oy, cfg) -> { fieldMask, whiteMask, fieldTopRow, ... }` |
| deterministic proof | `yardLines.js` | `_selfCheck(cfg)` (DOM-free, runs in Node) |
| render | `yardLinesRender.js` | `buildWhiteOverlayBitmap(det, cfg)` (white mask → BLUE overlay), `buildDebugBitmap(det, cfg)` (field tint + white mask) |
| two-pass controller | `yardLinesController.js` | drives the "Yard Lines" subtab: Pass 1 seek-every-frame detect + cache; Pass 2 blit |
| config (no magic numbers) | `config.js` | `SHUTTLE_CONFIG.yardLines` |

**Config knobs (`SHUTTLE_CONFIG.yardLines`):** `detect_proc_width`;
`field.{hue_tol, sky_val_margin, close_px, open_px, fill_holes, ...}` (raise `close_px` /
lower `hue_tol` if the sky or track leaks); `white.{max_sat, min_val, open_px}`;
`render.{overlay_rgb, overlay_alpha}`; `debug` colors.

### How it honors the same 14-point standard (§1)

- **Rule 1 (honest signal ≠ render):** `det.whiteMask` is the honest per-frame signal; the
  blue recolor is RENDER-only (a 1:1 stamp) and never edits the mask.
- **Rule 6 (fail loud, never guess):** white-within-field rejects BLUE/ORANGE by color and
  sky/track by the field gate rather than inventing lines; it never fabricates paint.
- **Rule 7 (config-driven):** every threshold lives in `SHUTTLE_CONFIG.yardLines`; tuning =
  editing config, no magic numbers in logic.
- **Rule 9 (deterministic `_selfCheck`):** DOM-free, runs `node`-side with no clip — asserts
  field excludes sky, blue/orange rejected by color, **white ⊆ field** (no off-field/sky
  pixel is ever lit), and the on-field lines/ticks ARE covered (the big-close + fillHoles
  gate doesn't eat real paint).
- **Rule 10 (two-pass, inference once):** `yardLinesController` runs detection in Pass 1 and
  caches the pre-rendered blue + debug `ImageBitmap`s; Pass 2 (Play) only blits — never
  re-detects to render.
- **Rule 11 (always inspect the overlay, not the number):** the Debug toggle draws field
  tint (green) + white mask (magenta); the blue overlay is literally that magenta mask
  recolored, so the coverage you tune is the coverage you ship.

### How to run, validate, A/B

```
# Browser: serve frontend/ over http:// (Live Server — host must be localhost)
#   → 5-10-5 Testing screen → "Yard Lines" tab → Analyze Lines → Play
#   → toggle "Debug masks" to see field / white-mask and tune the knobs:
#     white.{max_sat,min_val,open_px} (paint), field.{close_px,hue_tol} (off-field cut)

# Headless (yardLines.js is DOM-free): import { detectYardLines, _selfCheck }
#   from config.js pass SHUTTLE_CONFIG; run _selfCheck(cfg) or feed exported RGBA frames to
#   detectYardLines(img, w, h, scale, ox, oy, cfg) -> { fieldMask, whiteMask, ... }.
```

**Verified state (2026-07-01):** headless in Node — `Shuttle1.MOV` (1280×720
portrait-shot-sideways, ~30 fps, camera near-static), all 206 frames: overlay strictly
**⊆ field on every frame (0 off-field px)**, steady coverage (no flashing), the big sky blob
removed; `_selfCheck()` ALL PASS (field excludes sky, blue/orange rejected, white ⊆ field,
on-field paint covered). Visually confirmed on frames 40/120/200: sky gone, the BLUE
distractor line stays bare, blue hugs the white paint. **A/B when tuning:** compare Debug
(pink) vs blue overlay on the same frame — they are the same mask, so coverage on the paint
and zero blue off the field is the whole check.

---

## 6. Footage you need (to make a drill great)

Per-drill `footage/` is gitignored (local-only). Drop clips in
`drill_timing/drills/<drill>/footage/`. See that folder's `README.md` for the per-drill
shopping list, and `PLATFORM_SPEC.md` Section 8 for the full labeled-set spec (clean /
crowded / too-close / too-far / bad-pan / left/right-open / invalid; diverse athletes;
dev vs held-out split). Hand-label into `<drill>/ground_truth.json` with `tools/label.py`
(the ONLY ground-truth writer; sealed-exam Rule 0).
