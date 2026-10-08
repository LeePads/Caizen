import type {
  WorkCustomFieldDefinition,
  WorkCustomFieldOption,
  WorkCustomFieldType,
  WorkCustomFieldValue,
  WorkTypeDefinition,
} from '@/lib/types';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { createEntityId } from '@/lib/utils';

export const WORK_CUSTOM_FIELD_TYPES: readonly WorkCustomFieldType[] = [
  'short-text', 'long-text', 'number', 'select', 'multi-select', 'date', 'url', 'checkbox',
];

export const WORK_CUSTOM_FIELD_TYPE_LABELS: Record<WorkCustomFieldType, string> = {
  'short-text': 'Short text',
  'long-text': 'Long text',
  number: 'Number',
  select: 'Select',
  'multi-select': 'Multi-select',
  date: 'Date',
  url: 'URL',
  checkbox: 'Checkbox',
};

const SAFE_WORK_ICONS = new Set([
  'file-text', 'users', 'calendar', 'check-circle', 'book-open', 'clipboard', 'bug', 'code', 'database', 'briefcase',
]);

function cleanText(value: unknown, maxLength = 120): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizeOptions(value: unknown): WorkCustomFieldOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const option = raw as Record<string, unknown>;
    const id = cleanText(option.id, 96) || createEntityId('work-option');
    const label = cleanText(option.label, 80);
    if (!label || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label, ...(option.archived === true ? { archived: true } : {}) }];
  });
}

export function normalizeWorkCustomFieldDefinitions(value: unknown): WorkCustomFieldDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const candidate = raw as Record<string, unknown>;
    const id = cleanText(candidate.id, 96) || createEntityId('work-field');
    const label = cleanText(candidate.label, 80);
    const type = typeof candidate.type === 'string' && WORK_CUSTOM_FIELD_TYPES.includes(candidate.type as WorkCustomFieldType)
      ? candidate.type as WorkCustomFieldType
      : undefined;
    if (!label || !type || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      label,
      type,
      helpText: cleanText(candidate.helpText, 240) || undefined,
      placeholder: cleanText(candidate.placeholder, 120) || undefined,
      required: candidate.required === true,
      width: candidate.width === 'half' ? 'half' : 'full',
      archived: candidate.archived === true,
      options: type === 'select' || type === 'multi-select' ? normalizeOptions(candidate.options) : undefined,
    }];
  });
}

export function normalizeWorkTypeDefinitions(value: unknown): WorkTypeDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const candidate = raw as Record<string, unknown>;
    const id = cleanText(candidate.id, 96);
    const name = cleanText(candidate.name, 80);
    const kind = candidate.kind === 'resource' ? 'resource' : candidate.kind === 'note' ? 'note' : undefined;
    if (!id || !name || !kind || seen.has(id)) return [];
    seen.add(id);
    const icon = typeof candidate.icon === 'string' && SAFE_WORK_ICONS.has(candidate.icon) ? candidate.icon : undefined;
    return [{
      id,
      name,
      kind,
      description: cleanText(candidate.description, 240) || undefined,
      icon,
      archived: candidate.archived === true,
      builtIn: candidate.builtIn === true,
      fields: normalizeWorkCustomFieldDefinitions(candidate.fields),
    }];
  });
}

export function normalizeWorkCustomFieldValues(value: unknown): Record<string, WorkCustomFieldValue> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const normalized: Record<string, WorkCustomFieldValue> = {};
  for (const [rawId, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const id = cleanText(rawId, 96);
    if (!id) continue;
    if (typeof rawValue === 'string') normalized[id] = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) normalized[id] = rawValue;
    else if (typeof rawValue === 'boolean') normalized[id] = rawValue;
    else if (Array.isArray(rawValue)) {
      normalized[id] = [...new Set(rawValue.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map(entry => entry.trim()))];
    }
  }
  return normalized;
}

export type WorkCustomFieldValidation = { valid: boolean; errors: Record<string, string>; values: Record<string, WorkCustomFieldValue> };

export function validateWorkCustomFieldValues(
  fields: readonly WorkCustomFieldDefinition[],
  value: unknown,
): WorkCustomFieldValidation {
  const values = normalizeWorkCustomFieldValues(value) || {};
  const rawValues = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.archived) continue;
    const current = values[field.id];
    if (field.type === 'number' && typeof rawValues[field.id] === 'number' && !Number.isFinite(rawValues[field.id])) {
      errors[field.id] = `${field.label} must be a finite number.`;
      continue;
    }
    const hasValue = field.type === 'checkbox'
      ? typeof current === 'boolean'
      : typeof current === 'string'
        ? current.trim().length > 0
        : typeof current === 'number'
          ? Number.isFinite(current)
          : Array.isArray(current) && current.length > 0;
    if (field.required && !hasValue) errors[field.id] = `${field.label} is required.`;
    if (!hasValue) continue;
    if (field.type === 'number' && (typeof current !== 'number' || !Number.isFinite(current))) {
      errors[field.id] = `${field.label} must be a finite number.`;
    } else if (field.type === 'date' && (typeof current !== 'string' || !isLocalDate(current))) {
      errors[field.id] = `${field.label} must be a valid date.`;
    } else if (field.type === 'url' && (typeof current !== 'string' || !normalizeExternalWebUrl(current))) {
      errors[field.id] = `${field.label} must use a valid HTTP or HTTPS URL.`;
    } else if (field.type === 'select' && (
      typeof current !== 'string' || !field.options?.some(option => option.id === current)
    )) {
      errors[field.id] = `Choose a valid ${field.label.toLowerCase()} option.`;
    } else if (field.type === 'multi-select' && (
      !Array.isArray(current) || current.some(id => !field.options?.some(option => option.id === id))
    )) {
      errors[field.id] = `Choose valid ${field.label.toLowerCase()} options.`;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

function isLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

export function formatWorkCustomFieldValues(
  value: unknown,
  definitions: readonly WorkCustomFieldDefinition[] = [],
): string {
  const values = normalizeWorkCustomFieldValues(value) || {};
  const fieldsById = new Map(definitions.map(field => [field.id, field]));
  return Object.entries(values).map(([id, raw]) => {
    const field = fieldsById.get(id);
    const formatted = Array.isArray(raw)
      ? raw.map(optionId => field?.options?.find(option => option.id === optionId)?.label || optionId).join(', ')
      : field?.type === 'select' && typeof raw === 'string'
        ? field.options?.find(option => option.id === raw)?.label || raw
      : typeof raw === 'boolean'
        ? raw ? 'Yes' : 'No'
        : String(raw);
    return `${field?.label || id}: ${formatted}`;
  }).join(' ');
}

export function workTypeForValues(types: readonly WorkTypeDefinition[], typeId?: string): WorkTypeDefinition | undefined {
  return typeId ? types.find(type => type.id === typeId) : undefined;
}

export function safeWorkTypeIcon(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_WORK_ICONS.has(value) ? value : undefined;
}
