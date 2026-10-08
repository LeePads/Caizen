'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  BriefcaseBusiness,
  Bug,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Code2,
  Database,
  FileText,
  GripVertical,
  MoreHorizontal,
  Users,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import WorkCustomFieldRenderer from '@/components/work/WorkCustomFieldRenderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Checkbox } from '@/components/ui/checkbox';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { SectionTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  WorkCustomFieldDefinition,
  WorkCustomFieldType,
  WorkCustomFieldValue,
  WorkTypeDefinition,
} from '@/lib/types';
import {
  WORK_CUSTOM_FIELD_TYPES,
  WORK_CUSTOM_FIELD_TYPE_LABELS,
} from '@/lib/workhub/custom-fields';
import { createEntityId } from '@/lib/utils';

const INPUT = 'w-full rounded-xl';

const ICON_CHOICES = [
  { id: 'file-text', label: 'Document', Icon: FileText },
  { id: 'users', label: 'People', Icon: Users },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'check-circle', label: 'Completed', Icon: CheckCircle2 },
  { id: 'book-open', label: 'Book', Icon: BookOpen },
  { id: 'clipboard', label: 'Clipboard', Icon: Clipboard },
  { id: 'bug', label: 'Bug', Icon: Bug },
  { id: 'code', label: 'Code', Icon: Code2 },
  { id: 'database', label: 'Database', Icon: Database },
  { id: 'briefcase', label: 'Briefcase', Icon: BriefcaseBusiness },
] as const;

