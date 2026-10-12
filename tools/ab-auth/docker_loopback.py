"""Private Unix-socket Docker API relay; rewrite ONLY this disposable project's binds.
No routing changes, no remote hosts, no credentials logged. Preserve upgraded streams.
"""
import json,os,pathlib,select,socket,socketserver,sys,urllib.parse

def rewrite(data,project,name):
    if not name.endswith('_'+project):raise ValueError('Unexpected container outside disposable project')
    v=json.loads(data)
    for bindings in v.get('HostConfig',{}).get('PortBindings',{}).values():
        for binding in bindings or []:binding['HostIp']='127.0.0.1'
    return json.dumps(v,separators=(',',':')).encode()

class Handler(socketserver.StreamRequestHandler):
    rbufsize=0
    def handle(self):
        upstream=None
        try:
            first=self.rfile.readline(65536)
            if not first:return
            method,target,version=first.decode().strip().split(' ',2)
            headers=[]
            while True:
                line=self.rfile.readline(65536)
                if line in (b'\r\n',b'\n',b''):break
                k,v=line.decode().split(':',1);headers.append((k,v.strip()))
            lookup={k.lower():v for k,v in headers}
            parsed=urllib.parse.urlsplit(target)
            body=b''
            if method=='POST' and parsed.path.endswith('/containers/create'):
                size=int(lookup.get('content-length','0'))
                if not 0<size<4*1024*1024:raise ValueError('Unsupported create body')
                body=rewrite(self.rfile.read(size),self.server.project,urllib.parse.parse_qs(parsed.query).get('name',[''])[0])
                headers=[(k,v) for k,v in headers if k.lower()!='content-length']+[('Content-Length',str(len(body)))]
            if lookup.get('upgrade','').lower()!='tcp':
                headers=[(k,v) for k,v in headers if k.lower()!='connection']+[('Connection','close')]
            upstream=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);upstream.connect('/var/run/docker.sock')
            upstream.sendall(first+''.join(k+': '+v+'\r\n' for k,v in headers).encode()+b'\r\n'+body)
            sources=[self.request,upstream]
            while sources:
                ready,_,_=select.select(sources,[],[],120)
                if not ready:break
                for source in ready:
                    data=source.recv(65536);dest=upstream if source is self.request else self.request
                    if not data:
                        sources.remove(source)
                        try:dest.shutdown(socket.SHUT_WR)
                        except OSError:pass
                    else:dest.sendall(data)
        except Exception:
            try:self.request.sendall(b'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
            except OSError:pass
        finally:
            if upstream:upstream.close()

if __name__=='__main__':
    p=pathlib.Path(os.environ['AB_WORKDIR'])/'docker-loopback.sock'
    assert not p.exists()
    server=socketserver.ThreadingUnixStreamServer(str(p),Handler);server.daemon_threads=True;server.project=os.environ['AB_PROJECT'];p.chmod(0o600);server.serve_forever()
