import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DataReferenceChip,
  HighlightedValue,
  renderRichText,
  resolveResource,
} from "./data-reference";

describe("DataReference & Highlighted Values (DSAI-1026)", () => {
  const sampleResources = [
    { id: "ds-sales-1", name: "sales_data.csv", resourceType: "dataset" as const },
    { id: "ds-customers", name: "customers.parquet", resourceType: "dataset" as const },
    { id: "art-chart-1", name: "revenue_chart.png", resourceType: "artifact" as const },
  ];

  describe("resolveResource", () => {
    it("matches resource by ID", () => {
      const match = resolveResource("ds-sales-1", sampleResources);
      expect(match.isAvailable).toBe(true);
      expect(match.resource?.id).toBe("ds-sales-1");
    });

    it("matches resource by exact filename", () => {
      const match = resolveResource("sales_data.csv", sampleResources);
      expect(match.isAvailable).toBe(true);
      expect(match.resource?.id).toBe("ds-sales-1");
    });

    it("matches resource by case-insensitive name", () => {
      const match = resolveResource("Sales_Data.csv", sampleResources);
      expect(match.isAvailable).toBe(true);
      expect(match.resource?.id).toBe("ds-sales-1");
    });

    it("returns isAvailable false when catalog exists and resource is missing", () => {
      const match = resolveResource("deleted_file.csv", sampleResources);
      expect(match.isAvailable).toBe(false);
      expect(match.resource).toBeUndefined();
    });
  });

  describe("DataReferenceChip", () => {
    it("renders clickable chip and triggers onSelect when clicked", async () => {
      const handleSelect = vi.fn();
      const user = userEvent.setup();

      render(
        <DataReferenceChip
          kind="dataset"
          name="sales_data.csv"
          resourceId="ds-sales-1"
          isAvailable={true}
          onSelect={handleSelect}
        />
      );

      const chip = screen.getByRole("button", { name: "Open data reference: sales_data.csv" });
      expect(chip).toBeVisible();
      await user.click(chip);
      expect(handleSelect).toHaveBeenCalledWith("ds-sales-1");
    });

    it("gracefully handles missing/unavailable resources with disabled styling and notice", () => {
      render(
        <DataReferenceChip
          kind="dataset"
          name="missing_dataset.csv"
          resourceId="ds-missing"
          isAvailable={false}
        />
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("missing_dataset.csv");
      expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    });
  });

  describe("HighlightedValue", () => {
    it("renders currency figures with prominent badge", () => {
      render(<HighlightedValue type="currency" value="$1,450,000" />);
      expect(screen.getByText("$1,450,000")).toBeVisible();
    });

    it("renders positive percent with green badge and trending up icon", () => {
      render(<HighlightedValue type="percent-positive" value="+18.4%" />);
      expect(screen.getByText("+18.4%")).toBeVisible();
    });

    it("renders negative percent with rose badge and trending down icon", () => {
      render(<HighlightedValue type="percent-negative" value="-4.2%" />);
      expect(screen.getByText("-4.2%")).toBeVisible();
    });

    it("renders column names distinctly", () => {
      render(<HighlightedValue type="column" value="customer_segment" />);
      expect(screen.getByText("customer_segment")).toBeVisible();
    });
  });

  describe("renderRichText parser", () => {
    it("parses bracketed datasets and makes them clickable", async () => {
      const handleSelect = vi.fn();
      const user = userEvent.setup();

      render(
        <div>
          {renderRichText(
            "We analyzed [sales_data.csv] and found steady growth.",
            sampleResources,
            handleSelect
          )}
        </div>
      );

      const button = screen.getByRole("button", { name: "Open data reference: sales_data.csv" });
      expect(button).toBeVisible();
      await user.click(button);
      expect(handleSelect).toHaveBeenCalledWith("ds-sales-1");
    });

    it("parses explicit dataset, artifact, and column tags", () => {
      render(
        <div>
          {renderRichText(
            "Using [dataset:customers.parquet] we calculated [column:annual_revenue] for [artifact:revenue_chart.png].",
            sampleResources
          )}
        </div>
      );

      expect(
        screen.getByRole("button", { name: "Open data reference: customers.parquet" })
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Open data reference: revenue_chart.png" })
      ).toBeVisible();
      expect(screen.getByText("annual_revenue")).toBeVisible();
    });

    it("highlights financial metrics and percentages inline", () => {
      render(
        <div>
          {renderRichText(
            "Total gross revenue reached $4.2M with a margin improvement of +14.5% compared to prior quarter.",
            sampleResources
          )}
        </div>
      );

      expect(screen.getByText("$4.2M")).toBeVisible();
      expect(screen.getByText("+14.5%")).toBeVisible();
    });

    it("survives streamed rendering with unclosed brackets without errors", () => {
      render(
        <div>
          {renderRichText(
            "Streamed chunk with unclosed token: [sales_data.",
            sampleResources
          )}
        </div>
      );

      expect(screen.getByText(/Streamed chunk with unclosed token: \[sales_data\./)).toBeVisible();
    });

    it("handles missing resource gracefully inside text flow", () => {
      render(
        <div>
          {renderRichText(
            "Referenced [missing_archive.parquet] was not found.",
            sampleResources
          )}
        </div>
      );

      expect(screen.getByRole("status")).toHaveTextContent("missing_archive.parquet");
      expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    });
  });
});
