"""Tape-legibility probe — the make-or-break feasibility check for the HEIGHT drill.

The height drill reads standing height off a real measuring tape that is physically
in the frame (drills/height/README.md). The README flags ONE risk above all others,
three separate times: **is the tape legible at the filming resolution?** If the
tape's tick marks and printed numbers aren't crisp enough, the OCR/tick read fails
and there is no measurement — full stop. The project already paid for the matching
lesson on the 5-10-5 (faint yard lines on a low-res clip were below the signal
floor); this probe exists so we learn the same thing about the tape in ONE image,
*before* building the whole tape-OCR/calibration stack on top of footage that can't
support it.

WHAT IT DOES (cv2 + numpy only — no OCR dependency required):
  Point it at a still image (a phone screenshot of the face/tape segment, or a
  frame), optionally with a crop box around the tape strip. It measures whether the
  regularly-spaced gradation TICKS are resolvable, and reports a verdict:
    * LEGIBLE          — a strong, regular tick comb was found; spacing is consistent
                         (this is the README's free self-validation: ticks ~1 unit
                         apart in a consistent pixel spacing). Calibration is viable.
    * MARGINAL         — ticks found but spacing is noisy / the comb is weak. Film
                         closer / higher-res before trusting a number.
    * TAPE_UNREADABLE  — no regular tick comb resolvable at this resolution/framing.
                         This is an honest fail-loud, exactly the reject code the
                         drill will emit (drills/height: TAPE_UNREADABLE).

  It is INTENTIONALLY standalone and read-only: it touches no pipeline code and no
  ground truth. It does not produce a height. It answers one question — *can this
  tape be read at all?* — and saves an annotated image so a human can SEE the ticks
  it found (the platform ethos: always look at the picture, not just the number).

OCR NOTE: number-OCR (anchoring absolute inches) is a SEPARATE axis and a separate
dependency the README leaves "to be decided at build time." This probe reports
whether an OCR engine is importable but does NOT require one — tick resolvability is
the thing that gates everything, and it needs only OpenCV. Pin an OCR lib later,
once a real clip proves the ticks are there to read.

Run (from repo root):
    python tools/tape_probe.py --image path/to/face_tape_still.png
    python tools/tape_probe.py --image frame.png --crop X,Y,W,H   # box the tape strip
    python tools/tape_probe.py --self-check                       # synthetic-tape unit test
"""

from __future__ import annotations

# Run as a bare script as well as a module.
if __package__ in (None, ""):
    import pathlib
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np


# --------------------------------------------------------------------------- #
# Verdict
# --------------------------------------------------------------------------- #
LEGIBLE = "LEGIBLE"
MARGINAL = "MARGINAL"
TAPE_UNREADABLE = "TAPE_UNREADABLE"


@dataclass
class TapeProbeResult:
    verdict: str
    reason: str
    n_ticks: int = 0                      # number of gradation ticks detected
    median_spacing_px: Optional[float] = None   # px between adjacent ticks
    spacing_cv: Optional[float] = None    # coefficient of variation of spacing (lower = more regular)
    tick_strength: Optional[float] = None  # mean prominence of the comb peaks (contrast)
    orientation: Optional[str] = None     # "vertical" | "horizontal" tape (long axis)
    crop_wh: Optional[tuple] = None       # (w, h) of the analyzed region, px
    ocr_available: Optional[str] = None   # which OCR engine is importable, or None
    tick_positions: list = field(default_factory=list)  # px positions along the long axis

    def as_dict(self) -> dict:
        d = dict(self.__dict__)
        # keep the JSON compact: drop the full tick list from the summary print
        d.pop("tick_positions", None)
        return d


# --------------------------------------------------------------------------- #
# Core: find the regular tick comb along the tape's long axis
# --------------------------------------------------------------------------- #
def _detect_ocr_engine() -> Optional[str]:
    """Report which OCR engine is importable (informational only — not required)."""
    import importlib
    for mod in ("easyocr", "pytesseract", "paddleocr"):
        try:
            importlib.import_module(mod)
            return mod
        except Exception:
            continue
    return None


