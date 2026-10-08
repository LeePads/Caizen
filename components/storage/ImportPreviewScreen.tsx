'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ChevronDown,
  FileJson,
  RotateCcw,
  X,
} from 'lucide-react';

import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import type {
  ImportIntegrityReport,
  ImportWarningGroup,
} from '@/lib/storage/import-integrity';
import type { RecoverySnapshot } from '@/lib/storage/backup-repository';

export type ImportMode =
  | 'new-profiles'
  | 'merge'
  | 'replace';

export type ImportPreviewPresentation =
  | 'portal'
  | 'embedded';

const MODE_CARDS: Array<{
  value: ImportMode;
  label: string;
  description: string;
}> = [
  {
    value: 'new-profiles',
    label: 'Import as new profiles',
    description:
      'Keeps every profile already on this device and adds the imported profiles alongside them.',
  },
  {
    value: 'merge',
    label: 'Merge',
    description:
      'Matches records by stable ID. When both sides changed, the newer version wins.',
  },
  {
    value: 'replace',
    label: 'Replace',
    description:
      'Removes the profiles on this device and keeps only the imported profiles. Requires confirmation.',
  },
];

const formatDate = (
  value: string | null,
) =>
  value
    ? new Date(value).toLocaleDateString(
        undefined,
        { dateStyle: 'medium' },
      )
    : 'Not detected';

const moduleLabel = (name: string) =>
  name
    .replace(/^health\./, '')
    .replace(
      /([a-z])([A-Z])/g,
      '$1 $2',
    )
    .replace(
      /^./,
      character =>
        character.toUpperCase(),
    );

