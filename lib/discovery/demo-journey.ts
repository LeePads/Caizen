import type { SectionId } from './section-meta';
export const DEMO_CHAPTERS: ReadonlyArray<{ title: string; sections: SectionId[] }> = [
  { title: 'See the whole picture', sections: ['dashboard'] },
  { title: 'Shape your day', sections: ['lifehub', 'health'] },
  { title: 'Make informed decisions', sections: ['balance', 'inventory'] },
  { title: 'Care for what you use', sections: ['skincare'] },
  { title: 'Keep work in context', sections: ['workhub', 'personalhub'] },
  { title: 'Make room for enjoyment', sections: ['entertainment', 'music'] },
];
export const DEMO_JOURNEY = DEMO_CHAPTERS.flatMap(chapter => chapter.sections);
export const DEMO_LESSONS: Record<SectionId, { notice: string; tryThis: string; feature?: string; recordId?: string }> = {
  dashboard: { notice: 'Personal plans and work commitments share the whole-life view. Their records still belong to their own sections.', tryThis: 'Open an upcoming item and see where it comes from.' },
  lifehub: { notice: 'A task is something to finish. A routine repeats. Dates reserve time, and the journal keeps the reflection.', tryThis: 'Try completing the morning supplement routine.', feature: 'routines' },
  health: { notice: 'A single sleep log describes one night. History helps you notice patterns without treating every day as a verdict.', tryThis: 'Compare the weight history with recent sleep logs.', feature: 'weight' },
  balance: { notice: 'Protected savings are different from spending money. Upcoming commitments and purchase plans help explain what remains available.', tryThis: 'Inspect the desk-lamp transaction and its linked Inventory item.', feature: 'transactions' },
  inventory: { notice: 'The desk lamp has a purchase price, a current value, and a storage location. These answer different questions.', tryThis: 'Open the desk lamp and compare its current and replacement values.' },
  skincare: { notice: 'An active product and a finished product have different lifecycles. Usage history records what actually happened.', tryThis: 'Record a use of an active sample product.' },
  workhub: { notice: 'Aurora groups a project, related tasks, a bug, and notes. Its deadlines can contribute to the whole-life view.', tryThis: 'Open Aurora and inspect its related work.' },
  personalhub: { notice: 'A document or setup reference can remain useful long after an active project ends. Sample identity details do not represent real people or documents.', tryThis: 'Open the sample passport reference.' },
  entertainment: { notice: 'Planned, in-progress, and completed items help you choose what to enjoy next. Demo release information is illustrative.', tryThis: 'Update the progress of an in-progress sample item.' },
  music: { notice: 'Saved songs and playlists keep their provider links together. Playback controls depend on the provider.', tryThis: 'Find a saved song and inspect its provider link, then explore another section.' },
};
