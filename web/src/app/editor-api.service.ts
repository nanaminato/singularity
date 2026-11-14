import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Operation, Snapshot, RecordValue } from './model';
@Injectable({providedIn:'root'})
export class EditorApi {
  private http = inject(HttpClient);
  load() { return firstValueFrom(this.http.get<Snapshot>('/api/model')); }
  apply(snapshot: Snapshot, operations: Operation[], basis?: string) {
    return firstValueFrom(this.http.post<{revision:string}>('/api/apply', {revision:snapshot.revision,operations,basis}, {headers:{'X-Editor-Token':snapshot.token}}));
  }
  context(snapshot: Snapshot, id: string, depth: number, relations: string[], types: string[]) {
    return firstValueFrom(this.http.post<{matches:RecordValue[];visited:number;reasons:RecordValue[]}>('/api/context', {revision:snapshot.revision,id,depth,relations,types}, {headers:{'X-Editor-Token':snapshot.token}}));
  }
}
