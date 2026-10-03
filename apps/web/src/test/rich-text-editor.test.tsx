import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RichTextEditor } from "@avana/ui";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { StudentAssignmentSubmissionModal } from "../components/student/assignments/StudentAssignmentSubmissionModal.js";
import { StudentClassroomContents } from "../components/student/contents/StudentClassroomContents.js";
import { AssignmentSubmissionsDrawer } from "../components/teacher/assignments/AssignmentSubmissionsDrawer.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function TestEditorWrapper({
  initialValue = "",
  maxLength,
  showCharacterCount,
}: {
  initialValue?: string;
  maxLength?: number;
  showCharacterCount?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <RichTextEditor
      value={value}
      onChange={setValue}
      label="متن آزمایشی"
      placeholder="تایپ کنید..."
      maxLength={maxLength}
      showCharacterCount={showCharacterCount}
      renderPreview={(cnt) => <MarkdownRenderer content={cnt} />}
    />
  );
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("RichTextEditor Component Suite", () => {
  it("renders textarea, toolbar buttons, and tabs correctly", () => {
    render(<TestEditorWrapper initialValue="متن تستی" />);

    expect(screen.getByLabelText("متن آزمایشی")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("متن تستی");
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حالت ویرایش متن" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "پیش‌نمایش خروجی برای دانشجو" })).toBeInTheDocument();
  });

  it("applies Heading 1, Heading 2, and Heading 3 line formatting", () => {
    render(<TestEditorWrapper initialValue="تیتر بخش" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Focus and select all
    textarea.focus();
    textarea.setSelectionRange(0, 9);
    fireEvent.select(textarea);

    const h1Btn = screen.getByRole("button", { name: "تیتر اصلی سطح ۱" });
    fireEvent.click(h1Btn);
    expect(textarea.value).toBe("# تیتر بخش");

    const h2Btn = screen.getByRole("button", { name: "تیتر سطح ۲" });
    fireEvent.click(h2Btn);
    expect(textarea.value).toBe("## تیتر بخش");

    const h3Btn = screen.getByRole("button", { name: "تیتر سطح ۳" });
    fireEvent.click(h3Btn);
    expect(textarea.value).toBe("### تیتر بخش");
  });

  it("applies Bold, Italic, and Strikethrough inline formatting", () => {
    render(<TestEditorWrapper initialValue="کلمه مهم" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(0, 4);
    fireEvent.select(textarea);

    const boldBtn = screen.getByRole("button", { name: "متن پررنگ (Bold)" });
    fireEvent.click(boldBtn);
    expect(textarea.value).toBe("**کلمه** مهم");

    // Clear and test Italic
    textarea.setSelectionRange(2, 6);
    fireEvent.select(textarea);
    const italicBtn = screen.getByRole("button", { name: "متن مورب (Italic)" });
    fireEvent.click(italicBtn);
    expect(textarea.value).toContain("*");

    // Strikethrough
    const strikeBtn = screen.getByRole("button", { name: "متن خط‌خورده (Strikethrough)" });
    fireEvent.click(strikeBtn);
    expect(textarea.value).toContain("~~");
  });

  it("applies Clear formatting on selected text", () => {
    render(<TestEditorWrapper initialValue="**متن پررنگ** و ~~خط خورده~~" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.select(textarea);

    const clearBtn = screen.getByRole("button", { name: "حذف قالب‌بندی (Clear formatting)" });
    fireEvent.click(clearBtn);

    expect(textarea.value).toBe("متن پررنگ و خط خورده");
  });

  it("applies Bullet list and Numbered list formatting", () => {
    render(<TestEditorWrapper initialValue="آیتم اول" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    const bulletBtn = screen.getByRole("button", { name: "فهرست نشانه‌دار" });
    fireEvent.click(bulletBtn);
    expect(textarea.value).toBe("- آیتم اول");

    const numBtn = screen.getByRole("button", { name: "فهرست شماره‌دار" });
    fireEvent.click(numBtn);
    expect(textarea.value).toBe("1. آیتم اول");
  });

  it("applies Blockquote formatting", () => {
    render(<TestEditorWrapper initialValue="نکته مهم دارویی" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.select(textarea);

    const quoteBtn = screen.getByRole("button", { name: "نقل‌قول یا کادر توجه" });
    fireEvent.click(quoteBtn);
    expect(textarea.value).toBe("> نکته مهم دارویی");
  });

  it("inserts Horizontal Divider", () => {
    render(<TestEditorWrapper initialValue="پاراگراف بالا" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.select(textarea);

    const dividerBtn = screen.getByRole("button", { name: "خط جداکننده افقی" });
    fireEvent.click(dividerBtn);
    expect(textarea.value).toContain("---");
  });

  it("inserts Link via modal and confirms correctly", async () => {
    render(<TestEditorWrapper initialValue="برای دانلود به سایت مراجعه کنید" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    const startIdx = textarea.value.indexOf("سایت");
    textarea.focus();
    textarea.setSelectionRange(startIdx, startIdx + 4); // select "سایت"
    fireEvent.select(textarea);

    const linkBtn = screen.getByRole("button", { name: "افزودن پیوند اینترنتی" });
    fireEvent.click(linkBtn);

    expect(screen.getByText("افزودن پیوند (Link)")).toBeInTheDocument();
    const urlInput = screen.getByPlaceholderText("https://example.com");
    fireEvent.change(urlInput, { target: { value: "https://avana.org" } });

    const confirmBtn = screen.getByRole("button", { name: "ثبت پیوند" });
    fireEvent.click(confirmBtn);

    expect(textarea.value).toContain("[سایت](https://avana.org)");
  });

  it("handles Undo and Redo operations", () => {
    render(<TestEditorWrapper initialValue="متن پایه" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.select(textarea);

    const boldBtn = screen.getByRole("button", { name: "متن پررنگ (Bold)" });
    fireEvent.click(boldBtn);
    expect(textarea.value).toBe("**متن پایه**");

    const undoBtn = screen.getByRole("button", { name: "بازگشت به عقب (Undo)" });
    fireEvent.click(undoBtn);
    expect(textarea.value).toBe("متن پایه");

    const redoBtn = screen.getByRole("button", { name: "تکرار عملیات (Redo)" });
    fireEvent.click(redoBtn);
    expect(textarea.value).toBe("**متن پایه**");
  });

  it("smartly continues and exits bullet list on Enter key", () => {
    render(<TestEditorWrapper initialValue="- آیتم اول" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Press Enter at end of line: should continue with '- '
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(textarea.value).toBe("- آیتم اول\n- ");

    // Press Enter on empty bullet: should exit list
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(textarea.value).toBe("- آیتم اول\n");
  });

  it("smartly continues and increments numbered list on Enter key", () => {
    render(<TestEditorWrapper initialValue="1. گام اول" />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(textarea.value).toBe("1. گام اول\n2. ");

    // Press Enter on empty numbered list: should exit
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(textarea.value).toBe("1. گام اول\n");
  });

  it("switches to Preview tab and renders exact Markdown output", () => {
    render(
      <TestEditorWrapper initialValue="# عنوان درس\n\nنکات:\n- نکته ۱\n- نکته ۲" />
    );

    const previewTab = screen.getByRole("button", { name: "پیش‌نمایش خروجی برای دانشجو" });
    fireEvent.click(previewTab);

    // Textarea is hidden in preview mode
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // Headings and list elements are rendered
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("عنوان درس");
    expect(screen.getByText("نکته ۱")).toBeInTheDocument();
  });

  it("displays character count and honors character limits", () => {
    render(<TestEditorWrapper initialValue="سلام" maxLength={10} showCharacterCount />);

    expect(screen.getByText("۴ / ۱۰ کاراکتر")).toBeInTheDocument();
  });
});

describe("Student & Teacher Markdown View Invariants Suite", () => {
  it("renders complex teacher rich text formatted assignment for students", () => {
    const richMarkdown = [
      "# تکلیف هفتگی: فیزیولوژی قلب",
      "",
      "دانشجویان گرامی لطفاً به موارد زیر پاسخ دهید:",
      "",
      "## بخش اول: سوالات تشریحی",
      "",
      "- اثر داروی **متوپرولول** بر گیرنده $\\beta_1$",
      "- محاسبه کلیرانس کلیوی با رابطه $CL = \\frac{U \\times V}{P}$",
      "",
      "> **نکته مهم:** پاسخ‌ها را تا تاریخ مقرر ارسال نمایید.",
      "",
      "برای مطالعه بیشتر به [کتاب رفرنس](https://avana.org/ref) مراجعه کنید.",
    ].join("\n");

    const { container } = render(<MarkdownRenderer content={richMarkdown} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("تکلیف هفتگی: فیزیولوژی قلب");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("بخش اول: سوالات تشریحی");
    expect(screen.getByText("متوپرولول")).toBeInTheDocument();
    expect(container.querySelector("blockquote")).toHaveTextContent("نکته مهم:");
    expect(screen.getByRole("link", { name: "کتاب رفرنس" })).toHaveAttribute(
      "href",
      "https://avana.org/ref"
    );
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
  });

  it("safely handles legacy plain text with newlines without layout collapse", () => {
    const legacyPlainText = "این یک متن ساده قدیمی است.\nخط دوم متن بدون هیچ مارک‌داونی.";
    const { container } = render(<MarkdownRenderer content={legacyPlainText} />);

    expect(container.textContent).toContain("این یک متن ساده قدیمی است.");
    expect(container.textContent).toContain("خط دوم متن بدون هیچ مارک‌داونی.");
    expect(container.querySelector("p")).toHaveClass("whitespace-pre-line");
  });

  it("strictly disarms malicious XSS script tags, onerror attributes, and javascript: URLs", () => {
    const dangerousInput = [
      "<script>alert('pwned')</script>",
      "<img src=x onerror=alert('xss')>",
      "[حمله اینترنتی](javascript:alert('xss'))",
      "[لینک امن](https://avana.org)",
    ].join("\n\n");

    const { container } = render(<MarkdownRenderer content={dangerousInput} />);

    // Must NOT create executable script elements
    expect(container.querySelectorAll("script").length).toBe(0);
    // Malicious link must have href fallback to '#' instead of executable javascript:
    const dangerousLink = screen.getByRole("link", { name: "حمله اینترنتی" });
    expect(dangerousLink).toHaveAttribute("href", "#");

    // Safe link remains untouched
    const safeLink = screen.getByRole("link", { name: "لینک امن" });
    expect(safeLink).toHaveAttribute("href", "https://avana.org");
    expect(safeLink).toHaveAttribute("rel", "noreferrer noopener");
  });
});
