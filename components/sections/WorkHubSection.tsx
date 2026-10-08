'use client';

import { createPortal } from 'react-dom';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  GripVertical,
  LayoutDashboard,
  Link2,
  ListChecks,
  MoreHorizontal,
  MoreVertical,
  NotebookText,
  Pin,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { AnimatedMetricValue } from '@/components/common/AnimatedMetricValue';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { FormField } from '@/components/common/FormPatterns';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
import { CaizenBottomSheet } from '@/components/native/android-design';
import { ResilientImage } from '@/components/media/ResilientImage';
import { CaizenTimePicker } from '@/components/ui/sleep-time-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterBar, FilterChip, SegmentedControl } from '@/components/ui/collection-controls';
import { StatusBadge } from '@/components/ui/badge';
import { SearchField } from '@/components/ui/search-field';
import { SectionTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaginationControls } from '@/components/ui/section-kit';
import { ViewModeToggle } from '@/components/ui/view-mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { useAppContext } from '@/lib/context';
import {
  claimRequestSignal,
  isProfileBoundRequestReady,
} from '@/lib/section-feature-request';
import {
  WorkHubMonthGrid,
  type WorkCalendarEntry,
} from '@/components/work/WorkHubMonthGrid';
import { WorkAttachmentsField } from '@/components/work/WorkAttachmentsField';
import { openTaxonomyHub } from '@/components/common/taxonomy-hub-events';
import WorkCustomFieldRenderer from '@/components/work/WorkCustomFieldRenderer';
import WorkLifeHubContext from '@/components/sections/WorkLifeHubContext';
import type {
  ImportantDateItem,
  ImportantDateType,
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  WorkSeverity,
  ModuleTaxonomyCategory,
  WorkCustomFieldValue,
  WorkTypeDefinition,
} from '@/lib/types';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import {
  processPendingMediaCleanup,
  queueMediaCleanup,
} from '@/lib/storage/media-cleanup';
import {
  normalizeWorkAttachmentIds,
  normalizeWorkItemForPersistence,
} from '@/lib/work-attachments';
import {
  parseLocalDateInput,
  parseLocalDateValue,
  startOfLocalDay,
  toLocalDateKey,
} from '@/lib/lifehub/date-utils';
import { isActionableWorkHubProjection } from '@/lib/workhub/derived';
import {
  deriveWorkLifeHubActivity,
  type WorkLifeHubActivity,
} from '@/lib/work/lifehub-activity';
import { getWorkItemIdFromLifeHubRecord } from '@/lib/lifehub/linked-context';
import { isManagedWorkMirror } from '@/lib/work/lifehub-mirror';
import { formatWorkCustomFieldValues, normalizeWorkCustomFieldValues, validateWorkCustomFieldValues } from '@/lib/workhub/custom-fields';
import { legacyNoteTypeForWorkType, legacyResourceTypeForWorkType, resolveWorkTypeId, resolveWorkTypes, workTypeDisplayName, workTypeForItem } from '@/lib/workhub/work-types';
import { validateWorkEditor } from '@/lib/workhub/editor-validation';
import { requestWorkSetupLeave } from '@/lib/workhub/setup-navigation';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type WorkEditorSaveOptions = { mirrorToLifeHub?: boolean };

type WorkTab =
  | 'overview'
  | 'tasks'
  | 'notes'
  | 'resources'
  | 'schedule';

type TaskFilter = 'today' | 'overdue' | 'all';

type NoteFilter = 'all' | 'pinned';
type ResourceFilter = 'all' | 'pinned';
type ResourceGroup = 'documents' | 'tickets' | 'design' | 'data';
type RecordSort = 'newest' | 'oldest';
type ScheduleMode = 'agenda' | 'month';

type EditorState =
  | { kind: 'project'; item?: WorkItem }
  | { kind: 'task'; item?: WorkItem; template?: Partial<WorkItem> }
  | { kind: 'note'; item?: WorkItem; template?: Partial<WorkItem> }
  | { kind: 'resource'; item?: WorkItem; template?: Partial<WorkItem> }
  | { kind: 'event'; item?: ImportantDateItem; date?: Date }
  | null;

type DeleteCandidate =
  | { kind: 'work'; item: WorkItem }
  | { kind: 'event'; item: ImportantDateItem }
  | null;

type CalendarEntry = WorkCalendarEntry;

const TABS: Array<{
  id: WorkTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'notes', label: 'Notes', icon: NotebookText },
  { id: 'resources', label: 'Resources', icon: Link2 },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
];

const TASK_STATUSES: Array<{ value: WorkItemStatus; label: string }> = [
  { value: 'planned', label: 'To do' },
  { value: 'active', label: 'In progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const TASK_FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'all', label: 'All' },
];

const NOTE_FILTERS: Array<{ value: NoteFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pinned', label: 'Pinned' },
];

const RESOURCE_TYPES: Array<{
  value: Exclude<WorkItemType, 'project' | 'task' | 'note'>;
  label: string;
  group: ResourceGroup;
}> = [
  { value: 'file', label: 'Document', group: 'documents' },
  { value: 'report', label: 'Report', group: 'documents' },
  { value: 'presentation', label: 'Presentation', group: 'design' },
  { value: 'note_file', label: 'Reference note', group: 'documents' },
  { value: 'ticket', label: 'Ticket', group: 'tickets' },
  { value: 'test_data', label: 'Test data', group: 'data' },
  { value: 'template', label: 'Template', group: 'documents' },
];

const RESOURCE_FILTERS: Array<{ value: ResourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pinned', label: 'Pinned' },
];

const WORK_LOCATIONS = [
  { value: 'office', label: 'Office' },
  { value: 'work_home', label: 'WFH' },
  { value: 'leave', label: 'Leave' },
  { value: 'travel', label: 'Travel' },
  { value: 'holiday', label: 'Holiday' },
] as const;

const WORK_EVENTS = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'work_event', label: 'Work event' },
] as const;

const SURFACE = 'section-surface';
const INPUT = 'w-full rounded-xl';
const NO_WORK_CATEGORY_VALUE = '__caizen_no_work_category__';
const WORK_CATEGORY_VALUE_PREFIX = '__caizen_work_category__:';

function workCategorySelectionValue(categoryId?: string) {
  return categoryId ? `${WORK_CATEGORY_VALUE_PREFIX}${categoryId}` : NO_WORK_CATEGORY_VALUE;
}

function workCategoryIdFromSelection(value: string) {
  return value === NO_WORK_CATEGORY_VALUE
    ? ''
    : value.startsWith(WORK_CATEGORY_VALUE_PREFIX)
      ? value.slice(WORK_CATEGORY_VALUE_PREFIX.length)
      : '';
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function label(value?: string) {
  if (!value) return '';
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function inputDate(value?: Date | string | null) {
  return value ? toLocalDateKey(value) : '';
}

function displayDate(value?: Date | string | null) {
  if (!value) return 'No date';
  const date = parseLocalDateValue(value);
  if (!date) return 'No date';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function dayStart(value: Date | string) {
  return startOfLocalDay(value);
}

function daysUntil(value?: Date | string | null) {
  if (!value) return null;
  return Math.ceil(
    (dayStart(value).getTime() - dayStart(new Date()).getTime()) / 86400000,
  );
}

function sameDay(a: Date | string, b: Date | string) {
  return dayStart(a).getTime() === dayStart(b).getTime();
}

function workProjectPreferenceKey(profileId: string) {
  return `caizen-work-selected-project:${profileId}`;
}

function thisWeek(value?: Date | string | null) {
  if (!value) return false;
  const today = dayStart(new Date());
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const date = dayStart(value);
  return date >= start && date < end;
}

function safeUrl(value?: string) {
  return normalizeExternalWebUrl(value) || '';
}

function openWorkLink(value?: string, title = 'saved link') {
  const destination = normalizeExternalWebUrl(value);
  if (!destination) {
    toast({ title: 'Invalid link', description: `Edit the ${title} and enter an HTTPS website, such as https://example.com.` });
    return;
  }
  void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: `Try opening the ${title} again, or edit the record to check the address.` }));
}

