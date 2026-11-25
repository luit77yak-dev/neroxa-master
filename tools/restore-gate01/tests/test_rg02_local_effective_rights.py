#!/usr/bin/env python3
"""No-private-data tests for a read-only LOCAL effective rights witness."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rg02_local_effective_rights import (
    KINDS, POPULATIONS, validate, expected_checks, main,
)

SQL = Path(__file__).resolve().parents[1] / 'rg02_local_effective_rights.sql'


def synthetic_raw(roles=3, tables=2, parameters=1):
    p={'roles':roles,'schemas':2,'tables':tables,
       'functions':4,'sequences':1,'parameters':parameters}
    rights={}
    for k in KINDS:
        n=expected_checks(k,p)
        yes=1 if n else 0
        rights[k]={'checked':n,'granted':yes,'denied':n-yes,'unknown':0}
    return {'scope':'ISOLATED_LOCAL_PG17_ONLY','major':17,
            'populations':p,'rights':rights}


class LocalEffectiveRightsTests(unittest.TestCase):
    def test_full_probe_matrix_19_fixed_kinds(self):
        self.assertEqual(len(KINDS),19)
        self.assertEqual(len(set(KINDS)),len(KINDS))
        self.assertEqual(set(POPULATIONS),
                         {'roles','schemas','tables','functions','sequences','parameters'})

    def test_valid_synthetic_witness_remains_hold(self):
        output=validate(synthetic_raw())
        self.assertEqual(output['status'],'HOLD_LOCAL_EFFECTIVE_RIGHTS_ONLY')
        self.assertEqual(output['source_effective_privileges'],'NOT_MEASURED')
        self.assertEqual(output['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(output['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(output['COMMERCIAL_GO'],'NO_GO')

    def test_role_pairs_exclude_self(self):
        p=synthetic_raw()
        self.assertEqual(p['rights']['role_set']['checked'],6)
        self.assertEqual(p['rights']['role_usage']['checked'],6)

    def test_rights_multiplied_by_object_population(self):
        x=synthetic_raw(roles=3,tables=4)
        self.assertEqual(x['rights']['table_select']['checked'],12)
        self.assertEqual(x['rights']['function_execute']['checked'],12)
        self.assertEqual(x['rights']['parameter_set']['checked'],3)

    def test_local_true_rights_are_not_source_proof(self):
        x=synthetic_raw()
        for v in x['rights'].values():
            if v['checked']:
                v['granted']=v['checked']
                v['denied']=0
        report=validate(x)
        self.assertEqual(report['source_effective_privileges'],'NOT_MEASURED')
        self.assertEqual(report['COMMERCIAL_GO'],'NO_GO')

    def test_null_observation_represented_unknown(self):
        x=synthetic_raw()
        row=x['rights']['table_select']
        row['unknown']=1
        row['denied']-=1
        self.assertEqual(validate(x)['rights']['table_select']['unknown'],1)

    def test_checked_not_equal_populations_fails_closed(self):
        x=synthetic_raw()
        x['rights']['table_select']['checked']+=1
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_CHECKS_NOT_BALANCED'):
            validate(x)

    def test_sum_not_balanced_fails_closed(self):
        x=synthetic_raw()
        x['rights']['role_member']['granted']+=1
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_CHECKS_NOT_BALANCED'):
            validate(x)

    def test_negative_count_fails_closed(self):
        x=synthetic_raw()
        x['rights']['role_member']['granted']=-1
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_COUNT_INVALID'):
            validate(x)

    def test_noninteger_bool_count_fails_closed(self):
        x=synthetic_raw()
        x['populations']['tables']=True
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_COUNT_INVALID'):
            validate(x)

    def test_extra_kind_fails_closed(self):
        x=synthetic_raw()
        x['rights']['table_all']=x['rights']['table_select']
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_RIGHTS_INVALID'):
            validate(x)

    def test_missing_kind_fails_closed(self):
        x=synthetic_raw()
        del x['rights']['role_member']
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_RIGHTS_INVALID'):
            validate(x)

    def test_unsupported_pg_major_fails_closed(self):
        x=synthetic_raw()
        x['major']=16
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_PG17_SCOPE_INVALID'):
            validate(x)

    def test_wrong_scope_fails_closed(self):
        x=synthetic_raw()
        x['scope']='SOURCE_LIVE'
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_PG17_SCOPE_INVALID'):
            validate(x)

    def test_empty_role_population_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'EFFECTIVE_WITNESS_NO_ROLES'):
            validate(synthetic_raw(roles=0))

    def test_zero_objects_is_valid_but_not_source_proof(self):
        report=validate(synthetic_raw(tables=0,parameters=0))
        self.assertEqual(report['rights']['table_select']['checked'],0)
        self.assertEqual(report['COMMERCIAL_GO'],'NO_GO')

    def test_cli_output_only_aggregate_and_mode_0600(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d)
            (folder/'input.json').write_text(json.dumps(synthetic_raw()))
            target=folder/'witness.json'
            args=['probe','--input',str(folder/'input.json'),'--out',str(target)]
            with patch.object(sys,'argv',args),redirect_stdout(io.StringIO()) as out:
                main()
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
            self.assertIn('SOURCE_EFFECTIVE_PRIVILEGES=NOT_MEASURED',out.getvalue())
            self.assertNotIn('private_customer_table',out.getvalue())

    def test_static_sql_is_read_only(self):
        sql=SQL.read_text(encoding='utf-8')
        self.assertIn('BEGIN READ ONLY;',sql)
        self.assertTrue(sql.rstrip().endswith('ROLLBACK;'))
        self.assertIn('::text;',sql)
        self.assertIn("'ISOLATED_LOCAL_PG17_ONLY'",sql)
        self.assertNotIn('SET ROLE ',sql.upper())
        self.assertNotIn('CREATE ROLE ',sql.upper())

    def test_static_sql_checks_native_pg17_functions(self):
        sql=SQL.read_text(encoding='utf-8')
        for name in ('pg_catalog.pg_has_role(',
                     'pg_catalog.has_table_privilege(',
                     'pg_catalog.has_function_privilege(',
                     'pg_catalog.has_schema_privilege(',
                     'pg_catalog.has_sequence_privilege(',
                     'pg_catalog.has_parameter_privilege('):
            self.assertIn(name,sql)

    def test_static_sql_pays_attention_to_parameter_acl_absence(self):
        sql=SQL.read_text(encoding='utf-8')
        self.assertIn('pg_catalog.pg_parameter_acl',sql)
        self.assertIn('WHERE rolname !~',sql)
        self.assertIn('WHERE nspname !~',sql)

    def test_static_sql_has_each_probe_kind_once(self):
        sql=SQL.read_text(encoding='utf-8')
        for kind in KINDS:
            # One SELECT branch plus one VALUES declaration.
            self.assertEqual(sql.count("'"+kind+"'"),2,kind)


if __name__=='__main__':
    unittest.main()
