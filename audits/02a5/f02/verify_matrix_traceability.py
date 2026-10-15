#!/usr/bin/env python3
"""Read-only official PG/GT/PO × provisional SEC reconciliation.
Fails on missing IDs, unsafe post-gate promotion, or loss of guarded runtime wiring.
Never runs SQL, inspects secrets, or claims browser/Realtime/production approval.
"""
import argparse
import collections
import csv
import json
from pathlib import Path

EXPECTED = (
    [f"PG-{i:02d}" for i in range(1, 10)] +
    [f"GT-{i:02d}" for i in range(1, 4)] +
    [f"PO-{i:02d}" for i in range(1, 10)]
)
assert len(EXPECTED) == 21

def rows(path):
    with Path(path).open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))

def exact_ids(values, name):
    ids = [r["id"] for r in values]
    assert ids == EXPECTED, f"{name} case order / missing / duplicated IDs"

def has(path, *needles):
    src = path.read_text(encoding="utf-8")
    assert all(s in src for s in needles), "Guarded source drift in " + str(path)
    return src

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--delivery", required=True, type=Path)
    p.add_argument("--source-sha", required=True)
    args = p.parse_args()
    assert args.source_sha == "011275488660bfa1a9271b3e4c92e457f7638e34", "Pinned Delivery SHA drift"
    official = rows("audits/02a5/f02/origem-coordenacao-20261015/MATRIZ-21-CASOS-PRE-GATE.csv")
    crosswalk = rows("audits/02a5/f02/MATRIZ-21-TRACEABILIDADE-20261015.csv")
    exact_ids(official, "official")
    exact_ids(crosswalk, "crosswalk")
    assert all(x["etapa"] == y["etapa"] for x, y in zip(official, crosswalk)), "Phase drift"
    valid = {"PASS", "FAIL", "BLOCKED", "NOT RUN"}
    assert all(r["status"] in valid for r in crosswalk), "Unknown status"
    indexed = {r["id"]: r for r in crosswalk}
    for id in ("PG-03", "PG-04"):
        assert indexed[id]["status"] == "FAIL", "Cannot hide historical P0"
    assert indexed["PG-09"]["status"] == "BLOCKED", "Consumer inventory incomplete"
    for id in EXPECTED:
        if id.startswith("GT-"):
            assert indexed[id]["status"] == "BLOCKED", "No legitimate gate receipt"
        if id.startswith("PO-"):
            assert indexed[id]["status"] == "NOT RUN", "No post-gate evidence"
    assert all(r["mapeamento_sec_apenas_tematico"] for r in crosswalk)
    delivery = args.delivery.resolve(strict=True)
    assert delivery.is_dir()
    checkout = has(delivery / "src/features/storefront/components/CheckoutPanel.tsx",
                   'fetch("/api/checkout"', 'fetch("/api/order-amend"',
                   'rememberPrivateTrackingToken', 'rememberBuyerAmendmentToken',
                   'readBuyerAmendmentToken', 'VITE_NEROXA_CHECKOUT_GATEWAY')
    assert "append_public_order_items_with_payment" not in checkout
    assert "get_public_order_status" not in checkout
    has(delivery / "src/routes/api/checkout.ts", 'server:', 'handlePrivateCheckout')
    has(delivery / "src/routes/api/order-track.ts", 'server:', 'handlePrivateTracking')
    has(delivery / "src/routes/api/order-amend.ts", 'server:', 'handlePrivateOrderAmendment')
    has(delivery / "src/server/checkout-gateway.server.ts",
        "NEROXA_PRIVATE_TRACKING_ENABLED", "NEROXA_CHECKOUT_AMENDMENTS_ENABLED",
        "neroxa_register_tracking_capability", "neroxa_register_order_amendment_capability")
    has(delivery / "src/server/private-tracking-backend.ts",
        'NEROXA_BACKEND_MODE', '"homologation"', '"local-disposable"',
        'neroxa_track_order_with_capability')
    has(delivery / "src/server/order-amendment-backend.ts",
        'neroxa_append_order_items_with_capability', 'neroxa_checkout_reserve_quota')
    for name in ("private-tracking-capability.ts", "order-amendment-capability.ts"):
        source = has(delivery / "src/lib/domain" / name, "new Map<")
        assert "localStorage" not in source and "sessionStorage" not in source, name
    report = {
        "kind": "F02_OFFICIAL_21_TO_PROVISIONAL_SEC_STATIC",
        "source_delivery": args.source_sha,
        "status": "PASS_STATIC_CONTRACT_ONLY",
        "counts": dict(collections.Counter(x["status"] for x in crosswalk)),
        "official_sec01_18_definitions": "NOT_SUPPLIED",
        "mapping_sec": "TEMATIC_NOT_OFFICIAL_EQUIVALENCE",
        "browser_full_checkout": "NOT RUN",
        "auth_storage_realtime_logout_integrated": "NOT RUN",
        "f01": "OPEN",
        "f02": "OPEN_P0_READ_AND_WRITE",
        "gate": "BLOCKED",
        "post_gate": "NOT RUN",
        "commercial": "NOT RELEASED",
    }
    print("F02_OFFICIAL21_STATIC=" + json.dumps(report, sort_keys=True))
    assert len(crosswalk) == 21

if __name__ == "__main__":
    main()
