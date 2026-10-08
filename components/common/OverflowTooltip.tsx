'use client';

import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type OverflowTooltipProps = {
  text: string;
  mode?: 'single-line' | 'clamped';
  children: React.ReactElement;
};

type OverflowChildProps = Record<string, unknown> & {
  ref?: React.Ref<HTMLElement>;
  tabIndex?: number;
  role?: string;
  href?: string;
  onPointerEnter?: React.PointerEventHandler<HTMLElement>;
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
};

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'option']);
const FOCUSABLE_ANCESTOR_SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[role="button"],[role="link"]';

export function OverflowTooltip({
  text,
  mode = 'single-line',
  children,
}: OverflowTooltipProps) {
  const targetRef = React.useRef<HTMLElement | null>(null);
  const inputModalityRef = React.useRef<'mouse' | 'touch' | 'keyboard'>('keyboard');
  const [isClipped, setIsClipped] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const child = children as React.ReactElement<OverflowChildProps>;
  const childProps = child.props;
  const childRef = childProps.ref;
  const childClassName = typeof childProps.className === 'string' ? childProps.className : undefined;
  const [hasFocusableAncestor, setHasFocusableAncestor] = React.useState(false);
  const isInteractive =
    (typeof child.type === 'string' && INTERACTIVE_TAGS.has(child.type)) ||
    INTERACTIVE_ROLES.has(childProps.role || '') ||
    childProps.href !== undefined;

  const measureOverflow = React.useCallback(() => {
    const node = targetRef.current;
    if (!node) return;
    const focusableAncestor = node.parentElement?.closest(FOCUSABLE_ANCESTOR_SELECTOR);
    const clipped =
      node.scrollWidth > node.clientWidth + 1 ||
      (mode === 'clamped' && node.scrollHeight > node.clientHeight + 1);
    setHasFocusableAncestor(Boolean(focusableAncestor));
    setIsClipped(current => current === clipped ? current : clipped);
  }, [mode]);

  React.useEffect(() => {
    const node = targetRef.current;
    if (!node) return;
    const focusableAncestor = node.parentElement?.closest(FOCUSABLE_ANCESTOR_SELECTOR);
    const handleAncestorFocus = () => {
      if (!focusableAncestor?.matches(':focus-visible')) return;
      inputModalityRef.current = 'keyboard';
      setOpen(true);
    };
    const handleAncestorBlur = () => setOpen(false);
    measureOverflow();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureOverflow)
      : null;
    observer?.observe(node);
    if (node.parentElement) observer?.observe(node.parentElement);
    focusableAncestor?.addEventListener('focus', handleAncestorFocus);
    focusableAncestor?.addEventListener('blur', handleAncestorBlur);
    window.addEventListener('resize', measureOverflow);
    return () => {
      observer?.disconnect();
      focusableAncestor?.removeEventListener('focus', handleAncestorFocus);
      focusableAncestor?.removeEventListener('blur', handleAncestorBlur);
      window.removeEventListener('resize', measureOverflow);
    };
  }, [measureOverflow, text]);

  React.useEffect(() => {
    if (!isClipped) setOpen(false);
  }, [isClipped]);

  const assignRef = React.useCallback((node: HTMLElement | null) => {
    targetRef.current = node;
    if (typeof childRef === 'function') childRef(node);
    else if (childRef) (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
  }, [childRef]);

  const onPointerEnter: React.PointerEventHandler<HTMLElement> = event => {
    inputModalityRef.current = event.pointerType === 'touch' ? 'touch' : 'mouse';
    childProps.onPointerEnter?.(event);
  };
  const onPointerDown: React.PointerEventHandler<HTMLElement> = event => {
    inputModalityRef.current = event.pointerType === 'touch' ? 'touch' : 'mouse';
    childProps.onPointerDown?.(event);
  };
  const onFocus: React.FocusEventHandler<HTMLElement> = event => {
    if (event.currentTarget.matches(':focus-visible')) inputModalityRef.current = 'keyboard';
    childProps.onFocus?.(event);
  };
  const onKeyDown: React.KeyboardEventHandler<HTMLElement> = event => {
    inputModalityRef.current = 'keyboard';
    childProps.onKeyDown?.(event);
  };

  const trigger = React.cloneElement(child, {
    ref: assignRef,
    tabIndex: childProps.tabIndex ?? (!isInteractive && !hasFocusableAncestor && isClipped ? 0 : undefined),
    className: !isInteractive
      ? cn(childClassName, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2')
      : childClassName,
    onPointerEnter,
    onPointerDown,
    onFocus,
    onKeyDown,
  });

  return (
    <Tooltip
      open={isClipped && open}
      onOpenChange={nextOpen => {
        if (!isClipped || (nextOpen && inputModalityRef.current === 'touch')) return;
        setOpen(nextOpen);
      }}
    >
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-[24rem] whitespace-normal break-words"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
