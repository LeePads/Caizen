import type { WorkItem, WorkRecordKind, WorkTypeDefinition } from '@/lib/types';
import { normalizeWorkTypeDefinitions } from './custom-fields';

function builtIn(id: string, name: string, kind: WorkRecordKind): WorkTypeDefinition {
  return { id, name, kind, builtIn: true, fields: [] };
}

export const BUILT_IN_WORK_TYPES: readonly WorkTypeDefinition[] = [
  builtIn('note-general', 'General Note', 'note'),
  builtIn('note-meeting', 'Meeting', 'note'),
  builtIn('note-daily-update', 'Daily Update', 'note'),
  builtIn('note-decision', 'Decision', 'note'),
  builtIn('note-research', 'Research Note', 'note'),
  builtIn('note-client-call', 'Client Call', 'note'),
  builtIn('note-lesson-plan', 'Lesson Plan', 'note'),
  builtIn('note-case-note', 'Case Note', 'note'),
  builtIn('note-bug-incident', 'Bug / Incident', 'note'),
  builtIn('note-report-draft', 'Report Draft', 'note'),
  builtIn('note-test-session', 'Test Session', 'note'),
  builtIn('note-other', 'Other', 'note'),
  builtIn('resource-document', 'Document', 'resource'),
  builtIn('resource-reference', 'Reference', 'resource'),
  builtIn('resource-report', 'Report', 'resource'),
  builtIn('resource-presentation', 'Presentation', 'resource'),
  builtIn('resource-ticket-case', 'Ticket / Case', 'resource'),
  builtIn('resource-dataset', 'Dataset', 'resource'),
  builtIn('resource-template', 'Template', 'resource'),
  builtIn('resource-contract', 'Contract', 'resource'),
  builtIn('resource-brief', 'Brief', 'resource'),
];

const LEGACY_NOTE_TYPES: Record<NonNullable<WorkItem['noteType']>, string> = {
  scratchpad: 'note-general',
  meeting: 'note-meeting',
  daily: 'note-daily-update',
  test: 'note-test-session',
  bug: 'note-bug-incident',
  report_draft: 'note-report-draft',
  other: 'note-other',
};

const LEGACY_RESOURCE_TYPES: Record<NonNullable<WorkItem['fileType']>, string> = {
  file: 'resource-document',
  report: 'resource-report',
  presentation: 'resource-presentation',
  note_file: 'resource-reference',
  ticket: 'resource-ticket-case',
  test_data: 'resource-dataset',
  template: 'resource-template',
};

export function resolveWorkTypes(overrides: unknown): WorkTypeDefinition[] {
  const normalized = normalizeWorkTypeDefinitions(overrides);
  const byId = new Map(normalized.map(type => [type.id, type]));
  const builtIns = BUILT_IN_WORK_TYPES.map(defaultType => ({
    ...defaultType,
    ...(byId.get(defaultType.id) ? { ...byId.get(defaultType.id), builtIn: true } : {}),
  }));
  const custom = normalized.filter(type => !BUILT_IN_WORK_TYPES.some(defaultType => defaultType.id === type.id));
  return [...builtIns, ...custom];
}

export function serializeWorkTypeOverrides(types: readonly WorkTypeDefinition[]): WorkTypeDefinition[] {
  return types.flatMap<WorkTypeDefinition>(type => {
    const defaultType = BUILT_IN_WORK_TYPES.find(candidate => candidate.id === type.id);
    if (!defaultType) return [{ ...type, builtIn: false }];
    const content = (candidate: WorkTypeDefinition) => JSON.stringify({
      name: candidate.name,
      description: candidate.description || '',
      kind: candidate.kind,
      icon: candidate.icon || '',
      archived: candidate.archived === true,
      fields: candidate.fields,
    });
    return content(type) === content(defaultType) ? [] : [{ ...type, builtIn: true }];
  });
}

export function resolveWorkTypeId(item: Pick<WorkItem, 'type' | 'noteType' | 'fileType' | 'workTypeId'>): string {
  if (item.workTypeId?.trim()) return item.workTypeId.trim();
  if (item.type === 'note') return item.noteType ? LEGACY_NOTE_TYPES[item.noteType] : 'note-general';
  const resourceType = item.fileType || item.type;
  if (resourceType && Object.hasOwn(LEGACY_RESOURCE_TYPES, resourceType)) {
    return LEGACY_RESOURCE_TYPES[resourceType as keyof typeof LEGACY_RESOURCE_TYPES];
  }
  return 'resource-document';
}

export function legacyNoteTypeForWorkType(typeId: string): NonNullable<WorkItem['noteType']> {
  const match = Object.entries(LEGACY_NOTE_TYPES).find(([, id]) => id === typeId);
  return match?.[0] as NonNullable<WorkItem['noteType']> || 'other';
}