export default function WorkTypeEditor({
  value,
  onChange,
  fieldValueCounts,
  selectedFieldId,
  onSelectField,
  mobileFieldOnly = false,
}: {
  value: WorkTypeDefinition;
  onChange: (value: WorkTypeDefinition) => void;
  fieldValueCounts: Record<string, number>;
  selectedFieldId: string;
  onSelectField: (fieldId: string) => void;
  mobileFieldOnly?: boolean;
}) {
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<WorkCustomFieldType | ''>('');
  const [addFieldError, setAddFieldError] = useState('');
  const [pendingTypeChange, setPendingTypeChange] = useState<{
    fieldId: string;
    nextType: WorkCustomFieldType;
  } | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, WorkCustomFieldValue>>({});

  const activeFields = useMemo(
    () => value.fields.filter(field => !field.archived),
    [value.fields],
  );
  const archivedFields = useMemo(
    () => value.fields.filter(field => field.archived),
    [value.fields],
  );
  const selectedField = value.fields.find(field => field.id === selectedFieldId);

  const updateField = (fieldId: string, updates: Partial<WorkCustomFieldDefinition>) => {
    onChange({
      ...value,
      fields: value.fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    });
  };

  const addField = () => {
    const label = newFieldLabel.trim().replace(/\s+/g, ' ');
    if (!label) {
      setAddFieldError('Enter a field name.');
      return;
    }
    if (!newFieldType) {
      setAddFieldError('Choose a field type.');
      return;
    }
    const field: WorkCustomFieldDefinition = {
      id: createEntityId('work-field'),
      label,
      type: newFieldType,
      width: 'full',
      required: false,
      options: newFieldType === 'select' || newFieldType === 'multi-select' ? [] : undefined,
    };
    onChange({ ...value, fields: [...value.fields, field] });
    setNewFieldLabel('');
    setNewFieldType('');
    setAddFieldError('');
    setAddFieldOpen(false);
    onSelectField(field.id);
  };

  const reorderActiveFields = (activeIds: string[]) => {
    const currentActiveIds = activeFields.map(field => field.id);
    const positions = value.fields.flatMap((field, index) =>
      field.archived ? [] : [index],
    );
    const nextActive = activeIds
      .map(id => activeFields.find(field => field.id === id))
      .filter((field): field is WorkCustomFieldDefinition => Boolean(field));
    const fields = [...value.fields];
    positions.forEach((position, index) => {
      fields[position] = nextActive[index];
    });
    if (currentActiveIds.join('|') !== activeIds.join('|')) {
      onChange({ ...value, fields });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = activeFields.findIndex(field => field.id === event.active.id);
    const newIndex = activeFields.findIndex(field => field.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderActiveFields(arrayMove(activeFields, oldIndex, newIndex).map(field => field.id));
  };

  const moveField = (fieldId: string, direction: -1 | 1) => {
    const index = activeFields.findIndex(field => field.id === fieldId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= activeFields.length) return;
    const next = [...activeFields];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    reorderActiveFields(next.map(field => field.id));
  };

  const requestFieldTypeChange = (fieldId: string, nextType: WorkCustomFieldType) => {
    const field = value.fields.find(item => item.id === fieldId);
    if (!field || field.type === nextType) return;
    if ((fieldValueCounts[fieldId] || 0) > 0) {
      setPendingTypeChange({ fieldId, nextType });
      return;
    }
    updateField(fieldId, {
      type: nextType,
      options: nextType === 'select' || nextType === 'multi-select' ? field.options : undefined,
    });
  };

  const confirmFieldTypeChange = () => {
    if (!pendingTypeChange) return;
    const oldField = value.fields.find(field => field.id === pendingTypeChange.fieldId);
    if (!oldField) {
      setPendingTypeChange(null);
      return;
    }
    const nextField: WorkCustomFieldDefinition = {
      id: createEntityId('work-field'),
      label: oldField.label,
      type: pendingTypeChange.nextType,
      helpText: oldField.helpText,
      placeholder: oldField.placeholder,
      required: oldField.required,
      width: oldField.width,
      options: pendingTypeChange.nextType === 'select' || pendingTypeChange.nextType === 'multi-select'
        ? oldField.options?.map(option => ({ ...option })) || []
        : undefined,
    };
    onChange({
      ...value,
      fields: value.fields.flatMap(field => field.id === oldField.id
        ? [{ ...field, archived: true }, nextField]
        : [field]),
    });
    onSelectField(nextField.id);
    setPendingTypeChange(null);
  };

  return (
    <div className="@container/type-editor min-w-0">
      <SectionTabs
        mode="panels"
        value={mobileFieldOnly ? 'edit' : view}
        onValueChange={next => setView(next as 'edit' | 'preview')}
        className="min-w-0 gap-0"
      >
        {!mobileFieldOnly ? (
          <TabsList aria-label="Work Type editor view" className="mb-4">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        ) : null}
        <TabsContent
          value="preview"
          className="min-w-0"
        >
          {!mobileFieldOnly && view === 'preview' ? (
            <WorkTypePreview
              value={value}
              values={previewValues}
              onChange={(fieldId, nextValue) => setPreviewValues(current => {
                const next = { ...current };
                if (nextValue === undefined) delete next[fieldId];
                else next[fieldId] = nextValue;
                return next;
              })}
            />
          ) : null}
        </TabsContent>
        <TabsContent
          value="edit"
          role={mobileFieldOnly ? 'region' : undefined}
          aria-label={mobileFieldOnly ? 'Work Type field editor' : undefined}
          className="min-w-0"
        >
          {view === 'edit' || mobileFieldOnly ? (
        <div className="grid min-w-0 gap-5">
          <section className={mobileFieldOnly ? 'hidden' : 'grid gap-4'}>
            <div>
              <h3 className="text-sm font-semibold">Identity</h3>
            </div>
            <label className="grid gap-1.5 text-sm font-semibold">
              Name
              <Input
                value={value.name}
                maxLength={80}
                onChange={event => onChange({ ...value, name: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="flex flex-wrap items-baseline gap-x-2">Description <span className="font-normal text-muted-foreground">Optional</span></span>
              <Textarea
                value={value.description || ''}
                maxLength={240}
                onChange={event => onChange({ ...value, description: event.target.value })}
                className="min-h-20 resize-y"
              />
            </label>
            <IconPicker value={value.icon || 'file-text'} onChange={icon => onChange({ ...value, icon })} />
          </section>

          <section className="grid min-w-0 gap-3">
            <div className={mobileFieldOnly ? 'hidden' : 'grid min-w-0 gap-3'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Fields</h3>
                <p className="mt-1 text-xs text-muted-foreground">Archived fields remain readable on saved records.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAddFieldOpen(open => !open);
                  setAddFieldError('');
                }}
                className="min-h-11 rounded-xl"
                aria-expanded={addFieldOpen}
              >Add field</Button>
            </div>

            {addFieldOpen ? (
              <form
                className="grid gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 @min-[36rem]/type-editor:grid-cols-2 @min-[36rem]/type-editor:items-end"
                onSubmit={event => {
                  event.preventDefault();
                  addField();
                }}
              >
                <label className="grid gap-1.5 text-sm font-semibold">
                  Field label
                  <Input
                    value={newFieldLabel}
                    maxLength={80}
                    onChange={event => {
                      setNewFieldLabel(event.target.value);
                      setAddFieldError('');
                    }}
                    className={INPUT}
                    aria-invalid={Boolean(addFieldError && !newFieldLabel.trim())}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Field type
                  <AndroidAdaptiveSelect
                    label="New field type"
                    value={newFieldType}
                    onChange={nextType => {
                      setNewFieldType(nextType as WorkCustomFieldType | '');
                      setAddFieldError('');
                    }}
                    options={WORK_CUSTOM_FIELD_TYPES.map(type => ({ value: type, label: WORK_CUSTOM_FIELD_TYPE_LABELS[type] }))}
                    className={INPUT}
                    aria-invalid={Boolean(addFieldError && !newFieldType)}
                    aria-required
                  />
                </label>
                <Button type="submit" className="min-h-11 rounded-xl">Create field</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAddFieldOpen(false);
                    setNewFieldLabel('');
                    setNewFieldType('');
                    setAddFieldError('');
                  }}
                  className="min-h-11 rounded-xl"
                >Cancel</Button>
                {addFieldError ? <p role="alert" className="text-sm font-medium text-destructive sm:col-span-full">{addFieldError}</p> : null}
              </form>
            ) : null}

            {activeFields.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={activeFields.map(field => field.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {activeFields.map((field, index) => (
                      <SortableFieldRow
                        key={field.id}
                        field={field}
                        index={index}
                        count={activeFields.length}
                        selected={selectedFieldId === field.id}
                        onSelect={() => onSelectField(field.id)}
                        onMove={direction => moveField(field.id, direction)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                No active fields. Add a field when this type needs extra details.
              </div>
            )}

            {selectedField && !selectedField.archived ? (
              <div className={mobileFieldOnly ? 'hidden' : ''}>
                <FieldEditor
                  key={selectedField.id}
                  field={selectedField}
                  valueCount={fieldValueCounts[selectedField.id] || 0}
                  onChange={updates => updateField(selectedField.id, updates)}
                  onTypeChange={nextType => requestFieldTypeChange(selectedField.id, nextType)}
                  onArchive={() => updateField(selectedField.id, { archived: true })}
                />
              </div>
            ) : null}

            {archivedFields.length ? (
              <details className="border-t border-border/55 pt-3">
                <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Archived fields ({archivedFields.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {archivedFields.map(field => (
                    <div key={field.id} className="flex min-w-0 items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{field.label}</p>
                        <p className="text-xs text-muted-foreground">{WORK_CUSTOM_FIELD_TYPE_LABELS[field.type]} (Archived)</p>
                      </div>
                      <Button type="button" variant="outline" onClick={() => updateField(field.id, { archived: false })} className="min-h-11 shrink-0 rounded-xl">Restore</Button>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            </div>

            {mobileFieldOnly && selectedField && !selectedField.archived ? (
              <div className="min-w-0">
                <FieldEditor
                  key={`mobile-${selectedField.id}`}
                  field={selectedField}
                  valueCount={fieldValueCounts[selectedField.id] || 0}
                  onChange={updates => updateField(selectedField.id, updates)}
                  onTypeChange={nextType => requestFieldTypeChange(selectedField.id, nextType)}
                  onArchive={() => updateField(selectedField.id, { archived: true })}
                />
              </div>
            ) : null}

            {mobileFieldOnly && selectedField?.archived ? (
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border/55 bg-background p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{selectedField.label}</p>
                  <p className="text-xs text-muted-foreground">{WORK_CUSTOM_FIELD_TYPE_LABELS[selectedField.type]} (Archived)</p>
                  <p className="mt-1 text-xs text-muted-foreground">Saved values remain readable on existing records.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => updateField(selectedField.id, { archived: false })} className="min-h-11 shrink-0 rounded-xl">Restore</Button>
              </div>
            ) : null}

            {mobileFieldOnly && archivedFields.length ? (
              <details className="rounded-xl border border-border/55 bg-muted/10 p-3">
                <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Archived fields ({archivedFields.length})
                </summary>
                <div className="mt-2 grid gap-1">
                  {archivedFields.map(field => (
                    <div key={field.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{field.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{WORK_CUSTOM_FIELD_TYPE_LABELS[field.type]}</span>
                      <Button type="button" variant="ghost" onClick={() => updateField(field.id, { archived: false })} className="min-h-11 shrink-0 rounded-lg">Restore</Button>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        </div>
          ) : null}
        </TabsContent>
      </SectionTabs>

      <ConfirmDialog
        isOpen={Boolean(pendingTypeChange)}
        title="Change field type?"
        message="Saved records use this field. Changing its type will archive the current field and add a new one, so older values remain readable."
        confirmText="Change type"
        cancelText="Keep current type"
        isDangerous={false}
        onConfirm={confirmFieldTypeChange}
        onCancel={() => setPendingTypeChange(null)}
      />
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const selectedChoice = ICON_CHOICES.find(choice => choice.id === value) || ICON_CHOICES[0];
  const SelectedIcon = selectedChoice.Icon;
  return (
    <details className="min-w-0 rounded-xl border border-border/55 bg-background px-3">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <SelectedIcon className="size-4 text-primary" aria-hidden="true" />
        <span>Icon: {selectedChoice.label}</span>
        <span className="ml-auto text-xs font-bold text-primary">Change</span>
      </summary>
      <div className="grid grid-cols-2 gap-2 pb-3 @min-[24rem]/type-editor:grid-cols-5" role="group" aria-label="Work Type icon">
        {ICON_CHOICES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            aria-label={label}
            onClick={() => onChange(id)}
            className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-caption font-semibold ${value === id ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/50'}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="max-w-full truncate">{label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function SortableFieldRow({
  field,
  index,
  count,
  selected,
  onSelect,
  onMove,
}: {
  field: WorkCustomFieldDefinition;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 ${selected ? 'border-primary/45 bg-primary/5' : 'border-border/55 bg-background'} ${isDragging ? 'z-10 opacity-75' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${field.label}`}
        className="hidden size-11 shrink-0 touch-none place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @min-[28rem]/type-editor:grid"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${field.label}, field ${index + 1} of ${count}`}
        className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{field.label}</span>
        <span className="text-xs text-muted-foreground">{WORK_CUSTOM_FIELD_TYPE_LABELS[field.type]}</span>
        {field.required ? <span className="text-xs font-semibold text-primary">Required</span> : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={`More actions for ${field.label}`} className="size-11 shrink-0 rounded-lg">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
            <ArrowUp className="mr-2 size-4" aria-hidden="true" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
            <ArrowDown className="mr-2 size-4" aria-hidden="true" /> Move down
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function FieldEditor({
  field,
  valueCount,
  onChange,
  onTypeChange,
  onArchive,
}: {
  field: WorkCustomFieldDefinition;
  valueCount: number;
  onChange: (updates: Partial<WorkCustomFieldDefinition>) => void;
  onTypeChange: (type: WorkCustomFieldType) => void;
  onArchive?: () => void;
}) {
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [optionError, setOptionError] = useState('');
  const hasOptions = field.type === 'select' || field.type === 'multi-select';
  const supportsPlaceholder = ['short-text', 'long-text', 'number', 'url'].includes(field.type);
  const renderOption = (option: NonNullable<WorkCustomFieldDefinition['options']>[number]) => (
    <div key={option.id} className="flex min-w-0 flex-wrap items-center gap-2">
      <Input
        value={option.label}
        maxLength={80}
        aria-label={`${option.archived ? 'Archived ' : ''}option label, ${option.label}`}
        onChange={event => onChange({ options: (field.options || []).map(current => current.id === option.id ? { ...current, label: event.target.value } : current) })}
        className={`${INPUT} min-w-0 flex-1 basis-40`}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange({ options: (field.options || []).map(current => current.id === option.id ? { ...current, archived: !current.archived || undefined } : current) })}
        className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold"
      >{option.archived ? 'Restore option' : 'Archive option'}</Button>
    </div>
  );

  return (
    <section className="grid min-w-0 gap-4 border-t border-border/60 pt-4" aria-label={`Edit field ${field.label}`}>
      <div>
        <h4 className="text-sm font-semibold">Field details</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {valueCount > 0 ? `${valueCount} saved record${valueCount === 1 ? ' uses' : 's use'} this field.` : 'No saved records use this field yet.'}
        </p>
      </div>

      <label className="grid gap-1.5 text-sm font-semibold">
        Field label
          <Input value={field.label} maxLength={80} onChange={event => onChange({ label: event.target.value })} className={INPUT} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        Type
        <AndroidAdaptiveSelect
          label="Field type"
          value={field.type}
          onChange={type => onTypeChange(type as WorkCustomFieldType)}
          options={WORK_CUSTOM_FIELD_TYPES.map(type => ({ value: type, label: WORK_CUSTOM_FIELD_TYPE_LABELS[type] }))}
          className={INPUT}
        />
      </label>
      {hasOptions ? (
        <fieldset className="grid min-w-0 gap-2">
          <legend className="mb-1 text-sm font-semibold">Options</legend>
          {(field.options || []).filter(option => !option.archived).map(renderOption)}
          {(field.options || []).some(option => option.archived) ? (
            <details className="rounded-xl border border-border/50 p-3">
              <summary className="min-h-11 cursor-pointer content-center text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Archived options ({field.options?.filter(option => option.archived).length || 0})</summary>
              <div className="mt-2 grid gap-2">{(field.options || []).filter(option => option.archived).map(renderOption)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Saved records keep their archived selections. Archived options cannot be selected on new records.</p>
            </details>
          ) : null}
          <div className="flex flex-col gap-2 @min-[28rem]/type-editor:flex-row">
            <Input
              value={newOptionLabel}
              onChange={event => { setNewOptionLabel(event.target.value); setOptionError(''); }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOption();
                }
              }}
              maxLength={80}
              placeholder="New option"
              aria-label="New option label"
              aria-invalid={Boolean(optionError)}
              aria-describedby={optionError ? `work-option-error-${field.id}` : undefined}
              className={`${INPUT} min-w-0 flex-1`}
            />
            <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={addOption}>Add option</Button>
          </div>
          {optionError ? <p id={`work-option-error-${field.id}`} role="alert" className="text-body-sm text-destructive">{optionError}</p> : null}
        </fieldset>
      ) : null}

      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <Checkbox checked={Boolean(field.required)} onCheckedChange={checked => onChange({ required: Boolean(checked) })} />
        Required
      </label>

      <details className="rounded-xl border border-border/50 px-3">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">More options</summary>
        <div className="grid gap-3 pb-3">
          <label className="grid gap-1.5 text-sm font-semibold">
            Help text <span className="font-normal text-muted-foreground">Optional</span>
            <Input value={field.helpText || ''} maxLength={240} onChange={event => onChange({ helpText: event.target.value })} className={INPUT} />
          </label>
          {supportsPlaceholder ? (
            <label className="grid gap-1.5 text-sm font-semibold">
              Placeholder <span className="font-normal text-muted-foreground">Optional</span>
              <Input value={field.placeholder || ''} maxLength={120} onChange={event => onChange({ placeholder: event.target.value })} className={INPUT} />
            </label>
          ) : null}
          <label className="grid gap-1.5 text-sm font-semibold">
            Width
            <AndroidAdaptiveSelect
              label="Field width"
              value={field.width || 'full'}
              onChange={width => onChange({ width: width as 'half' | 'full' })}
              options={[{ value: 'half', label: 'Half width' }, { value: 'full', label: 'Full width' }]}
              className={INPUT}
            />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3">
        {onArchive ? (
          <Button type="button" variant="outline" onClick={onArchive} className="min-h-11 rounded-xl">Archive field</Button>
        ) : null}
      </div>

      <span className="sr-only" aria-live="polite">{field.archived ? 'Archived field' : 'Active field'}</span>
    </section>
  );

  function addOption() {
    const label = newOptionLabel.trim().replace(/\s+/g, ' ');
    if (!label) { setOptionError('Enter an option label.'); return; }
    if ((field.options || []).some(option => option.label.localeCompare(label, undefined, { sensitivity: 'base' }) === 0)) { setOptionError('This option already exists, including archived options. Choose a different label.'); return; }
    setOptionError('');
    onChange({ options: [...(field.options || []), { id: createEntityId('work-option'), label }] });
    setNewOptionLabel('');
  }
}

function WorkTypePreview({
  value,
  values,
  onChange,
}: {
  value: WorkTypeDefinition;
  values: Record<string, WorkCustomFieldValue>;
  onChange: (fieldId: string, value: WorkCustomFieldValue | undefined) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-lg font-semibold">{value.name || 'New Work Type'}</p>
        {value.description ? <p className="mt-1 text-sm text-muted-foreground">{value.description}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {value.kind === 'note' ? 'Note form preview' : 'Resource form preview'}
        </p>
      </div>
      <div className="grid min-w-0 gap-4 border-t border-border/60 pt-4 @min-[28rem]/type-editor:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold @min-[28rem]/type-editor:col-span-2">
          Title
          <Input className={INPUT} placeholder={value.kind === 'note' ? 'New note title' : 'Resource title'} />
        </label>
        {value.kind === 'note' ? (
          <>
            <label className="grid gap-1.5 text-sm font-semibold">Date<AdaptiveDatePicker label="Preview date" value="" onChange={() => undefined} className={INPUT} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Project<Input className={INPUT} placeholder="Choose a project" /></label>
            <label className="grid gap-1.5 text-sm font-semibold @min-[28rem]/type-editor:col-span-2">Note details<Textarea className="min-h-20" placeholder="Add details" /></label>
          </>
        ) : (
          <>
            <label className="grid gap-1.5 text-sm font-semibold">Project<Input className={INPUT} placeholder="Choose a project" /></label>
            <label className="grid gap-1.5 text-sm font-semibold">URL<Input type="url" className={INPUT} placeholder="https://" /></label>
          </>
        )}
        <label className="grid gap-1.5 text-sm font-semibold @min-[28rem]/type-editor:col-span-2">Work category<Input className={INPUT} placeholder="Optional category" /></label>
        <div className="@min-[28rem]/type-editor:col-span-2">
          <WorkCustomFieldRenderer fields={value.fields} values={values} onChange={onChange} />
        </div>
        {value.fields.length === 0 ? <p className="text-sm text-muted-foreground @min-[28rem]/type-editor:col-span-2">Add custom fields to see them in this form.</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">Preview only. Values entered here are not saved as a note or resource.</p>
    </div>
  );
}
