import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("proof1_result", ROOT / "proof1_result.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    data = []
    gates = []
    for name, count in m.REQUIRED.items():
        item = {"id": name, "count": count, "status": "PASS", "negativeEffectPreserved": None if name.endswith("OWN") else True}
        gates.append(item)
        data.append("2026-11-04T00:00:00Z F01_PROVA1_GATE=" + json.dumps(item))
    data.append("F01_PROVA1_SUMMARY=" + json.dumps({"status": "PASS_FOCAL_ONLY", "phase": "candidate", "identityModel": "A1 and A2 same organization; C foreign organization", "gates": gates}))
    return "\n".join(data)


class TestF01Receipt(unittest.TestCase):
    def test_valid_synthetic_fixture(self):
        result = m.evaluate(fixture())
        self.assertEqual(result["status"], "PASS_FOCAL_ONLY")
        self.assertEqual(result["observations"], 15)

    def test_missing_gate_fails(self):
        self.assertRaises(ValueError, m.evaluate, fixture().replace("F01_PROVA1_GATE=", "REMOVED=", 1))

    def test_duplicate_gate_fails(self):
        rows = fixture().splitlines()
        self.assertRaises(ValueError, m.evaluate, "\n".join(rows + [rows[0]]))

    def test_mutation_without_preservation_fails(self):
        self.assertRaises(ValueError, m.evaluate, fixture().replace('"negativeEffectPreserved": true', '"negativeEffectPreserved": false', 1))

    def test_incomplete_summary_fails(self):
        self.assertRaises(ValueError, m.evaluate, fixture().replace("PASS_FOCAL_ONLY", "NOT_RUN"))


if __name__ == "__main__":
    unittest.main()
