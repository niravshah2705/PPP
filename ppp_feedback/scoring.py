"""Pure form-score computation from achieved rep angles vs. target range."""

from __future__ import annotations

from .models import TargetConfig


def _component_score(error: float, tolerance: float, falloff: float) -> float:
    """Score a single angle target in ``[0.0, 1.0]``.

    Within ``tolerance`` degrees of error the component is fully credited; beyond
    that it falls off linearly over ``falloff`` degrees to zero.
    """
    if error <= tolerance:
        return 1.0
    over = error - tolerance
    return max(0.0, 1.0 - over / falloff)


def compute_form_score(
    rep_min_angle: float,
    rep_max_angle: float,
    config: TargetConfig,
) -> float:
    """Return a 0-100 form score for a completed rep.

    The score reflects how closely the rep's achieved flexion (``rep_min_angle``)
    and extension (``rep_max_angle``) match the configured target angles. A rep
    that reaches both targets scores 100; partial range-of-motion or overshoot
    lowers the score smoothly.
    """
    flexion_error = abs(rep_min_angle - config.flexion_angle)
    extension_error = abs(rep_max_angle - config.extension_angle)

    flexion = _component_score(flexion_error, config.tolerance, config.falloff)
    extension = _component_score(extension_error, config.tolerance, config.falloff)

    score = (flexion + extension) / 2.0 * 100.0
    # Guard against float drift outside the reportable range.
    return round(max(0.0, min(100.0, score)), 1)
