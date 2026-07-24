"""Data models for the live form/ROM feedback overlay."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Cue(str, Enum):
    """Color-coded, patient-facing guidance cue.

    ``GOOD``   -> movement is inside the configured target envelope (green).
    ``ADJUST`` -> movement is outside the target thresholds (amber).
    ``GREY``   -> landmark confidence is too low to trust; feedback is muted.
    """

    GOOD = "good"
    ADJUST = "adjust"
    GREY = "grey"


@dataclass(frozen=True)
class RepSample:
    """One frame of output streamed from the rep counter.

    Attributes:
        stage: The rep counter's movement stage label (e.g. ``"up"``/``"down"``).
            May be ``None`` before the first stage is established.
        angle: The tracked joint angle in degrees for this frame.
        confidence: Landmark confidence in ``[0.0, 1.0]``. Frames below the
            configured threshold are treated as untrustworthy.
        rep_count: The authoritative completed-rep count from the rep counter.
            An increase signals that a rep just finished.
    """

    angle: float
    confidence: float
    rep_count: int = 0
    stage: Optional[str] = None


@dataclass(frozen=True)
class TargetConfig:
    """Configured target thresholds for an exercise.

    ``flexion_angle`` is the joint angle at full flexion (the smaller angle) and
    ``extension_angle`` is the angle at full extension (the larger angle). The
    form score rewards reps whose achieved min/max land near these targets.

    ``tolerance`` is a deadband (degrees) within which a target counts as fully
    hit; ``falloff`` is how many additional degrees of error drive a component
    score to zero. ``good_score_threshold`` is unused for the live cue but kept
    for callers that want a score-based classification.
    """

    flexion_angle: float
    extension_angle: float
    tolerance: float = 10.0
    falloff: float = 40.0
    min_confidence: float = 0.5
    good_score_threshold: float = 75.0

    def __post_init__(self) -> None:
        if self.extension_angle <= self.flexion_angle:
            raise ValueError(
                "extension_angle must be greater than flexion_angle "
                f"(got flexion={self.flexion_angle}, extension={self.extension_angle})"
            )
        if self.tolerance < 0 or self.falloff <= 0:
            raise ValueError("tolerance must be >= 0 and falloff must be > 0")
        if not 0.0 <= self.min_confidence <= 1.0:
            raise ValueError("min_confidence must be within [0.0, 1.0]")

    @property
    def target_span(self) -> float:
        """The target range-of-motion span in degrees."""
        return self.extension_angle - self.flexion_angle


@dataclass(frozen=True)
class OverlayState:
    """Immutable snapshot the overlay renderer draws each frame.

    Attributes:
        angle: Smoothed live joint angle to display (last trusted value while
            greyed out).
        form_score: Latest per-rep form score in ``[0, 100]``, or ``None`` when
            no rep has completed yet or feedback is greyed out.
        max_rom: Running maximum range-of-motion (degrees) reached this session.
        cue: Color-coded guidance cue for this frame.
        active: ``True`` when landmark confidence is trusted; ``False`` when the
            overlay is greyed out.
        confidence: Raw confidence for the current frame.
        rep_count: Completed-rep count reflected by this state.
    """

    angle: float
    form_score: Optional[float]
    max_rom: float
    cue: Cue
    active: bool
    confidence: float
    rep_count: int
