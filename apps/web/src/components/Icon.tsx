import type { CSSProperties } from "react";

// Thin wrapper over Google Material Symbols Rounded. Pass the icon's ligature
// name (e.g. "bed", "shopping_bag", "refresh"). Size + color follow font-size
// + color CSS so callers control them with their normal style props.
export function Icon({
  name, size = 20, weight, fill = false, style, className,
}: {
  name: string;
  size?: number;
  /** Stroke weight 100..700. Defaults to 500 via CSS. */
  weight?: number;
  /** Use filled variant (matches Material's FILL axis). */
  fill?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const variation: string[] = [];
  if (fill) variation.push("'FILL' 1");
  if (weight) variation.push(`'wght' ${weight}`);
  const fontVariationSettings = variation.length ? variation.join(", ") : undefined;
  return (
    <span
      className={`mi${className ? ` ${className}` : ""}`}
      style={{
        fontSize: size,
        ...(fontVariationSettings ? { fontVariationSettings } : null),
        ...style,
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
