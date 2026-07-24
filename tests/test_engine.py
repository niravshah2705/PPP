"""Unit tests for the FeedbackEngine — the acceptance-criteria coverage."""

import pytest

from ppp_feedback.engine import FeedbackEngine
from ppp_feedback.models import Cue, RepSample, TargetConfig


@pytest.fixture
def config():
    return TargetConfig(
        flexion_angle=30.0,
        extension_angle=160.0,
        tolerance=10.0,
        falloff=40.0,
        min_confidence=0.5,
    )


def warmup(engine, angle=95.0, conf=0.9, rep=0, n=3):
    """Push enough trusted frames to clear the confidence debounce."""
    state = None
    for _ in range(n):
        state = engine.update(RepSample(angle=angle, confidence=conf, rep_count=rep))
    return state


# -- AC1: live angle, per-rep form score, running max ROM -------------------

def test_live_angle_is_reported(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    state = warmup(engine, angle=100.0)
    assert state.active is True
    assert state.angle == pytest.approx(100.0, abs=0.1)


def test_form_score_appears_after_rep_completes(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    warmup(engine, angle=95.0)
    # No completed rep yet -> no score.
    s = engine.update(RepSample(angle=30.0, confidence=0.9, rep_count=0))
    assert s.form_score is None

    # Drive a full rep hitting both targets, then rep_count increments.
    engine.update(RepSample(angle=30.0, confidence=0.9, rep_count=0))
    engine.update(RepSample(angle=160.0, confidence=0.9, rep_count=0))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=1))
    assert s.form_score == pytest.approx(100.0, abs=0.1)
    assert s.rep_count == 1


def test_partial_rep_yields_lower_score(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    warmup(engine, angle=95.0)
    # Shallow rep: only reaches 60..130.
    engine.update(RepSample(angle=60.0, confidence=0.9, rep_count=0))
    engine.update(RepSample(angle=130.0, confidence=0.9, rep_count=0))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=1))
    assert s.form_score is not None
    assert s.form_score < 100.0


def test_running_max_rom_tracks_largest_span(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    warmup(engine, angle=95.0)
    # First rep: span 100 (50..150).
    engine.update(RepSample(angle=50.0, confidence=0.9, rep_count=0))
    engine.update(RepSample(angle=150.0, confidence=0.9, rep_count=0))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=1))
    assert s.max_rom == pytest.approx(100.0, abs=0.1)

    # Second rep smaller span (span 60) -> session max unchanged.
    engine.update(RepSample(angle=70.0, confidence=0.9, rep_count=1))
    engine.update(RepSample(angle=130.0, confidence=0.9, rep_count=1))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=2))
    assert s.max_rom == pytest.approx(100.0, abs=0.1)

    # Third rep bigger span (span 140) -> session max grows.
    engine.update(RepSample(angle=25.0, confidence=0.9, rep_count=2))
    engine.update(RepSample(angle=165.0, confidence=0.9, rep_count=2))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=3))
    assert s.max_rom == pytest.approx(140.0, abs=0.1)


def test_max_rom_is_monotonic_non_decreasing(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    warmup(engine, angle=95.0)
    last = 0.0
    for angle in [40, 150, 45, 120, 30, 160, 80]:
        s = engine.update(RepSample(angle=float(angle), confidence=0.9, rep_count=0))
        assert s.max_rom >= last
        last = s.max_rom


# -- AC2: color cues switch between good/adjust based on target thresholds ---

def test_cue_good_inside_envelope(config):
    engine = FeedbackEngine(config, smoothing=1.0, cue_debounce=1)
    s = warmup(engine, angle=95.0)
    assert s.cue == Cue.GOOD


def test_cue_adjust_outside_envelope(config):
    engine = FeedbackEngine(config, smoothing=1.0, cue_debounce=1)
    warmup(engine, angle=95.0)
    # Hyperextend well beyond extension + tolerance (160 + 10 = 170).
    s = engine.update(RepSample(angle=185.0, confidence=0.9, rep_count=0))
    assert s.cue == Cue.ADJUST


def test_cue_switches_back_to_good(config):
    engine = FeedbackEngine(config, smoothing=1.0, cue_debounce=1)
    warmup(engine, angle=95.0)
    engine.update(RepSample(angle=185.0, confidence=0.9, rep_count=0))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=0))
    assert s.cue == Cue.GOOD


def test_cue_boundary_is_inclusive(config):
    engine = FeedbackEngine(config, smoothing=1.0, cue_debounce=1)
    warmup(engine, angle=95.0)
    # Exactly at flexion - tolerance = 20 and extension + tolerance = 170.
    assert engine.update(RepSample(angle=20.0, confidence=0.9)).cue == Cue.GOOD
    assert engine.update(RepSample(angle=170.0, confidence=0.9)).cue == Cue.GOOD
    assert engine.update(RepSample(angle=19.0, confidence=0.9)).cue == Cue.ADJUST


