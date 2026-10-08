"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CheckSquare,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Link as LinkIcon,
  MoreHorizontal,
  MoreVertical,
  Music,
  Pin,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";

import ConfirmDialog from "@/components/common/ConfirmDialog";
import { OverflowTooltip } from "@/components/common/OverflowTooltip";
import { useCollectionReveal } from "@/hooks/use-collection-reveal";
import { openTaxonomyHub } from "@/components/common/taxonomy-hub-events";
import { EntryActionSheet, type EntryAction } from "@/components/common/EntryActionSheet";
import { ResponsiveControlStrip } from "@/components/common/ResponsiveControlStrip";
import PersonalVaultModal, {
  type PersonalVaultDraft,
} from "@/components/modals/PersonalVaultModal";
import CareerWorkspace from "@/components/personal-vault/CareerWorkspace";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Combobox } from "@/components/ui/combobox";
import { FilterBar, FilterChip } from "@/components/ui/collection-controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { PaginationControls } from "@/components/ui/section-kit";
import { AndroidAdaptiveSelect, CaizenBottomSheet } from "@/components/native/android-design";
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { useAppContext } from "@/lib/context";
import { parseLocalDateKey, toLocalDateKey } from "@/lib/lifehub/date-utils";
import {
  useModuleTaxonomy,
} from "@/lib/module-taxonomy";
import {
  normalizePersonalVaultItem,
  normalizePersonalVaultTaxonomy,
  personalVaultTaxonomySignature,
} from "@/lib/personal-vault/normalization";
import {
  completeLegacyVaultTaxonomyMigration,
  markLegacyVaultTaxonomyPending,
  prepareLegacyVaultTaxonomyMigration,
  readLegacyVaultTaxonomy,
} from "@/lib/personal-vault/legacy-taxonomy";
import { normalizeExternalWebUrl, openExternalLink } from "@/lib/native/open-link";
import {
  PERSONAL_VAULT_CATEGORY_OPTIONS,
  PERSONAL_VAULT_TAXONOMY_DEFAULTS,
  personalVaultCategoryLabel,
} from "@/lib/personal-vault/taxonomy";
import { searchPersonalVault, vaultNotePreview } from "@/lib/personal-vault/search";
import type { PersonalVaultItem, PersonalVaultType } from "@/lib/types";

type VaultSectionId = PersonalVaultType;
type ViewMode = "grid" | "list";
type SortMode = "pinned" | "newest" | "title" | "date";
type SmartFilter = "all" | "pinned" | "attention";
const SECTION_ORDER: VaultSectionId[] = ["document", "career", "creative", "install", "links"];

type SectionConfig = {
  title: string;
  singular: string;
  description: string;
  emptyDescription: string;
  accent: string;
  icon: typeof FileText;
  defaultSubtype: string;
  categories: Array<{ id: string; label: string }>;
  defaultView: ViewMode;
};

const SECTION_CONFIG: Record<VaultSectionId, SectionConfig> = {
  document: {
    title: "Document references",
    singular: "Document reference",
    description:
      "IDs, records, receipts, warranties, and important document references.",
    emptyDescription:
      "Keep important records and document references easy to find.",
    accent: "text-muted-foreground",
    icon: FileText,
    defaultSubtype: "identity-government",
    defaultView: "list",
    categories: PERSONAL_VAULT_CATEGORY_OPTIONS.document,
  },
  career: {
    title: "Career",
    singular: "Career Item",
    description:
      "Resumes, certificates, professional references, and career resources.",
    emptyDescription:
      "Keep career materials and professional references easy to find.",
    accent: "text-muted-foreground",
    icon: BriefcaseBusiness,
    defaultSubtype: "resume-portfolio",
    defaultView: "list",
    categories: PERSONAL_VAULT_CATEGORY_OPTIONS.career,
  },
  creative: {
    title: "Creative",
    singular: "Creative Item",
    description:
      "Creative references, assets, inspiration, and useful resources.",
    emptyDescription:
      "Keep creative references, assets, and inspiration together.",
    accent: "text-muted-foreground",
    icon: Music,
    defaultSubtype: "recordings",
    defaultView: "grid",
    categories: PERSONAL_VAULT_CATEGORY_OPTIONS.creative,
  },
  install: {
    title: "Install Kit",
    singular: "Install Item",
    description:
      "Software, drivers, developer tools, and setup resources.",
    emptyDescription:
      "Save the software, drivers, and setup resources you use when configuring a device.",
    accent: "text-muted-foreground",
    icon: CheckSquare,
    defaultSubtype: "essential-apps",
    defaultView: "list",
    categories: PERSONAL_VAULT_CATEGORY_OPTIONS.install,
  },
  links: {
    title: "Links",
    singular: "Link",
    description:
      "Websites, portals, cloud resources, and shortcuts.",
    emptyDescription:
      "Keep useful websites and shortcuts you want to find again.",
    accent: "text-muted-foreground",
    icon: LinkIcon,
    defaultSubtype: "favorites-shortcuts",
    defaultView: "list",
    categories: PERSONAL_VAULT_CATEGORY_OPTIONS.links,
  },
};

function categoryLabel(type: PersonalVaultType, value: string) {
  return personalVaultCategoryLabel(type, value);
}

function createDraft(type: PersonalVaultType): PersonalVaultDraft {
  return {
    type,
    subType: SECTION_CONFIG[type].defaultSubtype,
    title: "",
    link: "",
    officialWebsite: "",
    image: "",
    referenceHint: "",
    issuer: "",
    platform: "",
    installStatus: "needed",
    date: "",
    expiryDate: "",
    notes: "",
    favorite: false,
    showTitleInPlanning: false,
  };
}

function expiryStatus(item: PersonalVaultItem) {
  if (!item.expiryDate) return null;
  const expiry = new Date(item.expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    return {
      label: "Expired",
      className: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-400/20",
    };
  }
  if (days <= 30) {
    return {
      label: "Expiring Soon",
      className:
        "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-400/20",
    };
  }
  return null;
}

