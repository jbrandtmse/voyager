"""Quaternion sign-flip walk pre-bake (ADR-0024).

A unit quaternion ``q`` and its negation ``-q`` represent the *same* rotation
but live on opposite sides of the 4-sphere. CK kernels can emit samples that
switch sign between adjacent timesteps if SPICE's internal evaluation crosses a
sign boundary. At runtime, SLERP between two opposite-sign samples interpolates
the *long way* around (≈360° − intended-angle), producing a visible
rotation-jerk artifact at sample knots.

ADR-0024 § Decision: walk each quaternion stream once at bake time and negate
any sample whose dot product with the previous sample is negative. Runtime
SLERP then sees only short-way pairs and the artifact disappears.

Algorithm (per ADR-0024 § Decision pseudocode)::

    for i in range(1, len(quats)):
        if dot(quats[i-1], quats[i]) < 0:
            quats[i] = -quats[i]

Input convention: ``(N, 4)`` numpy array of unit quaternions in SPICE
scalar-first convention ``[w, x, y, z]``. The sign-flip property is
basis-independent — the walk works on any consistent 4-vector representation —
so the same routine is also valid against ``[x, y, z, w]`` order if downstream
code ever needs it. We document the SPICE convention because that is what
``bake.src.ck_sample`` emits.

Deterministic tie-break for ``dot == 0`` (orthogonal quaternions, e.g. an
exact 180° rotation between samples): the walk does NOT flip when
``dot(q_prev, q_curr) >= 0``. ADR-0024's pseudocode reads "``< 0``" — strict —
so zero passes through unchanged. This matches the ADR's "Negative
consequence" note about the serial pass and avoids ambiguity at the boundary.

Edge cases:
- Empty array ``(0, 4)`` → returned as-is (no pairs to walk).
- Single-element array ``(1, 4)`` → returned as-is (no pairs to walk).

Determinism (NFR-R4): pure numpy ops; no host-clock reads, no ``random``
module, no parallelism. Walking is inherently sequential per ADR-0024's
"Negative consequences" note.
"""

from __future__ import annotations

import numpy as np


def walk_signs(quats: np.ndarray) -> np.ndarray:
    """Return a copy of ``quats`` walked into a sign-continuous representation.

    For every consecutive pair ``(q[i-1], q[i])``, if ``dot(q[i-1], q[i]) < 0``
    then ``q[i]`` is negated in the output. The result satisfies
    ``np.dot(walked[i], walked[i+1]) >= 0`` for every consecutive pair.

    Parameters
    ----------
    quats : np.ndarray
        Shape ``(N, 4)``, dtype ``float64``. Rows are unit quaternions; the
        component ordering convention is irrelevant to the sign-flip walk (see
        module docstring). SPICE's ``ckgp`` returns scalar-first ``[w, x, y,
        z]`` — that's the canonical bake-side ordering.

    Returns
    -------
    np.ndarray
        A new ``(N, 4)`` float64 array, sign-walked. Empty and single-element
        inputs are returned as copies of the input (no pairs to walk).
    """
    if quats.ndim != 2 or quats.shape[1] != 4:
        raise ValueError(
            f"walk_signs expects shape (N, 4); got {quats.shape}"
        )
    if quats.dtype != np.float64:
        raise ValueError(
            f"walk_signs expects dtype float64; got {quats.dtype}"
        )

    n = quats.shape[0]
    walked = quats.copy()
    # No pairs to walk for empty / single-element streams.
    if n <= 1:
        return walked
    for i in range(1, n):
        if float(np.dot(walked[i - 1], walked[i])) < 0.0:
            walked[i] = -walked[i]
    return walked


def is_sign_continuous(quats: np.ndarray) -> bool:
    """Return True iff ``dot(q[i-1], q[i]) >= 0`` for every consecutive pair.

    Defense-in-depth helper for the L1 validator. Returns True for empty /
    single-element streams (vacuously true).
    """
    if quats.ndim != 2 or quats.shape[1] != 4:
        raise ValueError(
            f"is_sign_continuous expects shape (N, 4); got {quats.shape}"
        )
    n = quats.shape[0]
    if n <= 1:
        return True
    # Element-wise dot via row sums of (q[:-1] * q[1:]). Faster than a Python loop.
    dots = np.sum(quats[:-1] * quats[1:], axis=1)
    return bool(np.all(dots >= 0.0))
