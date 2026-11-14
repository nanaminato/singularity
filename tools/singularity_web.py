"""Local format 3 project editor."""
import json
import secrets
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from singularity_core import Store, apply
from singularity_core.model import AUTH, DELIVERY, VERIFICATION, RELATIONS, TREES, TYPES
from singularity_core.query import traverse, tree
from singularity_core.storage import unique_object


def serve_editor(project, port=8765, open_browser=False, on_ready=None):
    store = Store(project)
    store.read()
    token = secrets.token_urlsafe(32)
    assets = Path(__file__).resolve().parent / 'editor'
    files = {'/universe.js': ('universe.js', 'text/javascript'),'/tree.js': ('tree.js', 'text/javascript'), '/': ('index.html', 'text/html'), '/editor.js': ('editor.js', 'text/javascript'),
             '/editor.css': ('editor.css', 'text/css')}

    class Handler(BaseHTTPRequestHandler):
        def respond(self, code, body, mime='application/json'):
            self.send_response(code)
            self.send_header('Content-Type', mime + '; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body if isinstance(body, bytes) else json.dumps(body).encode())

        def allowed(self):
            hosts = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            if self.headers.get('Host') in hosts:
                return True
            self.respond(403, {'error': 'Loopback host required'})
            return False

        def do_GET(self):
            if not self.allowed():
                return
            try:
                if self.path in files:
                    name, mime = files[self.path]
                    self.respond(200, (assets / name).read_bytes(), mime)
                elif self.path == '/api/model':
                    model, revision = store.read()
                    self.respond(200, dict(model=model, revision=revision, token=token,
                        trees={v['id']: tree(model, v['id'])['rows'] for v in model['views']},
                        schema=dict(types=TYPES, relations=list(RELATIONS), views=list(TREES),
                            authorization=sorted(AUTH), delivery=sorted(DELIVERY),
                            verification=sorted(VERIFICATION))))
                else:
                    self.respond(404, {'error': 'Not found'})
            except (OSError, ValueError) as error:
                self.respond(400, {'error': str(error)})

        def do_POST(self):
            if not self.allowed():
                return
            if self.headers.get('X-Editor-Token') != token:
                self.respond(403, {'error': 'Editor token required'})
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 2_000_000 or self.headers.get_content_type() != 'application/json':
                    raise ValueError('Expected a JSON request of at most 2 MB')
                data = json.loads(self.rfile.read(size), object_pairs_hook=unique_object)
                model, revision = store.read()
                if self.path == '/api/apply':
                    if data['revision'] != revision:
                        self.respond(409, {'error': '模型已修改。请复制需要保留的草稿，重新加载后再试。'})
                        return
                    updated = apply(model, data['operations'], 'Human', data.get('basis'))
                    self.respond(200, {'revision': store.write(updated, revision)})
                elif self.path == '/api/context':
                    if data['revision'] != revision:
                        self.respond(409, {'error': '模型已修改，请重新加载后查询。'})
                        return
                    relations = set(data['relations'])
                    node_types = set(data['types'])
                    query_model = model | {'relations': [e for e in model['relations']
                        if not relations or e['type'] in relations]}
                    result = traverse(query_model, data['id'], data['depth'])
                    matches = [n for n in result['nodes'] if not node_types or n['type'] in node_types]
                    self.respond(200, {'matches': matches, 'visited': len(result['nodes']),
                        'reasons': result['reasons']})
                else:
                    self.respond(404, {'error': 'Not found'})
            except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
                self.respond(400, {'error': str(error)})

    with ThreadingHTTPServer(('127.0.0.1', port), Handler) as server:
        url = f'http://127.0.0.1:{server.server_port}/'
        print(url, flush=True)
        if on_ready:
            on_ready(url)
        if open_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
