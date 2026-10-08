// Structured output of Mochi's analysis layer. Analysis never renders UI —
// it only produces these observations; presentation (Dashboard bubble,
// Mochi modal) decides which ones to show and how to phrase them.

export type MochiImportance = 'low' | 'medium' | 'high';

export type MochiObservationKind =
  | 'attention'
  | 'progress'
  | 'pattern'
  | 'opportunity'
  | 'upcoming'
  | 'quiet';

/** Same shape family as SectionFeatureRequest/DashboardNavigationTarget. */
export type MochiNavigationTarget = {
  section: string;
  feature?: string;
  recordId?: string;
  dateKey?: string;
};

export type MochiObservation = {
  id: string;
  section: string;
  importance: MochiImportance;
  kind: MochiObservationKind;
  title: string;
  detail: string;
  /** Omitted when the observation is informational only (e.g. a quiet section). */
  target?: MochiNavigationTarget;
};
