import copy
import json
import os
import subprocess
import sys
import unittest

from test_core import ROOT, graph, node, Store, traverse
from singularity_core.model import ModelError
from singularity_core.brief import bounded_context, find, wire


def edge(ident, kind, source, target):
    return dict(id=ident, type=kind, source=source, target=target)


class BriefTests(unittest.TestCase):
    def test_find_normalizes_text_ranks_ids_searches_reference_paths(self):
        model = graph()
        model['nodes'][0].update(title='本地 SQLite 适配', body='描述不应返回', references=['REF-DB'])
        model['nodes'][1].update(body='NODE-ONE')
        model['references'] = [dict(id='REF-DB', target='docs/chat-storage.md', purpose='Adapters')]
        result = find(model, '  ＳＱＬＩＴＥ  CHAT-STORAGE  ', ['module'])
        self.assertEqual(['NODE-ONE'], [n['id'] for n in result['matches']])
        self.assertNotIn('描述不应返回', wire(result).decode())
        self.assertNotIn('body', result['matches'][0])
        ranked = find(model, 'node-one', limit=1)
        self.assertEqual('NODE-ONE', ranked['matches'][0]['id'])
        self.assertTrue(ranked['truncated'])
        self.assertEqual(2, ranked['total'])
        self.assertEqual(0, find(model, 'SQLite', ['conflict'])['total'])

    def test_small_budget_prioritizes_critical_and_explains_omissions(self):
        model = graph()
        model['nodes'] += [node('LIMIT-ONE', type='constraint', authorization='confirmed',
                               authorization_basis='Explicit decision'),
                           node('CONFLICT-ONE', type='conflict', attributes={'issue':'Pending'})]
        model['relations'] = [edge('REL-ONE', 'depends_on', 'NODE-ONE', 'NODE-TWO'),
                              edge('REL-TWO', 'constrains', 'LIMIT-ONE', 'NODE-ONE'),
                              edge('REL-THREE', 'conflicts_with', 'CONFLICT-ONE', 'NODE-ONE')]
        result = bounded_context(model, 'NODE-ONE', max_nodes=2, summary_only=True)
        self.assertEqual(['NODE-ONE', 'CONFLICT-ONE'], [n['id'] for n in result['nodes']])
        self.assertEqual('conflicts_with', result['nodes'][1]['via']['type'])
        self.assertEqual([{'id': 'LIMIT-ONE', 'type': 'constraint'}],
                         result['omissions']['critical_examples'])
        self.assertEqual(2, result['omissions']['nodes'])
        self.assertEqual(1, result['omissions']['critical'])

    def test_direct_evidence_even_when_relation_filter_or_depth_excludes_it(self):
        model = graph()
        model['nodes'][0].update(verification='passed', verification_basis=['EVIDENCE-ONE'])
        model['nodes'].append(node('EVIDENCE-ONE', type='evidence', attributes={'observation': 'Measured'}))
        model['relations'] = [edge('REL-ONE', 'depends_on', 'NODE-ONE', 'NODE-TWO')]
        for depth in [0, 2]:
            result = bounded_context(model, 'NODE-ONE', depth, relations=['verifies'], summary_only=True)
            self.assertEqual(1, result['graph_nodes'])
            self.assertEqual(2, result['eligible_nodes'])
            self.assertEqual(['EVIDENCE-ONE'], result['nodes'][0]['verification_basis'])
            self.assertEqual('verification_basis', result['nodes'][1]['via']['type'])

    def test_utf8_byte_budget_accounts_for_wire_and_missing_full_root(self):
        model = graph()
        model['nodes'][0]['body'] = '汉字' * 800
        model['nodes'][0]['title'] = '中文总结'
        original = copy.deepcopy(model)
        result = bounded_context(model, 'NODE-ONE', max_bytes=1024)
        self.assertTrue(result['omissions']['root_missing'])
        self.assertLessEqual(len(wire(result)), 1024)
        compact = bounded_context(model, 'NODE-ONE', max_bytes=1024, summary_only=True)
        self.assertFalse(compact['omissions']['root_missing'])
        self.assertIn('中文总结'.encode(), wire(compact))
        self.assertEqual(model, original)

    def test_high_degree_with_long_multibyte_titles_and_omitted_critical_ids(self):
        model = graph()
        for index in range(30):
            ident = f'LIMIT-{index:03}'
            model['nodes'].append(node(ident, type='constraint', title='限制' * 100,
                                       authorization='candidate'))
            model['relations'].append(edge(f'EDGE-{index:03}', 'constrains', ident, 'NODE-ONE'))
        output = bounded_context(model, 'NODE-ONE', max_nodes=30, max_bytes=1024, summary_only=True)
        omitted = output['omissions']
        self.assertLessEqual(len(wire(output)), 1024)
        self.assertGreater(omitted['critical'], 20)
        self.assertEqual(omitted['critical'], omitted['unlisted_critical'] + len(omitted['critical_examples']))
        self.assertEqual(output['eligible_nodes'], omitted['nodes'] + len(output['nodes']))

    def test_invalid_bounds(self):
        model = graph()
        for arguments in [dict(max_nodes=0), dict(max_bytes=100), dict(depth=-1), dict(relations=['unknown'])]:
            with self.assertRaises(ModelError):
                bounded_context(model, 'NODE-ONE', **arguments)
        with self.assertRaises(ModelError):
            find(model, ' ')


