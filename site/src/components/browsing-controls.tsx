"use client";

/**
 * The panel the catalogue is browsed with: a name search, the Class picker, the
 * slot filter, the price range, the sort, and the four toggles.
 *
 * It is a column down the right-hand side wherever there is room for one, and a
 * wrapping bar above the grid where there is not. The reason is the grid: every
 * line the controls take across the top is a whole row of Cosmetics nobody can
 * see, and on a wide screen there is width to spare and height there is not —
 * so on a wide screen the controls are spent sideways. A phone is the other way
 * round, and gets the bar it always had.
 *
 * Every control is a plain form control with a real label. That is what makes
 * them keyboard operable and announced properly without a line of code for
 * either: a `select` opens with the keyboard, a checkbox works with the space
 * bar, a `range` moves under the arrow keys, and a `label` tied to its control
 * gives the whole thing a name and a bigger hit area on a phone. Nothing here
 * decides what the controls mean — the rules are `@/browsing/controls`, and this
 * file only says which values a viewer can pick.
 */
import { COSMETIC_SLOTS, type Metal } from "@tf2-cosm/data/catalogue";
import type { ChangeEvent } from "react";

import {
  CLASS_FILTERS,
  CLASS_FILTER_LABELS,
  SLOT_LABELS,
  SORT_ORDERS,
  SORT_ORDER_LABELS,
  viewedClass,
  type BrowsingControls,
  type SortOrder,
} from "@/browsing/controls";
import { PriceRange } from "@/components/price-range";

/**
 * How a control sits in the panel: side by side with the others while they are
 * a bar, and full width once they are a column.
 */
const FIELD = "flex-1 basis-32 lg:flex-none lg:basis-auto lg:w-full";

