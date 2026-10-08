import { toLocalDateKey } from '@/lib/date-utils';
import { buildXlsxWorkbook, xlsxHeader, type XlsxCell } from '@/lib/reports/xlsx-workbook';
import { getLocalReportDateLabel, sanitizeExportFileName } from '@/lib/reports/export-utils';
import { csvCell } from '@/lib/reports/csv-cell';
import { getCareerCredentialExpiryStatus } from '@/lib/career/expiry';
import type {
  CareerCourse,
  CareerCredential,
  CareerCredentialExpiryStatus,
  CareerSkill,
  CareerSkillLevel,
  PersonalVaultItem,
} from '@/lib/types';

export type CareerExportFormat = 'pdf' | 'xlsx' | 'skills-csv' | 'courses-csv' | 'credentials-csv';
export type CareerExportScope = 'all' | 'current' | 'custom';
export type CareerExportRecordType = 'all' | 'skills' | 'courses' | 'credentials' | 'legacy';

export type CareerExportCustomFilters = {
  recordType: CareerExportRecordType;
  skillLevel: 'all' | CareerSkillLevel;
  courseStatus: 'all' | CareerCourse['status'];
  expiryStatus: 'all' | CareerCredentialExpiryStatus;
  search: string;
};

export type CareerExportPdfOptions = {
  includeDetails: boolean;
  includeNotes: boolean;
  includeLegacyItems: boolean;
};

export type CareerExportSkill = {
  name: string;
  area: string;
  level: string;
  notes: string;
  relatedCourses: string;
  relatedCredentials: string;
};

export type CareerExportCourse = {
  title: string;
  provider: string;
  status: string;
  startDate: string;
  completionDate: string;
  relatedSkills: string;
  relatedCredentials: string;
  url: string;
  notes: string;
};

export type CareerExportCredential = {
  title: string;
  issuer: string;
  relatedSkills: string;
  relatedCourses: string;
  issuedDate: string;
  expiryDate: string;
  expiryStatus: CareerCredentialExpiryStatus;
  credentialId: string;
  url: string;
  proofAttached: boolean;
  notes: string;
};

export type CareerExportLegacyItem = {
  title: string;
  category: string;
  issuer: string;
  date: string;
  expiryDate: string;
  link: string;
};

export type CareerExportSummary = {
  skillCount: number;
  courseCount: number;
  completedCourseCount: number;
  credentialCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  legacyItemCount: number;
};

export type CareerExportDocument = {
  title: 'Career Report';
  profileName: string;
  generatedAt: Date;
  scope: CareerExportScope;
  scopeLabel: string;
  filterSummary: string;
  skills: CareerExportSkill[];
  courses: CareerExportCourse[];
  credentials: CareerExportCredential[];
  legacyItems: CareerExportLegacyItem[];
  summary: CareerExportSummary;
};

const SKILL_HEADERS = ['Skill', 'Area', 'Level', 'Related Courses', 'Related Credentials', 'Notes'] as const;
const COURSE_HEADERS = ['Course', 'Provider / Platform', 'Status', 'Start Date', 'Completed Date', 'Related Skills', 'Related Credentials', 'URL', 'Notes'] as const;
const CREDENTIAL_HEADERS = ['Credential', 'Issuer', 'Related Skills', 'Related Courses', 'Issued Date', 'Expiry Date', 'Expiry Status', 'Credential ID', 'URL', 'Proof Attached', 'Notes'] as const;

const dateLabel = (value: Date | null | undefined) => value ? toLocalDateKey(value) : '';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const cell = (value: unknown): XlsxCell => ({ value: value == null ? '' : String(value) });

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(query: string, values: unknown[]) {
  if (!query) return true;
  return values.some(value => text(value).toLocaleLowerCase().includes(query));
}

