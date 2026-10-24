import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CourseCard, MyCourseCardAdapter, CourseLibraryCardAdapter } from "../components/avana/CourseCard.js";
import { isUserSubscriptionActive } from "../components/commerce/userCommerceUtils.js";

describe("Course Access & Purchase Logic (Web Components)", () => {
  describe("isUserSubscriptionActive utility helper", () => {
    it("returns true for active subscription with future expiration", () => {
      const activeSub = {
        status: "active",
        expires_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      };
      expect(isUserSubscriptionActive(activeSub, [])).toBe(true);
    });

    it("returns true for active_pending_payment_review status with future expiration", () => {
      const pendingReviewSub = {
        status: "active_pending_payment_review",
        expires_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      };
      expect(isUserSubscriptionActive(pendingReviewSub, [])).toBe(true);
    });

    it("returns false for expired subscription", () => {
      const expiredSub = {
        status: "active",
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      };
      expect(isUserSubscriptionActive(expiredSub, [])).toBe(false);
    });

    it("returns true for subscription granted via entitlements", () => {
      const entitlements = [
        {
          resource_type: "subscription",
          expires_at: new Date(Date.now() + 86400000 * 5).toISOString(),
        },
      ];
      expect(isUserSubscriptionActive(null, entitlements)).toBe(true);
    });

    it("returns false when user has no subscription or entitlement", () => {
      expect(isUserSubscriptionActive(null, [])).toBe(false);
    });
  });

  describe("State 1: Active Subscription User", () => {
    it("does NOT display 'خرید دوره' button and shows subscription badge and 'شروع یادگیری' CTA", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            subject="پزشکی"
            variant="library"
            access={{
              hasAccess: true,
              isSubscription: true,
              isPurchased: false,
              isFree: false,
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      // Must show subscription badge
      expect(screen.getByText("در دسترس با اشتراک شما")).toBeDefined();

      // Must NOT display buy button
      expect(screen.queryByText("خرید دوره")).toBeNull(); expect(screen.queryByTestId(`buy-course-btn-course-1`)).toBeNull();

      // Must show CTA to start learning
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });

    it("shows 'ادامه یادگیری' CTA when progress is in progress", () => {
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="library"
            access={{
              hasAccess: true,
              isSubscription: true,
              price: 150000,
            }}
            progress={{
              percentage: 45,
              completedLessons: 5,
              totalLessons: 11,
            }}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("ادامه یادگیری")).toBeDefined();
      expect(screen.queryByText("خرید دوره")).toBeNull(); expect(screen.queryByTestId(`buy-course-btn-course-1`)).toBeNull();
    });

    it("in variant='my-courses' with active subscription: hides buy button and shows 'شروع یادگیری'", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="my-courses"
            access={{
              hasAccess: true,
              isSubscription: true,
              isPurchased: false,
              isFree: false,
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByText("خرید دوره")).toBeNull();
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });
  });

  describe("State 2: Directly Purchased Course (Lifetime)", () => {
    it("does NOT display 'خرید دوره' button, shows 'خریداری شده' badge, and provides learning CTA", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="library"
            access={{
              hasAccess: true,
              isPurchased: true,
              isSubscription: false,
              isFree: false,
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      // Must show purchased badge
      expect(screen.getByText("خریداری شده")).toBeDefined();

      // Must NOT show buy button
      expect(screen.queryByText("خرید دوره")).toBeNull(); expect(screen.queryByTestId(`buy-course-btn-course-1`)).toBeNull();
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });

    it("in variant='my-courses': preserves access with 'ادامه یادگیری' and NO buy button", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="my-courses"
            access={{
              hasAccess: true,
              isPurchased: true,
              isSubscription: false,
              price: 150000,
            }}
            progress={{
              percentage: 60,
              completedLessons: 6,
              totalLessons: 10,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByText("خرید دوره")).toBeNull();
      expect(screen.getByText("ادامه یادگیری")).toBeDefined();
    });
  });

  describe("State 3: Unsubscribed & Unpurchased Paid Course", () => {
    it("displays 'خرید دوره' button with price in library variant", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="library"
            access={{
              hasAccess: false,
              isPurchased: false,
              isSubscription: false,
              isFree: false,
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      const buyBtn = screen.getByTestId("buy-course-btn-course-1");
      expect(buyBtn).toBeDefined();
      expect(screen.getByText("مشاهده دوره")).toBeDefined();
    });

    it("displays 'خرید دوره' and 'پیش‌نمایش' link in my-courses variant", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="my-courses"
            access={{
              hasAccess: false,
              isPurchased: false,
              isSubscription: false,
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("خرید دوره")).toBeDefined();
      expect(screen.getByText("پیش‌نمایش")).toBeDefined();
    });
  });

  describe("State 4: Free Course", () => {
    it("displays 'رایگان' badge, NO buy button, and 'شروع یادگیری' CTA", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-free"
            title="آشنایی با اصول یادگیری"
            variant="library"
            access={{
              hasAccess: true,
              isFree: true,
              price: 0,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("رایگان")).toBeDefined();
      expect(screen.queryByText("خرید دوره")).toBeNull(); expect(screen.queryByTestId(`buy-course-btn-course-1`)).toBeNull();
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });
  });

  describe("State 5: Expired Subscription", () => {
    it("if course was NOT directly bought: displays buy option", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="my-courses"
            access={{
              hasAccess: false,
              isSubscription: false,
              isPurchased: false,
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("خرید دوره")).toBeDefined();
      expect(screen.getByText("پیش‌نمایش")).toBeDefined();
    });

    it("if course was independently bought: keeps full learning access and NEVER shows buy button", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-1"
            title="بیوشیمی پزشکی"
            variant="my-courses"
            access={{
              hasAccess: true,
              isSubscription: false, // subscription expired!
              isPurchased: true,     // but bought independently
              price: 150000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByText("خرید دوره")).toBeNull();
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });
  });

  describe("MyCourseCardAdapter Integration", () => {
    it("correctly hides buy button when user has active subscription", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <MyCourseCardAdapter
            course={{
              id: "c-100",
              title: "جراحی عمومی",
              subject: "پزشکی",
              organization_id: "org-1",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }}
            isPurchased={false}
            hasSubscription={true}
            price={200000}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByText("خرید دوره")).toBeNull();
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });
  });

  describe("CourseLibraryCardAdapter Integration", () => {
    it("guards onBuy and does not pass onBuy when access.hasAccess is true", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseLibraryCardAdapter
            course={{
              id: "c-100",
              title: "جراحی عمومی",
              description: "توضیحات دوره",
              subject: "پزشکی",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              access: {
                hasAccess: true,
                isFree: false,
                isPurchased: false,
                accessSource: "subscription",
              },
              purchase: {
                canPurchase: false,
                price: 200000,
                currency: "toman",
                productId: "prod-100",
              },
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByText("خرید دوره")).toBeNull(); expect(screen.queryByTestId(`buy-course-btn-course-1`)).toBeNull();
      expect(screen.getByText("شروع یادگیری")).toBeDefined();
    });
  });

  describe("Subscription-Excluded Courses in My Courses List", () => {
    it("renders 'خرید دوره' button for excluded course even when user has active subscription", () => {
      const onBuy = vi.fn();
      render(
        <MemoryRouter>
          <CourseCard
            id="course-excluded"
            title="کارگاه جراحی پیشرفته"
            variant="my-courses"
            access={{
              hasAccess: false,
              isSubscription: false,
              isPurchased: false,
              price: 500000,
            }}
            onBuy={onBuy}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("خرید دوره")).toBeDefined();
      expect(screen.getByText("پیش‌نمایش")).toBeDefined();
    });
  });

  describe("My Courses variant — Badge & Icon UI Redesign", () => {
    it("does NOT render 'در حال یادگیری' badge or GraduationCap in my-courses variant when in progress", () => {
      const { container } = render(
        <MemoryRouter>
          <CourseCard
            id="course-in-progress"
            title="فارماکولوژی بالینی"
            variant="my-courses"
            access={{ hasAccess: true, isPurchased: true }}
            progress={{
              percentage: 50,
              completedLessons: 5,
              totalLessons: 10,
            }}
          />
        </MemoryRouter>,
      );

      // 'در حال یادگیری' badge must NOT exist
      expect(screen.queryByText("در حال یادگیری")).toBeNull();

      // GraduationCap icon must NOT exist
      expect(container.querySelector("svg.lucide-graduation-cap")).toBeNull();

      // Learning progress and CTA must still be present
      expect(screen.getByText("۵۰٪")).toBeDefined();
      expect(screen.getByText("ادامه یادگیری")).toBeDefined();
    });

    it("renders 'در حال یادگیری' badge and GraduationCap in library variant when in progress without cover", () => {
      const { container } = render(
        <MemoryRouter>
          <CourseCard
            id="course-lib-in-progress"
            title="فارماکولوژی بالینی"
            variant="library"
            access={{ hasAccess: true, isPurchased: true }}
            progress={{
              percentage: 50,
              completedLessons: 5,
              totalLessons: 10,
            }}
          />
        </MemoryRouter>,
      );

      // 'در حال یادگیری' badge MUST exist in library variant
      expect(screen.getByText("در حال یادگیری")).toBeDefined();

      // GraduationCap icon MUST exist in library variant when no cover image
      expect(container.querySelector("svg.lucide-graduation-cap")).not.toBeNull();
    });

    it("renders subject badge cleanly without GraduationCap in my-courses variant", () => {
      const { container } = render(
        <MemoryRouter>
          <CourseCard
            id="course-subject"
            title="فیزیولوژی اعصاب"
            subject="علوم اعصاب"
            variant="my-courses"
            access={{ hasAccess: true }}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("علوم اعصاب")).toBeDefined();
      expect(container.querySelector("svg.lucide-graduation-cap")).toBeNull();
    });

    it("preserves 'تکمیل شده' badge when course is 100% completed in my-courses variant", () => {
      render(
        <MemoryRouter>
          <CourseCard
            id="course-completed"
            title="ایمونولوژی پزشکی"
            variant="my-courses"
            access={{ hasAccess: true }}
            progress={{
              percentage: 100,
              completedLessons: 10,
              totalLessons: 10,
            }}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("تکمیل شده")).toBeDefined();
      expect(screen.queryByText("در حال یادگیری")).toBeNull();
      expect(screen.getByText("ورود به دوره")).toBeDefined();
    });

    it("does not render GraduationCap or 'در حال یادگیری' badge via MyCourseCardAdapter", () => {
      const { container } = render(
        <MemoryRouter>
          <MyCourseCardAdapter
            course={{
              id: "c-adapter",
              title: "جنین‌شناسی پزشکی",
              subject: "پزشکی",
              organization_id: "org-1",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }}
            progress={{
              percentage: 35,
              completed_lessons: 3,
              total_lessons: 10,
            }}
            isPurchased={true}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByText("در حال یادگیری")).toBeNull();
      expect(container.querySelector("svg.lucide-graduation-cap")).toBeNull();
      expect(screen.getByText("پزشکی")).toBeDefined();
      expect(screen.getByText("۳۵٪")).toBeDefined();
    });
  });
});
