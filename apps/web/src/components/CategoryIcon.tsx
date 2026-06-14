import type { CSSProperties } from "react";
import { Icon } from "./Icon";

// Travel category → Material Symbols Rounded ligature name.
const ICON_BY_CAT: Record<string, string> = {
  accommodation: "bed",
  food: "restaurant",
  groceries: "local_grocery_store",
  "local-transport": "directions_bus",
  intercity: "flight",
  sights: "photo_camera",
  nightlife: "local_bar",
  shopping: "shopping_bag",
  health: "medical_services",
  cash: "payments",
  other: "more_horiz",
};

export function CategoryIcon({
  cat, size = 18, style,
}: {
  cat: string; size?: number; style?: CSSProperties;
}) {
  return <Icon name={ICON_BY_CAT[cat] ?? "more_horiz"} size={size} style={style} />;
}
