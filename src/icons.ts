import type { LucideProps } from "lucide-react";

/** Shared Lucide defaults for consistent UI icons across the site. */
export const iconProps = {
  size: 16,
  strokeWidth: 1.75,
  absoluteStrokeWidth: false,
  "aria-hidden": true,
} as const satisfies Partial<LucideProps>;