/** The label and the control below it, so every control is laid out alike. */
function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string | undefined;
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
  className,
  onPick,
}: {
  id: string;
  label: string;
  /** What the empty option is called — "Every Cosmetic", "Head and misc". */
  everything: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  className?: string | undefined;
  onPick: (value: T | null) => void;
}) {
  return (
    <Field label={label} htmlFor={id} className={className}>
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

export interface BrowsingControlsPanelProps {
  readonly controls: BrowsingControls;
  readonly onChange: (change: Partial<BrowsingControls>) => void;
  /** How many Cosmetics the controls leave, out of how many there are. */
  readonly shown: number;
  readonly total: number;
  /** What each notch of the price sliders is worth — `priceScale` of the catalogue. */
  readonly priceScale: readonly number[];
  /** The snapshot's Key Rate, so the price readout is in the cards' own words. */
  readonly keyRate: Metal | null;
  /**
   * Whether there is a backpack to narrow to. False until one has been read, or
   * where the site was built with no inventory proxy configured at all.
   */
  readonly ownedOffered: boolean;
}

export function BrowsingControlsPanel({
  controls,
  onChange,
  shown,
  total,
  priceScale,
  keyRate,
  ownedOffered,
}: BrowsingControlsPanelProps) {
  const count = shown === total ? `${total.toLocaleString("en-US")} Cosmetics` : `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} Cosmetics`;

  return (
    // `shrink-0` for the same reason the header has it: the grid beside it takes
    // every pixel it is offered, and a squeezed panel spills over the cards. As
    // a column it scrolls on its own, so a short screen cannot cut the last
    // toggle off with no way to reach it.
    <section
      aria-label="Browsing controls"
      className={
        "flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 pt-1 pb-2" +
        " lg:w-56 lg:min-h-0 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-y-3" +
        " lg:overflow-y-auto lg:border-l lg:border-black/10 lg:pt-0 lg:pb-3 lg:pl-4 lg:dark:border-white/15"
      }
    >
      {/* The search is first because it is the control most often wanted, and a
          phone gives it the whole line before the pickers wrap under it. */}
      <div className="flex w-full flex-wrap items-end gap-x-3 gap-y-2 sm:w-auto sm:flex-1 lg:w-full lg:flex-none lg:flex-col lg:items-stretch lg:gap-y-3">
        <Field label="Search by name" htmlFor="search" className="w-full sm:w-auto sm:min-w-40 sm:flex-1 lg:w-full lg:flex-none">
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

        {/* The empty option names Cosmetics rather than Classes: "Every Class"
            read as a property a Cosmetic has — the All-Class Cosmetics, which
            are now their own option two lines below it. */}
        <NullablePicker
          id="class-view"
          label="Class"
          everything="Every Cosmetic"
          options={CLASS_FILTERS}
          labels={CLASS_FILTER_LABELS}
          className={FIELD}
          value={controls.classFilter}
          onPick={(classFilter) => onChange({ classFilter })}
        />

        <NullablePicker
          id="slot"
          label="Slot"
          everything="Head and misc"
          options={COSMETIC_SLOTS}
          labels={SLOT_LABELS}
          className={FIELD}
          value={controls.slot}
          onPick={(slot) => onChange({ slot })}
        />

        {/* Beside the two pickers, because it is the third question of the same
            kind — which Cosmetics, not in what order and not how they look. It
            shares a line with the sort on a phone rather than taking one of its
            own: a line of the bar is a row of Cosmetics, and two sliders are
            about as tall as the box beside them. */}
        <div className="min-w-0 flex-1 basis-48 sm:basis-64 lg:w-full lg:flex-none lg:basis-auto">
          <PriceRange
            scale={priceScale}
            minScrap={controls.minScrap}
            maxScrap={controls.maxScrap}
            keyRate={keyRate}
            onChange={onChange}
          />
        </div>

        <Field label="Sort by" htmlFor="sort" className="flex-1 basis-32 sm:flex-none sm:basis-auto sm:w-48 lg:w-full">
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

      {/* As a bar the toggles sit on the controls' own line, level with the
          boxes rather than with the labels above them; as a column they are the
          bottom of the panel. */}
      <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 sm:w-auto sm:pb-1 lg:flex-col lg:items-start lg:gap-y-0 lg:pb-0">
        {/* The toggle focuses a Class View, so outside one there is nothing for
            it to do; it is disabled rather than left to tick and change nothing. */}
        <Toggle
          id="hide-all-class"
          label="Hide All-Class Cosmetics"
          checked={controls.hideAllClass}
          disabled={viewedClass(controls.classFilter) === null}
          onChange={(checked) => onChange({ hideAllClass: checked })}
        />
        <Toggle
          id="hide-unpriced"
          label="Hide Unpriced"
          checked={controls.hideUnpriced}
          onChange={(checked) => onChange({ hideUnpriced: checked })}
        />
        {/* Nothing to narrow to until a backpack has been read, so it is
            disabled rather than left to tick and change nothing — the same rule
            the All-Class toggle follows outside a Class View. */}
        <Toggle
          id="only-owned"
          label="Only what I own"
          checked={controls.onlyOwned}
          disabled={!ownedOffered}
          onChange={(checked) => onChange({ onlyOwned: checked })}
        />
        {/* About the viewer's own copies, so it has nothing to leave out until a
            backpack has been read; disabled until then, like the one above it. */}
        <Toggle
          id="hide-untradable"
          label="Hide untradable"
          checked={controls.hideUntradable}
          disabled={!ownedOffered}
          onChange={(checked) => onChange({ hideUntradable: checked })}
        />
        {/* Ticked when the page opens, so the toggle is also how a viewer finds
            out the Event-Only Cosmetics are in the catalogue at all. */}
        <Toggle
          id="hide-event-only"
          label="Hide Event-Only"
          checked={controls.hideEventOnly}
          onChange={(checked) => onChange({ hideEventOnly: checked })}
        />
        {/* Announced when it changes, so a viewer working the controls from the
            keyboard hears what a sighted viewer sees the grid do. */}
        <p role="status" className="ml-auto text-sm tabular-nums text-black/60 dark:text-white/60 lg:mt-2 lg:ml-0">
          {count}
        </p>
      </div>
    </section>
  );
}
