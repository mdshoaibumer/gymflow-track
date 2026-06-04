# GymFlow Track — Motion Graphics Plan

## Rendering Engine
**Primary:** Remotion (React-based composition)
**Secondary:** HyperFrames (HTML/CSS/GSAP for kinetic typography)

---

## 1. LOWER THIRDS & FEATURE BADGES

### Feature Badge Component
Appears during Scenes 3-7 to identify each feature being demonstrated.

```
Design:
┌─────────────────────────────────────────┐
│  ▌ Feature Name                         │
│  ▌ ═══════════════                      │
└─────────────────────────────────────────┘

Animation:
- Entry: Slide in from left (spring easing, damping 0.7, stiffness 200)
- Hold: 2.5 seconds
- Exit: Fade out + slide left

Style:
- Background: rgba(15, 20, 25, 0.85) with backdrop blur
- Left accent bar: gradient #6366F1 → #3B82F6
- Typography: Inter Semi-Bold 18px, white #F8FAFC
- Padding: 12px 24px
- Border radius: 8px
- Position: Bottom-left, 80px from edges
```

### Feature Badges Used:
| Scene | Badge Text |
|-------|-----------|
| Scene 3 | Smart Member Management |
| Scene 4 | Instant QR Check-In |
| Scene 5 | Trainer & Program Management |
| Scene 6 | Revenue Analytics |
| Scene 7 | Executive Dashboard |

---

## 2. KPI COUNTER ANIMATIONS

### Animated Number Counter
Used in dashboard shots to show numbers counting up from 0 to final value.

```
Animation Spec:
- Duration: 1.5 seconds
- Easing: easeOutExpo
- Number format: Locale-aware (commas for thousands)
- Prefix/suffix support ($, %, +)
- Font: Inter Bold 48px / 32px (depending on card size)
- Color: #F8FAFC (white) with colored accent for trend indicator

Counters Used:
1. Members: 0 → 847 (no prefix)
2. Revenue: $0 → $52,400 ($ prefix, comma separator)
3. Retention: 0% → 94% (% suffix, green #10B981)
4. Growth: 0% → +12% (+ prefix, % suffix, green #10B981)
```

---

## 3. CHART ANIMATIONS

### Line Chart Draw
Revenue growth chart that draws progressively left to right.

```
Animation Spec:
- Path drawing: SVG stroke-dasharray animation
- Duration: 2 seconds
- Easing: easeInOutCubic
- Data points: Pop in at 0.3s intervals after line reaches them
- Glow effect: Subtle drop shadow on the line (#6366F1 at 30% opacity)
- Grid lines: Fade in before chart draws (0.3s, opacity 0→0.15)
- Y-axis labels: Fade in sequentially (left to right)
- Area fill: Gradient fill fades in after line completes (0.5s)

Chart Data:
- Jan: $18K
- Feb: $24K
- Mar: $31K
- Apr: $38K
- May: $45K
- Jun: $52.4K
```

### Bar Chart Growth
Attendance bars growing from bottom.

```
Animation Spec:
- Bars grow from bottom simultaneously
- Duration: 1 second
- Easing: spring (damping 0.8, stiffness 100)
- Stagger: 0.05s between bars
- Color: Gradient bars (#6366F1 bottom → #818CF8 top)
- Labels: Fade in after bars reach full height
```

### Retention Heatmap
Grid of colored cells filling in.

```
Animation Spec:
- Cells fill in wave pattern (top-left to bottom-right)
- Duration per cell: 0.1s
- Total duration: 1.5s
- Color scale: Red (#EF4444) → Yellow (#F59E0B) → Green (#10B981)
- Easing: easeOutQuad per cell
```

---

## 4. LOGO ANIMATION

### Primary Logo Reveal (End Card)

```
Sequence (3 seconds total):

Phase 1 — Particle Convergence (0:00–1:50)
- 200 light particles scattered across frame
- Particles colored in gradient: #6366F1 → #3B82F6 → #818CF8
- Each particle: 2-4px circle with 50% opacity glow
- Motion: Random positions → converge to logo position
- Easing: spring (damping 0.6, stiffness 80)
- Slight rotation on each particle during travel

Phase 2 — Logo Solidify (1:50–2:00)
- Particles merge and form solid logotype
- Flash of light at moment of coalescence (100ms white overlay at 30%)
- Logo: "GymFlow Track" in Inter Bold
- Color: White #F8FAFC
- Subtle glow pulse (2 cycles, 0.3s each)

Phase 3 — Tagline & CTA (2:00–3:00)
- Tagline fades up: "Built for Modern Fitness Businesses"
  - Font: Inter Regular 20px
  - Color: #94A3B8 (muted)
  - Position: 24px below logo
  - Duration: 0.5s fade
- CTA button appears:
  - "Start Free Trial" pill button
  - Background: #6366F1
  - Border radius: 24px
  - Fade + slight scale up (0.95 → 1.0)
- URL fades in last:
  - "gymflowtrack.com"
  - Font: Inter Medium 16px
  - Color: #64748B
```

---

## 5. TRANSITION ELEMENTS

### Scene Transition — Wipe
```
Dark panel wipes across frame carrying the next scene behind it.
- Direction: Left to right
- Duration: 0.4s
- Panel color: #0F1419 (matches UI background)
- Easing: easeInOutCubic
- Used between: Scene 5→6
```

