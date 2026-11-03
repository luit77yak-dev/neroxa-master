import os,pathlib,re
r=pathlib.Path(os.environ['AB_WORKDIR']);assert r.parent==pathlib.Path(os.environ['RUNNER_TEMP'])
p=r/'supabase/config.toml';s=p.read_text();s=re.sub(r'^project_id = .*$',f'project_id = "{os.environ["AB_PROJECT"]}"',s,flags=re.M)
s=re.sub(r'(^\[db\][\s\S]*?^major_version = )\d+',r'\g<1>17',s,flags=re.M)
s=re.sub(r'(^\[db\.seed\][\s\S]*?^enabled = )true',r'\g<1>false',s,flags=re.M)
s=re.sub(r'(^\[auth\.mfa\.totp\][\s\S]*?^enroll_enabled = )false',r'\g<1>true',s,flags=re.M)
s=re.sub(r'(^\[auth\.mfa\.totp\][\s\S]*?^verify_enabled = )false',r'\g<1>true',s,flags=re.M)
assert '[auth.mfa.totp]' in s
p.write_text(s)
print('Disposable unlinked PG17 config, seeds disabled, real TOTP enabled; no repository migrations copied.')
