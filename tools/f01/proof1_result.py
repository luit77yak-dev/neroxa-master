"""Fail-closed offline gate for F01 Prova 1 native-log receipts.

This parser does not run any services or query a database. It only evaluates
observations emitted by the already-approved native harness. It does not certify
F02, SEC18, commercial release or host isolation.
"""
import json
import pathlib
import sys

REQUIRED = {
    "R-SAME-ORG": 2,
    "R-CROSS-ORG": 1,
    "W-SAME-ORG": 3,
    "W-CROSS-ORG": 3,
    "R-OWN": 3,
    "W-OWN": 3,
}


def evaluate(content: str) -> dict:
    gates = {}
    summaries = []
    for line in content.splitlines():
        for marker, dest in (("F01_PROVA1_GATE=", gates), ("F01_PROVA1_SUMMARY=", summaries)):
            if marker not in line:
                continue
            suffix = line.split(marker, 1)[1].strip()
            try:
                record = json.loads(suffix)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Malformed {marker} JSON") from exc
            if marker.startswith("F01_PROVA1_GATE"):
                key = record.get("id")
                if not isinstance(key, str) or key in dest:
                    raise ValueError("Missing or duplicate gate id")
                dest[key] = record
            else:
                dest.append(record)
    if set(gates) != set(REQUIRED):
        raise ValueError("Missing or unexpected F01 gate receipts")
    if len(summaries) != 1:
        raise ValueError("Exactly one completed F01 summary required")
    for key, count in REQUIRED.items():
        item = gates[key]
        if item.get("status") != "PASS" or item.get("count") != count:
            raise ValueError(f"Incorrect F01 gate {key}")
        if key not in ("R-OWN", "W-OWN") and item.get("negativeEffectPreserved") is not True:
            raise ValueError(f"No unchanged-state witness for {key}")
    summary = summaries[0]
    if summary.get("status") != "PASS_FOCAL_ONLY" or summary.get("phase") != "candidate":
        raise ValueError("F01 summary not a completed candidate")
    if summary.get("identityModel") != "A1 and A2 same organization; C foreign organization":
        raise ValueError("Invalid fixture lineage")
    if summary.get("gates") != [gates[k] for k in REQUIRED]:
        raise ValueError("Summary does not match individual receipts")
    return {"status": "PASS_FOCAL_ONLY", "gates": len(gates), "observations": sum(v["count"] for v in gates.values()), "F02": "NOT_RUN", "SEC18": "BLOCKED", "commercial": "NO_GO"}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 proof1_result.py <log-file>")
    try:
        output = evaluate(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError) as exc:
        print("F01_PROVA1_RECEIPT=FAIL_CLOSED; " + str(exc))
        raise SystemExit(1)
    print("F01_PROVA1_RECEIPT=" + json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main()
