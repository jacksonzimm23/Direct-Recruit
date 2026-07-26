# AI Match — Launch Video Script & Remotion Build Spec

> **This is the deliverable: a complete build spec for Remotion + Claude Code**, not a finished video.
> It defines every scene, transition, and text animation precisely enough to build the video and for
> you to tweak. Follows the repo rules: **visualize the point, don't caption the script**
> (`Resources/scene-composition.md`), keywords/short lines only, and **version scenes** (`Scene X V2`)
> instead of overwriting on feedback (`Resources/scene-revisioning.md`). Technical playbook:
> `Resources/production-craft.md`.

---

## 0. Global settings

| Setting | Value |
|---|---|
| **Composition id** | `AiMatchLaunch` |
| **Resolution** | **1920 × 1080 (16:9 landscape)** |
| **FPS** | 30 |
| **Target length** | **~60–67 s** (retimes to the recorded VO — see frame budget) |
| **Audio** | **Voiceover-led** (you narrate) + low cinematic music bed underneath |
| **Slide background** | Landing-page hero gradient via `<SlideBG />` (navy `#0a1128 → #001f54 → #034078`) |
| **Player accent** | Cerulean `#1282a2` |
| **Coach accent** | Accent Orange `#ff6b35` |
| **Text on dark** | Warm off-white `#fefcfb` |
| **Font** | Inter (loaded in `brand.ts`) |
| **Fit-score colors** | 6-tier scale from `brand.ts` `fitScale` (Elite green → Poor maroon) |

**The color rule (never break it):** **Blue = the player's side. Orange = the coach's side.** The viewer
must never be confused about whose perspective they're in. The whole film pays this off in Scene 9 when
the two colors merge into one score.

---

## 1. Concept in one line

**One AI Match score, seen from both sides.** A player fills out a short questionnaire → sees the schools
that fit them (and who to contact). Flip the camera → the *same* player shows up for the *coach*, ranked
by fit, with a "why they fit" breakdown. The moral: recruiting works when both sides share the same
off-field goals — so coaches find players who will actually **succeed and stay**, not just who's good on tape.

**Framing (locked, accuracy-critical):** the product says **"two-way fit"**, NOT "mutual interest." AI Match
scores the *overlap of stated preferences* (a player wants X ↔ a program offers X). It is NOT a signal that
a specific coach *wants* a specific player. VO must say **fit / shared goals / who fits your program** —
never "this coach is interested in you." (Terms §9.8 explicitly says a Match Output is not an assurance of
interest.)

---

## 2. Voiceover script (draft — timed to scenes, yours to rewrite)

Word-reveal animations are synced to the VO: each word/line appears **as it is spoken.** The lines below are
paced to the frame budget; rewrite the wording in your own voice and I'll re-time the reveals to your recording.

| Scene | VO line |
|---|---|
| 1 | *(silent / breath — let the brand land)* |
| 2 | "What if you could use **AI** to recruit smarter? A way to connect players and programs that actually fit. So both sides know exactly who to reach out to." |
| 3 | "That's AI Match." |
| 4 | "It starts with a few quick questions — academics, level, location, and what matters to you." |
| 5 | "And instantly, players see the schools that fit them — and exactly who to reach out to." |
| 6 | "Now, from the coach's side…" |
| 7 | "That same player shows up for the coach — ranked by fit to their program." |
| 8 | "Coaches see *why* a player fits — the off-field factors that decide who actually succeeds and stays." |
| 9 | "One score. Both sides. The same goal — the right fit." |
| 10 | "Direct Recruit. Get recruited — the right way." |

---

## SCENE-BY-SCENE FLOW

Total structure: **brand lockup → AI hook → title → questionnaire → matches → THE FLIP → coach results →
why-they-fit → merge to one score → end card.** (10 scenes.)

---

### SCENE 1 — Brand lockup (0.0–5.0s · f0–150) · BOOKEND

**Reuses the existing `Scene02Meet_Merged` open** (already imported into `AiMatchLaunch` as "Start").

