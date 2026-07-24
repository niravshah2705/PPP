"""Live form / range-of-motion (ROM) feedback overlay for the PPP pose app.

This package turns the rep counter's per-frame stage/angle output into a
patient-facing feedback overlay: the live joint angle, a per-rep form score,
the running session-max ROM, and a color-coded good/adjust cue. Low-confidence
landmark frames are greyed out instead of surfacing misleading scores.
"""

from .models import (
    Cue,
    OverlayState,
    RepSample,
    TargetConfig,
)
from .engine import FeedbackEngine
from .overlay import OverlayDisplay, OverlayLine, OverlayRenderer

__all__ = [
    "Cue",
    "OverlayState",
    "RepSample",
    "TargetConfig",
    "FeedbackEngine",
    "OverlayDisplay",
    "OverlayLine",
    "OverlayRenderer",
]
