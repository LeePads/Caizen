'use client';

import { useAppContext } from '@/lib/context';
import { getPersonalityDefinition, PERSONALITY_ORDER } from '@/lib/mochi/personality';
import { DEFAULT_PET_PERSONALITY } from '@/lib/pets/normalization';

export function CompanionSettings({ showHeading = true }: { showHeading?: boolean }) {
  const { pet, updatePet } = useAppContext();
  const petName = pet?.name || 'Mochi';
  const personality = pet?.personality || DEFAULT_PET_PERSONALITY;

  return (
    <section aria-labelledby={showHeading ? 'settings-companion-title' : undefined}>
      {showHeading && <h4 id="settings-companion-title" tabIndex={-1} className="scroll-mt-5 text-section-title">Companion</h4>}
      <p className="mt-1 text-body-sm text-muted-foreground">Choose how {petName} speaks.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PERSONALITY_ORDER.map(option => {
          const definition = getPersonalityDefinition(option);
          const active = option === personality;
          return (
            <button
              key={option}
              type="button"
              onClick={() => updatePet({ personality: option })}
              aria-pressed={active}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary/40 bg-primary/10' : 'border-border/50 hover:bg-muted'}`}
            >
              <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{definition.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{definition.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
