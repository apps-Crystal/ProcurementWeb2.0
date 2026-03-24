/**
 * useUserNames — resolves an array of user IDs to full names via /api/users
 *
 * Usage:
 *   const names = useUserNames(["USR-001", "USR-002"]);
 *   names["USR-001"] // → "Rahul Sharma"
 *   names["UNKNOWN"] // → "UNKNOWN" (falls back to the ID itself)
 */

import { useEffect, useState } from "react";

export function useUserNames(ids: (string | undefined | null)[]): Record<string, string> {
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const unique = [...new Set(ids.filter(Boolean))] as string[];
    if (!unique.length) return;

    const missing = unique.filter((id) => !nameMap[id]);
    if (!missing.length) return;

    fetch(`/api/users?ids=${missing.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        setNameMap((prev) => ({ ...prev, ...data.users }));
      })
      .catch(() => {/* silently ignore */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.filter(Boolean).join(",")]);

  return nameMap;
}

/** Resolve a single user ID to a name, with fallback. */
export function resolveUser(nameMap: Record<string, string>, id: string | undefined): string {
  if (!id) return "—";
  return nameMap[id] ?? id;
}
