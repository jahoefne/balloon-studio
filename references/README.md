# References

Reference files exported by the Mac app (`mac/ReferenceExporter`, work package V1) and the comparison harness (`web/harness`, V2) prove that the web app writes the same files.

- `manifest.json` — one entry per case from `mac/cases/grid.json`: SHA-256, size, triangle count per STL, per-entry hashes for ZIP/3MF, the normalized parameters, Swift timings.
- `files/<sha256[0:2]>/<sha256>` — Tier A: every output or ZIP entry up to 300 KB, content-addressed (committed).
- `pack/` — Tier B: the complete export set (~1 GB uncompressed), downloaded from the matching GitHub release; not committed.
- `probes/` — outputs of the Swift probes (`mac/Probes`) that pin number formatting, rounding, JSON layout and libm behaviour.
- `fixtures/legacy-settings/` — settings files from kits exported by older app versions, used by the settings-migration tests on both sides.

Regenerate on a Mac with `bash mac/scripts/make-references.sh` (V1 adds it).