class BriefCliTests(unittest.TestCase):
    def test_legacy_output_and_machine_readable_budget(self):
        project = ROOT / 'examples/littleloop'
        model, revision = Store(project).read()
        prefix = [sys.executable, str(ROOT / 'tools/singularity.py'), '--project', str(project)]
        raw = subprocess.check_output(prefix + ['context', 'IFACE-EVENT'])
        self.assertEqual(traverse(model, 'IFACE-EVENT'), json.loads(raw))
        raw = subprocess.check_output(prefix + ['context', 'IFACE-EVENT', '--summary', '--max-bytes', '2048'])
        result = json.loads(raw)
        self.assertLessEqual(len(raw), 2048)
        self.assertEqual(revision, result['revision'])
        self.assertTrue(all('body' not in row for row in result['nodes']))
        self.assertEqual(revision, json.loads(subprocess.check_output(prefix + ['find', 'IFACE-EVENT']))['revision'])

    @unittest.skipUnless(os.environ.get('SINGULARITY_REAL_LITTLELOOP'), 'set SINGULARITY_REAL_LITTLELOOP to a LittleLoop checkout')
    def test_real_littleloop_queries(self):
        model, _ = Store(os.environ['SINGULARITY_REAL_LITTLELOOP']).read()
        self.assertIn('MOD-CHAT-COMMITMENTS', {n['id'] for n in find(model, 'SQLite', ['module'])['matches']})
        result = bounded_context(model, 'MOD-CHAT-COMMITMENTS', 1, summary_only=True, max_nodes=12)
        self.assertTrue({'MOD-CHAT-COMMITMENTS', 'INTENT-CHAT-COMMITMENTS',
                         'EVIDENCE-CHAT-STORAGE-INTEGRATION', 'EVIDENCE-CHAT-COMMITMENTS'} <= {
                             n['id'] for n in result['nodes']})
        for terms in ('pause resume', 'stale reply'):
            with self.subTest(terms=terms):
                hits = find(model, terms)['matches']
                self.assertIn('EVIDENCE-CHAT-COMMITMENTS', {n['id'] for n in hits})
        tight = bounded_context(model, 'MOD-CHAT-COMMITMENTS', 1, summary_only=True, max_nodes=1)
        self.assertTrue({'EVIDENCE-CHAT-STORAGE-INTEGRATION', 'EVIDENCE-CHAT-COMMITMENTS'} <=
                        {item['id'] for item in tight['omissions']['critical_examples']})
        self.assertLessEqual(len(wire(result)), 8192)
