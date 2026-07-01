"""Standalone harness tooling (labeler, scorer) — deliberately OUTSIDE the
`drill_timing/` package import tree.

Governance Rule 0: ground truth is a sealed exam. The timing pipeline must never
read `ground_truth.json`. Keeping the ground-truth writer (label.py) and reader
(score.py, Plan 4) here — not under drill_timing/ — makes that structural: nothing
in the timing path can import a module that touches ground truth.
"""
