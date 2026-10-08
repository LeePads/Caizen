'use client';

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MediaAsset } from '@/lib/types';
import { getMediaAsset } from '@/lib/storage/media-repository';
import { mediaStorage, releaseMediaDisplayUrl } from '@/lib/storage/media-storage';
import { processPendingMediaCleanup, queueMediaCleanup } from '@/lib/storage/media-cleanup';
import { normalizeWorkAttachmentIds } from '@/lib/work-attachments';

const ACCEPTED_WORK_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
].join(',');

type WorkAttachmentRow = {
  id: string;
  asset?: MediaAsset;
  available: boolean;
};

type WorkAttachmentsFieldProps = {
  profileId: string;
  ownerId: string;
  attachmentAssetIds: string[];
  persistedAssetIds: string[];
  onChange: (assetIds: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

const formatBytes = (sizeBytes: number) => {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const typeLabel = (mimeType: string) => {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'text/plain') return 'Text';
  return mimeType.split('/')[1]?.toUpperCase() || 'File';
};

export function WorkAttachmentsField({
  profileId,
  ownerId,
  attachmentAssetIds,
  persistedAssetIds,
  onChange,
  onUploadingChange,
}: WorkAttachmentsFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceId = useId();
  const headingId = `work-attachments-heading-${instanceId}`;
  const helpId = `work-attachments-help-${instanceId}`;
  const listId = `work-attachment-list-${instanceId}`;
  const [rows, setRows] = useState<WorkAttachmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(attachmentAssetIds.length > 0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const persistedIds = useMemo(() => new Set(persistedAssetIds), [persistedAssetIds]);
  const idsKey = JSON.stringify(attachmentAssetIds);

  useEffect(() => {
    let active = true;
    const ids = JSON.parse(idsKey) as string[];
    setLoading(ids.length > 0);
    const load = async () => {
      const loaded = await Promise.all(
        ids.map(async id => {
          const asset = await getMediaAsset(id);
          if (!asset || asset.profileId !== profileId) {
            return { id, available: false } satisfies WorkAttachmentRow;
          }
          return {
            id,
            asset,
            available: await mediaStorage.exists(id),
          } satisfies WorkAttachmentRow;
        }),
      );
      if (active) setRows(loaded);
    };
    void load().catch(() => {
      if (active) setError('Could not load attachments. Close and reopen the editor to try again. Your files have not been removed.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [idsKey, profileId]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    onUploadingChange?.(true);
    setError(null);
    try {
      const asset = await mediaStorage.save(file, {
        profileId,
        ownerType: 'work',
        ownerId,
        role: 'attachment',
        fileName: file.name,
      });
      onChange(normalizeWorkAttachmentIds([...attachmentAssetIds, asset.id]) || []);
    } catch (uploadError) {
      setError(
        `Could not add the attachment. ${uploadError instanceof Error ? `${uploadError.message} ` : ''}Try choosing the file again.`,
      );
    } finally {
      setBusy(false);
      onUploadingChange?.(false);
    }
  };

  const remove = (assetId: string) => {
    if (!persistedIds.has(assetId)) {
      queueMediaCleanup({
        profileId,
        assetIds: [assetId],
        reason: 'attachment-detached',
      });
      void processPendingMediaCleanup();
    }
    onChange(attachmentAssetIds.filter(id => id !== assetId));
  };

  const open = async (row: WorkAttachmentRow) => {
    if (!row.asset) return;
    setOpeningId(row.id);
    setError(null);
    try {
      const url = await mediaStorage.getDisplayUrl(row.id, 'full', profileId);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.download = row.asset.fileName;
      anchor.click();
      window.setTimeout(() => releaseMediaDisplayUrl(row.id, 'full'), 1_000);
    } catch (openError) {
      setError(
        `Could not download this attachment. ${openError instanceof Error ? `${openError.message} ` : ''}Try downloading it again.`,
      );
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="@container/attachments min-w-0 border-t border-border/60 pt-4"
    >
      <div className="flex flex-col items-start gap-3 @min-[28rem]/attachments:flex-row @min-[28rem]/attachments:justify-between">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-4 w-4 text-primary" aria-hidden="true" />
            Attachments
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG, WebP, HEIC/HEIF, PDF, or plain text · 25 MB per file. Stored in this profile.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_WORK_ATTACHMENT_TYPES}
          onChange={handleUpload}
          className="sr-only"
          aria-describedby={helpId}
          aria-label="Choose attachment file"
          tabIndex={-1}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-controls={listId}
          className="min-h-11 shrink-0 rounded-xl"
        >
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Paperclip className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
          {busy ? 'Saving…' : 'Add attachment'}
        </Button>
      </div>
      <p id={helpId} className="sr-only">
        Files are stored in this profile. Removing an attachment here takes effect when you save the record.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      <div id={listId} className="mt-3 grid gap-2" aria-busy={loading || busy}>
        {loading ? <p role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading attachments…</p> : rows.length === 0 && !error ? (
          <p className="py-2 text-xs text-muted-foreground">
            No attachments yet.
          </p>
        ) : (
          rows.map(row => (
            <div key={row.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/50 py-3 @min-[28rem]/attachments:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {row.asset?.fileName || 'Unavailable attachment'}
                </p>
                <p className="text-caption text-muted-foreground">
                  {row.available && row.asset
                    ? `${typeLabel(row.asset.mimeType)} · ${formatBytes(row.asset.sizeBytes)}`
                    : 'File unavailable on this device'}
                </p>
              </div>
              {row.available && row.asset && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void open(row)}
                  disabled={openingId === row.id}
                  aria-label={`Download ${row.asset.fileName}`}
                  className="col-start-2 row-start-2 min-h-11 justify-self-start rounded-lg text-xs @min-[28rem]/attachments:col-start-auto @min-[28rem]/attachments:row-start-auto"
                >
                  {openingId === row.id ? 'Downloading…' : 'Download'}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(row.id)}
                disabled={busy}
                aria-label={`Remove ${row.asset?.fileName || 'unavailable attachment'}`}
                className="col-start-3 row-start-1 min-h-11 min-w-11 rounded-lg text-destructive hover:text-destructive @min-[28rem]/attachments:col-start-4"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Remove</span>
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
