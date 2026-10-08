"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import ConfirmDialog from "@/components/common/ConfirmDialog";
import FormattedTextarea from "@/components/common/FormattedTextarea";
import { AndroidAdaptiveCreatableSelect, AndroidAdaptiveSelect } from "@/components/native/android-design";
import { Button } from "@/components/ui/button";
import { AdaptiveDatePicker } from "@/components/ui/date-picker";
import { useOverlayLifecycle } from "@/hooks/use-overlay-lifecycle";
import { useCaizenMotionMode } from "@/hooks/use-caizen-motion-enabled";
import { animations } from "@/lib/animations";
import type { PersonalVaultType } from "@/lib/types";

export type PersonalVaultDraft = {
  type: PersonalVaultType;
  subType: string;
  title: string;
  link: string;
  officialWebsite: string;
  image: string;
  referenceHint: string;
  issuer: string;
  platform: string;
  installStatus: "needed" | "installed" | "optional";
  date: string;
  expiryDate: string;
  notes: string;
  favorite: boolean;
  showTitleInPlanning: boolean;
};

type SectionConfig = Record<
  PersonalVaultType,
  {
    defaultSubtype: string;
    title: string;
  }
>;

interface PersonalVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => boolean;
  editingId?: string | null;
  draft: PersonalVaultDraft;
  setDraft: React.Dispatch<React.SetStateAction<PersonalVaultDraft>>;
  sectionConfig: SectionConfig;
  subTypeOptions: Array<{ value: string; label: string }>;
  fieldErrors?: Partial<Record<"link" | "officialWebsite" | "image", string>>;
  androidPresentation?: boolean;
}

const TYPE_OPTIONS = [
  { id: "document", label: "Document reference" },
  { id: "career", label: "Career record" },
  { id: "creative", label: "Creative reference" },
  { id: "install", label: "Setup link" },
  { id: "links", label: "Link" },
] as const;

function Field({
  label,
  children,
  className = "",
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-label text-muted-foreground">{label}</label>
      ) : null}
      {!htmlFor && <span className="block text-label text-muted-foreground">{label}</span>}
      {children}
    </div>
  );
}

