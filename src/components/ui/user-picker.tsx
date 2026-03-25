"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type UserPickerOption = {
  id: string;
  name: string;
  email: string;
  meta?: string;
};

type UserPickerProps = {
  options: UserPickerOption[];
  value: string;
  onValueChange: (nextValue: string) => void;
  name?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
};

function getSearchText(option: UserPickerOption): string {
  return `${option.name} ${option.email} ${option.meta ?? ""}`.toLowerCase();
}

export function UserPicker({
  options,
  value,
  onValueChange,
  name,
  label,
  placeholder = "Select a user",
  searchPlaceholder = "Search name or email...",
  emptyText = "No users match your search.",
  disabled = false,
  allowClear = true,
  className,
}: UserPickerProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedOption = options.find((option) => option.id === value) ?? null;

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => getSearchText(option).includes(normalizedQuery));
  }, [options, query]);

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
      return;
    }

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    onValueChange("");
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
            {selectedOption ? (
              <>
                <span className="block truncate font-medium text-slate-950">{selectedOption.name}</span>
                <span className="block truncate text-xs text-slate-500">{selectedOption.email}</span>
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
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">{emptyText}</p>
              ) : (
                <ul className="space-y-1">
                  {filteredOptions.map((option) => {
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

      {value && selectedOption ? (
        <p className="text-xs text-slate-500">
          Selected: <span className="font-medium text-slate-700">{selectedOption.name}</span>
        </p>
      ) : null}
    </div>
  );
}
