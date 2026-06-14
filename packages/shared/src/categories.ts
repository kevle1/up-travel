// Travel category taxonomy + mapping from Up's real categories.
// The user sees travel categories everywhere; Up's categories are kept on the
// transaction row so we can show "Up tagged this X" and let them override.

export type TravelBucket = "Food" | "Stay" | "Transport" | "Activities" | "Cash" | "Other";

export interface TravelCategory {
  id: string;
  label: string;
  bucket: TravelBucket;
  color: string; // light-mode hex; the UI also has a CSS var override for dark mode
}

// Bright, saturated palette so the icons + breakdown bars pop on both light
// and dark themes. Hues are spread around the wheel for clear separation.
export const TRAVEL_CATEGORIES: readonly TravelCategory[] = [
  { id: "accommodation", label: "Accommodation", bucket: "Stay", color: "#14B8A6" },         // teal
  { id: "food", label: "Food & Drink", bucket: "Food", color: "#FB6B3A" },                   // orange
  { id: "groceries", label: "Groceries", bucket: "Food", color: "#F59E0B" },                 // amber
  { id: "local-transport", label: "Local transport", bucket: "Transport", color: "#FACC15" }, // yellow
  { id: "intercity", label: "Flights & Intercity", bucket: "Transport", color: "#3B82F6" },  // blue
  { id: "sights", label: "Sights & Activities", bucket: "Activities", color: "#22C55E" },    // green
  { id: "nightlife", label: "Nightlife & Bars", bucket: "Activities", color: "#D946EF" },    // fuchsia
  { id: "shopping", label: "Shopping", bucket: "Other", color: "#EC4899" },                  // pink
  { id: "health", label: "Health & Pharmacy", bucket: "Other", color: "#06B6D4" },           // cyan
  { id: "cash", label: "Cash", bucket: "Cash", color: "#8B5CF6" },                           // violet
  { id: "other", label: "Other", bucket: "Other", color: "#94A3B8" },                        // slate
] as const;

const CAT_BY_ID = new Map(TRAVEL_CATEGORIES.map((c) => [c.id, c]));
export function travelCategory(id: string): TravelCategory {
  return CAT_BY_ID.get(id) ?? CAT_BY_ID.get("other")!;
}
export function travelLabel(id: string): string { return travelCategory(id).label; }
export function travelBucket(id: string): TravelBucket { return travelCategory(id).bucket; }
export function travelColor(id: string): string { return travelCategory(id).color; }

// Up's four parent groups + the child categories under each, used so we can
// display "Up tagged this Restaurants & Cafes · Good Life" in the tx editor.
export const UP_GROUPS = [
  { id: "good-life", name: "Good Life", cats: [
    ["restaurants-and-cafes", "Restaurants & Cafes"], ["takeaway", "Takeaway"], ["pubs-and-bars", "Pubs & Bars"],
    ["booze", "Booze"], ["events-and-gigs", "Events & Gigs"], ["hobbies", "Hobbies"],
    ["holidays-and-travel", "Holidays & Travel"], ["lottery-and-gambling", "Lottery & Gambling"],
    ["apps-games-and-software", "Apps, Games & Software"], ["tv-music-and-streaming", "TV, Music & Streaming"],
    ["tobacco-and-vaping", "Tobacco & Vaping"], ["adult", "Adult"],
  ] },
  { id: "personal", name: "Personal", cats: [
    ["clothing-and-accessories", "Clothing & Accessories"], ["health-and-medical", "Health & Medical"],
    ["hair-and-beauty", "Hair & Beauty"], ["fitness-and-wellbeing", "Fitness & Wellbeing"],
    ["gifts-and-charity", "Gifts & Charity"], ["technology", "Technology"],
    ["news-magazines-and-books", "News, Magazines & Books"], ["mobile-phone", "Mobile Phone"],
    ["life-admin", "Life Admin"], ["children-and-family", "Children & Family"],
    ["education-and-student-loans", "Education & Student Loans"], ["investments", "Investments"],
  ] },
  { id: "home", name: "Home", cats: [
    ["groceries", "Groceries"], ["homeware-and-appliances", "Homeware & Appliances"], ["internet", "Internet"],
    ["maintenance-and-improvements", "Maintenance & Improvements"], ["pets", "Pets"],
    ["rates-and-insurance", "Rates & Insurance"], ["rent-and-mortgage", "Rent & Mortgage"], ["utilities", "Utilities"],
  ] },
  { id: "transport", name: "Transport", cats: [
    ["public-transport", "Public Transport"], ["taxis-and-share-cars", "Taxis & Share Cars"], ["fuel", "Fuel"],
    ["parking", "Parking"], ["tolls", "Tolls"], ["cycling", "Cycling"],
    ["car-insurance-rego-and-maintenance", "Car Insurance, Rego & Maintenance"], ["repayments", "Repayments"],
  ] },
] as const;

const UP_LABEL = new Map<string, string>();
const UP_PARENT_NAME = new Map<string, string>();
for (const g of UP_GROUPS) {
  for (const [id, label] of g.cats) {
    UP_LABEL.set(id, label);
    UP_PARENT_NAME.set(id, g.name);
  }
}
UP_LABEL.set("cash-withdrawals", "Cash Withdrawal");

export function upLabel(id: string | null | undefined): string {
  if (!id) return "Uncategorised";
  return UP_LABEL.get(id) ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function upParentName(id: string | null | undefined): string {
  if (!id) return "Other";
  return UP_PARENT_NAME.get(id) ?? "Other";
}

// Default travel category for each Up category. Users can override per-tx.
const TO_TRAVEL: Record<string, string> = {
  "restaurants-and-cafes": "food", "takeaway": "food", "booze": "nightlife", "pubs-and-bars": "nightlife",
  "events-and-gigs": "sights", "hobbies": "sights", "holidays-and-travel": "intercity",
  "lottery-and-gambling": "nightlife", "apps-games-and-software": "other",
  "tv-music-and-streaming": "other", "tobacco-and-vaping": "other", "adult": "nightlife",
  "groceries": "groceries", "homeware-and-appliances": "shopping", "internet": "other",
  "maintenance-and-improvements": "other", "pets": "other", "rates-and-insurance": "other",
  "rent-and-mortgage": "accommodation", "utilities": "other",
  "public-transport": "local-transport", "taxis-and-share-cars": "local-transport", "fuel": "local-transport",
  "parking": "local-transport", "tolls": "local-transport", "cycling": "local-transport",
  "car-insurance-rego-and-maintenance": "local-transport", "repayments": "other",
  "clothing-and-accessories": "shopping", "health-and-medical": "health", "hair-and-beauty": "health",
  "fitness-and-wellbeing": "health", "gifts-and-charity": "shopping", "technology": "shopping",
  "news-magazines-and-books": "shopping", "mobile-phone": "other", "life-admin": "other",
  "children-and-family": "other", "education-and-student-loans": "other", "investments": "other",
  "cash-withdrawals": "cash",
};

export function upToTravel(upChildId: string | null | undefined): string {
  if (!upChildId) return "other";
  return TO_TRAVEL[upChildId] ?? "other";
}
