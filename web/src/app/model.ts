export type Collection = 'nodes' | 'relations' | 'references' | 'views';
export interface RecordValue {id: string; [key: string]: any}
export interface Row {id: string; parent: string | null; depth: number}
export interface Snapshot {
  revision: string; token: string;
  model: {project: {name: string}; nodes: RecordValue[]; relations: RecordValue[]; references: RecordValue[]; views: RecordValue[]; types: Record<string, {required: Record<string, string>; optional: Record<string, string>}>};
  trees: Record<string, Row[]>;
  schema: {types: Record<string, Record<string, string>>; relations: string[]; views: string[]; authorization: string[]; delivery: string[]; verification: string[]};
}
export interface Operation {action: 'put' | 'delete'; collection: Collection; value?: RecordValue; id?: string}
export const treeKinds: Record<string, string> = {composition: 'contains', objectives: 'decomposes', delivery: 'plans'};
export const relationNames: Record<string, string> = {contains:'组成',decomposes:'目标分解',plans:'交付计划',depends_on:'依赖',derived_from:'推导依据',constrains:'约束',implements:'实现',verifies:'验证',supports:'证据支持',conflicts_with:'冲突',supersedes:'替代',references:'一般关联'};
export function forestRows(model: Snapshot['model'], kind: string): Row[] {
  const edges = model.relations.filter(e => e['type'] === kind);
  const children = new Map<string, string[]>();
  for (const e of edges) children.set(e['source'], [...(children.get(e['source']) || []), e['target']]);
  const childIds = new Set(edges.map(e => e['target']));
  const stack: Row[] = model.nodes.filter(n => !childIds.has(n.id)).reverse().map(n => ({id:n.id, parent:null, depth:0}));
  const rows: Row[] = [], seen = new Set<string>();
  while (stack.length) {
    const row = stack.pop()!;
    if (seen.has(row.id)) continue;
    seen.add(row.id); rows.push(row);
    for (const id of [...(children.get(row.id) || [])].reverse()) stack.push({id,parent:row.id,depth:row.depth+1});
  }
  return rows;
}
export function relationId(model: Snapshot['model']): string {
  const ids = new Set(['nodes','relations','references','views'].flatMap(key => model[key as Collection].map(r => r.id)));
  let i = 1; while (ids.has('REL-TREE-' + i)) i++;
  return 'REL-TREE-' + i;
}
export function moveOperations(model: Snapshot['model'], view: RecordValue, source: string, target: string, mode: string): Operation[] {
  const kind = treeKinds[view['kind']], edges = model.relations.filter(e => e['type'] === kind);
  const old = edges.find(e => e['target'] === source), destination = edges.find(e => e['target'] === target);
  const parent = mode === 'inside' ? target : destination?.['source'];
  const roots: string[] = view['roots'].filter((id: string) => id !== source);
  const remaining = edges.filter(e => e !== old);
  if (parent) {
    const edge = {...old, id:old?.id || relationId(model), type:kind, source:parent, target:source};
    remaining.splice(mode === 'inside' ? remaining.length : remaining.indexOf(destination!) + (mode === 'after' ? 1 : 0), 0, edge);
  } else {
    const index = roots.indexOf(target);
    if (index < 0) throw Error('目标不在当前视图的根节点中');
    roots.splice(index + (mode === 'after' ? 1 : 0), 0, source);
  }
  return [...edges.map(e => ({action:'delete' as const, collection:'relations' as const,id:e.id})),
    ...remaining.map(value => ({action:'put' as const,collection:'relations' as const,value})),
    {action:'put',collection:'views',value:{...view,roots}}];
}
