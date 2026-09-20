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
import { CLASSES, COSMETIC_SLOTS, type ClassName, type CosmeticSlot } from "@tf2-cosm/data/catalogue";
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

/** A labelled checkbox, sized for a thumb as much as for a pointer. */
function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
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
        <Field label="Search" htmlFor="search" className="col-span-2 sm:col-span-1">
          <input
            id="search"
            type="search"
            value={controls.search}
            placeholder="Name"
            aria-label="Search by name"
            autoComplete="off"
            onChange={(event) => onChange({ search: event.target.value })}
            className={CONTROL}
          />
        </Field>

        <Field label="Class" htmlFor="class-view">
          <select
            id="class-view"
            value={controls.classView ?? ""}
            onChange={(event) =>
              onChange({ classView: event.target.value === "" ? null : (event.target.value as ClassName) })
            }
            className={CONTROL}
          >
            <option value="">Every Class</option>
            {CLASSES.map((className) => (
              <option key={className} value={className}>
                {CLASS_LABELS[className]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Slot" htmlFor="slot">
          <select
            id="slot"
            value={controls.slot ?? ""}
            onChange={(event) =>
              onChange({ slot: event.target.value === "" ? null : (event.target.value as CosmeticSlot) })
            }
            className={CONTROL}
          >
            <option value="">Head and misc</option>
            {COSMETIC_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {SLOT_LABELS[slot]}
              </option>
            ))}
          </select>
        </Field>

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
        <Toggle
          id="hide-all-class"
          label="Hide All-Class Cosmetics"
          checked={controls.hideAllClass}
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