def analyze_tape(gray: np.ndarray, cfg: dict | None = None) -> TapeProbeResult:
    """Given a grayscale crop that should contain the tape strip, decide whether a
    regular tick comb is resolvable.

    Method (classical, robust, OCR-free):
      1. Decide the tape's long axis (vertical vs horizontal) from the crop's aspect.
         Ticks run PERPENDICULAR to the long axis (a tape is long+thin; ticks are the
         short cross-marks spaced along its length).
      2. Collapse to a 1-D projection profile ALONG the long axis: average the
         gradient magnitude across the short axis at each long-axis position. Ticks
         show up as regularly spaced peaks in this profile.
      3. Find peaks; the README's free self-validation is that the spacing between
         consecutive ticks is CONSISTENT (a real tape's marks are evenly spaced). We
         measure the spacing's coefficient of variation (CV) and the peak prominence.
      4. Verdict from (#ticks, spacing regularity, peak strength).
    """
    cfg = cfg or {}
    min_ticks = int(cfg.get("min_ticks", 6))          # need a real comb, not 2-3 marks
    cv_legible = float(cfg.get("spacing_cv_legible", 0.18))   # <=18% spacing variation -> regular
    cv_marginal = float(cfg.get("spacing_cv_marginal", 0.35))  # <=35% -> noisy but present
    strength_floor = float(cfg.get("tick_strength_floor", 6.0))  # min mean peak prominence

    h, w = gray.shape[:2]
    vertical = h >= w  # tape long axis is vertical if the crop is taller than wide

    # --- gradient magnitude (ticks are edges); along-axis projection profile ---
    # For a vertical tape, ticks are ~horizontal marks: their vertical gradient (dy)
    # is strong, and we project along Y (the long axis) by averaging across X.
    if vertical:
        grad = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))  # dy
        profile = grad.mean(axis=1)   # one value per row (Y position)
        long_len = h
        orientation = "vertical"
    else:
        grad = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))  # dx
        profile = grad.mean(axis=0)   # one value per column (X position)
        long_len = w
        orientation = "horizontal"

    # detrend (remove slow lighting gradient) so peak finding sees the ticks
    if long_len >= 9:
        k = max(3, (long_len // 20) | 1)  # odd kernel ~5% of length
        baseline = cv2.blur(profile.reshape(-1, 1), (1, k)).ravel()
    else:
        baseline = np.full_like(profile, profile.mean())
    detr = profile - baseline
    detr[detr < 0] = 0.0

    peaks, prominences = _find_regular_peaks(detr)
    n = len(peaks)

    base = TapeProbeResult(
        verdict=TAPE_UNREADABLE, reason="", orientation=orientation,
        crop_wh=(w, h), ocr_available=_detect_ocr_engine(),
        tick_positions=[int(p) for p in peaks],
    )

    if n < min_ticks:
        base.verdict = TAPE_UNREADABLE
        base.n_ticks = n
        base.reason = (f"only {n} tick-like peaks found (need >={min_ticks}); the tape's "
                       f"gradations are not resolvable at this resolution/framing")
        return base

    spacings = np.diff(peaks).astype(np.float64)
    median_sp = float(np.median(spacings))
    spacing_cv = float(np.std(spacings) / median_sp) if median_sp > 0 else float("inf")
    strength = float(np.mean(prominences))

    base.n_ticks = n
    base.median_spacing_px = round(median_sp, 2)
    base.spacing_cv = round(spacing_cv, 3)
    base.tick_strength = round(strength, 2)

    if strength < strength_floor:
        base.verdict = MARGINAL
        base.reason = (f"comb found ({n} ticks) but faint (strength {strength:.1f} < "
                       f"{strength_floor}); film closer/higher-res before trusting a read")
    elif spacing_cv <= cv_legible:
        base.verdict = LEGIBLE
        base.reason = (f"strong regular tick comb: {n} ticks, median spacing "
                       f"{median_sp:.1f}px, spacing CV {spacing_cv:.1%} (consistent) - "
                       f"calibration is viable on this footage")
    elif spacing_cv <= cv_marginal:
        base.verdict = MARGINAL
        base.reason = (f"{n} ticks found but spacing is noisy (CV {spacing_cv:.1%}); "
                       f"likely tape angle/perspective or borderline resolution - "
                       f"film squarer/closer")
    else:
        base.verdict = TAPE_UNREADABLE
        base.reason = (f"peaks found but spacing is irregular (CV {spacing_cv:.1%}) - not a "
                       f"consistent tick comb; the read would be untrustworthy")
    return base


def _find_regular_peaks(profile: np.ndarray):
    """Lightweight 1-D peak finder (no scipy dependency in this tool): a sample is a
    peak if it's a local max over a small window and clears an adaptive threshold.
    Returns (peak_indices, prominences). Tuned to pick out tick marks, not noise."""
    n = len(profile)
    if n < 5:
        return np.array([], dtype=int), np.array([], dtype=float)
    # adaptive threshold: mean + k*std of the detrended profile
    thr = profile.mean() + 0.5 * profile.std()
    win = max(2, n // 60)  # peaks must be the local max within +/- win samples
    peaks = []
    proms = []
    i = 1
    while i < n - 1:
        v = profile[i]
        if v <= thr:
            i += 1
            continue
        lo = max(0, i - win)
        hi = min(n, i + win + 1)
        if v >= profile[lo:hi].max():
            # prominence ~ height above the local min in the window
            local_min = profile[lo:hi].min()
            peaks.append(i)
            proms.append(v - local_min)
            i += win  # skip the rest of this peak's neighborhood
        else:
            i += 1
    return np.array(peaks, dtype=int), np.array(proms, dtype=float)


# --------------------------------------------------------------------------- #
# Annotated output — always SHOW what was found
# --------------------------------------------------------------------------- #
def annotate(bgr: np.ndarray, crop_xywh, res: TapeProbeResult) -> np.ndarray:
    out = bgr.copy()
    x, y, w, h = crop_xywh
    color = {LEGIBLE: (0, 200, 0), MARGINAL: (0, 180, 255),
             TAPE_UNREADABLE: (0, 0, 255)}.get(res.verdict, (200, 200, 200))
    cv2.rectangle(out, (x, y), (x + w, y + h), color, 2)
    # draw each detected tick across the short axis of the crop
    for p in res.tick_positions:
        if res.orientation == "vertical":
            cv2.line(out, (x, y + p), (x + w, y + p), color, 1)
        else:
            cv2.line(out, (x + p, y), (x + p, y + h), color, 1)
    banner = f"{res.verdict}: {res.n_ticks} ticks"
    if res.spacing_cv is not None:
        banner += f"  CV={res.spacing_cv:.0%}"
    cv2.putText(out, banner, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3)
    cv2.putText(out, banner, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 1)
    return out


# --------------------------------------------------------------------------- #
# Self-check — synthetic tapes, no footage needed
# --------------------------------------------------------------------------- #
def _make_synthetic_tape(spacing_px=20, n_ticks=20, noise=0.0, blur=0,
                         length=None, jitter=0.0):
    """Build a synthetic vertical tape image with evenly-spaced horizontal ticks.
    spacing_px: px between ticks. jitter: random spacing irregularity (frac).
    blur: gaussian blur sigma to simulate low resolution / out-of-focus."""
    rng = np.random.default_rng(0)
    length = length or (spacing_px * (n_ticks + 2))
    width = max(24, spacing_px)
    img = np.full((length, width), 235, dtype=np.uint8)  # light tape
    pos = spacing_px
    while pos < length - spacing_px:
        thick = max(1, width // 12)
        img[pos:pos + thick, 3:width - 3] = 30  # dark tick across the tape
        step = spacing_px
        if jitter:
            step = int(spacing_px * (1 + rng.uniform(-jitter, jitter)))
        pos += step
    if noise:
        img = np.clip(img.astype(np.float32) + rng.normal(0, noise * 255, img.shape), 0, 255).astype(np.uint8)
    if blur:
        ksz = blur * 2 + 1
        img = cv2.GaussianBlur(img, (ksz, ksz), blur)
    return img


def self_check() -> int:
    """Prove the verdict logic on synthetic tapes: a crisp regular tape must read
    LEGIBLE; a heavily blurred/low-res one must read TAPE_UNREADABLE or MARGINAL;
    an irregular comb must not read LEGIBLE. No footage required."""
    cases = []

    crisp = _make_synthetic_tape(spacing_px=20, n_ticks=20)
    r = analyze_tape(crisp)
    cases.append(("crisp regular tape -> LEGIBLE", r.verdict == LEGIBLE, r))

    # heavy blur + tiny spacing simulates a too-far / low-res tape
    tiny_blur = _make_synthetic_tape(spacing_px=5, n_ticks=20, blur=4, noise=0.05)
    r = analyze_tape(tiny_blur)
    cases.append(("blurred low-res tape -> not LEGIBLE", r.verdict != LEGIBLE, r))

    # irregular spacing (bad perspective / not a real comb) must not pass as LEGIBLE
    irregular = _make_synthetic_tape(spacing_px=22, n_ticks=20, jitter=0.5)
    r = analyze_tape(irregular)
    cases.append(("irregular spacing -> not LEGIBLE", r.verdict != LEGIBLE, r))

    # blank image (no tape) must be TAPE_UNREADABLE
    blank = np.full((300, 30), 200, dtype=np.uint8)
    r = analyze_tape(blank)
    cases.append(("blank (no tape) -> TAPE_UNREADABLE", r.verdict == TAPE_UNREADABLE, r))

    ok = 0
    for label, passed, r in cases:
        flag = "PASS" if passed else "FAIL"
        print(f"  [{flag}] {label}")
        print(f"         -> {r.verdict}: {r.reason}")
        ok += int(passed)
    print(f"self-check: {ok}/{len(cases)} passed")
    return 0 if ok == len(cases) else 1


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _parse_crop(s: str | None, w: int, h: int):
    if not s:
        return (0, 0, w, h)
    try:
        x, y, cw, ch = (int(v) for v in s.split(","))
    except Exception:
        raise SystemExit(f"--crop must be 'X,Y,W,H' integers, got {s!r}")
    x = max(0, min(x, w - 1)); y = max(0, min(y, h - 1))
    cw = max(1, min(cw, w - x)); ch = max(1, min(ch, h - y))
    return (x, y, cw, ch)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="python tools/tape_probe.py",
        description="Is the in-frame measuring tape legible enough to read? "
                    "(height drill make-or-break feasibility probe)")
    ap.add_argument("--image", help="path to a still image (frame / phone screenshot)")
    ap.add_argument("--crop", help="tape strip box as X,Y,W,H (default: whole image)")
    ap.add_argument("--out", help="path to write the annotated image "
                                   "(default: <image>_tapeprobe.png next to the input)")
    ap.add_argument("--self-check", action="store_true",
                    help="run the synthetic-tape logic test (no footage needed)")
    args = ap.parse_args(argv)

    if args.self_check:
        return self_check()

    if not args.image:
        ap.error("provide --image PATH (or --self-check)")

    path = Path(args.image)
    if not path.exists():
        print(f"ERROR: image not found: {path}")
        return 2
    bgr = cv2.imread(str(path))
    if bgr is None:
        print(f"ERROR: could not read image (unsupported/corrupt): {path}")
        return 2

    H, W = bgr.shape[:2]
    x, y, w, h = _parse_crop(args.crop, W, H)
    gray = cv2.cvtColor(bgr[y:y + h, x:x + w], cv2.COLOR_BGR2GRAY)
    res = analyze_tape(gray)

    out_path = Path(args.out) if args.out else path.with_name(path.stem + "_tapeprobe.png")
    cv2.imwrite(str(out_path), annotate(bgr, (x, y, w, h), res))

    print("=== Tape-legibility probe ===")
    print(f"image            : {path.name}  ({W}x{H})")
    print(f"analyzed crop    : x={x} y={y} w={w} h={h}  (orientation: {res.orientation})")
    print(f"VERDICT          : {res.verdict}")
    print(f"reason           : {res.reason}")
    print(f"ticks found      : {res.n_ticks}")
    print(f"median spacing px: {res.median_spacing_px}")
    print(f"spacing CV       : {res.spacing_cv}  (lower = more regular; <=0.18 is legible)")
    print(f"tick strength    : {res.tick_strength}  (peak contrast; higher = crisper)")
    print(f"OCR engine avail : {res.ocr_available or 'none installed (tick read is OCR-free; '
                                                     'pin an OCR lib later for number anchoring)'}")
    print(f"annotated image  : {out_path}")
    print("=============================")
    if res.verdict == LEGIBLE:
        print("NEXT: tape reads on this footage -> safe to build tape calibration (Plan 4).")
    elif res.verdict == MARGINAL:
        print("NEXT: borderline. Re-film closer / higher-res / squarer to the tape, re-probe.")
    else:
        print("NEXT: tape NOT readable here. This is the make-or-break flagged in the README - "
              "re-film the face/tape segment much closer and higher-res before building OCR.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
