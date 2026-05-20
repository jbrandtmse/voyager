// Shared math constants for the web renderer.

// Canonical Earth-Sun distance (IAU 2012 definition, used by SPICE).
export const KM_PER_AU = 149597870.7;

// Render-space scale: 1 unit = 1 kilometer. Architecture Decision 3a / ADR 0012.
// Do not override anywhere else. The branded-type system assumes km in render
// space; changing SCALE would invalidate the precision analysis.
export const SCALE = 1;
