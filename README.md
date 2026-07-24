# PPP — Live Form / ROM Feedback Overlay

Real-time, patient-facing feedback layer for the PPP pose app. It consumes the
rep counter's per-frame **stage / angle / confidence** output and produces an
overlay that shows:

- **Live joint angle** (smoothed to avoid flicker)
- **Per-rep form score** (0–100, derived from how closely each rep hits its
  configured target angles)
- **Running session-max ROM** (largest range of motion reached this session)
- **Color-coded good / adjust cue** driven by the configured target thresholds
- **Grey-out on low confidence** — when landmark confidence drops, feedback is
  muted instead of showing misleading scores

## Why

Monitoring implies *quality* feedback, not just counting. Patients need
real-time correction and clinicians need form data. This module derives that
signal directly from the rep counter output.

## Usage

```python
from ppp_feedback import FeedbackEngine, TargetConfig, RepSample, OverlayRenderer

# Configure the exercise target range (e.g. a bicep curl).
config = TargetConfig(flexion_angle=30.0, extension_angle=160.0, tolerance=10.0)
engine = FeedbackEngine(config)
renderer = OverlayRenderer()

# Each frame, feed the rep counter's output:
sample = RepSample(angle=95.0, confidence=0.9, rep_count=0, stage="up")
state = engine.update(sample)

# `state` holds live angle, form_score, max_rom, cue, and active flag.
display = renderer.to_display_model(state)   # pure, testable display model
# renderer.draw(frame, state)                # optional: draw onto a cv2 BGR frame
```

### Model

- `TargetConfig` — target flexion/extension angles, scoring tolerance/falloff,
  and the `min_confidence` grey-out threshold.
- `RepSample` — one frame from the rep counter (`angle`, `confidence`,
  `rep_count`, `stage`).
- `OverlayState` — immutable per-frame snapshot the overlay draws.
- `Cue` — `GOOD` / `ADJUST` / `GREY`.

## Form score

For each completed rep the engine tracks the achieved min (flexion) and max
(extension) angle, then scores each target: full credit within `tolerance`
degrees, falling off linearly to zero over `falloff` degrees. The two component
scores are averaged into a 0–100 result.

## Anti-flicker

- The displayed angle is smoothed with an exponential moving average.
- The confidence gate and the good/adjust cue are **debounced** so brief noisy
  frames don't cause the overlay to flash.
- Low-confidence frames never mutate the angle, ROM, rep accumulators, or score.

## Development

```bash
python -m pip install -e ".[dev]"
pytest
```
