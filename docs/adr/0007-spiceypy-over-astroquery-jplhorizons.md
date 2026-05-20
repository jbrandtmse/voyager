# ADR 0007 — SpiceyPy over astroquery.jplhorizons

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. The bake-side ephemeris source is SpiceyPy reading local NAIF kernels. `astroquery.jplhorizons` (or any other live-API approach) is rejected.

## Context

Python has multiple paths to obtain Voyager and planetary state vectors at build time:

- **SpiceyPy:** Python binding for NAIF's CSPICE library. Reads SPICE kernels locally; deterministic; offline; matches what NASA mission software uses.
- **`astroquery.jplhorizons`:** Python wrapper for the JPL Horizons web API. Makes HTTPS requests at extract time.
- **ANISE:** Rust-native SPICE replacement. TRL 9 as of 2025 (Firefly Blue Ghost lunar lander). Has Python bindings via PyPI.
- **Other:** hand-rolled orbital mechanics from elements, hapsira/poliastro.

[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#SPICE-Ephemeris-Bindings]
[Source: _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md#Astrodynamics-Physics-Libraries]
[Source: _bmad-output/planning-artifacts/architecture.md#Category-1-Build-Time-Data-Pipeline]

## Decision

Use **SpiceyPy 8.1.0** (released 2026-04-05) reading hash-pinned local NAIF kernels (SPK/CK/PCK/LSK/FK). All extraction happens locally during the bake step — no network calls at build time after `just acquire` has fetched and SHA-verified the kernels (see ADR 0011).

SpiceyPy version is pinned exactly (`==8.1.0`) in `bake/pyproject.toml` to support NFR-R4 byte-identical bake reproducibility.

## Consequences

**Positive:**
- Offline, deterministic, reproducible bakes. Re-running on the same kernels gives byte-identical output.
- Direct access to CK kernel evaluation (`ckgp`, `pxform`) for attitude — same library covers both SPK trajectories and CK attitudes.
- Mature ecosystem: SpiceyPy has been maintained continuously since 2014; NAIF officially recommends it among Python bindings.
- No API rate limits, no network failures, no third-party uptime coupling.

**Negative:**
- CSPICE wheels are platform-specific (linux/amd64 for our CI, with macOS/Windows wheels also available for local dev). Acceptable — Decision 1d locks CI to linux/amd64 anyway for NFR-R4.
- Kernel files must be acquired separately and SHA-verified (covered by ADR 0011's Git LFS + auto-acquisition decision).
- Some learning curve for the SPICE toolkit's idioms (frame names, ET-vs-UTC, body IDs). Mitigated by documenting NAIF body IDs in `web/src/constants/body-ids.ts`.

**Obligations on downstream stories:**
- `bake/pyproject.toml` pins `spiceypy==8.1.0` exactly (already done in Story 1.1).
- Bake scripts (Epic 2) use `sp.spkezr`, `sp.ckgp`, `sp.pxform` etc. directly — no abstraction layer until a real need emerges.
- Kernel acquisition (ADR 0011) ensures SpiceyPy has the data it needs before bake runs.

## Alternatives Considered

- **`astroquery.jplhorizons`.** Rejected. Live JPL Horizons API is a runtime network dependency at bake time (the build becomes non-reproducible if NASA's service is slow or down), introduces rate-limit exposure, and returns time-sampled data rather than the kernel-native state vectors SpiceyPy can produce in bulk.
- **ANISE (Python bindings).** Acknowledged as a strong future option (TRL 9, used on a lunar lander). Deferred: SpiceyPy is the more conservative choice for v1 — wider ecosystem, longer track record on Voyager-specific kernel formats. The `EphemerisService` interface plus the bake-output VTRJ contract means switching extractors later requires only a new bake script, not a runtime change.
- **hapsira (succeeds the archived poliastro).** Rejected for the *kernel-evaluation* role: hapsira solves orbital mechanics from elements, not kernel reading. Useful for verification of orbital elements but not the right primary tool.
- **Hand-rolled Keplerian elements from JPL catalogues.** Rejected: low accuracy for Voyager (gravity assists, non-trivial trajectory shapes); kernel data is canonical and free.
