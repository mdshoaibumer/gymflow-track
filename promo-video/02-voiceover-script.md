# GymFlow Track — Voiceover Script

## Voice Direction

**Voice Profile:** Male, 30-40 years old. Deep, warm baritone. Think: Apple narrator meets premium documentary.

**Tone:** Confident but not arrogant. Empathetic in the problem section, authoritative in the solution. Conversational luxury — like a trusted advisor, not a salesman.

**Pacing:** Measured and deliberate. Allow beats between sentences. Never rushed.

**Reference Voices:**
- Apple "Designed by Apple" narrator
- Stripe product video narrator
- Linear changelog narrator

---

## Full Voiceover Script (90 seconds)

### Scene 1 — The Problem (0:00–0:18)

```
[Slow, empathetic. Slight weight on "stronger people." Pause before "not."]

Running a gym...
should be about building stronger people.

[Beat — 1 second]

Not fighting paperwork.
```

**Duration:** 8 seconds of speech + 10 seconds of visual breathing room

**Direction:** Start quiet, almost reflective. The frustration is implied, not performed.

---

### Scene 2 — The Reveal (0:18–0:30)

```
[Energy lifts. Confident. "Operating system" lands with weight.]

Meet GymFlow Track.

[Beat — 0.5 seconds]

The modern operating system... for fitness businesses.
```

**Duration:** 6 seconds of speech

**Direction:** "Meet" is casual, like introducing a friend. "Operating system" is the power phrase — deliver it with gravitas.

---

### Scene 3 — Member Management (0:30–0:42)

```
[Clean, efficient delivery. Each phrase punctuated by a visual beat.]

Every member.
Every plan.
Every detail.

Organized... instantly.
```

**Duration:** 6 seconds of speech

**Direction:** Staccato rhythm on "Every member. Every plan. Every detail." — each is its own beat. "Instantly" should feel like a satisfying click.

---

### Scene 4 — QR Check-In (0:42–0:52)

```
[Brisk. Modern. Matter-of-fact confidence.]

QR check-in.
Zero friction.
Real-time attendance — automatically.
```

**Duration:** 5 seconds of speech

**Direction:** Quick, punchy delivery. This is about speed and simplicity. "Automatically" is almost thrown away — it's that effortless.

---

### Scene 5 — Trainer Management (0:52–1:02)

```
[Warmer. Human. Slightly slower pace.]

Empower your trainers.
Track every client.
Measure real progress.
```

**Duration:** 5 seconds of speech

**Direction:** This is the human moment. Warmer tone. "Real progress" should feel meaningful — not just data, but human achievement.

---

### Scene 6 — Payments & Revenue (1:02–1:14)

```
[Building confidence. Data-driven authority.]

Track every payment.
Visualize growth.
Make decisions... backed by real data.
```

**Duration:** 6 seconds of speech

**Direction:** Building energy here. "Real data" is the anchor — it contrasts with the spreadsheet chaos of Scene 1.

---

### Scene 7 — Business Dashboard (1:14–1:24)

```
[Peak authority. Executive tone.]

Your entire business.
One dashboard.

Complete clarity.
```

**Duration:** 5 seconds of speech

**Direction:** This is the confidence peak. Short, declarative. "Complete clarity" should resonate like a promise being fulfilled.

---

### Scene 8 — The Close (1:24–1:30)

```
[Inspirational crescendo. Then settle into brand authority.]

Grow memberships.
Increase revenue.
Run your gym... with confidence.

[Beat — 1.5 seconds]

GymFlow Track.

[Beat — 1 second]

Built for modern fitness businesses.
```

**Duration:** 10 seconds of speech

**Direction:** The three commands build in intensity. The final "GymFlow Track" is standalone — a name that should feel inevitable. "Built for modern fitness businesses" is the quiet, confident close.

---

## Technical Specifications

| Parameter | Value |
|-----------|-------|
| Total VO Duration | ~51 seconds of speech in 90-second video |
| Silence/Music Ratio | 43% music-only moments |
| Sample Rate | 48kHz |
| Bit Depth | 24-bit |
| Format | WAV (production) / AAC (delivery) |
| Noise Floor | < -60dB |
| Dynamic Range | 6-12dB |

---

## AI TTS Provider Recommendations

### Premium (Recommended)
1. **ElevenLabs** — Voice: "Adam" or custom clone. Style: Narrative. Stability: 0.65. Similarity: 0.80.
2. **Google Chirp3-HD** — Natural cadence, excellent pacing control.

### Free Alternative
- **Piper TTS** — Voice: `en_US-lessac-high`. Post-process with slight reverb and compression.

### OpenMontage TTS Configuration
```yaml
tts:
  provider: elevenlabs
  voice_id: "adam"
  model: "eleven_turbo_v2_5"
  settings:
    stability: 0.65
    similarity_boost: 0.80
    style: 0.45
    use_speaker_boost: true
  output_format: "pcm_24000"
```

---

## Pronunciation Guide

| Word | Pronunciation |
|------|--------------|
| GymFlow | JIM-flow (one word, emphasis on first syllable) |
| SaaS | sass (not S-A-A-S) |
| QR | cue-are |
| KPI | K-P-I (spell it out) |

---

## Delivery Notes

- Record each scene as a separate take for editing flexibility
- Provide 2-3 variations of the closing line for A/B testing
- Include a "whisper" version of "GymFlow Track" for the logo reveal
- All pauses/beats are suggestions — let the music and visuals dictate final timing in edit
