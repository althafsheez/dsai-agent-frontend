import { BarChart3, BrainCircuit, Calculator, Database, FileSearch, FileSpreadsheet, FileText, Github, Mail, MessageSquare, NotebookTabs, PanelsTopLeft, Sigma, Snowflake, Sparkles, TrendingUp, Workflow } from "lucide-react";

/** Connectors, skills and tools listed in the "Add files and connectors" popover (chat and dashboards). */
export type ConnectorCategory = "all" | "skills" | "data" | "apps";

export const CONNECTOR_ITEMS: Array<{ name: string; description: string; category: Exclude<ConnectorCategory, "all">; icon: typeof Database; logo?: string }> = [
  { name: "Data Cleaning", description: "Clean, validate, and prepare data for analysis", category: "skills" as const, icon: Sparkles },
  { name: "Data Visualization", description: "Create charts, plots, and interactive visuals", category: "skills" as const, icon: BarChart3 },
  { name: "Google BigQuery", logo: "googlebigquery", description: "Connect to and query data from BigQuery", category: "data" as const, icon: Database },
  { name: "Snowflake", logo: "snowflake", description: "Connect to your Snowflake data warehouse", category: "data" as const, icon: Snowflake },
  { name: "Forecasting", description: "Forecast trends and future values", category: "skills" as const, icon: TrendingUp },
  { name: "Statistical Analysis", description: "Test hypotheses and measure relationships", category: "skills" as const, icon: Sigma },
  { name: "Anomaly Detection", description: "Find unusual values and patterns", category: "skills" as const, icon: FileSearch },
  { name: "Machine Learning", description: "Build and evaluate predictive models", category: "skills" as const, icon: BrainCircuit },
  { name: "Report Generation", description: "Turn analysis results into reports", category: "skills" as const, icon: FileText },
  { name: "MySQL", logo: "mysql", description: "Connect to a MySQL database", category: "data" as const, icon: Database },
  { name: "Google Sheets", logo: "googlesheets", description: "Import data from a Google spreadsheet", category: "data" as const, icon: FileSpreadsheet },
  { name: "Microsoft Excel", description: "Import data from an Excel workbook", category: "data" as const, icon: FileSpreadsheet },
  { name: "Gmail", logo: "gmail", description: "Find relevant emails and attachments", category: "apps" as const, icon: Mail },
  { name: "Slack", logo: "slack", description: "Find messages and shared files", category: "apps" as const, icon: MessageSquare },
  { name: "Notion", logo: "notion", description: "Bring in pages and database content", category: "apps" as const, icon: NotebookTabs },
  { name: "Jira", logo: "jira", description: "Bring in issues and project details", category: "apps" as const, icon: PanelsTopLeft },
  { name: "GitHub", description: "Reference repositories and issues", category: "apps" as const, icon: Github },
  { name: "Zapier", description: "Connect to app automations", category: "apps" as const, icon: Workflow },
  { name: "Calculator", description: "Evaluate numerical expressions", category: "apps" as const, icon: Calculator },
];
