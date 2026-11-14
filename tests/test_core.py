import copy
import json
import re
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from singularity_core import empty_model, validate, ModelError, Store, apply
from singularity_core.query import traverse, tree, check_references, gaps


def node(ident='NODE-ONE', **extra):
    value = dict(id=ident,type='module',title=ident,body='Description',actor='AI',
                 authorization='not_applicable',delivery='planned',verification='unverified',attributes={})
    return value | extra


def graph():
    m=empty_model('Test')
    m['nodes']=[node('NODE-ONE'),node('NODE-TWO'),node('NODE-THREE')]
    return m


class ModelTests(unittest.TestCase):
    def test_independent_states_and_evidence(self):
        m=graph(); m['nodes'][0]['verification']='passed'
        with self.assertRaises(ModelError): validate(m)
        m['nodes'].append(node('EVIDENCE-ONE',type='evidence',attributes={'observation':'Measured result'}))
        m['nodes'][0]['verification_basis']=['EVIDENCE-ONE']
        validate(m)
        self.assertEqual(m['nodes'][0]['delivery'],'planned')

    def test_tree_cycle_and_multiple_parents(self):
        m=graph()
        m['relations']=[dict(id='REL-ONE',type='contains',source='NODE-ONE',target='NODE-TWO'),
                        dict(id='REL-TWO',type='contains',source='NODE-TWO',target='NODE-ONE')]
        with self.assertRaisesRegex(ModelError,'cycle'): validate(m)
        m['relations'][1].update(source='NODE-THREE',target='NODE-TWO')
        with self.assertRaisesRegex(ModelError,'multiple parents'): validate(m)
        for r in m['relations']:r['type']='depends_on'
        validate(m)

    def test_dangling_endpoints_and_duplicate_ids(self):
        m=graph();m['nodes'].append(node())
        with self.assertRaisesRegex(ModelError,'duplicate'):validate(m)
        m=graph();m['relations']=[dict(id='REL-ONE',type='depends_on',source='NODE-ONE',target='NODE-MISSING')]
        with self.assertRaisesRegex(ModelError,'dangling'):validate(m)

    def test_custom_types(self):
        m=graph();m['types']['x_budget']={'description':'Resource budget','required':{'cpu':'number'},'optional':{'units':'string'}}
        m['nodes'][0].update(type='x_budget',attributes={'cpu':3,'units':'seconds'})
        validate(m)
        m['nodes'][0]['attributes']['cpu']=True
        with self.assertRaises(ModelError):validate(m)

    def test_references(self):
        for target in ('../escape','C:/secret','/absolute','a\\b'):
            m=graph();m['references']=[dict(id='REF-ONE',kind='project_file',target=target,purpose='source',tracking='live')]
            with self.assertRaises(ModelError):validate(m)
        m['references'][0].update(kind='external_file',target='C:/reference.md',tracking='pinned')
        with self.assertRaises(ModelError):validate(m)
        m['references'][0]['revision']='abc123';validate(m)
        self.assertEqual(check_references(m,ROOT)[0]['status'],'unchecked')

    def test_unknown_fields_rejected(self):
        m=graph();m['nodes'][0]['parent']='NODE-TWO'
        with self.assertRaises(ModelError):validate(m)

    def test_nonfinite_values_and_invalid_digest(self):
        m=graph();m['types']['x_number']={'description':'Numeric','required':{'value':'number'},'optional':{}}
        m['nodes'][0].update(type='x_number',attributes={'value':float('inf')})
        with self.assertRaises(ModelError):validate(m)
        m=graph();m['references']=[dict(id='REF-ONE',kind='project_file',target='README.md',purpose='source',tracking='pinned',digest='bad')]
        with self.assertRaises(ModelError):validate(m)

    def test_overlapping_view_roots(self):
        m=graph();m['relations']=[dict(id='REL-ONE',type='contains',source='NODE-ONE',target='NODE-TWO')]
        m['views']=[dict(id='VIEW-ONE',title='Tree',kind='composition',roots=['NODE-ONE','NODE-TWO'])]
        with self.assertRaisesRegex(ModelError,'overlap'):validate(m)

    def test_reference_digest_change(self):
        import hashlib
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'source.md';path.write_bytes(b'original')
            m=graph();m['references']=[dict(id='REF-ONE',kind='project_file',target='source.md',purpose='source',tracking='pinned',digest=hashlib.sha256(b'original').hexdigest())]
            validate(m)
            self.assertEqual(check_references(m,directory)[0]['status'],'matched')
            path.write_bytes(b'changed')
            self.assertEqual(check_references(m,directory)[0]['status'],'changed')

    def test_batch_and_authorization(self):
        m=graph();n=node('INTENT-ONE',type='intent',authorization='confirmed')
        op=[dict(action='put',collection='nodes',value=n)]
        with self.assertRaises(ModelError):apply(m,op)
        confirmed=apply(m,op,'Human','Explicit user decision')
        self.assertEqual(len(m['nodes']),3)
        with self.assertRaises(ModelError):apply(confirmed,[dict(action='delete',collection='nodes',id='INTENT-ONE')])
        confirmed['relations']=[dict(id='REL-ONE',type='constrains',source='INTENT-ONE',target='NODE-ONE')]
        with self.assertRaises(ModelError):apply(confirmed,[dict(action='delete',collection='nodes',id='NODE-ONE')])
        updated=apply(confirmed,[dict(action='delete',collection='relations',id='REL-ONE'),dict(action='delete',collection='nodes',id='NODE-ONE')])
        self.assertEqual(len(updated['nodes']),3)

    def test_reverse_dependency_impact(self):
        m=graph();m['relations']=[dict(id='REL-ONE',type='depends_on',source='NODE-TWO',target='NODE-ONE')]
        self.assertEqual({n['id'] for n in traverse(m,'NODE-ONE',impact=True)['nodes']},{'NODE-ONE','NODE-TWO'})
        self.assertEqual(len(traverse(m,'NODE-TWO',impact=True)['nodes']),1)
        self.assertEqual(len(traverse(m,'NODE-ONE',depth=0)['nodes']),1)


