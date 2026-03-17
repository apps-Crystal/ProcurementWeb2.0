"use client";

import { useState, useEffect } from "react";

export type DropdownOption = { value: string; label: string };
type DropdownMap = Record<string, DropdownOption[]>;

function dedup(options: DropdownOption[]): DropdownOption[] {
  const seen = new Set<string>();
  return options.filter((o) => !seen.has(o.value) && !!seen.add(o.value));
}

/**
 * Fetches one or more dropdown lists from /api/dropdowns in parallel.
 * Returns a map of LIST_NAME → options.
 * Automatically deduplicates options by value.
 *
 * Usage:
 *   const dropdowns = useDropdowns("SITE", "UOM", "PROCUREMENT_TYPE");
 *   const siteOpts = dropdowns["SITE"] ?? [];
 */
export function useDropdowns(...lists: string[]): DropdownMap {
  const listsKey = lists.join(",");
  const [dropdowns, setDropdowns] = useState<DropdownMap>({});

  useEffect(() => {
    if (!lists.length) return;
    Promise.all(
      lists.map((list) =>
        fetch(`/api/dropdowns?list=${encodeURIComponent(list)}`)
          .then((r) => r.json())
          .then((d): { list: string; options: DropdownOption[] } => ({
            list,
            options: dedup(d.options ?? []),
          }))
          .catch((): { list: string; options: DropdownOption[] } => ({ list, options: [] }))
      )
    ).then((results) => {
      setDropdowns((prev) => {
        const next = { ...prev };
        for (const { list, options } of results) next[list] = options;
        return next;
      });
    });
  }, [listsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return dropdowns;
}

/** Returns options from the map, or the provided fallback if the list is empty / not yet loaded. */
export function opts(
  dropdowns: DropdownMap,
  key: string,
  fallback: DropdownOption[]
): DropdownOption[] {
  return dropdowns[key]?.length ? dropdowns[key] : fallback;
}
