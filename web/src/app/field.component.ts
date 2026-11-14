import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field } from './fields';
@Component({selector:'editor-field', imports:[FormsModule], template:`
  <label [for]="id">{{field.label}}</label>
  @if (field.choices) {
    @if (field.multiple) {
    <select [id]="id" [ngModel]="field.value" (ngModelChange)="change($event)" [required]="!!field.required" multiple size="4">
      @for (choice of field.choices; track choice[0]) { <option [value]="choice[0]">{{choice[1]}}</option> }
    </select>
    } @else {
    <select [id]="id" [ngModel]="field.value" (ngModelChange)="change($event)" [required]="!!field.required">
      @for (choice of field.choices; track choice[0]) { <option [value]="choice[0]">{{choice[1]}}</option> }
    </select>
    }
  } @else if (field.long) {
    <textarea [id]="id" [ngModel]="field.value" (ngModelChange)="change($event)" [required]="!!field.required"></textarea>
  } @else {
    <input [id]="id" [type]="field.kind === 'number' ? 'number' : 'text'" step="any" [ngModel]="field.value" (ngModelChange)="change($event)" [required]="!!field.required" [readOnly]="!!field.readonly">
  }
`})
export class FieldComponent {
  @Input({required:true}) field!: Field;
  @Input() prefix = 'field';
  @Output() changed = new EventEmitter<void>();
  get id() { return this.prefix+'-'+this.field.key; }
  change(value:any) { this.field.value = value; this.changed.emit(); }
}
