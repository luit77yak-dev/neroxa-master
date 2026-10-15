"""Add a terminal forensic probe without modifying the immutable bootstrap."""
import pathlib
p=pathlib.Path('tools/mission-02a3/buyer-generated.private.mjs')
s=p.read_text()
needle=" report.status='PASS PARTIAL PRE-GATE';"
assert s.count(needle)==1
insert="""
 const {appendProbe}=await import('../../audits/02a5/f02/append-pre-gate.mjs');
 await appendProbe({sql,q,ids,people,report,rpc,digest});
"""
p.write_text(s.replace(needle,insert+needle))
print('Terminal PRE-GATE append probe enabled; no gate, grants or original migrations changed.')
