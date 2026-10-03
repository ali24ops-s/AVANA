import { describe, it, expect } from "vitest";
import {
  detectExternalVideoProvider,
  validateCreateClassroomContentInput,
  validateUpdateClassroomContentInput,
  defaultPolicy,
  asUserId,
  type Actor,
  DomainError,
} from "../index.js";

describe("Classroom Educational Content Domain Tests", () => {
  describe("detectExternalVideoProvider", () => {
    it("converts standard Google Drive /file/d/{id}/view link into embeddable /preview URL", () => {
      const url = "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0/view?usp=sharing";
      const res = detectExternalVideoProvider(url);

      expect(res.provider).toBe("google_drive");
      expect(res.canEmbed).toBe(true);
      expect(res.embedUrl).toBe("https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0/preview");
      expect(res.originalUrl).toBe(url);
    });

    it("converts Google Drive /file/d/{id}/edit link into embeddable /preview URL", () => {
      const url = "https://drive.google.com/file/d/9876543210zyxwvuts/edit";
      const res = detectExternalVideoProvider(url);

      expect(res.provider).toBe("google_drive");
      expect(res.canEmbed).toBe(true);
      expect(res.embedUrl).toBe("https://drive.google.com/file/d/9876543210zyxwvuts/preview");
    });

    it("converts Google Drive open?id={id} link into embeddable /preview URL", () => {
      const url = "https://drive.google.com/open?id=12345ABCDE";
      const res = detectExternalVideoProvider(url);

      expect(res.provider).toBe("google_drive");
      expect(res.canEmbed).toBe(true);
      expect(res.embedUrl).toBe("https://drive.google.com/file/d/12345ABCDE/preview");
    });

    it("converts Google Drive uc?id={id} link into embeddable /preview URL", () => {
      const url = "https://drive.google.com/uc?id=XYZ998877";
      const res = detectExternalVideoProvider(url);

      expect(res.provider).toBe("google_drive");
      expect(res.canEmbed).toBe(true);
      expect(res.embedUrl).toBe("https://drive.google.com/file/d/XYZ998877/preview");
    });

    it("handles Google Drive folder/non-file links with canEmbed: false and null embedUrl", () => {
      const url = "https://drive.google.com/drive/folders/1A2B3C4D5E";
      const res = detectExternalVideoProvider(url);

      expect(res.provider).toBe("google_drive");
      expect(res.canEmbed).toBe(false);
      expect(res.embedUrl).toBeNull();
    });

    it("identifies generic external video provider with canEmbed: false", () => {
      const url = "https://example.com/videos/lesson-1.mp4";
      const res = detectExternalVideoProvider(url);

      expect(res.provider).toBe("generic");
      expect(res.canEmbed).toBe(false);
      expect(res.embedUrl).toBeNull();
      expect(res.originalUrl).toBe(url);
    });

    it("rejects malicious javascript: scheme URLs", () => {
      expect(() =>
        detectExternalVideoProvider("javascript:alert(1)"),
      ).toThrow(DomainError);
    });

    it("rejects data: scheme URLs", () => {
      expect(() =>
        detectExternalVideoProvider("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="),
      ).toThrow(DomainError);
    });

    it("rejects file: scheme URLs", () => {
      expect(() =>
        detectExternalVideoProvider("file:///etc/passwd"),
      ).toThrow(DomainError);
    });

    it("rejects invalid URLs", () => {
      expect(() =>
        detectExternalVideoProvider("not a valid url"),
      ).toThrow(DomainError);
    });
  });

  describe("validateCreateClassroomContentInput", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";

    it("validates text content successfully", () => {
      const input = {
        classroomId: validUuid,
        contentType: "text",
        title: "نکات درس دوم",
        description: "توضیحات تکمیلی برای فصل دو",
        textContent: "این یک متن آموزشی نمونه است.",
        status: "published",
      };

      const res = validateCreateClassroomContentInput(input);
      expect(res.title).toBe("نکات درس دوم");
      expect(res.contentType).toBe("text");
      expect(res.textContent).toBe("این یک متن آموزشی نمونه است.");
      expect(res.status).toBe("published");
    });

    it("validates external video content successfully", () => {
      const input = {
        classroomId: validUuid,
        contentType: "video_external",
        title: "جلسه اول - ویدئوی ضبط شده",
        externalUrl: "https://drive.google.com/file/d/test-video-id/view",
        status: "draft",
      };

      const res = validateCreateClassroomContentInput(input);
      expect(res.contentType).toBe("video_external");
      expect(res.externalUrl).toBe("https://drive.google.com/file/d/test-video-id/view");
      expect(res.status).toBe("draft");
    });

    it("validates image content with file fields successfully", () => {
      const input = {
        classroomId: validUuid,
        contentType: "image",
        title: "نمودار مدار منطقی",
        fileUrl: "/v1/teacher/contents/files/circuit.png",
        fileName: "circuit.png",
        fileSizeBytes: 204800,
        mimeType: "image/png",
      };

      const res = validateCreateClassroomContentInput(input);
      expect(res.contentType).toBe("image");
      expect(res.fileName).toBe("circuit.png");
      expect(res.mimeType).toBe("image/png");
      expect(res.fileSizeBytes).toBe(204800);
    });

    it("rejects missing title", () => {
      const input = {
        classroomId: validUuid,
        contentType: "text",
        title: "   ",
        textContent: "some text",
      };

      expect(() => validateCreateClassroomContentInput(input)).toThrow(DomainError);
    });

    it("rejects invalid content type", () => {
      const input = {
        classroomId: validUuid,
        contentType: "invalid_type",
        title: "تست",
      };

      expect(() => validateCreateClassroomContentInput(input)).toThrow(DomainError);
    });

    it("rejects text content when textContent is missing", () => {
      const input = {
        classroomId: validUuid,
        contentType: "text",
        title: "عنوان",
        textContent: "",
      };

      expect(() => validateCreateClassroomContentInput(input)).toThrow(DomainError);
    });

    it("rejects video content when externalUrl is missing", () => {
      const input = {
        classroomId: validUuid,
        contentType: "video_external",
        title: "عنوان",
      };

      expect(() => validateCreateClassroomContentInput(input)).toThrow(DomainError);
    });

    it("accepts text content with exactly 25,000 characters", () => {
      const text25k = "a".repeat(25000);
      const input = {
        classroomId: validUuid,
        contentType: "text",
        title: "متن ۲۵ هزار کاراکتری",
        textContent: text25k,
      };

      const res = validateCreateClassroomContentInput(input);
      expect(res.textContent?.length).toBe(25000);
    });

    it("rejects text content with 25,001 characters with clear Persian error", () => {
      const text25001 = "a".repeat(25001);
      const input = {
        classroomId: validUuid,
        contentType: "text",
        title: "متن طولانی غیرمجاز",
        textContent: text25001,
      };

      expect(() => validateCreateClassroomContentInput(input)).toThrowError(
        /متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد/,
      );
    });
  });

  describe("validateUpdateClassroomContentInput", () => {
    it("validates partial update successfully", () => {
      const input = {
        title: "عنوان ویرایش شده",
        status: "archived",
      };

      const res = validateUpdateClassroomContentInput(input);
      expect(res.title).toBe("عنوان ویرایش شده");
      expect(res.status).toBe("archived");
    });

    it("accepts updated text content with exactly 25,000 characters", () => {
      const text25k = "b".repeat(25000);
      const input = {
        textContent: text25k,
      };

      const res = validateUpdateClassroomContentInput(input);
      expect(res.textContent?.length).toBe(25000);
    });

    it("rejects updated text content with 25,001 characters", () => {
      const text25001 = "b".repeat(25001);
      const input = {
        textContent: text25001,
      };

      expect(() => validateUpdateClassroomContentInput(input)).toThrowError(
        /متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد/,
      );
    });
  });

  describe("Authorization Policy for Classroom Content", () => {
    const defaultContext = {
      organizationId: "00000000-0000-0000-0000-000000000010" as any,
    };

    const teacherActor: Actor = {
      userId: asUserId("00000000-0000-0000-0000-000000000001"),
      role: "teacher",
    };

    const studentActor: Actor = {
      userId: asUserId("00000000-0000-0000-0000-000000000002"),
      role: "student",
    };

    it("allows teacher to create classroom content", () => {
      const canCreate = defaultPolicy.check("classroom_content:create", teacherActor, defaultContext);
      expect(canCreate).toBe(true);
    });

    it("allows teacher to publish classroom content", () => {
      const canPublish = defaultPolicy.check("classroom_content:publish", teacherActor, defaultContext);
      expect(canPublish).toBe(true);
    });

    it("allows teacher to delete classroom content", () => {
      const canDelete = defaultPolicy.check("classroom_content:delete", teacherActor, defaultContext);
      expect(canDelete).toBe(true);
    });

    it("allows student to read classroom content", () => {
      const canRead = defaultPolicy.check("classroom_content:read", studentActor, defaultContext);
      expect(canRead).toBe(true);
    });

    it("denies student from creating classroom content", () => {
      const canCreate = defaultPolicy.check("classroom_content:create", studentActor, defaultContext);
      expect(canCreate).toBe(false);
    });

    it("denies student from deleting classroom content", () => {
      const canDelete = defaultPolicy.check("classroom_content:delete", studentActor, defaultContext);
      expect(canDelete).toBe(false);
    });
  });
});
