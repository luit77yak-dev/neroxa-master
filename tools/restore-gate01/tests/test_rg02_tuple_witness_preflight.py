#!/usr/bin/env python3
"""RG02 tuple comparator: entirely fake roles/objects, NO source private data."""
import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rg02_local_effective_rights import KINDS
from rg02_tuple_witness_preflight import compare, load, main


def fixture():
    meta = {
        'format_version': 1,
        'capture_id':'11223344556677889900aabbccddeeff',
        'source_dump_sha256':'a'*64,
        'source_globals_sha256':'b'*64,
        'declared_probe_kinds':list(KINDS),
        'rows':[
            ['fake_worker','TABLE','fake_schema.one','SELECT',True],
            ['fake_worker','TABLE','fake_schema.two','SELECT',False],
            ['fake_other','ROLE','fake_worker','MEMBER',False],
            ['fake_worker','PARAMETER','work_mem','SET',None],
        ],
    }
    return [dict(copy.deepcopy(meta),scope='SOURCE'),
            dict(copy.deepcopy(meta),scope='ISOLATED_RESTORE')]


class TuplePreflightTests(unittest.TestCase):
    def test_identical_tuples_still_no_go_without_source_provenance(self):
        a,b=fixture()
        report=compare(a,b)
        self.assertEqual(report['common_tuples_equal_value'],3)
        self.assertEqual(report['common_tuples_unmeasured_hold'],1)
        self.assertEqual(report['independent_source_snapshot_authentication'],'NOT_VERIFIED')
        self.assertEqual(report['source_dump_and_globals_same_preimage'],'NOT_VERIFIED')
        self.assertEqual(report['COMMERCIAL_GO'],'NO_GO')
        self.assertEqual(report['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(report['OWNER_ACL'],'NOT_VERIFIED')

    def test_swapped_access_detected_even_when_yes_total_same(self):
        a,b=fixture()
        b['rows'][0][4]=False
        b['rows'][1][4]=True
        report=compare(a,b)
        self.assertEqual(report['common_tuples_different_value_hold'],2)
        self.assertEqual(report['common_tuples_equal_value'],1)
        self.assertEqual(report['COMMERCIAL_GO'],'NO_GO')

    def test_missing_source_right_detected(self):
        a,b=fixture()
        b['rows'].pop(1)
        self.assertEqual(compare(a,b)['source_only_tuples_hold'],1)

    def test_unexpected_target_right_detected(self):
        a,b=fixture()
        b['rows'].append(['fake_new','SCHEMA','fake_schema','USAGE',True])
        self.assertEqual(compare(a,b)['target_only_tuples_hold'],1)

    def test_unknown_value_not_called_equal(self):
        a,b=fixture()
        a['rows'][0][4]=None
        report=compare(a,b)
        self.assertEqual(report['common_tuples_unmeasured_hold'],2)
        self.assertEqual(report['common_tuples_equal_value'],2)
        self.assertEqual(report['common_tuples_different_value_hold'],0)

    def test_mismatched_capture_id_fails(self):
        a,b=fixture();b['capture_id']='0'*32
        with self.assertRaisesRegex(ValueError,'WITNESS_DECLARED_PREIMAGE_MISMATCH'):
            compare(a,b)

    def test_mismatched_dump_hash_fails(self):
        a,b=fixture();b['source_dump_sha256']='c'*64
        with self.assertRaisesRegex(ValueError,'WITNESS_DECLARED_PREIMAGE_MISMATCH'):
            compare(a,b)

    def test_mismatched_globals_hash_fails(self):
        a,b=fixture();b['source_globals_sha256']='c'*64
        with self.assertRaisesRegex(ValueError,'WITNESS_DECLARED_PREIMAGE_MISMATCH'):
            compare(a,b)

    def test_self_declared_hashes_still_do_not_authenticate(self):
        a,b=fixture()
        a['source_dump_sha256']=b['source_dump_sha256']='d'*64
        report=compare(a,b)
        self.assertEqual(report['independent_source_snapshot_authentication'],'NOT_VERIFIED')

    def test_role_names_quoting_not_silently_normalized(self):
        a,b=fixture()
        b['rows'][0][0]='"fake_worker"'
        report=compare(a,b)
        self.assertEqual(report['source_only_tuples_hold'],1)
        self.assertEqual(report['target_only_tuples_hold'],1)

    def test_duplicate_private_tuple_fails(self):
        a,b=fixture()
        a['rows'].append(copy.deepcopy(a['rows'][0]))
        with self.assertRaisesRegex(ValueError,'WITNESS_DUPLICATE_TUPLE'):
            compare(a,b)

    def test_unknown_field_fails(self):
        a,b=fixture()
        a['checksum_already_verified']=True
        with self.assertRaisesRegex(ValueError,'WITNESS_FIELDS_INVALID'):
            compare(a,b)

    def test_missing_field_fails(self):
        a,b=fixture();del a['rows']
        with self.assertRaisesRegex(ValueError,'WITNESS_FIELDS_INVALID'):
            compare(a,b)

    def test_bad_boolean_number_fails(self):
        a,b=fixture();a['rows'][0][4]=1
        with self.assertRaisesRegex(ValueError,'WITNESS_GRANT_VALUE_INVALID'):
            compare(a,b)

    def test_bad_result_text_fails(self):
        a,b=fixture();a['rows'][0][4]='true'
        with self.assertRaisesRegex(ValueError,'WITNESS_GRANT_VALUE_INVALID'):
            compare(a,b)

    def test_unexpected_privilege_fails(self):
        a,b=fixture();a['rows'][0][3]='ALTER SYSTEM'
        with self.assertRaisesRegex(ValueError,'WITNESS_PRIVILEGE_KIND_INVALID'):
            compare(a,b)

    def test_bad_kind_fails(self):
        a,b=fixture();a['rows'][0][1]='VIEW'
        with self.assertRaisesRegex(ValueError,'WITNESS_PRIVILEGE_KIND_INVALID'):
            compare(a,b)

    def test_missing_probe_declaration_fails(self):
        a,b=fixture();a['declared_probe_kinds'].pop()
        with self.assertRaisesRegex(ValueError,'WITNESS_PROBE_DECLARATION_INVALID'):
            compare(a,b)

    def test_duplicated_probe_declaration_fails(self):
        a,b=fixture();a['declared_probe_kinds'][0]=a['declared_probe_kinds'][1]
        with self.assertRaisesRegex(ValueError,'WITNESS_PROBE_DECLARATION_INVALID'):
            compare(a,b)

    def test_quoted_or_leading_space_identity_fails(self):
        a,b=fixture();a['rows'][0][2]=' fake_schema.one'
        with self.assertRaisesRegex(ValueError,'WITNESS_IDENTITY_INVALID'):
            compare(a,b)

    def test_wrong_scope_fails(self):
        a,b=fixture();b['scope']='SOURCE'
        with self.assertRaisesRegex(ValueError,'WITNESS_SCOPE_INVALID'):
            compare(a,b)

    def test_wrong_version_fails(self):
        a,b=fixture();a['format_version']=2
        with self.assertRaisesRegex(ValueError,'WITNESS_VERSION_INVALID'):
            compare(a,b)

    def test_no_rows_fails(self):
        a,b=fixture();a['rows']=[]
        with self.assertRaisesRegex(ValueError,'WITNESS_ROW_SET_INVALID'):
            compare(a,b)

    def test_loader_rejects_duplicate_json_fields(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'duplicate.json'
            p.write_text('{"scope":"SOURCE","scope":"ISOLATED_RESTORE"}')
            with self.assertRaisesRegex(ValueError,'WITNESS_JSON_DUPLICATE_FIELD'):
                load(p)

    def test_loader_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/'witness.json'
            f.write_text('{}')
            link=Path(d)/'alias'
            link.symlink_to(f)
            with self.assertRaisesRegex(ValueError,'WITNESS_PRIVATE_FILE_INVALID'):
                load(link)

    def test_output_mode_and_no_identifiers(self):
        a,b=fixture()
        a['rows'][0][0]='private_fake_role'
        b['rows'][0][0]='private_fake_role'
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source=root/'source.json';target=root/'target.json'
            source.write_text(json.dumps(a));target.write_text(json.dumps(b))
            out=root/'result.json'
            args=['witness','--source',str(source),'--target',str(target),
                  '--out',str(out)]
            with patch.object(sys,'argv',args),redirect_stdout(io.StringIO()) as stdout:
                main()
            self.assertEqual(out.stat().st_mode & 0o777,0o600)
            self.assertIn('COMMERCIAL_GO=NO_GO',stdout.getvalue())
            for forbidden in ('private_fake_role','fake_schema.one',
                              '11223344556677889900aabbccddeeff'):
                self.assertNotIn(forbidden,stdout.getvalue())
                self.assertNotIn(forbidden,out.read_text())

    def test_no_sql_or_network_actions(self):
        path=Path(__file__).resolve().parents[1]/'rg02_tuple_witness_preflight.py'
        source=path.read_text()
        self.assertNotIn('psycopg',source)
        self.assertNotIn('supabase.',source)
        self.assertNotIn('subprocess',source)
        self.assertNotIn('requests',source)

if __name__ == '__main__':
    unittest.main()
