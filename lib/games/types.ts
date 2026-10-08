export interface GameCustomMetric {
  id: string;
  label: string;
  value: string;
  showOnCard?: boolean;
}

export type GuideItemKind = 'checklist' | 'note' | 'resource';

export interface ExtendedGuideItem {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  kind?: GuideItemKind;
  resources: Array<{
    id: string;
    type: 'uploaded-image' | 'image-url' | 'link';
    label?: string;
    value: string;
  }>;
}
