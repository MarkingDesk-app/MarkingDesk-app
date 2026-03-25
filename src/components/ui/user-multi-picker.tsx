"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserPicker, type UserPickerOption } from "@/components/ui/user-picker";

type UserMultiPickerProps = {
  options: UserPickerOption[];
  value: string[];
  onValueChange: (nextValue: string[]) => void;
  label?: string;
  placeholder?: string;
  addLabel?: string;
  emptyText?: string;
  disabled?: boolean;
};

export function UserMultiPicker({
  options,
  value,
  onValueChange,
  label,
  placeholder = "Search for a user",
  addLabel = "Add",
  emptyText = "No users selected.",
  disabled = false,
}: UserMultiPickerProps) {
  const [pickerValue, setPickerValue] = useState("");

  const selectedUsers = useMemo(
    () => value.map((userId) => options.find((option) => option.id === userId)).filter(Boolean) as UserPickerOption[],
    [options, value]
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
      <UserPicker
        options={options}
        value={pickerValue}
        onValueChange={setPickerValue}
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
