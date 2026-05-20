# Spacecraft models

3D models served by Vite at `/models/`. Loaded at boot via Three.js's
`GLTFLoader` (Story 1.12). LFS-tracked via the `*.glb` pattern in the
repository-root `.gitattributes`.

## voyager.glb

The Voyager spacecraft model used for both V1 and V2 instances at this
stage of development. Story 1.12 ships a single LOD level; Story 4.3 will
extend this to a full 4-level LOD chain via `acquire_models.py`.

### Source + attribution

- **Author:** NASA / JPL-Caltech.
- **Model:** "Voyager Probe (B)" from the NASA 3D Resources GitHub
  repository.
- **Upstream:**
  <https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Voyager%20Probe%20(B)>
- **Direct URL:**
  <https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Voyager%20Probe%20(B)/Voyager%20Probe%20(B).glb>
- **License:** NASA Media Usage Guidelines (public-domain in the United
  States; attribution to "NASA/JPL-Caltech" requested for visible use).

See `THIRD_PARTY.md` at the repository root for the full attribution
entry and SHA-256 hash.

### Acquisition steps (reproducible)

To re-acquire this asset (e.g., after a clean clone where the LFS pointer
hasn't been hydrated yet, or if NASA publishes an updated version):

```bash
# From the repository root:
curl -L -o web/public/models/voyager.glb \
  "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Voyager%20Probe%20(B)/Voyager%20Probe%20(B).glb"

# Verify the hash matches THIRD_PARTY.md:
sha256sum web/public/models/voyager.glb
# expected: bd86ded828dd3f459293aee4ffc3cd0998d8db67439317c8299650a1174c3289
```

If the SHA differs from `THIRD_PARTY.md`, update both files in the same
commit — NASA may have iterated on the upstream model.

### File-size budget

| Asset            | Size       | Budget (Story 1.12) | Budget (Story 4.3) |
| ---------------- | ---------- | ------------------- | ------------------ |
| `voyager.glb`    | 1.72 MB    | ≤ 5 MB              | Replaced by LOD chain |

### Notes on the deprecated NASA 3D Resources OBJ

The Story 1.12 PRD references the legacy NASA 3D Resources Voyager OBJ at
`https://nasa3d.arc.nasa.gov/detail/jpl-vtad-voyager`. As of 2026-05 the
standalone `nasa3d.arc.nasa.gov` site redirects to NASA's general 3D
portal and individual model detail pages no longer resolve. The
equivalent (higher-quality, already-converted) glTF 2.0 asset lives in
the official NASA GitHub repository linked above. The GLB used here is
the binary glTF form of NASA's own Voyager model — no third-party
re-conversion is involved.
