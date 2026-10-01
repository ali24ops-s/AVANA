import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownRenderer } from "../MarkdownRenderer.js";

describe("AVANA Educational Markdown Table Responsive Suite", () => {
  // 1. جدول ۲ ستونه با متن کوتاه
  it("1. renders 2-column table with short text naturally with table-scroll-container and content-table", () => {
    const table2Cols = [
      "| نام دارو | دوز استاندارد |",
      "| :--- | :--- |",
      "| کاپتوپریل | ۱۲.۵ میلی‌گرم |",
      "| انالاپریل | ۵ میلی‌گرم |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={table2Cols} />);

    const wrapper = container.querySelector(".table-scroll-container");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("w-full");
    expect(wrapper).toHaveClass("max-w-full");
    expect(wrapper).toHaveClass("overflow-x-auto");

    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
    expect(table).toHaveClass("content-table");
    expect(table).toHaveClass("w-full");
    expect(table).toHaveClass("min-w-full");
    expect(table).toHaveAttribute("dir", "rtl");
    expect(table).toHaveClass("text-right");

    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(2);
    expect(ths[0]).toHaveTextContent("نام دارو");
    expect(ths[1]).toHaveTextContent("دوز استاندارد");
    // Ensure whitespace-nowrap was removed
    expect(ths[0]).not.toHaveClass("whitespace-nowrap");
    expect(ths[1]).not.toHaveClass("whitespace-nowrap");
    expect(ths[0]).toHaveClass("align-top");

    const tds = container.querySelectorAll("td");
    expect(tds.length).toBe(4);
    expect(tds[0]).toHaveTextContent("کاپتوپریل");
    expect(tds[0]).toHaveClass("align-top");
    expect(tds[0]).toHaveClass("break-words");
    expect(tds[0]).toHaveClass("[unicode-bidi:isolate]");
  });

  // 2. جدول ۳ ستونه با متن فارسی
  it("2. renders 3-column Persian educational table with top alignment and bidi isolation", () => {
    const table3Cols = [
      "| هورمون | نسبت ترشح | عملکرد فیزیولوژیک |",
      "| :--- | :--- | :--- |",
      "| تیروکسین ($T_4$) | ۸۰٪ | تنظیم متابولیسم پایه بدن |",
      "| تری‌یدوتیرونین ($T_3$) | ۲۰٪ | فرم فعال با میل اتصالی بالاتر |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={table3Cols} />);

    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
    expect(table).toHaveAttribute("dir", "rtl");

    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(3);
    ths.forEach((th) => {
      expect(th).toHaveClass("text-right");
      expect(th).toHaveClass("[unicode-bidi:isolate]");
    });

    const tds = container.querySelectorAll("td");
    expect(tds.length).toBe(6);
    tds.forEach((td) => {
      expect(td).toHaveClass("text-right");
      expect(td).toHaveClass("align-top");
      expect(td).toHaveClass("break-words");
      expect(td).toHaveClass("[unicode-bidi:isolate]");
    });

    // KaTeX inline math must be rendered inside cells
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });

  // 3. جدول ۴ ستونه
  it("3. renders 4-column pharmacology table cleanly", () => {
    const table4Cols = [
      "| دارو | رده فارماکولوژی | نیمه‌عمر | راه دفع |",
      "| :--- | :--- | :--- | :--- |",
      "| لوزارتان | ARB | ۶ تا ۹ ساعت | کبدی و کلیوی |",
      "| والزارتان | ARB | ۶ ساعت | عمدتاً مدفوع |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={table4Cols} />);

    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(4);
    const tds = container.querySelectorAll("td");
    expect(tds.length).toBe(8);
  });

  // 4. جدول ۵ تا ۶ ستونه با توضیحات طولانی
  it("4. renders 5-6 column wide table with long clinical explanations", () => {
    const table6Cols = [
      "| رده دارویی | داروی شاخص | مکانیسم عملکرد مولکولی | کاربرد بالینی خط اول | عوارض جانبی عمده | منع مصرف |",
      "| :--- | :--- | :--- | :--- | :--- | :--- |",
      "| مهارکننده ACE | کاپتوپریل | مهار رقابتی آنزیم مبدل آنژیوتانسین و افزایش برادی‌کینین | فشار خون و نارسایی قلبی | سرفه خشک، هایپرکالمی و آنژیوادم | بارداری و تنگی دوطرفه شریان کلیه |",
      "| مسدودکننده ARB | لوزارتان | مسدودکننده اختصاصی گیرنده AT1 آنژیوتانسین II | عدم تحمل مهارکننده ACE | هایپرکالمی و افت فشار خون | بارداری |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={table6Cols} />);

    const wrapper = container.querySelector(".table-scroll-container");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("overflow-x-auto");

    const table = container.querySelector("table.content-table");
    expect(table).toBeInTheDocument();

    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(6);
    ths.forEach((th) => {
      // Long headers must NOT have whitespace-nowrap
      expect(th).not.toHaveClass("whitespace-nowrap");
      expect(th).toHaveClass("align-top");
    });

    const tds = container.querySelectorAll("td");
    expect(tds.length).toBe(12);
  });

  // 5. جدول با هدرهای طولانی
  it("5. renders table with very long multi-word headers without blowing out table layout", () => {
    const longHeaderTable = [
      "| رده دارویی | کاربرد بالینی و دستور مصرف داروهای قلبی عروقی در بیماران پرخطر سالمند | عوارض جانبی شایع گزارش‌شده در کارآزمایی‌های تصادفی‌سازی‌شده |",
      "| :--- | :--- | :--- |",
      "| مهارکننده بتا | متوپرولول سوکسینات | برادی‌کاردی و خستگی |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={longHeaderTable} />);

    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(3);
    ths.forEach((th) => {
      expect(th).not.toHaveClass("whitespace-nowrap");
      expect(th).toHaveClass("align-top");
    });
  });

  // 6. جدول با سلول‌های بسیار طولانی
  it("6. renders table with very long multiline paragraphs in cells without corrupting Persian text", () => {
    const longCellTable = [
      "| رده | توضیحات تفصیلی بالینی |",
      "| :--- | :--- |",
      "| مهارکننده ACE | داروی کاپتوپریل برای درمان نارسایی قلبی با کسر تخلیه پایین (HFrEF) تجویز می‌شود و باید با دوز اولیه کم شروع شود تا از افت فشار خون وضعیتی جلوگیری شود. همچنین پایش دقیق سطح سرمی پتاسیم و کراتینین بیمار ظرف دو هفته الزامی است زیرا ممکن است سطح GFR تا ۳۰ درصد به صورت موقت کاهش یابد. |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={longCellTable} />);

    const tds = container.querySelectorAll("td");
    expect(tds.length).toBe(2);
    expect(tds[1]).toHaveClass("break-words");
    expect(tds[1]).toHaveClass("align-top");
    expect(tds[1].textContent).toContain("داروی کاپتوپریل برای درمان نارسایی قلبی");
    expect(tds[1].textContent).toContain("کاهش یابد.");
  });

  // 7. جدول دارای اعداد، فرمول‌های شیمیایی و KaTeX
  it("7. renders table containing numbers, units, chemical formulas and KaTeX with bidi preservation", () => {
    const mathPharmaTable = [
      "| هورمون | نسبت ترشح | فرمول کلیرانس | دوز روزانه |",
      "| :--- | :--- | :--- | :--- |",
      "| تیروکسین ($T_4$) | حدود $80\\%$ | $CL = \\frac{Dose}{AUC}$ | 100 mcg/day |",
      "| کلسیتونین | یون $Ca^{2+}$ | $V_d = \\frac{D}{C_0}$ | 50 IU |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={mathPharmaTable} />);

    const table = container.querySelector("table");
    expect(table).toHaveAttribute("dir", "rtl");

    // KaTeX elements rendered
    const katexEls = container.querySelectorAll(".katex");
    expect(katexEls.length).toBeGreaterThanOrEqual(4);

    // Mixed units and numbers preserved
    expect(container.textContent).toContain("100 mcg/day");
    expect(container.textContent).toContain("50 IU");
  });

  // 8. جدول در کانتینر .prose بدون تداخل بوردر و مارجین
  it("8. renders inside .prose container without conflict with prose table styles", () => {
    const tableInsideProse = [
      "| دارو | دوز |",
      "| :--- | :--- |",
      "| آتنولول | ۵۰ میلی‌گرم |",
    ].join("\n");

    const { container } = render(
      <div className="prose">
        <MarkdownRenderer content={tableInsideProse} />
      </div>
    );

    const wrapper = container.querySelector(".table-scroll-container");
    expect(wrapper).toBeInTheDocument();

    const table = container.querySelector("table.content-table");
    expect(table).toBeInTheDocument();
    expect(table).toHaveClass("min-w-full");
    expect(table).toHaveClass("w-full");
  });

  // 9. حالت LTR با تنظیم جهت صریح
  it("9. respects dir='ltr' configuration cleanly", () => {
    const ltrTable = [
      "| Drug | Class | Half-life |",
      "| :--- | :--- | :--- |",
      "| Lisinopril | ACE Inhibitor | 12 hours |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={ltrTable} dir="ltr" />);

    const table = container.querySelector("table");
    expect(table).toHaveAttribute("dir", "ltr");
    expect(table).toHaveClass("text-left");

    const ths = container.querySelectorAll("th");
    ths.forEach((th) => {
      expect(th).toHaveAttribute("dir", "ltr");
      expect(th).toHaveClass("text-left");
    });

    const tds = container.querySelectorAll("td");
    tds.forEach((td) => {
      expect(td).toHaveAttribute("dir", "ltr");
      expect(td).toHaveClass("text-left");
    });
  });

  // 10. شبیه‌سازی عرض‌های مختلف Viewport (320px, 375px, 414px, 768px, 1280px)
  describe("Viewport Container Sizing Invariants", () => {
    const viewports = [
      { name: "320px (iPhone SE narrow)", width: "320px" },
      { name: "375px (iPhone standard)", width: "375px" },
      { name: "414px (iPhone Plus/Max)", width: "414px" },
      { name: "768px (iPad portrait)", width: "768px" },
      { name: "1280px (Desktop wide)", width: "1280px" },
    ];

    viewports.forEach(({ name, width }) => {
      it(`renders both 2-column and 5-column tables safely inside ${name} viewport container`, () => {
        const content = [
          "### جدول ۲ ستونه ساده",
          "",
          "| دارو | دوز |",
          "| :--- | :--- |",
          "| آسپیرین | ۸۰ mg |",
          "",
          "### جدول ۵ ستونه عریض",
          "",
          "| دارو | رده | مکانیسم | اندیکاسیون | دوز |",
          "| :--- | :--- | :--- | :--- | :--- |",
          "| لوزارتان | ARB | مهار AT1 | فشار خون | ۵۰ mg |",
        ].join("\n");

        const { container } = render(
          <div style={{ width, maxWidth: "100%", overflow: "hidden" }}>
            <MarkdownRenderer content={content} />
          </div>
        );

        const wrappers = container.querySelectorAll(".table-scroll-container");
        expect(wrappers.length).toBe(2);

        wrappers.forEach((wrapper) => {
          expect(wrapper).toHaveClass("overflow-x-auto");
          expect(wrapper).toHaveClass("w-full");
          expect(wrapper).toHaveClass("max-w-full");

          const table = wrapper.querySelector("table");
          expect(table).toHaveClass("content-table");
          expect(table).toHaveClass("min-w-full");
        });
      });
    });
  });

  // 11. تست مهم مشخص‌شده در دستورالعمل (جدول داروها بدون کولون)
  it("11. renders 3-column pharmacology table without colons (|---|---|---|) with full RTL and right-align", () => {
    const pharmaTable = [
      "| نام دارو | مکانیسم اثر | کاربرد |",
      "|---|---|---|",
      "| آموکسیسیلین | مهار سنتز دیواره سلولی | عفونتهای باکتریایی |",
      "| متفورمین | کاهش تولید گلوکز کبدی | دیابت نوع ۲ |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={pharmaTable} />);

    const scrollContainer = container.querySelector(".table-scroll-container");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveAttribute("dir", "rtl");

    const table = container.querySelector("table.content-table");
    expect(table).toBeInTheDocument();
    expect(table).toHaveAttribute("dir", "rtl");
    expect(table).toHaveClass("text-right");

    const ths = container.querySelectorAll("th");
    expect(ths.length).toBe(3);
    expect(ths[0]).toHaveTextContent("نام دارو");
    expect(ths[1]).toHaveTextContent("مکانیسم اثر");
    expect(ths[2]).toHaveTextContent("کاربرد");
    ths.forEach((th) => {
      expect(th).toHaveAttribute("dir", "rtl");
      expect(th).toHaveClass("text-right");
    });

    const tds = container.querySelectorAll("td");
    expect(tds.length).toBe(6);
    expect(tds[0]).toHaveTextContent("آموکسیسیلین");
    expect(tds[1]).toHaveTextContent("مهار سنتز دیواره سلولی");
    expect(tds[2]).toHaveTextContent("عفونتهای باکتریایی");
    expect(tds[3]).toHaveTextContent("متفورمین");
    expect(tds[4]).toHaveTextContent("کاهش تولید گلوکز کبدی");
    expect(tds[5]).toHaveTextContent("دیابت نوع ۲");
    tds.forEach((td) => {
      expect(td).toHaveAttribute("dir", "rtl");
      expect(td).toHaveClass("text-right");
    });
  });

  // 12. نرمال‌سازی کولون چپ‌چین (:---) در جداول فارسی به راست‌چین
  it("12. normalizes left colon syntax (:---) in RTL Persian tables to text-align: right", () => {
    const colonTable = [
      "| نام دارو | مکانیسم اثر | کاربرد |",
      "| :--- | :--- | :--- |",
      "| آموکسیسیلین | مهار سنتز دیواره سلولی | عفونتهای باکتریایی |",
      "| متفورمین | کاهش تولید گلوکز کبدی | دیابت نوع ۲ |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={colonTable} />);

    const ths = container.querySelectorAll("th");
    ths.forEach((th) => {
      expect(th).toHaveStyle({ textAlign: "right" });
    });

    const tds = container.querySelectorAll("td");
    tds.forEach((td) => {
      expect(td).toHaveStyle({ textAlign: "right" });
    });
  });

  // 13. حفظ تراز وسط صریح (:---:) در جداول فارسی
  it("13. preserves explicit center alignment (:---:) in table cells", () => {
    const centerTable = [
      "| نام دارو | دوز روزانه |",
      "| :--- | :---: |",
      "| متفورمین | ۵۰۰ mg |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={centerTable} />);

    const ths = container.querySelectorAll("th");
    expect(ths[0]).toHaveStyle({ textAlign: "right" });
    expect(ths[1]).toHaveStyle({ textAlign: "center" });

    const tds = container.querySelectorAll("td");
    expect(tds[0]).toHaveStyle({ textAlign: "right" });
    expect(tds[1]).toHaveStyle({ textAlign: "center" });
  });
});
