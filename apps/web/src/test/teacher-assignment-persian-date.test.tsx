import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateEditAssignmentModal } from "../components/teacher/assignments/CreateEditAssignmentModal.js";
import type { TeacherAssignmentListItemDTO } from "../lib/api/teacher.js";

// Mock hooks
const mockCreateAssignment = vi.fn();
const mockUpdateAssignment = vi.fn();

vi.mock("../hooks/useTeacherAssignments.js", () => ({
  useCreateAssignment: () => ({
    mutateAsync: mockCreateAssignment,
    isPending: false,
  }),
  useUpdateAssignment: () => ({
    mutateAsync: mockUpdateAssignment,
    isPending: false,
  }),
}));

describe("Teacher Assignment Creation & Editing — Persian Date Picker Integration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it("renders Persian date picker and time inputs for both start and deadline fields in create mode", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          classroomId="cls-test-100"
        />
      </QueryClientProvider>,
    );

    // Modal Title
    expect(screen.getByText("ایجاد تکلیف کلاسی جدید")).toBeInTheDocument();

    // Schedule section headers
    expect(screen.getByText("زمان شروع دریافت پاسخ")).toBeInTheDocument();
    expect(screen.getByText("مهلت نهایی ارسال پاسخ (Deadline)")).toBeInTheDocument();

    // Date Picker trigger buttons with Persian badge
    const dateButtons = screen.getAllByRole("button", { name: /تاریخ/i });
    expect(dateButtons.length).toBeGreaterThanOrEqual(2);

    // Persian badges ("شمسی")
    const persianBadges = screen.getAllByText("شمسی");
    expect(persianBadges.length).toBe(2);

    // Time inputs
    expect(screen.getByLabelText("ساعت شروع *")).toBeInTheDocument();
    expect(screen.getByLabelText("ساعت مهلت تحویل *")).toBeInTheDocument();
  });

  it("opens Persian calendar popup with Persian month names and week headers when date trigger is clicked", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          classroomId="cls-test-100"
        />
      </QueryClientProvider>,
    );

    const startDateButton = screen.getByRole("button", { name: "تاریخ شروع *" });
    fireEvent.click(startDateButton);

    // Calendar Dialog is opened
    expect(screen.getByRole("dialog", { name: "تقویم انتخاب تاریخ شمسی" })).toBeInTheDocument();

    // Month selector with Persian months
    expect(screen.getByRole("combobox", { name: "انتخاب ماه" })).toBeInTheDocument();
    expect(screen.getByText("فروردین")).toBeInTheDocument();
    expect(screen.getByText("مهر")).toBeInTheDocument();
    expect(screen.getByText("اسفند")).toBeInTheDocument();

    // Persian weekday abbreviations (ش, ی, د, س, چ, پ, ج)
    expect(screen.getByText("ش")).toBeInTheDocument();
    expect(screen.getByText("ج")).toBeInTheDocument();

    // Quick select today button
    expect(screen.getByRole("button", { name: /انتخاب امروز/i })).toBeInTheDocument();
  });

  it("converts selected Persian dates into valid ISO strings and submits to API", async () => {
    const handleClose = vi.fn();
    mockCreateAssignment.mockResolvedValueOnce({
      assignment: { id: "asg-new-1" },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={handleClose}
          classroomId="cls-test-100"
        />
      </QueryClientProvider>,
    );

    // Fill Title
    const titleInput = screen.getByLabelText("عنوان تکلیف *");
    fireEvent.change(titleInput, { target: { value: "تکلیف مدارهای الکتریکی ۱" } });

    // Open Start Date Calendar
    const startDateButton = screen.getByRole("button", { name: "تاریخ شروع *" });
    fireEvent.click(startDateButton);

    // Select month "مهر" (month index 7) and day 15 in year 1405 (2026-10-07)
    const monthSelect = screen.getByRole("combobox", { name: "انتخاب ماه" });
    fireEvent.change(monthSelect, { target: { value: "7" } });

    const yearSelect = screen.getByRole("combobox", { name: "انتخاب سال" });
    const options = Array.from(yearSelect.querySelectorAll("option"));
    const option1405 = options.find((opt) => opt.value === "1405");
    if (option1405) {
      fireEvent.change(yearSelect, { target: { value: "1405" } });
    }

    // Day 15 (in Persian: ۱۵ مهر ۱۴۰۵ -> 2026-10-07)
    const day15Button = screen.getByRole("button", { name: /۱۵ مهر/i });
    fireEvent.click(day15Button);

    // Set Start Time to "09:00"
    const startTimeInput = screen.getByLabelText("ساعت شروع *");
    fireEvent.change(startTimeInput, { target: { value: "09:00" } });

    // Set Due Time to "18:00"
    const dueTimeInput = screen.getByLabelText("ساعت مهلت تحویل *");
    fireEvent.change(dueTimeInput, { target: { value: "18:00" } });

    // Open Due Date Calendar
    const dueDateButton = screen.getByRole("button", { name: "تاریخ مهلت تحویل *" });
    fireEvent.click(dueDateButton);

    // Select month "مهر" (month index 7) and day 20 in year 1405 (2026-10-12)
    const dueMonthSelect = screen.getByRole("combobox", { name: "انتخاب ماه" });
    fireEvent.change(dueMonthSelect, { target: { value: "7" } });

    const day20Button = screen.getByRole("button", { name: /۲۰ مهر/i });
    fireEvent.click(day20Button);

    // Submit as published
    const publishBtn = screen.getByRole("button", { name: "انتشار تکلیف" });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreateAssignment.mock.calls[0][0];
    expect(payload.title).toBe("تکلیف مدارهای الکتریکی ۱");
    expect(payload.status).toBe("published");

    // Verify converted timestamps
    const startObj = new Date(payload.startsAt);
    const dueObj = new Date(payload.dueAt);

    expect(startObj.getFullYear()).toBe(2026);
    expect(startObj.getMonth()).toBe(9); // October
    expect(startObj.getDate()).toBe(7);
    expect(startObj.getHours()).toBe(9);
    expect(startObj.getMinutes()).toBe(0);

    expect(dueObj.getFullYear()).toBe(2026);
    expect(dueObj.getMonth()).toBe(9); // October
    expect(dueObj.getDate()).toBe(12);
    expect(dueObj.getHours()).toBe(18);
    expect(dueObj.getMinutes()).toBe(0);

    expect(dueObj.getTime()).toBeGreaterThan(startObj.getTime());
    expect(handleClose).toHaveBeenCalled();
  });

  it("populates existing assignment ISO timestamps into Persian date picker in edit mode", async () => {
    // 2026-10-07 10:00 (15 Mehr 1405) and 2026-10-14 23:59 (22 Mehr 1405)
    const mockAssignment: TeacherAssignmentListItemDTO = {
      id: "asg-edit-1",
      title: "تمرین آناتومی سر و گردن",
      description: "پاسخ به سوالات ضمیمه شده",
      status: "draft",
      startsAt: new Date(2026, 9, 7, 10, 0, 0).toISOString(),
      dueAt: new Date(2026, 9, 14, 23, 59, 0).toISOString(),
      submissionsCount: 0,
      gradedCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockUpdateAssignment.mockResolvedValueOnce({
      assignment: mockAssignment,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          classroomId="cls-test-100"
          assignmentToEdit={mockAssignment}
        />
      </QueryClientProvider>,
    );

    // Modal Header
    expect(screen.getByText("ویرایش تکلیف کلاسی")).toBeInTheDocument();

    // Input values loaded
    expect(screen.getByDisplayValue("تمرین آناتومی سر و گردن")).toBeInTheDocument();
    expect(screen.getByDisplayValue("پاسخ به سوالات ضمیمه شده")).toBeInTheDocument();

    // Persian date display in trigger buttons (15 Mehr 1405 and 22 Mehr 1405)
    expect(screen.getByText(/۱۵ مهر ۱۴۰۵/)).toBeInTheDocument();
    expect(screen.getByText(/۲۲ مهر ۱۴۰۵/)).toBeInTheDocument();

    // Time values
    expect((screen.getByLabelText("ساعت شروع *") as HTMLInputElement).value).toBe("10:00");
    expect((screen.getByLabelText("ساعت مهلت تحویل *") as HTMLInputElement).value).toBe("23:59");
  });

  it("validates that dueAt must be strictly after startsAt based on real timestamp", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          classroomId="cls-test-100"
        />
      </QueryClientProvider>,
    );

    // Fill Title
    const titleInput = screen.getByLabelText("عنوان تکلیف *");
    fireEvent.change(titleInput, { target: { value: "تکلیف نامعتبر زمانی" } });

    // Open Start Date Calendar -> Select 20 Mehr 1405
    const startDateButton = screen.getByRole("button", { name: "تاریخ شروع *" });
    fireEvent.click(startDateButton);

    const monthSelect = screen.getByRole("combobox", { name: "انتخاب ماه" });
    fireEvent.change(monthSelect, { target: { value: "7" } });

    const day20Button = screen.getByRole("button", { name: /۲۰ مهر/i });
    fireEvent.click(day20Button);

    // Open Due Date Calendar -> Select 15 Mehr 1405 (earlier than start date!)
    const dueDateButton = screen.getByRole("button", { name: "تاریخ مهلت تحویل *" });
    fireEvent.click(dueDateButton);

    const dueMonthSelect = screen.getByRole("combobox", { name: "انتخاب ماه" });
    fireEvent.change(dueMonthSelect, { target: { value: "7" } });

    const day15Button = screen.getByRole("button", { name: /۱۵ مهر/i });
    fireEvent.click(day15Button);

    // Try submitting
    const publishBtn = screen.getByRole("button", { name: "انتشار تکلیف" });
    fireEvent.click(publishBtn);

    // Validation error must appear
    expect(
      await screen.findByText("مهلت ارسال باید بعد از زمان شروع باشد"),
    ).toBeInTheDocument();
    expect(mockCreateAssignment).not.toHaveBeenCalled();
  });

  it("submits draft status correctly when 'ذخیره پیش‌نویس' is clicked", async () => {
    const handleClose = vi.fn();
    mockCreateAssignment.mockResolvedValueOnce({
      assignment: { id: "asg-draft-1" },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={handleClose}
          classroomId="cls-test-100"
        />
      </QueryClientProvider>,
    );

    const titleInput = screen.getByLabelText("عنوان تکلیف *");
    fireEvent.change(titleInput, { target: { value: "پیش‌نویس تکلیف فارماکولوژی" } });

    const draftBtn = screen.getByRole("button", { name: "ذخیره پیش‌نویس" });
    fireEvent.click(draftBtn);

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "پیش‌نویس تکلیف فارماکولوژی",
          status: "draft",
        }),
      );
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
