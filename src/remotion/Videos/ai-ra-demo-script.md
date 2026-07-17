# AI Recruiting Assistant — Demo Video Script & Remotion Build Spec

> **This is the deliverable: a complete build spec for Remotion + Claude Code**, not a finished video.
> It defines every scene, transition, zoom, and text animation precisely enough to build the video and
> for you to tweak. Follow the repo rules: **visualize the point, don't caption the script**
> (`scene-composition.md`), keywords only over clips, and **version scenes** (`Scene X V2`) instead of
> overwriting on feedback (`scene-revisioning.md`).

---

## 0. Global settings

| Setting | Value |
|---|---|
| **Composition id** | `AiRaDemo` |
| **Resolution** | **1920 × 1080 (16:9 landscape)** — desktop captures fill the frame natively |
| **FPS** | 30 |
| **Target length** | **~60 s → 1800 frames** (per-scene budget below; retime slides if clips differ) |
| **Slide background** | **Landing-page hero gradient** (see §1) — used on ALL text-only / preview slides |
| **Clip background** | The clip itself (full-frame or in a browser card); slide gradient shows during transitions |
| **Primary accent** | Accent Orange `#ff6b35` |
| **Player energy accent** | Cerulean `#1282a2` |
| **Text on dark** | Warm off-white `#fefcfb` |
| **Font** | Inter (loaded in `brand.ts`) |
| **Caption style** | **Short keyword callouts only** (2–5 words), bottom third, over clips |
| **Voiceover** | You narrate live. Script paces animations for VO; no scripted VO lines in this doc. |
| **Music (optional)** | Low cinematic pad + soft tick on each keyword snap; wire `<Audio>` if a track is added. |

---

## 1. The landing-page gradient (background for every text/preview slide)

Pulled from `frontend/landingpage/styles.css` `.hero` (line 246). This is the exact navy→blue you asked for:

```ts
// src/remotion/brand.ts — ADD this token
export const gradients = {
  // ...existing...
  landingHero: "linear-gradient(135deg, #0a1128 0%, #001f54 50%, #034078 100%)",
  //                                  oxford      penn         indigo-dye
};
```

**Slide background component (reused on every text/preview slide):**
```tsx
const SlideBG: React.FC = () => (
  <AbsoluteFill style={{ background: gradients.landingHero }}>
    {/* faint grid, matches HelloDirectRecruit; keeps slides from feeling flat */}
    <AbsoluteFill style={{
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
      backgroundSize: "80px 80px",
      opacity: 0.6,
    }}/>
    {/* soft vignette so center text pops */}
    <AbsoluteFill style={{ boxShadow: "inset 0 0 480px rgba(0,0,0,0.45)" }}/>
  </AbsoluteFill>
);
```

---

## 2. The 4 screen recordings (your descriptions)

Drop captures into `src/remotion/public/ra/`. Reference with `staticFile("ra/rec-N.mp4")`.
Add `muted` to each `<Video>` unless you want its audio.

| Clip | File | What it shows (your words) | On-screen keyword callout |
|---|---|---|---|
| **REC-1** | `ra/rec-1.mp4` | A **standard database** — endless scrolling through players/social to find talent | `THE OLD WAY` → `SCROLLING IS OVER` |
| **REC-2** | `ra/rec-2.mp4` | AI RA, prompt: **"Find me tall QBs in the 2027 class, 6ft or taller and 180+ lbs"** → RA auto-searches, returns best-fit player | `ONE PROMPT` · `BEST FIT` |
| **REC-3** | `ra/rec-3.mp4` | AI RA, prompt: **"Show me transfer portal WRs with 2+ yrs eligibility, 500+ receiving yards, and D2 offers"** → best transfer players | `TRANSFER PORTAL` · `INSTANT IMPACT` |
| **REC-4** | `ra/rec-4.mp4` | AI RA remembers the convo — prompt: **"What are their D2 offers?"** → lists the D2 offers for REC-3's players | `IT REMEMBERS` · `GO DEEPER` |

> **REC-1 is the hero zoom** (desktop-then-zoom at the start). REC-2/3/4 play full-frame (no zoom).

---

## SCENE-BY-SCENE FLOW

Total structure: **1 intro → zoom → REC-1 → slide → REC-2 → slide → REC-3 → slide → REC-4 →
capabilities-cards slide → logo end card.** (11 scenes.)

---

### SCENE 1 — Intro: "Recruiting is time-consuming… but it doesn't have to be" (0.0–5.0s · f0–150)

