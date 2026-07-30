# Direct Recruit: Social Post Formats & Photo Export

**The frame-size decision and the photo-collage pipeline.** Companion to:

- [`production-craft.md`](./production-craft.md) for animation recipes, audio, and the verification workflow
- [`text-style.md`](./text-style.md) for typography + color (source of truth, mirrored in `src/remotion/brand.ts`)

---

## 1. The decision: one frame size, 1080 x 1350

**We post the same content to Instagram, X/Twitter, and TikTok.** Rather than
cut three sizes per post, everything is built at **1080 x 1350 (4:5 portrait)**.
This applies to both the video cuts and the static photo collages, so the whole
feed presence shares one frame and one look.

| Platform | How 4:5 behaves |
|---|---|
| Instagram | Native max portrait, and the profile grid is 4:5. Fills the most feed height IG allows. |
| X / Twitter | Displays uncropped in the timeline. X crops portraits taller than roughly 3:4, and 4:5 sits safely under that. |
| TikTok | Accepted, but native is 9:16, so it centers the image with blurred bars above and below. Nothing is cut off. |

TikTok is the one compromise: everything stays visible, it just does not fill
the screen. If a specific post is TikTok-first, pad the same 4:5 artwork onto a
1080 x 1920 canvas over `colors.oxfordBlue` instead of redesigning it.

### Safe area

TikTok overlays its own UI on top of whatever is underneath. Keep text, faces,
and logos out of:

- the **bottom ~15%** of the frame (caption block and progress bar)
- the **right ~12%** of the frame (like / comment / share rail)

Instagram and X do not overlay the feed image, so this constraint is driven
entirely by TikTok. Design to it anyway so one export works everywhere.

### Resolution

1080 x 1350 is the baseline. For text-heavy collages you can render at
**1440 x 1800** (identical 4:5) for crisper type, since Instagram now serves up
to 1440px wide and the other two downscale cleanly. Do this with `--scale`, not
by changing the composition dimensions, so the layout math stays put:

```powershell
npx remotion still src/remotion/index.ts <StillId> out/posts/<name>.png --scale=1.3333
```

---

## 2. Photo collages: one `<Still>` per photo, not scenes in a video

Static photo posts are built in Remotion like everything else, but each photo is
registered as its own **`<Still>`**, not as a scene inside a video composition.

**The code lives in [`src/remotion/posts/`](../../posts/):**

| File | What it is |
|---|---|
| `post-kit.tsx` | `PostFrame` shell, safe-area constants + dev guide, `PhotoSlot`, `PostFooter` |
| `CollagePost.tsx` | The parameterised collage layout (eyebrow, headline, 1-4 photos, footnote) |

**A new post is a new `<Still>` in `Root.tsx`, not a new file.** Duplicate the
registration, give it a fresh id, change the `defaultProps`. Only write a new
component when the *layout* differs, not when the *content* does.

```tsx
<Folder name="Posts">
  <Still
    id="Post-2026-08-combine"
    component={CollagePost}
    width={1080}
    height={1350}
    defaultProps={{
      eyebrow: "Signing day",
      headline: "Three commits. One platform.",
      photos: [staticFile("posts/combine-01.jpg")],
    } satisfies CollagePostProps}
  />
</Folder>
```

`<Still>` takes no `fps` and no `durationInFrames`. Export is one command per
photo, with **no frame numbers involved**:

```powershell
npx remotion still src/remotion/index.ts Post-2026-08-combine out/posts/combine.png
```

Props can also be overridden at render time, which is the fastest way to spin a
variant without touching code. `photos` accepts bare `public/`-relative paths
here, since `staticFile()` cannot be called inside CLI JSON:

```powershell
npx remotion still src/remotion/index.ts Post-2026-08-combine out/posts/v2.png --props='{"headline":"New line","photos":["posts/a.jpg","posts/b.jpg"]}'
```

### Checking the safe area

Set `showSafeArea: true` to overlay the TikTok caption and rail bands, export,
look at it, then set it back to `false`. This is not decorative: it caught the
footer sitting under TikTok's caption block the first time this template was
built.

**The gotcha it caught:** `PostFrame` sets `paddingBottom` to `SAFE_BOTTOM`, not
`POST_PAD`. If the content column runs to the full frame height, any `flex: 1`
child (the photo grid) expands into the caption band and pushes the footer under
TikTok's UI. Text and logos stay above the line; the photo grid is allowed to
run past the right edge under the rail, because a rail over the edge of an image
is fine and over a word is not.

### Why not one composition with each photo as a scene

Building a video and pulling stills out of it at frame offsets works, but it is
the worse pattern for photo posts:

- **Frame numbers rot.** Exporting means knowing that slide 4 lives at frame
  372. Retime an earlier slide and every later number silently shifts. The
  offset comments in `AiRaDemo.tsx` already drifted out of sync this way.
- **Reordering is destructive.** Inserting a photo renumbers everything after it.
  With one `<Still>` per photo, IDs are stable and order does not matter.
- **Studio shows stills as stills.** No scrubbing to find the right frame.
- **`<Still>` is the primitive built for this.** No invented `fps` or duration
  for artwork that never moves.

### If you also want a carousel video

Write each slide as a plain component (`CombineSlide1`, `CombineSlide2`, ...),
then register it **twice**: once as a `<Still>` for the PNG, and once inside a
`<Composition>` that sequences the same components. One source of artwork, two
outputs. Never duplicate the layout code.

---

## 3. Export conventions

- **Output to `out/posts/`.** `out/` is gitignored; rendered files never get
  committed.
- **PNG for text-heavy collages** (the `remotion still` default). Use
  `--image-format=jpeg --quality=90` only when the slide is mostly photography.
- **Always set `fontFamily` explicitly** on the slide's root element, imported
  from `brand.ts`. A component that omits it inherits the browser default and
  silently renders in a serif fallback. This is invisible in a busy video frame
  and glaring on a static photo where type is the whole design.
- **Verify before posting.** Read the exported PNG back and look at it. A still
  is 100% design with no motion to hide behind.
