"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { AsyncUserPicker } from "@/components/ui/async-user-picker";
import { Button } from "@/components/ui/button";
import type { UserPickerOption } from "@/components/ui/user-picker";

type AsyncUserMultiPickerProps = {
  value: string[];
  onValueChange: (nextValue: string[]) => void;
  selectedOptions?: UserPickerOption[];
  label?: string;
  placeholder?: string;
  addLabel?: string;
  emptyText?: string;
  disabled?: boolean;
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

export function AsyncUserMultiPicker({
  value,
  onValueChange,
  selectedOptions = [],
  label,
  placeholder = "Search for a user",
  addLabel = "Add",
  emptyText = "No users selected.",
  disabled = false,
}: AsyncUserMultiPickerProps) {
  const [pickerValue, setPickerValue] = useState("");
  const [knownOptions, setKnownOptions] = useState<UserPickerOption[]>(selectedOptions);
  const mergedKnownOptions = useMemo(
    () => mergeUniqueOptions([...knownOptions, ...selectedOptions]),
    [knownOptions, selectedOptions]
  );

  const selectedUsers = useMemo(
    () =>
      value
        .map((userId) => mergedKnownOptions.find((option) => option.id === userId))
        .filter(Boolean) as UserPickerOption[],
    [mergedKnownOptions, value]
  );

  const selectedSet = useMemo(() => new Set(value), [value]);

  const addUser = () => {
    if (!pickerValue || selectedSet.has(pickerValue)) {
      return;
    }

    onValueChange([...value, pickerValue]);
    setPickerValue("");
  };

  const removeUser = (userId: string) => {
    onValueChange(value.filter((currentUserId) => currentUserId !== userId));
  };

  return (
    <div className="space-y-3">
      <AsyncUserPicker
        value={pickerValue}
        onValueChange={setPickerValue}
        selectedOption={mergedKnownOptions.find((option) => option.id === pickerValue) ?? null}
        initialOptions={mergedKnownOptions}
        onSelectionResolve={(option) => {
          if (!option) {
            return;
          }

          setKnownOptions((current) => mergeUniqueOptions([...current, option]));
        }}
        label={label}
        placeholder={placeholder}
        disabled={disabled}
      />

      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={addUser} disabled={disabled || !pickerValue}>
          {addLabel}
        </Button>
      </div>

      {selectedUsers.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-900"
            >
              {user.name}
              <button
                type="button"
                onClick={() => removeUser(user.id)}
                disabled={disabled}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sky-700 transition hover:bg-white/70 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
