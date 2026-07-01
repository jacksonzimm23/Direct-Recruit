# Height Recognition — drill spec (documentation; not yet built)

> **Status: spec'd, not coded. Flow revised 2026-06-27 (Jackson).** This is the
> second drill on the platform. It is a **static MEASUREMENT, not a timed drill** —
> but the same "trustworthy or nothing" ethos and the **failure → diagnose → fix →
> document** loop from the 5-10-5 apply (see `testing.md` in this folder). It reuses
> the shared engine in `drill_timing/core/`; only this drill's definition + data live
> here. Governance Rules 0-4 in `PLATFORM_SPEC.md` apply (ground truth is a sealed
> exam; never tune against it; version-lock; changelog every change).
>
> **What changed 2026-06-27 (see §2.1):** (1) **No anti-cheat** — the tippy-toe /
> feet-flat check is **removed**; the clip is **front-facing throughout** (no side
> view). (2) The on-head object is a **RULER** (thin/2-D), not a book (3-D, whose
> back edge over-read). (3) The reading line is the **ruler's bottom edge**, not the
> pose head-top keypoint. (4) The whole-body **screenshot is the verification
> record**, not a cheat gate. Full video flow in **§2**.

---

## 1. What it measures

The athlete's **standing height**, read off a real tape/wall measure that is **in
the video frame**, output in **inches** and **ft-in** (e.g. `71.0 in = 5'11"`),
with a saved face-next-to-measurement snapshot and a confidence/verified flag.

The ruler being physically in frame is the whole trick: we don't estimate height
from body proportions or a homography — we **read it off the printed tape**, the
same way a human would. The tape *is* the calibration.

---

## 2. The capture protocol — THE VIDEO FLOW (updated 2026-06-27, Jackson)

> **No anti-cheat for this drill (decided 2026-06-27).** Tippy-toe / feet-flat
> checking is **removed** — there is no INVALID-for-cheating path. The drill simply
> reads a height off the tape. (See §2.1 for what changed and why.)

The operator films **ONE continuous clip**, front-facing the whole time:

1. **Front-facing setup (whole-body frame):** the clip OPENS on a **front-facing
   view** of the athlete standing still. A **vertical measuring tape** (inches; cm
   is a bonus) runs **floor → above the head** positioned to the **athlete's left
   from the camera's perspective** (i.e. on the right side of the frame is the
   athlete, tape just beside them), roughly parallel to the image plane. The
   athlete holds a **rigid RULER flat and level on top of their head with their
   LEFT arm**, the ruler's long axis pointing **toward/across the camera
   (perpendicular to the tape)** so its **bottom edge** reads as a clean horizontal
   line resting on the head.
2. **Whole-body verification screenshot (SS):** while the **entire body is in
   frame** (head-to-feet, tape and ruler both visible), the system **auto-captures
   a screenshot** — this SS is the **verification record** a human can look at
   (the person, the tape, the ruler-on-head all in one image). It is evidence, not
   a cheat-gate.
3. **Move IN to the face/read:** the cameraman then **moves toward the athlete's
   face** to get a **close, high-resolution view of the read zone** — the **bottom
   edge of the ruler** against the **tape on the left**, with the tape's ticks and
   numbers legible at this distance.
