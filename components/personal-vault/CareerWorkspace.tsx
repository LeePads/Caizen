'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Award, BookOpen, Edit3, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import CareerExportModal from '@/components/modals/CareerExportModal';
import CareerRecordModal from '@/components/modals/CareerRecordModal';
import { CaizenBottomSheet, AndroidAdaptiveSelect } from '@/components/native/android-design';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { PaginationControls } from '@/components/ui/section-kit';
import { ViewModeToggle, type ViewMode } from '@/components/ui/view-mode-toggle';
import { ResilientImage } from '@/components/media/ResilientImage';
import { useAppContext } from '@/lib/context';
import { getCareerCredentialExpiryStatus } from '@/lib/career/expiry';
import { notifyLegacy } from '@/lib/feedback/notify';
import type { CareerCourse, CareerCredential, CareerSkill, PersonalVaultItem } from '@/lib/types';

type Mode = 'skill' | 'course' | 'credential';
type View = 'all' | 'skills' | 'courses' | 'certificates' | 'legacy';
type PrimaryView = Exclude<View, 'legacy'>;
type RecordTypeFilter = 'all' | Mode;
type SortMode = 'recent' | 'title' | 'expiry';
type CareerRecord = CareerSkill | CareerCourse | CareerCredential;
type CareerRecordEntry = {
  mode: Mode;
  record: CareerRecord;
  title: string;
  createdAt: number;
};

const EMPTY_SKILLS: CareerSkill[] = [];
const EMPTY_COURSES: CareerCourse[] = [];
const EMPTY_CREDENTIALS: CareerCredential[] = [];
const TAB_ORDER: PrimaryView[] = ['all', 'skills', 'courses', 'certificates'];
const TAB_LABELS: Record<PrimaryView, string> = {
  all: 'All',
  skills: 'Skills',
  courses: 'Courses',
  certificates: 'Certificates',
};
const MODE_LABELS: Record<Mode, string> = {
  skill: 'Skill',
  course: 'Course',
  credential: 'Certificate',
};

