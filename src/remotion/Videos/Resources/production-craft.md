# Direct Recruit — Video Production Craft (Remotion)

**The technical playbook for building these videos.** This is the "how to
actually build it" companion to the creative/style docs:

- [`text-style.md`](./text-style.md) — typography + color (source of truth; also in `src/remotion/brand.ts`)
- [`scene-composition.md`](./scene-composition.md) — visualize the idea, don't caption the script
- [`creative-unlock-rules.md`](./creative-unlock-rules.md) — act like a creative director, not a caption generator
- [`scene-revisioning.md`](./scene-revisioning.md) — never replace a scene, version it (`Scene X V2`)
- [`social-post-formats.md`](./social-post-formats.md) — the 1080x1350 frame decision + photo-collage export

This doc covers what those don't: the **animation recipes, the seamless-transition
system, the audio pipeline, timing conventions, the verification workflow, the
gotchas, and a full worked breakdown of the AI RA Launch video.** Everything here
was learned building that video — treat it as the replication manual.

---

## 0. TL;DR — the rules that matter most

1. **One shared component per persistent element.** Anything that lives across a
   scene cut (a logo, a title lockup, a chat bubble) is ONE component rendered in
   **identical geometry** on both sides of the cut. See §4.
2. **Settle before the cut, then HARD-SWAP — never crossfade two copies of the
   same thing.** Crossfading two opaque copies washes out (their alphas don't sum
   to 1) and, if they're at slightly different positions, ghosts/jumps. See §4 + §7.
3. **Match the exact transform on both sides.** Even at `scale(1)`, a nested
   transform rasterizes edges differently than a clean single transform → a
   sub-pixel "shimmer" flash. Draw the settled element the same way the next scene
   draws it. See §7.
4. **Trim leading silence in every SFX** with `startFrom` so the sound *onset*
   lands on the visual beat. See §5.
5. **Verify by rendering, not by eyeballing the Studio preview.** Studio's live
   player hiccups at `<Sequence>` boundaries even when the export is perfect.
   Render stills / short MP4s and pixel-measure. See §6.

---

## 1. Project setup, structure & commands

### Files
```
src/remotion/
  index.ts               # entry point (registers Root)
  Root.tsx               # <Composition> registry
  brand.ts               # colors, gradients, fonts, type scale (import these)
  AiRaDemo.tsx           # THE video — all scenes + timeline in one file
  components/primitives.tsx  # SlideBG, WordReveal, TypeOn, OrangeSweep, etc.
  public/                # assets: dr-logo.png, app-store-badge.svg, ra/*, logos/*
  Videos/Resources/*.md  # these docs
```

### The composition
Registered in `Root.tsx`. AI RA Launch: **1920×1080, 30fps, 1122 frames (~37.4s)**.
Whenever total scene duration changes, update `durationInFrames` in BOTH `Root.tsx`
and any place that reads it.

### Commands (run from project root)
```bash
# Studio (live preview — but see §6 re: its hiccups)
npx remotion studio src/remotion/index.ts

# Full render — ALWAYS pass --public-dir or assets 404
npx remotion render src/remotion/index.ts AiRaDemo out/ai-ra-launch.mp4 --public-dir="src/remotion/public"

# Render a frame range (fast iteration on one transition)
npx remotion render src/remotion/index.ts AiRaDemo out/clip.mp4 --frames=440-470 --public-dir="src/remotion/public"

# Single still at a frame (for pixel verification)
npx remotion still src/remotion/index.ts AiRaDemo out/f.png --frame=455 --public-dir="src/remotion/public"

# Inspect audio/video streams of a render
npx remotion ffprobe out/clip.mp4

# Detect leading silence in an SFX (for §5 trim math)
npx remotion ffmpeg -i "src/remotion/public/ra/Whoosh.mp3" -af "silencedetect=noise=-40dB:d=0.02" -f null -
```
> `--public-dir="src/remotion/public"` is **required** on every render/still.
> `remotion.config.ts` also sets the entry point + public dir, but pass the flag anyway.
> `package.json`'s `video:render` script is MISSING the flag — don't use it; use the full command.

