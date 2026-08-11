import { useLiveQuery } from "dexie-react-hooks"

import { getProfile } from "@/lib/db"
import type { CandidateProfile } from "@/lib/profileTypes"

/** Live view of the candidate profile. `undefined` while loading,
 *  `null` once loaded if no profile has been saved yet. */
export function useProfile(): CandidateProfile | null | undefined {
  return useLiveQuery(async () => (await getProfile()) ?? null)
}