**Background:** landing gradient slide (`SlideBG`).

**Center element — a floating desktop showing the DR logo.**
- Render a **desktop/monitor mockup** (rounded-rect screen, radius 18, thin `#ffffff14` bezel, subtle
  drop shadow, faint reflection) centered, at scale ~0.72, floating with a gentle 3s sine bob (±6px).
- **On the desktop screen:** the landing gradient again + `dr-logo.png` centered small, softly glowing.
  (This is the "desktop showing the Direct Recruit logo" you asked for — it becomes the thing we zoom into.)

**Text animation (bottom third, keyword):**
- f20: Eyebrow (cerulean, all-caps, `+0.06em`): `RECRUITING`
- f30: Hero line (off-white, weight 900, `-0.05em`): `Hours of scrolling.`
- f75: the word `scrolling.` desaturates to `textSubtle`; **orange line sweeps L→R** under it and
  `It doesn't have to be.` rises in off-white. Net read: **"Hours of scrolling. → It doesn't have to be."**

**Animation mechanics:**
- Desktop enters: `spring({ frame, fps, config: { damping: 200 } })` driving scale 0.6→0.72 + opacity 0→1.
- Text lines: each on its own `spring`, `translateY(30→0)` + fade, staggered 10 frames apart.
- Bob: `Math.sin(frame / 30) * 6` on the desktop's `translateY`.

---

### SCENE 2 — The zoom into the desktop (5.0–7.0s · f150–210)  ← THE zoom moment

**Point:** we dive through the monitor into the product.

**Mechanics (this is the signature move — make it smooth and cinematic):**
- Interpolate the desktop mockup **scale 0.72 → ~2.4** and **translate** so the *screen area* (not the
  bezel) ends up filling the 1920×1080 frame. Simultaneously fade the bezel/shadow/reflection to 0 so by
  f210 only the screen content remains → seamless hand-off into REC-1.
- Ease with a spring that starts slow, accelerates, settles:
  `spring({ frame, fps, config: { damping: 26, mass: 1.1, stiffness: 90 } })` — a touch of overshoot
  reads as "premium," not robotic.
- Add a **subtle motion-blur feel**: during the fastest part of the zoom (f165–195) overlay a 2–4px
  horizontal blur / slight scale on a duplicate layer at low opacity. (Or `filter: blur()` ramp 0→3→0.)
- The Scene-1 captions fade out by f160 (before the zoom peaks) so text doesn't smear.
- **Hand-off:** the desktop screen was already showing the landing gradient + logo; as it fills the frame,
  crossfade (6–8 frames) from that static screen into REC-1's first frame. Feels like the monitor "wakes."

---

### SCENE 3 — REC-1: "The age of scrolling is over" (7.0–14.0s · f210–420)