4. **Read:** the system establishes the tape calibration (pixels↔inches from the
   tape's ticks/numbers) and reads the **tape value at the lowest point of the
   ruler's bottom edge** (the underside resting on the head) — that value **is** the
   height. It saves a snapshot of the read zone for the record.

So the single clip carries: the **whole-body SS** (the verification record) and
the **close read** (the actual measurement at the ruler's bottom edge).

### 2.1 Why a RULER, and why no tippy-toe check (changed 2026-06-27, Jackson)

- **RULER, not a book (changed).** The earlier prototype put a *book* on the head.
  A book is **3-D**: from the camera, its **back edge** sits lower than its front
  edge by perspective, so reading "the lowest book pixel" would catch the back edge
  and make the athlete read **shorter** than they are. A **ruler laid flat/longways
  horizontal** is effectively **2-D / thin**, so there is no deep back edge to
  over-read — the **bottom edge resting on the head** is the height line, cleanly.
- **The ruler is the head-leveling tool**, same intent as the old straight-edge:
  it gives a **flat, hair-independent top-of-head line** so voluminous hair can't
  inflate the reading. (The pose "top of head" keypoint is **no longer** the
  reading line — it can sit on hair; the ruler's bottom edge replaces it.)
- **Tippy-toe / feet-flat anti-cheat REMOVED.** Per Jackson (2026-06-27) this drill
  will **not** check for tippy-toes (or any cheat). The whole-body SS exists as a
  human-viewable record, not an automated gate. Removed: the `TIPPY_TOES` and
  `FEET_NOT_VISIBLE` reject codes and the side-view requirement (the clip is
  **front-facing throughout** now — no side view at all).

---

## 3. v1 SCOPE (updated 2026-06-27) — ruler bottom-edge reading line

- **v1 reading line = the RULER's bottom edge** (the underside resting on the head),
  read at its **lowest point**. The tape value at that line is the measurement.
  This replaces the old "pose top-of-head keypoint" reading line.
- **Pose's role is now only to LOCK/find the athlete** (the shared engine: who is
  being measured, ignore bystanders). Pose does **not** define the reading line in
  v1. *(Optional future cross-check: compare the ruler-bottom read to the pose
  head-top and flag a large disagreement — deferred, not in v1.)*
- **Why the ruler is the leveling device:** a rigid ruler flat on the head gives a
  **hair-proof, flat top-of-head line** — the thing the old "straight edge on the
  head" idea was for, now realized as a thin 2-D ruler (see §2.1 for why 2-D beats a
  3-D book).

---

## 4. How the tape is READ (decided 2026-06-26: OCR + tick detection)

Read the **printed gradations and numbers** on the tape — the true "read the
ruler" approach:

- Detect the tape in frame (a long straight measuring strip near the athlete).
- Detect its **tick marks** (the regularly-spaced gradation lines) and **OCR the
  printed numbers** (e.g. "60", "61"…) to anchor absolute values.
- Establish **pixels-per-inch** from the known tick spacing (1 inch / 1 cm apart)
  and the OCR'd numbers — this is the calibration, analogous to the 5-10-5's
  yard-line ruler but printed and absolute.
- Find the tape value at the **ruler's bottom-edge line** (§3) by reading the
  gradation there (or interpolating between the two nearest legible ticks/numbers).
- **Self-validation (free, like the yard-line 5-yd check):** the OCR'd numbers must
  increase by the right amount per tick (e.g. consecutive inch numbers ~1 inch
  apart in pixels after accounting for the tape angle). If the reconstructed
  spacing is inconsistent, the tape read is untrusted → reject.

> **Make-or-break dependency (same lesson as the faint yard lines):** the tape's
> ticks and numbers must be **legible at the filming resolution.** Film close and
> high-res on the face/tape segment, or the OCR/tick read fails. This is the
> primary thing to validate on real footage.

---

## 5. Output (updated 2026-06-27)

A result record containing:
- `height_in` — primary measurement, inches (e.g. `71.0`)
- `height_ft_in` — formatted (e.g. `5'11"`)
- `height_cm` — optional (the tape shows cm too) *(stretch; inches is primary)*
- `face_snapshot` — saved snapshot of the read zone (ruler bottom edge against the
  tape) for the record. *(The whole-body verification SS from §2 step 2 is saved
  too — the human-viewable record that this was a real, full-body capture.)*
- `confidence` + `status` (VERIFIED / REJECTED) + `reason_code`
- provenance: `engine_version`, tape-calibration data (pixels-per-inch, the
  reference numbers used), frame indices of the whole-body SS and the reading frame.

> **VERIFIED vs REJECTED (updated 2026-06-27): no anti-cheat.** A height result is
> **VERIFIED** when the tape calibrates cleanly AND the ruler's bottom-edge line is
> read successfully (and a whole-body SS was captured as the record). There is **no
> cheat-based INVALID** — REJECTED happens only when the system **can't read**, never
> because it caught the athlete cheating. The reject codes below are all
> "couldn't-read" failures (fail loud, never guess a number).

### Reject reason codes (height-specific — fail loud, never guess)
- `TAPE_NOT_FOUND` — no measuring tape detected in frame.
- `TAPE_UNREADABLE` — ticks/numbers not legible enough to calibrate (resolution).
- `TAPE_CALIBRATION_FAILED` — reconstructed tick spacing inconsistent (bad read).
- `RULER_NOT_FOUND` — the on-head ruler / its bottom edge can't be located.
- `ATHLETE_NOT_FOUND` / `IDENTITY_UNCERTAIN` — shared athlete-lock failures.
- *(REMOVED 2026-06-27)* `TIPPY_TOES`, `FEET_NOT_VISIBLE` — no tippy-toe/feet-flat
  anti-cheat anymore (see §2.1). `HEAD_TOP_NOT_FOUND` is superseded by
  `RULER_NOT_FOUND` (the ruler bottom edge, not the pose head-top, is the line).
  > *Note:* the reject codes still enumerated in this folder's `__init__.py` predate
  > this change; aligning the code to this list is a future build step (docs lead).

---

## 6. What it REUSES from the shared engine (`drill_timing/core/`)
- **video.py** — VFR-safe frame + true-timestamp ingest.
- **detect.py / track.py / athlete.py** — find + lock the athlete (the person being
  measured), so we read the right person and ignore bystanders.
- **pose.py** — keypoints; used **only to lock/find the athlete** in v1 (the reading
  line is the RULER's bottom edge, §3, NOT a pose keypoint). The shared pose backend
  is **MediaPipe** (BLUEPRINT joints, PLATFORM_SPEC **§5.V**); its head/crown joints
  are available for an optional future cross-check but do not define the v1 read.
- **report.py / result.py** — annotated output (the shared **BLUEPRINT** visual —
  glowing outline + overlay + white skeleton, §5.V; height draws no skeleton of its
  own, it inherits this) + the result schema (height fields added) + per-frame CSV.
- **config.py / failure_log.py** — config loading + the failures.jsonl loop.
- **tools/label.py, tools/score.py** — labeling + scoring, `--drill height`.

## 7. What's NEW for height (built in this folder + maybe shared core)
- `__init__.py` — the height `DrillDefinition` (self-registers via `@register_drill`).
- **Tape detection + OCR/tick reading** — new perception (likely a new
  `core/tape.py` if it's reusable, or a height-local module). OCR needs a library
  (e.g. an OpenCV-friendly OCR) — to be decided at build time, pinned in requirements.
- **On-head RULER detection** — find the rigid ruler resting flat on the head and
  locate its **bottom-edge line** (lowest point) as the reading line. Detect it as a
  thin straight rigid object on the head silhouette, **not** by color (§ generalize).
- **Two clip moments (no pan to a side view):** the clip is **front-facing
  throughout** — a **wide / whole-body window** (auto-capture the verification SS)
  followed by a **close / read window** (tape + ruler bottom edge legible). The
  system picks the wide frame for the SS and the close frame for the read; there is
  **no side-view window** anymore (tippy-toe check removed).

## 8. Honest hard parts (name them now, like we learned to)
1. **Tape legibility at video resolution** — the #1 risk; OCR/ticks need a crisp,
   close shot. Validate on real footage before trusting any number.
2. **Locating the ruler's bottom edge cleanly** — must land on the underside resting
   on the head (the height line), not the ruler's top edge, a printed mark, or the
   hair below it. Replaces the old "head-top keypoint on hair" bias with a ruler we
   must segment precisely.
3. **Auto-picking the two frames** — the wide frame for the whole-body SS and the
   close frame for the read, from one continuous front-facing clip.
4. **Tape angle/perspective** — if the tape isn't perfectly vertical/parallel to
   the image plane, pixels-per-inch varies along it; the per-tick calibration must
   account for that (or require the tape reasonably square to the camera).
5. **Camera level (perspective ~1 in)** — scratch tests showed camera height alone
   moved a read ~1 inch. A camera-level/face-level framing aids accuracy; not a
   reject gate (no anti-cheat) but worth guiding the operator toward.

## 9. To build (when ready)
Plan it as its own phase (research → design → approve → build), same as every
5-10-5 phase. Run/verify like any drill:
```
python -m drill_timing.run --video drill_timing/drills/height/footage/<clip>.mp4 --drill height
python tools/score.py --drill height --result drill_timing/drills/height/debug_out/<clip>_result.json
```
Ground truth for scoring = each clip's **known true height** (measured by hand),
stored in this folder's `ground_truth.json` (sealed exam, Rule 0).