class StoreTests(unittest.TestCase):
    def test_stale_revision_and_atomic_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);m=graph();rev=store.write(m,None)
            with self.assertRaises(ModelError):store.write(m,None)
            changed=copy.deepcopy(m);changed['project']['name']='Updated'
            fresh=store.write(changed,rev)
            with self.assertRaises(ModelError):store.write(m,rev)
            with patch('singularity_core.storage.os.replace',side_effect=OSError('simulated crash')):
                with self.assertRaises(OSError):store.write(m,fresh)
            self.assertEqual(store.read()[0],changed)
            self.assertFalse(store.path.with_suffix('.lock').exists())
            self.assertEqual(len(list(store.path.parent.iterdir())),1)

    def test_two_writers_only_one_commits(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);rev=store.write(graph(),None)
            barrier=threading.Barrier(2);outcomes=[]
            def writer(name):
                m=graph();m['project']['name']=name;barrier.wait()
                try:store.write(m,rev);outcomes.append('ok')
                except ModelError:outcomes.append('rejected')
            threads=[threading.Thread(target=writer,args=(name,)) for name in ('A','B')]
            for t in threads:t.start()
            for t in threads:t.join()
            self.assertCountEqual(outcomes,['ok','rejected'])

    def test_lock_and_invalid_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);rev=store.write(graph(),None)
            store.path.with_suffix('.lock').write_text('existing')
            with self.assertRaisesRegex(ModelError,'writer'):store.write(graph(),rev)
            store.path.write_text('{broken')
            with self.assertRaises(ModelError):store.read()

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);store.write(graph(),None)
            store.path.write_text('{"format":3,"format":2}')
            with self.assertRaisesRegex(ModelError,'duplicate JSON'):store.read()


