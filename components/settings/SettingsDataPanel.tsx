'use client';

import { Archive, Cloud, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/collection-controls';

function SettingsSubheading({ title, description, id }: { title: string; description?: string; id?: string }) {
  return (
    <div id={id} tabIndex={id ? -1 : undefined} className="settings-group-heading mb-2 mt-6 scroll-mt-5 first:mt-0">
      <h4 className="text-section-title">{title}</h4>
      {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function SettingsDataPanel({ transferFormat, onTransferFormatChange, onExport, onImport, onCloudSync, onOpenTrash, onClearSection, onClearAll, cloudStatus, storageUsed, deleteNotice }: {
  transferFormat: 'complete' | 'data';
  onTransferFormatChange: (format: 'complete' | 'data') => void;
  onExport: () => void;
  onImport: () => void;
  onCloudSync: () => void;
  onOpenTrash: () => void;
  onClearSection: () => void;
  onClearAll: () => void;
  cloudStatus: string;
  storageUsed: string;
  deleteNotice: string;
}) {
  return (
    <>
      <SettingsSubheading id="settings-backup-group" title="Local transfer" description="Move profile data between Caizen installations with a file saved on this device." />

      <div className="mt-4 rounded-2xl border border-border/55 bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Archive className="h-4 w-4 text-primary" aria-hidden="true" /><span>Format</span></div>
        <SegmentedControl
          label="Local transfer format"
          value={transferFormat}
          onValueChange={value => onTransferFormatChange(value as 'complete' | 'data')}
          size="compact"
          className="caizen-format-segmented-control mt-2 w-full"
          options={[
            { value: 'complete', label: 'Complete (.caizen)' },
            { value: 'data', label: 'Data only (.json)' },
          ]}
        />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {transferFormat === 'complete'
            ? 'Profile data + managed photos/files. Recommended for moving Caizen.'
            : 'Structured profile data only. Managed local photos/files are not included.'}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={onExport} className="settings-compact-action"><Download className="h-4 w-4" />Export</Button>
          <Button type="button" variant="outline" onClick={onImport} className="settings-compact-action"><Upload className="h-4 w-4" />Import</Button>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onOpenTrash} className="settings-compact-action mt-3">Recently deleted</Button>

      <SettingsSubheading
        id="settings-cloud-group"
        title="Cloud Backup and storage"
        description="Cloud Backup is an optional account-based profile snapshot for recovery and continuity across devices. Automatic Cloud Backup remains profile-scoped and is not live sync."
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="settings-stat"><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold">{cloudStatus}</p></div>
        <div className="settings-stat"><p className="text-xs text-muted-foreground">Local storage used</p><p className="font-semibold">{storageUsed}</p></div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" onClick={onCloudSync} className="settings-compact-action"><Cloud className="h-4 w-4" />Manage Cloud Backup</Button>
      </div>

      <SettingsSubheading
        id="settings-danger-group"
        title="Clear local data"
        description="Clear selected local records after confirming the scope. Backups and recovery copies are preserved where stated."
      />
      <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={onClearSection} className="h-auto min-h-11 rounded-2xl border-destructive/35 bg-input px-4 py-3 text-sm font-black text-destructive">Clear section data</Button>
          <Button type="button" variant="outline" onClick={onClearAll} className="h-auto min-h-11 rounded-2xl border-destructive/35 bg-input px-4 py-3 text-sm font-black text-destructive">Clear all local data</Button>
        </div>
      </div>
      {deleteNotice && <p className="mt-3 text-xs font-bold text-destructive">{deleteNotice}</p>}
    </>
  );
}
