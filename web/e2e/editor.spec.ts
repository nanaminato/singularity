import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const test=base.extend<{editorUrl:string}>({editorUrl:async({},use)=>{
  const directory=await mkdtemp(join(tmpdir(),'singularity-angular-'));
  await mkdir(join(directory,'.singularity'));
  await copyFile(join(root,'examples/littleloop/.singularity/model.json'),join(directory,'.singularity/model.json'));
  const process=spawn('python',[join(root,'tools/singularity.py'),'--project',directory,'serve','--port','0'],{windowsHide:true});
  let errors='';process.stderr.on('data',chunk=>errors+=chunk);
  try {
    const url=await new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Server startup timeout: '+errors)),10000);
      process.once('error',reject);process.once('exit',()=>reject(Error(errors)));
      process.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\//);if(match){clearTimeout(timer);resolve(match[0]);}});
    });
    await use(url);
  } finally {
    process.kill(); await new Promise<void>(resolve=>process.once('close',()=>resolve()));
    const rel=relative(tmpdir(),directory);
    if(!rel.startsWith('..') && rel.startsWith('singularity-angular-')) await rm(directory,{recursive:true,force:true});
  }
}});
test('Angular loads under CSP and edits typed fields; conflict preserves draft',async({page,editorUrl})=>{
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(editorUrl);await expect(page.locator('app-root')).toHaveAttribute('ng-version','22.2.6');
  await expect(page.locator('#items li')).not.toHaveCount(0);
  await page.locator('#search').fill('IFACE-EVENT');
  await page.locator('#items .tree-label').filter({hasText:'事件'}).last().click();
  await expect(page.locator('#field-id')).toHaveValue('IFACE-EVENT');
  await expect(page.locator('#field-type')).toHaveValue('interface');
  await expect(page.locator('#field-verification')).toHaveValue('unverified');
  await page.locator('#attribute-inputs').fill('["AngularRoundtripInput"]');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('已保存');
  await page.reload();await page.locator('#search').fill('IFACE-EVENT');await page.locator('#items .tree-label').filter({hasText:'事件'}).last().click();
  await expect(page.locator('#attribute-inputs')).toHaveValue('[\n  "AngularRoundtripInput"\n]');
  const snapshot=await (await page.request.get(editorUrl+'api/model')).json();
  const changed={...snapshot.model.nodes.find((n:any)=>n.id==='IFACE-EVENT'),title:'外部更新'};
  await page.request.post(editorUrl+'api/apply',{headers:{'X-Editor-Token':snapshot.token},data:{revision:snapshot.revision,operations:[{action:'put',collection:'nodes',value:changed}]}});
  await page.locator('#field-title').fill('未保存草稿');await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('#status')).toContainText('模型已修改');await expect(page.locator('#field-title')).toHaveValue('未保存草稿');
  expect(errors.filter(e=>!e.includes('409') && !e.includes('favicon'))).toEqual([]);
});
test('creates child, edits references and roots, queries and zooms',async({page,editorUrl})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(editorUrl);await expect(page.locator('#items li')).not.toHaveCount(0);
  await page.locator('#items li').first().hover();await page.locator('#items .tree-add').first().click();
  await page.locator('#field-id').fill('NODE-ANGULAR');await page.locator('#field-title').fill('Angular 子节点');await page.locator('#field-body').fill('浏览器回归测试');
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('#status')).toHaveText('已保存');
  await page.locator('#context > summary').click();await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.locator('#context')).toContainText(/显示 \d+ 个节点，遍历 \d+ 个节点/);
  const before=await page.locator('#zoom-level').textContent();await page.getByRole('button',{name:'放大画布'}).click();await expect(page.locator('#zoom-level')).not.toHaveText(before!);
  await page.locator('#collection').selectOption('references');await page.locator('#create').click();
  await page.locator('#field-id').fill('REF-ANGULAR');await page.locator('#field-target').fill('README.md');await page.locator('#field-purpose').fill('Angular 浏览器测试');
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('#status')).toHaveText('已保存');
  await page.locator('#collection').selectOption('views');await page.locator('#create').click();await page.locator('#field-id').fill('VIEW-ANGULAR');await page.locator('#field-title').fill('测试视图');
  await page.getByRole('searchbox',{name:'筛选根节点'}).fill('NODE-ANGULAR');await page.locator('.root-option:visible input').check();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('#status')).toHaveText('已保存');
  await expect(page.locator('#object-links')).toContainText('Angular 子节点');
  await page.screenshot({path:'test-results/editor-angular.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('tree drag saves parent and relation CRUD retains metadata',async({page,editorUrl})=>{
  await page.goto(editorUrl);await expect(page.locator('#items li')).not.toHaveCount(0);
  const snapshot=await (await page.request.get(editorUrl+'api/model')).json();
  const parent=snapshot.model.nodes.find((n:any)=>n.id==='MOD-MEMORY');
  const source=page.locator('#items .tree-label').filter({hasText:parent.title}).locator('..');
  const target=page.locator('#items .tree-label').filter({hasText:'行动模块'}).locator('..');
  await source.dragTo(target);await expect(page.locator('#status')).toHaveText('已保存');
  const saved=await (await page.request.get(editorUrl+'api/model')).json();
  expect(saved.model.relations.find((r:any)=>r.type==='contains' && r.target==='MOD-MEMORY').source).toBe('MOD-ACTION');
  await page.screenshot({path:'test-results/editor-canvas.png',fullPage:true});
  await page.locator('#collection').selectOption('relations');await page.locator('#create').click();
  await page.locator('#field-id').fill('REL-ANGULAR');await page.locator('#field-type').selectOption('references');
  await page.locator('#field-source').selectOption('MOD-MEMORY');await page.locator('#field-target').selectOption('MOD-ACTION');await page.locator('#field-rationale').fill('浏览器关系测试');
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('#field-id')).toHaveAttribute('readonly','');
  await page.locator('#field-rationale').fill('保留顺序和元数据');
  const written=page.waitForResponse(response=>response.url().endsWith('/api/apply') && response.request().method()==='POST');
  await page.getByRole('button',{name:'保存',exact:true}).click();expect((await written).status()).toBe(200);
  await expect(page.locator('#collection')).toBeEnabled();
  const updated=await (await page.request.get(editorUrl+'api/model')).json();expect(updated.model.relations.find((r:any)=>r.id==='REL-ANGULAR').rationale).toBe('保留顺序和元数据');
  await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('#editor')).toHaveCount(0);
});
