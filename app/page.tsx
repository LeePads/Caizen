import LandingPageClient from '@/components/landing/LandingPageClient';
import CaizenAppLayout from '@/app/app/layout';
import CaizenAppPage from '@/app/app/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const IS_CAPACITOR_BUILD =
  process.env.NEXT_PUBLIC_CAPACITOR_BUILD === '1';

export default function LandingPage() {
  if (IS_CAPACITOR_BUILD) {
    return (
      <CaizenAppLayout>
        <CaizenAppPage />
      </CaizenAppLayout>
    );
  }

  return <LandingPageClient />;
}
