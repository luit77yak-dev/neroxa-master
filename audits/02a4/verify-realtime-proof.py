"""Verify recorded real WebSocket topics, never static RLS or mocked payloads."""
import json,sys
from collections import Counter
from pathlib import Path
p=Path(sys.argv[1]);s=json.loads(p.read_text());frames=Counter(x['topic'] for x in s.get('reconnectProtocol',[]) if x['event']=='postgres_changes')
a=frames['realtime:02a4-reconnect-A'];b=frames['realtime:02a4-reconnect-B'];auth=s.get('authLogout',{});positive=any(x['name']=='Realtime reconnect live B positive' and x['status']=='PASS' for x in s.get('realtimeChecks',[]))
status='FAIL' if a else 'PASS' if b and positive and auth.get('authApiSuccess') and auth.get('serverSessionAbsent') else 'BLOCKED'
print(json.dumps({'source':str(p),'status':status,'staleAFrames':a,'liveBFrames':b,'liveBPositive':positive,'verifiedLogout':auth,'scope':'Actual captured frames by topic and live-B control; does not certify all identities/resources.'},indent=2))
sys.exit(0 if status=='PASS' else 1 if status=='FAIL' else 2)
