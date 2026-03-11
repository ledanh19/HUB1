import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Custom twMerge that knows about our design-system fontSize tokens.
 *
 * Without this, tailwind-merge treats e.g. `text-micro` as a text-COLOR
 * utility and drops `text-primary-foreground` (or vice-versa) because
 * they look like they belong to the same "text-*" group.
 *
 * By registering our custom sizes under `classGroups.font-size` we tell
 * twMerge they are font-size utilities and can coexist with text-color.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-micro",
        "text-caption",
        "text-body",
        "text-section",
        "text-page",
        "text-kpi",
        "text-heroKpi",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
