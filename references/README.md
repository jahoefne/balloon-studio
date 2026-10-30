# References

Reference files exported by the Mac app (`mac/ReferenceExporter`, work package V1) and the comparison harness (`web/harness`, V2) prove that the web app writes the same files.

- `manifest.json` — one entry per case from `mac/cases/grid.json`: SHA-256, size, triangle count and bounding box per STL, per-entry hashes, CRC and offsets for ZIP/3MF, the normalized parameters, Swift timings, and the pack's release URLs and hashes.
- `files/<sha256[0:2]>/<sha256>` — Tier A: every output or ZIP entry up to 300 KB, content-addressed (committed).
- `pack/` — Tier B: the complete export set (2.1 GB uncompressed, 336 MB as `tar --zstd`) and the complete Libm probe series, fetched from the GitHub release `refs-v2` by `bash mac/scripts/fetch-pack.sh`; not committed.
- `probes/` — outputs of the Swift probes (`mac/Probes`) that pin number formatting, rounding, JSON layout and libm behaviour; see `probes/README.md`.
- `fixtures/legacy-settings/` — settings files from kits exported by older app versions, used by the settings-migration tests on both sides (and as grid cases).
- `patch-proof.json` — proof that the only Swift patches (`StableJSON`, the NightFlight reference hook) change no geometry.
- `PACK.md` — what the manifest and the pack contain, the raster dump formats, and how to regenerate.

Regenerate on a Mac with `FONT_FILES=… bash mac/scripts/make-references.sh` (about 2 min; the font list is in `PACK.md`) and prove the patches with `bash mac/scripts/verify-swift-patches.sh`.
