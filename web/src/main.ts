import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';

type Action = 'create' | 'update' | 'links' | 'confirm' | 'reject' | 'retire' | 'remove';
interface RecordData {
  id: string;
  status: 'Candidate' | 'Confirmed' | 'Rejected' | 'Retired';
  statement: string;
  reason?: string;
  actor?: "Human" | "AI";
  rejection_reason?: string;
  paths?: string[];
  decisions?: string[];
}
interface RecordEntry {
  record: RecordData;
  revision: string;
}
interface MapNode {
  key: string;
  value: string;
  label: string;
  kind: 'intent' | 'paths' | 'decisions';
  neighbors: MapNode[];
  x: number;
  y: number;
}
interface HistoryEntry {
  commit: string;
  date: string;
  subject: string;
  path_before: string | null;
  path_after: string | null;
  changes: Record<string, { before: unknown; after: unknown }>;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

@Component({
  selector: 'singularity-editor',
  imports: [FormsModule],
  templateUrl: './editor.html',
})
class Editor {
  private readonly changeDetector = inject(ChangeDetectorRef);
  records: RecordEntry[] = [];
  nodeNames: Record<string, string> = {};
  selected?: RecordEntry;
  overview = true;
  filter = '';
  creating = false;
  confirmingRemoval = false;
  newId = '';
  statement = '';
  disposition = '';
  paths = '';
  decisions = '';
  linkKind: 'paths' | 'decisions' = 'paths';
  linkValue = '';
  selectedLink?: {kind: 'paths' | 'decisions'; value: string};
  historyId = '';
  private token = '';
  busy = false;
  error = false;
  message = '';
  history = signal<HistoryEntry[]>([]);
  historyMessage = signal('');
  historyBusy = signal(false);

  constructor() { void this.reload(); }

  get record() { return this.selected?.record; }
  get editable() {
    return this.creating || this.record?.status === 'Candidate' || this.record?.status === 'Confirmed';
  }
  get filtered() {
    const query = this.filter.trim().toLowerCase();
    return this.records.filter(({record}) =>
      [record.id, this.nodeNames[record.id], record.statement].join(' ').toLowerCase().includes(query));
  }

  get satellites() {
    const links = (['paths', 'decisions'] as const).flatMap(kind =>
      this.lines(this[kind]).map(value => ({kind, value})));
    return links.map((link, index) => {
      const angle = -90 + index * 360 / Math.min(links.length, 12);
      const radians = angle * Math.PI / 180;
      const name = link.kind === 'decisions' ? this.nodeNames[link.value] : undefined;
      return {...link, name, angle, x: 50 + 35 * Math.cos(radians), y: 50 + 35 * Math.sin(radians)};
    });
  }

  mapZoom = 1;
  mapX = 0;
  mapY = 0;
  mapTarget?: MapNode;
  private drag?: {id: number; x: number; y: number};

  get overviewGraph() {
    const nodes = new Map<string, MapNode>();
    const edges: {source: MapNode; target: MapNode}[] = [];
    for (const {record} of this.filtered) {
      const source: MapNode = {
        key: 'intent:' + record.id, value: record.id, kind: 'intent',
        label: this.nodeNames[record.id] || record.id, neighbors: [], x: 0, y: 0,
      };
      nodes.set(source.key, source);
      for (const kind of ['paths', 'decisions'] as const) {
        for (const value of new Set(record[kind])) {
          const key = kind + ':' + value;
          let target = nodes.get(key);
          if (!target) {
            target = {key, value, kind, label: kind === 'decisions' ? this.nodeNames[value] || value : value,
              neighbors: [], x: 0, y: 0};
            nodes.set(key, target);
          }
          source.neighbors.push(target);
          target.neighbors.push(source);
          edges.push({source, target});
        }
      }
    }

    const visited = new Set<MapNode>();
    const groups: MapNode[][] = [];
    const isolated: MapNode[] = [];
    for (const node of nodes.values()) {
      if (visited.has(node)) continue;
      visited.add(node);
      if (!node.neighbors.length) {
        isolated.push(node);
        continue;
      }
      const group = [node];
      for (const member of group) {
        for (const neighbor of member.neighbors) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          group.push(neighbor);
        }
      }
      groups.push(group);
    }

