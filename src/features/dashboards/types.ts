export type WidgetType = "kpi" | "bar" | "line" | "area" | "pie" | "table";
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
  status: "draft" | "published";
  pinned: boolean;
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
