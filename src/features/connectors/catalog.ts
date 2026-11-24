import { Database, FileSpreadsheet, HardDrive, Snowflake, type LucideIcon } from "lucide-react";

export interface DataSourceConnector {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

/** Data sources offered across the app. PostgreSQL is available for local testing. */
export const DATA_SOURCE_CONNECTORS: DataSourceConnector[] = [
  { id: "postgresql", name: "PostgreSQL", description: "Query and analyze data from your database.", icon: Database },
  { id: "mysql", name: "MySQL", description: "Pull tables from a MySQL database.", icon: Database },
  { id: "bigquery", name: "Google BigQuery", description: "Analyze datasets in your BigQuery project.", icon: Database },
  { id: "snowflake", name: "Snowflake", description: "Connect to your Snowflake warehouse and run analysis.", icon: Snowflake },
  { id: "google-sheets", name: "Google Sheets", description: "Use live spreadsheets as datasets.", icon: FileSpreadsheet },
  { id: "google-drive", name: "Google Drive", description: "Access and analyze files stored in Drive.", icon: HardDrive },
];

export function dataSourceConnector(id: string): DataSourceConnector {
  const connector = DATA_SOURCE_CONNECTORS.find((item) => item.id === id);
  if (!connector) throw new Error(`Unknown data source connector: ${id}`);
  return connector;
}
