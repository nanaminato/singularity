import { Component, HostListener, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { EditorApi } from './editor-api.service';
import { FieldComponent } from './field.component';
import { Field, fieldsFor, attributeFields, readFields } from './fields';
import { Collection, Snapshot, RecordValue, Operation, Row, forestRows, treeKinds, relationNames, relationId, moveOperations } from './model';
import { CanvasComponent } from './canvas.component';
@Component({selector:'app-root',imports:[FormsModule,NgTemplateOutlet,FieldComponent,CanvasComponent],templateUrl:'./app.component.html'})
export class AppComponent implements OnInit {
  Math = Math;
  get maxSidebarWidth() { return Math.max(200,window.innerWidth-360); }
  private api = inject(EditorApi);
  state = signal<Snapshot | null>(null); message = signal('正在读取项目…'); error = signal(false); busy = signal(false);
  group:Collection = 'nodes'; viewId = ''; search = ''; original?:RecordValue; creating = false; dirty = false;
  fields:Field[] = []; attributes:Field[] = []; currentType = ''; drafts = new Map<string,Field[]>();
  collapsed = new Set<string>(); childParent?:string; dragged?:string; dropTarget = ''; dropMode = '';
  deleteMessage = ''; deleteBlocked = false; rootSearch = ''; previewAlignment = 'center';
  depth = 2; edgeFilter:string[] = []; typeFilter:string[] = []; result = signal<{matches:RecordValue[];visited:number;reasons:RecordValue[]} | null>(null);
  sidebarWidth = 290; resize?:{x:number;width:number};
  names = relationNames; groups:[Collection,string][] = [['nodes','节点'],['relations','关系'],['references','文件引用'],['views','树视图']];
  @ViewChild(CanvasComponent) canvas?:CanvasComponent;
  ngOnInit() { try { this.sidebarWidth = Number(localStorage.getItem('singularity.sidebarWidth')) || 290; } catch {} void this.load(); }
  get model() { return this.state()!.model; }
  get view() { return this.model.views.find(v => v.id === this.viewId); }
  get kind() { return treeKinds[this.view?.['kind'] || 'composition']; }
  get rows() { return forestRows(this.model,this.kind); }
  get types() { return [...Object.keys(this.state()!.schema.types),...Object.keys(this.model.types)].sort(); }
  get heading() { return this.original?.['title'] || this.original?.id || (this.creating ? '新建对象' : '请选择对象'); }
  get rootField() { return this.fields.find(f => f.key==='roots'); }
  get navigation() {
    if (!this.original || this.group!=='nodes') return [];
    const rows = this.rows, chain:{id:string;label:string}[] = [];
    let parent = rows.find(r => r.id===this.original!.id)?.parent;
    while (parent) { chain.unshift({id:parent,label:'祖先 · '+this.name(parent)}); parent = rows.find(r => r.id===parent)?.parent; }
    return [...chain,...rows.filter(r => r.parent===this.original!.id).map(r => ({id:r.id,label:'子节点 · '+this.name(r.id)}))];
  }
  get visibleRows() {
    const records = new Map(this.model[this.group].map(n => [n.id,n]));
    const rows:Row[] = this.group==='nodes' ? this.rows : [...records.keys()].map(id => ({id,parent:null,depth:0}));
    const query = this.search.trim().toLowerCase();
    const matches = new Set(rows.filter(r => {
      const item = records.get(r.id)!;
      return [JSON.stringify(item),this.name(item['source']),this.name(item['target']),this.names[item['type']]].join(' ').toLowerCase().includes(query);
    }).map(r => r.id));
    if (query && this.group==='nodes') {
      const parents = new Map(rows.map(r => [r.id,r.parent]));
      for (const id of [...matches]) { let p = parents.get(id); while(p) { matches.add(p); p = parents.get(p); } }
    }
    let hiddenDepth:number | null = null;
    return rows.filter(r => {
      if (!query && hiddenDepth!==null && r.depth>hiddenDepth) return false;
      hiddenDepth = !query && this.collapsed.has(this.viewId+r.id) ? r.depth : null;
      return matches.has(r.id);
    }).map(r => ({...r,item:records.get(r.id)!}));
  }
  name(id:string) { return this.state()?.model.nodes.find(n => n.id===id)?.['title'] || id || ''; }
  title(item:RecordValue) { return this.group==='relations' ? this.name(item['source'])+' → '+this.name(item['target']) : item['title'] || item['target'] || item.id; }
  detail(item:RecordValue) { return (this.group==='relations' ? this.names[item['type']] : this.group==='references' ? item['purpose'] : item['kind'])+' · '+item.id; }
  status(message:string,error=false) { this.message.set(message); this.error.set(error); }
  fail(e:any) { this.status(e.error?.error || e.message || String(e),true); }
  canLeave() { return !this.busy() && (!this.dirty || confirm('放弃尚未保存的修改？')); }
  async load(id?:string) {
    this.busy.set(true);
    try {
      const next = await this.api.load(); this.state.set(next);
      if (!next.model.views.some(v => v.id===this.viewId)) this.viewId = next.model.views.find(v => v['kind']==='composition')?.id || '';
      this.edit(next.model[this.group].find(n => n.id===id)); this.status('已加载');
    } catch(e) { this.fail(e); } finally { this.busy.set(false); }
  }
  reload() { if (this.canLeave()) void this.load(this.original?.id); }
  switchGroup(value:Collection,control:HTMLSelectElement) {
    if (!this.canLeave()) { control.value=this.group; return; }
    this.group=value; this.search=''; this.edit();
  }
  edit(item?:RecordValue,creating=false) {
    this.original=item; this.creating=creating; this.dirty=false; this.childParent=undefined; this.deleteMessage=''; this.rootSearch=''; this.result.set(null);
    this.fields = item || creating ? fieldsFor(this.group,item,this.state()!) : [];
    this.drafts.clear(); this.currentType = this.fields.find(f => f.key==='type')?.value || '';
    this.attributes = this.group==='nodes' ? attributeFields(this.state()!,this.currentType,item?.['attributes'] || {}) : [];
    if (item && this.group==='nodes') {
      if (this.search && !JSON.stringify(item).toLowerCase().includes(this.search.toLowerCase())) this.search='';
      const parents = new Map(this.rows.map(r => [r.id,r.parent])); let p = parents.get(item.id);
      while (p) { this.collapsed.delete(this.viewId+p); p = parents.get(p); }
    }
  }
  choose(item:RecordValue) { if (this.canLeave()) { this.edit(item); this.canvas?.focus(item.id); } }
  openNode(id:string) { if (!this.canLeave()) return; this.group='nodes'; this.search=''; this.edit(this.model.nodes.find(n => n.id===id)); this.canvas?.focus(id); }
  create(parent?:string) { if (!this.canLeave()) return; this.edit(undefined,true); this.childParent=parent; }
  changed(field:Field) {
    this.dirty=true;
    if (this.group==='nodes' && field.key==='type') {
      this.drafts.set(this.currentType,this.attributes); this.currentType=field.value;
      this.attributes=this.drafts.get(this.currentType) || attributeFields(this.state()!,this.currentType,{});
    }
  }
  toggleRoot(id:string,checked:boolean) { const f=this.rootField!; f.value=checked ? [...f.value,id] : f.value.filter((v:string) => v!==id); this.dirty=true; }
  hasChildren(id:string) { return this.model.relations.some(e => e['type']===this.kind && e['source']===id); }
  toggle(id:string) { const key=this.viewId+id; this.collapsed.has(key) ? this.collapsed.delete(key) : this.collapsed.add(key); }
  async commit(operations:Operation[],id?:string,basis?:string) {
    this.busy.set(true);
    try {
      await this.api.apply(this.state()!,operations,basis); this.dirty=false;
      try { const next=await this.api.load(); this.state.set(next); this.edit(next.model[this.group].find(n => n.id===id)); this.status('已保存'); }
      catch(e:any) { this.status('已写入，但重新读取失败：'+(e.message || e),true); }
    } catch(e) { this.fail(e); } finally { this.busy.set(false); }
  }
  save(deleting=false) {
    if (this.busy()) return;
    try {
      const values=deleting ? {} : readFields(this.fields); const basis=this.fields.find(f => f.key==='basis')?.value; delete values['basis'];
      if (!deleting && this.group==='nodes') {
        values['attributes']=readFields(this.attributes); values['actor']='Human';
        if (this.original?.['authorization_basis']) values['authorization_basis']=this.original['authorization_basis'];
      }
      const operation:Operation=deleting ? {action:'delete',collection:this.group,id:this.original!.id} : {action:'put',collection:this.group,value:values as RecordValue};
      const operations=[operation];
      if (!deleting && this.childParent) {
        operations.push({action:'put',collection:'relations',value:{id:relationId(this.model),type:this.kind,source:this.childParent,target:values['id']}});
        this.collapsed.delete(this.viewId+this.childParent);
      }
      void this.commit(operations,values['id'],basis);
    } catch(e) { this.fail(e); }
  }
  confirmDelete() {
    const id=this.original!.id; let blockers:RecordValue[]=[];
    if (this.group==='nodes') blockers=[...this.model.relations.filter(e => e['source']===id || e['target']===id),...this.model.views.filter(v => v['roots'].includes(id)),...this.model.nodes.filter(n => ['passed','failed'].includes(n['verification']) && n['verification_basis']?.includes(id))];
    if (this.group==='references') blockers=this.model.nodes.filter(n => n['references']?.includes(id));
    this.deleteBlocked=!!blockers.length; this.deleteMessage=blockers.length ? '请先解除依赖：'+blockers.map(b => b.id).join('、') : '确定删除 '+id+'？';
  }
  dragStart(event:DragEvent,id:string) { if (this.busy() || this.dirty) { event.preventDefault(); return; } this.dragged=id; event.dataTransfer?.setData('text/plain',id); }
  dragOver(event:DragEvent,id:string) { if (!this.dragged || this.dragged===id) return; event.preventDefault(); const rect=(event.currentTarget as HTMLElement).getBoundingClientRect(); const f=(event.clientY-rect.top)/rect.height; this.dropTarget=id; this.dropMode=f<.25?'before':f>.75?'after':'inside'; }
  drop(event:DragEvent,id:string) {
    event.preventDefault(); const source=this.dragged; this.dragged=undefined; this.dropTarget='';
    if (!source || !this.view || this.busy() || this.dirty || source===id) return;
    try { void this.commit(moveOperations(this.model,this.view,source,id,this.dropMode),source); } catch(e) { this.fail(e); }
  }
  async query() {
    const snapshot=this.state()!, id=this.original?.id; if (!id) return;
    try { const result=await this.api.context(snapshot,id,this.depth,this.edgeFilter,this.typeFilter); if (this.original?.id===id && this.group==='nodes' && this.state()===snapshot) this.result.set(result); } catch(e) { this.fail(e); }
  }
  get previewRows():Row[] {
    if (!this.original) return [];
    if (this.group==='relations') return [{id:this.original['source'],parent:null,depth:0},{id:this.original['target'],parent:this.original['source'],depth:1}];
    if (this.group==='references') return this.model.nodes.filter(n => n['references']?.includes(this.original!.id)).map(n => ({id:n.id,parent:null,depth:0}));
    return this.state()!.trees[this.original.id] || [];
  }
  previewChildren(parent:string | null) { return this.previewRows.filter(row => row.parent===parent); }
  resizeStart(event:PointerEvent) { if(event.button!==0) return; this.resize={x:event.clientX,width:this.sidebarWidth}; (event.target as HTMLElement).setPointerCapture(event.pointerId); event.preventDefault(); }
  resizeMove(event:PointerEvent) { if(this.resize) this.setWidth(this.resize.width+event.clientX-this.resize.x); }
  setWidth(width:number) { this.sidebarWidth=Math.round(Math.max(200,Math.min(window.innerWidth-360,width))); try { localStorage.setItem('singularity.sidebarWidth',String(this.sidebarWidth)); } catch {} }
  resizeKey(event:KeyboardEvent) { if(['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); this.setWidth(this.sidebarWidth+(event.key==='ArrowLeft'?-16:16)); } }
  @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent) { if(this.dirty || this.busy()) { event.preventDefault(); event.returnValue=''; } }
}