class LittleLoopTests(unittest.TestCase):
    def setUp(self):
        self.model=json.loads((ROOT/'examples/littleloop/.singularity/model.json').read_text(encoding='utf-8'))
        validate(self.model)

    def test_editing_relation_metadata_preserves_sibling_order(self):
        before = tree(self.model, 'VIEW-SYSTEM')['rows']
        relation = next(edge for edge in self.model['relations'] if edge['id'] == 'REL-001')
        updated = apply(self.model, [{
            'action': 'put', 'collection': 'relations',
            'value': {**relation, 'rationale': 'Clarify the relationship'},
        }])
        self.assertEqual(tree(updated, 'VIEW-SYSTEM')['rows'], before)

    def test_design_context(self):
        context=traverse(self.model,'IFACE-EVENT',2)
        ids={n['id'] for n in context['nodes']}
        self.assertTrue({'INTENT-TRACE','DEC-SERIAL','DATA-EVENT','TASK-CONTRACT','TEST-STALE'} <= ids)
        self.assertTrue(context['references'])

    def test_contract_change_reaches_consumers_and_verification(self):
        result=traverse(self.model,'IFACE-EVENT',3,True)
        ids={n['id'] for n in result['nodes']}
        self.assertTrue({'MOD-MEMORY','MOD-DIAGNOSTICS','TASK-CONTRACT','TASK-REPLAY','TEST-STALE'} <= ids)
        self.assertTrue(result['reasons'])

    def test_trees_and_honest_status(self):
        for view in self.model['views']:self.assertTrue(tree(self.model,view['id'])['rows'])
        self.assertFalse(any(n['authorization']=='confirmed' or n['verification']=='passed' or n['delivery']=='implemented' for n in self.model['nodes']))
        self.assertIn('ASSUME-DETERMINISM',{g['id'] for g in gaps(self.model)})

    def test_cli_transaction_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);rev=store.write(self.model,None)
            ops=Path(directory)/'ops.json'
            ops.write_text(json.dumps([dict(action='put',collection='nodes',value=node('NODE-ADDED'))]))
            command=[sys.executable,str(ROOT/'tools/singularity.py'),'--project',directory,'apply',str(ops),'--expected',rev]
            preview=subprocess.run(command+['--dry-run'],capture_output=True,text=True)
            self.assertEqual(preview.returncode,0,preview.stderr)
            self.assertEqual(store.read()[1],rev)
            result=subprocess.run(command,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            stale=subprocess.run(command,capture_output=True,text=True)
            self.assertEqual(stale.returncode,1)
            self.assertIn('NODE-ADDED',{n['id'] for n in store.read()[0]['nodes']})

    def test_editor_http_transaction(self):
        with tempfile.TemporaryDirectory() as directory:
            local_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            import os
            project = os.environ.get('SINGULARITY_TEST_PROJECT')
            model = Store(project).read()[0] if project else self.model
            store = Store(directory)
            store.write(model, None)
            process=subprocess.Popen([sys.executable,str(ROOT/'tools/singularity.py'),'--project',directory,'serve','--port','0'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                url=process.stdout.readline().strip()
                self.assertTrue(url.startswith('http://127.0.0.1:'),url)
                with local_http.open(url+'api/model',timeout=5) as response:
                    snapshot = json.load(response)
                    self.assertEqual(snapshot['model'], model)
                    self.assertEqual(set(snapshot['trees']), {v['id'] for v in model['views']})
                    self.assertEqual({v['kind'] for v in model['views']}, {'composition', 'objectives', 'delivery'})
                headers = {'Content-Type': 'application/json', 'X-Editor-Token': snapshot['token']}
                def post(path, **data):
                    payload = {'revision': snapshot['revision'], **data}
                    req = urllib.request.Request(url + path, json.dumps(payload).encode(), headers)
                    with local_http.open(req, timeout=5) as response:
                        return json.load(response)
                filtered = post('api/context', id='IFACE-EVENT', depth=2,
                                relations=['depends_on'], types=['module'])
                self.assertIn('MOD-MEMORY', {n['id'] for n in filtered['matches']})
                self.assertTrue(all(e['type'] == 'depends_on' for e in filtered['reasons']))
                self.assertTrue(all(n['type'] == 'module' for n in filtered['matches']))
                contract = next(n for n in model['nodes'] if n['id'] == 'IFACE-EVENT')
                updated = contract | {'attributes': contract['attributes'] | {
                    'inputs': contract['attributes']['inputs'] + ['EditorRoundtripInput']},
                    'references': contract.get('references', []) + ['REF-EDITOR-TEST']}
                operations = [
                    dict(action='put', collection='references', value=dict(
                        id='REF-EDITOR-TEST', kind='external_file', target='C:/example/contract.md',
                        purpose='Editor round trip', tracking='live')),
                    dict(action='put', collection='nodes', value=updated),
                    dict(action='put', collection='relations', value=dict(
                        id='REL-EDITOR-TEST', type='references', source='IFACE-EVENT', target='MOD-ACTION')),
                ]
                post('api/apply', operations=operations)
                saved, _ = store.read()
                self.assertIn('EditorRoundtripInput', next(n for n in saved['nodes']
                    if n['id'] == 'IFACE-EVENT')['attributes']['inputs'])
                self.assertIn('REL-EDITOR-TEST', {e['id'] for e in saved['relations']})
                self.assertIn('REF-EDITOR-TEST', {r['id'] for r in saved['references']})
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    post('api/apply', operations=operations)
                self.assertEqual(caught.exception.code, 409)
                caught.exception.close()
                if (ROOT / 'web/dist/editor/browser/index.html').is_file():
                    with local_http.open(url,timeout=5) as response:
                        self.assertIn('text/html',response.headers['Content-Type'])
                        html = response.read().decode()
                        self.assertIn('<app-root>', html)
                    for asset in re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html):
                        with local_http.open(url + asset, timeout=5) as response:
                            self.assertEqual(response.status, 200)
                            self.assertIn('text/javascript' if asset.endswith('.js') else 'text/css', response.headers['Content-Type'])
                else:
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        local_http.open(url, timeout=5)
                    self.assertEqual(caught.exception.code, 503)
                    self.assertIn('npm run build', caught.exception.read().decode())
                    caught.exception.close()
                for path in ('%2e%2e/package.json', '%2e%2e/%2e%2e/%2e%2e/.singularity/model.json', 'api/missing'):
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        local_http.open(url + path, timeout=5)
                    self.assertEqual(caught.exception.code, 404)
                    caught.exception.close()
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    local_http.open(urllib.request.Request(url,headers={'Host':'untrusted.example'}),timeout=5)
                self.assertEqual(caught.exception.code,403)
                caught.exception.close()
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    local_http.open(urllib.request.Request(url+'api/apply',data=b'{}'),timeout=5)
                self.assertEqual(caught.exception.code,403)
                caught.exception.close()
            finally:
                process.terminate()
                process.communicate(timeout=5)


if __name__=='__main__':unittest.main()
