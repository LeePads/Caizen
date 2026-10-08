'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';

type SectionTabsMotionMode = 'full' | 'android' | 'constrained' | 'reduced';
const SectionTabsContext = React.createContext<{
  value?: string;
  indicatorId: string;
  motionMode: SectionTabsMotionMode;
} | null>(null);

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex min-h-11 w-fit items-center justify-center gap-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const sectionTabs = React.useContext(SectionTabsContext);
  const selected = sectionTabs?.value === props.value;
  const usesCaizenTabStyle = typeof className === 'string' && className.split(/\s+/).includes('caizen-tab');
  const transition = sectionTabs?.motionMode === 'full'
    ? { type: 'spring' as const, stiffness: 740, damping: 44, mass: 0.5 }
    : sectionTabs?.motionMode === 'android'
      ? { type: 'spring' as const, stiffness: 820, damping: 48, mass: 0.45 }
      : { duration: 0 };
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-section-tabs-managed={sectionTabs ? 'true' : undefined}
      className={cn(
        "relative inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 motion-reduce:transition-none",
        usesCaizenTabStyle
          ? 'focus-visible:outline-none focus-visible:ring-0'
          : 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0',
        className,
      )}
      {...props}
    >
      {props.children}
      {sectionTabs && selected ? <motion.span
        aria-hidden="true"
        layoutId={`section-tabs-indicator-${sectionTabs.indicatorId}`}
        initial={false}
        transition={transition}
        className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
      /> : null}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" data-caizen-tab-panel="true" className={cn('caizen-tab-panel-motion flex-1 outline-none', className)} {...props} />;
}

export function sectionTabVisualClassName({ active, className }: { active: boolean; className?: string }) {
  return cn(
    'relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-t-lg px-3 text-sm font-semibold transition-colors',
    'text-muted-foreground hover:bg-muted/55 hover:text-foreground',
    active && 'text-foreground',
    'focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0',
    className,
  );
}

type SectionTabItem = {
  value: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  disabled?: boolean;
};

type SectionTabsNavigationProps = {
  mode: 'navigation';
  label: string;
  value: string;
  items: SectionTabItem[];
  onValueChange?: (value: string) => void;
  className?: string;
  listClassName?: string;
};

type SectionTabsPanelsProps = {
  mode: 'panels';
  items?: Array<SectionTabItem & { content: React.ReactNode }>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  listClassName?: string;
  children?: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  activationMode?: 'automatic' | 'manual';
  dir?: 'ltr' | 'rtl';
};

/**
 * Shared quiet tab treatment with explicit navigation and panel semantics.
 * Panel mode delegates keyboard behavior and ARIA relationships to Radix Tabs.
 */
function SectionTabs(props: SectionTabsNavigationProps | SectionTabsPanelsProps) {
  const indicatorId = React.useId();
  const motionMode = useCaizenMotionMode();
  const reduceMotion = motionMode === 'reduced' || motionMode === 'constrained';
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    props.mode === 'panels' ? props.defaultValue ?? props.items?.[0]?.value : props.value,
  );

  if (props.mode === 'panels') {
    if (!props.items) {
      const selectedValue = props.value ?? uncontrolledValue;
      const changeValue = (nextValue: string) => {
        if (props.value === undefined) setUncontrolledValue(nextValue);
        props.onValueChange?.(nextValue);
      };
      return (
        <SectionTabsContext.Provider value={{ value: selectedValue, indicatorId, motionMode }}>
          <TabsPrimitive.Root
            data-slot="section-tabs-panels"
            value={selectedValue}
            onValueChange={changeValue}
            orientation={props.orientation}
            activationMode={props.activationMode}
            dir={props.dir}
            className={cn('flex flex-col gap-2', props.className)}
          >
            {props.children}
          </TabsPrimitive.Root>
        </SectionTabsContext.Provider>
      );
    }
    const selectedValue = props.value ?? uncontrolledValue;
    const changeValue = (nextValue: string) => {
      if (props.value === undefined) setUncontrolledValue(nextValue);
      props.onValueChange?.(nextValue);
    };
    return (
      <TabsPrimitive.Root
        data-slot="section-tabs-panels"
        value={selectedValue}
        onValueChange={changeValue}
        className={cn('flex flex-col gap-3', props.className)}
      >
        <TabsPrimitive.List className={cn('inline-flex min-h-11 w-fit max-w-full items-center gap-1 overflow-x-auto border-b border-border/60 text-muted-foreground', props.listClassName)}>
          {props.items.map(({ value: itemValue, label: itemLabel, icon: Icon, disabled }) => {
            const active = itemValue === selectedValue;
            return (
              <TabsPrimitive.Trigger
                key={itemValue}
                data-slot="section-tabs-trigger"
                value={itemValue}
                disabled={disabled}
                className={cn(
                  'relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-t-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
                  'focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0 data-[state=active]:text-foreground',
                )}
              >
                {Icon ? <Icon className={cn('size-4 shrink-0', active && 'text-primary')} /> : null}
                <span>{itemLabel}</span>
                {active ? <motion.span
                  layoutId={`section-tabs-panel-indicator-${indicatorId}`}
                  aria-hidden="true"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  transition={reduceMotion
                    ? { duration: 0 }
                    : motionMode === 'android'
                      ? { type: 'spring', stiffness: 820, damping: 48, mass: 0.45 }
                      : { type: 'spring', stiffness: 740, damping: 44, mass: 0.5 }}
                /> : null}
              </TabsPrimitive.Trigger>
            );
          })}
        </TabsPrimitive.List>
        {props.items.map(item => (
          <TabsPrimitive.Content key={item.value} value={item.value} data-slot="tabs-content" data-caizen-tab-panel="true" className="caizen-tab-panel-motion min-w-0 flex-1 outline-none">
            {item.content}
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>
    );
  }

  const { label, value, items, onValueChange, className, listClassName } = props;
  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <div className={cn('flex min-h-11 w-full items-center gap-1 overflow-x-auto border-b border-border/60', listClassName)}>
        {items.map(({ value: itemValue, label: itemLabel, icon: Icon, href, disabled }) => {
          const active = itemValue === value;
          const sharedClass = sectionTabVisualClassName({
            active,
            className: disabled ? 'pointer-events-none opacity-50' : undefined,
          });
          const contents = <>
            {Icon ? <Icon className={cn('size-4 shrink-0', active && 'text-primary')} /> : null}
            <span>{itemLabel}</span>
            {active ? <motion.span
              layoutId={`section-tabs-indicator-${indicatorId}`}
              aria-hidden="true"
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
              transition={reduceMotion
                ? { duration: 0 }
                : motionMode === 'android'
                  ? { type: 'spring', stiffness: 820, damping: 48, mass: 0.45 }
                  : { type: 'spring', stiffness: 740, damping: 44, mass: 0.5 }}
            /> : null}
          </>;

          return href ? (
            <a key={itemValue} href={href} data-section-tab="true" className={sharedClass} aria-current={active ? 'page' : undefined} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} onClick={disabled ? event => event.preventDefault() : undefined}>
              {contents}
            </a>
          ) : (
            <button key={itemValue} type="button" data-section-tab="true" className={sharedClass} aria-current={active ? 'page' : undefined} disabled={disabled} onClick={() => onValueChange?.(itemValue)}>
              {contents}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, SectionTabs };
