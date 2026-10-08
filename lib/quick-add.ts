export type QuickAddKind =
  | 'wallet'
  | 'inventory'
  | 'wishlist'
  | 'supplement'
  | 'food'
  | 'weight'
  | 'sleep'
  | 'water'
  | 'expense'
  | 'journal'
  | 'game'
  | 'media'
  | 'music'
  | 'skincare'
  | 'task'
  | 'routine'
  | 'date'
  | 'work'
  | 'personal';

export type QuickAddRequest = {
  kind: QuickAddKind;
  initialDate?: string;
};
