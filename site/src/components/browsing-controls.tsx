"use client";

/**
 * The bar the catalogue is browsed with: a name search, the Class View picker,
 * the slot filter, the sort, and the two toggles.
 *
 * Every control is a plain form control with a real label. That is what makes
 * them keyboard operable and announced properly without a line of code for
 * either: a `select` opens with the keyboard, a checkbox works with the space
 * bar, and a `label` tied to its control gives the whole thing a name and a
 * bigger hit area on a phone. Nothing here decides what the controls mean — the
 * rules are `@/browsing/controls`, and this file only says which values a viewer
 * can pick.
 */
import { CLASSES, COSMETIC_SLOTS } from "@tf2-cosm/data/catalogue";
import type { ChangeEvent } from "react";

import {
  CLASS_LABELS,
  SLOT_LABELS,
  SORT_ORDERS,
  SORT_ORDER_LABELS,
  type BrowsingControls,
  type SortOrder,
} from "@/browsing/controls";

/** The label and the control below it, so every control is laid out alike. */
function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="text-[0.6875rem] uppercase tracking-wide text-black/55 dark:text-white/55">
        {label}
      </label>
      {children}
    </div>
  );
}

const CONTROL =
  "h-9 min-w-0 rounded-md border border-black/15 bg-white/70 px-2 text-sm" +
  " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current" +
  " dark:border-white/20 dark:bg-white/5";

/**
 * A filter that is either one value or no filter at all. Both the Class View and
 * the slot are that shape, and the empty option standing for "no filter" is a
 * convention worth having in one place rather than two.
 */
function NullablePicker<T extends string>({
  id,
  label,
  everything,
  options,
  labels,
  value,
  onPick,
}: {
  id: string;
  label: string;
  /** What the empty option is called — "Every Class", "Head and misc". */
  everything: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onPick: (value: T | null) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onPick(event.target.value === "" ? null : (event.target.value as T))}
        className={CONTROL}
      >
        <option value="">{everything}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A labelled checkbox, sized for a thumb as much as for a pointer. */
function Toggle({
  id,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-2 py-1 text-sm ${disabled ? "cursor-default opacity-50" : "cursor-pointer"}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        className="size-4 accent-current focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      {label}
    </label>
  );
}

export interface BrowsingControlsBarProps {
  readonly controls: BrowsingControls;
  readonly onChange: (change: Partial<BrowsingControls>) => void;
  /** How many Cosmetics the controls leave, out of how many there are. */
  readonly shown: number;
  readonly total: number;
}

export function BrowsingControlsBar({ controls, onChange, shown, total }: BrowsingControlsBarProps) {
  const count = shown === total ? `${total.toLocaleString("en-US")} Cosmetics` : `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} Cosmetics`;

  return (
    <section aria-label="Browsing controls" className="flex flex-col gap-3 pb-3">
      {/* The search is first because it is the control most often wanted, and a
          phone shows it across the full width before the pickers wrap under it. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_12rem]">
        <Field label="Search by name" htmlFor="search" className="col-span-2 sm:col-span-1">
          <input
            id="search"
            type="search"
            value={controls.search}
            placeholder="Name"
            autoComplete="off"
            onChange={(event) => onChange({ search: event.target.value })}
            className={CONTROL}
          />
        </Field>

        <NullablePicker
          id="class-view"
          label="Class"
          everything="Every Class"
          options={CLASSES}
          labels={CLASS_LABELS}
          value={controls.classView}
          onPick={(classView) => onChange({ classView })}
        />

        <NullablePicker
          id="slot"
          label="Slot"
          everything="Head and misc"
          options={COSMETIC_SLOTS}
          labels={SLOT_LABELS}
          value={controls.slot}
          onPick={(slot) => onChange({ slot })}
        />

        <Field label="Sort by" htmlFor="sort">
          <select
            id="sort"
            value={controls.sort}
            onChange={(event) => onChange({ sort: event.target.value as SortOrder })}
            className={CONTROL}
          >
            {SORT_ORDERS.map((order) => (
              <option key={order} value={order}>
                {SORT_ORDER_LABELS[order]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {/* The toggle focuses a Class View, so outside one there is nothing for
            it to do; it is disabled rather than left to tick and change nothing. */}
        <Toggle
          id="hide-all-class"
          label="Hide All-Class Cosmetics"
          checked={controls.hideAllClass}
          disabled={controls.classView === null}
          onChange={(checked) => onChange({ hideAllClass: checked })}
        />
        <Toggle
          id="hide-unpriced"
          label="Hide Unpriced"
          checked={controls.hideUnpriced}
          onChange={(checked) => onChange({ hideUnpriced: checked })}
        />
        {/* Announced when it changes, so a viewer working the controls from the
            keyboard hears what a sighted viewer sees the list do. */}
        <p role="status" className="ml-auto text-sm tabular-nums text-black/60 dark:text-white/60">
          {count}
        </p>
      </div>
    </section>
  );
}
