"""Unit tests for the overlay display model."""

from ppp_feedback.models import Cue, OverlayState
from ppp_feedback.overlay import (
    COLOR_ADJUST,
    COLOR_GOOD,
    COLOR_GREY,
    OverlayRenderer,
)


def make_state(**kw):
    defaults = dict(
        angle=95.0,
        form_score=88.0,
        max_rom=120.0,
        cue=Cue.GOOD,
        active=True,
        confidence=0.9,
        rep_count=3,
    )
    defaults.update(kw)
    return OverlayState(**defaults)


def test_active_good_display():
    d = OverlayRenderer().to_display_model(make_state())
    assert d.active is True
    assert d.accent_color == COLOR_GOOD
    texts = [ln.text for ln in d.lines]
    assert "Angle: 95\u00b0" in texts
    assert "Form: 88/100" in texts
    assert "Max ROM: 120\u00b0" in texts
    assert "GOOD" in texts


def test_adjust_accent_color():
    d = OverlayRenderer().to_display_model(make_state(cue=Cue.ADJUST))
    assert d.accent_color == COLOR_ADJUST
    assert "ADJUST" in [ln.text for ln in d.lines]


def test_greyed_display_hides_numbers():
    d = OverlayRenderer().to_display_model(
        make_state(cue=Cue.GREY, active=False, form_score=None)
    )
    assert d.active is False
    assert d.accent_color == COLOR_GREY
    texts = [ln.text for ln in d.lines]
    # No misleading numbers shown while greyed out.
    assert "Angle: --" in texts
    assert "Form: --" in texts
    assert "SIGNAL LOST" in texts


def test_missing_score_shows_placeholder_when_active():
    d = OverlayRenderer().to_display_model(make_state(form_score=None))
    assert "Form: --" in [ln.text for ln in d.lines]
    # Angle and ROM still show while active.
    assert "Angle: 95\u00b0" in [ln.text for ln in d.lines]


def test_max_rom_always_visible():
    d = OverlayRenderer().to_display_model(make_state(max_rom=137.4))
    assert "Max ROM: 137\u00b0" in [ln.text for ln in d.lines]
