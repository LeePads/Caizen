import type { CareerCredential, CareerCredentialExpiryStatus } from '@/lib/types';

export const CAREER_EXPIRING_SOON_DAYS = 30;

export function getCareerCredentialExpiryStatus(
  credential: Pick<CareerCredential, 'expiryDate' | 'noExpiry'>,
  today = new Date(),
): CareerCredentialExpiryStatus {
  if (credential.noExpiry || !credential.expiryDate) return 'No expiry';
  const expiry = new Date(credential.expiryDate);
  if (Number.isNaN(expiry.getTime())) return 'No expiry';
  expiry.setHours(0, 0, 0, 0);
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - current.getTime()) / 86_400_000);
  if (days < 0) return 'Expired';
  if (days <= CAREER_EXPIRING_SOON_DAYS) return 'Expiring soon';
  return 'Valid';
}

