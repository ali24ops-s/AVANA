import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  TableLoadingState,
  TableErrorState,
  TableEmptyState,
} from "@avana/ui";

describe("Phase 2I — AdminUI Consolidation", () => {
  it("renders TableLoadingState with correct colSpan and loading message", () => {
    render(
      <table>
        <tbody>
          <TableLoadingState colSpan={5} />
        </tbody>
      </table>
    );

    const td = screen.getByRole("cell");
    expect(td.getAttribute("colspan")).toBe("5");
    expect(screen.getByText("در حال بارگذاری...")).toBeDefined();
  });

  it("renders TableErrorState with error message and AlertTriangle icon", () => {
    render(
      <table>
        <tbody>
          <TableErrorState colSpan={6} message="خطا در برقراری ارتباط با سرور" />
        </tbody>
      </table>
    );

    const td = screen.getByRole("cell");
    expect(td.getAttribute("colspan")).toBe("6");
    expect(screen.getByText("خطا در برقراری ارتباط با سرور")).toBeDefined();
    expect(td.querySelector("svg")).not.toBeNull();
  });

  it("renders TableEmptyState with empty message and colSpan", () => {
    render(
      <table>
        <tbody>
          <TableEmptyState colSpan={6} message="رکوردی یافت نشد." />
        </tbody>
      </table>
    );

    const td = screen.getByRole("cell");
    expect(td.getAttribute("colspan")).toBe("6");
    expect(screen.getByText("رکوردی یافت نشد.")).toBeDefined();
    expect(td.querySelector("svg")).not.toBeNull();
  });
});
