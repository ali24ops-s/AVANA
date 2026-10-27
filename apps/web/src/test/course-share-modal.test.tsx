import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CourseShareModal } from "../components/courses/CourseShareModal.js";

describe("CourseShareModal", () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = navigator.share;
  const originalOpen = window.open;

  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <CourseShareModal
        isOpen={false}
        onClose={vi.fn()}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
          subject: "داروسازی",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders course title, canonical URL input, and share options when open", () => {
    render(
      <CourseShareModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
          subject: "داروسازی",
        }}
      />,
    );

    expect(screen.getByText("اشتراک‌گذاری دوره")).toBeInTheDocument();
    expect(screen.getByText("فارماکولوژی ۱")).toBeInTheDocument();
    expect(screen.getByText("کپی لینک")).toBeInTheDocument();
    expect(screen.getByText("تلگرام")).toBeInTheDocument();
    expect(screen.getByText("واتساپ")).toBeInTheDocument();
    expect(screen.getByText("ساخت استوری دوره")).toBeInTheDocument();

    const input = screen.getByDisplayValue(/\/courses\/00000000-0000-4000-a000-000000000001/);
    expect(input).toBeInTheDocument();
  });

  it("copies canonical link to clipboard and shows feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <CourseShareModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
        }}
      />,
    );

    const copyBtn = screen.getByText("کپی لینک");
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("/courses/00000000-0000-4000-a000-000000000001"),
    );

    await waitFor(() => {
      expect(screen.getByText("کپی شد")).toBeInTheDocument();
    });
  });

  it("opens Telegram share URL with valid Persian encoding", () => {
    render(
      <CourseShareModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی پایه",
        }}
      />,
    );

    const telegramBtn = screen.getByText("تلگرام").closest("button");
    expect(telegramBtn).toBeTruthy();
    fireEvent.click(telegramBtn!);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("https://t.me/share/url?url="),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens WhatsApp share URL with valid Persian encoding", () => {
    render(
      <CourseShareModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی پایه",
        }}
      />,
    );

    const whatsappBtn = screen.getByText("واتساپ").closest("button");
    expect(whatsappBtn).toBeTruthy();
    fireEvent.click(whatsappBtn!);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("https://api.whatsapp.com/send?text="),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens CourseStoryModal when clicking 'ساخت استوری دوره'", async () => {
    render(
      <CourseShareModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی پایه",
        }}
      />,
    );

    const storyBtn = screen.getByText("ساخت استوری دوره").closest("button");
    expect(storyBtn).toBeTruthy();
    fireEvent.click(storyBtn!);

    await waitFor(() => {
      expect(screen.getByText("ساخت استوری اینستاگرام")).toBeInTheDocument();
      expect(screen.getByText("تصویر استاندارد ۹:۱۶ با ابعاد ۱۰۸۰×۱۹۲۰")).toBeInTheDocument();
    });
  });

  it("calls onClose when clicking close button", () => {
    const onClose = vi.fn();
    render(
      <CourseShareModal
        isOpen={true}
        onClose={onClose}
        course={{
          id: "00000000-0000-4000-a000-000000000001",
          title: "فارماکولوژی ۱",
        }}
      />,
    );

    const closeBtn = screen.getByLabelText("بستن");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