function uniqueNames(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function resolveCareerExportRecords({
  scope,
  skills,
  courses,
  credentials,
  legacyItems,
  current,
  customFilters,
}: {
  scope: CareerExportScope;
  skills: CareerSkill[];
  courses: CareerCourse[];
  credentials: CareerCredential[];
  legacyItems: PersonalVaultItem[];
  current: { skills: CareerSkill[]; courses: CareerCourse[]; credentials: CareerCredential[]; legacyItems: PersonalVaultItem[] };
  customFilters: CareerExportCustomFilters;
}) {
  if (scope === 'current') return current;
  const source = scope === 'custom' ? { skills, courses, credentials, legacyItems } : { skills, courses, credentials, legacyItems };
  if (scope !== 'custom') return source;
  const query = normalizeSearch(customFilters.search);
  const filteredSkills = customFilters.recordType !== 'all' && customFilters.recordType !== 'skills'
    ? []
    : source.skills.filter(item => (customFilters.skillLevel === 'all' || item.level === customFilters.skillLevel) && matchesSearch(query, [item.name, item.area, item.notes]));
  const filteredCourses = customFilters.recordType !== 'all' && customFilters.recordType !== 'courses'
    ? []
    : source.courses.filter(item => (customFilters.courseStatus === 'all' || item.status === customFilters.courseStatus) && matchesSearch(query, [item.title, item.provider, item.notes]));
  const filteredCredentials = customFilters.recordType !== 'all' && customFilters.recordType !== 'credentials'
    ? []
    : source.credentials.filter(item => (customFilters.expiryStatus === 'all' || getCareerCredentialExpiryStatus(item) === customFilters.expiryStatus) && matchesSearch(query, [item.title, item.issuer, item.credentialId, item.notes]));
  const filteredLegacy = customFilters.recordType !== 'all' && customFilters.recordType !== 'legacy'
    ? []
    : source.legacyItems.filter(item => matchesSearch(query, [item.title, item.subType, item.issuer, item.notes]));
  return { skills: filteredSkills, courses: filteredCourses, credentials: filteredCredentials, legacyItems: filteredLegacy };
}

function buildRows(records: ReturnType<typeof resolveCareerExportRecords>, generatedAt = new Date()): CareerExportDocument {
  const skillById = new Map(records.skills.map(item => [item.id, item]));
  const courseById = new Map(records.courses.map(item => [item.id, item]));
  const credentialsForSkill = (id: string) => uniqueNames(records.credentials.filter(item => item.relatedSkillIds.includes(id)).map(item => item.title));
  const coursesForSkill = (id: string) => uniqueNames(records.courses.filter(item => item.relatedSkillIds.includes(id)).map(item => item.title));
  const credentialsForCourse = (id: string) => uniqueNames(records.credentials.filter(item => item.relatedCourseIds.includes(id)).map(item => item.title));
  const skillsForIds = (ids: string[]) => uniqueNames(ids.map(id => skillById.get(id)?.name || ''));
  const coursesForIds = (ids: string[]) => uniqueNames(ids.map(id => courseById.get(id)?.title || ''));
  const skills = records.skills.map(item => ({
    name: item.name,
    area: item.area || '',
    level: item.level || '',
    notes: item.notes || '',
    relatedCourses: coursesForSkill(item.id).join(', '),
    relatedCredentials: credentialsForSkill(item.id).join(', '),
  }));
  const courses = records.courses.map(item => ({
    title: item.title,
    provider: item.provider || '',
    status: item.status,
    startDate: dateLabel(item.startDate),
    completionDate: dateLabel(item.completionDate),
    relatedSkills: skillsForIds(item.relatedSkillIds).join(', '),
    relatedCredentials: credentialsForCourse(item.id).join(', '),
    url: item.url || '',
    notes: item.notes || '',
  }));
  const credentials = records.credentials.map(item => ({
    title: item.title,
    issuer: item.issuer || '',
    relatedSkills: skillsForIds(item.relatedSkillIds).join(', '),
    relatedCourses: coursesForIds(item.relatedCourseIds).join(', '),
    issuedDate: dateLabel(item.issuedDate),
    expiryDate: item.noExpiry ? '' : dateLabel(item.expiryDate),
    expiryStatus: getCareerCredentialExpiryStatus(item),
    credentialId: item.credentialId || '',
    url: item.url || '',
    proofAttached: Boolean(item.proofAssetId),
    notes: item.notes || '',
  }));
  const legacy = records.legacyItems.map(item => ({
    title: item.title,
    category: item.subType || '',
    issuer: item.issuer || '',
    date: dateLabel(item.date),
    expiryDate: dateLabel(item.expiryDate),
    link: item.link || item.officialWebsite || '',
  }));
  const expiringSoonCount = credentials.filter(item => item.expiryStatus === 'Expiring soon').length;
  const expiredCount = credentials.filter(item => item.expiryStatus === 'Expired').length;
  return {
    title: 'Career Report',
    profileName: '',
    generatedAt,
    scope: 'all',
    scopeLabel: 'All Career records',
    filterSummary: 'No active filters',
    skills,
    courses,
    credentials,
    legacyItems: legacy,
    summary: {
      skillCount: skills.length,
      courseCount: courses.length,
      completedCourseCount: courses.filter(item => item.status === 'Completed').length,
      credentialCount: credentials.length,
      expiringSoonCount,
      expiredCount,
      legacyItemCount: legacy.length,
    },
  };
}

export function buildCareerExportDocument({
  profileName,
  generatedAt = new Date(),
  scope,
  scopeLabel,
  filterSummary,
  records,
}: {
  profileName: string;
  generatedAt?: Date;
  scope: CareerExportScope;
  scopeLabel: string;
  filterSummary: string;
  records: ReturnType<typeof resolveCareerExportRecords>;
}): CareerExportDocument {
  const document = buildRows(records, generatedAt);
  return { ...document, profileName, scope, scopeLabel, filterSummary };
}

export function buildCareerSkillsCsv(document: CareerExportDocument) {
  const rows = [SKILL_HEADERS, ...document.skills.map(item => [item.name, item.area, item.level, item.relatedCourses, item.relatedCredentials, item.notes])];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function buildCareerCoursesCsv(document: CareerExportDocument) {
  const rows = [COURSE_HEADERS, ...document.courses.map(item => [item.title, item.provider, item.status, item.startDate, item.completionDate, item.relatedSkills, item.relatedCredentials, item.url, item.notes])];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function buildCareerCredentialsCsv(document: CareerExportDocument) {
  const rows = [CREDENTIAL_HEADERS, ...document.credentials.map(item => [item.title, item.issuer, item.relatedSkills, item.relatedCourses, item.issuedDate, item.expiryDate, item.expiryStatus, item.credentialId, item.url, item.proofAttached, item.notes])];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function summaryRows(document: CareerExportDocument): XlsxCell[][] {
  const { summary } = document;
  return [
    [cell('Caizen Career Report')],
    [cell('Profile'), cell(document.profileName)],
    [cell('Scope'), cell(document.scopeLabel)],
    [cell('Filters'), cell(document.filterSummary)],
    [cell('Generated'), cell(getLocalReportDateLabel(document.generatedAt))],
    [],
    xlsxHeader(['Summary', 'Value']),
    [cell('Skills'), cell(summary.skillCount)],
    [cell('Courses'), cell(summary.courseCount)],
    [cell('Completed courses'), cell(summary.completedCourseCount)],
    [cell('Credentials'), cell(summary.credentialCount)],
    [cell('Expiring soon'), cell(summary.expiringSoonCount)],
    [cell('Expired'), cell(summary.expiredCount)],
    [cell('Previous Career Vault items'), cell(summary.legacyItemCount)],
  ];
}

function skillRows(document: CareerExportDocument): XlsxCell[][] { return [xlsxHeader([...SKILL_HEADERS]), ...document.skills.map(item => [cell(item.name), cell(item.area), cell(item.level), cell(item.relatedCourses), cell(item.relatedCredentials), cell(item.notes)])]; }
function courseRows(document: CareerExportDocument): XlsxCell[][] { return [xlsxHeader([...COURSE_HEADERS]), ...document.courses.map(item => [cell(item.title), cell(item.provider), cell(item.status), cell(item.startDate), cell(item.completionDate), cell(item.relatedSkills), cell(item.relatedCredentials), cell(item.url), cell(item.notes)])]; }
function credentialRows(document: CareerExportDocument): XlsxCell[][] { return [xlsxHeader([...CREDENTIAL_HEADERS]), ...document.credentials.map(item => [cell(item.title), cell(item.issuer), cell(item.relatedSkills), cell(item.relatedCourses), cell(item.issuedDate), cell(item.expiryDate), cell(item.expiryStatus), cell(item.credentialId), cell(item.url), { value: item.proofAttached }, cell(item.notes)])]; }
function legacyRows(document: CareerExportDocument): XlsxCell[][] { return [xlsxHeader(['Title', 'Category', 'Issuer', 'Date', 'Expiry Date', 'Link']), ...document.legacyItems.map(item => [cell(item.title), cell(item.category), cell(item.issuer), cell(item.date), cell(item.expiryDate), cell(item.link)])]; }

export function buildCareerXlsx(document: CareerExportDocument) {
  return buildXlsxWorkbook([
    { name: 'Summary', rows: summaryRows(document), widths: [30, 36] },
    { name: 'Skills', rows: skillRows(document), widths: [28, 20, 16, 36, 36, 42], filter: true },
    { name: 'Courses', rows: courseRows(document), widths: [28, 24, 18, 16, 18, 36, 36, 42, 42], filter: true },
    { name: 'Credentials', rows: credentialRows(document), widths: [28, 24, 36, 36, 16, 16, 18, 22, 42, 16, 42], filter: true },
    { name: 'Legacy Career', rows: legacyRows(document), widths: [30, 24, 24, 16, 16, 42], filter: true },
  ]);
}

export function getCareerExportFileName(format: CareerExportFormat, generatedAt = new Date()) {
  const suffix = format === 'skills-csv' ? 'Career-Skills' : format === 'courses-csv' ? 'Career-Courses' : format === 'credentials-csv' ? 'Career-Credentials' : 'Career';
  const extension = format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'xlsx' : 'csv';
  return `${sanitizeExportFileName(`Caizen-${suffix}-${getLocalReportDateLabel(generatedAt)}`)}.${extension}`;
}
