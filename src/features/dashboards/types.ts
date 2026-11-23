import type { DashboardPreviewDto } from "@/lib/api";
export type WidgetType = "kpi" | "gauge" | "bar" | "hbar" | "line" | "area" | "pie" | "radar" | "funnel" | "treemap" | "histogram" | "scatter" | "table";
/** Chart types that group rows by a category column and aggregate a number. */
export const GROUPED_TYPES: WidgetType[] = ["bar", "hbar", "line", "area", "pie", "radar", "funnel", "treemap"];
/** Types that take a number column (not a category) as their x. */
export const NUMERIC_X_TYPES: WidgetType[] = ["histogram", "scatter"];
/** Types with no x column at all. */
export const SINGLE_VALUE_TYPES: WidgetType[] = ["kpi", "gauge", "table"];
/** Active filters: column name to the allowed values (slicers and chart clicks both write here). */
export type Filters = Record<string, string[]>;
export type Aggregate = "sum" | "avg" | "count";

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  dataset_id: string;
  /** Category column (bar/line/pie) */
  x?: string;
  /** Numeric column to aggregate; unused for count */
  y?: string;
  agg: Aggregate;
  /** Grid columns taken out of 3 */
  span: 1 | 2 | 3;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownership: "owned" | "shared";
  /** Published dashboards can be viewed by the whole team; drafts only by the owner and the people it is shared with. */
  status: "draft" | "published";
  /** Pins are personal: this is whether the signed-in user pinned it. */
  pinned: boolean;
  /** The first KPI and a small version of the first chart, for the listing card. */
  preview?: DashboardPreviewDto;
  sources?: Array<{ name: string; provider: "google-drive"; refreshed_at: string | null; error: string | null }>;
  /** What the signed-in user may do. Falls back to the ownership when missing. */
  role?: "owner" | "editor" | "viewer";
  /** Minutes between automatic data refreshes while the dashboard is open; 0 = manual. */
  refresh_minutes?: number;
  /** Owner only. */
  shares?: Array<{ user_id: string; role: "viewer" | "editor"; name?: string }>;
  /** Columns shown as slicers (filter dropdowns) */
  slicers?: string[];
  dataset_ids: string[];
  widgets: DashboardWidget[];
  created_at: string;
  updated_at: string;
}

export interface DatasetLite {
  id: string;
  name: string;
  columns: Array<{ name: string; data_type: string }>;
  rows: Array<Array<string | number | boolean | null>>;
  row_count: number | null;
}

export const roleOf = (dashboard: Pick<Dashboard, "role" | "ownership">): NonNullable<Dashboard["role"]> => dashboard.role ?? (dashboard.ownership === "owned" ? "owner" : "viewer");