**Full-frame clip (no browser chrome — we're already 'inside the screen').**
- REC-1 (standard database, endless scrolling) plays edge-to-edge.
- Keep a slight **1.02–1.06 slow push-in (Ken Burns)** across the clip so a static screen recording still
  feels alive: `scale = interpolate(localFrame, [0, dur], [1.0, 1.05])`.

**Caption band (bottom, keyword only):**
- A **frosted-glass caption bar** anchored to the bottom (height ~140px, `rgba(10,17,40,0.55)`,
  `backdrop-filter: blur(8px)`, top hairline `#ffffff1a`). Room for one keyword line.
- f230: `THE OLD WAY` (off-white) fades/slides in.
- f330: swap to `ENDLESS SCROLLING` with a quick vertical-wipe swap (old line up-and-out, new up-and-in).
- f395: swap to orange `THAT ENDS NOW.`

**Motion accents:** a thin orange progress bar under the caption bar fills L→R across the clip's duration
(subtle "watch this" cue). Optional red-tint "warning" pulse on the database chaos to sell the pain.

**Transition OUT → Scene 4:** clip scales down to 0.92 and the landing gradient wipes in from the right
(orange leading edge, `gradients.orangeSweep` as the wipe seam). ~10 frames.

---

### SCENE 4 — Slide: Introduce the AI Recruiting Assistant (14.0–18.5s · f420–555)

**Background:** landing gradient slide (text only, no clip).

**Point:** name the product — the only recruiting tool you'll need for HS + transfer football players.

**Composition:**
- `dr-logo.png` small, top-center, drifts in + soft orange glow.
- Hero (off-white, weight 900): `AI Recruiting Assistant`
- Under it, an animated **type-on line** in cerulean, weight 600: `The only recruiting tool you'll need.`
  (type-on = reveal characters via `interpolate(localFrame → substring length)`, cursor blink at the end.)
- Two small pill tags stagger in beneath: `HIGH SCHOOL` · `TRANSFER PORTAL` (glass pills, orange left-border).
- Orange sweep underline resolves under the hero line (callback motif reused across slides).

**Motion:** hero line does a **word-by-word reveal** (each word springs up, 4-frame stagger). This is your
"cool text animation only slide."

**Transition OUT → Scene 5:** slide content lifts up and out; REC-2 pushes in from below with a scale
1.05→1.0 settle. ~12 frames.

---

### SCENE 5 — REC-2: One prompt → best-fit player (18.5–25.5s · f555–765)

**Full-frame clip** (REC-2 shows the RA UI, so it's fine full-bleed) + slow 1.0→1.05 push-in.

**Text-animation storytelling (this sells the capability):**
- **f565 — reveal the prompt as a floating "typed" chip**, top-center, mimicking the RA input:
  a glass bar with a blinking cursor that **types out**: `"Find me tall QBs, class of 2027, 6'+, 180+ lbs"`
  (character-reveal, ~50 frames). This runs *in sync with* the clip's own typing if possible; otherwise it's
  a clean overlay reinforcing what's on screen.
- **f640 — the prompt "decomposes" into filter chips** that snap out below it (visual NL→filters metaphor):
  `POSITION: QB` · `CLASS 2027` · `HEIGHT 6'0"+` · `WEIGHT 180+`
  Each chip springs in with a 5-frame stagger, orange left-border, glassy.
- **f700 — highlight the result:** a pulsing orange ring (scale 1.0↔1.06) draws the eye to the returned
  best-fit player card in the footage; a small **fit badge** (use `fitScale` color for the score) pops next to it.

**Caption band (bottom keyword):**
- f580: `ONE PROMPT`
- f700: swap to `BEST FIT, INSTANTLY`

**Transition OUT → Scene 6:** orange sweep wipe back to gradient slide. ~10 frames.

---

### SCENE 6 — Slide: Transfer players are easily found (25.5–29.5s · f765–885)

**Background:** landing gradient slide.

**Point:** bridge to the transfer-portal capability.

**Composition:**
- Eyebrow (orange): `TRANSFER PORTAL`
- Hero (off-white, weight 900): `Find your next impact player.`
- A subtle **"portal" visual metaphor:** two ghosted school-logo silhouettes with an orange arrow/dashed
  path animating between them (player moving programs) — no real logos needed, abstract glass shapes.
- Word-by-word reveal on the hero line; orange sweep underline resolves.

**Transition OUT → Scene 7:** slide lifts, REC-3 pushes in from below (scale settle). ~12 frames.

---

### SCENE 7 — REC-3: Transfer WRs, instant impact (29.5–36.5s · f885–1095)

**Full-frame clip** + slow push-in.

**Text animation:**
- **f895 — typed prompt chip** types out:
  `"Transfer WRs · 2+ yrs eligibility · 500+ rec yds · D2 offers"`
- **f970 — decompose to chips:** `TRANSFER` · `ELIGIBILITY 2+` · `REC YDS 500+` · `OFFERS: D2`
- **f1040 — highlight results:** pulsing ring on the returned transfer players; a small stat chip
  (`YOE`, `REC YDS`) floats up next to the top card to reinforce "these numbers matched."

**Caption band (bottom keyword):**
- f905: `TRANSFER PORTAL`
- f1030: swap to `INSTANT IMPACT`

**Transition OUT → Scene 8:** orange sweep wipe to gradient slide. ~10 frames.

---

### SCENE 8 — Slide: "That's not all — you can ask more" (36.5–40.0s · f1095–1200)

**Background:** landing gradient slide.

**Point:** tease conversational memory / going deeper.

**Composition:**
- Eyebrow (cerulean): `AND THERE'S MORE`
- Hero (off-white, weight 900): `Just keep asking.`
- Animate **three faux chat bubbles** rising in sequence (right-aligned "you" bubbles, glass, off-white
  text) — e.g. `"What are their offers?"` · `"Who has the highest GPA?"` · `"Any from Texas?"` — showing
  the RA is conversational. Bubbles spring up + fade, 8-frame stagger, then gently drift up and out.
- Orange sweep underline.

**Transition OUT → Scene 9:** slide lifts, REC-4 pushes in from below. ~12 frames.

---

### SCENE 9 — REC-4: It remembers the conversation (40.0–47.0s · f1200–1410)

**Full-frame clip** + slow push-in.

**Text animation (this is the "wow — it has memory" beat):**
- **f1205 — show the CONTINUITY visually.** Top-left, a small ghosted "previous prompt" chip fades in
  (`"...transfer WRs, 500+ yds, D2 offers"`) with a downward **connecting line/arrow** to a new prompt
  chip that types out: `"What are their D2 offers?"` — the arrow literally links old → new (memory metaphor).
- **f1290 — highlight the answer:** as the RA lists each player's D2 offers in the footage, a pulsing ring
  moves down the list; small orange checkmarks tick beside each answered player (2–3 of them, staggered).

**Caption band (bottom keyword):**
- f1215: `IT REMEMBERS`
- f1320: swap to `GO DEEPER`

**Transition OUT → Scene 10:** clip scales down to 0.9 and the gradient slide expands from center (iris/scale
wipe) into the capabilities screen. ~14 frames.

---

### SCENE 10 — Capabilities cards: "Everything you can ask about a player" (47.0–53.5s · f1410–1605)

**Background:** landing gradient slide.

**Point:** one organized screen showing the breadth of what the RA can filter/answer on.

**Composition — a responsive card grid (3 across × 3 down, last card = "& more"):**

| Card | Icon idea | Label | Sub |
|---|---|---|---|
| 1 | ruler/height | **Size** | Height · Weight |
| 2 | position badge | **Position** | QB · WR · CB · … |
| 3 | bar chart | **Stats** | Passing · Rushing · Receiving |
| 4 | shield/grade | **PFF Grade** | *Transfer players only* |
| 5 | graduation cap | **Academics** | GPA · SAT · ACT |
| 6 | envelope/star | **Offers** | By division |
| 7 | map pin | **Location** | State · Region |
| 8 | dumbbell/track | **Athleticism** | Track times · other sports |
| 9 | plus in a circle | **& More** | *(the "and more" IS its own card, styled with an orange glow / dashed border to feel open-ended)* |

- **Card style:** glass cards (`rgba(255,255,255,0.06)`, radius 16, `#ffffff14` border, subtle inner
  highlight), icon in orange, label off-white weight 700, sub in `textSubtle`. The **"& More" card** gets an
  orange gradient border + gentle pulsing glow so it reads as "endless."
- **PFF Grade card:** add a tiny cerulean tag `TRANSFER ONLY` (factually correct — PFF grade is transfer-only in the product).

**Animation:** cards **stagger in on a spring** in reading order (row by row), each `translateY(24→0)` +
scale `0.9→1.0` + fade, 4-frame stagger. Title above the grid types/reveals first:
- Eyebrow (orange): `ASK ABOUT ANYTHING`
- Hero (off-white, weight 900): `Everything on a player.`
- After all cards land, the **"& More" card pulses** once to draw the eye.

**Transition OUT → Scene 11:** cards fly outward/fade, gradient stays, logo lockup assembles in center. ~14 frames.

---

### SCENE 11 — End card: DR logo + name + slogan (53.5–60.0s · f1605–1800)

**Background:** landing gradient slide (same as landing page).

**Match the landing-page splash lockup EXACTLY** (pulled from `v2-redesign.css`):
- `dr-logo.png` centered, width **275px** (`.v2-splash-logo`).
- Brand name **`Direct Recruit`** — color `#fff`, **weight 800**, `letter-spacing: -0.02em`, size ~3.75rem
  scaled for 1080p (`.v2-brand-name`).
- Tagline **`GET RECRUITED · THE RIGHT WAY`** — color cerulean `#1282a2`, **weight 700**, **uppercase**,
  `letter-spacing: 2.5px` (`.v2-brand-tagline`).
- Layout: logo left of the text block (row), or logo-top/text-below (stack) — match whichever the splash uses;
  the splash is a **row** (logo | [name over tagline]).

**Animation:**
- Logo scales in `spring` 0.8→1.0 with soft orange glow behind it.
- Name does a word-by-word reveal; tagline fades/tracks-in under it (letter-spacing animates 6px→2.5px for a
  "settle" feel).
- Final orange sweep underline resolves beneath the lockup.
- **Hold the last ~20 frames** static for a clean end-frame grab / loop point.

---

## Frame budget (retime slides if your clips differ)

| # | Scene | Frames | Sec | Type |
|---|---|---|---|---|
| 1 | Intro — desktop + logo, "hours of scrolling" | 0–150 | 5.0 | Slide |
| 2 | Zoom into the desktop | 150–210 | 2.0 | Transition |
| 3 | REC-1 — scrolling is over | 210–420 | 7.0 | Clip |
| 4 | Slide — meet the AI RA | 420–555 | 4.5 | Slide |
| 5 | REC-2 — one prompt, best fit | 555–765 | 7.0 | Clip |
| 6 | Slide — transfers found easily | 765–885 | 4.0 | Slide |
| 7 | REC-3 — transfer, instant impact | 885–1095 | 7.0 | Clip |
| 8 | Slide — "keep asking" | 1095–1200 | 3.5 | Slide |
| 9 | REC-4 — it remembers | 1200–1410 | 7.0 | Clip |
| 10 | Capabilities cards | 1410–1605 | 6.5 | Slide |
| 11 | End card — logo + slogan | 1605–1800 | 6.5 | Slide |
| | **Total** | **1800** | **60.0** | |

> Clips are budgeted at **7s each**. If a real recording is shorter/longer, change that clip Scene's
> `durationInFrames` and shift everything after it (or let Sequences auto-place). The slide timings can stay.

---

## Transition vocabulary (keep these consistent for a professional feel)

| Transition | When | Mechanic |
|---|---|---|
| **Zoom-through** | Scene 2 only | Scale the desktop screen up to fill frame, fade bezel, crossfade to clip. Spring w/ slight overshoot + brief motion-blur. |
| **Orange sweep wipe** | Clip → Slide | A vertical seam wipes across; the seam is `gradients.orangeSweep`. Outgoing scales to 0.92. ~10f. |
| **Push-up / push-in** | Slide → Clip | Slide lifts up + fades; clip enters from below with scale 1.05→1.0 settle. ~12f. |
| **Iris / scale wipe** | REC-4 → Capabilities | Gradient expands from center over the clip. ~14f. |
| **Assemble** | Capabilities → End | Cards fly out, logo lockup springs together. ~14f. |
| **Ken Burns push-in** | Inside every clip | `scale 1.0→1.05` across the clip so static recordings feel alive. |

**Text-animation primitives (build once, reuse):**
- `WordReveal` — words spring up + fade, staggered (used on all slide hero lines).
- `TypeOn` — character-by-character reveal with blinking cursor (prompt chips, "type-on" lines).
- `KeywordSwap` — vertical-wipe swap of one keyword for another in the caption band.
- `ChipSnap` — filter chips spring in with stagger + orange left-border.
- `PulseRing` — orange ring, scale 1.0↔1.06 loop, to highlight a spot in the footage.
- `OrangeSweep` — the gradient underline/wipe seam (reused everywhere).
- `SlideBG` — the landing-gradient background + faint grid + vignette.

---

## Remotion structure (how Claude Code should build it)

- New file `src/remotion/AiRaDemo.tsx` exporting `<AiRaDemo>`.
- Register in `Root.tsx`:
  `<Composition id="AiRaDemo" component={AiRaDemo} width={1920} height={1080} fps={30} durationInFrames={1800} />`
- Add the `landingHero` gradient to `brand.ts` (§1).
- One component per scene (`Scene01Intro` … `Scene11EndCard`), each in its own `<Sequence from={..}
  durationInFrames={..}>` so `useCurrentFrame()` is scene-local. Keep scenes independently editable so we can
  **version** them (`Scene05 V2`) per `scene-revisioning.md`.
- Put the reusable primitives above in `src/remotion/components/`.
- Use `<Video>` in the Studio while iterating; switch to `<OffthreadVideo>` for the final render.
- Sync tip for Scenes 3/5/7/9: scrub the clip in the Studio, note the frame where the key beat happens
  (typing ends / results appear), and set the overlay keyframes to land on it.

---

## Your open placeholders (what to hand back to finalize)

1. **Drop the 4 recordings** into `src/remotion/public/ra/` as `rec-1.mp4 … rec-4.mp4`.
2. **Confirm the 60s length** — or tell me a target and I'll retime the slides.
3. **Clip lengths:** if any real clip isn't ~7s, tell me the actual seconds and I'll rebalance the budget.
4. **Music (optional):** drop a track and I'll wire `<Audio>` + sync keyword snaps.
5. **Capabilities cards:** confirm the 9 cards/labels in Scene 10 (add/remove/reword any).

Once you approve this flow, say the word and I'll scaffold `AiRaDemo.tsx` + the reusable components so it
renders in the Remotion Studio with placeholder clips, ready for you to drop in the real recordings.