    let right = 24;
    let bottom = 0;
    for (const group of groups) {
      const hub = group.reduce((best, node) => node.neighbors.length > best.neighbors.length ? node : best);
      const remaining = group.filter(node => node !== hub);
      const radius = Math.max(94, remaining.length * 32 / Math.PI);
      hub.x = right + radius + 58;
      hub.y = radius + 62;
      remaining.forEach((node, index) => {
        const angle = index * 2 * Math.PI / remaining.length - Math.PI / 2;
        node.x = hub.x + radius * Math.cos(angle);
        node.y = hub.y + radius * Math.sin(angle);
      });
      right += radius * 2 + 144;
      bottom = Math.max(bottom, radius * 2 + 122);
    }

    isolated.forEach((node, index) => {
      node.x = 80 + index % 6 * 132;
      node.y = bottom + 72 + Math.floor(index / 6) * 96;
    });
    const width = Math.max(380, right, Math.min(isolated.length, 6) * 132 + 32);
    const height = Math.max(260, bottom + Math.ceil(isolated.length / 6) * 96 + 32);
    return {nodes: [...nodes.values()], nodesByKey: nodes, edges, width, height};
  }

  get mapDragging() { return this.drag !== undefined; }

  resetMap() {
    this.mapZoom = 1;
    this.mapX = this.mapY = 0;
  }

  zoomMap(factor: number, x: number, y: number) {
    const zoom = Math.min(16, Math.max(0.5, this.mapZoom * factor));
    const ratio = zoom / this.mapZoom;
    this.mapX = x - (x - this.mapX) * ratio;
    this.mapY = y - (y - this.mapY) * ratio;
    this.mapZoom = zoom;
  }

