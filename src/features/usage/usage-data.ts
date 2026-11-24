// Demo figures: there is no usage endpoint yet. Every screen that shows these labels them as sample data.
export interface UsageMeter {
  key: "credits" | "disk" | "compute";
  label: string;
  used: number;
  limit: number;
  unit: string;
  /** Formats the used/limit pair for display. */
  format: (value: number) => string;
}

export const usageMeters: UsageMeter[] = [
  { key: "credits", label: "AI credits", used: 3250, limit: 5000, unit: "credits", format: (value) => value.toLocaleString("en-US") },
  { key: "disk", label: "Disk space", used: 0.62, limit: 5, unit: "GB", format: (value) => `${value.toFixed(2)} GB` },
  { key: "compute", label: "Compute time", used: 42, limit: 100, unit: "h", format: (value) => `${value} h` },
];

export const dailyUsage = [
  { day: "Mon", credits: 410, compute: 5.5 },
  { day: "Tue", credits: 620, compute: 7.2 },
  { day: "Wed", credits: 380, compute: 4.1 },
  { day: "Thu", credits: 790, compute: 9.8 },
  { day: "Fri", credits: 540, compute: 6.4 },
  { day: "Sat", credits: 210, compute: 2.0 },
  { day: "Sun", credits: 300, compute: 3.3 },
];

export const usageByModel = [
  { name: "Gemini 3.5 Flash Lite", requests: 184, credits: 1980 },
  { name: "Gemini 3.5 Flash", requests: 61, credits: 1040 },
  { name: "Quick Assistant", requests: 47, credits: 230 },
];

export const usagePercent = (meter: UsageMeter) => Math.min(100, Math.round((meter.used / meter.limit) * 100));