function recordCreatedAt(record: CareerRecord) {
  const value = new Date(record.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function makeRecordEntry(mode: Mode, record: CareerRecord): CareerRecordEntry {
  const title = 'name' in record ? record.name : record.title;
  return { mode, record, title, createdAt: recordCreatedAt(record) };
}

export default function CareerWorkspace({
  legacyItems,
  currentLegacyItems,
  androidPresentation = false,
  renderLegacyItem,
  requestedRecordId,
  requestedRecordSignal = 0,
  onRequestedRecordConsumed,
}: {
  legacyItems: PersonalVaultItem[];
  currentLegacyItems: PersonalVaultItem[];
  androidPresentation?: boolean;
  renderLegacyItem?: (item: PersonalVaultItem) => ReactNode;
  requestedRecordId?: string;
  requestedRecordSignal?: number;
  onRequestedRecordConsumed?: (signal: number) => void;
}) {
  const context = useAppContext();
  const profile = context.getCurrentProfile();
  const skills = useMemo(() => profile?.careerSkills || EMPTY_SKILLS, [profile?.careerSkills]);
  const courses = useMemo(() => profile?.careerCourses || EMPTY_COURSES, [profile?.careerCourses]);
  const credentials = useMemo(() => profile?.careerCredentials || EMPTY_CREDENTIALS, [profile?.careerCredentials]);
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [recordType, setRecordType] = useState<RecordTypeFilter>('all');
  const [level, setLevel] = useState('all');
  const [courseStatus, setCourseStatus] = useState('all');
  const [expiry, setExpiry] = useState('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [recordLayout, setRecordLayout] = useState<ViewMode>('list');
  const [showAndroidFilters, setShowAndroidFilters] = useState(false);
  const [recordMode, setRecordMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<CareerRecord>();
  const [readOnly, setReadOnly] = useState(false);
  const consumedRequest = useRef<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ mode: Mode; id: string; title: string } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const query = search.trim().toLocaleLowerCase();
  const tabRefs = useRef<Partial<Record<PrimaryView, HTMLButtonElement | null>>>({});

  const matches = useCallback((values: unknown[]) =>
    !query || values.filter(Boolean).some(value => String(value).toLocaleLowerCase().includes(query)),
  [query]);
  const searchedSkills = useMemo(() => skills.filter(item => matches([item.name, item.area, item.notes])), [matches, skills]);
  const searchedCourses = useMemo(() => courses.filter(item => matches([item.title, item.provider, item.notes])), [courses, matches]);
  const searchedCertificates = useMemo(() => credentials.filter(item => matches([item.title, item.issuer, item.credentialId, item.notes])), [credentials, matches]);
  const visibleSkills = useMemo(() => searchedSkills
    .filter(item => level === 'all' || item.level === level)
    .sort((a, b) => sort === 'title' ? a.name.localeCompare(b.name) : recordCreatedAt(b) - recordCreatedAt(a)),
  [level, searchedSkills, sort]);
  const visibleCourses = useMemo(() => searchedCourses
    .filter(item => courseStatus === 'all' || item.status === courseStatus)
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : recordCreatedAt(b) - recordCreatedAt(a)),
  [courseStatus, searchedCourses, sort]);
  const visibleCertificates = useMemo(() => searchedCertificates
    .filter(item => expiry === 'all' || getCareerCredentialExpiryStatus(item) === expiry)
    .sort((a, b) => sort === 'expiry'
      ? (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
      : sort === 'title'
        ? a.title.localeCompare(b.title)
        : recordCreatedAt(b) - recordCreatedAt(a)),
  [expiry, searchedCertificates, sort]);
  const allRecords = useMemo(() => [
    ...searchedSkills.map(item => makeRecordEntry('skill', item)),
    ...searchedCourses.map(item => makeRecordEntry('course', item)),
    ...searchedCertificates.map(item => makeRecordEntry('credential', item)),
  ].filter(item => recordType === 'all' || item.mode === recordType)
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : b.createdAt - a.createdAt),
  [recordType, searchedCertificates, searchedCourses, searchedSkills, sort]);
  const visibleLegacyItems = useMemo(() => currentLegacyItems
    .filter(item => matches([item.title, item.subType, item.issuer, item.notes]))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [currentLegacyItems, matches, sort]);

  const pageSize = 20;
  const activeListCount = view === 'all' ? allRecords.length
    : view === 'skills' ? visibleSkills.length
      : view === 'courses' ? visibleCourses.length
        : view === 'certificates' ? visibleCertificates.length
          : visibleLegacyItems.length;
  const totalPages = Math.max(1, Math.ceil(activeListCount / pageSize));
  const pageStart = (page - 1) * pageSize;
  const paginatedAll = allRecords.slice(pageStart, pageStart + pageSize);
  const paginatedSkills = visibleSkills.slice(pageStart, pageStart + pageSize);
  const paginatedCourses = visibleCourses.slice(pageStart, pageStart + pageSize);
  const paginatedCertificates = visibleCertificates.slice(pageStart, pageStart + pageSize);
  const paginatedLegacyItems = visibleLegacyItems.slice(pageStart, pageStart + pageSize);

  useEffect(() => setPage(1), [profile?.id, view, query, recordType, level, courseStatus, expiry, sort]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const expiring = searchedCertificates
    .filter(() => recordType === 'all' || recordType === 'credential')
    .filter(item => getCareerCredentialExpiryStatus(item) === 'Expiring soon')
    .sort((a, b) => (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const current = useMemo(() => {
    if (view === 'skills') return { skills: visibleSkills, courses: [], credentials: [], legacyItems: [] };
    if (view === 'courses') return { skills: [], courses: visibleCourses, credentials: [], legacyItems: [] };
    if (view === 'certificates') return { skills: [], courses: [], credentials: visibleCertificates, legacyItems: [] };
    if (view === 'legacy') return { skills: [], courses: [], credentials: [], legacyItems: visibleLegacyItems };
    return {
      skills: allRecords.filter(item => item.mode === 'skill').map(item => item.record as CareerSkill),
      courses: allRecords.filter(item => item.mode === 'course').map(item => item.record as CareerCourse),
      credentials: allRecords.filter(item => item.mode === 'credential').map(item => item.record as CareerCredential),
      legacyItems: [],
    };
  }, [allRecords, view, visibleCertificates, visibleCourses, visibleLegacyItems, visibleSkills]);
  const currentCount = current.skills.length + current.courses.length + current.credentials.length + current.legacyItems.length;
  const currentViewLabel = view === 'legacy' ? 'Saved Career references' : view === 'all' ? 'All Career records' : TAB_LABELS[view];
  const relevantFilterSummary = useMemo(() => [
    query ? `Search: ${search.trim()}` : '',
    view === 'all' && recordType !== 'all' ? `Type: ${MODE_LABELS[recordType]}` : '',
    view === 'skills' && level !== 'all' ? `Skill level: ${level}` : '',
    view === 'courses' && courseStatus !== 'all' ? `Course status: ${courseStatus}` : '',
    view === 'certificates' && expiry !== 'all' ? `Expiry: ${expiry}` : '',
  ].filter(Boolean).join(' · ') || 'No active filters', [courseStatus, expiry, level, query, recordType, search, view]);
  const currentSummary = `${currentViewLabel}${relevantFilterSummary === 'No active filters' ? '' : ` · ${relevantFilterSummary}`} · ${currentCount.toLocaleString()} ${currentCount === 1 ? 'record' : 'records'}`;
  const hasRelevantFilter = relevantFilterSummary !== 'No active filters';
  const activeAndroidFilterCount = Number(view === 'all' && recordType !== 'all')
    + Number(view === 'skills' && level !== 'all')
    + Number(view === 'courses' && courseStatus !== 'all')
    + Number(view === 'certificates' && expiry !== 'all')
    + Number(sort !== 'recent');

  const clearFilters = () => {
    setRecordType('all');
    setLevel('all');
    setCourseStatus('all');
    setExpiry('all');
    setSort('recent');
  };

  const saveRecord = (record: CareerRecord) => {
    if (recordMode === 'skill') {
      if (editing) context.updateCareerSkill(record.id, record as Partial<Omit<CareerSkill, 'id' | 'createdAt'>>);
      else context.addCareerSkill(record as Omit<CareerSkill, 'id' | 'createdAt'> & { id?: string });
    } else if (recordMode === 'course') {
      if (editing) context.updateCareerCourse(record.id, record as Partial<Omit<CareerCourse, 'id' | 'createdAt'>>);
      else context.addCareerCourse(record as Omit<CareerCourse, 'id' | 'createdAt'> & { id?: string });
    } else if (recordMode === 'credential') {
      if (editing) context.updateCareerCredential(record.id, record as Partial<Omit<CareerCredential, 'id' | 'createdAt'>>);
      else context.addCareerCredential(record as Omit<CareerCredential, 'id' | 'createdAt'> & { id?: string });
    }
    notifyLegacy({ title: `${MODE_LABELS[recordMode || 'skill']} saved`, variant: 'success' });
    setRecordMode(null);
    setEditing(undefined);
  };

  const openAdd = (mode: Mode) => { setAddMenuOpen(false); setReadOnly(false); setEditing(undefined); setRecordMode(mode); };
  const openEdit = (mode: Mode, record: CareerRecord) => { setReadOnly(false); setRecordMode(mode); setEditing(record); };
  const openDetail = (mode: Mode, record: CareerRecord) => { setReadOnly(true); setRecordMode(mode); setEditing(record); };
  useEffect(() => {
    if (!requestedRecordId || consumedRequest.current === requestedRecordSignal) return;
    const skill = skills.find(item => item.id === requestedRecordId);
    const course = courses.find(item => item.id === requestedRecordId);
    const certificate = credentials.find(item => item.id === requestedRecordId);
    if (!skill && !course && !certificate) return;
    consumedRequest.current = requestedRecordSignal;
    setReadOnly(true);
    setRecordMode(skill ? 'skill' : course ? 'course' : 'credential');
    setEditing(skill || course || certificate);
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [courses, credentials, onRequestedRecordConsumed, requestedRecordId, requestedRecordSignal, skills]);
  const remove = (mode: Mode, id: string) => {
    const record = mode === 'skill' ? skills.find(item => item.id === id)
      : mode === 'course' ? courses.find(item => item.id === id)
        : credentials.find(item => item.id === id);
    setPendingDelete({ mode, id, title: record ? ('name' in record ? record.name : record.title) : 'this record' });
  };
  const selectTab = (next: PrimaryView) => {
    if (next !== 'certificates' && sort === 'expiry') setSort('recent');
    setView(next);
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: PrimaryView) => {
    const index = TAB_ORDER.indexOf(currentTab);
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % TAB_ORDER.length
      : event.key === 'ArrowLeft' ? (index - 1 + TAB_ORDER.length) % TAB_ORDER.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? TAB_ORDER.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = TAB_ORDER[nextIndex];
    selectTab(next);
    window.requestAnimationFrame(() => tabRefs.current[next]?.focus());
  };

  const typeFilter = <AndroidAdaptiveSelect
    label="Record type"
    value={recordType}
    options={[{ value: 'all', label: 'All types' }, { value: 'skill', label: 'Skills' }, { value: 'course', label: 'Courses' }, { value: 'credential', label: 'Certificates' }]}
    onChange={value => setRecordType(value as RecordTypeFilter)}
    searchable={false}
  />;
  const skillFilter = <AndroidAdaptiveSelect label="Skill level" value={level} options={[{ value: 'all', label: 'All levels' }, ...['Learning', 'Familiar', 'Proficient', 'Advanced'].map(value => ({ value, label: value }))]} onChange={setLevel} searchable={false} />;
  const courseFilter = <AndroidAdaptiveSelect label="Course status" value={courseStatus} options={[{ value: 'all', label: 'All statuses' }, ...['Planned', 'In progress', 'Completed'].map(value => ({ value, label: value }))]} onChange={setCourseStatus} searchable={false} />;
  const certificateFilter = <AndroidAdaptiveSelect label="Certificate expiry" value={expiry} options={[{ value: 'all', label: 'Any expiry status' }, ...['Valid', 'Expiring soon', 'Expired', 'No expiry'].map(value => ({ value, label: value }))]} onChange={setExpiry} searchable={false} />;
  const sortFilter = <AndroidAdaptiveSelect label="Sort" value={sort} options={[{ value: 'recent', label: 'Recent' }, { value: 'title', label: 'Title' }, ...(view === 'certificates' ? [{ value: 'expiry', label: 'Expiry' }] : [])]} onChange={value => setSort(value as SortMode)} searchable={false} />;
  const viewFilters = <>
    {view === 'all' ? typeFilter : null}
    {view === 'skills' ? skillFilter : null}
    {view === 'courses' ? courseFilter : null}
    {view === 'certificates' ? certificateFilter : null}
    {sortFilter}
  </>;

  return <section className="career-workspace space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-48"><h2 className="text-section-title">Career</h2><p className="mt-1 text-body-sm text-muted-foreground">Track learning and keep certificates ready to use.</p></div>
      <div className="flex flex-wrap gap-2">
        {view === 'legacy' ? <Button type="button" variant="outline" onClick={() => selectTab('all')} className="min-h-11">Back to Career</Button> : null}
        <AddCareerRecordAction androidPresentation={androidPresentation} open={addMenuOpen} onOpenChange={setAddMenuOpen} onSelect={openAdd} />
        <Button type="button" variant="outline" onClick={() => setExportOpen(true)} className="min-h-11">Export Career</Button>
        {legacyItems.length > 0 && view !== 'legacy' ? <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setView('legacy'); if (sort === 'expiry') setSort('recent'); }}>Saved references ({legacyItems.length})</Button> : null}
      </div>
    </div>

    {view !== 'legacy' ? <div className="mt-4 flex max-w-full gap-1 overflow-x-auto border-b border-border/60" role="tablist" aria-label="Career workspace views" aria-orientation="horizontal">
      {TAB_ORDER.map(value => <button key={value} ref={element => { tabRefs.current[value] = element; }} type="button" role="tab" id={`career-tab-${value}`} aria-selected={view === value} aria-controls={`career-panel-${value}`} tabIndex={view === value ? 0 : -1} onClick={() => selectTab(value)} onKeyDown={event => onTabKeyDown(event, value)} className={`caizen-tab min-h-11 shrink-0 rounded-t-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${view === value ? 'caizen-tab-active text-foreground' : 'text-muted-foreground'}`}>{TAB_LABELS[value]}</button>)}
    </div> : <div className="mt-4 border-b border-border/60 pb-3"><h4 id="career-legacy-heading" className="text-card-title">Saved Career references</h4><p className="mt-1 text-xs text-muted-foreground">Links, notes, and documents saved as Career references. Open or edit them here.</p></div>}

    {view === 'all' ? <p className="text-sm tabular-nums text-muted-foreground">{`${skills.length.toLocaleString()} ${skills.length === 1 ? 'skill' : 'skills'} · ${courses.filter(item => item.status === 'Completed').length.toLocaleString()} ${courses.filter(item => item.status === 'Completed').length === 1 ? 'completed course' : 'completed courses'} · ${credentials.length.toLocaleString()} ${credentials.length === 1 ? 'certificate' : 'certificates'}`}</p> : null}

    {androidPresentation ? <>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <SearchField className="w-full" aria-label="Search Career records" placeholder="Search Career records" value={search} onChange={setSearch} />
        <Button type="button" variant="outline" onClick={() => setShowAndroidFilters(true)} aria-label={`Career filters${activeAndroidFilterCount ? `, ${activeAndroidFilterCount} active` : ''}`} className="min-h-11">Filters{activeAndroidFilterCount ? ` (${activeAndroidFilterCount})` : ''}</Button>
      </div>
      <CaizenBottomSheet open={showAndroidFilters} title="Career filters" description="Choose which career records to show." onClose={() => setShowAndroidFilters(false)} fullHeight>
        <div className="space-y-3" data-android-career-filters="true">{viewFilters}<button type="button" onClick={clearFilters} disabled={!activeAndroidFilterCount} className="min-h-11 w-full rounded-xl border border-border/60 px-3 text-sm font-bold text-muted-foreground disabled:opacity-50">Clear filters</button></div>
      </CaizenBottomSheet>
    </> : <div className={`mt-4 grid grid-cols-2 gap-2 ${view === "legacy" ? "sm:grid-cols-[minmax(0,1fr)_9rem]" : "lg:grid-cols-[minmax(0,1fr)_10rem_9rem]"}`}>
      <SearchField className={`col-span-2 min-w-0 w-full ${view === "legacy" ? "sm:col-span-1" : "lg:col-span-1"}`} aria-label="Search Career records" placeholder="Search Career records" value={search} onChange={setSearch} />
      {viewFilters}
    </div>}

    {hasRelevantFilter ? <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm"><p className="break-words text-muted-foreground">{relevantFilterSummary}</p><Button type="button" variant="ghost" onClick={() => { setSearch(''); clearFilters(); }} className="min-h-11">Clear search and filters</Button></div> : null}

    <CareerPanel value="all" active={view === 'all'}>
      {expiring.length ? <section className="mt-5" aria-labelledby="career-expiring-title"><div className="flex items-baseline justify-between gap-3"><h4 id="career-expiring-title" className="text-card-title">Certificates expiring soon</h4><span className="text-metadata tabular-nums text-muted-foreground">{expiring.length}</span></div><div className="mt-2">{expiring.slice(0, 4).map(item => <CareerRecordRow key={item.id} mode="credential" item={item} onEdit={openEdit} onView={openDetail} onDelete={remove} />)}</div></section> : null}
      <section className="mt-5"><div className="flex items-baseline justify-between gap-3"><h4 className="text-card-title">{sort === 'title' ? 'Records by title' : 'Recent records'}</h4><span className="text-metadata tabular-nums text-muted-foreground">{allRecords.length}</span></div>{paginatedAll.length ? <div className="mt-2">{paginatedAll.map(entry => <CareerRecordRow key={`${entry.mode}-${entry.record.id}`} mode={entry.mode} item={entry.record} onEdit={openEdit} onView={openDetail} onDelete={remove} />)}</div> : <div className="py-6"><p className="text-sm font-bold">{skills.length + courses.length + credentials.length ? 'No matching Career records' : 'No Career records yet'}</p><p className="mt-1 text-sm text-muted-foreground">{skills.length + courses.length + credentials.length ? 'Try another search or choose All types.' : 'Add a skill, course, or certificate to start tracking your career.'}</p></div>}</section>
      {allRecords.length > pageSize ? <PaginationControls page={page} totalPages={totalPages} totalItems={allRecords.length} pageSize={pageSize} onPageChange={setPage} collectionLabel="Career records" /> : null}
    </CareerPanel>
    <CareerPanel value="skills" active={view === 'skills'}><RecordList title="Skills" items={paginatedSkills} sourceCount={skills.length} emptyLabel="No skills yet" mode="skill" onEdit={openEdit} onView={openDetail} onDelete={remove} />{visibleSkills.length > pageSize ? <PaginationControls page={page} totalPages={totalPages} totalItems={visibleSkills.length} pageSize={pageSize} onPageChange={setPage} collectionLabel="Career skills" /> : null}</CareerPanel>
    <CareerPanel value="courses" active={view === 'courses'}><RecordList title="Courses" items={paginatedCourses} sourceCount={courses.length} emptyLabel="No courses yet" mode="course" layout={recordLayout} onLayoutChange={setRecordLayout} onEdit={openEdit} onView={openDetail} onDelete={remove} />{visibleCourses.length > pageSize ? <PaginationControls page={page} totalPages={totalPages} totalItems={visibleCourses.length} pageSize={pageSize} onPageChange={setPage} collectionLabel="Career courses" /> : null}</CareerPanel>
    <CareerPanel value="certificates" active={view === 'certificates'}><RecordList title="Certificates" items={paginatedCertificates} sourceCount={credentials.length} emptyLabel="No certificates yet" mode="credential" layout={recordLayout} onLayoutChange={setRecordLayout} onEdit={openEdit} onView={openDetail} onDelete={remove} />{visibleCertificates.length > pageSize ? <PaginationControls page={page} totalPages={totalPages} totalItems={visibleCertificates.length} pageSize={pageSize} onPageChange={setPage} collectionLabel="Career certificates" /> : null}</CareerPanel>
    <CareerPanel value="legacy" active={view === 'legacy'}><section className="space-y-0">{paginatedLegacyItems.length ? paginatedLegacyItems.map(item => <div key={item.id}>{renderLegacyItem ? renderLegacyItem(item) : <p className="break-words text-sm">{item.title}</p>}</div>) : <p className="text-sm text-muted-foreground">{legacyItems.length ? 'No saved references match this search. Clear the search to see all references.' : 'No saved Career references yet.'}</p>}</section>{visibleLegacyItems.length > pageSize ? <PaginationControls page={page} totalPages={totalPages} totalItems={visibleLegacyItems.length} pageSize={pageSize} onPageChange={setPage} collectionLabel="Saved Career references" /> : null}</CareerPanel>

    {recordMode && profile ? <CareerRecordModal key={`${recordMode}-${editing?.id || 'new'}-${readOnly ? 'view' : 'edit'}`} readOnly={readOnly} onEdit={() => setReadOnly(false)} mode={recordMode} profileId={profile.id} initial={editing} skills={skills} courses={courses} onClose={() => { setRecordMode(null); setEditing(undefined); }} onSave={saveRecord} /> : null}
    {exportOpen && profile ? <CareerExportModal profileName={profile.name || 'Profile'} skills={skills} courses={courses} credentials={credentials} legacyItems={legacyItems} current={current} currentSummary={currentSummary} currentFilterSummary={relevantFilterSummary} initialScope={view === 'all' && !hasRelevantFilter ? 'all' : 'current'} onClose={() => setExportOpen(false)} /> : null}
    <ConfirmDialog isOpen={Boolean(pendingDelete)} title="Move Career record to Trash?" message={pendingDelete ? `“${pendingDelete.title}” will move to Trash. You can restore it for 30 days.` : 'This record will move to Trash. You can restore it for 30 days.'} confirmText="Move to Trash" cancelText="Cancel" isDangerous onCancel={() => setPendingDelete(null)} onConfirm={() => { if (pendingDelete?.mode === 'skill') context.deleteCareerSkill(pendingDelete.id); else if (pendingDelete?.mode === 'course') context.deleteCareerCourse(pendingDelete.id); else if (pendingDelete) context.deleteCareerCredential(pendingDelete.id); setPendingDelete(null); }} />
  </section>;
}

function AddCareerRecordAction({ androidPresentation, open, onOpenChange, onSelect }: { androidPresentation: boolean; open: boolean; onOpenChange: (open: boolean) => void; onSelect: (mode: Mode) => void }) {
  const options: Array<{ mode: Mode; label: string; icon: ReactNode }> = [{ mode: 'skill', label: 'Skill', icon: <ShieldCheck className="size-4" /> }, { mode: 'course', label: 'Course', icon: <BookOpen className="size-4" /> }, { mode: 'credential', label: 'Certificate', icon: <Award className="size-4" /> }];
  if (androidPresentation) return <><Button type="button" onClick={() => onOpenChange(true)} className="min-h-11"><Plus className="mr-2 size-4" />Add</Button><CaizenBottomSheet open={open} title="Add Career record" description="Choose what you want to add." onClose={() => onOpenChange(false)}><div className="grid gap-2">{options.map(option => <button key={option.mode} type="button" className="flex min-h-12 items-center gap-3 rounded-xl border border-border/60 px-3 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" onClick={() => onSelect(option.mode)}>{option.icon}{option.label}</button>)}</div></CaizenBottomSheet></>;
  return <DropdownMenu open={open} onOpenChange={onOpenChange}><DropdownMenuTrigger asChild><Button type="button" className="min-h-11"><Plus className="mr-2 size-4" />Add</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-48">{options.map(option => <DropdownMenuItem key={option.mode} className="min-h-11 font-bold" onSelect={() => onSelect(option.mode)}>{option.icon}{option.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function CareerPanel({ value, active, children }: { value: View; active: boolean; children: ReactNode }) { return <div id={`career-panel-${value}`} role="tabpanel" aria-labelledby={value === 'legacy' ? 'career-legacy-heading' : `career-tab-${value}`} tabIndex={0} hidden={!active} data-state={active ? 'active' : 'inactive'} className="caizen-tab-panel-motion">{active ? children : null}</div>; }
function EmptyCareerList({ count, label, emptyLabel, mode }: { count: number; label: string; emptyLabel: string; mode: Mode }) { return <div className="py-6"><p className="text-sm font-bold">{count ? `No matching ${label.toLocaleLowerCase()}` : emptyLabel}</p><p className="mt-1 text-sm text-muted-foreground">{count ? 'Clear the search or change this view’s filter.' : `Use Add above to create your first ${MODE_LABELS[mode].toLocaleLowerCase()}.`}</p></div>; }
function CareerRecordRow({ mode, item, onEdit, onView, onDelete }: { mode: Mode; item: CareerRecord; onEdit: (mode: Mode, item: CareerRecord) => void; onView: (mode: Mode, item: CareerRecord) => void; onDelete: (mode: Mode, id: string) => void }) {
  const label = 'name' in item ? item.name : item.title;
  const detail = mode === 'skill' ? [(item as CareerSkill).area, (item as CareerSkill).level].filter(Boolean).join(' · ')
    : mode === 'course' ? [(item as CareerCourse).provider, (item as CareerCourse).status, (item as CareerCourse).attachmentAssetId ? 'Document attached' : ''].filter(Boolean).join(' · ')
      : [((item as CareerCredential).issuer || ''), getCareerCredentialExpiryStatus(item as CareerCredential), (item as CareerCredential).proofAssetId ? 'Proof attached' : ''].filter(Boolean).join(' · ');
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border/50 py-3"><div className="min-w-0"><button type="button" onClick={() => onView(mode, item)} className="min-h-11 break-words [overflow-wrap:anywhere] text-left text-card-title hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`View ${label}`}>{label}</button><p className="break-words [overflow-wrap:anywhere] text-metadata text-muted-foreground">{detail}</p></div><div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="icon-lg" className="career-row-action" aria-label={`Edit ${label}`} onClick={() => onEdit(mode, item)}><Edit3 className="size-4" /></Button><Button type="button" variant="ghost" size="icon-lg" className="career-row-action" aria-label={`Move ${label} to Trash`} onClick={() => onDelete(mode, item.id)}><Trash2 className="size-4" /></Button></div></div>;
}
function CareerRecordCard({ mode, item, onEdit, onView, onDelete }: { mode: 'course' | 'credential'; item: CareerCourse | CareerCredential; onEdit: (mode: Mode, item: CareerRecord) => void; onView: (mode: Mode, item: CareerRecord) => void; onDelete: (mode: Mode, id: string) => void }) {
  const label = item.title;
  const image = mode === 'course' ? (item as CareerCourse).image : (item as CareerCredential).image;
  const detail = mode === 'course'
    ? [(item as CareerCourse).provider, (item as CareerCourse).status].filter(Boolean).join(' · ')
    : [(item as CareerCredential).issuer, getCareerCredentialExpiryStatus(item as CareerCredential)].filter(Boolean).join(' · ');
  const hasAttachment = mode === 'course'
    ? Boolean((item as CareerCourse).attachmentAssetId)
    : Boolean((item as CareerCredential).proofAssetId);
  const Icon = mode === 'course' ? BookOpen : Award;
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
    <button type="button" onClick={() => onView(mode, item)} className="group relative aspect-[16/9] w-full overflow-hidden bg-muted/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring" aria-label={`View ${label}`}>
      {image ? <ResilientImage src={image} alt={`${label} image`} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" fallback={<div className="grid size-full place-items-center text-muted-foreground"><Icon className="size-8" /></div>} /> : <div className="grid size-full place-items-center text-muted-foreground"><Icon className="size-8" /></div>}
    </button>
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
      <div className="min-w-0"><button type="button" onClick={() => onView(mode, item)} className="min-h-11 break-words text-left text-card-title hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{label}</button><p className="break-words text-metadata text-muted-foreground">{detail || (mode === 'course' ? 'Course' : 'Certificate')}</p>{hasAttachment ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{mode === 'course' ? 'Supporting document attached' : 'Proof document attached'}</p> : null}</div>
      <div className="mt-auto flex justify-end gap-1 border-t border-border/50 pt-2"><Button type="button" variant="ghost" size="icon-lg" className="career-row-action" aria-label={`Edit ${label}`} onClick={() => onEdit(mode, item)}><Edit3 className="size-4" /></Button><Button type="button" variant="ghost" size="icon-lg" className="career-row-action" aria-label={`Move ${label} to Trash`} onClick={() => onDelete(mode, item.id)}><Trash2 className="size-4" /></Button></div>
    </div>
  </article>;
}

function RecordList({ title, items, sourceCount, emptyLabel, mode, layout = 'list', onLayoutChange, onEdit, onView, onDelete }: { title: string; items: CareerRecord[]; sourceCount: number; emptyLabel: string; mode: Mode; layout?: ViewMode; onLayoutChange?: (value: ViewMode) => void; onEdit: (mode: Mode, item: CareerRecord) => void; onView: (mode: Mode, item: CareerRecord) => void; onDelete: (mode: Mode, id: string) => void }) {
  const canSwitchLayout = mode === 'course' || mode === 'credential';
  return <div className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-card-title">{title}</h4><div className="flex items-center gap-3"><span className="text-metadata tabular-nums text-muted-foreground">{items.length} shown</span>{canSwitchLayout && onLayoutChange ? <ViewModeToggle value={layout} onChange={onLayoutChange} label={`${title} view`} /> : null}</div></div>
    {items.length ? layout === 'grid' && canSwitchLayout
      ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <CareerRecordCard key={item.id} mode={mode} item={item as CareerCourse | CareerCredential} onEdit={onEdit} onView={onView} onDelete={onDelete} />)}</div>
      : <div className="mt-2">{items.map(item => <CareerRecordRow key={item.id} mode={mode} item={item} onEdit={onEdit} onView={onView} onDelete={onDelete} />)}</div>
      : <EmptyCareerList count={sourceCount} label={title} emptyLabel={emptyLabel} mode={mode} />}
  </div>;
}
