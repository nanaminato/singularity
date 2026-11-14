import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forestRows, moveOperations, relationId } from '../src/app/model.ts';
import { readFields, attributeFields } from '../src/app/fields.ts';
const model:any={nodes:[{id:'A'},{id:'B'},{id:'C'},{id:'D'}],relations:[{id:'REL-TREE-1',type:'contains',source:'A',target:'B'},{id:'R2',type:'contains',source:'A',target:'C'}],references:[],views:[],types:{}};
test('forest includes isolated nodes and preserves sibling ordering',()=>{
  assert.deepEqual(forestRows(model,'contains').map(r=>[r.id,r.depth]),[['A',0],['B',1],['C',1],['D',0]]);
  assert.equal(relationId(model),'REL-TREE-2');
});
test('moving a sibling preserves edge metadata and updates roots atomically',()=>{
  const m=structuredClone(model);m.relations[1].rationale='Keep this';
  const operations=moveOperations(m,{id:'VIEW',kind:'composition',roots:['A','D']},'C','B','before');
  const edges=operations.filter(o=>o.action==='put' && o.collection==='relations').map(o=>o.value!);
  assert.deepEqual(edges.map(e=>e['target']),['C','B']);assert.equal(edges[0]['rationale'],'Keep this');
  assert.deepEqual(operations.at(-1)!.value!['roots'],['A','D']);
  assert.equal(m.relations[1].target,'C');
});
test('attributes preserve false and zero, reject invalid JSON and omit unset values',()=>{
  const snapshot:any={model:{types:{x_test:{required:{count:'number',enabled:'boolean',items:'array'},optional:{memo:'string'}}}},schema:{types:{}}};
  const fields=attributeFields(snapshot,'x_test',{count:0,enabled:false,items:[]});
  assert.deepEqual(readFields(fields),{count:0,enabled:false,items:[],memo:undefined});
  fields.find(f=>f.key==='items')!.value='[';
  assert.throws(()=>readFields(fields),/JSON/);
});
