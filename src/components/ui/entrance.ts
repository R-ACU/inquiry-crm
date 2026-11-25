"use client";

import { createContext, useContext } from "react";

/**
 * Whether entrance animations may run: numbers counting up, charts growing,
 * rows and cards rising in. A view plays them when it appears for the first
 * time in this tab. React keeps only the last three pages alive, so a view
 * can also be rebuilt later from the client cache; it then appears as it is,
 * because replaying the entrance would look like loading.
 */
export const EntranceContext = createContext(true);

export function useEntrance(): boolean {
  return useContext(EntranceContext);
}