const inputClass = "control-input h-11 w-full";
const disclosureClass = "min-h-11 cursor-pointer content-center text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function PersonalVaultModal({
  isOpen,
  onClose,
  onSave,
  editingId,
  draft,
  setDraft,
  sectionConfig,
  subTypeOptions,
  fieldErrors = {},
  androidPresentation = false,
}: PersonalVaultModalProps) {
  const motionMode = useCaizenMotionMode();
  const motionEnabled = motionMode === 'full' || motionMode === 'android';
  const fallbackFadeDuration = motionMode === 'constrained' ? 0.12 : 0;
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [saveError, setSaveError] = useState("");
  const submittedRef = useRef(false);
  const openedDraftRef = useRef<{ editingId: string | null | undefined } | null>(null);
  const isEditing = Boolean(editingId);
  const currentSnapshot = JSON.stringify(draft);
  const hasUnsavedChanges =
    isOpen && initialSnapshot !== "" && currentSnapshot !== initialSnapshot;

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      openedDraftRef.current = null;
      return;
    }
    if (openedDraftRef.current?.editingId === editingId && openedDraftRef.current) return;
    openedDraftRef.current = { editingId };
    submittedRef.current = false;
    setSaveError("");
    setInitialSnapshot(currentSnapshot);
    setShowUnsavedDialog(false);
    setTitleError("");
  }, [isOpen, editingId, currentSnapshot]);

  const modalPanelRef = useRef<HTMLElement | null>(null);
  useOverlayLifecycle(isOpen, requestClose, { containerRef: modalPanelRef });

  const updateDraft = (updates: Partial<PersonalVaultDraft>) => {
    if (updates.title !== undefined) setTitleError("");
    setDraft((current) => ({ ...current, ...updates }));
  };

  const changeType = (type: PersonalVaultType) => {
    updateDraft({
      type,
      subType: sectionConfig[type]?.defaultSubtype || "other",
      installStatus: type === "install" ? draft.installStatus : "needed",
    });
  };

  if (typeof document === "undefined") return null;

  const categoryLabel = "Category";
  const showPlanningControl =
    draft.showTitleInPlanning ||
    ["document", "career", "creative"].includes(draft.type);
  const showImageControl = draft.type === "creative" || draft.type === "document" || Boolean(draft.image);
  const titleLabel =
    draft.type === "install" ? "Software / resource name" : "Title";
  const notesPlaceholder =
    draft.type === "install"
      ? "Setup notes, device context, or reminders. Never store passwords or recovery codes."
      : "Context, setup steps, or reminders. Never store passwords or recovery codes.";

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            aria-label="Close vault modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionEnabled ? 0.16 : fallbackFadeDuration }}
            tabIndex={-1}
            aria-hidden="true"
            onClick={requestClose}
            className="fixed inset-0 z-40 bg-black/60"
          />

          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <motion.section
              ref={modalPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="personal-vault-modal-title"
              initial={motionEnabled ? animations.modal.initial as any : { opacity: 0 }}
              animate={motionEnabled
                ? animations.modal.animate as any
                : { opacity: 1, transition: { duration: fallbackFadeDuration } }}
              exit={motionEnabled
                ? animations.modal.exit as any
                : { opacity: 0, transition: { duration: fallbackFadeDuration } }}
              className="workspace-compact mobile-modal-panel android-fullscreen-form pointer-events-auto border border-border/60 bg-background shadow-2xl"
              data-android-presentation={androidPresentation || undefined}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 p-4 sm:gap-4 sm:p-5">
                <div className="min-w-0">
                  <h2
                    id="personal-vault-modal-title"
                    className="text-section-title break-words text-foreground"
                  >
                    {isEditing ? "Edit vault item" : "New vault item"}
                  </h2>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    A title is required; other details are optional. Never store passwords or recovery codes.
                    Masked hints are a display convenience, not encryption.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Close"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                id="personal-vault-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (submittedRef.current) return;
                  if (!draft.title.trim()) {
                    setTitleError("Enter a title for this item.");
                    event.currentTarget.querySelector<HTMLInputElement>("#vault-title")?.focus();
                    return;
                  }
                  submittedRef.current = true;
                  try {
                    if (!onSave()) submittedRef.current = false;
                  } catch {
                    submittedRef.current = false;
                    setSaveError('This item could not be saved. Your changes are still here; try again.');
                  }
                }}
                className="mobile-modal-body p-4 sm:p-5"
              >
                <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
                  <Field label={titleLabel} htmlFor="vault-title" className="md:col-span-2">
                    <input
                      id="vault-title"
                      aria-invalid={Boolean(titleError)}
                      aria-describedby={titleError ? "vault-title-error" : undefined}
                      value={draft.title}
                      onChange={(event) =>
                        updateDraft({ title: event.target.value })
                      }
                      placeholder={draft.type === "install" ? "e.g. Graphics driver" : draft.type === "links" ? "e.g. Library catalogue" : draft.type === "creative" ? "e.g. Piano practice" : draft.type === "career" ? "e.g. Resume" : "e.g. Passport renewal"}
                      className={inputClass}
                      required
                    />
                    {titleError && <p id="vault-title-error" role="alert" className="text-sm text-destructive">{titleError}</p>}
                  </Field>

                  <Field label="Type">
                    <AndroidAdaptiveSelect
                      label="Type"
                      value={draft.type}
                      onChange={(value) =>
                        changeType(value as PersonalVaultType)
                      }
                      className={inputClass}
                      options={TYPE_OPTIONS.map((type) => ({
                        value: type.id,
                        label: type.label,
                      }))}
                    />
                  </Field>

                  <Field label={categoryLabel}>
                    <AndroidAdaptiveCreatableSelect
                      label={categoryLabel}
                      value={draft.subType}
                      onChange={(value) => {
                        const next = value.trim();
                        if (!next) return;
                        updateDraft({ subType: next });
                      }}
                      className={inputClass}
                      options={subTypeOptions}
                    />
                  </Field>

                  <Field
                    className={draft.type === "install" ? "" : "md:col-span-2"}
                    htmlFor="vault-external-link"
                    label={
                      draft.type === "install"
                        ? "Download / install link"
                        : "External link"
                    }
                  >
                    <input
                      id="vault-external-link"
                      type="url"
                      aria-invalid={Boolean(fieldErrors.link)}
                      aria-describedby={fieldErrors.link ? "vault-external-link-error" : undefined}
                      value={draft.link}
                      onChange={(event) =>
                        updateDraft({ link: event.target.value })
                      }
                      placeholder="https://..."
                      className={inputClass}
                    />
                    {fieldErrors.link && <p id="vault-external-link-error" className="text-sm text-destructive" role="alert">{fieldErrors.link}</p>}
                    <p className="text-xs text-muted-foreground">Saves a link to the website or file, not a copy of its contents.</p>
                  </Field>

                  {draft.type === "install" && (
                    <Field label="Official website" htmlFor="vault-official-website">
                      <input
                        id="vault-official-website"
                        type="url"
                        aria-invalid={Boolean(fieldErrors.officialWebsite)}
                        aria-describedby={fieldErrors.officialWebsite ? "vault-official-website-error" : undefined}
                        value={draft.officialWebsite}
                        onChange={(event) =>
                          updateDraft({ officialWebsite: event.target.value })
                        }
                        placeholder="https://..."
                        className={inputClass}
                      />
                      {fieldErrors.officialWebsite && <p id="vault-official-website-error" className="text-sm text-destructive" role="alert">{fieldErrors.officialWebsite}</p>}
                    </Field>
                  )}

                  {draft.type !== "links" && <div className={`grid gap-x-4 gap-y-5 md:col-span-2 ${draft.type === "creative" ? "" : "md:grid-cols-2"}`}>
                    {draft.type === "document" && (
                      <>
                        <Field label="Expiry date">
                          <AdaptiveDatePicker
                            label="Expiry date"
                            value={draft.expiryDate}
                            onChange={(value) =>
                              updateDraft({ expiryDate: value })
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Reference / ID hint">
                          <input
                            aria-label="Reference / ID hint"
                            value={draft.referenceHint}
                            onChange={(event) =>
                              updateDraft({ referenceHint: event.target.value })
                            }
                            placeholder="Last four digits or a safe hint"
                            className={inputClass}
                          />
                        </Field>
                      </>
                    )}

                    {draft.type === "career" && (
                      <>
                        <Field label="Issuer / organization" className="md:col-span-2">
                          <input
                            aria-label="Issuer / organization"
                            value={draft.issuer}
                            onChange={(event) =>
                              updateDraft({ issuer: event.target.value })
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Date">
                          <AdaptiveDatePicker
                            label="Date"
                            value={draft.date}
                            onChange={(value) => updateDraft({ date: value })}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Expiry date">
                          <AdaptiveDatePicker
                            label="Expiry date"
                            value={draft.expiryDate}
                            onChange={(value) =>
                              updateDraft({ expiryDate: value })
                            }
                            className={inputClass}
                          />
                        </Field>
                      </>
                    )}

                    {draft.type === "creative" && (
                      <Field label="Date">
                        <AdaptiveDatePicker
                          label="Date"
                          value={draft.date}
                          onChange={(value) => updateDraft({ date: value })}
                          className={inputClass}
                        />
                      </Field>
                    )}

                    {draft.type === "install" && (
                      <>
                        <Field label="Platform">
                          <input
                            aria-label="Platform"
                            value={draft.platform}
                            onChange={(event) =>
                              updateDraft({ platform: event.target.value })
                            }
                            placeholder="Windows, macOS, browser..."
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Install status">
                          <AndroidAdaptiveSelect
                            label="Install status"
                            value={draft.installStatus}
                            onChange={(value) =>
                              updateDraft({
                                installStatus:
                                  value as PersonalVaultDraft["installStatus"],
                              })
                            }
                            className={inputClass}
                            options={[
                              { value: "needed", label: "Needed" },
                              { value: "installed", label: "Installed" },
                              { value: "optional", label: "Optional" },
                            ]}
                          />
                        </Field>
                      </>
                    )}

                  </div>}

                  <Field label="Notes" htmlFor="vault-notes" className="md:col-span-2">
                    <FormattedTextarea
                      id="vault-notes"
                      collapsibleToolbar
                      value={draft.notes}
                      onChange={(value) => updateDraft({ notes: value })}
                      placeholder={notesPlaceholder}
                      minRows={5}
                    />
                  </Field>

                  {showImageControl && (
                    <details
                      className="border-t border-border/50 pt-3 md:col-span-2"
                      open={Boolean(draft.image)}
                    >
                      <summary className={disclosureClass}>
                        Preview image (optional)
                      </summary>
                      <Field label="External preview image" htmlFor="vault-preview-image">
                        <input
                          id="vault-preview-image"
                          type="url"
                          aria-invalid={Boolean(fieldErrors.image)}
                          aria-describedby={fieldErrors.image ? "vault-preview-image-error" : undefined}
                          value={draft.image}
                          onChange={(event) =>
                            updateDraft({ image: event.target.value })
                          }
                          placeholder="https://..."
                          className={inputClass}
                        />
                        {fieldErrors.image && <p id="vault-preview-image-error" className="text-sm text-destructive" role="alert">{fieldErrors.image}</p>}
                      </Field>
                    </details>
                  )}

                  <details className="border-t border-border/60 pt-2 md:col-span-2" open={draft.favorite || draft.showTitleInPlanning}>
                    <summary className={disclosureClass}>Pinning and planning</summary>

                    <label
                      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-t border-border/60 py-3 md:col-span-2"
                    >
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          Pin to top
                        </span>

                      </span>
                      <input
                        type="checkbox"
                        checked={draft.favorite}
                        onChange={(event) =>
                          updateDraft({ favorite: event.target.checked })
                        }
                        className="h-5 w-5 shrink-0 rounded border-border/60 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                    </label>

                    {showPlanningControl && (
                      <label
                        htmlFor="vault-show-title-in-planning"
                        className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-t border-border/60 py-3 md:col-span-2"
                      >
                        <span>
                          <span className="block text-sm font-medium text-foreground">
                            Show title in planning views
                          </span>
                          <span
                            id="vault-show-title-in-planning-help"
                            className="mt-1 block text-xs text-muted-foreground"
                          >
                            A date is required before this title can appear in Calendar, Life Hub, or Upcoming. Only the title and date appear there; other Vault details stay private.
                          </span>
                        </span>
                        <input
                          id="vault-show-title-in-planning"
                          type="checkbox"
                          checked={draft.showTitleInPlanning}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              showTitleInPlanning: event.target.checked,
                            }))
                          }
                          aria-describedby="vault-show-title-in-planning-help"
                          className="h-5 w-5 shrink-0 rounded border-border/60 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                      </label>
                    )}
                  </details>
                </div>
                {saveError ? <p role="alert" className="mt-4 text-sm text-destructive">{saveError}</p> : null}
              </form>
              <div className="mobile-action-row shrink-0 border-t border-border/60 bg-background p-4 sm:p-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestClose}
                  className="rounded-2xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="personal-vault-form"
                  className="control-button-primary rounded-2xl"
                >
                  {isEditing ? "Save changes" : "Add item"}
                </Button>
              </div>
            </motion.section>
          </div>

          <ConfirmDialog
            isOpen={showUnsavedDialog}
            title="Discard changes?"
            message="You have unsaved changes in this vault item. Close without saving?"
            confirmText="Discard"
            cancelText="Keep editing"
            isDangerous
            onCancel={() => setShowUnsavedDialog(false)}
            onConfirm={() => {
              setShowUnsavedDialog(false);
              onClose();
            }}
          />
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
