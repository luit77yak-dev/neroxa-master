#!/usr/bin/env python3
"""Synthetic-only tests. No network, DB, backup, secrets or remote privileges."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rg02_targeted_acl import analyze, main

REVOKE='REVOKE EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC;'
GRANT='GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC;'
TABLE_REVOKE='REVOKE SELECT, UPDATE ON TABLE public.t FROM app_role;'

def catalog(f_public=False, f_option=False, table_rights=(), table_grantee='app_role'):
    return {
        'functions':[{'identity':'public.f(integer)','acl':(
            [{'is_public':True,'grantee':None,'privilege':'EXECUTE',
              'grantable':f_option}] if f_public else [])},
            {'identity':'public.g(integer)','acl':[]}],
        'relations':[{'identity':'public.t','acl':[
            {'is_public':False,'grantee':table_grantee,'privilege':right,'grantable':False}
            for right in table_rights]}],
    }

class TargetedAclTests(unittest.TestCase):
    def c(self,source,target='',snap=None):
        return analyze(source,target,catalog() if snap is None else snap)
    def test_only_strictly_missing_statements_count(self):
        x=self.c(REVOKE,REVOKE,catalog())
        self.assertEqual(x['exact_sql_diff_count'],0)
        self.assertEqual(x['by_class'],{})
    def test_missing_revoke_with_direct_absence(self):
        x=self.c(REVOKE)
        self.assertEqual(x['exact_sql_diff_count'],1)
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
        self.assertEqual(x['OWNER_ACL'],'NOT_VERIFIED')
    def test_missing_revoke_with_direct_conflict(self):
        x=self.c(REVOKE,'',catalog(f_public=True))
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONFLICT_HOLD'],1)
    def test_regrant_after_revoke_matches_direct(self):
        x=self.c(REVOKE+GRANT,GRANT,catalog(f_public=True))
        self.assertEqual(x['exact_sql_diff_count'],1)
        self.assertEqual(x['by_class']['LATER_GRANT__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_regrant_absent_conflicts(self):
        x=self.c(REVOKE+GRANT,GRANT,catalog())
        self.assertEqual(x['by_class']['LATER_GRANT__CATALOG_DIRECT_CONFLICT_HOLD'],1)
    def test_first_and_final_revoke_both_tracked(self):
        src=REVOKE+GRANT+REVOKE
        x=self.c(src,GRANT,catalog())
        self.assertEqual(x['exact_sql_diff_count'],2)
        self.assertEqual(x['by_class']['LATER_GRANT__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_partial_rights_match_is_not_complete(self):
        x=self.c(TABLE_REVOKE,'',catalog(table_rights=('SELECT',)))
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_PARTIAL_CONFLICT_HOLD'],1)
    def test_multi_rights_all_missing(self):
        x=self.c(TABLE_REVOKE)
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_grant_option_check_independent_of_grant(self):
        src='REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC;'
        x=self.c(src,'',catalog(f_public=True,f_option=False))
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
        x=self.c(src,'',catalog(f_public=True,f_option=True))
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONFLICT_HOLD'],1)
    def test_later_grant_without_option_cannot_restore_grantability(self):
        src='REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC;'+GRANT
        x=self.c(src,GRANT,catalog(f_public=True,f_option=False))
        self.assertEqual(x['by_class']['LATER_GRANT__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_unsupported_later_sql_is_hold(self):
        src=REVOKE+'GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC, other_role;'
        x=self.c(src,'GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC, other_role;',catalog())
        self.assertEqual(x['by_class']['UNSUPPORTED_LATER_ACL_HOLD'],1)
    def test_unknown_later_all_functions_is_hold(self):
        src=REVOKE+'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;'
        x=self.c(src,'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;',catalog())
        self.assertEqual(x['by_class']['UNSUPPORTED_LATER_ACL_HOLD'],1)
    def test_different_object_is_not_matching(self):
        src=REVOKE+'GRANT EXECUTE ON FUNCTION public.g(integer) TO PUBLIC;'
        x=self.c(src,'GRANT EXECUTE ON FUNCTION public.g(integer) TO PUBLIC;',catalog())
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_different_grantee_is_not_matching(self):
        src=REVOKE+'GRANT EXECUTE ON FUNCTION public.f(integer) TO app_role;'
        x=self.c(src,'GRANT EXECUTE ON FUNCTION public.f(integer) TO app_role;',catalog())
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_grantor_source_is_unparsed_hold(self):
        src='REVOKE EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC GRANTED BY owner_role;'
        x=self.c(src)
        self.assertEqual(x['by_class']['UNPARSED_SOURCE_DIFF_HOLD'],1)
    def test_source_grant_diff_not_claimed_as_revoke(self):
        x=self.c(GRANT)
        self.assertEqual(x['by_class']['NON_REVOKE_SQL_DIFF_HOLD'],1)
    def test_ambiguous_catalog_identity_is_hold(self):
        c=catalog()
        c['functions'].append(c['functions'][0])
        x=self.c(REVOKE,'',c)
        self.assertEqual(x['by_class']['FINAL_REVOKE__OBJECT_UNRESOLVED_HOLD'],1)
    def test_invalid_catalog_fail_closed(self):
        with self.assertRaises(ValueError):
            self.c(REVOKE,'',{'functions':[],'relations':None})
        c=catalog()
        c['functions'][0]['acl']=[{'is_public':'yes','grantee':None,'privilege':'EXECUTE','grantable':False}]
        with self.assertRaises(ValueError):
            self.c(REVOKE,'',c)
    def test_unqualified_function_is_unparsed(self):
        x=self.c('REVOKE EXECUTE ON FUNCTION f(integer) FROM PUBLIC;')
        self.assertEqual(x['by_class']['UNPARSED_SOURCE_DIFF_HOLD'],1)
    def test_quote_public_not_public(self):
        src='REVOKE EXECUTE ON FUNCTION public.f(integer) FROM "PUBLIC";'
        x=self.c(src,'',catalog(f_public=True))
        self.assertEqual(x['by_class']['FINAL_REVOKE__CATALOG_DIRECT_CONSISTENT_OBSERVED'],1)
    def test_diff_repetition_accounting(self):
        src=REVOKE+REVOKE
        x=self.c(src,REVOKE,catalog())
        self.assertEqual(x['exact_sql_diff_count'],1)
        self.assertEqual(sum(x['by_class'].values()),1)
    def test_private_report_permissions_and_stdout(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            (root/'source.sql').write_text(REVOKE+GRANT)
            (root/'target.sql').write_text(GRANT)
            (root/'catalog.json').write_text(json.dumps(catalog(f_public=True)))
            argv=['rg02_targeted_acl','--source-sql',str(root/'source.sql'),
                  '--target-sql',str(root/'target.sql'),'--catalog-json',str(root/'catalog.json'),
                  '--out',str(root/'private.json')]
            with patch.object(sys,'argv',argv), redirect_stdout(io.StringIO()) as result:
                main()
            self.assertEqual((root/'private.json').stat().st_mode & 0o777,0o600)
            self.assertNotIn('public.f',result.getvalue())
            self.assertNotIn('GRANT EXECUTE',result.getvalue())
            self.assertEqual(json.loads((root/'private.json').read_text())['COMMERCIAL_GO'],'NO_GO')
            self.assertEqual(json.loads((root/'private.json').read_text())['GLOBAL_ROLES'],'NOT_VERIFIED')


class FocalSchemaTests(unittest.TestCase):
    def setUp(self):
        from rg02_schema_focal import APP
        self.a = ('authenticated','SCHEMA','synthetic_schema','USAGE')
        self.b = ('anon','SCHEMA','synthetic_schema','CREATE')
        self.other = ('synthetic_role','SCHEMA','synthetic_schema','USAGE')
        self.source = {self.a:True,self.b:True,self.other:True}
        self.target = {self.a:False,self.b:False,self.other:False}
        self.roles = {name:(False,)*7 for name in APP | {'synthetic_role','pg_read_all_data'}}
        self.srcg = {'roles':self.roles,'memberships':{
            ('synthetic_role','authenticated','synthetic_role',False,True,False)}}
        self.dstg = {'roles':self.roles,'memberships':set()}
        self.catalog = [{'name':'synthetic_schema','owner':'synthetic_role','acl':[
            {'grantee':'synthetic_role','public':False,'privilege':'USAGE'}]}]
    def test_only_app_source_true_target_false(self):
        from rg02_schema_focal import missing_app_schema
        self.assertEqual(set(missing_app_schema(self.source,self.target)),{self.a,self.b})
    def test_path_projection_is_not_acl_provenance(self):
        from rg02_schema_focal import classify
        counts=classify(self.source,self.target,self.srcg,self.dstg,self.catalog)
        self.assertEqual(counts['SOURCE_PATH_CONSISTENT_INHERITED_ACL'],1)
        self.assertEqual(counts['SOURCE_ACL_OR_PROVIDER_DIFFERENCE_HOLD'],1)
        self.assertEqual(counts['PRIVILEGE_CREATE'],1)
        self.assertEqual(counts['PRIVILEGE_USAGE'],1)
        self.assertNotIn('synthetic_schema',str(counts))
    def test_no_inherit_edge_does_not_explain_usage(self):
        from rg02_schema_focal import projected_right
        self.srcg['memberships']={('synthetic_role','authenticated','synthetic_role',True,False,True)}
        self.assertEqual(projected_right('authenticated','USAGE',self.catalog[0],self.srcg),(False,'NO_PATH'))
    def test_builtin_role_projection(self):
        from rg02_schema_focal import projected_right
        self.srcg['memberships'].add(('pg_read_all_data','authenticated','synthetic_role',False,True,False))
        self.assertEqual(projected_right('authenticated','USAGE',self.catalog[0],self.srcg),(True,'BUILTIN_DATA_ROLE'))
        self.assertEqual(projected_right('authenticated','CREATE',self.catalog[0],self.srcg),(False,'NO_PATH'))
    def test_trial_sql_quotes_and_rollback(self):
        from rg02_schema_focal import experiment_sql
        witness="BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT 1;\nROLLBACK;\n"
        k=('authenticated','SCHEMA','x"; SELECT 1; --','USAGE')
        trial=experiment_sql([k],witness).decode()
        self.assertTrue(trial.startswith('BEGIN;\nGRANT USAGE ON SCHEMA "x""; SELECT 1; --" TO "authenticated";\n'))
        self.assertTrue(trial.endswith('\nROLLBACK;\n'))
        with self.assertRaises(ValueError):
            experiment_sql([self.b],witness)
        with self.assertRaises(ValueError):
            experiment_sql([self.other],witness)
        with self.assertRaises(ValueError):
            experiment_sql([self.a],"SELECT 1;")
    def test_trial_detects_collateral_changes(self):
        from rg02_schema_focal import experiment_result
        after=dict(self.target)
        after[self.a]=True
        self.assertEqual(experiment_result(self.target,after,[self.a]),(1,0,True))
        after[self.other]=True
        self.assertEqual(experiment_result(self.target,after,[self.a]),(1,1,False))
        del after[self.other]
        self.assertEqual(experiment_result(self.target,after,[self.a]),(1,1,False))
    def test_duplicate_catalog_rejected(self):
        from rg02_schema_focal import classify
        with self.assertRaises(ValueError):
            classify(self.source,self.target,self.srcg,self.dstg,self.catalog*2)

if __name__=='__main__':
    unittest.main()
