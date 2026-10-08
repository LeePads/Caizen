import type { Metadata } from 'next';

import { WorkspaceStartupGate } from '@/components/storage/WorkspaceStartupGate';

import AppProviders from '@/components/providers/AppProviders';
import { NativeAppShell } from '@/components/native/NativeAppShell';
import { NativeStartupGate } from '@/components/native/NativeStartupGate';
import { StorageMigrationNotice } from '@/components/storage/StorageMigrationNotice';
import CloudRecoveryHost from '@/components/common/CloudRecoveryHost';

export const metadata: Metadata = {
  title: { absolute: 'Caizen' },
  robots: {
    index: false,
    follow: false,
  },
};

export default function CaizenAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <NativeStartupGate>
        <WorkspaceStartupGate><AppProviders>
          <div className="caizen-root relative flex min-h-dvh w-full flex-col overflow-x-clip">
            <NativeAppShell />
            <StorageMigrationNotice />

            <div className="caizen-layout-content relative z-[1] min-h-0 flex-1 overflow-x-clip">
              {children}
            </div>
          </div>
        </AppProviders></WorkspaceStartupGate>
      </NativeStartupGate>
      <CloudRecoveryHost />
    </>
  );
}
