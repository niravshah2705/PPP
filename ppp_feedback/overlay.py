"""Turn :class:`OverlayState` into a drawable display model.

The renderer is split in two so the presentation logic stays testable without a
GUI/camera stack:

* :meth:`OverlayRenderer.to_display_model` produces a pure, serializable
  :class:`OverlayDisplay` (text lines + RGB colors). This is fully unit-tested.
* :meth:`OverlayRenderer.draw` blits that model onto an image using OpenCV. It
  imports ``cv2`` lazily so the core package has no hard GUI dependency.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from .models import Cue, OverlayState

RGB = Tuple[int, int, int]

# Color palette (RGB). GREY is used whenever feedback is muted.
COLOR_GOOD: RGB = (0, 200, 0)
COLOR_ADJUST: RGB = (240, 170, 0)
COLOR_GREY: RGB = (150, 150, 150)
COLOR_TEXT: RGB = (255, 255, 255)

_CUE_COLOR = {
    Cue.GOOD: COLOR_GOOD,
    Cue.ADJUST: COLOR_ADJUST,
    Cue.GREY: COLOR_GREY,
}

_CUE_LABEL = {
    Cue.GOOD: "GOOD",
    Cue.ADJUST: "ADJUST",
    Cue.GREY: "SIGNAL LOST",
}


@dataclass(frozen=True)
class OverlayLine:
    """A single text line to render, with its RGB color."""

    text: str
    color: RGB


@dataclass(frozen=True)
class OverlayDisplay:
    """A pure, serializable description of the overlay for one frame."""

    lines: List[OverlayLine]
    cue: Cue
    accent_color: RGB
    active: bool


class OverlayRenderer:
    """Build overlay display models and (optionally) draw them with OpenCV."""

    def to_display_model(self, state: OverlayState) -> OverlayDisplay:
        """Return the pure display model for ``state``.

        When feedback is greyed out the angle/score are shown as ``--`` so the
        patient is never presented a stale or misleading number.
        """
        accent = _CUE_COLOR[state.cue]
        text_color = COLOR_TEXT if state.active else COLOR_GREY

        if state.active:
            angle_text = f"Angle: {state.angle:.0f}\u00b0"
            score_text = (
                f"Form: {state.form_score:.0f}/100"
                if state.form_score is not None
                else "Form: --"
            )
        else:
            angle_text = "Angle: --"
            score_text = "Form: --"

        rom_text = f"Max ROM: {state.max_rom:.0f}\u00b0"
        cue_text = _CUE_LABEL[state.cue]

        lines = [
            OverlayLine(angle_text, text_color),
            OverlayLine(score_text, text_color),
            OverlayLine(rom_text, text_color),
            OverlayLine(cue_text, accent),
        ]
        return OverlayDisplay(
            lines=lines,
            cue=state.cue,
            accent_color=accent,
            active=state.active,
        )

    def draw(self, frame, state: OverlayState, *, origin: Tuple[int, int] = (12, 28)):
        """Draw the overlay onto ``frame`` (a BGR image) using OpenCV.

        ``cv2`` is imported lazily; callers that only need the display model do
        not require OpenCV to be installed. Returns the mutated frame.
        """
        try:
            import cv2  # type: ignore
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise RuntimeError(
                "OpenCV (cv2) is required for OverlayRenderer.draw; "
                "install opencv-python or use to_display_model instead."
            ) from exc

        display = self.to_display_model(state)
        x, y = origin
        line_height = 26
        for i, line in enumerate(display.lines):
            # OpenCV expects BGR; convert from our RGB palette.
            b, g, r = line.color[2], line.color[1], line.color[0]
            cv2.putText(
                frame,
                line.text,
                (x, y + i * line_height),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (b, g, r),
                2,
                cv2.LINE_AA,
            )
        return frame