**Shows:** DR logo centered → slides left as **"Direct Recruit"** + **"Get Recruited · The Right Way"**
reveal to its right, resolving into the centered brand lockup.

**Note:** In the shipped `AiRaDemo`, this scene continues into "AI Recruiting Assistant" + 3 flash lines.
For AI Match we take the FIRST portion (logo → name/slogan lockup) and hand off into Scene 2's AI hook
instead of the RA title. Build as a **versioned copy** (`Scene 1 - AiMatch Brand Open`) so we don't disturb
the AiRaDemo original. Keep the logo dead-center at the handoff so Scene 2 can shrink it up seamlessly.

**VO:** none. Hold ~0.5s on the full lockup before Scene 2 begins.

---

### SCENE 2 — The AI hook (5.0–14.0s · f150–420)

**Background:** `<SlideBG />` (clean navy — no UI).

**Shows:** the brand lockup **shrinks and rises** to the top third (settles, doesn't snap), clearing the
center for text. Three lines reveal **word-by-word, synced to the VO**, stacked/centered:

- **Line 1:** `What if you could use ` **`AI`** ` to recruit smarter?` — the word **AI** is **orange**
  (`#ff6b35`); everything else off-white. AI is the first orange word in the film (plants the hook).
- **Line 2:** `A way to connect players and programs that actually fit.`
- **Line 3:** `So both sides know exactly who to reach out to.`

Each line uses `WordReveal` (words spring up + fade, staggered). Line-2 starts after line-1's VO finishes,
line-3 after line-2. **Hold a beat on line 3** (nothing moving) before Scene 3.

**Mechanics:**
- Lockup shrink/rise: one spring (`damping: 200`), scale ~1.0→0.6, translateY toward the top.
- Word reveal frames are set to land on each word in your VO recording (placeholder pacing: ~2 words/sec).
- Optional: a subtle orange scale-pop on **AI** as it lands.

---

### SCENE 3 — Bridge → AI Match title (14.0–17.0s · f420–510)

**Shows:** the three hook lines **pull toward center and dissolve**; out of that motion, the **AI Match**
title lockup assembles (logo + "AI Match" wordmark, centered). Short, decisive — this is the pivot from
*told* to *shown*.

**Mechanics:** lines fade + drift to center (10–12f). Title springs in (`damping: 200`), logo scale
0.8→1.0 with a soft orange glow, "AI Match" word-reveal. Hold ~0.5s.

**VO:** "That's AI Match."

**Transition OUT → Scene 4:** title lifts/fades; the player questionnaire card pushes in from below
(scale 1.05→1.0 settle). ~12f.

---

### SCENE 4 — The quick questionnaire (17.0–29.0s · f510–870) · NEW UI

**Point:** the player answers a few quick questions — this is the input that powers everything.

**Background:** `<SlideBG />`. A centered **player-side card** (cerulean `#1282a2` accents: left border,
progress bar, check color).

**Composition — a clean questionnaire panel (glass card, radius 20, `rgba(255,255,255,0.06)`):**
- Header: small cerulean eyebrow `YOUR PROFILE` · title `A few quick questions`.
- A **progress bar** (cerulean fill) across the top, animating 0 → 100% as questions get answered.
- **5 questions animate in and get answered fast** (one every ~1.8s), each with a cerulean **checkmark**
  ticking on completion:
  1. **Academics** — a GPA value chip fills in (e.g. `GPA 3.6`), test-score chips (`SAT 1180`).
  2. **Level** — pills select: `D2` · `D3` highlight (cerulean fill).
  3. **Region** — region pills light up: `Southeast` · `South Central`.
  4. **Campus** — an icon toggle picks `Suburban`.
  5. **Priorities** — a **slider snaps** into place (e.g. "Playing time ⟷ Competition level").

**Animation:** each question row springs in (`translateY 24→0` + fade), then after a beat its checkmark
pops (spring, scale 0→1) and the progress bar advances. Keep it **brisk** — the payoff is the matches, not
the form. End on a satisfying "100% complete" state (progress bar full, subtle glow).

**VO:** "It starts with a few quick questions — academics, level, location, and what matters to you."

**Transition OUT → Scene 5:** the questionnaire card **collapses/lifts** as the results list expands from it.
~12f.

---

### SCENE 5 — Matches resolve → Best-Fit + who to contact (29.0–39.0s · f870–1170) · NEW UI

**Point:** the questionnaire instantly becomes a ranked list of schools that fit — and shows *who to contact*.

**Background:** `<SlideBG />`, player-side (cerulean).

**Composition — Best-Fit Schools list:**
- Eyebrow (cerulean): `YOUR BEST-FIT SCHOOLS`.
- **4–5 school cards** stagger in (spring, reading order), each showing: school logo, name, division, and the
  **AI Match badge** (reuse the `RaFitBadge` component — "AI MATCH" label + number + color-coded fill bar +
  spark, colored by the 6-tier `fitScale`). Scores in the green/gold tiers (e.g. `92`, `88`, `81`, `76`).
  - Use **Delta State** (`public/logos/delta_state.png`) and **Eastern Washington**
    (`public/logos/eastern_washington.png`) — the two logos already in the project — plus 2–3 text-only
    school cards.
- **Highlight ONE card — Delta State** — with a pulsing orange ring (`PulseRing`) drawing the eye.
- The highlighted card is **tapped** (cursor + click ripple, reuse `CursorArrow`) → it **opens the
  Match + Staff view** (mirrors the real `FitInfoModal` school mode):
  - **Left / "Match" side:** `What this school offers that matches you` — 3–4 green **✓** dimension rows
    (`Academics ✓ Line up with your admitted profile`, `Level ✓ Open to your division`,
    `Location ✓ In a region you're open to`).
  - **Right / "Staff" side:** `Coaches to contact` — 2–3 staff rows (avatar + name + title), so the player
    sees exactly **who to reach out to.** This is the "who to contact" payoff.

**Animation:** cards stagger (4–5f apart, `translateY 26→0` + scale 0.96→1 + fade); each badge's fill bar
animates in (`fitFill` 0→1) a few frames after its card lands. The tap → modal is a scale/fade expand.

**VO:** "And instantly, players see the schools that fit them — and exactly who to reach out to."

---

### SCENE 6 — THE FLIP: to the coach's view (39.0–43.0s · f1170–1290) · THE HINGE

**Point:** the signature "one match, two views" moment. The camera swings around the SAME object.

**Shows:** the **Delta State card the player picked flips in 3D** (Y-axis `rotateY` 0°→180°). The **front**
is the player's school card (blue-accented); the **back**, revealed mid-rotation, is the **coach's view of
that same player** (orange-accented result row). One card, two faces.

**Mechanics:**
- CSS 3D flip (cheaper, reads clean at this scale): a wrapper with `perspective: 1400px`; the card rotates
  `rotateY(${interpolate(spring, [0,1], [0,180])}deg)`. Front face `backface-visibility: hidden`; back face
  pre-rotated `rotateY(180deg)`.
- At the 90° midpoint (edge-on), the accent color crossfades **blue → orange** — the visual "handoff" from
  player side to coach side.
- (Alt: real 3D via `@react-three/fiber`, which is installed — only if the CSS flip doesn't read premium
  enough. Decide at build.)

**VO:** "Now, from the coach's side…"

---

### SCENE 7 — Player in the coach's results (43.0–48.0s · f1290–1440) · REUSE

**Point:** establish the coach's world — the same player, ranked by fit.

**Background:** `<SlideBG />`, **coach-side (orange).**

**Shows:** the flip resolves into a coach **RA result row** for the same player (reuse `RaPlayerRow` +
`RaFitBadge`), sitting in a short list. The player's AI Match badge reads a **strong tier** (green, e.g. `88`).
A subtle orange progress/rank cue reinforces "ranked by fit."

**VO:** "That same player shows up for the coach — ranked by fit to their program."

**Transition:** cursor moves toward the badge's **ⓘ** info button → Scene 8.

---

### SCENE 8 — Why they fit (48.0–57.0s · f1440–1710) · REUSE

**Point:** the moral, shown. A coach filters for who will **succeed and stay** using off-field factors.

**Shows:** the coach clicks **ⓘ** → the **per-dimension breakdown** reveals **one row at a time** (mirrors
`FitInfoModal` player mode), each with a match-strength icon:
- **Academics** ✓ (green) — `GPA falls within your admitted range`
- **Level** ✓ (green) — `Open to playing at your division`
- **Location** ✓ (green) — `Open to your recruiting region`
- **Campus** ✓ (green) — `Prefers a campus like yours`
- **Financial** ~ (yellow) — `Some overlap on financial needs` ← one honest "open question" row

The big **AI Match score** + tier label (`88 · Strong Fit`) sits above the rows. A short disclaimer line
fades in: `A guide to surface best-fit recruits — it complements your evaluation, never replaces it.`

**Animation:** rows stagger in (spring, 6–8f apart), each icon popping. The yellow `~` row is deliberate —
it shows the "why / why NOT" nuance **without** pairing a real-looking player with a bad-fit "villain" score.

**VO:** "Coaches see *why* a player fits — the off-field factors that decide who actually succeeds and stays."

---

### SCENE 9 — Two views → one score (57.0–63.0s · f1710–1890)

**Point:** fuse the two perspectives. Same goal, both directions.

**Shows:** pull back to show **both views side by side** — the player's Best-Fit card (blue, left) and the
coach's breakdown (orange, right). They **slide toward center and merge into a single AI Match score** glowing
in the middle (the badge, large, tier-colored). The seam/split that divided the two sides is now **healed**
into one number.

**Text (word-reveal, centered under the score):**
- `One score.` · `Both sides.` · `The right fit.` (staggered, the last with an orange sweep underline).

**Mechanics:** the two panels translate to center + fade; the merged badge scales up (spring) with a soft
glow. Orange `OrangeSweep` resolves under the final line.

**VO:** "One score. Both sides. The same goal — the right fit."

**Transition OUT → Scene 10:** the brand gradient wipes/holds; the end-card lockup rises into place. ~14f.

---

### SCENE 10 — End card (63.0–67.0s · f1890–2010) · BOOKEND

**Reuses the existing `Scene11EndCard`** (already imported into `AiMatchLaunch` as "Finish").

**Shows:** DR logo + **"Direct Recruit"** + **"Get Recruited · The Right Way"** + orange sweep, then the
**App Store badge** and **directrecruit.net** fade in below. Hold the last ~20 frames static for a clean
end-frame / loop point.

**VO:** "Direct Recruit. Get recruited — the right way."

---

## Frame budget (retimes to the recorded VO)

| # | Scene | Frames | Sec | Type |
|---|---|---|---|---|
| 1 | Brand lockup | 0–150 | 5.0 | Bookend (Start) |
| 2 | AI hook — 3 lines | 150–420 | 9.0 | Text |
| 3 | Bridge → AI Match title | 420–510 | 3.0 | Transition |
| 4 | Questionnaire | 510–870 | 12.0 | UI (new) |
| 5 | Matches → Match + Staff | 870–1170 | 10.0 | UI (new) |
| 6 | The flip | 1170–1290 | 4.0 | Transition |
| 7 | Player in coach results | 1290–1440 | 5.0 | UI (reuse) |
| 8 | Why they fit | 1440–1710 | 9.0 | UI (reuse) |
| 9 | Two views → one score | 1710–1890 | 6.0 | Text/UI |
| 10 | End card | 1890–2010 | 4.0 | Bookend (Finish) |
| | **Total** | **2010** | **67.0** | |

> Timings are placeholders paced to the draft VO. Once you record, set each scene's `durationInFrames` to
> your actual VO windows and shift downstream `from`s. **Changing one duration shifts every later scene** —
> re-derive downstream cues (`production-craft.md` §2).

---

## Transition vocabulary (keep consistent)

| Transition | When | Mechanic |
|---|---|---|
| **Shrink-and-rise** | S1 → S2 | Brand lockup scales down + moves to top, clearing center for the hook lines. Spring, `damping: 200`. |
| **Pull-to-center + assemble** | S2 → S3 | Hook lines drift to center + fade; AI Match title springs together out of the motion. |
| **Push-up / settle** | S3 → S4, S9 → S10 | Outgoing lifts + fades; incoming enters from below, scale 1.05→1.0 settle. ~12f. |
| **Collapse-to-list** | S4 → S5 | Questionnaire card lifts/collapses as the results list expands from it. |
| **3D card flip** | S6 (the hinge) | `rotateY` 0→180°; accent crossfades blue→orange at the 90° edge. Front = player card, back = coach row. |
| **Merge-to-one** | S9 | Two side panels translate to center and fuse into one badge; the split "heals." |

**Text-animation primitives (reuse from `components/primitives.tsx`):**
`SlideBG` · `WordReveal` (hook + close lines) · `TypeOn` (optional) · `OrangeSweep` (underlines) ·
`ChipSnap` (questionnaire pills/chips) · `PulseRing` (highlight the picked school) · `KeywordSwap`.

**RA UI kit to reuse (from `AiRaDemo.tsx`, now exported):**
`RaFitBadge` (the AI Match badge) · `RaPlayerRow` (coach result row) · `CursorArrow` (tap/click) ·
`RaThinkingDots` · fit tier colors (`fitTierColor` / `brand.ts` `fitScale`).

---

## Remotion structure (how to build it)

- Scenes live in a new file `src/remotion/AiMatchLaunch.tsx` (currently holds the Start/Finish bookends).
- **Reuse, don't duplicate:** import `Scene02Meet_Merged` (Start) and `Scene11EndCard` (Finish) from
  `AiRaDemo.tsx` (already exported). Import `RaFitBadge`, `RaPlayerRow`, `CursorArrow` etc. the same way, or
  factor the shared RA kit into `components/` if the imports get heavy.
- **New components to build:** `Scene04Questionnaire`, `Scene05BestFit` (+ the Match/Staff panel),
  `Scene06Flip`, `Scene08WhyFit`, `Scene09Merge`. One component per scene, each in its own
  `<Sequence from=.. durationInFrames=..>` so scenes are versionable.
- Register the updated `durationInFrames` (2010 draft) in `Root.tsx`.
- **Verify per `production-craft.md` §6:** render stills at scene boundaries + pixel-measure; don't trust the
  Studio preview for flashes. Especially check the S1→S2 lockup shrink and the S6 flip midpoint.
- **Audio last:** record VO → drop in `public/` → place per-scene; keep `Background Music.mp3` as a low bed
  (~0.15–0.20 under a VO) with the same silence-trim + envelope approach as AiRaDemo.

---

## Open placeholders (to finalize)

1. **Record the VO** (or approve the draft lines) — then I re-time every reveal to your audio.
2. **Emphasis on "will"** — n/a now (Scene 3 cut); the hook carries the setup. Confirm the 3 hook lines' final wording.
3. **The flip (S6):** CSS `rotateY` (default) vs real 3D `@react-three/fiber` — decide when we build it.
4. **Questionnaire content (S4):** confirm the 5 questions / sample answers (GPA, levels, regions, campus, slider).
5. **Best-Fit schools (S5):** confirm the school list + scores (Delta State highlighted; Eastern Washington + text cards).
6. **Music track:** reuse `Background Music.mp3` or drop a new bed.

Once you approve this flow, say the word and I'll scaffold the new scenes into `AiMatchLaunch.tsx` so it
renders in the Studio with placeholders, ready to drop in the real VO.
