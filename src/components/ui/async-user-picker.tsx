"use client";

import * as React from "react";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserPickerOption } from "@/components/ui/user-picker";

type AsyncUserPickerProps = {
  value: string;
  onValueChange: (nextValue: string) => void;
  selectedOption?: UserPickerOption | null;
  initialOptions?: UserPickerOption[];
  onSelectionResolve?: (option: UserPickerOption | null) => void;
  name?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  errorText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  searchUrl?: string;
};

type SearchResponse = {
  users?: UserPickerOption[];
};

function mergeUniqueOptions(options: UserPickerOption[]): UserPickerOption[] {
  const seen = new Set<string>();

  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false;
    }

    seen.add(option.id);
    return true;
  });
}

export function AsyncUserPicker({
  value,
  onValueChange,
  selectedOption,
  initialOptions = [],
  onSelectionResolve,
  name,
  label,
  placeholder = "Select a user",
  searchPlaceholder = "Search name or email...",
  emptyText = "No users match your search.",
  loadingText = "Searching users...",
  errorText = "Unable to load users right now.",
  disabled = false,
  allowClear = true,
  className,
  searchUrl = "/api/users/search",
}: AsyncUserPickerProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loadedOptions, setLoadedOptions] = React.useState<UserPickerOption[]>(initialOptions);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<UserPickerOption | null>(selectedOption ?? null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    setLoadedOptions((current) => mergeUniqueOptions([...current, ...initialOptions]));
  }, [initialOptions]);

  React.useEffect(() => {
    if (selectedOption) {
      setSelectedSnapshot(selectedOption);
      return;
    }

    if (!value) {
      setSelectedSnapshot(null);
    }
  }, [selectedOption, value]);

  const options = React.useMemo(
    () =>
      mergeUniqueOptions([
        ...initialOptions,
        ...loadedOptions,
        ...(selectedOption ? [selectedOption] : []),
        ...(selectedSnapshot ? [selectedSnapshot] : []),
      ]),
    [initialOptions, loadedOptions, selectedOption, selectedSnapshot]
  );

  const resolvedSelectedOption = React.useMemo(
    () => selectedOption ?? selectedSnapshot ?? options.find((option) => option.id === value) ?? null,
    [options, selectedOption, selectedSnapshot, value]
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setLoadError(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadError(false);

      try {
        const response = await fetch(`${searchUrl}?q=${encodeURIComponent(query.trim())}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Search failed");
        }

        const data = (await response.json()) as SearchResponse;
        setLoadedOptions(
          mergeUniqueOptions([...(data.users ?? []), ...(selectedSnapshot ? [selectedSnapshot] : [])])
        );
        setHasLoadedOnce(true);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    }, query ? 180 : hasLoadedOnce ? 0 : 50);

    return () => {
      controller.abort();
      window.clearTimeout(debounce);
    };
  }, [hasLoadedOnce, open, query, searchUrl, selectedSnapshot]);

  const handleSelect = (nextValue: string) => {
    const option = options.find((candidate) => candidate.id === nextValue) ?? null;

    onValueChange(nextValue);
    setSelectedSnapshot(option);
    onSelectionResolve?.(option);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    onValueChange("");
    setSelectedSnapshot(null);
    onSelectionResolve?.(null);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("space-y-2", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {label ? <p className="text-sm font-medium text-slate-700">{label}</p> : null}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60",
            open ? "border-sky-300 ring-2 ring-sky-500/20" : ""
          )}
        >
          <div className="min-w-0">
            {resolvedSelectedOption ? (
              <>
                <span className="block truncate font-medium text-slate-950">{resolvedSelectedOption.name}</span>
                <span className="block truncate text-xs text-slate-500">{resolvedSelectedOption.email}</span>
              </>
            ) : (
              <span className="text-slate-500">{placeholder}</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {allowClear && value ? (
              <span
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleClear();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </span>
            ) : null}
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open ? "rotate-180" : "")} />
          </div>
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" /> : <Search className="h-4 w-4 text-slate-400" />}
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto">
              {loadError ? (
                <p className="px-3 py-4 text-sm text-rose-600">{errorText}</p>
              ) : isLoading && options.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">{loadingText}</p>
              ) : options.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">{emptyText}</p>
              ) : (
                <ul className="space-y-1">
                  {options.map((option) => {
                    const isSelected = option.id === value;

                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(option.id)}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition",
                            isSelected ? "bg-sky-50 text-sky-900" : "hover:bg-slate-50"
                          )}
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-950">{option.name}</span>
                            <span className="block truncate text-xs text-slate-500">{option.email}</span>
                            {option.meta ? <span className="mt-1 block text-xs text-slate-400">{option.meta}</span> : null}
                          </div>
                          {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {value && resolvedSelectedOption ? (
        <p className="text-xs text-slate-500">
          Selected: <span className="font-medium text-slate-700">{resolvedSelectedOption.name}</span>
        </p>
      ) : null}
    </div>
  );
}
