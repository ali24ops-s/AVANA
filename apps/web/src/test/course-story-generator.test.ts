import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCourseStory,
  downloadStoryBlob,
  canShareStoryFiles,
  shareStoryBlob,
} from "../lib/story/courseStoryGenerator.js";

describe("courseStoryGenerator (Instagram Story 9:16 Canvas Engine)", () => {
  let mockContext: Record<string, any>;
  let mockCanvas: Record<string, any>;

  beforeEach(() => {
    mockContext = {
      direction: "rtl",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "",
      textBaseline: "",
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetY: 0,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn().mockImplementation((text: string) => ({
        width: text.length * 15,
      })),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
    };

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockContext),
      toBlob: vi.fn().mockImplementation((cb: (b: Blob) => void) => {
        cb(new Blob(["fake-story-png"], { type: "image/png" }));
      }),
    };

    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreate(tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets canvas dimensions to exactly 1080x1920 (9:16 aspect ratio)", async () => {
    const blob = await generateCourseStory({
      courseId: "00000000-0000-4000-a000-000000000001",
      title: "فارماکولوژی ۱",
      subject: "داروسازی",
    });

    expect(mockCanvas.width).toBe(1080);
    expect(mockCanvas.height).toBe(1920);
    expect(mockContext.direction).toBe("rtl");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("handles long Persian titles with line wrapping without throwing errors", async () => {
    const longTitle =
      "مفاهیم پیشرفته فارماکولوژی بالینی، متابولیسم و نیمه‌عمر داروها در کبد و کلیه بیماران خاص";

    const blob = await generateCourseStory({
      courseId: "00000000-0000-4000-a000-000000000001",
      title: longTitle,
      description: "توضیحات تکمیلی دوره برای آزمون جامع علوم پایه داروسازی",
      subject: "فارماکولوژی",
      stats: {
        moduleCount: 4,
        lessonCount: 16,
        flashcardCount: 60,
        quizQuestionCount: 30,
      },
    });

    expect(blob).toBeTruthy();
    expect(mockContext.fillText).toHaveBeenCalled();
  });

  it("renders branded gradient placeholder when cover image is null", async () => {
    const blob = await generateCourseStory({
      courseId: "00000000-0000-4000-a000-000000000001",
      title: "شیمی دارویی",
      coverImage: null,
    });

    expect(blob).toBeTruthy();
    expect(mockContext.createLinearGradient).toHaveBeenCalled();
  });

  it("downloadStoryBlob triggers an anchor download click", () => {
    const testBlob = new Blob(["test"], { type: "image/png" });
    const createObjectUrlMock = vi.fn().mockReturnValue("blob:http://localhost/fake");
    const revokeObjectUrlMock = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadStoryBlob(testBlob, "test-story.png");

    expect(createObjectUrlMock).toHaveBeenCalledWith(testBlob);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("detects Web Share API file support correctly", () => {
    // When navigator.canShare is undefined
    const originalNavigator = global.navigator;
    Object.assign(navigator, { share: undefined, canShare: undefined });
    expect(canShareStoryFiles()).toBe(false);

    // When navigator.canShare exists and returns true
    Object.assign(navigator, {
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(true),
    });
    expect(canShareStoryFiles()).toBe(true);

    // Restore
    Object.assign(navigator, originalNavigator);
  });

  it("shareStoryBlob shares file when supported", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      share: shareMock,
      canShare: vi.fn().mockReturnValue(true),
    });

    const testBlob = new Blob(["test"], { type: "image/png" });
    const result = await shareStoryBlob(testBlob, "فارماکولوژی", "https://aavana.ir/courses/1");

    expect(result).toBe(true);
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("فارماکولوژی"),
        files: expect.any(Array),
      }),
    );
  });

  it("handles user cancellation of share sheet (AbortError) gracefully without throwing", async () => {
    const abortError = new Error("User canceled share sheet");
    abortError.name = "AbortError";
    const shareMock = vi.fn().mockRejectedValue(abortError);

    Object.assign(navigator, {
      share: shareMock,
      canShare: vi.fn().mockReturnValue(true),
    });

    const testBlob = new Blob(["test"], { type: "image/png" });
    const result = await shareStoryBlob(testBlob, "بیوشیمی", "https://aavana.ir/courses/2");

    expect(result).toBe(false);
    expect(shareMock).toHaveBeenCalled();
  });

  it("throws error when navigator.share encounters a genuine system/permission failure", async () => {
    const permissionError = new Error("Permission denied");
    permissionError.name = "NotAllowedError";
    const shareMock = vi.fn().mockRejectedValue(permissionError);

    Object.assign(navigator, {
      share: shareMock,
      canShare: vi.fn().mockReturnValue(true),
    });

    const testBlob = new Blob(["test"], { type: "image/png" });

    await expect(
      shareStoryBlob(testBlob, "آناتومی", "https://aavana.ir/courses/3"),
    ).rejects.toThrow("Permission denied");
  });

  it("returns false immediately if canShareStoryFiles is false without invoking navigator.share", async () => {
    const shareMock = vi.fn();
    Object.assign(navigator, {
      share: shareMock,
      canShare: vi.fn().mockReturnValue(false),
    });

    const testBlob = new Blob(["test"], { type: "image/png" });
    const result = await shareStoryBlob(testBlob, "ژنتیک", "https://aavana.ir/courses/4");

    expect(result).toBe(false);
    expect(shareMock).not.toHaveBeenCalled();
  });
});