function needsAttention(item: PersonalVaultItem) {
  if (expiryStatus(item)) return true;
  if (item.type === "install" && item.installStatus === "needed") return true;
  return ["install", "links"].includes(item.type) && !item.link;
}

function attentionReason(item: PersonalVaultItem) {
  const status = expiryStatus(item);
  if (status) {
    const expiry = new Date(item.expiryDate!);
    expiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil(
      (expiry.getTime() - today.getTime()) / 86_400_000,
    );
    return days < 0
      ? "Expired"
      : days === 0
        ? "Expires today"
        : `Expires in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (item.type === "install" && item.installStatus === "needed") {
    return "Not installed";
  }
  if (["install", "links"].includes(item.type) && !item.link) {
    return "Missing link";
  }
  return null;
}

function preferredVaultUrl(item: PersonalVaultItem) {
  return [item.link, item.officialWebsite]
    .map((value) => normalizeExternalWebUrl(value))
    .find((value): value is string => Boolean(value));
}

function displayDomain(value?: string) {
  const destination = normalizeExternalWebUrl(value);
  if (!destination) return null;
  try {
    return new URL(destination).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function openVaultLink(url: string) {
  const destination = normalizeExternalWebUrl(url);
  if (!destination) {
    toast({
      title: "Invalid link",
      description: "Edit this item and enter a valid https:// website address.",
      variant: "destructive",
    });
    return;
  }
  openExternalLink(destination).catch(() => {
    toast({
      title: "Could not open link",
      description: "Try again, or copy the link and open it in your browser.",
      variant: "destructive",
    });
  });
}

async function copyVaultLink(item: PersonalVaultItem) {
  const destination = preferredVaultUrl(item);
  if (!destination) return;
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    toast({
      title: "Copy unavailable",
      description: "Open the item to copy its website address manually.",
      variant: "destructive",
    });
    return;
  }
  try {
    await navigator.clipboard.writeText(destination);
    toast({ title: "Link copied", description: "The link is ready to paste." });
  } catch {
    toast({
      title: "Could not copy link",
      description: "Try again, or open the item to copy its website address manually.",
      variant: "destructive",
    });
  }
}

export default function PersonalVaultSection({
  androidPresentation = false,
  requestedRecordId,
  requestedRecordType,
  requestedRecordSignal = 0,
  requestedProfileId,
  onRequestedRecordConsumed,
}: {
  androidPresentation?: boolean;
  requestedRecordId?: string;
  requestedRecordType?: string;
  requestedRecordSignal?: number;
  requestedProfileId?: string;
  onRequestedRecordConsumed?: (signal: number) => void;
}) {
  const context = useAppContext();
  const currentProfile = context.getCurrentProfile();
  const vaultItems = useMemo(
    () =>
      (currentProfile?.personalVaultItems || []).flatMap((item) => {
        const normalized = normalizePersonalVaultItem(item);
        return normalized ? [normalized] : [];
      }),
    [currentProfile?.personalVaultItems],
  );

  const [activeSection, setActiveSection] =
    useState<VaultSectionId>("document");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [draft, setDraft] = useState<PersonalVaultDraft>(() =>
    createDraft("document"),
  );
  const [search, setSearch] = useState("");
  const [careerRequest, setCareerRequest] = useState<{ id: string; signal: number }>();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"link" | "officialWebsite" | "image", string>>>({});
  const [viewBySection, setViewBySection] = useState<
    Partial<Record<VaultSectionId, ViewMode>>
  >(androidPresentation
  ? {
      document: "list",
      career: "list",
      creative: "list",
      install: "list",
      links: "list",
    }
  : {});
  const [sortBySection, setSortBySection] = useState<
    Partial<Record<VaultSectionId, SortMode>>
  >({});
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showAndroidFilters, setShowAndroidFilters] = useState(false);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<PersonalVaultItem | null>(
    null,
  );
  const legacyVaultTaxonomy = useMemo(readLegacyVaultTaxonomy, []);
  const attemptedLegacyMigrationRef = useRef<string | null>(null);
  const consumedRequestSignalRef = useRef<number | null>(null);
  const currentPersonalVaultTaxonomy = currentProfile?.personalVaultTaxonomy;
  const legacyMigration = useMemo(
    () =>
      prepareLegacyVaultTaxonomyMigration(
        currentProfile?.id,
        currentPersonalVaultTaxonomy,
        legacyVaultTaxonomy,
      ),
    [
      currentProfile?.id,
      currentPersonalVaultTaxonomy,
      legacyVaultTaxonomy,
    ],
  );

  useEffect(() => {
    if (!currentProfile?.id || !legacyMigration) return;
    if (legacyMigration.kind === "complete") {
      if (attemptedLegacyMigrationRef.current === legacyMigration.signature) {
        return;
      }
      completeLegacyVaultTaxonomyMigration(
        legacyMigration.profileId,
        legacyMigration.signature,
      );
      return;
    }
    if (
      legacyMigration.currentSignature === legacyMigration.signature
    ) {
      completeLegacyVaultTaxonomyMigration(
        legacyMigration.profileId,
        legacyMigration.signature,
      );
      return;
    }
    if (attemptedLegacyMigrationRef.current === legacyMigration.signature) {
      return;
    }
    attemptedLegacyMigrationRef.current = legacyMigration.signature;
    markLegacyVaultTaxonomyPending(
      legacyMigration.profileId,
      legacyMigration.signature,
    );
    context.updateProfile(currentProfile.id, {
      personalVaultTaxonomy: normalizePersonalVaultTaxonomy(
        legacyMigration.categories,
      ),
    });
  }, [context, currentProfile?.id, legacyMigration]);

  useEffect(() => {
    if (!currentProfile?.id || typeof window === "undefined") return;
    const onLocalSaveComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ changedProfileIds?: string[] }>).detail;
      if (!detail?.changedProfileIds?.includes(currentProfile.id)) return;
      if (
        legacyMigration?.kind !== "complete" ||
        attemptedLegacyMigrationRef.current !== legacyMigration.signature ||
        personalVaultTaxonomySignature(currentPersonalVaultTaxonomy) !==
          legacyMigration.signature
      ) {
        return;
      }
      completeLegacyVaultTaxonomyMigration(
        currentProfile.id,
        legacyMigration.signature,
      );
    };
    window.addEventListener("caizen:local-save-complete", onLocalSaveComplete);
    return () =>
      window.removeEventListener("caizen:local-save-complete", onLocalSaveComplete);
  }, [currentPersonalVaultTaxonomy, currentProfile?.id, legacyMigration]);

  const taxonomy = useModuleTaxonomy(
    "personal",
    PERSONAL_VAULT_TAXONOMY_DEFAULTS,
    vaultItems.map((item) => ({
      category: item.type,
      subcategory: item.subType,
    })),
    {
      value: currentProfile?.personalVaultTaxonomy || [],
      migrateLegacy: false,
      onChange: (categories) => {
        if (!currentProfile) return;
        context.updateProfile(currentProfile.id, {
          personalVaultTaxonomy: normalizePersonalVaultTaxonomy(categories),
        });
      },
    },
  );

  const activeSubcategories = taxonomy.getActiveSubcategories(activeSection);
  const activeSubcategorySet = useMemo(
    () => new Set(activeSubcategories),
    [activeSubcategories],
  );
  const categoryOptions = activeSubcategories.map((value) => ({
    value,
    label: categoryLabel(activeSection, value),
  }));

  useEffect(() => {
    if (
      categoryFilter !== "all" &&
      !activeSubcategorySet.has(categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [activeSection, activeSubcategorySet, categoryFilter]);

  useEffect(() => {
    setCategoryFilter("all");
    setSmartFilter("all");
  }, [activeSection]);

  const closeModal = useCallback(() => {
    setFieldErrors({});
    setEditingId(null);
    setShowVaultModal(false);
    setDraft(createDraft(activeSection));
  }, [activeSection]);

  const openAddModal = useCallback(() => {
    setFieldErrors({});
    setEditingId(null);
    setDraft(createDraft(activeSection));
    setShowVaultModal(true);
  }, [activeSection]);

  const editItem = useCallback((item: PersonalVaultItem) => {
    setFieldErrors({});
    const normalized = normalizePersonalVaultItem(item);
    if (!normalized) return;
    setEditingId(item.id);
    setDraft({
      type: normalized.type,
      subType:
        normalized.subType || SECTION_CONFIG[normalized.type].defaultSubtype,
      title: normalized.title || "",
      link: normalized.link || "",
      officialWebsite: normalized.officialWebsite || "",
      image: normalized.image || "",
      referenceHint: normalized.referenceHint || normalized.usernameHint || "",
      issuer: normalized.issuer || "",
      platform: normalized.platform || "",
      installStatus: normalized.installStatus || "needed",
      date: toLocalDateKey(normalized.date ?? undefined),
      expiryDate: toLocalDateKey(normalized.expiryDate ?? undefined),
      notes: normalized.notes || "",
      favorite: Boolean(normalized.favorite),
      showTitleInPlanning: normalized.showTitleInPlanning === true,
    });
    setShowVaultModal(true);
  }, []);

  useEffect(() => {
    if (
      !requestedRecordSignal ||
      !context.isHydrated ||
      !currentProfile?.id ||
      requestedProfileId !== currentProfile.id ||
      consumedRequestSignalRef.current === requestedRecordSignal
    ) {
      return;
    }
    consumedRequestSignalRef.current = requestedRecordSignal;
    if (requestedRecordType === 'add-item') {
      openAddModal();
      onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    if (!requestedRecordId) {
      onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    const item = vaultItems.find((entry) => entry.id === requestedRecordId);
    if (item) {
      setActiveSection(item.type);
      editItem(item);
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [
    context.isHydrated,
    currentProfile?.id,
    onRequestedRecordConsumed,
    openAddModal,
    editItem,
    requestedProfileId,
    requestedRecordId,
    requestedRecordSignal,
    requestedRecordType,
    vaultItems,
  ]);

  const submitItem = () => {
    if (!currentProfile || !draft.title.trim()) return false;
    const errors: typeof fieldErrors = {};
    for (const key of ["link", "officialWebsite", "image"] as const) {
      if (draft[key].trim() && !normalizeExternalWebUrl(draft[key])) errors[key] = "Enter a valid HTTPS URL, or leave this field empty.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const ids = { link: "vault-external-link", officialWebsite: "vault-official-website", image: "vault-preview-image" };
      document.getElementById(ids[Object.keys(errors)[0] as keyof typeof ids])?.focus();
      return false;
    }
    const category = draft.subType.trim();
    if (category && !(taxonomy.categories.find(entry => entry.name === draft.type)?.subcategories || []).some(value => value.toLocaleLowerCase() === category.toLocaleLowerCase())) taxonomy.addSubcategory(draft.type, category);

    const payload: Omit<PersonalVaultItem, "id" | "createdAt"> = {
      type: draft.type,
      subType: draft.subType || SECTION_CONFIG[draft.type].defaultSubtype,
      title: draft.title.trim(),
      link: draft.link.trim() || undefined,
      officialWebsite: draft.officialWebsite.trim() || undefined,
      image: draft.image.trim() || undefined,
      usernameHint: draft.referenceHint.trim() || undefined,
      referenceHint: draft.referenceHint.trim() || undefined,
      issuer: draft.issuer.trim() || undefined,
      platform: draft.platform.trim() || undefined,
      installStatus: draft.type === "install" ? draft.installStatus : undefined,
      date: draft.date ? parseLocalDateKey(draft.date) : null,
      expiryDate: draft.expiryDate ? parseLocalDateKey(draft.expiryDate) : null,
      notes: draft.notes.trim() || undefined,
      favorite: draft.favorite,
      showTitleInPlanning: draft.showTitleInPlanning,
    };

    if (editingId) context.updatePersonalVaultItem(editingId, payload);
    else context.addPersonalVaultItem(payload);
    toast({
      title: "Saved locally.",
      description: editingId ? "Vault item updated in this profile." : "Vault item added to this profile.",
    });
    closeModal();
    return true;
  };

  const sectionItems = vaultItems.filter((item) => item.type === activeSection);
  const query = search.trim().toLocaleLowerCase();
  const sourceItems = query ? vaultItems : sectionItems;
  const sort = sortBySection[activeSection] || "pinned";

  const filteredItems = useMemo(() => {
    return [...sourceItems]
      .filter((item) => {
        if (!query) return true;
        return [
          item.title,
          item.subType,
          item.notes,
          item.link,
          item.officialWebsite,
          item.referenceHint,
          item.issuer,
          item.platform,
          item.installStatus,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(query));
      })
      .filter(
        (item) =>
          query || categoryFilter === "all" || item.subType === categoryFilter,
      )
      .filter((item) => {
        if (smartFilter === "pinned") return Boolean(item.favorite);
        if (smartFilter === "attention") return needsAttention(item);
        return true;
      })
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "date") {
          const aDate = a.expiryDate || a.date;
          const bDate = b.expiryDate || b.date;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return new Date(aDate).getTime() - new Date(bDate).getTime();
        }
        if (sort === "newest") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        return (
          Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [sourceItems, query, categoryFilter, smartFilter, sort]);

  const searchResults = useMemo(() => searchPersonalVault(search, {
    items: vaultItems, skills: currentProfile?.careerSkills, courses: currentProfile?.careerCourses, certificates: currentProfile?.careerCredentials,
  }), [search, vaultItems, currentProfile?.careerSkills, currentProfile?.careerCourses, currentProfile?.careerCredentials]);
  const resultCount = query ? searchResults.length : filteredItems.length;
  const config = SECTION_CONFIG[activeSection];
  const canUseGrid =
    !androidPresentation &&
    (activeSection === "document" || activeSection === "creative");
  const view = canUseGrid
    ? viewBySection[activeSection] || config.defaultView
    : "list";
  const pageSize = !query && view === "grid" ? 12 : 20;
  const totalPages = Math.max(1, Math.ceil(resultCount / pageSize));
  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const paginatedSearchResults = searchResults.slice((page - 1) * pageSize, page * pageSize);
  const resultsRef = useCollectionReveal(
    query ? paginatedSearchResults.map(result => `${result.kind}:${result.id}`) : paginatedItems.map(item => item.id),
    [context.currentProfileId, activeSection, categoryFilter, smartFilter, sort, view, page, Boolean(query)],
  );
  useEffect(() => {
    setPage(1);
  }, [context.currentProfileId, activeSection, search, categoryFilter, smartFilter, sort, view]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const activeAndroidFilterCount = Number(categoryFilter !== "all") + Number(sort !== "pinned");
  const clearAndroidFilters = () => {
    setCategoryFilter("all");
    setSortBySection((current) => ({ ...current, [activeSection]: "pinned" }));
  };
  const openCategoryManager = () => openTaxonomyHub({
    area: 'personal-vault',
    panel: 'categories',
    section: activeSection,
  });
  const actionItem = actionItemId
    ? vaultItems.find(item => item.id === actionItemId)
    : undefined;
  const getVaultActions = (item: PersonalVaultItem): EntryAction[] => {
    const primaryUrl = preferredVaultUrl(item);
    const hasSeparateOfficialSite = Boolean(
      item.officialWebsite &&
        normalizeExternalWebUrl(item.officialWebsite) !== primaryUrl,
    );
    return [
      ...(primaryUrl ? [{
        id: 'open' as const,
        label: item.type === 'install' && item.link ? 'Open download page' : 'Open',
        onSelect: () => openVaultLink(primaryUrl),
      }] : []),
      {
        id: 'edit' as const,
        label: 'Edit',
        onSelect: () => editItem(item),
      },
      {
        id: 'pin' as const,
        label: item.favorite ? 'Unpin' : 'Pin to top',
        onSelect: () => context.updatePersonalVaultItem(item.id, { favorite: !item.favorite }),
      },
      ...(primaryUrl ? [{
        id: 'link' as const,
        label: 'Copy link',
        onSelect: () => void copyVaultLink(item),
      }] : []),
      ...(hasSeparateOfficialSite ? [{
        id: 'source' as const,
        label: 'Open official site',
        onSelect: () => openVaultLink(item.officialWebsite!),
      }] : []),
      {
        id: 'delete' as const,
        label: 'Move to Trash',
        destructive: true,
        confirm: false,
        onSelect: () => setItemToDelete(item),
      },
    ];
  };

  const renderVaultItem = (item: PersonalVaultItem) => <VaultCard
    key={`vault-${item.id}`} item={item} config={SECTION_CONFIG[item.type]}
    view={query || item.type === "career" ? "list" : view} androidPresentation={androidPresentation}
    onAndroidOpen={() => setActionItemId(item.id)} onEdit={() => editItem(item)} onDelete={() => setItemToDelete(item)}
    onToggleFavorite={() => context.updatePersonalVaultItem(item.id, { favorite: !item.favorite })} onCopyLink={() => void copyVaultLink(item)}
  />;

  return (
    <section
      className={androidPresentation ? "android-module-home space-y-4" : "workspace-wide space-y-4 lg:space-y-5"}
      data-android-screen="personal-vault"
    >
      <div className="section-surface p-4 sm:p-5">
        <div className="space-y-2">
          <div className="min-w-0">
            <h1 className="text-page-title text-foreground">
              Personal Vault
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Keep document references, setup links, and career records together in this profile. Caizen is not a password manager, and masked
              hints are a display convenience—not encryption.
            </p>
          </div>

        </div>

              <SearchField
                value={search}
                onChange={(value) => { setSearch(value); if (value.trim()) { setSmartFilter("all"); setCategoryFilter("all"); } }}
                aria-label="Search Personal Vault"
                placeholder="Search all Vault and Career records"
                surface="solid"
                className="mt-4 border-border hover:border-primary/40"
              />

        <ResponsiveControlStrip label="Vault sections" className="mt-5">
          {SECTION_ORDER.map((type) => {
            const SectionIcon = SECTION_CONFIG[type].icon;
            const count = type === "career"
              ? vaultItems.filter((item) => item.type === type).length
                + (currentProfile?.careerSkills?.length || 0)
                + (currentProfile?.careerCourses?.length || 0)
                + (currentProfile?.careerCredentials?.length || 0)
              : vaultItems.filter((item) => item.type === type).length;
            return (
              <button
                key={type}
                type="button"
                aria-label={`${SECTION_CONFIG[type].title}, ${count} items`}
                aria-pressed={activeSection === type}
                onClick={(event) => {
                  setActiveSection(type);
                  setSearch("");
                  const button = event.currentTarget;
                  const strip = button.closest<HTMLElement>('[data-responsive-control-strip="true"]');
                  window.requestAnimationFrame(() => {
                    if (!strip?.isConnected) return;
                    const stripRect = strip.getBoundingClientRect();
                    const buttonRect = button.getBoundingClientRect();
                    const delta = buttonRect.left < stripRect.left
                      ? buttonRect.left - stripRect.left
                      : buttonRect.right > stripRect.right
                        ? buttonRect.right - stripRect.right
                        : 0;
                    if (delta) {
                      strip.scrollTo({
                        left: Math.max(0, strip.scrollLeft + delta),
                        behavior: 'smooth',
                      });
                    }
                  });
                }}
                className={`android-vault-section-tab caizen-tab inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeSection === type
                    ? "caizen-tab-active text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <SectionIcon className="h-4 w-4" />
                {androidPresentation ? <span className="android-vault-tab-label">{SECTION_CONFIG[type].title}</span> : SECTION_CONFIG[type].title}
                <span className="android-vault-tab-count text-xs tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </ResponsiveControlStrip>
      </div>

      <section className="section-surface p-4 sm:p-5">
        {activeSection !== "career" || query ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-section-title break-words text-foreground">{query ? "Search results" : config.title}</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {query
                ? `${resultCount} result${resultCount === 1 ? "" : "s"} across all Vault and Career records. Section filters do not apply.`
                : config.description}
            </p>
          </div>
          {!query ? <Button type="button" onClick={openAddModal} className="min-h-11 shrink-0"><Plus className="mr-2 h-4 w-4" />Add item</Button> : null}
        </div>

        ) : null}

        {activeSection === "career" && !query ? (
          <div>
            <CareerWorkspace
              legacyItems={sectionItems}
              currentLegacyItems={filteredItems.filter((item) => item.type === "career")}
              androidPresentation={androidPresentation}
              renderLegacyItem={renderVaultItem}
              requestedRecordId={careerRequest?.id}
              requestedRecordSignal={careerRequest?.signal}
              onRequestedRecordConsumed={() => setCareerRequest(undefined)}
            />
          </div>
        ) : null}

        {activeSection !== "career" && !query && (
          <div
            role="toolbar"
            aria-label="Vault filters and display controls"
            className="mt-5 flex w-full flex-col gap-3"
          >
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
              {!query ? (androidPresentation ? (
                <div role="group" aria-label="Vault retrieval controls" className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAndroidFilters(true)}
                    className="control-input flex min-h-11 items-center justify-between rounded-xl px-3 text-left font-semibold"
                    aria-label={`Vault filters${activeAndroidFilterCount ? `, ${activeAndroidFilterCount} active` : ''}`}
                  >
                    <span>Filters{activeAndroidFilterCount ? ` (${activeAndroidFilterCount})` : ''}</span>
                    <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCategoryManager}
                    className="h-11 rounded-2xl border-border bg-input px-3 hover:border-primary/40"
                  >
                    <Settings2 className="mr-2 h-4 w-4" /> Categories
                  </Button>
                </div>
              ) : (
                <div role="group" aria-label="Vault retrieval controls" className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                  <Combobox
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    ariaLabel="Filter by Vault category"
                    className="h-11 min-w-0 w-full border-border bg-input hover:border-primary/40"
                    surface="default"
                    options={[
                      { value: "all", label: "All categories" },
                      ...categoryOptions,
                    ]}
                  />
                  <AndroidAdaptiveSelect
                    value={sort}
                    onChange={(value) =>
                      setSortBySection((current) => ({
                        ...current,
                        [activeSection]: value as SortMode,
                      }))
                    }
                    label="Sort Vault items"
                    className="h-11 min-w-0 w-full border-border bg-input hover:border-primary/40"
                    options={[
                      { value: "pinned", label: "Pinned first" },
                      { value: "newest", label: "Newest" },
                      { value: "title", label: "Title" },
                      { value: "date", label: "Relevant date" },
                    ]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCategoryManager}
                    className="h-11 justify-start rounded-xl border-border bg-input px-3 hover:border-primary/40"
                  >
                    <Settings2 className="mr-2 h-4 w-4" /> Categories
                  </Button>
                  {canUseGrid ? (
                    <ViewModeToggle
                      value={view}
                      onChange={(next) => setViewBySection((current) => ({
                        ...current,
                        [activeSection]: next,
                      }))}
                      label="Personal Vault view"
                      className="justify-self-end"
                    />
                  ) : null}
                </div>
              )) : null}
            </div>
            {!query ? (
              <div className="min-w-0">
                <FilterBar label="Filter Vault items" className="sm:max-w-lg">
                  {(
                    [
                      ["all", "All"],
                      ["pinned", "Pinned"],
                      ["attention", "Needs attention"],
                    ] as Array<[SmartFilter, string]>
                  ).map(([value, label]) => (
                    <FilterChip
                      key={value}
                      selected={smartFilter === value}
                      onSelectedChange={selected => { if (selected) setSmartFilter(value); }}
                      className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium"
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterBar>
              </div>
            ) : null}
            {androidPresentation && !query ? (
              <CaizenBottomSheet
                open={showAndroidFilters}
                title={`${config.title} filters`}
                description="Choose which Vault items to show."
                onClose={() => setShowAndroidFilters(false)}
                fullHeight
              >
                <div className="space-y-3" data-android-vault-filters="true">
                  <AndroidAdaptiveSelect
                    label="Category"
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    searchable={categoryOptions.length > 8}
                    options={[{ value: "all", label: "All categories" }, ...categoryOptions]}
                  />
                  <AndroidAdaptiveSelect
                    label="Sort"
                    value={sort}
                    onChange={(value) => setSortBySection((current) => ({ ...current, [activeSection]: value as SortMode }))}
                    options={[
                      { value: "pinned", label: "Pinned first" },
                      { value: "newest", label: "Newest" },
                      { value: "title", label: "Title" },
                      { value: "date", label: "Relevant date" },
                    ]}
                  />
                  <button type="button" onClick={clearAndroidFilters} disabled={!activeAndroidFilterCount} className="min-h-11 w-full rounded-xl border border-border/60 px-3 text-sm font-bold text-muted-foreground disabled:opacity-50">Reset filters and sort</button>
                </div>
              </CaizenBottomSheet>
            ) : null}
          </div>
        )}

        {activeSection !== "career" || query ? (
          <>
          <div
            ref={resultsRef}
            className={`mt-5 ${
              !query && view === "grid"
                ? "grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
                : ""
            }`}
          >
            {resultCount === 0 ? (
              <div className={`py-8 text-center sm:py-10 ${!query && view === "grid" ? "col-span-full" : ""}`}>
                <p className="text-sm font-bold text-foreground">
                  {!query && sourceItems.length === 0
                    ? `No ${config.title.toLocaleLowerCase()} yet`
                    : query ? "No search results" : "No items match these filters"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {!query && sourceItems.length === 0
                    ? config.emptyDescription
                    : query ? "Try another title, keyword, or website address." : "Choose All or another category to see more items."}
                </p>
                {query ? <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => setSearch("")}>Clear search</Button> : null}
              </div>
            ) : (
              query ? paginatedSearchResults.map(result => result.kind === 'vault'
                ? renderVaultItem(result.item)
                : <article key={`career-${result.id}`} data-caizen-collection-item="true" className="flex min-w-0 items-start justify-between gap-3 border-b border-border/50 py-3">
                    <div className="min-w-0"><h3 className="break-words text-card-title">{result.title}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{[result.label, result.detail].filter(Boolean).join(" · ")}</p></div>
                    <Button type="button" variant="outline" className="min-h-11 shrink-0" aria-label={`View ${result.title}`} onClick={() => {
                      setSearch(""); setActiveSection("career"); setCareerRequest({ id: result.id, signal: Date.now() });
                    }}>View</Button>
                  </article>) : paginatedItems.map(renderVaultItem)
            )}
          </div>
          {resultCount > pageSize ? (
            <PaginationControls
              page={page}
              totalPages={totalPages}
              totalItems={resultCount}
              pageSize={pageSize}
              onPageChange={setPage}
              collectionLabel={query ? "Vault search results" : `${config.title} items`}
            />
          ) : null}
          </>
        ) : null}
      </section>

      <PersonalVaultModal
        isOpen={showVaultModal}
        androidPresentation={androidPresentation}
        onClose={closeModal}
        onSave={submitItem}
        editingId={editingId}
        draft={draft}
        setDraft={(next) => { setFieldErrors({}); setDraft(next); }}
        fieldErrors={fieldErrors}
        sectionConfig={SECTION_CONFIG}
        subTypeOptions={taxonomy
          .getActiveSubcategories(draft.type)
          .map((value) => ({
            value,
            label: categoryLabel(draft.type, value),
          }))}
      />

      <EntryActionSheet
        androidPresentation={androidPresentation}
        open={Boolean(actionItem)}
        title={actionItem?.title || "Vault item"}
        subtitle="Personal Vault"
        deleteMessage="This Vault item will move to Trash and remain recoverable through the existing Trash flow."
        onClose={() => setActionItemId(null)}
        actions={actionItem ? getVaultActions(actionItem) : []}
      />

      <ConfirmDialog
        isOpen={Boolean(itemToDelete)}
        title="Move vault item to Trash?"
        message={
          itemToDelete
            ? `Move “${itemToDelete.title}” to Trash? It can be restored for 30 days.`
            : "Move this Vault item to Trash? It can be restored for 30 days."
        }
        confirmText="Move to Trash"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setItemToDelete(null)}
        onConfirm={() => {
          if (itemToDelete) context.deletePersonalVaultItem(itemToDelete.id);
          setItemToDelete(null);
        }}
      />
    </section>
  );
}

