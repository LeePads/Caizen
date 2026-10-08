'use client';

import type { FormEvent, ReactNode } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CatalogAssist({
  id,
  providerLabel,
  query,
  onQueryChange,
  onSearch,
  loading,
  loadingLabel,
  error,
  noResults,
  toolbar,
  children,
  onContinueManually,
}: {
  id: string;
  providerLabel: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  loadingLabel: string;
  error: string;
  noResults: boolean;
  toolbar?: ReactNode;
  children?: ReactNode;
  onContinueManually?: () => void;
}) {
  const canSearch = query.trim().length >= 2 && !loading;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSearch) onSearch();
  };

  return (
    <section
      aria-labelledby={`${id}-heading`}
      aria-busy={loading}
      className="rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`${id}-heading`} className="text-sm font-black">Search {providerLabel}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Select a result to prefill the form. Review and edit it before saving, or continue manually below.
          </p>
        </div>
        {onContinueManually ? (
          <button
            type="button"
            onClick={onContinueManually}
            className="min-h-11 shrink-0 self-start px-2 text-xs font-black text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Continue manually
          </button>
        ) : null}
      </div>

      {toolbar ? <div className="mt-3">{toolbar}</div> : null}

      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`${id}-query`} className="sr-only">Search {providerLabel}</label>
        <input
          id={`${id}-query`}
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          maxLength={120}
          autoComplete="off"
          placeholder={`Search ${providerLabel}...`}
          className="control-input h-11 min-w-0 flex-1"
        />
        <Button type="submit" disabled={!canSearch} className="h-11 rounded-xl sm:min-w-28">
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Search className="mr-2 size-4" aria-hidden="true" />}
          Search
        </Button>
      </form>

      {loading ? (
        <p role="status" aria-live="polite" className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {loadingLabel}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
      {noResults && !loading && !error ? (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">No matching titles found. You can keep editing manually below.</p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
