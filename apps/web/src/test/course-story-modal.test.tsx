import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CourseStoryModal } from "../components/courses/CourseStoryModal.js";
import * as generator from "../lib/story/courseStoryGenerator.js";

describe("CourseStoryModal", () => {
  beforeEach(() => {
    // Mock generateCourseStory to return a dummy blob immediately
    vi.spyOn(generator, "generateCourseStory").mockResolvedValue(
      new Blob(["fake-story-png"], { type: "image/png" }),
    );
    // Mock URL methods
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:http://localhost/fake-story"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <CourseStoryModal
        isOpen={false}
        onClose={vi.fn()}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders story preview and download button when Web Share for files is NOT supported", async () => {
    vi.spyOn(generator, "canShareStoryFiles").mockReturnValue(false);
    const downloadSpy = vi.spyOn(generator, "downloadStoryBlob").mockImplementation(() => {});

    render(
      <CourseStoryModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
          shareUrl: "https://aavana.ir/courses/00000000-0000-4000-a000-000000000001",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("دانلود تصویر استوری")).toBeInTheDocument();
    });

    const downloadBtn = screen.getByText("دانلود تصویر استوری");
    fireEvent.click(downloadBtn);

    expect(downloadSpy).toHaveBeenCalled();
  });

  it("renders direct share as primary action when Web Share for files IS supported", async () => {
    vi.spyOn(generator, "canShareStoryFiles").mockReturnValue(true);
    const shareSpy = vi.spyOn(generator, "shareStoryBlob").mockResolvedValue(true);

    render(
      <CourseStoryModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
          shareUrl: "https://aavana.ir/courses/00000000-0000-4000-a000-000000000001",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("اشتراک‌گذاری در استوری / برنامه‌ها")).toBeInTheDocument();
      expect(screen.getByText("دانلود تصویر")).toBeInTheDocument();
    });

    const shareBtn = screen.getByText("اشتراک‌گذاری در استوری / برنامه‌ها");
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(shareSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        "فارماکولوژی ۱",
        "https://aavana.ir/courses/00000000-0000-4000-a000-000000000001",
      );
    });
  });

  it("does not show error when user cancels Web Share sheet (AbortError)", async () => {
    vi.spyOn(generator, "canShareStoryFiles").mockReturnValue(true);
    // User cancels sheet -> returns false without throwing
    vi.spyOn(generator, "shareStoryBlob").mockResolvedValue(false);

    render(
      <CourseStoryModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("اشتراک‌گذاری در استوری / برنامه‌ها")).toBeInTheDocument();
    });

    const shareBtn = screen.getByText("اشتراک‌گذاری در استوری / برنامه‌ها");
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(screen.queryByText(/خطا/)).not.toBeInTheDocument();
    });
  });

  it("shows graceful fallback message when direct sharing encounters genuine failure", async () => {
    vi.spyOn(generator, "canShareStoryFiles").mockReturnValue(true);
    vi.spyOn(generator, "shareStoryBlob").mockRejectedValue(new Error("Platform failure"));

    render(
      <CourseStoryModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("اشتراک‌گذاری در استوری / برنامه‌ها")).toBeInTheDocument();
    });

    const shareBtn = screen.getByText("اشتراک‌گذاری در استوری / برنامه‌ها");
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/امکان اشتراک‌گذاری مستقیم در این دستگاه فراهم نشد/),
      ).toBeInTheDocument();
    });
  });

  it("copies course link for Instagram Link Sticker and shows feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <CourseStoryModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
          shareUrl: "https://aavana.ir/courses/00000000-0000-4000-a000-000000000001",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("کپی لینک دوره")).toBeInTheDocument();
    });

    const copyBtn = screen.getByText("کپی لینک دوره");
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      "https://aavana.ir/courses/00000000-0000-4000-a000-000000000001",
    );

    await waitFor(() => {
      expect(screen.getByText("لینک کپی شد")).toBeInTheDocument();
    });
  });

  it("triggers onClose when clicking cancel button", async () => {
    const onClose = vi.fn();
    render(
      <CourseStoryModal
        isOpen={true}
        onClose={onClose}
        course={{
          courseId: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
        }}
      />,
    );

    const cancelBtn = screen.getByText("انصراف");
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
