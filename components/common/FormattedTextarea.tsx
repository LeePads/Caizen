'use client';

import { type ComponentType, useId, useRef, useState } from 'react';
import {
  Bold,
  CheckSquare,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type FormatAction =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'bullet'
  | 'number'
  | 'check'
  | 'divider'
  | 'link';

type FormattedTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  maxLength?: number;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  'aria-label'?: string;
  showToolbar?: boolean;
  collapsibleToolbar?: boolean;
};

const actions: {
  id: FormatAction;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: 'heading', label: 'Heading', icon: Heading },
  { id: 'bold', label: 'Bold', icon: Bold },
  { id: 'italic', label: 'Italic', icon: Italic },
  { id: 'bullet', label: 'Bullet list', icon: List },
  { id: 'number', label: 'Numbered list', icon: ListOrdered },
  { id: 'check', label: 'Checkbox list', icon: CheckSquare },
  { id: 'divider', label: 'Divider', icon: Minus },
  { id: 'link', label: 'Link', icon: Link },
];

function formatSelection(action: FormatAction, selected: string) {
  const text = selected || '';

  if (action === 'bold') return `**${text || 'bold text'}**`;
  if (action === 'italic') return `_${text || 'italic text'}_`;
  if (action === 'heading') return `## ${text || 'Heading'}`;
  if (action === 'divider') return `${text ? `${text}\n` : ''}---`;
  if (action === 'link') return `[${text || 'link text'}](https://)`;

  const lines = text ? text.split('\n') : [''];
  return lines
    .map((line, index) => {
      if (action === 'bullet') return `- ${line || 'List item'}`;
      if (action === 'number') return `${index + 1}. ${line || 'List item'}`;
      return `- [ ] ${line || 'Task'}`;
    })
    .join('\n');
}

export default function FormattedTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  minRows = 5,
  maxLength,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-label': ariaLabel,
  showToolbar = true,
  collapsibleToolbar = false,
}: FormattedTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarId = useId();
  const [toolbarExpanded, setToolbarExpanded] = useState(false);

  const applyFormat = (action: FormatAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const formatted = formatSelection(action, selected);
    const nextValue = `${value.slice(0, start)}${formatted}${value.slice(end)}`;

    onChange(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + formatted.length);
    });
  };

  return (
    <div data-caizen-focus-shell="true" className="caizen-formatted-textarea overflow-hidden rounded-2xl border border-border/60 bg-background/60 transition-colors">
      {showToolbar && collapsibleToolbar && (
        <button
          type="button"
          aria-expanded={toolbarExpanded}
          aria-controls={toolbarId}
          onClick={() => setToolbarExpanded(current => !current)}
          className="min-h-11 w-full px-4 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {toolbarExpanded ? 'Hide formatting' : 'Show formatting'}
        </button>
      )}
      {showToolbar ? <div id={toolbarId} hidden={collapsibleToolbar && !toolbarExpanded} role="group" aria-label="Text formatting" className={collapsibleToolbar && !toolbarExpanded ? 'hidden' : 'flex flex-wrap gap-1 border-b border-border/50 bg-background/45 p-2'}>
        {actions.map(action => {
          const Icon = action.icon;

          return (
            <Tooltip key={action.id}><TooltipTrigger asChild><button
              type="button"
              onClick={() => applyFormat(action.id)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={action.label}
            >
              <Icon className="h-4 w-4" />
            </button></TooltipTrigger><TooltipContent>{action.label}</TooltipContent></Tooltip>
          );
        })}
      </div> : null}

      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={minRows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        data-caizen-focus-inner="true"
        className={`w-full resize-y bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 ${className}`}
      />
    </div>
  );
}
