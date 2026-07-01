# drill-lab — AI drill-analysis: build, train & label

> **What this folder is:** the home for **building, training, and labeling** the
> AI models for each combine drill. It is a self-contained Python project that
> runs on your computer (Mac/Windows) — NOT on the phone and NOT in the iOS app.
>
> **Two layers, same name — don't confuse them:**
> - **`drill-lab/` (this folder, repo root)** — the Python ML engine, model
>   weights, drill specs, and labeling/scoring tools. Dev/training only.
> - **`frontend/drill-lab/`** — the phone-facing web UI (the capture screens your
>   admin account sees on TestFlight). Served by the frontend, ships in the app.
>
> They work together: you label footage and train models *here*; the trained
> model eventually powers the **Testing** mode in the `frontend/drill-lab/` UI.
> The Node/Express backend does **not** import or depend on anything in here.

## What it is

A multi-drill analysis platform: one shared computer-vision perception engine
(YOLO detection/pose + MediaPipe pose/hands) powers many football-combine drills
(e.g. the 5-10-5 shuttle, height measurement, with more to come). The AI only
*perceives*; all timing/measurement is plain math against the perceived signals.
Ground truth is used only for scoring, never while computing a result.

See **`PLATFORM_SPEC.md`** for the full architecture, governance rules, and build
plan. Each drill also has its own `SPEC.md` / `testing.md` under
`drill_timing/drills/<drill>/`.

## Layout

```
drill-lab/
  PLATFORM_SPEC.md          source of truth for the shared engine + governance
  requirements.txt          (drill_timing/requirements.txt) pinned CPU-only deps
  drill_timing/
    run.py                  orchestrator CLI (python -m drill_timing.run)
    config.yaml             shared default config
    core/                   shared engine: video/detect/track/pose/kinematics/...
    drills/                 one folder per drill (spec + tuning, footage gitignored)
    tests/
  tools/                    label.py, score.py, tape_probe.py (take --drill)
  models/                   vendored MediaPipe .task bundles
  *.pt                      YOLO weights
```

## Run it (standalone)

This is a Python 3.12 project, independent of the Node app. From **this folder**:

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell
pip install -r drill_timing/requirements.txt
python -m drill_timing.run --video path\to\clip.mp4 --drill shuttle_5_10_5
```

Artifacts (annotated video, signals CSV) land in `debug_out/` (gitignored).

## Models / weights

The model weights are committed here for safekeeping, so a fresh clone runs
without downloads. `drill_timing/core/model_assets.py` resolves them relative to
**this** folder (two levels up from `core/`), so the package is self-locating and
does not depend on the surrounding Direct Recruit repo. If a `.task` bundle is
ever missing it fails loud with a copy-pasteable download URL.

## Test footage

Per-drill `footage/` and `debug_out/` directories are gitignored (large,
local-only). Drop your own clips into `drill_timing/drills/<drill>/footage/` to
test locally.
```