---

## 2. The timing model (frames, fps, global vs local)

- **30 fps.** 1 second = 30 frames. Convert seconds→frames as `round(sec * 30)`.
- **Each scene is a `<Sequence from={G} durationInFrames={D}>`.** Inside a scene,
  `useCurrentFrame()` returns the **LOCAL** frame (starts at 0 at the scene's `from`).
- **Global frame = scene `from` + local frame.** Audio cues and any cross-scene
  reasoning are in GLOBAL frames. Keep a single source-of-truth map (see §8).
- **Naming:** scenes are named `S1`…`S5` in the timeline `<Sequence name="...">`.
  These are just Studio labels; they don't affect output.

**When a scene's duration changes, every later scene's `from` shifts** — re-derive
all downstream global cue frames. This is the #1 source of "the sound is off now"
regressions.

---

## 3. Animation recipes (the vocabulary)

All motion is `useCurrentFrame()` → `interpolate`/`spring`. Standard damping is
`{ damping: 200 }` (smooth, minimal overshoot — the house default).

### Spring settle (position/scale that eases to rest)
```tsx
const s = spring({ frame: frame - START, fps, config: { damping: 200 } });
const y = interpolate(s, [0, 1], [40, 0]);      // slides up 40px → rest
const scale = interpolate(s, [0, 1], [1.35, 0.7]); // shrinks
```
A damping-200 spring is ~95% settled ~18f (0.6s) after start, ~99% by ~24f, and
asymptotically approaches — **it never mathematically reaches the target.** This
matters for hard-swaps (§4): swap only after it's visually settled, and make the
END VALUE exact (don't rely on the spring landing on it).

### Fade in / hold / out (opacity envelope)
```tsx
const op = interpolate(frame, [start, start+6, end-6, end], [0, 1, 1, 0],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
```
4-stop envelope = fade in (6f) · hold · fade out (6f). ALWAYS `clamp` both sides or
values run past 0/1 off-window.

### Rise-in (text entrance) — the signature line entrance
```tsx
const riseS = spring({ frame: frame - start, fps, config: { damping: 200 } });
const rise = interpolate(riseS, [0, 1], [22, 0]);  // rises 22px into place
// apply: transform: `translateY(${rise}px)`, opacity: <fade envelope>
```

### Type-on (characters appear one at a time)
```tsx
const CPS = 1.4; // chars per FRAME (higher = faster). 1.4 reads as brisk typing.
const typedCount = Math.max(0, Math.min(TEXT.length, Math.floor((frame - START) * CPS)));
const typed = TEXT.slice(0, typedCount);
```
For a long single-line prompt that overflows, scroll it left so the caret stays
visible: `marginLeft: -max(0, typedCount * CHAR_W - VIEW_W)`.

### Cursor + click ripple
The web cursor is a div at `(x, y)` (its tip). Push targets DOWN by ~40px
(`TIP_OFFSET`) so the arrow tip — not its top-left — lands on the element. Click =
an expanding/fading ring ripple keyed off the click frame. Button press = a scale
dip via `1 - sin(pulse * π) * 0.12`.

### Consistent multi-line sequences
When several lines play in series and should feel even, give them **identical
window length + identical gap**. E.g. 3 lines in a fixed span: each `35f`
(6f in · 23f hold · 6f out), `2f` gap. Compute: `perLine = (span - gaps) / n`.

---

## 4. THE transition system (seamless scene handoffs)

This is the heart of these videos and where almost all the effort went. The goal:
**an element that persists across a cut must not flash, move, or shimmer.**

### The principle
For any element present at the END of scene A and the START of scene B:
1. **Render it via ONE shared component** (e.g. `RaAnchor`, `RaPromptBubble`) so
   both scenes draw the same DOM/CSS.
2. **Make scene A settle that element onto scene B's EXACT resting geometry
   BEFORE the cut** (same position, same size, same single transform).
3. The boundary frame is then pixel-identical on both sides → invisible cut.

### Crossfade vs hard-swap (critical)
When scene A morphs an animated element onto a settled one, you have two copies
briefly. **Do NOT crossfade them with opacity.** Two half-opaque copies of the
same art do not sum to full opacity — the element **washes out to near-invisible
mid-fade** (measured: title pixels dropped to ZERO for several frames), and if the
two copies sit at slightly different positions you also get a **ghost / double
image + a jump**. Both artifacts were reported by the user as "the logo disappears
and the line jumps."

**Fix: HARD-SWAP on a single frame.** Because the animated copy has settled onto
the target's exact geometry by the swap frame, an instant swap (no opacity ramp)
is invisible AND there's never a semi-transparent middle.
```tsx
const SWAP = 100;                         // frame where the anim copy has fully landed
const useSettled = frame >= SWAP;
{!useSettled && <AnimatedCopy .../>}      // motion up to the swap
{useSettled  && <SettledCopy  .../>}      // exact target geometry, held still
```
Crossfades are ONLY appropriate when the two things genuinely DIFFER and you *want*
a blend (e.g. a real dissolve between different images).

### Match the exact transform (the shimmer trap)
Even when position + size measure identical, a flash can remain because of
**sub-pixel edge rasterization.** If scene A draws the element inside a nested
transform (`scale(zoom) → scale(0.7)`, or any wrapper with a non-default
`transformOrigin`) while scene B draws it with a single clean `scale(0.7)`, the
browser antialiases the text edges slightly differently. Measured: the antialiased
("soft edge") pixel count jumped ~40px at the cut with NO change within either
scene — a real, visible shimmer.

**Fix:** in scene A's settled state, draw the element with the **identical single
transform scene B uses**, outside any zoom wrapper. Then both sides rasterize the
same. (This is why `RaAnchor` settled-state in S1/S2 uses the same
`translateY(...) scale(0.7)` that S3 uses, not the interaction zoom wrapper.)

### Land the endpoint EXACTLY (don't trust the spring)
A spring approaches but never equals its target, and a scale of `121.5/170`
renders ~1.5px larger than a `120px`-width element. Those tiny mismatches show as a
pop at a hard-swap. **Set the animated endpoint to the target's exact values:**
```tsx
// land at EXACTLY the settled logo width, not an approximation:
const groupScale = interpolate(shrinkS, [0, 1], [1.35, RA_ANCHOR_LOGO_W / LOGO_SIZE]);
```
and tune the companion `translateY` so the vertical center matches to the pixel.

### Carry motion continuously across the cut
For something that should look like it *flies* from one scene into the next (the
sent prompt): render the SAME bubble component in frame-space (outside any zoom
wrapper) in scene A, animate it to scene B's resting spot, and settle it a few
frames BEFORE the cut. Scene B shows that same bubble **already at rest** (no
slide, no fade). Result: one continuous element, seamless boundary.

---

## 5. Audio

Remotion mixes any number of `<Audio>` layers and bakes them into the render.
Supported: mp3/wav/aac/m4a/ogg. It does NOT generate audio — you supply files.

### Where files live
`src/remotion/public/ra/` (e.g. `Background Music.mp3`, `Mouse Click.mp3`,
`Typing.mp3`, `Whoosh.mp3`). Reference via `staticFile("ra/Name.mp3")`.

### The silence-trim rule (the thing that makes SFX feel on-beat)
**Almost every SFX file has leading silence.** If you place it raw, the sound fires
LATE (0.1–0.5s) and feels disconnected. Measure the silence and skip it with
`startFrom` (in frames) so the ONSET lands on the beat.
```bash
npx remotion ffmpeg -i "src/remotion/public/ra/Whoosh.mp3" -af "silencedetect=noise=-40dB:d=0.02" -f null -
# read the first silence_end (seconds) → startFrom = round(seconds * 30)
```
Measured for the current AI RA files (@30fps):

| File | Leading silence | `startFrom` |
|---|---|---|
| Background Music | 0.495s | 15 |
| Typing | 0.437s | 13 |
| Mouse Click | 0.141s | 4 |
| Whoosh | 0.067s | 2 |

> Re-measure whenever a file is replaced — the trim is per-file.

### Placement pattern
- **Background music:** one `<Audio>` at the composition level (not in a Sequence),
  `startFrom` to skip silence, with a volume ENVELOPE that fades in over ~0.7s and
  out over the last ~1.5s:
  ```tsx
  <Audio src={AUDIO.music} startFrom={15}
    volume={(f) => interpolate(f,
      [0, 20, durationInFrames-45, durationInFrames-1], [0, 0.28, 0.28, 0],
      { extrapolateLeft:"clamp", extrapolateRight:"clamp" })} />
  ```
- **A one-shot SFX on a beat:** wrap in `<Sequence from={GLOBAL_CUE} durationInFrames={~30}>`
  and set `startFrom` to trim silence. The Sequence positions it globally; `startFrom`
  aligns the onset.
  ```tsx
  <Sequence from={CUE.sendClick} durationInFrames={30}>
    <Audio src={AUDIO.click} startFrom={4} volume={0.9} />
  </Sequence>
  ```
- **Repeated SFX** (whoosh per result row): map over the cue frames, one Sequence each.

### Levels used (current baseline — tune by ear)
Background music `0.28` · Typing `0.7` · Clicks `0.9` · Whoosh `0.1625`
(whoosh was dialed down twice from 0.65; SFX volumes are subjective — always
render and listen, don't trust the number).

### Verifying audio
`npx remotion ffprobe out/clip.mp4` must show an `Audio: aac` stream. Timing is
best judged by LISTENING to a short render — the frame math + silence-trim gets it
on-beat, but only ears confirm feel. (Note: with a constant music bed under
everything, `silencedetect` on the render finds nothing — that's expected, not a bug.)

---

## 6. Verification workflow (don't trust the preview)

**Remotion Studio's live player hiccups at `<Sequence>` boundaries** — it can
drop/duplicate a frame at a cut, which looks like a flash even when the EXPORT is
pixel-perfect. Never diagnose a transition from live playback alone. Instead:

1. **Render stills** at the boundary frames (and a few on each side):
   `npx remotion still ... --frame=N`.
2. **Pixel-measure** them with a `sharp` script — find the bounding box / pixel
   count of the logo, title, bubble by color threshold, and compare across the cut.
   Color filters that worked here:
   - Logo orange: `r>180 && g>90 && g<175 && b<95`
   - White text: `r>220 && g>220 && b>220`
   - Solid orange bubble fill: `r>230 && g>80 && g<140 && b>30 && b<90`
   - Antialiased "soft edge" (shimmer detector): `r>150 && g>150 && b>150` minus strict-white
3. **Measure the whole motion arc, not just the two boundary frames.** A flash can
   come from motion a few frames INTO the next scene, or a slide that's only
   visible mid-transition — boundary-only measurement misses it. (This bit us: the
   logo measured stable at the cut but was sliding 40px during the collapse.)
4. **Render a short MP4** across the transition and (for audio) listen.
5. **Clean up** all `out/*.png` verification stills when done.

A stable transition reads as: logo cx/cy/w and title pixel-count IDENTICAL across
the boundary, and the "soft edge" count identical too (that's the shimmer check).

---

## 7. Gotchas (hard-won — read before touching a transition)

1. **Crossfading two copies of the same element washes it out** (alphas don't sum
   to 1) and ghosts if positions differ. Use a hard-swap once settled. (§4)
2. **Nested transforms shimmer.** `scale(1)×scale(0.7)` ≠ `scale(0.7)` at the pixel
   level. Match the exact single transform the next scene uses. (§4)
3. **Springs never reach their target.** Set exact end values for hard-swap
   endpoints; swap only after visual settle (~18–24f in). (§3, §4)
4. **A scale ratio ≠ a pixel width.** `121.5/170` rendered ~1.5px bigger than a
   `120px` element → pop. Derive scale from the target's actual size. (§4)
5. **SFX leading silence** makes sounds fire late. Always `startFrom`-trim. (§5)
6. **Changing a scene's duration shifts every later `from`** and every downstream
   global audio cue. Re-derive them all. (§2)
7. **Sequence order of appearance ≠ title.** After renaming labels S1–S5, don't
   assume "S3" = a given `from`; read the actual `from`. (Caused a mis-measured
   boundary once — confirm the cut frame before measuring.)
8. **`--public-dir` omitted = 404 on assets** during render. Always pass it. (§1)
9. **Element that must appear at frame 0 of a scene** needs opacity `1` AT frame 0
   — a fade-in `[0, 6]` leaves it invisible for the first frames. Start the
   envelope already-on if it must be present immediately (e.g. the loading bubble).
10. **Studio preview flash ≠ render flash.** Confirm in a rendered MP4 before
    "fixing" a transition; you may be chasing a preview ghost. (§6)
11. **`transient NetworkError` on a still/render** is usually a transient bundler/
    font hiccup — just retry the same command.

---

## 8. Worked example — the AI RA Launch video (full map)

**Composition:** `AiRaDemo`, 1920×1080, 30fps, **1122 frames**.
Dark navy brand bg (`gradients.landingHero`) via shared `<SlideBG />` in every scene.

### Timeline (global frames)
| Scene | Name | `from` | dur | Component | What it is |
|---|---|---|---|---|---|
| S1 | `S1` | 0 | 225 | `Scene02Meet_Merged` | Logo reveal → lockup → "AI Recruiting Assistant" + 3 flash lines |
| S2 | `S2` | 225 | 230 | `Scene05_RaLanding` | AI RA chat UI: cursor types prompt, clicks send |
| S3 | `S3` | 455 | 167 | `SceneRaOutput` | Prompt bubble + loading + 5 result cards |
| S4 | `S4` | 622 | 320 | `SceneKeepAsk_Output2` | "Keep asking" → click suggestion → 2nd answer |
| S5 | `S5` | 942 | 180 | `Scene11EndCard` | End card: logo + name + App Store badge + directrecruit.net |

### S1 internal beats (local frames)
- f0: DR logo centered. f16: reveal spring — logo slides LEFT, "Direct Recruit" +
  slogan slide out to its right as a centered pair.
- f72: shrink begins — logo shrinks + rises + **re-centers straight to frame-center**
  (the `ContinuousLockup`; `groupScale` lands at `RA_ANCHOR_LOGO_W/LOGO_SIZE`).
- f100: **hard-swap** to the settled `RaAnchor` (exact geometry S2/S3 use). Title
  ("AI Recruiting Assistant") fades in f100–110, shown solo ~f110–114.
- 3 lines, **each 35f (6f in · 23f hold · 6f out), 2f gap**, all identical duration:
  L1 "Stop scrolling on social media" [114,149] · L2 "Stop scrolling databases"
  [151,186] · L3 "Start recruiting with **AI**" (AI in orange) [188,223].
- f224→225 cut into S2: anchor pixel-identical (verified).

### S2 internal beats (local frames; +225 for global)
- Chat UI (dark navy, orange accent, faithful to the real College Coach AI RA).
- Cursor rises, clicks the box (f52), zooms in (f60–80).
- **Typing** the prompt: f84 → f157 (`CPS 1.4`). Prompt overflows → scrolls left.
- Cursor moves to send, **clicks send at f193** → button press pulse.
- Outro (f199+): zoom back to 1x; anchor + prompt bubble settle onto S3's resting
  spots; **settled-anchor hard-swap** so the S2→S3 cut is pixel-identical; the
  prompt bubble flies up and is at REST by the cut.

### S3 internal beats (local frames; +455 for global)
- Prompt bubble already at rest at f0 (flew in from S2). Anchor at top (shrunk 0.7).
- **Loading/thinking bubble visible AT f0** (opacity 1 immediately, no fade-in gap),
  fades out by f78.
- **5 result cards** stagger in: f82, 94, 106, 118, 130 (`RAO_ROW_STAGGER = 12`),
  each with an animated AI-Match fit badge (6-tier color scale, see `text-style.md`).
  Players: Marcus Ellison (HS, 92), Jordan Vance (transfer, 84), Tyler Brooks (HS,
  71), Cameron Diaz (transfer, 63), Devin Carter (HS, 58).

### S4 internal beats (local frames; +622 for global)
- 3 suggestion chips; cursor **clicks "Who has the best stats?" at f62**.
- Clicked chip morphs into a chat bubble and flies into the conversation (f74–100);
  thinking dots f108–150; typed answer about Jordan Vance from f154 (`CPS 2.4`).

### S5 — end card
- Original logo animation + "Direct Recruit" + slogan + orange sweep, App Store
  badge (`app-store-badge.svg`), and "directrecruit.net".

### Audio cues (GLOBAL frames)
| Cue | File | Global frame(s) | `startFrom` | Volume |
|---|---|---|---|---|
| Background music | Background Music.mp3 | 0 → end | 15 | env 0→0.28→0 |
| Typing | Typing.mp3 | 309 → 382 | 13 | 0.7 |
| Send click | Mouse Click.mp3 | 418 | 4 | 0.9 |
| Whoosh ×5 (result rows) | Whoosh.mp3 | 537, 549, 561, 573, 585 | 2 | 0.1625 |
| "Best stats" click | Mouse Click.mp3 | 684 | 4 | 0.9 |

Cue frames are derived: `typing = 225+84`, `sendClick = 225+193`,
`rows = 455 + {82,94,106,118,130}`, `bestStatsClick = 622+62`. **If any scene
duration changes, re-derive these.**

### Shared components to reuse in future videos
- `SlideBG` — the brand navy background (every scene).
- `RaAnchor` — logo + "AI Recruiting Assistant" title lockup (the persistent
  cross-scene element; `RA_ANCHOR_LOGO_W = 120`, title 96px, drawn with one clean
  transform).
- `RaPromptBubble` — the orange user-prompt chat bubble (shared between S2's fly-in
  and S3's resting state so the handoff is pixel-identical).
- `RaChatBoxTyped`, `RaFitBadge`, `RaThinkingDots`, `CursorArrow` — the AI RA UI kit.

---

## 9. Building a NEW video — checklist

1. Read the 4 sibling docs first (creative philosophy + style). Import tokens from
   `brand.ts` — never hard-code hex/fonts.
2. Sketch the scene list; assign each a `<Sequence>` with `from`/`durationInFrames`.
   Keep a global-frame map (like §8) as you go.
3. Build each scene as its own component using the §3 recipes. Standard damping 200.
4. For every element that persists across a cut, follow §4: one shared component,
   settle-before-cut, hard-swap, exact transform.
5. Add audio last (§5): drop files in `public/`, measure silence, `startFrom`-trim,
   place on global cue frames, set levels, render + listen.
6. Verify every transition per §6 (stills + pixel-measure + short MP4). Never trust
   the Studio preview for flashes.
7. Revisions → version the scene (`Scene X V2`), don't overwrite (`scene-revisioning.md`).
8. Final render with `--public-dir`. Clean up verification stills.