function WarningGroupRow({
  group,
}: {
  group: ImportWarningGroup;
}) {
  const [open, setOpen] =
    useState(false);

  return (
    <li className="caizen-import-warning">
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setOpen(value => !value)
        }
        className="caizen-import-warning-toggle"
      >
        <span>
          <strong>
            {moduleLabel(group.module)}
          </strong>
          <span className="caizen-import-warning-summary">
            {group.summary}
          </span>
        </span>

        <ChevronDown
          aria-hidden
          data-open={open}
          size={16}
        />
      </button>

      {open ? (
        <ul className="caizen-import-warning-examples">
          {group.examples.map(
            (example, index) => (
              <li
                key={`${example}-${index}`}
              >
                {example}
              </li>
            ),
          )}

          {group.count >
          group.examples.length ? (
            <li className="caizen-import-warning-more">
              and{' '}
              {(
                group.count -
                group.examples.length
              ).toLocaleString()}{' '}
              more like this
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export default function ImportPreviewScreen({
  report,
  fileName,
  mode,
  onModeChange,
  onCancel,
  onConfirm,
  onSaveReport,
  onRecover,
  recovery,
  busy,
  error,
  mediaBytes,
  backupBytes,
  completedMessage,
  missingMedia = [],
  presentation = 'portal',
}: {
  report: ImportIntegrityReport;
  fileName: string;
  mode: ImportMode;
  onModeChange: (
    mode: ImportMode,
  ) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onSaveReport: () => void;
  onRecover?: () => void;
  recovery?: RecoverySnapshot | null;
  busy?: boolean;
  error?: string | null;
  mediaBytes?: number;
  backupBytes?: number;
  completedMessage?: string | null;
  missingMedia?: string[];
  presentation?: ImportPreviewPresentation;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [replaceConfirmed, setReplaceConfirmed] =
    useState(false);
  const [incompleteBackupConfirmed, setIncompleteBackupConfirmed] =
    useState(false);

  const [mounted, setMounted] =
    useState(false);

  const isPortal =
    presentation === 'portal';

  useEffect(() => {
    setMounted(true);
  }, []);

  useOverlayLifecycle(
    isPortal && mounted,
    onCancel,
    { containerRef: panelRef },
  );

  useEffect(() => {
    if (mode !== 'replace') {
      setReplaceConfirmed(false);
      setIncompleteBackupConfirmed(false);
    }
  }, [mode]);

  const incompleteMedia = useMemo(
    () => [...new Set(missingMedia.filter(item => typeof item === 'string' && item.trim()))],
    [missingMedia],
  );

  const totalRecords = useMemo(
    () =>
      Object.values(
        report.recordCounts,
      ).reduce(
        (sum, count) =>
          sum + count,
        0,
      ),
    [report.recordCounts],
  );

  const blockers = useMemo(() => {
    const reasons: string[] = [];

    if (
      report.blockingInvalidCount > 0
    ) {
      reasons.push(
        `${report.blockingInvalidCount.toLocaleString()} record(s) have a required date Caizen cannot read. Importing them would file those records under the wrong day.`,
      );
    }

    if (
      report.missingDateCount > 0
    ) {
      reasons.push(
        `${report.missingDateCount.toLocaleString()} record(s) are missing a required date. Caizen will not substitute today's date.`,
      );
    }

    if (
      report.duplicateIds.length > 0
    ) {
      reasons.push(
        `${report.duplicateIds.length.toLocaleString()} record ID(s) appear more than once, so Caizen cannot determine which copy is correct.`,
      );
    }

    return reasons;
  }, [report]);

  const needsReplaceConfirmation =
    mode === 'replace' &&
    !replaceConfirmed;

  const needsIncompleteBackupConfirmation =
    mode === 'replace' &&
    incompleteMedia.length > 0 &&
    !incompleteBackupConfirmed;

  const canConfirm =
    report.canImport &&
    !needsReplaceConfirmation &&
    !needsIncompleteBackupConfirmation &&
    !busy &&
    !completedMessage;

  if (!mounted) return null;

  const content = (
    <section
      ref={panelRef}
      tabIndex={isPortal ? -1 : undefined}
      className={
        isPortal
          ? 'caizen-import-screen'
          : 'caizen-import-embedded flex min-h-0 max-h-[min(70dvh,46rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/45'
      }
      role={isPortal ? 'dialog' : 'region'}
      aria-modal={
        isPortal ? true : undefined
      }
      aria-labelledby="caizen-import-title"
      data-caizen-overlay={
        isPortal ? 'open' : undefined
      }
      data-caizen-nested-flow={
        isPortal ? 'open' : undefined
      }
    >
      {isPortal ? (
        <header className="caizen-import-header">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel import"
            className="android-icon-button"
          >
            <X
              aria-hidden
              size={20}
            />
          </button>

          <div>
            <h1 id="caizen-import-title">
              Import preview
            </h1>

            <p className="caizen-import-filename">
              <FileJson
                aria-hidden
                size={12}
              />{' '}
              {fileName}
            </p>
          </div>
        </header>
      ) : (
        <header className="flex shrink-0 items-start gap-3 border-b border-border/55 px-4 py-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileJson className="h-4 w-4" />
          </span>

          <div className="min-w-0">
            <h2
              id="caizen-import-title"
              className="text-base font-black"
            >
              Import preview
            </h2>

            <p className="mt-1 break-all text-xs text-muted-foreground">
              {fileName}
            </p>
          </div>
        </header>
      )}

      <div
        className={
          isPortal
            ? 'caizen-import-body'
            : 'caizen-import-body min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5'
        }
      >
        {completedMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200" role="status">
            {completedMessage}
          </div>
        ) : null}

        {error ? (
          <div
            className="caizen-import-blocker"
            role="alert"
          >
            <p className="caizen-import-blocker-title">
              <AlertTriangle
                aria-hidden
                size={16}
              />{' '}
              Import failed
            </p>

            <p>{error}</p>

            {recovery &&
            onRecover ? (
              <button
                type="button"
                className="caizen-import-recover"
                onClick={onRecover}
              >
                <RotateCcw
                  aria-hidden
                  size={14}
                />{' '}
                Restore previous data
              </button>
            ) : null}
          </div>
        ) : null}

        <dl className="caizen-import-stats">
          <Stat
            label="Schema"
            value={
              report.schemaVersion ??
              'Legacy'
            }
          />
          <Stat
            label="Profiles"
            value={report.profileCount}
          />
          <Stat
            label="Records"
            value={totalRecords.toLocaleString()}
          />
          {backupBytes !== undefined ? (
            <Stat label="Backup size" value={formatBytes(backupBytes)} />
          ) : null}
          <Stat
            label="Media"
            value={mediaBytes === undefined
              ? report.mediaCount.toLocaleString()
              : `${report.mediaCount.toLocaleString()} · ${formatBytes(mediaBytes)}`}
          />
          <Stat
            label="Invalid dates"
            value={report.invalidDateCount.toLocaleString()}
            tone={
              report.blockingInvalidCount
                ? 'bad'
                : report.invalidDateCount
                  ? 'warn'
                  : undefined
            }
          />
          <Stat
            label="Missing dates"
            value={report.missingDateCount.toLocaleString()}
            tone={
              report.missingDateCount
                ? 'bad'
                : undefined
            }
          />
          <Stat
            label="Duplicate IDs"
            value={report.duplicateIds.length.toLocaleString()}
            tone={
              report.duplicateIds.length
                ? 'bad'
                : undefined
            }
          />
          <Stat
            label="Profile conflicts"
            value={
              report.profileConflicts
                .length
            }
            tone={
              report.profileConflicts
                .length
                ? 'warn'
                : undefined
            }
          />
        </dl>

        <p className="caizen-import-range">
          {formatDate(
            report.earliestDate,
          )}{' '}
          &ndash;{' '}
          {formatDate(report.latestDate)}
        </p>

        {report.invalidDateCount >
        report.blockingInvalidCount ? (
          <p className="caizen-import-note">
            {(
              report.invalidDateCount -
              report.blockingInvalidCount
            ).toLocaleString()}{' '}
            record(s) had an unreadable
            non-essential date that was
            cleared. This does not block
            the import.
          </p>
        ) : null}

        <section className="caizen-import-section">
          <h2>Records by module</h2>

          <ul className="caizen-import-modules">
            {Object.entries(
              report.recordCounts,
            )
              .filter(
                ([, count]) =>
                  count > 0,
              )
              .sort(
                (left, right) =>
                  right[1] - left[1],
              )
              .map(
                ([name, count]) => (
                  <li key={name}>
                    <span>
                      {moduleLabel(name)}
                    </span>
                    <strong>
                      {count.toLocaleString()}
                    </strong>
                  </li>
                ),
              )}

            {totalRecords === 0 ? (
              <li className="caizen-import-empty">
                No records found in this
                file.
              </li>
            ) : null}
          </ul>
        </section>

        {blockers.length > 0 ? (
          <div
            className="caizen-import-blocker"
            role="alert"
          >
            <p className="caizen-import-blocker-title">
              <AlertTriangle
                aria-hidden
                size={16}
              />{' '}
              This file cannot be imported
              safely
            </p>

            <ul>
              {blockers.map(reason => (
                <li key={reason}>
                  {reason}
                </li>
              ))}
            </ul>

            <p className="caizen-import-blocker-help">
              Save the diagnostic report,
              correct the listed records in
              the original file, then import
              again. Nothing on this device
              has been changed.
            </p>
          </div>
        ) : null}

        {incompleteMedia.length > 0 ? (
          <div className="caizen-import-blocker" role="alert">
            <p className="caizen-import-blocker-title">
              <AlertTriangle aria-hidden size={16} /> This is not a complete backup
            </p>
            <p>
              {incompleteMedia.length.toLocaleString()} managed media file{incompleteMedia.length === 1 ? '' : 's'} referenced by this .caizen archive are missing. Structured profile data can still be imported, but those media bytes cannot be restored.
            </p>
            <ul>
              {incompleteMedia.slice(0, 3).map(id => <li key={id}>{id}</li>)}
              {incompleteMedia.length > 3 ? <li>and {(incompleteMedia.length - 3).toLocaleString()} more</li> : null}
            </ul>
          </div>
        ) : null}

        {report.warningGroups.length >
        0 ? (
          <section className="caizen-import-section">
            <h2>Warnings</h2>

            <ul className="caizen-import-warnings">
              {report.warningGroups.map(
                group => (
                  <WarningGroupRow
                    key={`${group.module}-${group.field}-${group.kind}`}
                    group={group}
                  />
                ),
              )}
            </ul>

            <button
              type="button"
              className="caizen-import-secondary"
              onClick={onSaveReport}
            >
              Save diagnostic report
            </button>

            {report.dateIssuesTruncated ? (
              <p className="caizen-import-note">
                The report lists the first{' '}
                {report.dateIssues.length.toLocaleString()}{' '}
                of{' '}
                {report.totalDateIssueCount.toLocaleString()}{' '}
                issues.
              </p>
            ) : null}
          </section>
        ) : null}

        {!completedMessage && report.canImport ? <fieldset className="caizen-import-section caizen-import-modes">
          <legend>
            <h2>
              Where should this go?
            </h2>
          </legend>

          {MODE_CARDS.map(card => (
            <button
              key={card.value}
              type="button"
              role="radio"
              aria-checked={
                mode === card.value
              }
              data-selected={
                mode === card.value
              }
              onClick={() =>
                onModeChange(card.value)
              }
              className="caizen-import-mode"
            >
              <strong>
                {card.label}
              </strong>
              <span>
                {card.description}
              </span>
            </button>
          ))}

          {mode === 'replace' ? (
            <>
              <label className="caizen-import-replace-confirm">
                <input
                  type="checkbox"
                  checked={
                    replaceConfirmed
                  }
                  onChange={event =>
                    setReplaceConfirmed(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  I understand the{' '}
                  {report.profileCount === 1
                    ? 'profile'
                    : 'profiles'}{' '}
                  currently on this device
                  will be removed.
                </span>
              </label>
              {incompleteMedia.length > 0 ? (
                <label className="caizen-import-replace-confirm">
                  <input
                    type="checkbox"
                    checked={incompleteBackupConfirmed}
                    onChange={event => setIncompleteBackupConfirmed(event.target.checked)}
                  />
                  <span>
                    I understand Replace will restore structured data but cannot restore {incompleteMedia.length.toLocaleString()} missing managed media file{incompleteMedia.length === 1 ? '' : 's'}.
                  </span>
                </label>
              ) : null}
            </>
          ) : null}
        </fieldset> : null}
      </div>

      <footer className="caizen-import-actions">
        <button
          type="button"
          onClick={onCancel}
          className="caizen-import-cancel"
          disabled={busy}
        >
          {completedMessage ? 'Close and reload' : 'Cancel'}
        </button>

        {!completedMessage && report.canImport ? <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="caizen-import-confirm"
        >
          {busy
            ? 'Importing…'
            : 'Import'}
        </button> : null}
      </footer>
    </section>
  );

  return isPortal
    ? createPortal(
        content,
        document.body,
      )
    : content;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'bad' | 'warn';
}) {
  return (
    <div data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
