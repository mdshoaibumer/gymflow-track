# GymFlow Track — OpenMontage Production Prompt (Free Build)

## Overview

This file contains the ready-to-paste production prompt for [OpenMontage](https://github.com/calesthio/OpenMontage) — an open-source agentic video production system. This version uses **entirely free tools and APIs** with $0 cost.

---

## Prerequisites

### Free Tools & API Keys

| Provider | Purpose | Env Variable | Cost |
|----------|---------|--------------|------|
| Google Gemini | Images (Imagen 3) + Video (Veo 2) | `GEMINI_API_KEY` | Free (15 RPM / 1500 RPD) |
| Kokoro TTS | Voiceover generation (open-source) | Local install | Free |
| Pixabay / Freesound | Music + SFX | No key needed | Free |
| Remotion | Motion graphics + assembly + render | Local install (npm) | Free |

**Total cost: $0**

### Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key — that's your `GEMINI_API_KEY`
4. Free tier limits: 15 requests/min, 1,500 requests/day (more than enough)

### Setup

```bash
# 1. Clone OpenMontage
git clone https://github.com/calesthio/OpenMontage.git
cd OpenMontage
make setup

# 2. Configure environment
cp .env.example .env
# Add your Gemini key to .env:
#   GEMINI_API_KEY=your_gemini_api_key

# 3. Install Kokoro TTS (open-source voiceover)
pip install kokoro-onnx

# 4. Install Remotion (motion graphics + rendering)
npx create-video@latest --blank gymflow-video
cd gymflow-video && npm install

# 5. Copy this project's promo-video folder into OpenMontage workspace
cp -r /path/to/gymflow-track/promo-video ./projects/gymflow-track/
```

---

## Production Prompt (Free — $0)

Paste this entire block into your AI coding assistant within the OpenMontage project:

````
You are producing a 90-second cinematic promotional video for "GymFlow Track" — a gym management SaaS platform. This production uses ONLY free tools.

## Project Context
- Product: GymFlow Track (gym management software)
- Video Title: "Run Your Gym Like It's 2026"
- Duration: 90 seconds (full) + 60s, 30s, 15s social cuts
- Resolution: 1920x1080 @ 24fps
- Style: Apple commercial × Stripe product video (dark, premium, cinematic)
- Target: Gym owners, fitness center operators, personal training studios
- Budget: $0 (free APIs and tools only)

## Brand
- Primary Color: #6366F1 (Indigo)
- Secondary Color: #3B82F6 (Blue)
- Background: #0F1419 (Dark)
- Typography: Inter (all weights)
- Tagline: "Built for Modern Fitness Businesses"

## Production Files
All detailed specs are in the `projects/gymflow-track/` directory:
- `01-marketing-script.md` — Scene-by-scene script with visual direction
- `02-voiceover-script.md` — VO script with TTS config and delivery notes
- `03-storyboard.md` — Frame compositions with ASCII layouts and camera notes
- `04-shot-list.md` — 30 shots with camera movements, lenses, durations
- `05-ai-image-prompts.md` — 20 image prompts (use with Imagen 3 via Gemini)
- `06-ai-video-prompts.md` — 15 video prompts (use with Veo 2 via Gemini)
- `07-motion-graphics-plan.md` — Remotion compositions, animations, color system
- `08-music-and-sfx-plan.md` — Music brief, energy map, scene-by-scene SFX
- `09-subtitles.srt` / `09-subtitles.vtt` — Subtitle files (25 cues)
- `10-editing-timeline.md` — 8-track NLE timeline with clip-by-clip placement
- `11-social-media-cuts.md` — 15s/30s/60s cut-down scripts

## Scene Structure (8 scenes, 90 seconds)
1. THE PROBLEM (0:00–0:18) — Stressed gym owner, spreadsheets, paper chaos
2. THE REVEAL (0:18–0:30) — MacBook opens → GymFlow dashboard loads
3. MEMBER MANAGEMENT (0:30–0:42) — Add members, search, plan assignment
4. QR CHECK-IN (0:42–0:52) — Phone scan → live attendance update
5. TRAINER MANAGEMENT (0:52–1:02) — Coaching, workout builder, progress
6. PAYMENTS & REVENUE (1:02–1:14) — Invoices, charts, analytics
7. BUSINESS DASHBOARD (1:14–1:24) — Executive KPI view, full picture
8. THE CLOSE (1:24–1:30) — Thriving gym, confident owner, logo + CTA

## Production Pipeline (All Free)
Execute in this order:

### Phase 1: Image Generation (Gemini — Imagen 3)
1. Generate all 20 images from `05-ai-image-prompts.md` using Gemini API (Imagen 3)
   - API: `POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict`
   - Use consistent style tokens for character consistency
   - Resolution: 1920x1080 (specify 16:9 in prompt)
   - Rate limit: Space requests 4 seconds apart (15 RPM free tier)
   - Save to: `output/images/`

   Example API call:
   ```python
   import google.generativeai as genai
   genai.configure(api_key="YOUR_GEMINI_API_KEY")
   
   imagen = genai.ImageGenerationModel("imagen-3.0-generate-002")
   result = imagen.generate_images(
       prompt="<prompt from 05-ai-image-prompts.md>",
       number_of_images=1,
       aspect_ratio="16:9"
   )
   result.images[0].save("output/images/scene1_owner_desk.png")
   ```

### Phase 2: Video Generation (Gemini — Veo 2)
2. Generate key video clips from `06-ai-video-prompts.md` using Gemini API (Veo 2)
   - API: Use Gemini's video generation endpoint
   - Duration: 4-6 seconds each, 24fps
   - Free tier supports video generation
   - For clips that fail or hit limits, fall back to Ken Burns on the still image
   - Save to: `output/videos/`

   Example API call:
   ```python
   import google.generativeai as genai
   genai.configure(api_key="YOUR_GEMINI_API_KEY")
   
   model = genai.GenerativeModel("veo-2.0-generate-001")
   response = model.generate_videos(
       prompt="<prompt from 06-ai-video-prompts.md>",
       config={"duration": "5s", "aspect_ratio": "16:9"}
   )
   # Save video file from response
   ```

   **Fallback:** For any clips that hit rate limits, apply Ken Burns (pan/zoom)
   animation to the corresponding still image from Phase 1:
   - Slow push-in: Scenes 1, 7
   - Slow pan right: Scenes 4, 8
   - Slight drift: Scenes 2, 3, 5, 6

### Phase 3: Voiceover (Kokoro TTS — Free & Open Source)
3. Generate voiceover from `02-voiceover-script.md` using Kokoro TTS
   - Voice: Use "af_heart" (warm female) or "am_adam" (deep male baritone)
   - Generate each scene's VO separately for timing control
   - Export as: `output/audio/voiceover_scene{N}.wav` (24kHz)
   - Concatenate with silence gaps matching timeline from `10-editing-timeline.md`

   ```python
   from kokoro_onnx import Kokoro
   import soundfile as sf
   
   kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
   
   # Scene 1
   samples, sr = kokoro.create(
       "Running a gym should be about building stronger people. Not fighting paperwork.",
       voice="am_adam",
       speed=0.9
   )
   sf.write("output/audio/voiceover_scene1.wav", samples, sr)
   ```

### Phase 4: Music & SFX (Royalty-Free)
4. Download royalty-free background music and sound effects:
   - Music: Download from Pixabay (no account needed)
     - Search: "cinematic technology" or "corporate inspiring" (~90 seconds)
     - Recommended: "Digital Horizons", "Inspiring Corporate", "Tech Innovation"
     - Trim to 90 seconds, export as: `output/audio/music.wav`
   - SFX: Download from Freesound.org (free account)
     - Keyboard clicks, page flips, phone buzz, scan beep, UI sounds
     - See `08-music-and-sfx-plan.md` for full SFX list with timestamps
     - Save to: `output/audio/sfx/`

### Phase 5: Motion Graphics (Remotion — Free)
5. Build motion graphics compositions per `07-motion-graphics-plan.md`:
   - Feature badges (5 badges, Scenes 3-7)
   - KPI counter animations (4 counters: 847, $52.4K, 94%, +12%)
   - Chart animations (line chart drawing left-to-right, bar chart growing)
   - Logo animation (particle convergence → solidify → tagline)
   - Scene transitions (wipe, zoom-through)
   - Ken Burns animations on still images (where video gen unavailable)

   All built as React components in Remotion. Render at 24fps, 1920x1080.

### Phase 6: Assembly (Remotion)
6. Assemble the full video as a Remotion composition using the 8-track timeline
   from `10-editing-timeline.md`:
   - Track 0: Music (stereo, -18dB under VO)
   - Track 1: Voiceover (-6dB)
   - Track 2: SFX + Ambient (-24dB)
   - Track 3: A-Roll (AI-generated video clips or Ken Burns on images)
   - Track 4: B-Roll / Cutaways
   - Track 5: Screen captures (Remotion UI mockup animations)
   - Track 6: Transitions & effects
   - Track 7: Motion graphics (badges, counters, logo)
   - Track 8: Subtitles from `09-subtitles.vtt`

7. Apply post-production in Remotion:
   - Color grading via CSS filters: grayscale(30%) + hue-rotate for Scene 1
   - Warm saturated look for Scenes 2-8
   - Audio ducking: Music volume drops during VO sections

### Phase 7: Render (Free)
8. Render all outputs using Remotion CLI:
   ```bash
   npx remotion render src/index.ts Main output/final/gymflow-track-90s.mp4
   npx remotion render src/index.ts SixtySecondCut output/final/gymflow-track-60s.mp4
   npx remotion render src/index.ts ThirtySecondCut output/final/gymflow-track-30s.mp4
   npx remotion render src/index.ts FifteenSecondVertical output/final/gymflow-track-15s-vertical.mp4
   ```
   - Full 90s: 1920x1080, H.264, 24fps
   - 60s cut: Per `11-social-media-cuts.md`
   - 30s cut: Per `11-social-media-cuts.md`
   - 15s vertical: 1080x1920 (reframed)

## Quality Checklist
- [ ] Character consistency (reuse same Imagen 3 style tokens across scenes)
- [ ] Color grade continuity (desaturated → warm transition at 0:18)
- [ ] Audio levels balanced (VO clear over music at all times)
- [ ] Brand colors consistent (#6366F1 accent throughout UI shots)
- [ ] Timing matches voiceover script beats
- [ ] Transitions smooth (no hard cuts except where scripted)
- [ ] End card readable (logo, tagline, URL visible for 2+ seconds)
- [ ] No watermarks on any assets (all tools are truly free, not trial)
````

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Character inconsistency | Use same style description across all Imagen 3 prompts. Generate owner first, describe consistently. |
| Gemini rate limit (429 error) | Wait 60 seconds between batches. Free tier is 15 RPM. Space image gen 4s apart. |
| Veo 2 not available in free tier | Fall back to Ken Burns animation on still images. Still looks cinematic. |
| Kokoro TTS sounds robotic | Try different voices: `af_heart`, `am_adam`, `bf_emma`. Adjust speed to 0.85-0.95. |
| Music doesn't fit 90 seconds | Trim/loop in Audacity (free). Or find a closer-length track on Pixabay. |
| Video clips have artifacts | Fall back to Ken Burns on corresponding still image from Phase 1. |
| Remotion render fails | Ensure Node.js 18+. Run `npx remotion render` with `--log=verbose` for debug info. |
| Images come out wrong aspect ratio | Explicitly include "16:9 aspect ratio, 1920x1080" at end of every Imagen 3 prompt. |