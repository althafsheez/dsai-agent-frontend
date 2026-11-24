import { BarChart3, BriefcaseBusiness, ChartLine, ChartNoAxesCombined, FileText, Landmark, Mail, MessageSquare, NotebookTabs, PanelsTopLeft, Sigma, Sparkles, Telescope, Database, FileSpreadsheet, HardDrive, Snowflake, type LucideIcon } from "lucide-react";

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

export interface ConnectorPreview {
  id: string;
  name: string;
  description: string;
  category: "database" | "app" | "skill";
  icon: LucideIcon;
  logo?: string;
}

export const connectorPreviews: ConnectorPreview[] = [
  { ...dataSourceConnector("postgresql"), category: "database", logo: "postgresql" },
  { ...dataSourceConnector("mysql"), category: "database", logo: "mysql" },
  { ...dataSourceConnector("bigquery"), name: "BigQuery", category: "database", logo: "googlebigquery" },
  { ...dataSourceConnector("snowflake"), category: "database", logo: "snowflake" },
  { id: "sql-server", name: "SQL Server", category: "database", description: "Analyze tables from Microsoft SQL Server.", icon: Database },
  { id: "mongodb", name: "MongoDB", category: "database", description: "Explore collections and documents.", icon: Database, logo: "mongodb" },
  { ...dataSourceConnector("google-drive"), category: "app", logo: "googledrive" },
  { ...dataSourceConnector("google-sheets"), category: "app", logo: "googlesheets" },
  { id: "gmail", name: "Gmail", category: "app", description: "Find messages and attachments.", icon: Mail, logo: "gmail" },
  { id: "slack", name: "Slack", category: "app", description: "Find relevant conversations and files.", icon: MessageSquare, logo: "slack" },
  { id: "jira", name: "Jira", category: "app", description: "Explore issues and project activity.", icon: PanelsTopLeft, logo: "jira" },
  { id: "notion", name: "Notion", category: "app", description: "Bring in pages and database content.", icon: NotebookTabs, logo: "notion" },
  { id: "salesforce", name: "Salesforce", category: "app", description: "Analyze sales and customer records.", icon: BriefcaseBusiness, logo: "salesforce" },
  { id: "hubspot", name: "HubSpot", category: "app", description: "Explore marketing and CRM data.", icon: BriefcaseBusiness, logo: "hubspot" },
  { id: "google-analytics", name: "Google Analytics", category: "app", description: "Analyze site traffic and engagement.", icon: ChartNoAxesCombined, logo: "googleanalytics" },
  { id: "data-cleaning", name: "Data Cleaning", category: "skill", description: "Clean, transform, and prepare messy datasets.", icon: Sparkles },
  { id: "data-visualization", name: "Data Visualization", category: "skill", description: "Create charts and interactive visuals from your data.", icon: BarChart3 },
  { id: "exploratory-analysis", name: "Exploratory Analysis", category: "skill", description: "Find patterns and relationships in a dataset.", icon: Telescope },
  { id: "financial-analysis", name: "Financial Analysis", category: "skill", description: "Explore financial metrics and trends.", icon: Landmark },
  { id: "forecasting", name: "Forecasting", category: "skill", description: "Estimate future values from historical data.", icon: ChartLine },
  { id: "statistical-analysis", name: "Statistical Analysis", category: "skill", description: "Test hypotheses and measure relationships.", icon: Sigma },
  { id: "report-writing", name: "Report Writing", category: "skill", description: "Turn findings into clear reports.", icon: FileText },
  { id: "business-analysis", name: "Business Analysis", category: "skill", description: "Evaluate business performance and opportunities.", icon: BriefcaseBusiness },
];
