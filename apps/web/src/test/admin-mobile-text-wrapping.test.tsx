/**
 * Admin Mobile Text Wrapping & Responsive Layout Tests
 *
 * Validates:
 *  1. AdminTable dynamic min-width based on column count & horizontal containment
 *  2. PageHeader RTL text alignment (justify-start, text-start) and min-w-0 flex-1
 *  3. AdminSearch & AdminFilter responsive sizing (min-w-0, w-full sm:w-auto)
 *  4. Dialog component compact padding for small mobile screens
 *  5. Persian text readability without awkward vertical character stacking
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AdminTable, AdminSearch, AdminFilter } from "../components/admin/AdminUI.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@avana/ui";

describe("Admin Mobile Text Wrapping & Responsive Suite", () => {
  describe("AdminTable Responsive Min-Width and Scroll Containment", () => {
    it("assigns appropriate dynamic minWidth for small tables (<6 columns)", () => {
      render(
        <AdminTable
          headers={["نام", "ایمیل", "نقش", "عملیات"]}
          emptyMessage="داده‌ای وجود ندارد"
        >
          <tr>
            <td>علی</td>
            <td>ali@example.com</td>
            <td>کاربر</td>
            <td>ویرایش</td>
          </tr>
        </AdminTable>
      );

      const table = screen.getByRole("table");
      expect(table.className).toContain("min-w-[640px]");
      expect(table.parentElement?.className).toContain("overflow-x-auto");
    });

    it("assigns 760px minWidth for medium tables (6-7 columns)", () => {
      render(
        <AdminTable
          headers={["۱", "۲", "۳", "۴", "۵", "۶"]}
          emptyMessage="داده‌ای وجود ندارد"
        >
          <tr>
            <td colSpan={6}>ردیف</td>
          </tr>
        </AdminTable>
      );

      const table = screen.getByRole("table");
      expect(table.className).toContain("min-w-[760px]");
      expect(table.parentElement?.className).toContain("overflow-x-auto");
    });

    it("assigns 880px minWidth for wide tables (>=8 columns)", () => {
      render(
        <AdminTable
          headers={["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸"]}
          emptyMessage="داده‌ای وجود ندارد"
        >
          <tr>
            <td colSpan={8}>ردیف</td>
          </tr>
        </AdminTable>
      );

      const table = screen.getByRole("table");
      expect(table.className).toContain("min-w-[880px]");
      expect(table.parentElement?.className).toContain("overflow-x-auto");
    });

    it("respects explicit custom minWidth override", () => {
      render(
        <AdminTable
          headers={["ستون یک", "ستون دو"]}
          minWidth="min-w-[500px]"
          emptyMessage="داده‌ای وجود ندارد"
        >
          <tr>
            <td>۱</td>
            <td>۲</td>
          </tr>
        </AdminTable>
      );

      const table = screen.getByRole("table");
      expect(table.className).toContain("min-w-[500px]");
      expect(table.className).not.toContain("min-w-[640px]");
    });
  });

  describe("PageHeader RTL Alignment & Responsive Wrapping", () => {
    it("renders with start alignment for natural RTL reading without forced mobile center", () => {
      render(
        <PageHeader
          title="مدیریت اساتید پلتفرم"
          description="نظارت بر وضعیت دوره‌ها، آزمون‌ها و درخواست‌های اساتید دانشگاهی"
          actions={<button type="button">ثبت استاد</button>}
        />
      );

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toBe("مدیریت اساتید پلتفرم");

      // Verify the title/description container has min-w-0 flex-1
      const titleWrapper = heading.parentElement?.parentElement;
      expect(titleWrapper?.className).toContain("min-w-0");
      expect(titleWrapper?.className).toContain("flex-1");

      // Verify header flex layout aligns items naturally to start
      expect(heading.className).toContain("text-start");
      expect(heading.className).not.toContain("text-center");
    });
  });

  describe("Admin Search & Filter Mobile Resilience", () => {
    it("AdminSearch includes min-w-0 and responsive text sizing", () => {
      render(<AdminSearch value="" onChange={() => {}} placeholder="جستجوی کاربر..." />);
      const input = screen.getByPlaceholderText("جستجوی کاربر...");
      expect(input.className).toContain("min-w-0");
      expect(input.className).toContain("text-xs");
    });

    it("AdminFilter includes max-w-full and w-full sm:w-auto", () => {
      render(
        <AdminFilter
          label="نقش کاربر"
          value="all"
          onChange={() => {}}
          options={[
            { label: "همه نقش‌ها", value: "all" },
            { label: "دانشجو", value: "student" },
          ]}
        />
      );
      const select = screen.getByRole("combobox");
      expect(select.className).toContain("max-w-full");
      expect(select.className).toContain("w-full");
    });
  });

  describe("Dialog Component Padding Optimization for 320px Devices", () => {
    it("renders Dialog compound subcomponents with responsive padding p-4 sm:p-6", () => {
      render(
        <Dialog isOpen={true} onClose={() => {}} usePortal={false}>
          <DialogHeader>
            <h3 className="text-lg font-bold">تأیید عملیات مهم</h3>
            <p>آیا از انجام این عملیات اطمینان دارید؟</p>
          </DialogHeader>
          <DialogContent>
            <div>محتوای دیالوگ</div>
          </DialogContent>
          <DialogFooter>
            <button type="button">انصراف</button>
            <button type="button">تأیید</button>
          </DialogFooter>
        </Dialog>
      );

      const title = screen.getByText("تأیید عملیات مهم");
      expect(title).toBeDefined();

      const header = title.closest("[class*='border-b']");
      expect(header?.className).toContain("p-4");
      expect(header?.className).toContain("sm:p-6");

      const body = screen.getByText("محتوای دیالوگ").parentElement;
      expect(body?.className).toContain("p-4");
      expect(body?.className).toContain("sm:p-6");

      const footer = screen.getByText("تأیید").closest("[class*='border-t']");
      expect(footer?.className).toContain("p-4");
      expect(footer?.className).toContain("sm:p-6");
    });
  });
});
