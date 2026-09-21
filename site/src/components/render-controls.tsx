"use client";

/**
 * The three controls an open Cosmetic gains: which Style of it to look at, which
 * Team's paint, and whether the Class is in the picture at all.
 *
 * They appear only when they have something to offer, but they are asked
 * different questions, and deliberately so. The Styles are the Cosmetic's own,
 * out of the catalogue: a Style the render job has not reached yet is a gap in
 * the runs, not a fact about the hat, and hiding it would make the switcher
 * flicker from one run to the next. The Team toggle is asked of the manifest,
 * because RED and BLU are not a fact about the hat at all — plenty of models
 * have no BLU skin, and there the toggle would flip between two copies of one
 * picture. The View toggle is asked of the manifest for the same reason: until
 * a run has rendered this Cosmetic on its own, there is nothing to switch to.
 *
 * They are buttons rather than a select because there are two or three of each
 * and a viewer comparing looks wants them all visible at once. `aria-pressed`
 * is what says which one is showing.
 */
import type { Style } from "@tf2-cosm/data/catalogue";
import type { ReactNode } from "react";

import type { Team, Variant } from "@/renders/manifest";
import { VARIANTS } from "@/renders/manifest";
import { DEFAULT_STYLE } from "@/renders/select";

/** What each Team is called where a viewer picks it. */
const TEAM_LABELS: Record<Team, string> = { red: "RED", blu: "BLU" };

/**
 * What each picture is called where a viewer picks it.
 *
 * Not "Worn Render" and "Item Render", which are what we call the files: a
 * viewer is choosing between seeing the hat on somebody and seeing the hat.
 */
const VARIANT_LABELS: Record<Variant, string> = { worn: "On the Class", alone: "On its own" };

/** What the default Style is called when the Cosmetic's own list does not name it. */
const DEFAULT_STYLE_LABEL = "Default";

function Choice({ label, chosen, onChoose }: { label: string; chosen: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={`rounded border px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-1 ${
        chosen
          ? "border-black/30 bg-black/10 font-medium dark:border-white/30 dark:bg-white/15"
          : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function Switcher({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span aria-hidden className="pr-1 text-[0.625rem] uppercase tracking-wide text-black/55 dark:text-white/55">
        {label}
      </span>
      {children}
    </div>
  );
}

export interface StyleSwitcherProps {
  /** The Cosmetic's named Styles, in game order; empty when the default is its only look. */
  readonly styles: readonly Style[];
  readonly chosen: number;
  readonly onChoose: (style: number) => void;
}

/**
 * The Styles, in game order.
 *
 * The catalogue's list names the alternates; the default look is index 0 and is
 * only in that list when the game itself named it, so it is put at the front
 * when it is missing — a switcher a viewer cannot get back out of would be a
 * trap.
 */
export function StyleSwitcher({ styles, chosen, onChoose }: StyleSwitcherProps) {
  if (styles.length === 0) return null;
  const named = styles.some((style) => style.index === DEFAULT_STYLE);
  const choices = named ? styles : [{ index: DEFAULT_STYLE, name: DEFAULT_STYLE_LABEL }, ...styles];
  return (
    <Switcher label="Style">
      {choices.map((style) => (
        <Choice
          key={style.index}
          label={style.name}
          chosen={style.index === chosen}
          onChoose={() => onChoose(style.index)}
        />
      ))}
    </Switcher>
  );
}

export interface TeamToggleProps {
  readonly chosen: Team;
  readonly onChoose: (team: Team) => void;
}

/** RED and BLU. Rendered only where a BLU render of its own exists — see `hasBluRender`. */
export function TeamToggle({ chosen, onChoose }: TeamToggleProps) {
  return (
    <Switcher label="Team">
      {(["red", "blu"] as const).map((team) => (
        <Choice key={team} label={TEAM_LABELS[team]} chosen={team === chosen} onChoose={() => onChoose(team)} />
      ))}
    </Switcher>
  );
}

export interface ViewToggleProps {
  readonly chosen: Variant;
  readonly onChoose: (variant: Variant) => void;
}

/**
 * The Cosmetic on the Class, or the Cosmetic on its own.
 *
 * Rendered only where an Item Render of its own exists — see `hasItemRender`.
 */
export function ViewToggle({ chosen, onChoose }: ViewToggleProps) {
  return (
    <Switcher label="View">
      {VARIANTS.map((variant) => (
        <Choice
          key={variant}
          label={VARIANT_LABELS[variant]}
          chosen={variant === chosen}
          onChoose={() => onChoose(variant)}
        />
      ))}
    </Switcher>
  );
}
