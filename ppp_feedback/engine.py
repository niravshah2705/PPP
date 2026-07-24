"""Feedback engine: rep counter output -> overlay state, frame by frame."""

from __future__ import annotations

from typing import Optional

from .models import Cue, OverlayState, RepSample, TargetConfig
from .scoring import compute_form_score


class FeedbackEngine:
    """Consume the rep counter's per-frame output and emit :class:`OverlayState`.

    The engine is stateful across a session:

    * It smooths the displayed angle with an exponential moving average so the
      overlay does not flicker between frames.
    * It accumulates the min/max angle of the in-progress rep and finalizes a
      per-rep form score when the rep counter's ``rep_count`` increases.
    * It tracks the running session-max ROM continuously as landmarks stream in.
    * It debounces both the confidence gate and the good/adjust cue so brief,
      noisy frames don't cause the overlay to flash.

    Low-confidence frames never update the smoothed angle, rep accumulators, ROM,
    or form score, so the patient is never shown a misleading value.
    """

    def __init__(
        self,
        config: TargetConfig,
        *,
        smoothing: float = 0.5,
        confidence_debounce: int = 3,
        cue_debounce: int = 2,
    ) -> None:
        """Create an engine.

        Args:
            config: Exercise target thresholds.
            smoothing: EMA factor in ``(0, 1]`` for the displayed angle. ``1.0``
                disables smoothing; smaller values smooth more heavily.
            confidence_debounce: Consecutive low-confidence frames required
                before the overlay greys out (and consecutive good frames to
                recover). Must be >= 1.
            cue_debounce: Consecutive frames a new good/adjust classification
                must persist before the displayed cue switches. Must be >= 1.
        """
        if not 0.0 < smoothing <= 1.0:
            raise ValueError("smoothing must be within (0.0, 1.0]")
        if confidence_debounce < 1 or cue_debounce < 1:
            raise ValueError("debounce values must be >= 1")

        self.config = config
        self.smoothing = smoothing
        self.confidence_debounce = confidence_debounce
        self.cue_debounce = cue_debounce

        # Displayed / smoothed angle (last trusted value).
        self._smoothed_angle: Optional[float] = None

        # Session-wide ROM and last finalized form score.
        self._session_max_rom: float = 0.0
        self._last_form_score: Optional[float] = None

        # In-progress rep accumulators.
        self._rep_min: Optional[float] = None
        self._rep_max: Optional[float] = None
        self._last_rep_count: int = 0

        # Confidence gate state (start greyed until we see a trusted frame).
        self._low_conf_streak: int = 0
        self._good_conf_streak: int = 0
        self._greyed: bool = True

        # Cue debounce state.
        self._cue: Cue = Cue.GREY
        self._pending_cue: Optional[Cue] = None
        self._pending_cue_streak: int = 0

    # -- public API ---------------------------------------------------------

    @property
    def session_max_rom(self) -> float:
        """Running maximum ROM (degrees) reached this session."""
        return self._session_max_rom

    def update(self, sample: RepSample) -> OverlayState:
        """Process one rep-counter frame and return the overlay snapshot."""
        trusted = self._update_confidence_gate(sample.confidence)

        if not trusted:
            # Greyed out: never emit a form score or move the live values.
            # Reps that complete while the signal is untrusted cannot be scored
            # honestly, so we acknowledge the rep counter's count but drop the
            # in-progress accumulators. This prevents scoring a rep from garbage
            # landmarks when confidence recovers.
            self._last_rep_count = sample.rep_count
            self._rep_min = None
            self._rep_max = None
            self._set_cue(Cue.GREY, immediate=True)
            return OverlayState(
                angle=self._display_angle(),
                form_score=None,
                max_rom=self._session_max_rom,
                cue=Cue.GREY,
                active=False,
                confidence=sample.confidence,
                rep_count=self._last_rep_count,
            )

        # Trusted frame: smooth the displayed angle.
        self._smoothed_angle = self._ema(sample.angle)

        # Accumulate the in-progress rep from the raw (unsmoothed) angle so ROM
        # reflects the true extremes the patient reached.
        self._accumulate_rep(sample.angle)

        # Update the running session-max ROM from the current rep's live span.
        self._update_session_rom()

        # Finalize a rep when the rep counter reports one more completed rep.
        self._maybe_finalize_rep(sample.rep_count)

        # Decide the live good/adjust cue from the target envelope (debounced).
        # On the first trusted frame after a grey period, adopt the cue
        # immediately so the overlay never shows an "active but grey" frame.
        target_cue = self._classify_cue(sample.angle)
        self._set_cue(target_cue, immediate=self._cue == Cue.GREY)

        return OverlayState(
            angle=self._display_angle(),
            form_score=self._last_form_score,
            max_rom=self._session_max_rom,
            cue=self._cue,
            active=True,
            confidence=sample.confidence,
            rep_count=self._last_rep_count,
        )

    def reset(self) -> None:
        """Reset all session state (e.g. when starting a new exercise set)."""
        self.__init__(
            self.config,
            smoothing=self.smoothing,
            confidence_debounce=self.confidence_debounce,
            cue_debounce=self.cue_debounce,
        )

    # -- internals ----------------------------------------------------------

    def _update_confidence_gate(self, confidence: float) -> bool:
        """Debounced confidence gate. Returns True when feedback is trusted."""
        if confidence < self.config.min_confidence:
            self._low_conf_streak += 1
            self._good_conf_streak = 0
            if self._low_conf_streak >= self.confidence_debounce:
                self._greyed = True
        else:
            self._good_conf_streak += 1
            self._low_conf_streak = 0
            if self._good_conf_streak >= self.confidence_debounce:
                self._greyed = False

        return not self._greyed

    def _ema(self, angle: float) -> float:
        if self._smoothed_angle is None:
            return angle
        a = self.smoothing
        return a * angle + (1.0 - a) * self._smoothed_angle

    def _display_angle(self) -> float:
        if self._smoothed_angle is not None:
            return round(self._smoothed_angle, 1)
        return 0.0

    def _accumulate_rep(self, angle: float) -> None:
        if self._rep_min is None or angle < self._rep_min:
            self._rep_min = angle
        if self._rep_max is None or angle > self._rep_max:
            self._rep_max = angle

    def _update_session_rom(self) -> None:
        if self._rep_min is None or self._rep_max is None:
            return
        current_rom = self._rep_max - self._rep_min
        if current_rom > self._session_max_rom:
            self._session_max_rom = round(current_rom, 1)

    def _maybe_finalize_rep(self, rep_count: int) -> None:
        if rep_count <= self._last_rep_count:
            return
        # One (or more) reps completed. Score the accumulated rep if we have data.
        if self._rep_min is not None and self._rep_max is not None:
            self._last_form_score = compute_form_score(
                self._rep_min, self._rep_max, self.config
            )
        self._last_rep_count = rep_count
        # Reset accumulators for the next rep.
        self._rep_min = None
        self._rep_max = None

    def _classify_cue(self, angle: float) -> Cue:
        """GOOD when the angle is inside the target envelope, else ADJUST."""
        low = self.config.flexion_angle - self.config.tolerance
        high = self.config.extension_angle + self.config.tolerance
        if low <= angle <= high:
            return Cue.GOOD
        return Cue.ADJUST

    def _set_cue(self, target: Cue, *, immediate: bool = False) -> None:
        """Debounce good/adjust switches to avoid flicker."""
        if immediate:
            self._cue = target
            self._pending_cue = None
            self._pending_cue_streak = 0
            return

        if target == self._cue:
            self._pending_cue = None
            self._pending_cue_streak = 0
            return

        if target == self._pending_cue:
            self._pending_cue_streak += 1
        else:
            self._pending_cue = target
            self._pending_cue_streak = 1

        if self._pending_cue_streak >= self.cue_debounce:
            self._cue = target
            self._pending_cue = None
            self._pending_cue_streak = 0