  private mapPoint(svg: SVGSVGElement, event: MouseEvent) {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  wheelMap(event: WheelEvent) {
    const svg = event.currentTarget;
    if (!(svg instanceof SVGSVGElement)) return;
    event.preventDefault();
    const point = this.mapPoint(svg, event);
    if (point) this.zoomMap(event.deltaY < 0 ? 1.15 : 1 / 1.15, point.x, point.y);
  }

  startMapDrag(event: PointerEvent) {
    const svg = event.currentTarget;
    if (!(svg instanceof SVGSVGElement)) return;
    if (event.button !== 0 || this.drag || (event.target as Element).closest('.map-node')) return;
    const point = this.mapPoint(svg, event);
    if (!point) return;
    svg.setPointerCapture(event.pointerId);
    this.drag = {id: event.pointerId, x: point.x, y: point.y};
  }

  moveMap(event: PointerEvent) {
    const svg = event.currentTarget;
    if (!(svg instanceof SVGSVGElement)) return;
    if (this.drag?.id !== event.pointerId) return;
    const point = this.mapPoint(svg, event);
    if (!point) return;
    this.mapX += point.x - this.drag.x;
    this.mapY += point.y - this.drag.y;
    this.drag = {id: event.pointerId, x: point.x, y: point.y};
  }

  stopMapDrag(event: PointerEvent) {
    if (this.drag?.id === event.pointerId) this.drag = undefined;
  }

  get mapRecord() {
    return this.mapTarget?.kind === 'intent'
      ? this.records.find(({record}) => record.id === this.mapTarget?.value)?.record
      : undefined;
  }

  openMapNode(node: MapNode) {
    this.mapTarget = node;
    if (node.kind === 'intent') {
      this.historyId = node.value;
      this.history.set([]);
      this.historyMessage.set('');
    }
  }

  private lines(value: string) {
    return [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  }

  addLink() {
    const value = this.linkValue.trim();
    if (!value || /[\r\n]/.test(value)) return;
    if (this.selectedLink) this.removeLink(this.selectedLink.kind, this.selectedLink.value);
    this[this.linkKind] = this.lines(this[this.linkKind] + '\n' + value).join('\n');
    this.selectedLink = undefined;
    this.linkValue = '';
  }

  removeLink(kind: 'paths' | 'decisions', value: string) {
    this[kind] = this.lines(this[kind]).filter(link => link !== value).join('\n');
  }

  selectLink(node: {kind: 'paths' | 'decisions'; value: string}) {
    if (!this.editable || this.busy) return;
    this.selectedLink = node;
    this.linkKind = node.kind;
    this.linkValue = node.value;
  }

  select(id: string) {
    this.overview = false;
    this.mapTarget = undefined;
    this.creating = false;
    this.confirmingRemoval = false;
    this.selected = this.records.find(entry => entry.record.id === id);
    this.statement = this.record?.statement ?? '';
    this.paths = this.record?.paths?.join('\n') ?? '';
    this.decisions = this.record?.decisions?.join('\n') ?? '';
    this.disposition = '';
    this.linkValue = '';
    this.selectedLink = undefined;
    this.historyId = this.record?.id ?? this.historyId;
    this.history.set([]);
    this.historyMessage.set('');
  }

  create() {
    this.select('');
    this.creating = true;
    this.newId = this.message = '';
  }

  async reload(preferred = this.record?.id) {
    this.busy = true;
    try {
      const data = await request<{token: string; records: RecordEntry[]; nodeNames: Record<string, string>}>('/api/records');
      this.mapTarget = undefined;
      this.records = data.records;
      this.nodeNames = data.nodeNames;
      this.token = data.token;
      if (!this.overview) {
        this.select(this.filtered.find(item => item.record.id === preferred)?.record.id ?? this.filtered[0]?.record.id ?? '');
      }
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  async edit(action: Action) {
    if (this.busy) return;
    const id = this.creating ? this.newId.trim() : this.record?.id;
    if (!id) {
      this.report(new Error('请输入稳定 ID。'));
      return;
    }
    if (action === 'confirm' && this.statement !== this.record?.statement) {
      this.report(new Error('请先保存修改后的陈述，再确认该记录。'));
      return;
    }
    const body: Record<string, unknown> = {id, action, revision: this.selected?.revision};
    if (action === 'create' || action === 'update') body['statement'] = this.statement;
    if (action === 'reject') body['disposition'] = this.disposition;
    if (action === 'remove' && !this.confirmingRemoval) return;
    if (action === 'links' || action === 'create') {
      body['paths'] = this.lines(this.paths);
      body['decisions'] = this.lines(this.decisions);
    }
    this.busy = true;
    try {
      await request('/api/edit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Editor-Token': this.token},
        body: JSON.stringify(body),
      });
      this.error = false;
      this.message = {
        create: '已创建候选。', update: '已保存。', links: '已保存关联。',
        confirm: '已确认。', reject: '已拒绝候选。', retire: '已标记为移除。', remove: '已删除记录。',
      }[action];
      this.filter = '';
      await this.reload(id);
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  async loadHistory() {
    this.historyBusy.set(true);
    this.history.set([]);
    this.historyMessage.set('正在读取 Git 历史…');
    try {
      const data = await request<HistoryEntry[]>('/api/history?id=' + encodeURIComponent(this.historyId.trim()));
      this.history.set(data.reverse());
      this.historyMessage.set(data.length ? '' : '没有已提交的变更。');
    } catch (error) {
      this.historyMessage.set(String(error));
    } finally {
      this.historyBusy.set(false);
    }
  }

  changes(entry: HistoryEntry) {
    return Object.entries(entry.changes).map(([field, change]) =>
      field + '\n旧值 ' + JSON.stringify(change.before) + '\n新值 ' + JSON.stringify(change.after)).join('\n\n');
  }

  private report(error: unknown) {
    this.error = true;
    this.message = error instanceof Error ? error.message : String(error);
  }
}

bootstrapApplication(Editor).catch(console.error);
