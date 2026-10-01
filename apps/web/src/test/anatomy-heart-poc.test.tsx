import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeartAnatomyDiagram, HEART_STRUCTURES } from "../components/anatomy/HeartAnatomyDiagram.js";
import { BloodFlowVisualizer, BLOOD_FLOW_STEPS } from "../components/anatomy/BloodFlowVisualizer.js";
import { AnatomyQuizCard } from "../components/anatomy/AnatomyQuizCard.js";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import {
  ANATOMY_HEART_MARKDOWN,
  ANATOMY_HEART_COURSE_ID,
  ANATOMY_HEART_FIXTURE,
} from "../fixtures/anatomyLessonFixture.js";

// Helper regex to verify zero emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

describe("Anatomy & Visual Content POC Test Suite", () => {
  describe("1. HeartAnatomyDiagram Component", () => {
    it("renders the diagram header, caption, and academic disclaimer without emojis", () => {
      const { container } = render(<HeartAnatomyDiagram />);

      expect(screen.getByText("مقطع تاجی قدامی قلب (Coronal Section)")).toBeInTheDocument();
      expect(
        screen.getByText(/شکل ۱-۱: مقطع تاجی قدامی قلب انسان/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/نگاره تشریحی آموزشی \/ Academic Anatomical Plate/),
      ).toBeInTheDocument();

      // Check strictly no emojis in the rendered text
      expect(container.textContent).not.toMatch(EMOJI_REGEX);
    });

    it("contains all 11 required anatomical structures in data and rendered labels", () => {
      render(<HeartAnatomyDiagram />);

      const requiredPersianNames = [
        "دهلیز راست",
        "بطن راست",
        "دهلیز چپ",
        "بطن چپ",
        "دریچه تریکوسپید",
        "دریچه میترال",
        "آئورت",
        "شریان ریوی",
        "ورید اجوف فوقانی",
        "ورید اجوف تحتانی",
        "وریدهای ریوی",
      ];

      expect(HEART_STRUCTURES).toHaveLength(11);

      requiredPersianNames.forEach((name) => {
        const found = HEART_STRUCTURES.some((s) => s.persianName === name);
        expect(found, `Expected structure ${name} in HEART_STRUCTURES`).toBe(true);

        const labelElements = screen.getAllByText(name);
        expect(labelElements.length).toBeGreaterThan(0);
      });
    });

    it("highlights a structure and displays its role when clicked or tapped", () => {
      const onSelect = vi.fn();
      render(<HeartAnatomyDiagram onStructureSelect={onSelect} />);

      // Find the Left Ventricle label
      const lvLabel = screen.getAllByText("بطن چپ")[0];
      fireEvent.click(lvLabel);

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "left-ventricle",
          persianName: "بطن چپ",
        }),
      );

      // Check that Left Ventricle physiological role is displayed in the bottom details strip
      expect(
        screen.getByText(/پمپاژ پرفشار خون اکسیژن‌دار به درون آئورت/),
      ).toBeInTheDocument();
    });

    it("provides accessible zoom in, zoom out, and reset controls", () => {
      render(<HeartAnatomyDiagram />);

      const zoomInBtn = screen.getByTitle("بزرگ‌نمایی");
      const zoomOutBtn = screen.getByTitle("کوچک‌نمایی");

      expect(screen.getByText("100%")).toBeInTheDocument();

      fireEvent.click(zoomInBtn);
      expect(screen.getByText("115%")).toBeInTheDocument();

      fireEvent.click(zoomOutBtn);
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });

  describe("2. BloodFlowVisualizer Component", () => {
    it("renders the title and all 12 physiological sequence steps", () => {
      const { container } = render(<BloodFlowVisualizer />);

      expect(screen.getByText("مسیر پیوسته جریان خون در قلب")).toBeInTheDocument();

      const expectedSteps = [
        "وریدهای اجوف",
        "دهلیز راست",
        "دریچه تریکوسپید",
        "بطن راست",
        "شریان ریوی",
        "ریه‌ها",
        "وریدهای ریوی",
        "دهلیز چپ",
        "دریچه میترال",
        "بطن چپ",
        "آئورت",
        "گردش سیستمیک",
      ];

      expect(BLOOD_FLOW_STEPS).toHaveLength(12);

      expectedSteps.forEach((stepName) => {
        expect(screen.getAllByText(new RegExp(stepName)).length).toBeGreaterThan(0);
      });

      // No emojis in visualizer
      expect(container.textContent).not.toMatch(EMOJI_REGEX);
    });

    it("displays the correct oxygenation phase legends and updates description on step click", () => {
      render(<BloodFlowVisualizer />);

      expect(screen.getByText("خون کم‌اکسیژن")).toBeInTheDocument();
      expect(screen.getByText("تبادل در ریه‌ها")).toBeInTheDocument();
      expect(screen.getByText("خون اکسیژن‌دار")).toBeInTheDocument();

      // Click on Aorta step
      const aortaBtn = screen.getByRole("button", { name: /آئورت/ });
      fireEvent.click(aortaBtn);

      expect(
        screen.getByText(/توزیع خون شریانی از طریق قوس آئورت و شاخه‌های اصلی/),
      ).toBeInTheDocument();
    });
  });

  describe("3. AnatomyQuizCard Component", () => {
    it("renders the question title and 4 single-choice options", () => {
      const { container } = render(<AnatomyQuizCard />);

      expect(
        screen.getByText("کدام ساختار خون را وارد گردش سیستمیک می‌کند؟"),
      ).toBeInTheDocument();

      expect(screen.getByText("بطن راست")).toBeInTheDocument();
      expect(screen.getByText("دهلیز راست")).toBeInTheDocument();
      expect(screen.getByText("بطن چپ")).toBeInTheDocument();
      expect(screen.getByText("شریان ریوی")).toBeInTheDocument();

      expect(container.textContent).not.toMatch(EMOJI_REGEX);
    });

    it("validates correct answer (بطن چپ) and shows explanation", () => {
      render(<AnatomyQuizCard />);

      const lvChoice = screen.getByRole("button", { name: /بطن چپ/ });
      fireEvent.click(lvChoice);

      expect(screen.getByText("پاسخ صحیح")).toBeInTheDocument();
      expect(
        screen.getByText(/بطن چپ خون اکسیژن‌دار را از طریق آئورت وارد گردش سیستمیک می‌کند/),
      ).toBeInTheDocument();
    });

    it("marks incorrect answer and reveals explanation with reset option", () => {
      render(<AnatomyQuizCard />);

      const rvChoice = screen.getByRole("button", { name: /بطن راست/ });
      fireEvent.click(rvChoice);

      expect(screen.getByText("پاسخ نادرست")).toBeInTheDocument();
      expect(
        screen.getByText(/بطن چپ خون اکسیژن‌دار را از طریق آئورت وارد گردش سیستمیک می‌کند/),
      ).toBeInTheDocument();

      // Try re-taking
      const retryBtn = screen.getByRole("button", { name: /پاسخ مجدد/ });
      fireEvent.click(retryBtn);

      expect(screen.queryByText("پاسخ نادرست")).not.toBeInTheDocument();
    });
  });

  describe("4. Lesson Fixture & Markdown Integration", () => {
    it("conforms to CourseLearnResponse structure for anatomy-heart", () => {
      expect(ANATOMY_HEART_FIXTURE.course.id).toBe(ANATOMY_HEART_COURSE_ID);
      expect(ANATOMY_HEART_FIXTURE.modules[0].lessons[0].title).toBe(
        "آناتومی قلب — ساختمان و مسیر جریان خون",
      );
      expect(ANATOMY_HEART_FIXTURE.modules[0].lessons[0].estimated_minutes).toBe(15);
    });

    it("renders the educational callout 'برای فهم بهتر' natively via MarkdownRenderer", async () => {
      render(<MarkdownRenderer content={ANATOMY_HEART_MARKDOWN} enableLessonCallouts />);

      expect(
        await screen.findByText("برای فهم بهتر"),
      ).toBeInTheDocument();

      expect(
        await screen.findByText(
          /سمت راست قلب عمدتاً با گردش ریوی و سمت چپ قلب با گردش سیستمیک ارتباط دارد/,
        ),
      ).toBeInTheDocument();
    });

    it("does not render any quiz or evaluation section inside lesson content", () => {
      expect(ANATOMY_HEART_MARKDOWN).not.toContain("anatomy-quiz");
      expect(ANATOMY_HEART_MARKDOWN).not.toContain("ارزیابی و تثبیت یادگیری");
    });
  });
});
