"""Unit tests for the data models and their validation."""

import pytest

from ppp_feedback.models import Cue, TargetConfig


def test_target_span():
    cfg = TargetConfig(flexion_angle=30.0, extension_angle=160.0)
    assert cfg.target_span == 130.0


def test_extension_must_exceed_flexion():
    with pytest.raises(ValueError):
        TargetConfig(flexion_angle=160.0, extension_angle=30.0)


def test_equal_flexion_extension_rejected():
    with pytest.raises(ValueError):
        TargetConfig(flexion_angle=90.0, extension_angle=90.0)


def test_falloff_must_be_positive():
    with pytest.raises(ValueError):
        TargetConfig(flexion_angle=30.0, extension_angle=160.0, falloff=0.0)


def test_confidence_bounds_validated():
    with pytest.raises(ValueError):
        TargetConfig(flexion_angle=30.0, extension_angle=160.0, min_confidence=1.5)


def test_cue_values():
    assert Cue.GOOD.value == "good"
    assert Cue.ADJUST.value == "adjust"
    assert Cue.GREY.value == "grey"
