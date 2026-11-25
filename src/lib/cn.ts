import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge has to know the custom tokens, or `text-2xs` and `text-muted` would cancel each other. */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs"] }],
      rounded: [{ rounded: ["control", "field", "inner", "card"] }],
      shadow: [{ shadow: ["card", "pop", "lift", "primary"] }],
    },
  },
});

export function cn(...parts: ClassValue[]): string {
  return merge(clsx(parts));
}