### Scene Transition — Zoom Through
```
Camera zooms into a UI element which becomes the next full-screen view.
- Duration: 0.3s
- Scale: 1.0 → 3.0 (then cut to new scene at 1.0)
- Easing: easeInCubic
- Used between: Scene 2→3, Scene 6→7
```

---

## 6. TEXT ANIMATIONS

### Voiceover Text Highlights (Optional — for social cuts)
```
Word-by-word highlight as voiceover speaks.
- Style: TikTok/Shorts caption style
- Font: Inter Bold 36px
- Color: White with current word in #6366F1
- Background: rgba(0, 0, 0, 0.7) pill behind text
- Position: Center-bottom, 15% from bottom edge
- Animation: Scale pop on each new word (1.0 → 1.05 → 1.0, 100ms)
- Timing: Synced to word-level timestamps from WhisperX
```

### Kinetic Typography — Problem Statement
```
Scene 1 optional enhancement:
"Running a gym should be about building stronger people"
- Each word slides in from right
- "stronger people" in bold #6366F1
- Stagger: 0.08s per word
- Easing: spring
```

---

## 7. UI ANIMATION DETAILS

### Screen Recording Enhancement
All screen captures get post-production treatment:

```
Base Treatment:
- Subtle 3D perspective (2° rotation on Y-axis)
- Soft drop shadow (0 20px 60px rgba(0,0,0,0.5))
- Rounded corners on "browser" frame (12px)
- Slight reflection on surface below (20% opacity, blurred)

Cursor Animation:
- Custom cursor: macOS-style arrow
- Movement: Bezier curves between click points
- Click effect: Subtle ripple at click point
- Speed: Natural human pace (not robotic)

Scroll Animation:
- Smooth momentum scrolling
- Slight bounce at edges
- Content reveals with parallax offset
```

---

## 8. PARTICLE EFFECTS

### Scene 2 — Screen Glow Particles
```
Soft bokeh particles floating around the laptop screen.
- Count: 15-20 particles
- Size: 4-12px
- Color: #6366F1 at 20-40% opacity
- Motion: Gentle upward float with slight horizontal drift
- Duration: Continuous loop
- Represents: Digital energy, innovation
```

### Scene 8 — Golden Dust
```
Floating golden particles in gym wide shot.
- Count: 30-40 particles
- Size: 2-6px
- Color: #F59E0B (gold) at 30-50% opacity
- Motion: Random gentle float
- Represents: Success, golden atmosphere
```

---

## 9. COLOR SYSTEM

### Primary Palette
| Role | Hex | Usage |
|------|-----|-------|
| Background | #0F1419 | UI backgrounds, scene transitions |
| Surface | #1A2332 | Cards, elevated surfaces |
| Border | #2D3748 | Subtle borders, dividers |
| Text Primary | #F8FAFC | Headlines, important text |
| Text Secondary | #94A3B8 | Descriptions, labels |
| Text Muted | #64748B | Timestamps, metadata |
| Accent Primary | #6366F1 | CTAs, highlights, brand |
| Accent Secondary | #3B82F6 | Links, secondary actions |
| Success | #10B981 | Positive trends, confirmations |
| Warning | #F59E0B | Attention, pending |
| Error | #EF4444 | Problems (Scene 1 only) |

---

## 10. REMOTION COMPOSITION STRUCTURE

```typescript
// Composition hierarchy for Remotion render
const GymFlowPromo = () => (
  <Composition
    id="GymFlowTrack-Promo"
    fps={24}
    durationInFrames={2160} // 90 seconds × 24fps
    width={1920}
    height={1080}
  >
    <Sequence from={0} durationInFrames={432}>
      <Scene1_Problem />
    </Sequence>
    <Sequence from={432} durationInFrames={288}>
      <Scene2_Reveal />
    </Sequence>
    <Sequence from={720} durationInFrames={288}>
      <Scene3_Members />
    </Sequence>
    <Sequence from={1008} durationInFrames={240}>
      <Scene4_QRCheckin />
    </Sequence>
    <Sequence from={1248} durationInFrames={240}>
      <Scene5_Trainers />
    </Sequence>
    <Sequence from={1488} durationInFrames={288}>
      <Scene6_Payments />
    </Sequence>
    <Sequence from={1776} durationInFrames={240}>
      <Scene7_Dashboard />
    </Sequence>
    <Sequence from={2016} durationInFrames={144}>
      <Scene8_Close />
    </Sequence>
    {/* Overlays */}
    <FeatureBadges />
    <Subtitles />
    <AudioTrack />
  </Composition>
);
```

---

## 11. EXPORT SPECIFICATIONS

| Deliverable | Resolution | FPS | Codec | Bitrate |
|-------------|-----------|-----|-------|---------|
| Master | 3840×2160 | 24 | ProRes 422 HQ | ~220 Mbps |
| YouTube | 1920×1080 | 24 | H.265 | 12 Mbps |
| Social (Landscape) | 1920×1080 | 24 | H.264 | 8 Mbps |
| Social (Vertical) | 1080×1920 | 24 | H.264 | 8 Mbps |
| Social (Square) | 1080×1080 | 24 | H.264 | 6 Mbps |
| GIF Preview | 480×270 | 12 | GIF | N/A |
