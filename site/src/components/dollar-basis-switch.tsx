"use client";

/**
 * The Dollar Basis switch: what a dollar means on this page, stated rather than
 * assumed.
 *
 * Each option carries its own rate, because the whole point of the switch is
 * that "$5.15" is a different number depending on who you ask, and a viewer
 * cannot weigh the choice without seeing what each one costs a Key. The options
 * are native radios so that a keyboard walks them with the arrow keys and a
 * screen reader announces the group and the choice without being told to.
 */
import { useEffect, useRef } from "react";

import type { DollarBasis } from "@/prices/format";
import { formatDollars } from "@/prices/format";

export interface DollarBasisSwitchProps {
  readonly offered: readonly DollarBasis[];
  readonly active: DollarBasis;
  readonly onChoose: (basis: DollarBasis) => void;
}

export function DollarBasisSwitch({ offered, active, onChoose }: DollarBasisSwitchProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLabelElement>(null);

  // On a phone the switch is wider than the screen, and a remembered basis is
  // often the one furthest along it, so the option in force is brought into
  // view rather than left off the edge. The strip's own scroll is moved rather
  // than `scrollIntoView`, which is free to scroll every ancestor as well and
  // would jerk the page out from under a viewer on load.
  useEffect(() => {
    const strip = stripRef.current;
    const option = activeRef.current;
    if (strip === null || option === null) return;
    strip.scrollLeft = option.offsetLeft - (strip.clientWidth - option.clientWidth) / 2;
  }, [active.id]);

  return (
    <div
      ref={stripRef}
      role="radiogroup"
      aria-label="Dollar Basis"
      // Three options with their rates are wider than a phone, and stacking them
      // costs more of the screen than the list can spare, so on a narrow screen
      // the switch scrolls sideways instead of growing downwards.
      //
      // `relative` is what keeps that scrolling inside the strip. Each option's
      // radio is `sr-only`, which is absolutely positioned; with no positioned
      // ancestor the ones scrolled out of view are laid out against the page
      // instead, and the page grows sideways to hold them.
      //
      // In the sidebar it is the other way round — height to spare and no
      // width — so there the options stack, each with its rate under its name.
      className="relative flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-md border border-line bg-well p-1 lg:flex-col lg:overflow-x-visible"
    >
      {offered.map((basis) => {
        const checked = basis.id === active.id;
        return (
          <label
            key={basis.id}
            ref={checked ? activeRef : null}
            title={basis.source}
            // The option in force is lit the way the game lights the tab you
            // are on: an orange edge down its side on a lifted slot.
            className={
              "flex cursor-pointer items-baseline gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] px-2.5 py-1 text-xs" +
              " lg:flex-col lg:items-start lg:gap-0" +
              " has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent sm:text-sm" +
              (checked
                ? " border-accent bg-slot font-semibold text-ink shadow-sm"
                : " border-transparent text-ink-muted hover:bg-slot-hover hover:text-ink")
            }
          >
            <input
              type="radio"
              name="dollar-basis"
              value={basis.id}
              checked={checked}
              onChange={() => onChoose(basis)}
              className="sr-only"
            />
            <span>{basis.label}</span>
            {/* Secondary to the name beside it. The muted ink is checked against
                the lifted slot the chosen option sits on as well as the well
                behind the others, so it reads on both. */}
            <span className="font-normal tabular-nums text-ink-muted">
              {formatDollars(basis.usdPerKey)} a Key
            </span>
          </label>
        );
      })}
    </div>
  );
}
