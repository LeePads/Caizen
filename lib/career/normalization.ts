import type {
  CareerCourse,
  CareerCourseStatus,
  CareerCredential,
  CareerSkill,
  CareerSkillLevel,
} from '@/lib/types';
import { parseLocalDateKey } from '@/lib/date-utils';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { createEntityId } from '@/lib/utils';

type UnknownRecord = Record<string, unknown>;

const SKILL_LEVELS = new Set<CareerSkillLevel>([
  'Learning',
  'Familiar',
  'Proficient',
  'Advanced',
]);
const COURSE_STATUSES = new Set<CareerCourseStatus>([
  'Planned',
  'In progress',
  'Completed',
]);

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const cleanUrl = (value: unknown) => cleanText(value);

const cleanImageUrl = (value: unknown) =>
  normalizeExternalWebUrl(cleanText(value)) || undefined;

const cleanId = (value: unknown) => cleanText(value);

const cleanIdList = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map(cleanId).filter((id): id is string => Boolean(id)))]
    : [];

const normalizeDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : new Date(value);
  }
  if (typeof value !== 'string') return undefined;
  const valueDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseLocalDateKey(value)
    : new Date(value);
  return valueDate && !Number.isNaN(valueDate.getTime()) ? valueDate : undefined;
};

const createdAt = (value: unknown, fallback = new Date()) =>
  normalizeDate(value) || new Date(fallback);

export function normalizeCareerSkill(input: unknown, index = 0): CareerSkill {
  const value = (input && typeof input === 'object' ? input : {}) as UnknownRecord;
  const level = cleanText(value.level);
  return {
    id: cleanId(value.id) || createEntityId(`career-skill-${index}`),
    name: cleanText(value.name) || 'Untitled skill',
    area: cleanText(value.area),
    level: level && SKILL_LEVELS.has(level as CareerSkillLevel)
      ? level as CareerSkillLevel
      : 'Learning',
    notes: cleanText(value.notes),
    createdAt: createdAt(value.createdAt),
    updatedAt: normalizeDate(value.updatedAt),
  };
}

export function normalizeCareerCourse(input: unknown, index = 0): CareerCourse {
  const value = (input && typeof input === 'object' ? input : {}) as UnknownRecord;
  const status = cleanText(value.status);
  return {
    id: cleanId(value.id) || createEntityId(`career-course-${index}`),
    title: cleanText(value.title) || 'Untitled course',
    image: cleanImageUrl(value.image),
    attachmentAssetId: cleanId(value.attachmentAssetId),
    provider: cleanText(value.provider),
    status: status && COURSE_STATUSES.has(status as CareerCourseStatus)
      ? status as CareerCourseStatus
      : 'Planned',
    startDate: normalizeDate(value.startDate),
    completionDate: normalizeDate(value.completionDate),
    url: cleanUrl(value.url),
    notes: cleanText(value.notes),
    relatedSkillIds: cleanIdList(value.relatedSkillIds),
    createdAt: createdAt(value.createdAt),
    updatedAt: normalizeDate(value.updatedAt),
  };
}

export function normalizeCareerCredential(input: unknown, index = 0): CareerCredential {
  const value = (input && typeof input === 'object' ? input : {}) as UnknownRecord;
  return {
    id: cleanId(value.id) || createEntityId(`career-credential-${index}`),
    title: cleanText(value.title) || 'Untitled credential',
    image: cleanImageUrl(value.image),
    issuer: cleanText(value.issuer),
    relatedSkillIds: cleanIdList(value.relatedSkillIds),
    relatedCourseIds: cleanIdList(value.relatedCourseIds),
    issuedDate: normalizeDate(value.issuedDate),
    expiryDate: normalizeDate(value.expiryDate),
    noExpiry: value.noExpiry === true,
    credentialId: cleanText(value.credentialId),
    url: cleanUrl(value.url),
    notes: cleanText(value.notes),
    proofAssetId: cleanId(value.proofAssetId),
    createdAt: createdAt(value.createdAt),
    updatedAt: normalizeDate(value.updatedAt),
  };
}

export function normalizeCareerSkills(items: unknown): CareerSkill[] {
  return (Array.isArray(items) ? items : []).map(normalizeCareerSkill);
}

export function normalizeCareerCourses(items: unknown): CareerCourse[] {
  return (Array.isArray(items) ? items : []).map(normalizeCareerCourse);
}

export function normalizeCareerCredentials(items: unknown): CareerCredential[] {
  return (Array.isArray(items) ? items : []).map(normalizeCareerCredential);
}

/**
 * Canonical relationship boundary. Only forward references are retained and
 * no reverse links are synthesized.
 */
export function normalizeCareerCollections(
  skillsInput: unknown,
  coursesInput: unknown,
  credentialsInput: unknown,
) {
  const skills = normalizeCareerSkills(skillsInput);
  const courses = normalizeCareerCourses(coursesInput);
  const credentials = normalizeCareerCredentials(credentialsInput);
  const skillIds = new Set(skills.map(item => item.id));
  const courseIds = new Set(courses.map(item => item.id));

  return {
    skills,
    courses: courses.map(item => ({
      ...item,
      relatedSkillIds: item.relatedSkillIds.filter(id => skillIds.has(id)),
    })),
    credentials: credentials.map(item => ({
      ...item,
      relatedSkillIds: item.relatedSkillIds.filter(id => skillIds.has(id)),
      relatedCourseIds: item.relatedCourseIds.filter(id => courseIds.has(id)),
      ...(item.noExpiry ? { expiryDate: undefined } : {}),
    })),
  };
}

export type CareerCollections = ReturnType<typeof normalizeCareerCollections>;