function domain(value?: string) {
  try {
    return new URL(safeUrl(value)).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

function copy(value: string) {
  if (typeof navigator !== 'undefined') {
    void navigator.clipboard?.writeText(value);
  }
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function noteExport(item: WorkItem, types: readonly WorkTypeDefinition[] = []) {
  const customFields = formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, types)?.fields);
  if (item.noteType === 'bug') {
    return [
      `Title: ${item.title}`,
      `Type: ${workTypeDisplayName(item, types)}`,
      ...(item.workCategoryLabel ? [`Category: ${item.workCategoryLabel}`] : []),
      `Module: ${item.module || ''}`,
      `Status: ${label(item.status)}`,
      `Severity: ${label(item.severity || 'medium')}`,
      `Priority: ${label(item.priority || 'medium')}`,
      '',
      'Description:',
      item.description || item.notes || '',
      '',
      'Steps to Reproduce:',
      item.stepsToReproduce || '1.\n2.\n3.',
      '',
      'Expected Result:',
      item.expectedResult || '',
      '',
      'Actual Result:',
      item.actualResult || '',
      '',
      `Environment: ${item.environment || ''}`,
      `Browser / Device: ${item.browserDevice || ''}`,
      `Evidence: ${item.screenshotLink || ''}`,
      `Ticket: ${item.ticketLink || ''}`,
      '',
      item.extraNotes || '',
      ...(customFields ? ['', 'Additional fields:', customFields] : []),
    ].join('\n');
  }

  return [
    `Title: ${item.title}`,
    `Type: ${workTypeDisplayName(item, types)}`,
    ...(item.workCategoryLabel ? [`Category: ${item.workCategoryLabel}`] : []),
    `Status: ${label(item.status)}`,
    `Date: ${displayDate(item.date)}`,
    '',
    item.content || item.notes || '',
    ...(customFields ? ['', 'Additional fields:', customFields] : []),
  ].join('\n');
}

function resourceMeta(item: WorkItem) {
  return (
    RESOURCE_TYPES.find(
      option => option.value === item.fileType || option.value === item.type,
    ) || RESOURCE_TYPES[0]
  );
}

function isResource(item: WorkItem) {
  return RESOURCE_TYPES.some(
    option => option.value === item.fileType || option.value === item.type,
  );
}

function isLocation(type: string) {
  return WORK_LOCATIONS.some(option => option.value === type);
}

function tone(type: string) {
  if (type === 'deadline') return 'bg-red-500';
  if (type === 'meeting') return 'bg-violet-500';
  if (type === 'office') return 'bg-blue-500';
  if (type === 'work_home') return 'bg-emerald-500';
  if (type === 'leave') return 'bg-rose-500';
  if (type === 'travel') return 'bg-amber-500';
  if (type === 'holiday') return 'bg-fuchsia-500';
  if (type === 'sprint') return 'bg-indigo-500';
  if (type === 'task_due') return 'bg-primary';
  if (type === 'resource_due') return 'bg-orange-500';
  return 'bg-slate-500';
}

export default function WorkHubSection({
  openNoteSignal = 0,
  androidPresentation = false,
  requestedProfileId,
  requestedRecordId,
  requestedRecordSignal = 0,
  onRequestedRecordConsumed,
}: {
  openNoteSignal?: number;
  androidPresentation?: boolean;
  requestedProfileId?: string;
  requestedRecordId?: string;
  requestedRecordSignal?: number;
  onRequestedRecordConsumed?: (signal: number) => void;
}) {
  const context = useAppContext();
  const profile = context.getCurrentProfile();
  const profileId = profile?.id || '';
  const workItems = useMemo(() => profile?.workItems || [], [profile?.workItems]);
  const workTypes = useMemo(() => resolveWorkTypes(profile?.workTypes), [profile?.workTypes]);
  const workCategories = useMemo(() => profile?.moduleTaxonomies?.work || [], [profile?.moduleTaxonomies?.work]);
  const importantDates = useMemo(() => context.importantDates || [], [context.importantDates]);

  const projects = useMemo(
    () =>
      workItems
        .filter(item => item.type === 'project')
        .sort((a, b) => {
          if (a.status === 'archived' && b.status !== 'archived') return 1;
          if (b.status === 'archived' && a.status !== 'archived') return -1;
          return (
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
          );
        }),
    [workItems],
  );
  const activeProjects = useMemo(
    () => projects.filter(project => project.status !== 'archived'),
    [projects],
  );

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [tab, setTab] = useState<WorkTab>('overview');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const [resourceFilter, setResourceFilter] =
    useState<ResourceFilter>('all');
  const [noteTypeFilter, setNoteTypeFilter] = useState('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [noteCategoryFilter, setNoteCategoryFilter] = useState('all');
  const [resourceCategoryFilter, setResourceCategoryFilter] = useState('all');
  const [noteSort, setNoteSort] = useState<RecordSort>('newest');
  const [resourceSort, setResourceSort] = useState<RecordSort>('newest');
  const [notesPage, setNotesPage] = useState(1);
  const [resourcesPage, setResourcesPage] = useState(1);
  const [notesLayout, setNotesLayout] = useState<'grid' | 'list'>('grid');
  const [resourcesLayout, setResourcesLayout] = useState<'grid' | 'list'>('list');
  const [scheduleMode, setScheduleMode] =
    useState<ScheduleMode>('agenda');
  const [query, setQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<DeleteCandidate>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [recordNotice, setRecordNotice] = useState('');
  const [month, setMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(new Date());

  const lastNoteSignal = useRef(openNoteSignal);
  const consumedRequestSignalRef = useRef<number | null>(null);
  const selectedProjectPreferenceKey = profileId
    ? workProjectPreferenceKey(profileId)
    : '';

  useEffect(() => {
    setSelectedProjectId('');
    setTab('overview');
    setTaskFilter('all');
    setNoteFilter('all');
    setResourceFilter('all');
    setNoteTypeFilter('all');
    setResourceTypeFilter('all');
    setNoteCategoryFilter('all');
    setResourceCategoryFilter('all');
    setNoteSort('newest');
    setResourceSort('newest');
    setNotesLayout('grid');
    setResourcesLayout('list');
    setScheduleMode('agenda');
    setQuery('');
    setProjectQuery('');
    setShowArchived(false);
    setEditor(null);
    setDeleting(null);
    setQuickOpen(false);
    setProjectMenuOpen(false);
    setRecordNotice('');
    setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setSelectedDate(new Date());
  }, [profileId]);

  useEffect(() => {
    if (!profileId || typeof window === 'undefined') return;
    const stored = localStorage.getItem(selectedProjectPreferenceKey);
    const legacyStored = localStorage.getItem('caizen-work-selected-project');
    const saved = projects.find(project => project.id === stored);
    const legacySaved = projects.find(
      project => project.id === legacyStored,
    );
    const fallback = activeProjects[0] || projects[0];

    if (!stored && legacySaved) {
      localStorage.setItem(selectedProjectPreferenceKey, legacySaved.id);
    }

    if (
      !selectedProjectId ||
      !projects.some(project => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(saved?.id || legacySaved?.id || fallback?.id || '');
      setQuery('');
    }
  }, [
    activeProjects,
    projects,
    profileId,
    selectedProjectId,
    selectedProjectPreferenceKey,
  ]);

  useEffect(() => {
    if (
      selectedProjectPreferenceKey &&
      selectedProjectId &&
      activeProjects.some(project => project.id === selectedProjectId) &&
      typeof window !== 'undefined'
    ) {
      localStorage.setItem(
        selectedProjectPreferenceKey,
        selectedProjectId,
      );
    }
  }, [activeProjects, selectedProjectId, selectedProjectPreferenceKey]);

  const selectProject = useCallback(
    (nextProjectId: string) => {
      if (!projects.some(project => project.id === nextProjectId)) {
        return;
      }
      setSelectedProjectId(nextProjectId);
      setQuery('');
      setEditor(null);
      setDeleting(null);
      setQuickOpen(false);
      setProjectMenuOpen(false);
      setRecordNotice('');
    },
    [projects],
  );

  useEffect(() => {
    if (
      !openNoteSignal ||
      openNoteSignal === lastNoteSignal.current
    ) {
      return;
    }
    lastNoteSignal.current = openNoteSignal;
    const openNote = () => {
      setTab('notes');
      setEditor({ kind: 'note' });
    };
    void requestWorkSetupLeave('profile-route').then(allow => {
      if (allow) openNote();
    });
  }, [openNoteSignal]);

  const applyRequestedRecord = useCallback(() => {
    const item = workItems.find(entry => entry.id === requestedRecordId);
    if (!item) {
      const event = importantDates.find(entry => entry.id === requestedRecordId);
      if (event && (event.projectId || isLocation(event.type))) {
        if (
          event.projectId &&
          projects.some(project => project.id === event.projectId)
        ) {
          setSelectedProjectId(event.projectId);
        }
        setTab('schedule');
        setScheduleMode('agenda');
        setSelectedDate(parseLocalDateValue(event.date) || new Date());
        setEditor({ kind: 'event', item: event });
      }
    } else if (item.type === 'project') {
      setSelectedProjectId(item.id);
      setTab('overview');
      setEditor({ kind: 'project', item });
    } else if (item.type === 'task') {
      setSelectedProjectId(item.projectId || '');
      setTab('tasks');
      setEditor({ kind: 'task', item });
    } else if (item.type === 'note') {
      setSelectedProjectId(item.projectId || '');
      setTab('notes');
      setEditor({ kind: 'note', item });
    } else if (isResource(item)) {
      setSelectedProjectId(item.projectId || '');
      setTab('resources');
      setEditor({ kind: 'resource', item });
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [importantDates, onRequestedRecordConsumed, projects, requestedRecordId, requestedRecordSignal, workItems]);

  useEffect(() => {
    if (!isProfileBoundRequestReady({
      isHydrated: context.isHydrated,
      requestedProfileId,
      currentProfileId: context.currentProfileId,
      signal: requestedRecordSignal,
    })) return;
    if (!claimRequestSignal(consumedRequestSignalRef, requestedRecordSignal)) return;
    void requestWorkSetupLeave('profile-route').then(allow => {
      if (allow) applyRequestedRecord();
      else onRequestedRecordConsumed?.(requestedRecordSignal);
    });
  }, [
    applyRequestedRecord,
    context.currentProfileId,
    context.isHydrated,
    importantDates,
    onRequestedRecordConsumed,
    requestedProfileId,
    requestedRecordId,
    requestedRecordSignal,
    workItems,
    activeProjects,
    projects,
  ]);

  const project = projects.find(item => item.id === selectedProjectId);
  const projectId = project?.id || '';
  const children = workItems.filter(item => item.projectId === projectId);
  const tasks = children.filter(item => item.type === 'task');
  const notes = children.filter(item => item.type === 'note');
  const resources = children.filter(isResource);

  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    const locations = importantDates
      .filter(item => isLocation(item.type))
      .map(item => ({
        id: `event-${item.id}`,
        title: item.title,
        type: item.type,
        date: parseLocalDateValue(item.date) || new Date(),
        endDate: item.endDate ? parseLocalDateValue(item.endDate) : null,
        notes: item.notes,
        source: 'event' as const,
        item,
      }));

    const events = importantDates
      .filter(
        item => !isLocation(item.type) && item.projectId === projectId,
      )
      .map(item => ({
        id: `event-${item.id}`,
        title: item.title,
        type: item.type,
        date: parseLocalDateValue(item.date) || new Date(),
        endDate: item.endDate ? parseLocalDateValue(item.endDate) : null,
        notes: item.notes,
        source: 'event' as const,
        item,
      }));

    const taskDates = tasks
      .filter(item => item.dueDate)
      .map(item => ({
        id: `task-${item.id}`,
        title: item.title,
        type: 'task_due',
        date: parseLocalDateValue(item.dueDate) || new Date(),
        notes: item.notes,
        source: 'task' as const,
        item,
      }));

    const resourceDates = resources
      .filter(item => item.dueDate)
      .map(item => ({
        id: `resource-${item.id}`,
        title: item.title,
        type: 'resource_due',
        date: parseLocalDateValue(item.dueDate) || new Date(),
        notes: item.notes,
        source: 'resource' as const,
        item,
      }));

    return [...locations, ...events, ...taskDates, ...resourceDates].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [importantDates, projectId, resources, tasks]);

  const saveItems = useCallback(
    (next: WorkItem[], mirrorIntent?: { workTaskId: string; enabled: boolean }) => {
      if (!profile) return;

      const normalizedNext = next.map(normalizeWorkItemForPersistence);

      const nextById = new Map(normalizedNext.map(item => [item.id, item]));
      const removedAttachmentIds = new Set<string>();
      for (const previous of workItems) {
        const current = nextById.get(previous.id);
        if (!current) continue;
        const before = collectMediaReferenceIds(previous);
        const after = collectMediaReferenceIds(current);
        for (const assetId of before) {
          if (!after.has(assetId)) removedAttachmentIds.add(assetId);
        }
      }
      if (removedAttachmentIds.size > 0) {
        queueMediaCleanup({
          profileId: profile.id,
          assetIds: [...removedAttachmentIds],
          reason: 'attachment-detached',
        });
      }
      context.updateWorkItemsForProfile(profile.id, normalizedNext, mirrorIntent);
    },
    [context, profile, workItems],
  );

  const upsert = useCallback(
    (item: WorkItem) => {
      const exists = workItems.some(current => current.id === item.id);
      saveItems(
        exists
          ? workItems.map(current =>
              current.id === item.id ? item : current,
            )
          : [item, ...workItems],
      );
    },
    [saveItems, workItems],
  );

  const completeWorkTask = useCallback(
    (item: WorkItem) => {
      if (item.status === 'done') {
        upsert({ ...item, status: 'active' });
        return;
      }
      if (profile?.id) context.completeWorkItemForProfile(profile.id, item.id);
    },
    [context, profile?.id, upsert],
  );

  const removeWorkItem = useCallback(
    (item: WorkItem) => {
      if (context.moveToTrash) {
        context.moveToTrash(
          'workItems',
          item,
          item.type === 'project' ? 'Work Project' : 'Work Hub',
        );
      } else {
        const childIds =
          item.type === 'project'
            ? workItems
                .filter(current => current.projectId === item.id)
                .map(current => current.id)
                : [];
        const removedItems = workItems.filter(
          current => current.id === item.id || childIds.includes(current.id),
        );
        const removedAssetIds = new Set<string>();
        for (const removed of removedItems) {
          for (const assetId of collectMediaReferenceIds(removed)) {
            removedAssetIds.add(assetId);
          }
        }
        if (removedAssetIds.size > 0 && profile?.id) {
          queueMediaCleanup({
            profileId: profile.id,
            assetIds: [...removedAssetIds],
            reason: 'record-deleted',
          });
        }
        saveItems(
          workItems.filter(
            current =>
              current.id !== item.id && !childIds.includes(current.id),
          ),
        );
      }

      if (item.type === 'project' && item.id === selectedProjectId) {
        setSelectedProjectId(
          activeProjects.find(candidate => candidate.id !== item.id)?.id || '',
        );
      }
    },
    [
      context,
      activeProjects,
      profile,
      saveItems,
      selectedProjectId,
      workItems,
    ],
  );

  const saveEditorItem = useCallback(
    (item: WorkItem, options: WorkEditorSaveOptions = {}) => {
      const exists = workItems.some(current => current.id === item.id);
      const next = exists
        ? workItems.map(current => current.id === item.id ? item : current)
        : [item, ...workItems];
      saveItems(
        next,
        item.type === 'task'
          ? { workTaskId: item.id, enabled: Boolean(options.mirrorToLifeHub) }
          : undefined,
      );
      if (item.type === 'project') setSelectedProjectId(item.id);
      setRecordNotice(`${label(item.type)} ${exists ? 'updated' : 'added'}.`);
      setEditor(null);
    },
    [saveItems, workItems],
  );

  const openWorkSetup = useCallback(() => {
    setEditor(null);
    setDeleting(null);
    setQuickOpen(false);
    setProjectMenuOpen(false);
    openTaxonomyHub({ area: 'work-hub', panel: 'work-types' });
  }, []);

  const saveEvent = useCallback(
    (item: ImportantDateItem) => {
      const payload = {
        title: item.title,
        type: item.type,
        date: item.date,
        endDate: item.endDate || null,
        repeat: item.repeat || 'none',
        amount: item.amount,
        trackAsOverdue: item.trackAsOverdue === true,
        projectId: item.projectId,
        notes: item.notes,
        link: item.link,
        priority: item.priority,
        reminder: item.reminder,
        customReminderDays: item.customReminderDays,
        reminderEnabled: item.reminderEnabled,
        reminderTime: item.reminderTime,
      };

      if (importantDates.some(current => current.id === item.id)) {
        context.updateImportantDate(item.id, payload);
      } else {
        context.addImportantDate(payload);
      }
      setRecordNotice(isLocation(item.type) ? 'Work location saved.' : 'Event saved.');
      setEditor(null);
    },
    [context, importantDates],
  );

  const setTodayLocation = useCallback(
    (type: (typeof WORK_LOCATIONS)[number]['value']) => {
      const dateKey = inputDate(new Date());
      const existing = importantDates.find(
        item =>
          isLocation(item.type) && inputDate(item.date) === dateKey,
      );
      const title =
        WORK_LOCATIONS.find(option => option.value === type)?.label ||
        label(type);
      const payload = {
        title,
        type: type as ImportantDateType,
        date: parseLocalDateInput(dateKey),
        endDate: null,
        repeat: 'none' as const,
        trackAsOverdue: false,
        notes: '',
        link: '',
      };

      if (existing) {
        context.updateImportantDate(existing.id, payload);
      } else {
        context.addImportantDate(payload);
      }
    },
    [context, importantDates],
  );

  const openTasks = tasks.filter(
    item => item.status !== 'done' && item.status !== 'archived',
  );
  const overdueTasks = openTasks.filter(item => {
    const days = daysUntil(item.dueDate);
    return days !== null && days < 0;
  });
  const todayTasks = openTasks.filter(
    item => daysUntil(item.dueDate) === 0,
  );
  const waitingTasks = openTasks.filter(
    item => item.status === 'waiting',
  );
  const doneThisWeek = tasks.filter(
    item =>
      item.status === 'done' &&
      thisWeek(item.dueDate || item.createdAt),
  );

  const filteredTasks = tasks
    .filter(item => item.status !== 'archived')
    .filter(item => {
      if (taskFilter === 'today') return daysUntil(item.dueDate) === 0;
      if (taskFilter === 'overdue') {
        const days = daysUntil(item.dueDate);
        return item.status !== 'done' && days !== null && days < 0;
      }
      return true;
    })
    .filter(item =>
      `${item.title} ${item.notes || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;
      const aDays = daysUntil(a.dueDate);
      const bDays = daysUntil(b.dueDate);
      if (aDays === null && bDays !== null) return 1;
      if (bDays === null && aDays !== null) return -1;
      if (aDays !== null && bDays !== null && aDays !== bDays) {
        return aDays - bDays;
      }
      const rank = { high: 0, medium: 1, low: 2 };
      return (
        rank[a.priority || 'medium'] - rank[b.priority || 'medium']
      );
    });

  const filteredNotes = notes
    .filter(item => noteFilter !== 'pinned' || item.pinned)
    .filter(item => noteTypeFilter === 'all' || resolveWorkTypeId(item) === noteTypeFilter)
    .filter(item => noteCategoryFilter === 'all' || item.workCategoryId === noteCategoryFilter)
    .filter(item => {
      const type = workTypeForItem(item, workTypes);
      return `${item.title} ${item.content || ''} ${item.notes || ''} ${item.module || ''} ${item.workCategoryLabel || ''} ${formatWorkCustomFieldValues(item.customFieldValues, type?.fields)}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (noteSort === 'newest' ? 1 : -1) * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    );

  const filteredResources = resources
    .filter(item => item.status !== 'archived')
    .filter(item => resourceFilter !== 'pinned' || item.pinned)
    .filter(item => resourceTypeFilter === 'all' || resolveWorkTypeId(item) === resourceTypeFilter)
    .filter(item => resourceCategoryFilter === 'all' || item.workCategoryId === resourceCategoryFilter)
    .filter(item => {
      const type = workTypeForItem(item, workTypes);
      return `${item.title} ${item.notes || ''} ${item.link || ''} ${item.workCategoryLabel || ''} ${formatWorkCustomFieldValues(item.customFieldValues, type?.fields)}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (resourceSort === 'newest' ? 1 : -1) * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    );

  const notesPageSize = 12;
  const resourcesPageSize = 20;
  const notesTotalPages = Math.max(1, Math.ceil(filteredNotes.length / notesPageSize));
  const resourcesTotalPages = Math.max(1, Math.ceil(filteredResources.length / resourcesPageSize));
  const paginatedNotes = filteredNotes.slice((notesPage - 1) * notesPageSize, notesPage * notesPageSize);
  const paginatedResources = filteredResources.slice((resourcesPage - 1) * resourcesPageSize, resourcesPage * resourcesPageSize);

  useEffect(() => {
    setNotesPage(1);
  }, [profileId, projectId, query, noteFilter, noteTypeFilter, noteCategoryFilter, noteSort]);
  useEffect(() => {
    if (notesPage > notesTotalPages) setNotesPage(notesTotalPages);
  }, [notesPage, notesTotalPages]);
  useEffect(() => {
    setResourcesPage(1);
  }, [profileId, projectId, query, resourceFilter, resourceTypeFilter, resourceCategoryFilter, resourceSort]);
  useEffect(() => {
    if (resourcesPage > resourcesTotalPages) setResourcesPage(resourcesTotalPages);
  }, [resourcesPage, resourcesTotalPages]);

  const attention = [...overdueTasks, ...todayTasks, ...waitingTasks]
    .filter(
      (item, index, all) =>
        all.findIndex(candidate => candidate.id === item.id) === index,
    )
    .slice(0, 6);

  const upcoming = calendarEntries.filter(entry => {
    const days = daysUntil(entry.date);
    return (
      isActionableWorkHubProjection(entry.source, entry.item.status) &&
      days !== null &&
      days >= 0 &&
      days <= 30
    );
  });

  const selectedDateEntries = calendarEntries.filter(entry => {
    const start = dayStart(entry.date);
    const end = entry.endDate ? dayStart(entry.endDate) : start;
    const selected = dayStart(selectedDate);
    return selected >= start && selected <= end;
  });

  const currentLocation = importantDates.find(
    item => isLocation(item.type) && sameDay(item.date, new Date()),
  );

  const openLifeHubRecord = useCallback((feature: 'routine' | 'tasks', recordId: string) => {
    window.dispatchEvent(
      new CustomEvent('life-manager:navigate', {
        detail: { section: 'lifehub', feature, recordId },
      }),
    );
  }, []);

  const projectLifeHubActivity = useMemo(
    () => project
      ? deriveWorkLifeHubActivity(
          project.id,
          context.dailyChecklistItems || [],
          context.productivityItems || [],
        )
      : undefined,
    [context.dailyChecklistItems, context.productivityItems, project],
  );
  const isUnusedProject = Boolean(project && project.status !== 'archived') &&
    children.length === 0 &&
    !importantDates.some(item => item.projectId === projectId && !isLocation(item.type)) &&
    !projectLifeHubActivity?.linkedRoutineCount &&
    !projectLifeHubActivity?.linkedTaskCount &&
    !project?.attachmentAssetIds?.length &&
    !project?.notes?.trim() &&
    !project?.link?.trim();
  const editorWorkItem = editor && (editor.kind === 'project' || editor.kind === 'task')
    ? editor.item
    : undefined;
  const editorLifeHubActivity = useMemo(
    () => editorWorkItem
      ? deriveWorkLifeHubActivity(
          editorWorkItem.id,
          context.dailyChecklistItems || [],
          context.productivityItems || [],
        )
      : undefined,
    [context.dailyChecklistItems, context.productivityItems, editorWorkItem],
  );
  const editorHasManagedLifeHubMirror = Boolean(
    editorWorkItem &&
    (context.productivityItems || []).some(item =>
      isManagedWorkMirror(item) && getWorkItemIdFromLifeHubRecord(item) === editorWorkItem.id,
    ),
  );

  const visibleProjects = projects.filter(item => {
    if (!showArchived && item.status === 'archived' && item.id !== selectedProjectId) return false;
    return `${item.title} ${item.notes || ''}`
      .toLowerCase()
      .includes(projectQuery.toLowerCase());
  });

  function openEntry(entry: CalendarEntry) {
    if (entry.source === 'event') {
      setEditor({
        kind: 'event',
        item: entry.item as ImportantDateItem,
      });
    } else if (entry.source === 'task') {
      setEditor({ kind: 'task', item: entry.item as WorkItem });
    } else {
      setEditor({
        kind: 'resource',
        item: entry.item as WorkItem,
      });
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    if (deleting.kind === 'event') {
      context.deleteImportantDate(deleting.item.id);
    } else {
      removeWorkItem(deleting.item);
    }
    setDeleting(null);
  }

  return (
    <section
      className={androidPresentation ? 'android-workhub space-y-4' : 'workspace-wide space-y-4 lg:space-y-5'}
      data-android-screen={androidPresentation ? 'workhub' : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page-title">Work Hub</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {getSectionDiscoveryMeta('workhub')?.purpose}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={openWorkSetup}
          disabled={!profileId}
          className="min-h-11 shrink-0 rounded-xl"
          data-caizen-work-setup-trigger
          aria-label="Open Work setup"
        >
          <Settings2 className="mr-2 size-4" aria-hidden="true" />
          Work setup
        </Button>
      </div>

      {recordNotice && (
        <p role="status" className="text-body-sm text-muted-foreground">{recordNotice}</p>
      )}

      <div className="xl:hidden">
        <MobileProjectSwitcher
          projects={projects}
          value={projectId}
          onChange={selectProject}
          onCreate={() => setEditor({ kind: 'project' })}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[248px_minmax(0,1fr)]">
        <ProjectSidebar
          androidPresentation={androidPresentation}
          projects={visibleProjects}
          selectedId={projectId}
          query={projectQuery}
          onQueryChange={setProjectQuery}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
          onSelect={selectProject}
          onCreate={() => setEditor({ kind: 'project' })}
          onEdit={item => setEditor({ kind: 'project', item })}
          onArchive={item =>
            upsert({
              ...item,
              status:
                item.status === 'archived' ? 'active' : 'archived',
            })
          }
          onDelete={item => setDeleting({ kind: 'work', item })}
        />

        <main className="@container/workspace min-w-0 space-y-4">
          {project ? (
            <>
              <ProjectHeader
                project={project}
                androidPresentation={androidPresentation}
                openCount={openTasks.length}
                overdueCount={overdueTasks.length}
                quickOpen={quickOpen}
                setQuickOpen={setQuickOpen}
                menuOpen={projectMenuOpen}
                setMenuOpen={setProjectMenuOpen}
                onCreateTask={() => setEditor({ kind: 'task' })}
                onCreateNote={() => setEditor({ kind: 'note' })}
                onCreateResource={() =>
                  setEditor({ kind: 'resource' })
                }
                onCreateEvent={() => setEditor({ kind: 'event' })}
                onEdit={() =>
                  setEditor({ kind: 'project', item: project })
                }
                onArchive={() =>
                  upsert({
                    ...project,
                    status:
                      project.status === 'archived'
                        ? 'active'
                        : 'archived',
                  })
                }
                onDelete={() =>
                  setDeleting({ kind: 'work', item: project })
                }
              />

              <SectionTabs
                mode="panels"
                value={tab}
                onValueChange={value => {
                  setTab(value as WorkTab);
                  setQuery('');
                }}
                className="min-w-0 gap-4"
              >
                <WorkTabs tabs={TABS} />
                <TabsContent value={tab} className="min-w-0 flex-1 outline-none">
              {tab === 'overview' && (
                <Overview
                  project={project}
                  metricReady={context.isHydrated}
                  workTypes={workTypes}
                  isUnusedProject={isUnusedProject}
                  attention={attention}
                  waitingCount={waitingTasks.length}
                  doneThisWeek={doneThisWeek.length}
                  upcoming={upcoming.slice(0, 5)}
                  recentNotes={[...notes]
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    )
                    .slice(0, 3)}
                  recentResources={[...resources]
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    )
                    .slice(0, 3)}
                  onComplete={completeWorkTask}
                  onOpenTask={item =>
                    setEditor({ kind: 'task', item })
                  }
                  onOpenEntry={openEntry}
                  onOpenNote={item =>
                    setEditor({ kind: 'note', item })
                  }
                  onOpenResource={item =>
                    setEditor({ kind: 'resource', item })
                  }
                  onCreateTask={() => setEditor({ kind: 'task' })}
                  onCreateNote={() => setEditor({ kind: 'note' })}
                  onCreateResource={() =>
                  setEditor({ kind: 'resource' })
                }
                  onCreateSchedule={() => setEditor({ kind: 'event' })}
                  lifeHubActivity={projectLifeHubActivity}
                  onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
                  onOpenLifeHubTask={taskId => openLifeHubRecord('tasks', taskId)}
                  onOpenLifeHub={() => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: 'lifehub' }))}
                />
              )}

              {tab === 'tasks' && (
                <Tasks
                  androidPresentation={androidPresentation}
                  query={query}
                  onQueryChange={setQuery}
                  items={filteredTasks}
                  filter={taskFilter}
                  onFilter={setTaskFilter}
                  onCreate={() => setEditor({ kind: 'task' })}
                  onComplete={completeWorkTask}
                  onStatus={(item, status) =>
                    upsert({ ...item, status })
                  }
                  onEdit={item =>
                    setEditor({ kind: 'task', item })
                  }
                  onDuplicate={item =>
                    upsert({
                      ...item,
                      id: id('work-task'),
                      title: `${item.title} copy`,
                      status: 'planned',
                      createdAt: new Date(),
                    })
                  }
                  onDelete={item => setDeleting({ kind: 'work', item })}
                />
              )}

              {tab === 'notes' && (
                <Notes
                  androidPresentation={androidPresentation}
                  layout={notesLayout}
                  onLayoutChange={setNotesLayout}
                  query={query}
                  onQueryChange={setQuery}
                  items={paginatedNotes}
                  totalItems={filteredNotes.length}
                  page={notesPage}
                  pageSize={notesPageSize}
                  onPageChange={setNotesPage}
                  filter={noteFilter}
                  onFilter={setNoteFilter}
                  types={workTypes.filter(type => type.kind === 'note')}
                  categories={workCategories}
                  typeFilter={noteTypeFilter}
                  onTypeFilter={setNoteTypeFilter}
                  categoryFilter={noteCategoryFilter}
                  onCategoryFilter={setNoteCategoryFilter}
                  sort={noteSort}
                  onSort={setNoteSort}
                  onCreate={() => setEditor({ kind: 'note' })}
                  onEdit={item =>
                    setEditor({ kind: 'note', item })
                  }
                  onPin={item =>
                    upsert({ ...item, pinned: !item.pinned })
                  }
                  onCopy={item => copy(noteExport(item, workTypes))}
                  onExport={item =>
                    download(
                      `${item.title || 'work-note'}.txt`,
                      noteExport(item, workTypes),
                    )
                  }
                  onDelete={item => setDeleting({ kind: 'work', item })}
                />
              )}

              {tab === 'resources' && (
                <Resources
                  androidPresentation={androidPresentation}
                  layout={resourcesLayout}
                  onLayoutChange={setResourcesLayout}
                  query={query}
                  onQueryChange={setQuery}
                  items={paginatedResources}
                  totalItems={filteredResources.length}
                  page={resourcesPage}
                  pageSize={resourcesPageSize}
                  onPageChange={setResourcesPage}
                  filter={resourceFilter}
                  onFilter={setResourceFilter}
                  types={workTypes.filter(type => type.kind === 'resource')}
                  categories={workCategories}
                  typeFilter={resourceTypeFilter}
                  onTypeFilter={setResourceTypeFilter}
                  categoryFilter={resourceCategoryFilter}
                  onCategoryFilter={setResourceCategoryFilter}
                  sort={resourceSort}
                  onSort={setResourceSort}
                  onCreate={() =>
                    setEditor({ kind: 'resource' })
                  }
                  onEdit={item =>
                    setEditor({ kind: 'resource', item })
                  }
                  onPin={item =>
                    upsert({ ...item, pinned: !item.pinned })
                  }
                  onDuplicate={item =>
                    upsert({
                      ...item,
                      id: id('work-resource'),
                      title: `${item.title} copy`,
                      createdAt: new Date(),
                    })
                  }
                  onDelete={item => setDeleting({ kind: 'work', item })}
                />
              )}

              {tab === 'schedule' && (
                <Schedule
                  key={`${profileId}:${projectId}`}
                  androidPresentation={androidPresentation}
                  mode={scheduleMode}
                  onMode={setScheduleMode}
                  month={month}
                  onMonth={setMonth}
                  selectedDate={selectedDate}
                  onSelectedDate={setSelectedDate}
                  entries={calendarEntries}
                  selectedEntries={selectedDateEntries}
                  currentLocation={currentLocation}
                  onLocation={setTodayLocation}
                  onCreate={() => setEditor({ kind: 'event' })}
                  onCreateForDate={date =>
                    setEditor({ kind: 'event', date })
                  }
                  onOpen={openEntry}
                  onDelete={item =>
                    setDeleting({ kind: 'event', item })
                  }
                />
              )}

                </TabsContent>
              </SectionTabs>
            </>
          ) : (
            <EmptyWorkspace
              onCreate={() => setEditor({ kind: 'project' })}
            />
          )}
        </main>
      </div>

      {editor && (
        <EditorDialog
          state={editor}
          projects={projects.filter(
            item => item.status !== 'archived' || item.id === projectId,
          )}
          projectId={projectId}
          profileId={profile?.id || ''}
          workTypes={workTypes}
          categories={workCategories}
          onSaveItem={saveEditorItem}
          onSaveEvent={saveEvent}
          lifeHubActivity={editorLifeHubActivity}
          managedLifeHubMirror={editorHasManagedLifeHubMirror}
          onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
          onOpenLifeHubTask={taskId => openLifeHubRecord('tasks', taskId)}
          onOpenLifeHub={() => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: 'lifehub' }))}
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title={
          deleting?.kind === 'event'
            ? 'Remove event?'
            : deleting?.item.type === 'project'
              ? 'Delete project?'
              : 'Delete item?'
        }
        message={
          deleting?.kind === 'event'
            ? `Remove “${deleting.item.title}” from your schedule? You can restore it from Trash.`
            : deleting?.item.type === 'project'
              ? `Delete “${deleting.item.title}” and everything inside it? The project will be moved to Trash.`
              : deleting
                ? `Delete “${deleting.item.title}”? It will be moved to Trash.`
                : 'Delete this item?'
        }
        confirmText={deleting?.kind === 'event' ? 'Remove event' : deleting?.item.type === 'project' ? 'Delete project' : 'Move to Trash'}
        cancelText="Cancel"
        isDangerous
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

function MobileProjectSwitcher({
  projects,
  value,
  onChange,
  onCreate,
}: {
  projects: WorkItem[];
  value: string;
  onChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className={`${SURFACE} flex items-center gap-2 p-2.5`}>
      <div className="min-w-0 flex-1">
        <Combobox
          value={value}
          onChange={onChange}
          ariaLabel="Select work project"
          placeholder="Choose a project"
          searchPlaceholder="Find active or archived projects…"
          options={projects.map(item => ({
            value: item.id,
            label: item.title,
            group: item.status === 'archived' ? 'Archived projects' : 'Active projects',
            description: item.status === 'archived' ? 'Archived · select to view or restore' : label(item.status),
          }))}
        />
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        aria-label="Create project"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProjectSidebar({
  androidPresentation,
  projects,
  selectedId,
  query,
  onQueryChange,
  showArchived,
  onShowArchivedChange,
  onSelect,
  onCreate,
  onEdit,
  onArchive,
  onDelete,
}: {
  androidPresentation: boolean;
  projects: WorkItem[];
  selectedId: string;
  query: string;
  onQueryChange: (value: string) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (item: WorkItem) => void;
  onArchive: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
}) {
  return (
    <aside
      className={`${SURFACE} sticky top-4 hidden max-h-[calc(100dvh-2rem)] h-fit overflow-y-auto p-3 xl:block`}
    >
      <div className="flex items-center justify-between px-1 py-1">
        <div>
          <h2 className="mt-0.5 text-base font-semibold">Projects</h2>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          aria-label="Create project"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <SearchField
        wrapperClassName="mt-3"
        value={query}
        onChange={onQueryChange}
        aria-label="Find project"
        placeholder="Find project"
        surface="solid"
      />

      <div className="mt-3 max-h-[calc(100dvh-16rem)] space-y-1 overflow-y-auto pr-1">
        {projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 px-3 py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? 'No projects match your search. Clear the search to see other projects.' : showArchived ? 'No projects yet. Create a project to get started.' : 'No active projects. Create one or show archived projects.'}
          </p>
        ) : (
          projects.map(item => (
            <div
              key={item.id}
              className={`flex items-center gap-1 rounded-xl border px-1.5 py-1.5 transition ${
                item.id === selectedId
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-transparent hover:border-border/60 hover:bg-muted/50'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left"
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    item.id === selectedId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <FolderOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <OverflowTooltip text={item.title}><strong className="block truncate text-sm">
                    {item.title}
                  </strong></OverflowTooltip>
                  <span className="block truncate text-caption text-muted-foreground">
                    {item.status === 'archived'
                      ? 'Archived'
                      : label(item.status)}
                  </span>
                </span>
              </button>
              <ItemMenu
                androidPresentation={androidPresentation}
                ariaLabel={`Actions for ${item.title}`}
                items={[
                  {
                    label: 'Edit project',
                    onClick: () => onEdit(item),
                  },
                  {
                    label:
                      item.status === 'archived'
                        ? 'Restore project'
                        : 'Archive project',
                    onClick: () => onArchive(item),
                  },
                  {
                    label: 'Delete project',
                    onClick: () => onDelete(item),
                    destructive: true,
                  },
                ]}
              />
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => onShowArchivedChange(!showArchived)}
        aria-pressed={showArchived}
        className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="inline-flex items-center gap-2">
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? 'Hide archived' : 'Show archived'}
        </span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </aside>
  );
}

function ProjectHeader({
  project,
  androidPresentation,
  openCount,
  overdueCount,
  quickOpen,
  setQuickOpen,
  menuOpen,
  setMenuOpen,
  onCreateTask,
  onCreateNote,
  onCreateResource,
  onCreateEvent,
  onEdit,
  onArchive,
  onDelete,
}: {
  project: WorkItem;
  androidPresentation: boolean;
  openCount: number;
  overdueCount: number;
  quickOpen: boolean;
  setQuickOpen: (value: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (value: boolean) => void;
  onCreateTask: () => void;
  onCreateNote: () => void;
  onCreateResource: () => void;
  onCreateEvent: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const androidNewActions: WorkHubMenuItem[] = [
    { icon: <ListChecks className="h-5 w-5" />, label: 'Task', onClick: onCreateTask },
    { icon: <NotebookText className="h-5 w-5" />, label: 'Note', onClick: onCreateNote },
    { icon: <Link2 className="h-5 w-5" />, label: 'Resource', onClick: onCreateResource },
    { icon: <CalendarDays className="h-5 w-5" />, label: 'Event', onClick: onCreateEvent },
  ];
  const androidProjectActions: WorkHubMenuItem[] = [
    { icon: <Settings2 className="h-5 w-5" />, label: 'Edit project', onClick: onEdit },
    { icon: <Archive className="h-5 w-5" />, label: project.status === 'archived' ? 'Restore project' : 'Archive project', onClick: onArchive },
    { icon: <Trash2 className="h-5 w-5" />, label: 'Delete project', onClick: onDelete, destructive: true },
  ];

  if (androidPresentation) {
    return (
      <header className={`${SURFACE} p-3`} data-android-workhub-project-header="true">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={project.status === 'archived' ? 'muted' : 'success'}>{label(project.status)}</StatusBadge>
            </div>
            <OverflowTooltip text={project.title}><h2 className="mt-1 text-section-title [overflow-wrap:anywhere]">{project.title}</h2></OverflowTooltip>
          </div>
          <button type="button" className="android-touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Project options" onClick={() => setMenuOpen(true)}>
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
        {project.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.notes}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-muted-foreground">
          <span>{openCount} open</span>
          <span className={overdueCount > 0 ? 'text-destructive' : ''}>{overdueCount} overdue</span>
          {project.link ? <button type="button" onClick={() => openWorkLink(project.link, 'project link')} className="inline-flex min-h-11 items-center gap-1.5 text-primary hover:underline" aria-label={`Open project link for ${project.title}`}>Open project link <ExternalLink className="h-3.5 w-3.5" /></button> : null}
        </div>
        <div className="mt-3 flex justify-end"><Button type="button" onClick={() => setQuickOpen(true)} className="min-h-11 rounded-xl"><Plus className="mr-2 h-4 w-4" /> New</Button></div>
        <WorkHubActionSheet open={quickOpen} title={`New in ${project.title}`} onClose={() => setQuickOpen(false)} items={androidNewActions} />
        <WorkHubActionSheet open={menuOpen} title={project.title} onClose={() => setMenuOpen(false)} items={androidProjectActions} />
      </header>
    );
  }

  return (
    <header className={`${SURFACE} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status === 'archived' ? 'muted' : 'success'}>{label(project.status)}</StatusBadge>
          </div>
          <OverflowTooltip text={project.title}><h2 className="mt-1 text-section-title [overflow-wrap:anywhere]">
            {project.title}
          </h2></OverflowTooltip>
          {project.notes ? <p className="mt-1 max-w-2xl line-clamp-2 text-sm text-muted-foreground">{project.notes}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-muted-foreground">
            <span>{openCount} open</span>
            <span className={overdueCount > 0 ? 'text-destructive' : ''}>
              {overdueCount} overdue
            </span>
            {project.link && (
              <button type="button" onClick={() => openWorkLink(project.link, 'project link')} className="inline-flex min-h-11 items-center gap-1.5 text-primary hover:underline" aria-label={`Open project link for ${project.title}`}>
                Open project link
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <FloatingMenu open={quickOpen} onOpenChange={setQuickOpen} align="start"
            trigger={(
              <Button
                type="button"
                className="rounded-xl"
              >
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
            )}
          >
            <MenuAction
              icon={<ListChecks className="h-4 w-4" />}
              label="Task"
              onClick={onCreateTask}
            />
            <MenuAction
              icon={<NotebookText className="h-4 w-4" />}
              label="Note"
              onClick={onCreateNote}
            />
            <MenuAction
              icon={<Link2 className="h-4 w-4" />}
              label="Resource"
              onClick={onCreateResource}
            />
            <MenuAction
              icon={<CalendarDays className="h-4 w-4" />}
              label="Event"
              onClick={onCreateEvent}
            />
          </FloatingMenu>

          <FloatingMenu open={menuOpen} onOpenChange={setMenuOpen} align="end"
            trigger={(
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Project options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            )}
          >
            <MenuAction
              icon={<Settings2 className="h-4 w-4" />}
              label="Edit project"
              onClick={onEdit}
            />
            <MenuAction
              icon={<Archive className="h-4 w-4" />}
              label={
                project.status === 'archived'
                  ? 'Restore project'
                  : 'Archive project'
              }
              onClick={onArchive}
            />
            <MenuAction
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete project"
              destructive
              onClick={onDelete}
            />
          </FloatingMenu>
        </div>
      </div>
    </header>
  );
}

function WorkTabs({ tabs }: { tabs: typeof TABS }) {
  return (
    <TabsList aria-label="Work sections" className={`${SURFACE} flex w-full max-w-full gap-1 overflow-x-auto p-1.5 scrollbar-hide`}>
      {tabs.map(item => {
        const Icon = item.icon;
        return (
          <TabsTrigger
            key={item.id}
            value={item.id}
            className="caizen-tab inline-flex min-h-11 flex-none items-center gap-2 rounded-xl px-3.5 transition-colors"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

function Overview({
  project,
  metricReady,
  workTypes,
  isUnusedProject,
  attention,
  waitingCount,
  doneThisWeek,
  upcoming,
  recentNotes,
  recentResources,
  onComplete,
  onOpenTask,
  onOpenEntry,
  onOpenNote,
  onOpenResource,
  onCreateTask,
  onCreateNote,
  onCreateResource,
  onCreateSchedule,
  lifeHubActivity,
  onOpenRoutine,
  onOpenLifeHubTask,
  onOpenLifeHub,
}: {
  project: WorkItem;
  metricReady: boolean;
  workTypes: WorkTypeDefinition[];
  isUnusedProject: boolean;
  attention: WorkItem[];
  waitingCount: number;
  doneThisWeek: number;
  upcoming: CalendarEntry[];
  recentNotes: WorkItem[];
  recentResources: WorkItem[];
  onComplete: (item: WorkItem) => void;
  onOpenTask: (item: WorkItem) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onOpenNote: (item: WorkItem) => void;
  onOpenResource: (item: WorkItem) => void;
  onCreateTask: () => void;
  onCreateNote: () => void;
  onCreateResource: () => void;
  onCreateSchedule: () => void;
  lifeHubActivity?: WorkLifeHubActivity;
  onOpenRoutine: (routineId: string) => void;
  onOpenLifeHubTask: (taskId: string) => void;
  onOpenLifeHub: () => void;
}) {
  if (isUnusedProject) {
    return (
      <section className={`${SURFACE} p-4 sm:p-6`}>
        <h2 className="text-lg font-semibold">Start this project</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add a task to plan work, a note to capture details, a resource for reference, or an event for your schedule.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={onCreateTask} className="rounded-xl"><Plus className="mr-1.5 h-4 w-4" />Task</Button>
          <Button type="button" variant="outline" onClick={onCreateNote} className="rounded-xl"><Plus className="mr-1.5 h-4 w-4" />Note</Button>
          <Button type="button" variant="outline" onClick={onCreateResource} className="rounded-xl"><Plus className="mr-1.5 h-4 w-4" />Resource</Button>
          <Button type="button" variant="outline" onClick={onCreateSchedule} className="rounded-xl"><Plus className="mr-1.5 h-4 w-4" />Schedule</Button>
        </div>
      </section>
    );
  }
  return (
    <div className="grid min-w-0 gap-4 @min-[48rem]/workspace:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
      <section className={`${SURFACE} min-w-0 p-4 sm:p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="mt-1 text-lg font-semibold">
              Needs attention
            </h2>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCreateTask}
            className="rounded-xl"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Task
          </Button>
        </div>

        <div className="mt-4 divide-y divide-border/55">
          {attention.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              <p className="mt-3 text-sm font-semibold">
                Nothing urgent
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {project.title} has no overdue, due-today, or waiting
                tasks.
              </p>
            </div>
          ) : (
            attention.map(item => {
              const days = daysUntil(item.dueDate);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-3"
                >
                  <button
                    type="button"
                    onClick={() => onComplete(item)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                    aria-label={`Complete ${item.title}`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenTask(item)}
                    className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <OverflowTooltip text={item.title}><strong className="block truncate text-sm">
                      {item.title}
                    </strong></OverflowTooltip>
                    <span
                      className={`mt-0.5 block text-xs ${
                        days !== null && days < 0
                          ? 'font-bold text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {days === null
                        ? label(item.status)
                        : days < 0
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? 'Due today'
                            : `Due in ${days}d`}
                      {item.priority
                        ? ` · ${label(item.priority)} priority`
                        : ''}
                    </span>
                  </button>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="space-y-4">
        <section className={`${SURFACE} p-4 sm:p-5`}>
          <h2 className="text-sm font-semibold">
            Progress
          </h2>
          <div className="mt-3 grid gap-3">
            <Metric label="Waiting" value={waitingCount} ready={metricReady} metricKey={`${project.id}:waiting`} />
            <Metric label="Done with dates this week" value={doneThisWeek} ready={metricReady} metricKey={`${project.id}:done-this-week`} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">The Done count uses due dates, or dates added for tasks without a due date.</p>
        </section>

        {lifeHubActivity ? (
          <WorkLifeHubContext
            activity={lifeHubActivity}
            onOpenRoutine={onOpenRoutine}
            onOpenTask={onOpenLifeHubTask}
            onOpenLifeHub={onOpenLifeHub}
          />
        ) : null}

        <section className={`${SURFACE} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Upcoming</h2>
            <span className="text-xs font-bold text-muted-foreground">
              Next 30 days
            </span>
          </div>
          <div className="mt-3 space-y-1">
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                No upcoming dates.
              </p>
            ) : (
              upcoming.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpenEntry(entry)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone(entry.type)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <OverflowTooltip text={entry.title}><strong className="block truncate text-sm">
                      {entry.title}
                    </strong></OverflowTooltip>
                    <span className="block truncate text-xs text-muted-foreground">
                      {displayDate(entry.date)} · {label(entry.type)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <section className={`${SURFACE} min-w-0 p-4 sm:p-5 @min-[48rem]/workspace:col-span-2`}>
        <div className="grid min-w-0 gap-6 @min-[36rem]/workspace:grid-cols-2">
          <Recent
            title="Recent notes"
            empty="No notes yet."
            items={recentNotes}
            icon={<NotebookText className="h-4 w-4" />}
            meta={item =>
              `${workTypeDisplayName(item, workTypes)} · ${displayDate(item.date || item.createdAt)}${item.workCategoryLabel ? ` · ${item.workCategoryLabel}` : ''}${formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, workTypes)?.fields) ? ` · ${formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, workTypes)?.fields)}` : ''}`
            }
            onOpen={onOpenNote}
          />
          <Recent
            title="Recent resources"
            empty="No resources yet."
            items={recentResources}
            icon={<Link2 className="h-4 w-4" />}
            meta={item =>
              `${workTypeDisplayName(item, workTypes)} · ${domain(item.link)}${item.workCategoryLabel ? ` · ${item.workCategoryLabel}` : ''}${formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, workTypes)?.fields) ? ` · ${formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, workTypes)?.fields)}` : ''}`
            }
            onOpen={onOpenResource}
          />
        </div>
      </section>
    </div>
  );
}

function Metric({
  label: metricLabel,
  value,
  ready = false,
  metricKey,
}: {
  label: string;
  value: number;
  ready?: boolean;
  metricKey?: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <p className="text-xs font-semibold text-muted-foreground">
        {metricLabel}
      </p>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        <AnimatedMetricValue valueKey={`${metricKey || metricLabel}:${value}`} ready={ready}>{value}</AnimatedMetricValue>
      </p>
    </div>
  );
}

function Recent({
  title,
  empty,
  items,
  icon,
  meta,
  onOpen,
}: {
  title: string;
  empty: string;
  items: WorkItem[];
  icon: ReactNode;
  meta: (item: WorkItem) => string;
  onOpen: (item: WorkItem) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="mt-3 space-y-1">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <OverflowTooltip text={item.title}><strong className="block truncate text-sm">
                  {item.title}
                </strong></OverflowTooltip>
                <span className="block truncate text-xs text-muted-foreground">
                  {meta(item)}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Tasks({
  androidPresentation,
  query,
  onQueryChange,
  items,
  filter,
  onFilter,
  onCreate,
  onComplete,
  onStatus,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  androidPresentation: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  items: WorkItem[];
  filter: TaskFilter;
  onFilter: (value: TaskFilter) => void;
  onCreate: () => void;
  onComplete: (item: WorkItem) => void;
  onStatus: (item: WorkItem, status: WorkItemStatus) => void;
  onEdit: (item: WorkItem) => void;
  onDuplicate: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const item = items.find(candidate => candidate.id === String(event.active.id));
    const droppedStatus = event.over.data.current?.status;
    const status = TASK_STATUSES.find(option => option.value === droppedStatus)?.value;
    if (!item || !status || item.status === status) return;
    onStatus(item, status);
  };

  return (
    <section className={`${SURFACE} overflow-visible`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border/55 p-4">
        <SearchField
          value={query}
          onChange={onQueryChange}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          surface="solid"
          wrapperClassName="w-full min-w-0 @min-[48rem]/workspace:w-auto @min-[48rem]/workspace:flex-1"
        />
        <FilterBar label="Task filters" className="min-w-0 flex-1 @min-[48rem]/workspace:flex-none">
          {TASK_FILTERS.map(option => (
            <FilterChip
              key={option.value}
              selected={filter === option.value}
              onSelectedChange={selected => { if (selected) onFilter(option.value); }}
              className="min-h-11 rounded-lg text-xs font-semibold"
            >
              {option.label}
            </FilterChip>
          ))}
        </FilterBar>
        <Button
          type="button"
          onClick={onCreate}
          className="shrink-0 rounded-xl"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add task
        </Button>
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">Scroll sideways to see all task statuses. Drag from a task’s handle to change its status, or use its Actions menu.</p>
      {items.length === 0 ? (
        <Empty icon={<ListChecks className="h-6 w-6" />} title={query.trim() || filter !== 'all' ? 'No matching tasks' : 'No tasks yet'} description={query.trim() || filter !== 'all' ? 'Clear the search and time filter to see all tasks.' : 'Create the first task for this project.'} action={query.trim() || filter !== 'all' ? 'Clear task filters' : 'Add task'} onAction={query.trim() || filter !== 'all' ? () => { onQueryChange(''); onFilter('all'); } : onCreate} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div role="region" aria-label="Task status lanes" tabIndex={0} className="grid min-w-0 w-full grid-flow-col items-start auto-cols-[min(18rem,calc(100cqw-2rem))] snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @min-[48rem]/workspace:auto-cols-[minmax(18rem,1fr)]">
            {TASK_STATUSES.map(column => (
              <TaskBoardColumn
                key={column.value}
                status={column.value}
                title={column.label}
                items={items.filter(item => item.status === column.value)}
                androidPresentation={androidPresentation}
                onComplete={onComplete}
                onStatus={onStatus}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))}
          </div>
        </DndContext>
      )}
    </section>
  );
}

function TaskBoardColumn({
  status,
  title,
  items,
  androidPresentation,
  onComplete,
  onStatus,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  status: WorkItemStatus;
  title: string;
  items: WorkItem[];
  androidPresentation: boolean;
  onComplete: (item: WorkItem) => void;
  onStatus: (item: WorkItem, status: WorkItemStatus) => void;
  onEdit: (item: WorkItem) => void;
  onDuplicate: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } });
  return (
    <section ref={setNodeRef} aria-label={`${title} tasks`} className={`min-h-32 snap-start rounded-xl border p-2.5 transition-colors ${isOver ? 'border-primary/65 bg-primary/5 ring-1 ring-primary/15' : 'border-border/40 bg-muted/10'}`}>
      <header className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="min-w-7 rounded-full bg-muted/75 px-2 py-0.5 text-center text-xs font-bold text-muted-foreground">{items.length}</span>
      </header>
      <div className="space-y-2">
        {items.length ? items.map(item => (
          <DraggableTaskCard
            key={item.id}
            item={item}
            androidPresentation={androidPresentation}
            onComplete={onComplete}
            onStatus={onStatus}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )) : <p className="grid min-h-11 place-items-center rounded-lg border border-dashed border-border/45 px-3 py-2 text-center text-xs text-muted-foreground">Drop a task here</p>}
      </div>
    </section>
  );
}

function DraggableTaskCard({
  item,
  androidPresentation,
  onComplete,
  onStatus,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: WorkItem;
  androidPresentation: boolean;
  onComplete: (item: WorkItem) => void;
  onStatus: (item: WorkItem, status: WorkItemStatus) => void;
  onEdit: (item: WorkItem) => void;
  onDuplicate: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { status: item.status },
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: `task:${item.id}`, data: { status: item.status } });
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  const days = daysUntil(item.dueDate);
  const done = item.status === 'done';
  const overdue = !done && days !== null && days < 0;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`relative min-w-0 rounded-xl border border-border/50 bg-card p-3 ${isDragging ? 'z-10 opacity-60' : ''}`}>
      <div className="flex items-start gap-1.5">
        <Tooltip><TooltipTrigger asChild><button type="button" {...attributes} {...listeners} aria-label={`Drag ${item.title} from this handle to change status`} className="-ml-1 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button></TooltipTrigger><TooltipContent>{"Drag from this handle to change task status"}</TooltipContent></Tooltip>
        <button type="button" onClick={() => onEdit(item)} className="min-w-0 flex-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <OverflowTooltip text={item.title} mode="clamped"><strong className={`block line-clamp-3 text-sm font-semibold leading-5 [overflow-wrap:anywhere] ${done ? 'text-muted-foreground line-through' : ''}`}>{item.title}</strong></OverflowTooltip>
          {item.notes || item.description || item.content ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.notes || item.description || item.content}</span> : null}
        </button>
        <ItemMenu
          androidPresentation={androidPresentation}
          ariaLabel={`Actions for ${item.title}`}
          items={[
            ...TASK_STATUSES.filter(option => option.value !== item.status).map(option => ({
              label: `Move to: ${option.label}`,
              onClick: () => onStatus(item, option.value),
            })),
            { label: 'Edit task', onClick: () => onEdit(item), separatorBefore: true },
            { label: 'Duplicate', onClick: () => onDuplicate(item) },
            { label: 'Delete task', onClick: () => onDelete(item), destructive: true },
          ]}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/40 pt-2">
        <StatusBadge status={item.priority === 'high' ? 'danger' : item.priority === 'low' ? 'neutral' : 'warning'}>{label(item.priority || 'medium')}</StatusBadge>
        <span className={`text-xs font-bold ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>{done ? `Completed${item.dueDate ? ` · Due ${displayDate(item.dueDate)}` : ''}` : days === null ? 'No due date' : days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'Today' : `${days}d left`}</span>
        {item.link ? <a href={normalizeExternalWebUrl(item.link) || undefined} target="_blank" rel="noreferrer" onClick={event => { event.preventDefault(); openWorkLink(item.link, 'task link'); }} className="max-w-full truncate text-xs font-bold text-primary underline underline-offset-2" aria-label={`Open link for ${item.title}`}>{domain(item.link)}</a> : null}
        <Tooltip><TooltipTrigger asChild><button type="button" onClick={() => onComplete(item)} className={`ml-auto grid shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${androidPresentation ? 'android-touch-target' : ''} size-11 ${done ? 'text-emerald-600 dark:text-emerald-400' : ''}`} aria-label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}><Check className="size-4" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>{done ? 'Reopen task' : 'Complete task'}</TooltipContent></Tooltip>
      </div>
    </div>
  );
}

function RecordFilterControls({
  labelText,
  types,
  categories,
  typeFilter,
  onTypeFilter,
  categoryFilter,
  onCategoryFilter,
  sort,
  onSort,
}: {
  labelText: string;
  types: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  typeFilter: string;
  onTypeFilter: (value: string) => void;
  categoryFilter: string;
  onCategoryFilter: (value: string) => void;
  sort: RecordSort;
  onSort: (value: RecordSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ type: 'all', category: 'all', sort: 'newest' as RecordSort });
  const activeCount = Number(typeFilter !== 'all') + Number(categoryFilter !== 'all') + Number(sort !== 'newest');
  const visibleCategories = categories.filter(category => !category.archived || category.id === categoryFilter);

  useEffect(() => {
    if (!open) return;
    setDraft({ type: typeFilter, category: categoryFilter, sort });
  }, [categoryFilter, open, sort, typeFilter]);

  const fields = (values: typeof draft, update: (next: typeof draft) => void, showLabels = false) => (
    <>
      <div className="grid min-w-0 gap-1.5 text-xs font-bold text-muted-foreground xl:basis-28 xl:grow">
        {showLabels ? <span>Type</span> : null}
        <AndroidAdaptiveSelect
          label={`${labelText} type`}
          value={values.type}
          onChange={type => update({ ...values, type })}
          options={[{ value: 'all', label: 'All types' }, ...types.map(type => ({ value: type.id, label: `${type.name}${type.archived ? ' · Archived' : ''}` }))]}
          searchable={types.length > 8}
          className="min-h-11 w-full rounded-xl"
        />
      </div>
      <div className="grid min-w-0 gap-1.5 text-xs font-bold text-muted-foreground xl:basis-28 xl:grow">
        {showLabels ? <span>Category</span> : null}
        <AndroidAdaptiveSelect
          label={`${labelText} category`}
          value={values.category}
          onChange={category => update({ ...values, category })}
          options={[{ value: 'all', label: 'All categories' }, ...visibleCategories.map(category => ({ value: category.id, label: `${category.name}${category.archived ? ' · Archived' : ''}` }))]}
          searchable={visibleCategories.length > 8}
          className="min-h-11 w-full rounded-xl"
        />
      </div>
      <div className="grid min-w-0 gap-1.5 text-xs font-bold text-muted-foreground xl:basis-28 xl:grow">
        {showLabels ? <span>Sort</span> : null}
        <AndroidAdaptiveSelect
          label={`${labelText} sort order`}
          value={values.sort}
          onChange={nextSort => update({ ...values, sort: nextSort as RecordSort })}
          options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]}
          className="min-h-11 w-full rounded-xl"
        />
      </div>
    </>
  );

  return (
    <>
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="min-h-11 rounded-xl" aria-label={`${labelText} filters${activeCount ? `, ${activeCount} selected` : ''}`}>
          Filter{activeCount ? ` (${activeCount})` : ''}
        </Button>
        <CaizenBottomSheet open={open} title={`Filter ${labelText.toLowerCase()}`} description="Choose a type, category, and sort order." onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {fields(draft, setDraft, true)}
            <div className="flex justify-between gap-2 border-t border-border/55 pt-3">
              <Button type="button" variant="outline" onClick={() => setDraft({ type: 'all', category: 'all', sort: 'newest' })} disabled={draft.type === 'all' && draft.category === 'all' && draft.sort === 'newest'} className="min-h-11 rounded-xl">Clear</Button>
              <Button type="button" onClick={() => { onTypeFilter(draft.type); onCategoryFilter(draft.category); onSort(draft.sort); setOpen(false); }} className="min-h-11 rounded-xl">Apply</Button>
            </div>
          </div>
        </CaizenBottomSheet>
      </div>
    </>
  );
}

function RecordCollectionToolbar({
  labelText,
  layout,
  onLayoutChange,
  query,
  onQueryChange,
  filter,
  onFilter,
  types,
  categories,
  typeFilter,
  onTypeFilter,
  categoryFilter,
  onCategoryFilter,
  sort,
  onSort,
  onCreate,
  className = '',
}: {
  labelText: 'Notes' | 'Resources';
  layout: 'grid' | 'list';
  onLayoutChange: (value: 'grid' | 'list') => void;
  query: string;
  onQueryChange: (value: string) => void;
  filter: 'all' | 'pinned';
  onFilter: (value: 'all' | 'pinned') => void;
  types: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  typeFilter: string;
  onTypeFilter: (value: string) => void;
  categoryFilter: string;
  onCategoryFilter: (value: string) => void;
  sort: RecordSort;
  onSort: (value: RecordSort) => void;
  onCreate: () => void;
  className?: string;
}) {
  const hasFilters = Boolean(query.trim() || filter !== 'all' || typeFilter !== 'all' || categoryFilter !== 'all' || sort !== 'newest');
  const clearAll = () => { onQueryChange(''); onFilter('all'); onTypeFilter('all'); onCategoryFilter('all'); onSort('newest'); };
  return (
    <div className={`grid min-w-0 gap-3 p-4 ${className}`}>
      <SearchField
        value={query}
        onChange={onQueryChange}
        placeholder={`Search ${labelText.toLowerCase()}…`}
        aria-label={`Search ${labelText.toLowerCase()}`}
        surface="solid"
        wrapperClassName="w-full min-w-0"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedControl
          label={`${labelText} view`}
          value={filter}
          options={labelText === 'Notes' ? NOTE_FILTERS : RESOURCE_FILTERS}
          onValueChange={value => onFilter(value as 'all' | 'pinned')}
          size="compact"
          className="shrink-0 !p-0 [&_[data-slot='segmented-control-item']]:min-h-11"
        />
        <ViewModeToggle value={layout} onChange={onLayoutChange} label={`${labelText} layout`} className="shrink-0" />
        <RecordFilterControls
          labelText={labelText}
          types={types}
          categories={categories}
          typeFilter={typeFilter}
          onTypeFilter={onTypeFilter}
          categoryFilter={categoryFilter}
          onCategoryFilter={onCategoryFilter}
          sort={sort}
          onSort={onSort}
        />
        {hasFilters ? <Button type="button" variant="ghost" onClick={clearAll} className="min-h-11 shrink-0">Clear all filters</Button> : null}
        <Button
          type="button"
          onClick={onCreate}
          className="ml-auto min-h-11 shrink-0 whitespace-nowrap rounded-xl"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add {labelText === 'Notes' ? 'note' : 'resource'}
        </Button>
      </div>
    </div>
  );
}

function CustomUrlActions({ item, types, className = '' }: { item: WorkItem; types: readonly WorkTypeDefinition[]; className?: string }) {
  const type = workTypeForItem(item, types);
  if (!type) return null;
  const values = normalizeWorkCustomFieldValues(item.customFieldValues) || {};
  const urls = type.fields.filter(field => field.type === 'url').flatMap(field => {
    const value = values[field.id];
    return typeof value === 'string' && normalizeExternalWebUrl(value) ? [{ field, value }] : [];
  });
  if (!urls.length) return null;
  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${className}`}>
      {urls.map(({ field, value }) => <button key={field.id} type="button" onClick={() => openWorkLink(value, `${field.label} link`)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-xs font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${field.label} link for ${item.title}`}>
        {field.label}<ExternalLink className="size-3.5" aria-hidden="true" />
      </button>)}
    </div>
  );
}

function Notes({
  androidPresentation,
  layout,
  onLayoutChange,
  query,
  onQueryChange,
  items,
  totalItems,
  page,
  pageSize,
  onPageChange,
  filter,
  onFilter,
  types,
  categories,
  typeFilter,
  onTypeFilter,
  categoryFilter,
  onCategoryFilter,
  sort,
  onSort,
  onCreate,
  onEdit,
  onPin,
  onCopy,
  onExport,
  onDelete,
}: {
  androidPresentation: boolean;
  layout: 'grid' | 'list';
  onLayoutChange: (value: 'grid' | 'list') => void;
  query: string;
  onQueryChange: (value: string) => void;
  items: WorkItem[];
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  filter: NoteFilter;
  onFilter: (value: NoteFilter) => void;
  types: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  typeFilter: string;
  onTypeFilter: (value: string) => void;
  categoryFilter: string;
  onCategoryFilter: (value: string) => void;
  sort: RecordSort;
  onSort: (value: RecordSort) => void;
  onCreate: () => void;
  onEdit: (item: WorkItem) => void;
  onPin: (item: WorkItem) => void;
  onCopy: (item: WorkItem) => void;
  onExport: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
}) {
  const hasFilters = Boolean(query.trim() || filter !== 'all' || typeFilter !== 'all' || categoryFilter !== 'all');
  const clearFilters = () => { onQueryChange(''); onFilter('all'); onTypeFilter('all'); onCategoryFilter('all'); onSort('newest'); };
  const filterSummary = [query.trim() ? `Search: “${query.trim()}”` : '', filter === 'pinned' ? 'Pinned only' : '', typeFilter !== 'all' ? `Type: ${types.find(type => type.id === typeFilter)?.name || 'saved type'}` : '', categoryFilter !== 'all' ? `Category: ${categories.find(category => category.id === categoryFilter)?.name || 'saved category'}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="space-y-4">
      <section className={`${SURFACE} overflow-visible`}>
        <RecordCollectionToolbar
          labelText="Notes"
          layout={layout}
          onLayoutChange={onLayoutChange}
          query={query}
          onQueryChange={onQueryChange}
          filter={filter}
          onFilter={onFilter}
          types={types}
          categories={categories}
          typeFilter={typeFilter}
          onTypeFilter={onTypeFilter}
          categoryFilter={categoryFilter}
          onCategoryFilter={onCategoryFilter}
          sort={sort}
          onSort={onSort}
          onCreate={onCreate}
          className="border-b border-border/55"
        />
      </section>

      {items.length === 0 ? (
        <section className={SURFACE}>
          <Empty
            icon={<NotebookText className="h-6 w-6" />}
            title={hasFilters ? "No matching notes" : "No notes yet"}
            description={hasFilters ? filterSummary : "Keep decisions, conversations, research, and other useful notes with your work."}
            action={hasFilters ? "Clear all filters" : "Add note"}
            onAction={hasFilters ? clearFilters : onCreate}
          />
        </section>
      ) : (
        <div className={layout === 'grid' ? 'grid min-w-0 gap-3 @min-[36rem]/workspace:grid-cols-2 @min-[60rem]/workspace:grid-cols-3' : 'min-w-0 space-y-2'}>
          {items.map(item => {
            const preview =
              item.noteType === 'bug'
                ? item.description || item.notes
                : item.content || item.notes;

            if (layout === 'list') return (
              <article key={item.id} className={`${SURFACE} grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 p-3`}>
                <div className="size-12 overflow-hidden rounded-xl bg-muted">
                  <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" fallback={<div className="grid size-full place-items-center text-muted-foreground/55"><NotebookText className="size-5" aria-hidden="true" /></div>} />
                </div>
                <div className="min-w-0">
                  <button type="button" onClick={() => onEdit(item)} className="block min-h-11 w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{workTypeDisplayName(item, types)}</span>{item.pinned ? <span className="inline-flex items-center gap-1 font-bold text-amber-500"><Pin className="size-3" />Pinned</span> : null}<span>{displayDate(item.date || item.createdAt)} · {label(item.status)}</span></span>
                    <OverflowTooltip text={item.title}><strong className="mt-1 block truncate text-sm">{item.title}</strong></OverflowTooltip>
                    {preview ? <span className="mt-1 block truncate text-xs text-muted-foreground">{preview}</span> : null}
                    {item.workCategoryLabel ? <span className="mt-1 block truncate text-xs text-muted-foreground">{item.workCategoryLabel}</span> : null}
                  </button>
                  <CustomUrlActions item={item} types={types} />
                </div>
                <ItemMenu androidPresentation={androidPresentation} ariaLabel={`Actions for ${item.title}`} items={[
                  { label: item.pinned ? 'Unpin' : 'Pin', onClick: () => onPin(item) },
                  { label: 'Copy text', onClick: () => onCopy(item) },
                  { label: 'Export .txt', onClick: () => onExport(item) },
                  { label: 'Edit note', onClick: () => onEdit(item) },
                  { label: 'Delete note', onClick: () => onDelete(item), destructive: true },
                ]} />
              </article>
            );

            return (
              <article
                key={item.id}
                className={`${SURFACE} relative min-w-0 overflow-visible p-4 transition hover:border-primary/25`}
              >
                <div className="mb-3 aspect-[16/7] overflow-hidden rounded-xl bg-muted">
                  <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" fallback={<div className="grid size-full place-items-center text-muted-foreground/45"><NotebookText className="size-7" aria-hidden="true" /></div>} />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {workTypeDisplayName(item, types)}
                      </span>
                      {item.pinned && (
                        <span className="inline-flex items-center gap-1 text-caption font-bold text-amber-500">
                          <Pin className="h-3 w-3" />
                          Pinned
                        </span>
                      )}
                    </div>
                    <OverflowTooltip text={item.title} mode="clamped"><h3 className="mt-3 line-clamp-2 text-base font-semibold">
                      {item.title}
                    </h3></OverflowTooltip>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {displayDate(
                        item.date || item.createdAt,
                      )}{' '}
                      · {label(item.status)}
                    </p>
                  </button>
                  <ItemMenu
                    androidPresentation={androidPresentation}
                    ariaLabel={`Actions for ${item.title}`}
                    items={[
                      {
                        label: item.pinned ? 'Unpin' : 'Pin',
                        onClick: () => onPin(item),
                      },
                      {
                        label: 'Copy text',
                        onClick: () => onCopy(item),
                      },
                      {
                        label: 'Export .txt',
                        onClick: () => onExport(item),
                      },
                      {
                        label: 'Edit note',
                        onClick: () => onEdit(item),
                      },
                      {
                        label: 'Delete note',
                        onClick: () => onDelete(item),
                        destructive: true,
                      },
                    ]}
                  />
                </div>

                {item.workCategoryLabel || formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, types)?.fields) ? (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {[item.workCategoryLabel, formatWorkCustomFieldValues(item.customFieldValues, workTypeForItem(item, types)?.fields)].filter(Boolean).join(' · ')}
                  </p>
                ) : null}

                {item.noteType === 'bug' && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-lg bg-red-500/10 px-2 py-1 text-caption font-bold text-destructive">
                      {label(item.severity || 'medium')}
                    </span>
                    {item.module && (
                      <span className="rounded-lg bg-muted px-2 py-1 text-caption font-bold text-muted-foreground">
                        {item.module}
                      </span>
                    )}
                  </div>
                )}

                {preview && (
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="mt-3 w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {preview}
                    </p>
                  </button>
                )}
                <CustomUrlActions item={item} types={types} />
              </article>
            );
          })}
        </div>
      )}
      {totalItems > pageSize ? <PaginationControls page={page} totalPages={Math.max(1, Math.ceil(totalItems / pageSize))} totalItems={totalItems} pageSize={pageSize} onPageChange={onPageChange} collectionLabel="Work Hub notes" /> : null}
    </div>
  );
}

function Resources({
  androidPresentation,
  layout,
  onLayoutChange,
  query,
  onQueryChange,
  items,
  totalItems,
  page,
  pageSize,
  onPageChange,
  filter,
  onFilter,
  types,
  categories,
  typeFilter,
  onTypeFilter,
  categoryFilter,
  onCategoryFilter,
  sort,
  onSort,
  onCreate,
  onEdit,
  onPin,
  onDuplicate,
  onDelete,
}: {
  androidPresentation: boolean;
  layout: 'grid' | 'list';
  onLayoutChange: (value: 'grid' | 'list') => void;
  query: string;
  onQueryChange: (value: string) => void;
  items: WorkItem[];
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  filter: ResourceFilter;
  onFilter: (value: ResourceFilter) => void;
  types: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  typeFilter: string;
  onTypeFilter: (value: string) => void;
  categoryFilter: string;
  onCategoryFilter: (value: string) => void;
  sort: RecordSort;
  onSort: (value: RecordSort) => void;
  onCreate: () => void;
  onEdit: (item: WorkItem) => void;
  onPin: (item: WorkItem) => void;
  onDuplicate: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
}) {
  const hasFilters = Boolean(query.trim() || filter !== 'all' || typeFilter !== 'all' || categoryFilter !== 'all');
  const clearFilters = () => { onQueryChange(''); onFilter('all'); onTypeFilter('all'); onCategoryFilter('all'); onSort('newest'); };
  const filterSummary = [query.trim() ? `Search: “${query.trim()}”` : '', filter === 'pinned' ? 'Pinned only' : '', typeFilter !== 'all' ? `Type: ${types.find(type => type.id === typeFilter)?.name || 'saved type'}` : '', categoryFilter !== 'all' ? `Category: ${categories.find(category => category.id === categoryFilter)?.name || 'saved category'}` : ''].filter(Boolean).join(' · ');
  return (
    <section className={`${SURFACE} overflow-visible`}>
      <RecordCollectionToolbar
        labelText="Resources"
        layout={layout}
        onLayoutChange={onLayoutChange}
        query={query}
        onQueryChange={onQueryChange}
        filter={filter}
        onFilter={onFilter}
        types={types}
        categories={categories}
        typeFilter={typeFilter}
        onTypeFilter={onTypeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilter={onCategoryFilter}
        sort={sort}
        onSort={onSort}
        onCreate={onCreate}
        className="border-b border-border/55"
      />

      <div className={layout === 'grid' ? 'grid min-w-0 gap-3 p-4 @min-[36rem]/workspace:grid-cols-2 @min-[60rem]/workspace:grid-cols-3' : 'divide-y divide-border/55'}>
        {items.length === 0 ? (
          <Empty
            icon={<Link2 className="h-6 w-6" />}
            title={hasFilters ? "No matching resources" : "No resources yet"}
            description={hasFilters ? filterSummary : "Save references, files, links, and other resources that support your work."}
            action={hasFilters ? "Clear all filters" : "Add resource"}
            onAction={hasFilters ? clearFilters : onCreate}
          />
        ) : (
          items.map(item => {
            const meta = resourceMeta(item);
            const workType = workTypeForItem(item, types);
            const customSummary = formatWorkCustomFieldValues(item.customFieldValues, workType?.fields);
            if (layout === 'grid') return (
              <article key={item.id} className={`${SURFACE} min-w-0 overflow-hidden`}>
                <div className="aspect-[16/9] overflow-hidden bg-muted">
                  <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" fallback={<div className="grid size-full place-items-center text-muted-foreground/45"><Link2 className="size-8" aria-hidden="true" /></div>} />
                </div>
                <div className="min-w-0 p-4">
                  <div className="flex min-w-0 items-start gap-2">
                    <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                      <OverflowTooltip text={item.title}><strong className="block truncate text-sm">{item.title}</strong></OverflowTooltip>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{workTypeDisplayName(item, types)} · {domain(item.link)}{item.pinned ? ' · Pinned' : ''}</span>
                    </button>
                    <ItemMenu androidPresentation={androidPresentation} ariaLabel={`Actions for ${item.title}`} items={[
                      { label: item.pinned ? 'Unpin' : 'Pin', onClick: () => onPin(item) },
                      { label: 'Edit resource', onClick: () => onEdit(item) },
                      { label: 'Duplicate', onClick: () => onDuplicate(item) },
                      { label: 'Delete resource', onClick: () => onDelete(item), destructive: true },
                    ]} />
                  </div>
                  {item.notes || item.workCategoryLabel || customSummary ? <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{[item.notes, item.workCategoryLabel, customSummary].filter(Boolean).join(' · ')}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.link ? <button type="button" onClick={() => openWorkLink(item.link, 'resource link')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open link for ${item.title}`}>Open link<ExternalLink className="size-3.5" /></button> : null}
                    <CustomUrlActions item={item} types={types} className="!mt-0" />
                  </div>
                </div>
              </article>
            );
            return (
              <article
                key={item.id}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4"
              >
                <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="size-11 shrink-0 rounded-xl object-cover" fallback={<span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{meta.group === 'tickets' ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}</span>} />
                <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                  <div className="flex items-center gap-2">
                    <OverflowTooltip text={item.title}><strong className="truncate text-sm">
                      {item.title}
                    </strong></OverflowTooltip>
                    {item.pinned && (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                  </div>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {workTypeDisplayName(item, types)} · {domain(item.link)}
                    {item.notes ? ` · ${item.notes}` : ''}
                    {item.workCategoryLabel ? ` · ${item.workCategoryLabel}` : ''}
                    {customSummary ? ` · ${customSummary}` : ''}
                  </span>
                </button>
                <div className="col-start-3 row-start-1">
                <ItemMenu
                  androidPresentation={androidPresentation}
                  ariaLabel={`Actions for ${item.title}`}
                  items={[
                    {
                      label: item.pinned ? 'Unpin' : 'Pin',
                      onClick: () => onPin(item),
                    },
                    {
                      label: 'Edit resource',
                      onClick: () => onEdit(item),
                    },
                    {
                      label: 'Duplicate',
                      onClick: () => onDuplicate(item),
                    },
                    {
                      label: 'Delete resource',
                      onClick: () => onDelete(item),
                      destructive: true,
                    },
                  ]}
                />
                </div>
                {item.link && (
                  <button
                    type="button"
                    onClick={() => openWorkLink(item.link, 'resource link')}
                    className="col-start-2 row-start-2 inline-flex min-h-11 justify-self-start items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open link for ${item.title}`}
                  >
                    Open link
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
                <CustomUrlActions item={item} types={types} className="col-span-full !mt-0" />
              </article>
            );
          })
        )}
      </div>
      {totalItems > pageSize ? <PaginationControls page={page} totalPages={Math.max(1, Math.ceil(totalItems / pageSize))} totalItems={totalItems} pageSize={pageSize} onPageChange={onPageChange} collectionLabel="Work Hub resources" /> : null}
    </section>
  );
}

function Schedule({
  androidPresentation,
  mode,
  onMode,
  month,
  onMonth,
  selectedDate,
  onSelectedDate,
  entries,
  selectedEntries,
  currentLocation,
  onLocation,
  onCreate,
  onCreateForDate,
  onOpen,
  onDelete,
}: {
  androidPresentation: boolean;
  mode: ScheduleMode;
  onMode: (value: ScheduleMode) => void;
  month: Date;
  onMonth: (value: Date) => void;
  selectedDate: Date;
  onSelectedDate: (value: Date) => void;
  entries: CalendarEntry[];
  selectedEntries: CalendarEntry[];
  currentLocation?: ImportantDateItem;
  onLocation: (
    value: (typeof WORK_LOCATIONS)[number]['value'],
  ) => void;
  onCreate: () => void;
  onCreateForDate: (date: Date) => void;
  onOpen: (entry: CalendarEntry) => void;
  onDelete: (item: ImportantDateItem) => void;
}) {
  const agenda = entries.filter(entry => {
    const days = daysUntil(entry.date);
    return (
      isActionableWorkHubProjection(entry.source, entry.item.status) &&
      days !== null &&
      days >= -1 &&
      days <= 45
    );
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
  const [agendaPage, setAgendaPage] = useState(1);
  const agendaPageSize = 20;
  const agendaTotalPages = Math.max(1, Math.ceil(agenda.length / agendaPageSize));
  const paginatedAgenda = agenda.slice((agendaPage - 1) * agendaPageSize, agendaPage * agendaPageSize);
  useEffect(() => {
    setAgendaPage(1);
  }, [entries]);
  useEffect(() => {
    if (agendaPage > agendaTotalPages) setAgendaPage(agendaTotalPages);
  }, [agendaPage, agendaTotalPages]);

  return (
    <div className="space-y-4">
      <section className={`${SURFACE} p-4`}>
        <div className="flex flex-col gap-4 @min-[48rem]/workspace:flex-row @min-[48rem]/workspace:items-center @min-[48rem]/workspace:justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              Today’s work location
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentLocation?.title || 'Not set'}
            </p>
          </div>
          <FilterBar label="Work location" className="min-w-0">
            {WORK_LOCATIONS.map(option => (
              <FilterChip
                key={option.value}
                selected={currentLocation?.type === option.value}
                onSelectedChange={selected => { if (selected) onLocation(option.value); }}
                className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold"
              >
                {option.label}
              </FilterChip>
            ))}
          </FilterBar>
        </div>
      </section>

      <section className={`${SURFACE} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-border/55 p-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            label="Work calendar view"
            value={mode}
            onValueChange={value => onMode(value as 'agenda' | 'month')}
            size="compact"
            options={[{ value: 'agenda', label: 'Agenda' }, { value: 'month', label: 'Month' }]}
          />
          <Button
            type="button"
            onClick={onCreate}
            className="rounded-xl"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add event
          </Button>
        </div>

        {mode === 'agenda' ? (
          <>
          <p className="px-4 pt-3 text-body-sm text-muted-foreground">Yesterday through the next 45 days</p>
          <Agenda
            androidPresentation={androidPresentation}
            entries={paginatedAgenda}
            onOpen={onOpen}
            onDelete={onDelete}
          />
          {agenda.length > agendaPageSize ? <PaginationControls page={agendaPage} totalPages={agendaTotalPages} totalItems={agenda.length} pageSize={agendaPageSize} onPageChange={setAgendaPage} collectionLabel="Work Hub agenda events" /> : null}
          </>
        ) : (
          <div className="grid min-w-0 gap-5 p-4 @min-[52rem]/workspace:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
            <WorkHubMonthGrid
              androidPresentation={androidPresentation}
              month={month}
              onMonth={onMonth}
              selectedDate={selectedDate}
              onSelectedDate={onSelectedDate}
              entries={entries}
              dayStart={dayStart}
              sameDay={sameDay}
              tone={tone}
            />
            <div className="min-w-0 border-t border-border/55 pt-4 @min-[52rem]/workspace:border-t-0 @min-[52rem]/workspace:border-l @min-[52rem]/workspace:pl-5 @min-[52rem]/workspace:pt-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">
                    Selected date
                  </p>
                  <h3 className="mt-1 font-semibold">
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onCreateForDate(selectedDate)}
                  className="inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                  aria-label="Add event to selected date"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1">
                {selectedEntries.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Nothing scheduled.
                  </p>
                ) : (
                  selectedEntries.map(entry => (
                    <CalendarRow
                      androidPresentation={androidPresentation}
                      key={entry.id}
                      entry={entry}
                      onOpen={() => onOpen(entry)}
                      onDelete={onDelete}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Agenda({
  androidPresentation,
  entries,
  onOpen,
  onDelete,
}: {
  androidPresentation: boolean;
  entries: CalendarEntry[];
  onOpen: (entry: CalendarEntry) => void;
  onDelete: (item: ImportantDateItem) => void;
}) {
  const groups = entries.reduce<Record<string, CalendarEntry[]>>(
    (result, entry) => {
      const key = inputDate(entry.date);
      result[key] = [...(result[key] || []), entry];
      return result;
    },
    {},
  );
  const keys = Object.keys(groups).sort();

  if (!keys.length) {
    return (
      <Empty
        icon={<CalendarDays className="h-6 w-6" />}
        title="Nothing in this agenda window"
        description="This agenda shows yesterday through the next 45 days. Choose Month to view other dates."
      />
    );
  }

  return (
    <div className="divide-y divide-border/55">
      {keys.map(key => {
        const date = new Date(`${key}T00:00:00`);
        const days = daysUntil(date);
        const heading =
          days === 0
            ? 'Today'
            : days === 1
              ? 'Tomorrow'
              : date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                });

        return (
          <section
            key={key}
            className="grid min-w-0 gap-2 px-4 py-4 @min-[36rem]/workspace:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]"
          >
            <div>
              <p className="text-sm font-semibold">{heading}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {key}
              </p>
            </div>
            <div className="space-y-1">
              {groups[key].map(entry => (
                <CalendarRow
                      androidPresentation={androidPresentation}
                      key={entry.id}
                      entry={entry}
                      onOpen={() => onOpen(entry)}
                      onDelete={onDelete}
                    />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarRow({
  androidPresentation,
  entry,
  onOpen,
  onDelete,
}: {
  androidPresentation: boolean;
  entry: CalendarEntry;
  onOpen: () => void;
  onDelete: (item: ImportantDateItem) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-muted">
      <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone(entry.type)}`}
                  />
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <OverflowTooltip text={entry.title}><strong className="block truncate text-sm">
          {entry.title}
        </strong></OverflowTooltip>
        <span className="block truncate text-xs text-muted-foreground">
          {label(entry.type)}
          {entry.source !== 'event'
            ? ' · From item due date'
            : ''}
        </span>
      </button>
      {entry.source === 'event' && (
        <ItemMenu
          androidPresentation={androidPresentation}
          ariaLabel={`Actions for ${entry.title}`}
          items={[
            { label: 'Edit event', onClick: onOpen },
            {
              label: 'Remove event',
              onClick: () =>
                onDelete(entry.item as ImportantDateItem),
              destructive: true,
            },
          ]}
        />
      )}
    </div>
  );
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      className={`${SURFACE} flex min-h-[420px] items-center justify-center p-8 text-center`}
    >
      <div className="max-w-sm">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BriefcaseBusiness className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-section-title">
          Create your first project
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Projects keep related tasks, notes, resources,
          and dates together.
        </p>
        <Button
          type="button"
          onClick={onCreate}
          className="mt-5 rounded-xl"
        >
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>
    </section>
  );
}

function Empty({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action && onAction && (
        <Button
          type="button"
          size="sm"
          onClick={onAction}
          className="mt-4 rounded-xl"
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          {action}
        </Button>
      )}
    </div>
  );
}

function WorkSelect({
  id,
  value,
  onChange,
  className,
  ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  children,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className} aria-label={ariaLabel} aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid} aria-required={ariaRequired}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

type WorkHubMenuItem = {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
};

function WorkHubActionSheet({
  open,
  title,
  onClose,
  items,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  items: WorkHubMenuItem[];
}) {
  return (
    <CaizenBottomSheet open={open} title={title} onClose={onClose}>
      <div className="space-y-1" data-android-workhub-action-sheet="true">
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold transition hover:bg-muted ${item.separatorBefore ? 'mt-2 border-t border-border pt-3' : ''} ${item.destructive ? 'text-destructive' : 'text-foreground'}`}
            data-destructive={item.destructive ? 'true' : undefined}
          >
            <span className="shrink-0">{item.icon || <MoreHorizontal className="h-5 w-5" />}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </CaizenBottomSheet>
  );
}

function ItemMenu({
  androidPresentation = false,
  ariaLabel,
  items,
}: {
  androidPresentation?: boolean;
  ariaLabel: string;
  items: WorkHubMenuItem[];
}) {
  const [open, setOpen] = useState(false);

  if (androidPresentation) {
    return (
      <>
        <button
          type="button"
          className="android-touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
          onClick={() => setOpen(true)}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
        <WorkHubActionSheet
          open={open}
          title={ariaLabel.replace(/^Actions for /, '')}
          onClose={() => setOpen(false)}
          items={items}
        />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {items.map(item => (
          <Fragment key={item.label}>
          {item.separatorBefore ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={item.onClick}
            variant={item.destructive ? 'destructive' : 'default'}
            className="text-xs font-bold"
          >
            {item.label}
          </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FloatingMenu({
  trigger,
  open,
  onOpenChange,
  align = 'end',
  children,
}: {
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'start' | 'end';
  children: ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuAction({
  icon,
  label: actionLabel,
  onClick,
  destructive = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onClick}
      variant={destructive ? 'destructive' : 'default'}
      className="gap-2.5 text-sm font-bold"
    >
      {icon}
      {actionLabel}
    </DropdownMenuItem>
  );
}

function makeDraft(
  state: Exclude<EditorState, null>,
  projectId: string,
) {
  const template =
    'template' in state ? state.template || {} : {};

  if (state.kind === 'project') {
    const project = state.item;
    return {
      title: project?.title || '',
      status: project?.status || 'active',
      link: project?.link || '',
      notes: project?.notes || '',
      attachmentAssetIds: project?.attachmentAssetIds || [],
    };
  }

  if (state.kind === 'task') {
    const task = state.item;
    return {
      title: task?.title || template.title || '',
      projectId: task?.projectId || template.projectId || projectId,
      status: task?.status || template.status || 'planned',
      priority:
        task?.priority ||
        template.priority ||
        (task?.severity === 'critical' || task?.severity === 'high'
          ? 'high'
          : 'medium'),
      dueDate: inputDate(task?.dueDate || template.dueDate),
      link: task?.link || template.link || '',
      notes: task?.notes || template.notes || '',
      attachmentAssetIds: task?.attachmentAssetIds || template.attachmentAssetIds || [],
    };
  }

  if (state.kind === 'note') {
    const note = state.item;
    const workTypeId = note ? resolveWorkTypeId(note) : String(template.workTypeId || 'note-general');
    return {
      title: note?.title || template.title || '',
      projectId: note?.projectId || template.projectId || projectId,
      noteType: note?.noteType || template.noteType || legacyNoteTypeForWorkType(workTypeId),
      workTypeId,
      workCategoryId: note?.workCategoryId || template.workCategoryId || '',
      workCategoryLabel: note?.workCategoryLabel || template.workCategoryLabel || '',
      image: note?.image || template.image || '',
      customFieldValues: normalizeWorkCustomFieldValues(note?.customFieldValues || template.customFieldValues) || {},
      status: note?.status || template.status || 'draft',
      date: inputDate(note?.date || template.date || new Date()),
      content:
        note?.content ||
        note?.notes ||
        template.content ||
        template.notes ||
        '',
      pinned: Boolean(note?.pinned || template.pinned),
      module: note?.module || template.module || '',
      description: note?.description || template.description || '',
      stepsToReproduce:
        note?.stepsToReproduce ||
        template.stepsToReproduce ||
        '',
      expectedResult:
        note?.expectedResult || template.expectedResult || '',
      actualResult:
        note?.actualResult || template.actualResult || '',
      severity: note?.severity || template.severity || 'medium',
      priority: note?.priority || template.priority || 'medium',
      environment: note?.environment || template.environment || '',
      browserDevice:
        note?.browserDevice || template.browserDevice || '',
      screenshotLink:
        note?.screenshotLink || template.screenshotLink || '',
      ticketLink: note?.ticketLink || template.ticketLink || '',
      extraNotes: note?.extraNotes || template.extraNotes || '',
    };
  }

  if (state.kind === 'resource') {
    const resource = state.item;
    const workTypeId = resource ? resolveWorkTypeId(resource) : String(template.workTypeId || 'resource-document');
    return {
      title: resource?.title || template.title || '',
      projectId:
        resource?.projectId || template.projectId || projectId,
      fileType:
        resource?.fileType ||
        resource?.type ||
        template.fileType ||
        template.type ||
        'file',
      workTypeId,
      workCategoryId: resource?.workCategoryId || template.workCategoryId || '',
      workCategoryLabel: resource?.workCategoryLabel || template.workCategoryLabel || '',
      customFieldValues: normalizeWorkCustomFieldValues(resource?.customFieldValues || template.customFieldValues) || {},
      link: resource?.link || template.link || '',
      image: resource?.image || template.image || '',
      notes: resource?.notes || template.notes || '',
      pinned: Boolean(resource?.pinned || template.pinned),
      dueDate: inputDate(
        resource?.dueDate || template.dueDate,
      ),
    };
  }

  const event = state.item;
  return {
    title: event?.title || '',
    type: event?.type || 'meeting',
    projectId: event?.projectId || projectId,
    date: inputDate(event?.date || state.date || new Date()),
    endDate: inputDate(event?.endDate),
    notes: event?.notes || '',
    reminder: event?.reminder || 'same_day',
    customReminderDays: String(event?.customReminderDays ?? 1),
    reminderEnabled: Boolean(event?.reminderEnabled),
    reminderTime: event?.reminderTime || '09:00',
    trackAsOverdue: event?.trackAsOverdue === true,
  };
}

function EditorDialog({
  state,
  projects,
  projectId,
  profileId,
  workTypes,
  categories,
  onSaveItem,
  onSaveEvent,
  lifeHubActivity,
  managedLifeHubMirror = false,
  onOpenRoutine,
  onOpenLifeHubTask,
  onOpenLifeHub,
  onClose,
}: {
  state: Exclude<EditorState, null>;
  projects: WorkItem[];
  projectId: string;
  profileId: string;
  workTypes: WorkTypeDefinition[];
  categories: ModuleTaxonomyCategory[];
  onSaveItem: (item: WorkItem, options?: WorkEditorSaveOptions) => void;
  onSaveEvent: (item: ImportantDateItem) => void;
  lifeHubActivity?: WorkLifeHubActivity;
  managedLifeHubMirror?: boolean;
  onOpenRoutine?: (routineId: string) => void;
  onOpenLifeHubTask?: (taskId: string) => void;
  onOpenLifeHub?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<any>(() => ({
    ...makeDraft(state, projectId),
    ...(state.kind === 'task' ? { mirrorToLifeHub: managedLifeHubMirror } : {}),
  }));
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState('');
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const fieldErrors = validateWorkEditor(state.kind, draft, state.kind === 'event' && isLocation(draft.type));
  if ((state.kind === 'note' || state.kind === 'resource') && draft.image.trim() && !normalizeExternalWebUrl(draft.image)) {
    fieldErrors.image = 'Enter a valid HTTPS image URL, or leave this field empty.';
  }
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const hasIncidentDetails = state.kind === 'note' && Boolean(
    state.item?.environment || state.item?.browserDevice ||
    state.item?.screenshotLink || state.item?.ticketLink || state.item?.extraNotes,
  );
  const initial = useRef(JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== initial.current;
  const item = state.item;
  const workItem = state.kind === 'event' ? undefined : state.item;
  const selectedWorkType = workTypes.find(type => type.id === draft.workTypeId);
  const attachmentOwnerId = useRef(
    workItem?.id || id(`work-${state.kind}`),
  ).current;

  const ownerProfileId = useRef(profileId).current;

  const cleanupDraftAttachments = useCallback(
    (cleanupProfileId: string) => {
      if (state.kind !== 'project' && state.kind !== 'task') return;
      const persisted = new Set(workItem?.attachmentAssetIds || []);
      const draftIds = normalizeWorkAttachmentIds(draft.attachmentAssetIds) || [];
      const draftOnlyIds = draftIds.filter(assetId => !persisted.has(assetId));
      if (draftOnlyIds.length === 0 || !cleanupProfileId) return;
      queueMediaCleanup({
        profileId: cleanupProfileId,
        assetIds: draftOnlyIds,
        reason: 'draft-cancelled',
      });
      void processPendingMediaCleanup();
    },
    [draft, state.kind, workItem],
  );

  useEffect(() => {
    if (!profileId || profileId === ownerProfileId) return;
    cleanupDraftAttachments(ownerProfileId);
    onClose();
  }, [cleanupDraftAttachments, onClose, ownerProfileId, profileId]);

  const close = useCallback(() => {
    cleanupDraftAttachments(ownerProfileId);
    onClose();
  }, [cleanupDraftAttachments, onClose, ownerProfileId]);

  const update = (updates: Record<string, unknown>) => {
    setDraft((current: any) => ({ ...current, ...updates }));
  };

  const updateCustomField = (fieldId: string, value: WorkCustomFieldValue | undefined) => {
    setDraft((current: any) => {
      const values = { ...(normalizeWorkCustomFieldValues(current.customFieldValues) || {}) };
      if (value === undefined) delete values[fieldId];
      else values[fieldId] = value;
      return { ...current, customFieldValues: values };
    });
    setCustomErrors(current => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const title =
    state.kind === 'event' && isLocation(draft.type)
      ? item ? 'Edit work location' : 'Set work location'
      : state.kind === 'project'
      ? item
        ? 'Edit project'
        : 'Create project'
      : state.kind === 'task'
        ? item
          ? 'Edit task'
          : 'Add task'
        : state.kind === 'note'
          ? draft.noteType === 'bug'
            ? item
              ? 'Edit bug record'
              : 'Add bug record'
            : item
              ? 'Edit note'
              : 'Add note'
          : state.kind === 'resource'
            ? item
              ? 'Edit resource'
              : 'Add resource'
            : item
              ? 'Edit event'
              : 'Add event';

  const canSave = Object.keys(fieldErrors).length === 0;
  const focusInvalid = () => window.requestAnimationFrame(() => {
    const invalid = editorBodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    let ancestor: HTMLElement | null = invalid?.parentElement || null;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    const control = invalid?.matches('input, textarea, button, [tabindex]') ? invalid : invalid?.querySelector<HTMLElement>('input, textarea, button, [tabindex]');
    control?.focus();
    (control || invalid)?.scrollIntoView({ block: 'nearest' });
  });

  function save() {
    if (uploadingAttachment) return;
    setSubmitted(true);
    setSaveError('');
    const validation = state.kind === 'note' || state.kind === 'resource'
      ? validateWorkCustomFieldValues(selectedWorkType?.fields || [], draft.customFieldValues)
      : { valid: true, errors: {} };
    setCustomErrors(validation.errors);
    if (!canSave || !validation.valid) {
      focusInvalid();
      return;
    }
    try {

    if (state.kind === 'project') {
      const project = state.item;
      onSaveItem({
        id: project?.id || attachmentOwnerId,
        type: 'project',
        title: draft.title.trim(),
        status: draft.status as WorkItemStatus,
        link: draft.link.trim() || undefined,
        image: project?.image,
        notes: draft.notes.trim() || undefined,
        attachmentAssetIds: normalizeWorkAttachmentIds(draft.attachmentAssetIds),
        priority: project?.priority || 'medium',
        createdAt: project?.createdAt || new Date(),
      });
      return;
    }

    if (state.kind === 'task') {
      const task = state.item;
      onSaveItem({
        id: task?.id || attachmentOwnerId,
        type: 'task',
        title: draft.title.trim(),
        projectId: draft.projectId,
        status: draft.status as WorkItemStatus,
        priority: draft.priority,
        dueDate: draft.dueDate
          ? parseLocalDateInput(draft.dueDate)
          : null,
        link: draft.link.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        attachmentAssetIds: normalizeWorkAttachmentIds(draft.attachmentAssetIds),
        createdAt: task?.createdAt || new Date(),
      }, { mirrorToLifeHub: Boolean(draft.mirrorToLifeHub) });
      return;
    }

    if (state.kind === 'note') {
      const note = state.item;
      const bug = draft.noteType === 'bug' || draft.workTypeId === 'note-bug-incident';
      const content = bug ? draft.description : draft.content;

      onSaveItem({
        id: note?.id || id('work-note'),
        type: 'note',
        title: draft.title.trim(),
        projectId: draft.projectId,
        status: draft.status as WorkItemStatus,
        noteType: draft.noteType,
        workTypeId: draft.workTypeId,
        workCategoryId: draft.workCategoryId || undefined,
        workCategoryLabel: categories.find(category => category.id === draft.workCategoryId)?.name || draft.workCategoryLabel || undefined,
        customFieldValues: normalizeWorkCustomFieldValues(draft.customFieldValues),
        image: normalizeExternalWebUrl(draft.image) || undefined,
        date: draft.date ? parseLocalDateInput(draft.date) : new Date(),
        content: content.trim() || undefined,
        notes: content.trim() || undefined,
        pinned: Boolean(draft.pinned),
        module: bug ? draft.module.trim() || undefined : note?.module,
        description: bug
          ? draft.description.trim() || undefined
          : note?.description,
        stepsToReproduce: bug
          ? draft.stepsToReproduce.trim() || undefined
          : note?.stepsToReproduce,
        expectedResult: bug
          ? draft.expectedResult.trim() || undefined
          : note?.expectedResult,
        actualResult: bug
          ? draft.actualResult.trim() || undefined
          : note?.actualResult,
        severity: bug
          ? (draft.severity as WorkSeverity)
          : note?.severity,
        priority: bug ? draft.priority : note?.priority,
        environment: bug
          ? draft.environment.trim() || undefined
          : note?.environment,
        browserDevice: bug
          ? draft.browserDevice.trim() || undefined
          : note?.browserDevice,
        screenshotLink: bug
          ? draft.screenshotLink.trim() || undefined
          : note?.screenshotLink,
        ticketLink: bug
          ? draft.ticketLink.trim() || undefined
          : note?.ticketLink,
        extraNotes: bug
          ? draft.extraNotes.trim() || undefined
          : note?.extraNotes,
        createdAt: note?.createdAt || new Date(),
      });
      return;
    }

    if (state.kind === 'resource') {
      const resource = state.item;
      onSaveItem({
        id: resource?.id || id('work-resource'),
        type: draft.fileType as WorkItemType,
        fileType: draft.fileType,
        workTypeId: draft.workTypeId,
        workCategoryId: draft.workCategoryId || undefined,
        workCategoryLabel: categories.find(category => category.id === draft.workCategoryId)?.name || draft.workCategoryLabel || undefined,
        customFieldValues: normalizeWorkCustomFieldValues(draft.customFieldValues),
        title: draft.title.trim(),
        projectId: draft.projectId,
        status: resource?.status || 'active',
        link: draft.link.trim(),
        image: normalizeExternalWebUrl(draft.image) || undefined,
        notes: draft.notes.trim() || undefined,
        pinned: Boolean(draft.pinned),
        dueDate: draft.dueDate
          ? parseLocalDateInput(draft.dueDate)
          : null,
        createdAt: resource?.createdAt || new Date(),
      });
      return;
    }

    const event = state.item;
    const location = isLocation(draft.type);
    const eventTitle = location
      ? WORK_LOCATIONS.find(
          option => option.value === draft.type,
        )?.label || label(draft.type)
      : draft.title.trim();

    onSaveEvent({
      id: event?.id || id('work-event'),
      title: eventTitle,
      type: draft.type as ImportantDateType,
      date: parseLocalDateInput(draft.date),
      endDate: draft.endDate
        ? parseLocalDateInput(draft.endDate)
        : null,
      repeat: event?.repeat || 'none',
      amount: event?.amount,
      trackAsOverdue: event?.trackAsOverdue === true,
      projectId: location ? undefined : draft.projectId || projectId,
      notes: draft.notes.trim() || undefined,
      link: event?.link,
      createdAt: event?.createdAt || new Date(),
      priority: event?.priority,
      reminder: draft.reminder,
      customReminderDays: draft.reminder === 'custom'
        ? Math.max(0, Number(draft.customReminderDays) || 0)
        : undefined,
      reminderEnabled: Boolean(draft.reminderEnabled),
      reminderTime: draft.reminderEnabled ? draft.reminderTime : undefined,
    });
    } catch {
      setSaveError('Could not save this record. Your changes are still here; try again.');
    }
  }

  return (
    <Modal
      title={title}
      busy={uploadingAttachment}
      dirty={dirty}
      onClose={close}
      wide={state.kind === 'note' && draft.noteType === 'bug'}
      footer={requestClose => (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={uploadingAttachment}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <p className="order-first w-full text-body-sm text-muted-foreground sm:order-none sm:mr-auto sm:w-auto sm:max-w-xs" role="status">
            {uploadingAttachment ? 'Uploading attachment. Please wait before saving or closing.' : saveError || (!canSave ? Object.values(fieldErrors)[0] : 'Ready to save')}
          </p>
          <Button
            type="button"
            onClick={save}
            disabled={uploadingAttachment}
            className="rounded-xl"
          >
            {item ? 'Save changes' : state.kind === 'project' ? 'Create project' : state.kind === 'event' && isLocation(draft.type) ? 'Save work location' : `Add ${state.kind}`}
          </Button>
        </>
      )}
    >
      <div ref={editorBodyRef} className="@container/record-editor min-w-0">
      {saveError ? <p role="alert" className="mb-3 text-body-sm text-destructive">{saveError}</p> : null}
      {state.kind === 'project' && (
        <div className="grid gap-4">
          <Field name="Project name" required error={submitted ? fieldErrors.title : undefined}>
            <Input
              value={draft.title}
              onChange={event =>
                update({ title: event.target.value })
              }
              placeholder="Project name"
              className={INPUT}
            />
          </Field>
          <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
            <Field name="Status">
              <WorkSelect
                value={draft.status}
                onChange={value =>
                  update({ status: value })
                }
                className={INPUT}
              >
                <SelectItem value="planned">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="done">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </WorkSelect>
            </Field>
            <Field name="Project link" error={fieldErrors.link}>
              <Input
                value={draft.link}
                onChange={event =>
                  update({ link: event.target.value })
                }
                placeholder="https://…"
                className={INPUT}
              />
            </Field>
          </div>
          <Field name="Description">
            <FormattedTextarea
              value={draft.notes}
              onChange={value => update({ notes: value })}
              placeholder="What is this project for?"
              minRows={4}
            />
          </Field>
          <EditorDetails label="Attachments"><WorkAttachmentsField
            profileId={profileId}
            ownerId={attachmentOwnerId}
            attachmentAssetIds={normalizeWorkAttachmentIds(draft.attachmentAssetIds) || []}
            persistedAssetIds={workItem?.attachmentAssetIds || []}
            onChange={attachmentAssetIds => update({ attachmentAssetIds })}
            onUploadingChange={setUploadingAttachment}
          /></EditorDetails>
        </div>
      )}

      {state.kind === 'task' && (
        <div className="grid gap-4">
          <Field name="Task" required error={submitted ? fieldErrors.title : undefined}>
            <Input
              value={draft.title}
              onChange={event =>
                update({ title: event.target.value })
              }
              placeholder="What needs to be done?"
              className={INPUT}
            />
          </Field>
          <Field name="Notes">
            <FormattedTextarea
              value={draft.notes}
              onChange={value => update({ notes: value })}
              placeholder="Acceptance criteria, context, or next step"
              minRows={4}
            />
          </Field>
          <EditorDetails label="More details" initialOpen={false}>

          <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
            <Field name="Project" required error={submitted ? fieldErrors.projectId : undefined}>
              <WorkSelect
                value={draft.projectId}
                onChange={value =>
                  update({ projectId: value })
                }
                className={INPUT}
              >
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </WorkSelect>
            </Field>
            <Field name="Status">
              <WorkSelect
                value={draft.status}
                onChange={value =>
                  update({ status: value })
                }
                className={INPUT}
              >
                {TASK_STATUSES.map(option => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </WorkSelect>
            </Field>
            <Field name="Priority">
              <WorkSelect
                value={draft.priority}
                onChange={value =>
                  update({ priority: value })
                }
                className={INPUT}
              >
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </WorkSelect>
            </Field>
            <Field name="Due date" error={fieldErrors.dueDate}>
              <AdaptiveDatePicker
                label="Due date"
                value={draft.dueDate}
                onChange={value => update({ dueDate: value })}
                className={INPUT}
              />
            </Field>
          </div>

          <Field name="Related link" error={fieldErrors.link}>
            <Input
              value={draft.link}
              onChange={event =>
                  update({ link: event.target.value })
                }
              placeholder="Ticket, document, or reference link"
              className={INPUT}
            />
          </Field>

          <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/[0.045] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Add to Life Hub Tasks</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Show this task in Life Hub too. Edit its title, due date, and priority here; completion stays linked.
              </p>
            </div>
            <Switch
              checked={Boolean(draft.mirrorToLifeHub)}
              onCheckedChange={checked => update({ mirrorToLifeHub: checked })}
              aria-label="Add this Work task to Life Hub Tasks"
            />
          </div>
          <WorkAttachmentsField
            profileId={profileId}
            ownerId={attachmentOwnerId}
            attachmentAssetIds={normalizeWorkAttachmentIds(draft.attachmentAssetIds) || []}
            persistedAssetIds={workItem?.attachmentAssetIds || []}
            onChange={attachmentAssetIds => update({ attachmentAssetIds })}
            onUploadingChange={setUploadingAttachment}
          />
          {lifeHubActivity && state.kind === 'task' && onOpenRoutine && onOpenLifeHubTask && onOpenLifeHub ? (
            <WorkLifeHubContext
            activity={lifeHubActivity}
            onOpenRoutine={onOpenRoutine}
            onOpenTask={onOpenLifeHubTask}
            onOpenLifeHub={onOpenLifeHub}
          />
          ) : null}
          </EditorDetails>

        </div>
      )}

      {state.kind === 'resource' && (
        <div className="grid gap-4">
          <Field name="Title" required error={submitted ? fieldErrors.title : undefined}>
            <Input
              value={draft.title}
              onChange={event =>
                update({ title: event.target.value })
              }
              placeholder="Resource title"
              className={INPUT}
            />
          </Field>
          <Field name="URL" required error={draft.link || submitted ? fieldErrors.link : undefined}>
            <Input
              value={draft.link}
              onChange={event =>
                  update({ link: event.target.value })
                }
              placeholder="Document, ticket, design, or data URL"
              className={INPUT}
            />
          </Field>
          <div>
            <Field name="Image URL" error={submitted ? fieldErrors.image : undefined}>
              <Input
                value={draft.image}
                onChange={event => update({ image: event.target.value })}
                placeholder="https://example.com/image.jpg"
                aria-invalid={Boolean(submitted && fieldErrors.image)}
                className={INPUT}
              />
            </Field>
            <p className="mt-1.5 text-xs text-muted-foreground">Optional. Use an HTTPS image address.</p>
          </div>
          <Field name="Notes">
            <FormattedTextarea
              value={draft.notes}
              onChange={value => update({ notes: value })}
              placeholder="Why this link matters or how to use it"
              minRows={4}
            />
          </Field>
          <EditorDetails label="More details" initialOpen={false}>

          <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
            <Field name="Project" required error={submitted ? fieldErrors.projectId : undefined}>
              <WorkSelect
                value={draft.projectId}
                onChange={value =>
                  update({ projectId: value })
                }
                className={INPUT}
              >
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </WorkSelect>
            </Field>
            <Field name="Type">
              <WorkSelect
                value={draft.workTypeId}
                onChange={value => {
                  update({ workTypeId: value, fileType: legacyResourceTypeForWorkType(value) });
                  setCustomErrors({});
                }}
                className={INPUT}
              >
                {draft.workTypeId && !workTypes.some(type => type.id === draft.workTypeId) ? <SelectItem value={draft.workTypeId}>Unavailable saved type</SelectItem> : null}
                {workTypes.filter(type => type.kind === 'resource' && (!type.archived || type.id === draft.workTypeId)).map(type => <SelectItem key={type.id} value={type.id}>{type.name}{type.archived ? ' · Archived' : ''}</SelectItem>)}
              </WorkSelect>
            </Field>
          </div>

          <Field name="Work category">
            <WorkSelect value={workCategorySelectionValue(draft.workCategoryId)} onChange={value => { const categoryId = workCategoryIdFromSelection(value); update({ workCategoryId: categoryId, workCategoryLabel: categories.find(category => category.id === categoryId)?.name || '' }); }} className={INPUT}>
              <SelectItem value={NO_WORK_CATEGORY_VALUE}>No category</SelectItem>
              {draft.workCategoryId && !categories.some(category => category.id === draft.workCategoryId) ? <SelectItem value={workCategorySelectionValue(draft.workCategoryId)}>{draft.workCategoryLabel || 'Unavailable saved category'}</SelectItem> : null}
              {categories.filter(category => !category.archived || category.id === draft.workCategoryId).map(category => <SelectItem key={category.id} value={workCategorySelectionValue(category.id)}>{category.name}{category.archived ? ' · Archived' : ''}</SelectItem>)}
            </WorkSelect>
          </Field>

          <AdaptiveDatePicker
            ariaInvalid={Boolean(fieldErrors.dueDate)}
            label="Optional due or review date"
            value={draft.dueDate}
            onChange={value => update({ dueDate: value })}
          />

          <PinToggle
            checked={draft.pinned}
            onChange={checked => update({ pinned: checked })}
            labelText="Pin resource"
            description="Keep it at the top of Resources."
          />
          </EditorDetails>
          {selectedWorkType?.fields.length ? <section className="grid gap-3 border-t border-border/55 pt-4"><div><h3 className="text-sm font-semibold">Additional fields</h3></div><WorkCustomFieldRenderer fields={selectedWorkType.fields} values={normalizeWorkCustomFieldValues(draft.customFieldValues) || {}} errors={customErrors} onChange={updateCustomField} /></section> : null}

        </div>
      )}

      {state.kind === 'event' && (
        <div className="grid gap-4">
          <Field name="Type">
            <WorkSelect
              value={draft.type}
              onChange={value =>
                update({ type: value })
              }
              className={INPUT}
            >
              <SelectGroup>
                <SelectLabel>Events</SelectLabel>
                {WORK_EVENTS.map(option => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Work location</SelectLabel>
                {WORK_LOCATIONS.map(option => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </WorkSelect>
          </Field>

          {!isLocation(draft.type) && (
            <Field name="Title" required error={submitted ? fieldErrors.title : undefined}>
              <Input
                value={draft.title}
                onChange={event =>
                update({ title: event.target.value })
              }
                placeholder="Meeting, deadline, reminder…"
                className={INPUT}
              />
            </Field>
          )}

          <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
            <FormField label="Start date" required error={fieldErrors.date}>
            {({ id, describedBy, invalid }) => <AdaptiveDatePicker id={id} ariaDescribedBy={describedBy} ariaInvalid={invalid}
              label="Start date"
              value={draft.date}
              onChange={value => update({ date: value })}
            />}</FormField>
            <FormField label="End date (optional)" error={fieldErrors.endDate}>
            {({ id, describedBy, invalid }) => <AdaptiveDatePicker id={id} ariaDescribedBy={describedBy} ariaInvalid={invalid}
              label="End date (optional)"
              value={draft.endDate}
              onChange={value => update({ endDate: value })}
            />}</FormField>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold">Remind me about this event</span>
                <span className="block text-xs text-muted-foreground">The reminder uses your device’s local date and time.</span>
              </span>
              <Switch
                checked={Boolean(draft.reminderEnabled)}
                onCheckedChange={checked => update({ reminderEnabled: checked })}
                aria-label="Remind me about this event"
              />
            </div>
            {draft.reminderEnabled ? (
              <div className="mt-3 grid min-w-0 gap-3 @min-[28rem]/record-editor:grid-cols-2">
                <Field name="Reminder lead">
                  <WorkSelect
                    value={draft.reminder}
                    onChange={value => update({ reminder: value })}
                    className={INPUT}
                  >
                    <SelectItem value="same_day">Same day</SelectItem>
                    <SelectItem value="1_day_before">1 day before</SelectItem>
                    <SelectItem value="3_days_before">3 days before</SelectItem>
                    <SelectItem value="1_week_before">1 week before</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </WorkSelect>
                </Field>
                {draft.reminder === 'custom' ? (
                  <Field name="Days before" error={fieldErrors.customReminderDays}>
                    <Input
                      type="number"
                      min="0"
                      value={draft.customReminderDays}
                      onChange={event => update({ customReminderDays: event.target.value })}
                      className={INPUT}
                    />
                  </Field>
                ) : null}
                <CaizenTimePicker
                  label="Reminder time"
                  value={draft.reminderTime}
                  onChange={value => update({ reminderTime: value })}
                  className={INPUT}
                />
              </div>
            ) : null}
          </div>

          <Field name="Notes">
            <FormattedTextarea
              value={draft.notes}
              onChange={value => update({ notes: value })}
              placeholder="Context, agenda, or reminder details"
              minRows={4}
            />
          </Field>
        </div>
      )}

      {state.kind === 'note' && (
        <div className="grid gap-4">
          <Field name="Title" required error={submitted ? fieldErrors.title : undefined}>
            <Input
              value={draft.title}
              onChange={event =>
                update({ title: event.target.value })
              }
              placeholder={
                draft.noteType === 'bug'
                  ? 'Clear bug title'
                  : 'Note title'
              }
              className={INPUT}
            />
          </Field>
          <Field name="Type">
              <WorkSelect
                value={draft.workTypeId}
                onChange={value => {
                  update({ workTypeId: value, noteType: legacyNoteTypeForWorkType(value) });
                  setCustomErrors({});
                }}
                className={INPUT}
              >
                {draft.workTypeId && !workTypes.some(type => type.id === draft.workTypeId) ? <SelectItem value={draft.workTypeId}>Unavailable saved type</SelectItem> : null}
                {workTypes.filter(type => type.kind === 'note' && (!type.archived || type.id === draft.workTypeId)).map(type => <SelectItem key={type.id} value={type.id}>{type.name}{type.archived ? ' · Archived' : ''}</SelectItem>)}
              </WorkSelect>
            </Field>
          <div>
            <Field name="Image URL" error={submitted ? fieldErrors.image : undefined}>
              <Input
                value={draft.image}
                onChange={event => update({ image: event.target.value })}
                placeholder="https://example.com/image.jpg"
                aria-invalid={Boolean(submitted && fieldErrors.image)}
                className={INPUT}
              />
            </Field>
            <p className="mt-1.5 text-xs text-muted-foreground">Optional. Use an HTTPS image address.</p>
          </div>
          {draft.noteType !== 'bug' ? <Field name="Content">
                <FormattedTextarea
                  value={draft.content}
                  onChange={value => update({ content: value })}
                  placeholder="Write the useful part first…"
                  minRows={6}
                />
              </Field> : null}
          <EditorDetails key={draft.noteType === 'bug' ? 'incident' : 'note'} label={draft.noteType === 'bug' ? 'Incident details' : 'More details'} initialOpen={draft.noteType === 'bug'}>
          <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">

            <Field name="Project" required error={submitted ? fieldErrors.projectId : undefined}>
              <WorkSelect
                value={draft.projectId}
                onChange={value =>
                  update({ projectId: value })
                }
                className={INPUT}
              >
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </WorkSelect>
            </Field>
          </div>

          <Field name="Work category">
            <WorkSelect value={workCategorySelectionValue(draft.workCategoryId)} onChange={value => { const categoryId = workCategoryIdFromSelection(value); update({ workCategoryId: categoryId, workCategoryLabel: categories.find(category => category.id === categoryId)?.name || '' }); }} className={INPUT}>
              <SelectItem value={NO_WORK_CATEGORY_VALUE}>No category</SelectItem>
              {draft.workCategoryId && !categories.some(category => category.id === draft.workCategoryId) ? <SelectItem value={workCategorySelectionValue(draft.workCategoryId)}>{draft.workCategoryLabel || 'Unavailable saved category'}</SelectItem> : null}
              {categories.filter(category => !category.archived || category.id === draft.workCategoryId).map(category => <SelectItem key={category.id} value={workCategorySelectionValue(category.id)}>{category.name}{category.archived ? ' · Archived' : ''}</SelectItem>)}
            </WorkSelect>
          </Field>

          {draft.noteType === 'bug' ? (
            <>
              <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
                <Field name="Module">
                  <Input
                    value={draft.module}
                    onChange={event =>
                      update({ module: event.target.value })
                    }
                    placeholder="Area or feature"
                    className={INPUT}
                  />
                </Field>
                <Field name="Status">
                  <WorkSelect
                value={draft.status}
                onChange={value =>
                  update({ status: value })
                }
                className={INPUT}
              >
                    <SelectItem value="active">Open</SelectItem>
                    <SelectItem value="waiting">Waiting</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </WorkSelect>
                </Field>
              </div>

              <Field name="Description">
                <FormattedTextarea
                  value={draft.description}
                  onChange={value =>
                    update({ description: value })
                  }
                  placeholder="What happened?"
                  minRows={4}
                />
              </Field>

              <Field name="Steps to reproduce">
                <FormattedTextarea
                  value={draft.stepsToReproduce}
                  onChange={value =>
                    update({ stepsToReproduce: value })
                  }
                  placeholder={'1.\n2.\n3.'}
                  minRows={4}
                />
              </Field>

              <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
                <Field name="Expected result">
                  <Textarea
                    value={draft.expectedResult}
                    onChange={event =>
                      update({
                        expectedResult: event.target.value,
                      })
                    }
                    className={`${INPUT} min-h-28 resize-y`}
                  />
                </Field>
                <Field name="Actual result">
                  <Textarea
                    value={draft.actualResult}
                    onChange={event =>
                      update({
                        actualResult: event.target.value,
                      })
                    }
                    className={`${INPUT} min-h-28 resize-y`}
                  />
                </Field>
                <Field name="Severity">
                  <WorkSelect
                    value={draft.severity}
                    onChange={value =>
                      update({ severity: value })
                    }
                    className={INPUT}
                  >
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </WorkSelect>
                </Field>
                <Field name="Priority">
                  <WorkSelect
                value={draft.priority}
                onChange={value =>
                  update({ priority: value })
                }
                className={INPUT}
              >
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </WorkSelect>
                </Field>
              </div>

              <EditorDetails label="More incident details" initialOpen={hasIncidentDetails}>
                <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
                  <Field name="Environment">
                    <Input
                      value={draft.environment}
                      onChange={event =>
                        update({
                          environment: event.target.value,
                        })
                      }
                      placeholder="Staging, production…"
                      className={INPUT}
                    />
                  </Field>
                  <Field name="Browser / device">
                    <Input
                      value={draft.browserDevice}
                      onChange={event =>
                        update({
                          browserDevice: event.target.value,
                        })
                      }
                      placeholder="Chrome, Android…"
                      className={INPUT}
                    />
                  </Field>
                  <Field name="Evidence link" error={fieldErrors.screenshotLink}>
                    <Input
                      value={draft.screenshotLink}
                      onChange={event =>
                        update({
                          screenshotLink: event.target.value,
                        })
                      }
                      placeholder="Screenshot or recording URL"
                      className={INPUT}
                    />
                  </Field>
                  <Field name="Ticket link" error={fieldErrors.ticketLink}>
                    <Input
                      value={draft.ticketLink}
                      onChange={event =>
                        update({
                          ticketLink: event.target.value,
                        })
                      }
                      placeholder="Jira, Linear, GitHub…"
                      className={INPUT}
                    />
                  </Field>
                  <div className="@min-[28rem]/record-editor:col-span-2">
                    <Field name="Additional notes">
                      <FormattedTextarea
                        value={draft.extraNotes}
                        onChange={value =>
                          update({ extraNotes: value })
                        }
                        placeholder="Logs, edge cases, follow-up"
                        minRows={4}
                      />
                    </Field>
                  </div>
                </div>
              </EditorDetails>
            </>
          ) : (
            <>
              <div className="grid min-w-0 gap-4 @min-[28rem]/record-editor:grid-cols-2">
                <Field name="Note date" error={fieldErrors.date}>
                  <AdaptiveDatePicker
                    label="Note date"
                    value={draft.date}
                    onChange={value => update({ date: value })}
                    className={INPUT}
                  />
                </Field>
                <Field name="Status">
                  <WorkSelect
                value={draft.status}
                onChange={value =>
                  update({ status: value })
                }
                className={INPUT}
              >
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </WorkSelect>
                </Field>
              </div>

            </>
          )}

          <PinToggle
            checked={draft.pinned}
            onChange={checked => update({ pinned: checked })}
            labelText="Pin this note"
            description="Keep it above the rest of Notes."
          />
          </EditorDetails>
          {selectedWorkType?.fields.length ? <section className="grid gap-3 border-t border-border/55 pt-4"><div><h3 className="text-sm font-semibold">Additional fields</h3></div><WorkCustomFieldRenderer fields={selectedWorkType.fields} values={normalizeWorkCustomFieldValues(draft.customFieldValues) || {}} errors={customErrors} onChange={updateCustomField} /></section> : null}

        </div>
      )}
      </div>
    </Modal>
  );
}

function EditorDetails({ label, children, initialOpen = false }: { label: string; children: ReactNode; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="border-t border-border/55">
    <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</summary>
    <div className="grid min-w-0 gap-4 pt-2">{children}</div>
  </details>;
}

function Field({
  name,
  children,
  required = false,
  error,
}: {
  name: string;
  children: ReactNode;
  required?: boolean;
  error?: string;
}) {
  return <FormField label={name} required={required} error={error}>{children}</FormField>;
}

function PinToggle({
  checked,
  onChange,
  labelText,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelText: string;
  description: string;
}) {
  return (
    <label
      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2"
    >
      <span>
        <span className="block text-sm font-semibold">{labelText}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={labelText} />
    </label>
  );
}

function Modal({
  title,
  children,
  footer,
  dirty,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode | ((requestClose: () => void) => ReactNode);
  dirty: boolean;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: true, onClose });

  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      close();
    }
  }, [busy, dirty, close]);

  useOverlayLifecycle(true, requestClose, { containerRef: panel });

  return createPortal(
    <>
      <div data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'} className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          data-caizen-overlay-backdrop="true"
          className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          onClick={requestClose}
          disabled={busy}
          aria-label="Close dialog"
        />
        <section
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-busy={busy}
          aria-label={title}
          data-caizen-overlay-panel="true"
          style={{ maxHeight: 'min(85dvh, calc(min(var(--cz-vh, 100dvh), 100dvh) - var(--caizen-safe-top, 0px) - var(--caizen-safe-bottom, 0px) - 1rem))' }}
          className={`modal-card-enter mobile-modal-panel relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-2xl ${
            wide ? 'max-w-4xl' : 'max-w-2xl'
          }`}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="mobile-modal-body min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5">
            {children}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-4 pb-[max(1rem,var(--caizen-safe-bottom,env(safe-area-inset-bottom)))] sm:px-5">
            {typeof footer === 'function' ? footer(requestClose) : footer}
          </footer>
        </section>
      </div>

      <ConfirmDialog
        isOpen={confirmDiscard}
        title="Discard changes?"
        message="Your unsaved changes will be lost."
        confirmText="Discard changes"
        cancelText="Keep editing"
        isDangerous
        onConfirm={() => {
          setConfirmDiscard(false);
          close();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>,
    document.body,
  );
}

export function WorkHubQuickAddModal({
  isOpen,
  kind,
  onClose,
}: {
  isOpen: boolean;
  kind: 'project' | 'task' | 'note' | 'resource';
  onClose: () => void;
}) {
  const context = useAppContext();
  const profile = context.getCurrentProfile();
  const workItems = profile?.workItems || [];
  const workTypes = resolveWorkTypes(profile?.workTypes);
  const categories = profile?.moduleTaxonomies?.work || [];
  const projects = workItems.filter(
    item => item.type === 'project' && item.status !== 'archived',
  );
  const projectId = projects[0]?.id || '';

  const state: Exclude<EditorState, null> = { kind };
  const saveItem = (item: WorkItem, options: WorkEditorSaveOptions = {}) => {
    if (!profile) return;
    const normalized = normalizeWorkItemForPersistence(item);
    context.updateWorkItemsForProfile(
      profile.id,
      [normalized, ...workItems.filter(current => current.id !== normalized.id)],
      normalized.type === 'task'
        ? { workTaskId: normalized.id, enabled: Boolean(options.mirrorToLifeHub) }
        : undefined,
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <EditorDialog
      state={state}
      projects={projects}
      projectId={projectId}
      profileId={profile?.id || ''}
      workTypes={workTypes}
      categories={categories}
      onSaveItem={saveItem}
      onSaveEvent={() => undefined}
      onClose={onClose}
    />
  );
}