function VaultCard({
  item,
  config,
  view,
  androidPresentation,
  onAndroidOpen,
  onEdit,
  onDelete,
  onToggleFavorite,
  onCopyLink,
}: {
  item: PersonalVaultItem;
  config: SectionConfig;
  view: ViewMode;
  androidPresentation: boolean;
  onAndroidOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onCopyLink: () => void;
}) {
  const [showReference, setShowReference] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const status = expiryStatus(item);
  const attention = needsAttention(item) ? attentionReason(item) : null;
  const isList = view === "list";
  const compactReference = isList;
  const TypeIcon = config.icon;
  const showThumbnail = !isList && (item.type === "creative" || item.type === "document");
  const hasRenderableImage = Boolean(item.image) && !imageFailed;
  const primaryUrl = preferredVaultUrl(item);
  const cardState = status
    ? { label: status.label, className: status.className }
    : attention
      ? {
          label: attention === "Not installed" ? "Needed" : attention,
          className:
            "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-400/20",
        }
      : item.favorite
        ? {
            label: "Pinned",
            className:
              "bg-primary/10 text-primary border-primary/20",
          }
        : null;

  useEffect(() => {
    setImageFailed(false);
  }, [item.image]);

  if (compactReference) {
    return (
      <article data-caizen-collection-item="true" className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-border/50 py-3 transition-colors hover:bg-muted/30">
        <div aria-hidden="true" data-vault-thumbnail="list-icon" className="flex h-6 w-8 shrink-0 items-center justify-center text-muted-foreground">
          <TypeIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words [overflow-wrap:anywhere] text-card-title text-foreground">{item.title}</h3>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-metadata text-muted-foreground">
            <span className={`font-medium ${config.accent}`}>
              {categoryLabel(item.type, item.subType || item.type)}
            </span>
            {cardState ? <span className={`rounded-md border px-1.5 py-0.5 font-semibold ${cardState.className}`}>{cardState.label}</span> : null}
            <VaultMetadata item={item} />
            {item.notes ? <OverflowTooltip text={vaultNotePreview(item.notes)}><span className="max-w-48 truncate">{vaultNotePreview(item.notes)}</span></OverflowTooltip> : null}
            {item.referenceHint ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <span>Reference:</span>
                <OverflowTooltip text={showReference ? item.referenceHint : "••••••••"}><span className={`font-mono text-foreground/80 ${showReference ? 'break-all' : 'max-w-32 truncate'}`}>{showReference ? item.referenceHint : "••••••••"}</span></OverflowTooltip>
                <button type="button" aria-pressed={showReference} aria-label={showReference ? "Hide reference hint" : "Show reference hint"} onClick={() => setShowReference(current => !current)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {showReference ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </span>
            ) : null}
          </div>
        </div>
        <div className="col-start-2 flex shrink-0 items-center justify-end gap-1 sm:col-start-auto">
          {primaryUrl ? <Button type="button" size="sm" onClick={() => openVaultLink(primaryUrl)} className="min-h-11 min-w-11 rounded-lg px-2 sm:px-3">
            <ExternalLink className="h-4 w-4 sm:mr-1.5" /><span className="sr-only sm:not-sr-only">{item.type === "install" && item.link ? "Open download page" : "Open"}</span>
          </Button> : null}
          <VaultCardMenu item={item} androidPresentation={androidPresentation} onAndroidOpen={onAndroidOpen} onToggleFavorite={onToggleFavorite} onCopyLink={onCopyLink} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </article>
    );
  }

  return (
    <article
      data-caizen-collection-item="true"
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/35 transition-colors hover:border-primary/25 hover:bg-background/50"
    >
      {showThumbnail && (
        <div
          data-vault-thumbnail="grid"
          className="aspect-[16/9] flex shrink-0 items-center justify-center overflow-hidden bg-muted/25 p-3"
        >
          {hasRenderableImage ? (
            <img
              src={item.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <TypeIcon
              className="h-6 w-6 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
      )}

      <div
        className="flex min-w-0 flex-1 flex-col gap-3 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${config.accent}`}
              >
                <TypeIcon className="h-3 w-3" />
                {categoryLabel(item.type, item.subType || item.type)}
              </span>
              {cardState && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${cardState.className}`}
                >
                  {cardState.label === "Pinned" ? (
                    <Pin className="h-3 w-3" />
                  ) : null}
                  {cardState.label}
                </span>
              )}
            </div>
            <OverflowTooltip text={item.title} mode="clamped"><h3 className="mt-2 line-clamp-2 break-words [overflow-wrap:anywhere] text-card-title text-foreground">
              {item.title}
            </h3></OverflowTooltip>
          </div>
          <VaultCardMenu item={item} androidPresentation={androidPresentation} onAndroidOpen={onAndroidOpen} onToggleFavorite={onToggleFavorite} onCopyLink={onCopyLink} onEdit={onEdit} onDelete={onDelete} />
        </div>

        <VaultMetadata item={item} />

        {item.referenceHint && (
          <div className="flex min-w-0 items-center gap-2 text-metadata text-muted-foreground">
            <span>Reference:</span>
            <span className="min-w-0 break-all font-mono text-foreground/80">
              {showReference ? item.referenceHint : "••••••••"}
            </span>
            <button
              type="button"
              aria-pressed={showReference}
              aria-label={showReference ? "Hide reference hint" : "Show reference hint"}
              onClick={() => setShowReference((current) => !current)}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showReference ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}

        {item.notes && (
          <OverflowTooltip text={vaultNotePreview(item.notes)} mode="clamped"><p className="line-clamp-1 text-sm text-muted-foreground">
            {vaultNotePreview(item.notes)}
          </p></OverflowTooltip>
        )}

        {primaryUrl ? (
          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11 rounded-xl"
              onClick={() => openVaultLink(primaryUrl)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {item.type === "install" && item.link ? "Open download page" : "Open"}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function VaultCardMenu({
  item,
  androidPresentation,
  onAndroidOpen,
  onToggleFavorite,
  onCopyLink,
  onEdit,
  onDelete,
}: {
  item: PersonalVaultItem;
  androidPresentation: boolean;
  onAndroidOpen: () => void;
  onToggleFavorite: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasCopyLink = Boolean(preferredVaultUrl(item));
  const hasSeparateOfficialSite = Boolean(
    item.officialWebsite &&
      normalizeExternalWebUrl(item.officialWebsite) !== preferredVaultUrl(item),
  );

  if (androidPresentation) {
    return (
      <button
        type="button"
        aria-label={`More actions for ${item.title}`}
        onClick={event => {
          event.stopPropagation();
          onAndroidOpen();
        }}
        className="min-h-11 min-w-11 shrink-0 rounded-xl text-muted-foreground/80 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <MoreHorizontal className="mx-auto h-4 w-4" />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${item.title}`}
          className="min-h-11 min-w-11 shrink-0 rounded-xl text-muted-foreground/80 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <MoreVertical className="mx-auto h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuItem onSelect={onEdit} className="min-h-11 text-sm font-semibold">
          <Edit3 className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleFavorite} className="min-h-11 text-sm font-semibold">
          <Pin className="mr-2 h-4 w-4" />
          {item.favorite ? "Unpin" : "Pin to top"}
        </DropdownMenuItem>
        {hasCopyLink && (
          <DropdownMenuItem
            onSelect={() => void onCopyLink()}
            className="min-h-11 text-sm font-semibold"
          >
            <Copy className="mr-2 h-4 w-4" /> Copy link
          </DropdownMenuItem>
        )}
        {hasSeparateOfficialSite && (
          <DropdownMenuItem
            onSelect={() => openVaultLink(item.officialWebsite!)}
            className="min-h-11 text-sm font-semibold"
          >
            <ExternalLink className="mr-2 h-4 w-4" /> Open official site
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          variant="destructive"
          className="min-h-11 text-sm font-semibold"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VaultMetadata({ item }: { item: PersonalVaultItem }) {
  const values: Array<{ label: string; value: string }> = [];
  if (item.issuer) values.push({ label: "Issuer", value: item.issuer });
  if (item.platform) values.push({ label: "Platform", value: item.platform });
  const domain =
    item.type === "links"
      ? displayDomain(item.link)
      : item.type === "install"
        ? displayDomain(item.officialWebsite)
        : null;
  if (domain) values.push({ label: "Website", value: domain });
  if (item.date) {
    values.push({
      label: item.type === "career" ? "Issued" : "Date",
      value: new Date(item.date).toLocaleDateString(),
    });
  }
  if (item.expiryDate) {
    values.push({
      label: "Expires",
      value: new Date(item.expiryDate).toLocaleDateString(),
    });
  }
  if (values.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 break-words [overflow-wrap:anywhere] text-metadata text-muted-foreground">
      {values.map((entry) => (
        <span key={`${entry.label}-${entry.value}`}>
          <strong className="font-semibold text-foreground/75">
            {entry.label}:
          </strong>{" "}
          {entry.value}
        </span>
      ))}
    </div>
  );
}

export function PersonalVaultQuickAddModal({
  isOpen,
  initialType = 'document',
  onClose,
}: {
  isOpen: boolean;
  initialType?: PersonalVaultType;
  onClose: () => void;
}) {
  const context = useAppContext();
  const currentProfile = context.getCurrentProfile();
  const vaultItems = useMemo(
    () =>
      (currentProfile?.personalVaultItems || []).flatMap(item => {
        const normalized = normalizePersonalVaultItem(item);
        return normalized ? [normalized] : [];
      }),
    [currentProfile?.personalVaultItems],
  );
  const [draft, setDraft] = useState<PersonalVaultDraft>(() => createDraft(initialType));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"link" | "officialWebsite" | "image", string>>>({});

  const taxonomy = useModuleTaxonomy(
    'personal',
    PERSONAL_VAULT_TAXONOMY_DEFAULTS,
    vaultItems.map(item => ({ category: item.type, subcategory: item.subType })),
    {
      value: currentProfile?.personalVaultTaxonomy || [],
      migrateLegacy: false,
      onChange: categories => {
        if (!currentProfile) return;
        context.updateProfile(currentProfile.id, {
          personalVaultTaxonomy: normalizePersonalVaultTaxonomy(categories),
        });
      },
    },
  );

  useEffect(() => {
    if (isOpen) { setDraft(createDraft(initialType)); setFieldErrors({}); }
  }, [initialType, isOpen]);

  const close = () => {
    setDraft(createDraft(initialType));
    onClose();
  };

  const save = () => {
    if (!currentProfile || !draft.title.trim()) return false;
    const errors: typeof fieldErrors = {};
    for (const key of ["link", "officialWebsite", "image"] as const) {
      if (draft[key].trim() && !normalizeExternalWebUrl(draft[key])) errors[key] = "Enter a valid HTTPS URL, or leave this field empty.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const ids = { link: "vault-external-link", officialWebsite: "vault-official-website", image: "vault-preview-image" };
      document.getElementById(ids[Object.keys(errors)[0] as keyof typeof ids])?.focus();
      return false;
    }
    const category = draft.subType.trim();
    if (category && !(taxonomy.categories.find(entry => entry.name === draft.type)?.subcategories || []).some(value => value.toLocaleLowerCase() === category.toLocaleLowerCase())) taxonomy.addSubcategory(draft.type, category);

    context.addPersonalVaultItem({
      type: draft.type,
      subType: draft.subType || SECTION_CONFIG[draft.type].defaultSubtype,
      title: draft.title.trim(),
      link: draft.link.trim() || undefined,
      officialWebsite: draft.officialWebsite.trim() || undefined,
      image: draft.image.trim() || undefined,
      usernameHint: draft.referenceHint.trim() || undefined,
      referenceHint: draft.referenceHint.trim() || undefined,
      issuer: draft.issuer.trim() || undefined,
      platform: draft.platform.trim() || undefined,
      installStatus: draft.type === 'install' ? draft.installStatus : undefined,
      date: draft.date ? parseLocalDateKey(draft.date) : null,
      expiryDate: draft.expiryDate ? parseLocalDateKey(draft.expiryDate) : null,
      notes: draft.notes.trim() || undefined,
      favorite: draft.favorite,
      showTitleInPlanning: draft.showTitleInPlanning,
    });
    toast({
      title: 'Saved locally.',
      description: 'Vault item added to this profile.',
    });
    close();
    return true;
  };

  return (
    <PersonalVaultModal
      isOpen={isOpen}
      onClose={close}
      onSave={save}
      draft={draft}
      setDraft={(next) => { setFieldErrors({}); setDraft(next); }}
      fieldErrors={fieldErrors}
      sectionConfig={SECTION_CONFIG}
      subTypeOptions={taxonomy
        .getActiveSubcategories(draft.type)
        .map(value => ({ value, label: categoryLabel(draft.type, value) }))}
    />
  );
}
