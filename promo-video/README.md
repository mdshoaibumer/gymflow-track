# GymFlow Track — Promotional Video Production Package

## Overview

This directory contains the complete production package for a 90-second cinematic promotional video for GymFlow Track, designed to be produced using [OpenMontage](https://github.com/calesthio/OpenMontage) — an open-source agentic video production system.

## Quick Start

```bash
# 1. Clone OpenMontage
git clone https://github.com/calesthio/OpenMontage.git
cd OpenMontage
make setup

# 2. Add API keys to .env (see 12-openmontage-prompt.md for recommendations)
cp .env.example .env
# Edit .env with your keys

# 3. Open in your AI coding assistant and paste the production prompt
# from 12-openmontage-prompt.md
```

## Deliverables

| # | File | Description |
|---|------|-------------|
| 01 | [01-marketing-script.md](./01-marketing-script.md) | Complete scene-by-scene marketing script with visual direction, voiceover, and mood |
| 02 | [02-voiceover-script.md](./02-voiceover-script.md) | Voiceover script with delivery direction, TTS configuration, and pronunciation guide |
| 03 | [03-storyboard.md](./03-storyboard.md) | Detailed storyboard with ASCII frame compositions, camera notes, and transitions |
| 04 | [04-shot-list.md](./04-shot-list.md) | 30-shot production list with camera movements, lenses, durations, and equipment |
| 05 | [05-ai-image-prompts.md](./05-ai-image-prompts.md) | 20 production-ready AI image generation prompts (FLUX/gpt-image-1) |
| 06 | [06-ai-video-prompts.md](./06-ai-video-prompts.md) | 15 AI video generation prompts (Veo 2/Seedance/Kling) with motion direction |
| 07 | [07-motion-graphics-plan.md](./07-motion-graphics-plan.md) | Complete Remotion/HyperFrames composition spec with animations and color system |
| 08 | [08-music-and-sfx-plan.md](./08-music-and-sfx-plan.md) | Music composition brief, energy map, scene-by-scene SFX, and audio mix specs |
| 09 | [09-subtitles.srt](./09-subtitles.srt) | SRT subtitle file (25 cues) |
| 09 | [09-subtitles.vtt](./09-subtitles.vtt) | WebVTT subtitle file with bold emphasis styling |
| 10 | [10-editing-timeline.md](./10-editing-timeline.md) | 8-track NLE timeline with clip-by-clip placement and post-production checklist |
| 11 | [11-social-media-cuts.md](./11-social-media-cuts.md) | 15s, 30s, 60s cut-down scripts with platform-specific adaptations and A/B variants |
| 12 | [12-openmontage-prompt.md](./12-openmontage-prompt.md) | Ready-to-paste OpenMontage production prompt with budget and alternative versions |

## Video Specifications

| Property | Value |
|----------|-------|
| Duration | 90 seconds (full) / 60s, 30s, 15s (social) |
| Resolution | 1920×1080 (landscape) / 1080×1920 (vertical) |
| Frame Rate | 24fps (cinematic) |
| Color | Dark theme, premium SaaS aesthetic |
| Style | Apple commercial × Stripe product video |
| Estimated Cost | $2-5 (AI generation via OpenMontage) |

## Production Pipeline

```
Research → Proposal → Script → Scene Plan → Assets → Edit → Compose → Review → Render
```

## Target Audience

- Primary: Gym owners, fitness center operators, personal training studios
- Secondary: Fitness franchise operators, sports clubs, boutique fitness centers

## Brand Assets

- **Primary Color:** #6366F1 (Indigo)
- **Secondary Color:** #3B82F6 (Blue)
- **Background:** #0F1419 (Dark)
- **Typography:** Inter (all weights)
- **Tagline:** "Built for Modern Fitness Businesses"
