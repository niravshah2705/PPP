"""Unit tests for the pure form-score computation."""

import pytest

from ppp_feedback.models import TargetConfig
from ppp_feedback.scoring import compute_form_score


@pytest.fixture
def config():
    return TargetConfig(
        flexion_angle=30.0, extension_angle=160.0, tolerance=10.0, falloff=40.0
    )


def test_perfect_rep_scores_100(config):
    assert compute_form_score(30.0, 160.0, config) == 100.0


def test_within_tolerance_still_full_score(config):
    # Both targets missed by < tolerance -> still 100.
    assert compute_form_score(38.0, 152.0, config) == 100.0


def test_partial_rom_lowers_score(config):
    # Under-flexed and under-extended by 20deg each -> 10deg over tolerance.
    # component = 1 - 10/40 = 0.75 each -> 75.
    score = compute_form_score(50.0, 140.0, config)
    assert score == pytest.approx(75.0, abs=0.1)


def test_score_never_below_zero(config):
    # Both targets missed far beyond the falloff -> clamp to 0, not negative.
    # flexion off by 90 (->0), extension off by 100 (->0).
    assert compute_form_score(120.0, 60.0, config) == 0.0


def test_score_is_monotonic_with_accuracy(config):
    close = compute_form_score(40.0, 150.0, config)
    far = compute_form_score(70.0, 120.0, config)
    assert close > far


def test_overshoot_is_penalized_like_undershoot(config):
    under = compute_form_score(50.0, 160.0, config)  # missed flexion by 20
    over = compute_form_score(10.0, 160.0, config)   # overshot flexion by 20
    assert under == pytest.approx(over, abs=0.1)


def test_score_within_reportable_range(config):
    for lo, hi in [(0, 200), (30, 160), (90, 95), (45, 140)]:
        s = compute_form_score(lo, hi, config)
        assert 0.0 <= s <= 100.0
