import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';

type JsonRecord = Record<string, unknown>;
type SchemaType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';

interface PropertySchema {
  type?: SchemaType;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, PropertySchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
}

interface SchemaField {
  path: string[];
  key: string;
  title: string;
  description?: string;
  type: SchemaType;
  required: boolean;
  options?: unknown[];
  control: FormControl<unknown>;
}

/**
 * Angular-native Gatekeeper constraint parameter editor.
 * The schema is local Kubernetes Gatekeeper OpenAPI data, not executable HTML.
 * Unknown property values are retained when editing an existing constraint.
 */
@Component({
  selector: 'app-constraint-schema-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCheckboxModule,
    MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <section class="constraint-schema-fields" aria-label="Constraint properties">
      <div *ngFor="let field of fields; trackBy: trackField" class="schema-property">
        <mat-checkbox *ngIf="field.type === 'boolean'; else nonBoolean"
          [formControl]="field.control" [attr.aria-label]="field.title">
          {{ field.title }}
        </mat-checkbox>
        <ng-template #nonBoolean>
          <mat-form-field appearance="fill" class="schema-property-input">
            <mat-label>{{ field.title }}</mat-label>
            <mat-select *ngIf="field.options; else textInput"
              [formControl]="field.control">
              <mat-option *ngFor="let option of field.options" [value]="option">
                {{ option }}
              </mat-option>
            </mat-select>
            <ng-template #textInput>
              <textarea *ngIf="field.type === 'array' || field.type === 'object'; else scalarInput"
                matInput rows="3" [formControl]="field.control"
                [attr.aria-label]="field.title"></textarea>
              <ng-template #scalarInput>
                <input matInput [type]="field.type === 'integer' || field.type === 'number' ? 'number' : 'text'"
                  [formControl]="field.control" [attr.aria-label]="field.title">
              </ng-template>
            </ng-template>
            <mat-hint *ngIf="field.description">{{ field.description }}</mat-hint>
            <mat-error *ngIf="field.control.invalid">
              Invalid {{ field.title }} (check required, value type and schema constraints)
            </mat-error>
          </mat-form-field>
        </ng-template>
      </div>
    </section>
  `,
  styles: [`
    .constraint-schema-fields { display: grid; gap: 12px; width: 100%; }
    .schema-property { min-width: 0; }
    .schema-property-input { width: 100%; }
  `]
})
export class ConstraintSchemaFormComponent implements OnChanges, OnDestroy {
  @Input() schema: PropertySchema | null = null;
  @Input() value: JsonRecord | null = null;
  @Output() readonly valueChange = new EventEmitter<JsonRecord>();
  @Output() readonly validChange = new EventEmitter<boolean>();

  fields: SchemaField[] = [];
  private changeSubscription?: Subscription;
  private lastEmitted?: JsonRecord;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] || (changes['value'] && this.value !== this.lastEmitted)) {
      this.rebuild();
    }
  }

  ngOnDestroy(): void {
    this.changeSubscription?.unsubscribe();
  }

  trackField(_index: number, field: SchemaField): string {
    return field.key;
  }

  private rebuild(): void {
    this.changeSubscription?.unsubscribe();
    this.fields = [];
    this.collect(this.schema ?? {}, [], this.value ?? {});
    this.changeSubscription = new Subscription();
    for (const field of this.fields) {
      this.changeSubscription.add(field.control.valueChanges.subscribe(() => this.emitValues()));
    }
    this.validChange.emit(this.fields.every(field => field.control.valid));
  }

  private collect(schema: PropertySchema, prefix: string[], existing: JsonRecord): void {
    const required = new Set(schema.required ?? []);
    for (const [key, definition] of Object.entries(schema.properties ?? {})) {
      const path = [...prefix, key];
      if (definition.type === 'object' && definition.properties) {
        this.collect(definition, path, existing);
        continue;
      }
      const type: SchemaType = definition.type ?? 'string';
      const raw = this.readValue(existing, path) ?? definition.default;
      const initial = type === 'array' || type === 'object'
        ? JSON.stringify(raw ?? (type === 'array' ? [] : {}), null, 2)
        : (raw ?? (type === 'boolean' ? false : ''));
      const constraints: ValidatorFn[] = [];
      if (required.has(key) || (prefix.length === 0 && required.has(key))) {
        constraints.push(Validators.required);
      }
      if (definition.minLength !== undefined) constraints.push(Validators.minLength(definition.minLength));
      if (definition.maxLength !== undefined) constraints.push(Validators.maxLength(definition.maxLength));
      if (definition.minimum !== undefined) constraints.push(Validators.min(definition.minimum));
      if (definition.maximum !== undefined) constraints.push(Validators.max(definition.maximum));
      if (definition.pattern) constraints.push(Validators.pattern(definition.pattern));
      constraints.push((control: AbstractControl) => {
        const current = control.value;
        if (current === '' || current === null || current === undefined) return null;
        if (definition.enum && !definition.enum.includes(current)) return { enum: true };
        if (type === 'integer' || type === 'number') {
          const number = Number(current);
          if (!Number.isFinite(number) || (type === 'integer' && !Number.isInteger(number))) {
            return { numeric: true };
          }
        }
        if (type === 'array' || type === 'object') {
          try {
            const parsed: unknown = JSON.parse(String(current));
            if (type === 'array' && !Array.isArray(parsed)) return { array: true };
            if (type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
              return { object: true };
            }
            if (Array.isArray(parsed)) {
              if (definition.minItems !== undefined && parsed.length < definition.minItems) return { minItems: true };
              if (definition.maxItems !== undefined && parsed.length > definition.maxItems) return { maxItems: true };
            }
          } catch {
            return { json: true };
          }
        }
        return null;
      });
      this.fields.push({
        path, key: path.join('.'), title: definition.title ?? path.join(' / '),
        description: definition.description, type, required: required.has(key),
        options: definition.enum,
        control: new FormControl<unknown>(initial, { validators: constraints })
      });
    }
  }

  private readValue(record: JsonRecord, path: string[]): unknown {
    let current: unknown = record;
    for (const part of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      current = (current as JsonRecord)[part];
    }
    return current;
  }

  private writeValue(record: JsonRecord, path: string[], value: unknown): void {
    let current = record;
    for (const part of path.slice(0, -1)) {
      const next = current[part];
      if (!next || typeof next !== 'object' || Array.isArray(next)) current[part] = {};
      current = current[part] as JsonRecord;
    }
    current[path[path.length - 1]] = value;
  }

  private emitValues(): void {
    const valid = this.fields.every(field => field.control.valid);
    this.validChange.emit(valid);
    if (!valid) return; // Never submit an incomplete or malformed Gatekeeper policy.
    const result: JsonRecord = structuredClone(this.value ?? {});
    for (const field of this.fields) {
      const raw = field.control.value;
      const value: unknown = field.type === 'array' || field.type === 'object'
        ? JSON.parse(String(raw))
        : field.type === 'integer' || field.type === 'number'
          ? (raw === '' ? undefined : Number(raw))
          : raw;
      this.writeValue(result, field.path, value);
    }
    this.lastEmitted = result;
    this.valueChange.emit(result);
  }
}
