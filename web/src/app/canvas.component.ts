import { Component, ElementRef, EventEmitter, Input, OnChanges, AfterViewInit, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { Snapshot, Row, relationNames } from './model';
interface Point {x:number;y:number}
@Component({selector:'editor-canvas',template:`
  <div id="universe-panel"><div class="universe-tools" role="toolbar" aria-label="画布工具栏">
    <button (click)="fit()">适应画布</button><div class="zoom-tools"><button aria-label="缩小画布" (click)="zoomBy(.8)">−</button><output id="zoom-level">{{percent()}}%</output><button aria-label="放大画布" (click)="zoomBy(1.25)">+</button></div>
    <span class="canvas-hint">滚轮缩放 · 拖动平移</span>
    <details id="relation-menu" #menu (keydown.escape)="menu.open=false"><summary>附加关系 <span id="relation-count">{{extra.size}}</span>⌄</summary>
      <div class="relation-popover"><div class="relation-heading"><strong>显示附加关系</strong><button (click)="extra.clear();draw()">清空</button></div><p>父子关系始终显示</p><div id="relation-options">
        @for(type of relations; track type) {@if(type!==kind) {<label><input type="checkbox" [checked]="extra.has(type)" (change)="toggle(type)"><span>{{names[type] || type}}</span><small>{{count(type)}}</small></label>}}
      </div></div>
    </details>
  </div><canvas #surface id="universe" aria-label="层级森林画布" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up()" (pointercancel)="gesture=null" (lostpointercapture)="gesture=null"></canvas></div>
`})
export class CanvasComponent implements OnChanges,AfterViewInit,OnDestroy {
  @Input({required:true}) model!:Snapshot['model']; @Input() rows:Row[]=[]; @Input() kind='contains';
  @Input() activeId=''; @Input() search=''; @Input() disabled=false; @Input() relations:string[]=[];
  @Output() selected=new EventEmitter<string>(); @ViewChild('surface') surface!:ElementRef<HTMLCanvasElement>;
  positions=new Map<string,Point>(); extra=new Set<string>(); names=relationNames; percent=signal(100);
  zoom=1; offset:Point={x:0,y:0}; key=''; observer?:ResizeObserver;
  gesture:{start:Point;previous:Point;id?:string;moved:boolean} | null=null;
  get canvas() { return this.surface?.nativeElement; }
  ngAfterViewInit() { this.observer=new ResizeObserver(() => this.draw()); this.observer.observe(this.canvas); this.canvas.addEventListener('wheel',this.wheel,{passive:false}); this.layout(); this.fit(); }
  ngOnChanges() { this.extra.delete(this.kind); const changed=this.layout(); if(this.canvas) changed ? this.fit() : this.draw(); }
  ngOnDestroy() { this.observer?.disconnect(); this.canvas?.removeEventListener('wheel',this.wheel); }
  count(type:string) { return this.model.relations.filter(e => e['type']===type).length; }
  toggle(type:string) { this.extra.has(type) ? this.extra.delete(type) : this.extra.add(type); this.draw(); }
  layout() {
    const key=JSON.stringify(this.rows); if(key===this.key) return false; this.key=key; this.positions.clear();
    const children=new Map<string | null,Row[]>(); for(const row of this.rows) children.set(row.parent,[...(children.get(row.parent)||[]),row]);
    let cursor=0;
    for(const root of children.get(null)||[]) {
      const stack=[{row:root,done:false}];
      while(stack.length) {
        const entry=stack.pop()!, descendants=children.get(entry.row.id)||[];
        if(!entry.done && descendants.length) { stack.push({row:entry.row,done:true}); for(const row of [...descendants].reverse()) stack.push({row,done:false}); }
        else { const y=descendants.length ? (this.positions.get(descendants[0].id)!.y+this.positions.get(descendants[descendants.length-1].id)!.y)/2 : cursor++*80; this.positions.set(entry.row.id,{x:entry.row.depth*280,y}); }
      }
      cursor+=1.5;
    }
    return true;
  }
  fit() {
    if(!this.canvas) return;
    if(!this.positions.size) {this.zoom=1;this.offset={x:0,y:0};this.draw();return;}
    const points=[...this.positions.values()],xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const left=Math.min(...xs)-120,right=Math.max(...xs)+120,top=Math.min(...ys)-65,bottom=Math.max(...ys)+65;
    this.zoom=Math.min(this.canvas.clientWidth/(right-left),this.canvas.clientHeight/(bottom-top),1.5);
    this.offset={x:this.canvas.clientWidth/2-(left+right)/2*this.zoom,y:this.canvas.clientHeight/2-(top+bottom)/2*this.zoom};this.draw();
  }
  draw() {
    const canvas=this.canvas; if(!canvas) return; const ctx=canvas.getContext('2d')!, ratio=devicePixelRatio||1;
    canvas.width=canvas.clientWidth*ratio;canvas.height=canvas.clientHeight*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);ctx.translate(this.offset.x,this.offset.y);ctx.scale(this.zoom,this.zoom);
    this.percent.set(Math.round(this.zoom*100));ctx.strokeStyle='#9baebe';ctx.lineWidth=1/this.zoom;
    for(const edge of this.model.relations) {
      if(edge['type']!==this.kind && !this.extra.has(edge['type'])) continue;
      const a=this.positions.get(edge['source']),b=this.positions.get(edge['target']);if(!a||!b) continue;
      ctx.beginPath();ctx.moveTo(a.x+90,a.y);
      if(edge['type']===this.kind) {ctx.setLineDash([]);ctx.lineTo(a.x+120,a.y);ctx.lineTo(a.x+120,b.y);ctx.lineTo(b.x-90,b.y);} else {ctx.setLineDash([5,5]);ctx.lineTo(b.x,b.y);}
      ctx.stroke();ctx.setLineDash([]);
    }
    const query=this.search.trim().toLowerCase();
    for(const node of this.model.nodes) {
      const p=this.positions.get(node.id);if(!p) continue;
      ctx.globalAlpha=!query || [node.id,node['title'],node['body']].join(' ').toLowerCase().includes(query) ? 1 : .22;
      ctx.fillStyle=this.activeId===node.id?'#c6e1fa':'#e4edf5';ctx.fillRect(p.x-90,p.y-22,180,44);
      ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillStyle='#142536';const title=node['title'] as string;ctx.fillText(title.length>13?title.slice(0,12)+'…':title,p.x,p.y+5);
    }
    ctx.globalAlpha=1;
  }
  point(event:MouseEvent):Point { const r=this.canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top}; }
  world(p:Point):Point { return {x:(p.x-this.offset.x)/this.zoom,y:(p.y-this.offset.y)/this.zoom}; }
  zoomAt(factor:number,p:Point) {const before=this.world(p);this.zoom=Math.min(4,Math.max(.1,this.zoom*factor));this.offset={x:p.x-before.x*this.zoom,y:p.y-before.y*this.zoom};this.draw();}
  zoomBy(factor:number) {this.zoomAt(factor,{x:this.canvas.clientWidth/2,y:this.canvas.clientHeight/2});}
  wheel=(event:WheelEvent) => {event.preventDefault();this.zoomAt(Math.exp(-event.deltaY*.001),this.point(event));};
  down(event:PointerEvent) {
    if(this.disabled || event.button!==0) return;const screen=this.point(event),pos=this.world(screen);
    const node=[...this.model.nodes].reverse().find(n=>{const p=this.positions.get(n.id);return p && Math.abs(p.x-pos.x)<=90 && Math.abs(p.y-pos.y)<=22;});
    this.gesture={start:screen,previous:screen,id:node?.id,moved:false};this.canvas.setPointerCapture(event.pointerId);
  }
  move(event:PointerEvent) {if(!this.gesture) return;const p=this.point(event);if(Math.hypot(p.x-this.gesture.start.x,p.y-this.gesture.start.y)>4)this.gesture.moved=true;this.offset.x+=p.x-this.gesture.previous.x;this.offset.y+=p.y-this.gesture.previous.y;this.gesture.previous=p;this.draw();}
  up() {const gesture=this.gesture;this.gesture=null;if(gesture?.id && !gesture.moved)this.selected.emit(gesture.id);}
  focus(id:string) {const p=this.positions.get(id);if(!p||!this.canvas)return;this.zoom=Math.max(this.zoom,1);this.offset={x:this.canvas.clientWidth/2-p.x*this.zoom,y:this.canvas.clientHeight/2-p.y*this.zoom};this.draw();}
}
