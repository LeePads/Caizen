import type {
  ChecklistFrequency,
  HealthRoutineEvidence,
  LifeHubLinkedContext,
} from '@/lib/types';

export type RoutineTemplateId =
  | 'custom'
  | 'sleep'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'daily-food-log'
  | 'workout'
  | 'stretch'
  | 'journal'
  | 'skincare'
  | 'supplements'
  | 'budget-review';

export type RoutineTemplatePreset = {
  id: RoutineTemplateId;
  title: string;
  description: string;
  category: string;
  frequency: ChecklistFrequency;
  linkedSection?: string;
  linkedView?: string;
  linkedContext?: LifeHubLinkedContext;
  healthRoutineEvidence?: HealthRoutineEvidence;
  automatic: boolean;
};

export const ROUTINE_TEMPLATES: readonly RoutineTemplatePreset[] = [
  {
    id: 'custom',
    title: 'Custom routine',
    description: 'Start with a blank routine and choose every detail yourself.',
    category: 'personal',
    frequency: 'daily',
    automatic: false,
  },
  {
    id: 'sleep',
    title: 'Track sleep',
    description: 'Completes when a qualifying sleep entry is saved in Health.',
    category: 'wellness',
    frequency: 'daily',
    linkedSection: 'health',
    linkedView: 'sleep',
    healthRoutineEvidence: { mode: 'sleep-tracked' },
    automatic: true,
  },
  ...(['breakfast', 'lunch', 'dinner'] as const).map(meal => ({
    id: meal,
    title: `Track ${meal}`,
    description: `Completes when an explicitly classified ${meal} entry is saved.`,
    category: 'tracking',
    frequency: 'daily' as const,
    linkedSection: 'health',
    linkedView: 'food',
    healthRoutineEvidence: { mode: 'meal-tracked' as const, meal },
    automatic: true,
  })),
  {
    id: 'daily-food-log',
    title: 'Complete daily food log',
    description: 'Completes after breakfast, lunch, and dinner are all logged.',
    category: 'tracking',
    frequency: 'daily',
    linkedSection: 'health',
    linkedView: 'food',
    healthRoutineEvidence: { mode: 'meals-complete' },
    automatic: true,
  },
  {
    id: 'workout',
    title: 'Complete workout',
    description: 'Completes when any workout session is finished in Health.',
    category: 'wellness',
    frequency: 'daily',
    linkedSection: 'health',
    linkedView: 'workout',
    healthRoutineEvidence: { mode: 'workout-completed', scope: 'any' },
    automatic: true,
  },
  {
    id: 'stretch',
    title: 'Complete stretch',
    description: 'Completes when a finished workout includes a completed stretch.',
    category: 'wellness',
    frequency: 'daily',
    linkedSection: 'health',
    linkedView: 'workout',
    healthRoutineEvidence: { mode: 'stretch-completed', scope: 'any' },
    automatic: true,
  },
  {
    id: 'journal',
    title: 'Write in journal',
    description: 'Completes when a meaningful entry is saved for the routine date.',
    category: 'personal',
    frequency: 'daily',
    linkedContext: { section: 'journal', type: 'journal-entry' },
    automatic: true,
  },
  {
    id: 'skincare',
    title: 'Skincare',
    description: 'Keeps your Skincare section one tap away; completion stays manual.',
    category: 'wellness',
    frequency: 'daily',
    linkedSection: 'skincare',
    automatic: false,
  },
  {
    id: 'supplements',
    title: 'Take supplements',
    description: 'Opens Supplements quickly; completion stays manual.',
    category: 'wellness',
    frequency: 'daily',
    linkedSection: 'health',
    linkedView: 'supplements',
    automatic: false,
  },
  {
    id: 'budget-review',
    title: 'Budget review',
    description: 'Opens Balance for a regular review; completion stays manual.',
    category: 'finance',
    frequency: 'weekly',
    linkedSection: 'balance',
    automatic: false,
  },
];

export function getRoutineTemplate(id: RoutineTemplateId): RoutineTemplatePreset {
  return ROUTINE_TEMPLATES.find(template => template.id === id) || ROUTINE_TEMPLATES[0];
}
