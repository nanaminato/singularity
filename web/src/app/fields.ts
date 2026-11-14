import type { Collection, RecordValue, Snapshot } from './model';
export interface Field {key:string; label:string; value:any; required?:boolean; readonly?:boolean; long?:boolean; kind?:string; multiple?:boolean; choices?:[string,string][]; json?:boolean}
export function fieldsFor(group: Collection, item: RecordValue | undefined, state: Snapshot): Field[] {
  const fields: Field[] = [];
  const add = (key:string,label:string,config:Partial<Field> = {}, fallback:any = '') => fields.push({key,label,value:item?.[key] ?? fallback,...config});
  const choices = (values:string[]): [string,string][] => values.map(v => [v,v]);
  const nodes: [string,string][] = state.model.nodes.map(n => [n.id,n['title']+' · '+n.id]);
  add('id','稳定 ID',{required:true,readonly:!!item});
  if (group === 'nodes') {
    add('title','名称',{required:true});
    add('type','节点类型',{required:true,choices:choices([...Object.keys(state.schema.types),...Object.keys(state.model.types)].sort())},'module');
    add('body','正文（Markdown）',{required:true,long:true});
    for (const [key,label,fallback] of [['authorization','授权状态','not_applicable'],['delivery','交付状态','planned'],['verification','验证状态','unverified']])
      add(key,label,{required:true,choices:choices(state.schema[key as 'authorization'])},fallback);
    add('references','关联文件引用',{multiple:true,choices:state.model.references.map(r => [r.id,r['target']+' · '+r.id])},[]);
    add('verification_basis','验证证据',{multiple:true,choices:state.model.nodes.filter(n => n['type']==='evidence').map(n => [n.id,n['title']])},[]);
    add('basis','人工决定依据（确认、拒绝、退役或更改受保护节点时填写）',{long:true});
  } else if (group === 'relations') {
    add('type','关系类型',{required:true,choices:choices(state.schema.relations)},state.schema.relations[0]);
    add('source','起点',{required:true,choices:nodes},nodes[0]?.[0] || '');
    add('target','终点',{required:true,choices:nodes},nodes[0]?.[0] || '');
    add('rationale','关系依据',{long:true});
  } else if (group === 'references') {
    add('kind','引用类型',{required:true,choices:[['project_file','项目内文件'],['external_file','外部文件'],['url','网址']]},'project_file');
    add('target','路径或网址',{required:true}); add('purpose','用途',{required:true});
    add('tracking','版本跟踪',{required:true,choices:[['live','跟随当前文件'],['pinned','固定版本']]},'live');
    add('locator','章节或符号'); add('revision','版本标识'); add('digest','SHA-256 摘要');
  } else {
    add('title','视图名称',{required:true});
    add('kind','树类型',{required:true,choices:[['composition','系统组成'],['objectives','目标能力'],['delivery','交付计划']]},'composition');
    add('roots','根节点',{multiple:true,choices:nodes},[]);
  }
  return fields;
}
export function attributeFields(state:Snapshot, type:string, values:Record<string,any>): Field[] {
  const schema = state.model.types[type] || {required:state.schema.types[type] || {},optional:{}};
  return Object.entries({...schema.required,...schema.optional}).map(([key,kind]) => {
    const required = Object.hasOwn(schema.required,key), json = kind==='array' || kind==='object';
    return {key,label:key+' ('+kind+')',kind,required,json,long:json,
      value:values[key] === undefined ? '' : json ? JSON.stringify(values[key],null,2) : kind==='boolean' ? String(values[key]) : values[key],
      choices:kind==='boolean' ? [...(required ? [] : [['','未设置'] as [string,string]]),['true','true'],['false','false']] as [string,string][] : undefined};
  });
}
export function readFields(fields:Field[]): Record<string,any> {
  return Object.fromEntries(fields.map(f => {
    if ((f.value === '' || f.value == null) && !f.required) return [f.key,undefined];
    if (f.json) { try { return [f.key,JSON.parse(f.value)]; } catch { throw Error(f.label+'需要有效的 JSON'); } }
    if (f.kind==='boolean') return [f.key,f.value==='true'];
    if (f.kind==='number') return [f.key,Number(f.value)];
    return [f.key,f.value];
  }));
}