def test_cue_debounce_prevents_flicker(config):
    engine = FeedbackEngine(config, smoothing=1.0, cue_debounce=3)
    s = warmup(engine, angle=95.0)
    assert s.cue == Cue.GOOD
    # A single out-of-range frame must NOT flip the cue (anti-flicker).
    s = engine.update(RepSample(angle=185.0, confidence=0.9))
    assert s.cue == Cue.GOOD
    s = engine.update(RepSample(angle=185.0, confidence=0.9))
    assert s.cue == Cue.GOOD
    # Third consecutive frame -> switch commits.
    s = engine.update(RepSample(angle=185.0, confidence=0.9))
    assert s.cue == Cue.ADJUST


# -- AC3: low-confidence frames grey out instead of showing false scores -----

def test_starts_greyed_until_trusted_frames(config):
    engine = FeedbackEngine(config)
    s = engine.update(RepSample(angle=95.0, confidence=0.9))
    # First frame: not enough trusted frames yet (default debounce 3).
    assert s.active is False
    assert s.cue == Cue.GREY
    assert s.form_score is None


def test_low_confidence_greys_out_after_debounce(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    warmup(engine, angle=95.0)  # active now
    # Drop confidence for the debounce window.
    for _ in range(3):
        s = engine.update(RepSample(angle=95.0, confidence=0.2))
    assert s.active is False
    assert s.cue == Cue.GREY
    assert s.form_score is None


def test_single_low_confidence_frame_does_not_grey(config):
    engine = FeedbackEngine(config, smoothing=1.0, confidence_debounce=3)
    warmup(engine, angle=95.0)
    s = engine.update(RepSample(angle=95.0, confidence=0.1))
    # One bad frame within debounce window stays active (anti-flicker).
    assert s.active is True


def test_greyed_frame_does_not_update_rom_or_score(config):
    engine = FeedbackEngine(config, smoothing=1.0, confidence_debounce=1)
    warmup(engine, angle=95.0, n=3)
    # Establish a rep and ROM.
    engine.update(RepSample(angle=30.0, confidence=0.9, rep_count=0))
    engine.update(RepSample(angle=160.0, confidence=0.9, rep_count=0))
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=1))
    good_rom = s.max_rom
    good_score = s.form_score

    # Now a low-confidence frame with an absurd angle and a bogus rep bump.
    s = engine.update(RepSample(angle=400.0, confidence=0.05, rep_count=2))
    assert s.active is False
    assert s.form_score is None            # never surface a misleading score
    assert s.max_rom == good_rom           # ROM not corrupted by bad frame
    # The bogus angle must not have widened the ROM on recovery either.
    s = engine.update(RepSample(angle=95.0, confidence=0.9, rep_count=2))
    assert s.max_rom == good_rom
    # Last good score is retained internally and re-shown when trusted again.
    assert s.form_score == good_score


def test_recovers_from_grey_without_stale_cue(config):
    engine = FeedbackEngine(config, smoothing=1.0, confidence_debounce=1)
    warmup(engine, angle=95.0, n=1)  # debounce 1 -> active immediately
    engine.update(RepSample(angle=95.0, confidence=0.1))  # grey
    s = engine.update(RepSample(angle=95.0, confidence=0.9))  # recover
    assert s.active is True
    # On recovery the cue is adopted immediately, never left on GREY.
    assert s.cue == Cue.GOOD


# -- smoothing / misc --------------------------------------------------------

def test_angle_smoothing_reduces_jitter(config):
    engine = FeedbackEngine(config, smoothing=0.5, confidence_debounce=1)
    engine.update(RepSample(angle=100.0, confidence=0.9))
    s = engine.update(RepSample(angle=140.0, confidence=0.9))
    # EMA: 0.5*140 + 0.5*100 = 120, not the raw 140.
    assert s.angle == pytest.approx(120.0, abs=0.1)


def test_reset_clears_session_state(config):
    engine = FeedbackEngine(config, smoothing=1.0)
    warmup(engine, angle=95.0)
    engine.update(RepSample(angle=20.0, confidence=0.9))
    engine.update(RepSample(angle=170.0, confidence=0.9))
    assert engine.session_max_rom > 0
    engine.reset()
    assert engine.session_max_rom == 0.0
    s = engine.update(RepSample(angle=95.0, confidence=0.9))
    assert s.active is False  # greyed again until debounce clears


def test_invalid_smoothing_rejected(config):
    with pytest.raises(ValueError):
        FeedbackEngine(config, smoothing=0.0)
    with pytest.raises(ValueError):
        FeedbackEngine(config, smoothing=1.5)


def test_invalid_debounce_rejected(config):
    with pytest.raises(ValueError):
        FeedbackEngine(config, confidence_debounce=0)
