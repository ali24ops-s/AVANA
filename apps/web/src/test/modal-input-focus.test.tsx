import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Dialog, DialogHeader, DialogContent, DialogFooter, Input, Button } from "@avana/ui";
import { CreateEditAssignmentModal } from "../components/teacher/assignments/CreateEditAssignmentModal.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock teacher assignments API
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

function ControlledModalTestHarness({ initialOpen = true, onClose }: { initialOpen?: boolean; onClose?: () => void }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open Dialog</button>
      <Dialog isOpen={isOpen} onClose={handleClose} ariaLabel="تست فوکوس و ورود متن">
        <DialogHeader onClose={handleClose}>
          <h3>تست مودال</h3>
        </DialogHeader>
        <DialogContent>
          <Input
            label="نام یا عنوان *"
            placeholder="تایپ کنید..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogFooter>
          <Button onClick={() => setSubmittedText(text)}>ثبت</Button>
        </DialogFooter>
      </Dialog>
      {submittedText && <span data-testid="submitted">{submittedText}</span>}
    </div>
  );
}

describe("Modal & Dialog Focus and Interaction Regression Tests", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it("keeps focus on input when typing a single character, full text, backspacing, and pasting in controlled Dialog", async () => {
    const handleClose = vi.fn();
    render(<ControlledModalTestHarness onClose={handleClose} />);

    const input = screen.getByLabelText("نام یا عنوان *") as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // 1. Type a single letter
    fireEvent.change(input, { target: { value: "آ" } });
    expect(input.value).toBe("آ");
    expect(document.activeElement).toBe(input);

    // 2. Type full title character by character
    fireEvent.change(input, { target: { value: "آزمون" } });
    expect(input.value).toBe("آزمون");
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "آزمون فیزیک ۱" } });
    expect(input.value).toBe("آزمون فیزیک ۱");
    expect(document.activeElement).toBe(input);

    // 3. Backspace
    fireEvent.change(input, { target: { value: "آزمون فیزیک" } });
    expect(input.value).toBe("آزمون فیزیک");
    expect(document.activeElement).toBe(input);

    // 4. Paste
    fireEvent.change(input, { target: { value: "آزمون جامع شیمی کنکور" } });
    expect(input.value).toBe("آزمون جامع شیمی کنکور");
    expect(document.activeElement).toBe(input);

    // Ensure close callback was NEVER called during typing
    expect(handleClose).not.toHaveBeenCalled();

    // 5. Close button only closes on explicit user click
    const closeBtn = screen.getByRole("button", { name: "بستن پنجره" });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("CreateEditAssignmentModal: typing in 'عنوان تکلیف *' preserves focus and allows full submission flow", async () => {
    const handleClose = vi.fn();
    mockCreateAssignment.mockResolvedValueOnce({
      assignment: { id: "asg-123", title: "تکلیف ریاضی پیشرفته" },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={handleClose}
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const titleInput = screen.getByLabelText("عنوان تکلیف *") as HTMLInputElement;
    titleInput.focus();
    expect(document.activeElement).toBe(titleInput);

    // 1. Type a single letter
    fireEvent.change(titleInput, { target: { value: "ت" } });
    expect(titleInput.value).toBe("ت");
    expect(document.activeElement).toBe(titleInput);

    // 2. Type full title
    fireEvent.change(titleInput, { target: { value: "تکلیف ریاضی پیشرفته" } });
    expect(titleInput.value).toBe("تکلیف ریاضی پیشرفته");
    expect(document.activeElement).toBe(titleInput);

    // 3. Backspace
    fireEvent.change(titleInput, { target: { value: "تکلیف ریاضی" } });
    expect(titleInput.value).toBe("تکلیف ریاضی");
    expect(document.activeElement).toBe(titleInput);

    // 4. Paste
    fireEvent.change(titleInput, { target: { value: "تکلیف جامع فصل سوم زیست‌شناسی" } });
    expect(titleInput.value).toBe("تکلیف جامع فصل سوم زیست‌شناسی");
    expect(document.activeElement).toBe(titleInput);

    // 5. Submit valid assignment
    const submitBtn = screen.getByRole("button", { name: "انتشار تکلیف" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "تکلیف جامع فصل سوم زیست‌شناسی",
          status: "published",
        }),
      );
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("CreateEditAssignmentModal: validation error for empty / short title", async () => {
    const handleClose = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <CreateEditAssignmentModal
          isOpen={true}
          onClose={handleClose}
          classroomId="cls-100"
        />
      </QueryClientProvider>,
    );

    const titleInput = screen.getByLabelText("عنوان تکلیف *") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: " " } });

    const submitBtn = screen.getByRole("button", { name: "انتشار تکلیف" });
    fireEvent.click(submitBtn);

    expect(await screen.findByText("عنوان تکلیف باید حداقل ۲ کاراکتر باشد")).toBeInTheDocument();
    expect(mockCreateAssignment).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });
});