export function legacyResourceTypeForWorkType(typeId: string): NonNullable<WorkItem['fileType']> {
  const match = Object.entries(LEGACY_RESOURCE_TYPES).find(([, id]) => id === typeId);
  return match?.[0] as NonNullable<WorkItem['fileType']> || 'file';
}

export function workTypeForItem(
  item: Pick<WorkItem, 'type' | 'noteType' | 'fileType' | 'workTypeId'>,
  types: readonly WorkTypeDefinition[],
): WorkTypeDefinition | undefined {
  const id = resolveWorkTypeId(item);
  const configured = types.find(type => type.id === id);
  if (configured) return configured;
  const legacyId = resolveWorkTypeId({ ...item, workTypeId: undefined });
  return types.find(type => type.id === legacyId) || undefined;
}

export function workTypeDisplayName(item: Pick<WorkItem, 'type' | 'noteType' | 'fileType' | 'workTypeId'>, types: readonly WorkTypeDefinition[]): string {
  const type = workTypeForItem(item, types);
  if (type) return type.name;
  if (item.type === 'note') return item.noteType === 'bug' ? 'Bug / Incident' : item.noteType === 'meeting' ? 'Meeting' : item.noteType === 'daily' ? 'Daily Update' : item.noteType === 'test' ? 'Test Session' : item.noteType === 'report_draft' ? 'Report Draft' : 'General Note';
  return 'Document';
}

export type WorkTypePreset = {
  id: string;
  label: string;
  description: string;
  types: Array<{ kind: WorkRecordKind; name: string }>;
};

export const WORK_TYPE_PRESETS: readonly WorkTypePreset[] = [
  { id: 'general', label: 'General', description: 'A flexible starting point for everyday notes and references.', types: [{ kind: 'note', name: 'Decision' }, { kind: 'note', name: 'Research Note' }, { kind: 'resource', name: 'Reference' }] },
  { id: 'software-qa', label: 'Software / QA', description: 'Useful record types for incidents, test sessions, tickets, and datasets.', types: [{ kind: 'note', name: 'Bug / Incident' }, { kind: 'note', name: 'Test Session' }, { kind: 'resource', name: 'Dataset' }, { kind: 'resource', name: 'Ticket / Case' }] },
  { id: 'freelance-client', label: 'Freelance / Client', description: 'Keep client conversations, decisions, contracts, and briefs together.', types: [{ kind: 'note', name: 'Client Call' }, { kind: 'note', name: 'Decision' }, { kind: 'resource', name: 'Contract' }, { kind: 'resource', name: 'Brief' }] },
  { id: 'education', label: 'Education', description: 'Organize lesson planning, research, and learning references.', types: [{ kind: 'note', name: 'Lesson Plan' }, { kind: 'note', name: 'Research Note' }, { kind: 'resource', name: 'Reference' }] },
  { id: 'operations', label: 'Operations', description: 'Track regular updates, decisions, and reusable templates.', types: [{ kind: 'note', name: 'Daily Update' }, { kind: 'note', name: 'Decision' }, { kind: 'resource', name: 'Template' }] },
  { id: 'creative', label: 'Creative', description: 'Collect research, decisions, and concise project briefs.', types: [{ kind: 'note', name: 'Research Note' }, { kind: 'note', name: 'Decision' }, { kind: 'resource', name: 'Brief' }] },
];

export function createPresetWorkTypes(presetId: string): WorkTypeDefinition[] {
  const preset = WORK_TYPE_PRESETS.find(item => item.id === presetId);
  if (!preset) return [];
  return preset.types.map((type, index) => ({
    id: `custom-${preset.id}-${type.kind}-${type.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
    name: type.name,
    kind: type.kind,
    description: `${preset.label} preset`,
    fields: [],
  }));
}

export function addMissingPresetWorkTypes(
  current: readonly WorkTypeDefinition[],
  presetId: string,
): { next: WorkTypeDefinition[]; added: WorkTypeDefinition[]; skipped: number } {
  const candidates = createPresetWorkTypes(presetId);
  const existingNames = new Set(
    current.map(type => `${type.kind}:${type.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`),
  );
  const usedIds = new Set(current.map(type => type.id));
  const added = candidates
    .filter(candidate =>
      !existingNames.has(`${candidate.kind}:${candidate.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`),
    )
    .map(candidate => {
      let id = candidate.id;
      let suffix = 2;
      while (usedIds.has(id)) id = `${candidate.id}-${suffix++}`;
      usedIds.add(id);
      return id === candidate.id ? candidate : { ...candidate, id };
    });
  return { next: [...current, ...added], added, skipped: candidates.length - added.length };
}

export function restoreBuiltInWorkTypeDefaults(
  current: WorkTypeDefinition,
): WorkTypeDefinition {
  const defaults = BUILT_IN_WORK_TYPES.find(type => type.id === current.id);
  if (!defaults) return current;
  return {
    ...defaults,
    // Keep user-created field definitions so their saved values remain
    // visible in the archived-values section on existing records.
    fields: current.fields.map(field => ({ ...field, archived: true })),
  };
}
