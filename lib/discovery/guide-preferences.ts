import { getStoreValue, updateStoreValue } from '../storage/database';
import { STORES } from '../storage/schema';
import { getSectionDiscoveryMeta } from './section-meta';

type GuidePreferences = { firstActionSection?: string | null; dismissed?: string[] };
const keyFor = (profileId: string) => 'caizen-guide-preferences-v1:' + profileId;
export async function readGuidePreferences(profileId: string): Promise<GuidePreferences> {
  const saved = await getStoreValue<{ value: GuidePreferences }>(STORES.settings, keyFor(profileId));
  const value = saved?.value;
  return { firstActionSection: typeof value?.firstActionSection === 'string' && getSectionDiscoveryMeta(value.firstActionSection) ? value.firstActionSection : null,
    dismissed: Array.isArray(value?.dismissed) ? value.dismissed.filter(id => typeof id === 'string' && getSectionDiscoveryMeta(id)) : [] };
}
export async function rememberFirstAction(profileId: string, section: string | null) {
  const key = keyFor(profileId);
  await updateStoreValue<{ key: string; value: GuidePreferences }>(STORES.settings, key, current => ({ key, value: { ...current?.value, firstActionSection: section } }));
}
export async function rememberGuideDismissal(profileId: string, section: string) {
  const key = keyFor(profileId);
  await updateStoreValue<{ key: string; value: GuidePreferences }>(STORES.settings, key, current => ({ key, value: {
    ...current?.value, firstActionSection: null, dismissed: [...new Set([...(Array.isArray(current?.value.dismissed) ? current.value.dismissed : []), section])],
  } }));
}
