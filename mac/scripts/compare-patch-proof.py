"""Compares two --geometry-only manifests of the reference exporter (see verify-swift-patches.sh).

Geometry (.stl, 3D/3dmodel.model) and every non-JSON entry must have identical SHA-256; JSON
must be equal after parsing (the unpatched JSONEncoder orders keys per process). Writes the
proof as JSON and exits 1 when anything differs.
"""
import argparse
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument("pristine")
parser.add_argument("patched")
parser.add_argument("--base", required=True)
parser.add_argument("--head", required=True)
parser.add_argument("--dirty", default="0")
parser.add_argument("--out", required=True)
args = parser.parse_args()
pristine = json.load(open(args.pristine))
patched = json.load(open(args.patched))


def outputs(case):
    """(name, facts) for the case's file and, for archives, each entry."""
    if "sha256" in case:
        yield case["filename"], case
    for entry in case.get("entries", []):
        yield entry["name"], entry


counts = {"cases": 0, "stl": 0, "model": 0, "json": 0, "jsonReordered": 0, "other": 0, "archives": 0, "archivesDiffer": 0, "errors": 0}
differences, reordered, cases = [], [], []
before = {c["id"]: c for c in pristine["cases"]}
for case in patched["cases"]:
    counts["cases"] += 1
    old = before.pop(case["id"], None)
    if old is None:
        differences.append({"case": case["id"], "problem": "missing in the pristine run"})
        continue
    status = "identical"
    for key in ("error", "filename", "normalized", "normalizedPattern", "normalizedPurge"):
        if old.get(key) != case.get(key):
            differences.append({"case": case["id"], "field": key, "pristine": old.get(key), "patched": case.get(key)})
            status = "differs"
    if "error" in case:
        counts["errors"] += 1
    old_outputs = dict(outputs(old))
    for name, facts in outputs(case):
        previous = old_outputs.pop(name, None)
        if previous is None:
            differences.append({"case": case["id"], "output": name, "problem": "missing in the pristine run"})
            status = "differs"
            continue
        kind = facts["kind"]
        if kind in ("zip", "3mf"):
            # Archive bytes follow their entries; the entries are compared one by one.
            counts["archives"] += 1
            counts["archivesDiffer"] += previous["sha256"] != facts["sha256"]
            continue
        if kind == "json":
            counts["json"] += 1
            if json.loads(previous["text"]) != json.loads(facts["text"]):
                differences.append({"case": case["id"], "output": name, "problem": "JSON differs after parsing"})
                status = "differs"
            elif previous["sha256"] != facts["sha256"]:
                counts["jsonReordered"] += 1
                reordered.append({"case": case["id"], "output": name})
            continue
        if kind == "stl":
            counts["stl"] += 1
        elif kind == "model":
            counts["model"] += 1
        else:
            counts["other"] += 1
        if previous["sha256"] != facts["sha256"] or previous["bytes"] != facts["bytes"]:
            differences.append({"case": case["id"], "output": name, "kind": kind, "pristine": previous["sha256"], "patched": facts["sha256"]})
            status = "differs"
    for name in old_outputs:
        differences.append({"case": case["id"], "output": name, "problem": "missing in the patched run"})
        status = "differs"
    cases.append({"id": case["id"], "status": status})
for leftover in before:
    differences.append({"case": leftover, "problem": "missing in the patched run"})

proof = {
    "tool": "mac/scripts/verify-swift-patches.sh",
    "rule": "every .stl, 3D/3dmodel.model and non-JSON entry has the same SHA-256; every JSON is equal after parsing; errors, filenames and normalized settings are equal",
    "base": {"commit": args.base, "sourcesSha256": pristine.get("sourcesSha256")},
    "patched": {"commit": args.head, "uncommittedSourceChanges": int(args.dirty), "sourcesSha256": patched.get("sourcesSha256")},
    "grid": patched.get("grid"),
    "result": "pass" if not differences else "fail",
    "counts": counts,
    "differences": differences,
    "jsonReordered": reordered,
    "cases": cases,
}
with open(args.out, "w") as f:
    json.dump(proof, f, indent=1, sort_keys=True, ensure_ascii=False)
    f.write("\n")
print(f"patch proof: {proof['result']}, {counts['cases']} cases, {counts['stl']} STL, {counts['model']} models, "
      f"{counts['json']} JSON ({counts['jsonReordered']} reordered), {counts['other']} other, {len(differences)} differences")
sys.exit(0 if not differences else 1)
