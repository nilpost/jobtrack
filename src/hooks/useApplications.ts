import { useLiveQuery } from "dexie-react-hooks"

import { db } from "@/lib/db"
import type { Application } from "@/lib/types"

/** Live view of every application, re-rendering automatically on any write
 *  — this is what lets drag-and-drop feel instant with no separate refetch. */
export function useApplications(): Application[] | undefined {
  return useLiveQuery(() => db.applications.orderBy("updatedAt").reverse().toArray())
}
