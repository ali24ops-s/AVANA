/**
 * SpecialExamAutomationService
 *
 * Automates lifecycle creation and reconciliation of Special Exam products:
 * 1. For every Course: exactly one Special Exam Product (80 questions, 40,000 Tomans).
 * 2. For every Chapter (Module): exactly one Special Exam Product (25 questions, 12,500 Tomans).
 *
 * Idempotency & Lifecycle Rules:
 * - Products are pure blueprints / templates (zero static question IDs stored).
 * - Activation is gated strictly by candidate pool capacity using the unified
 *   StudyService.resolveCandidateQuestionsForPool abstraction.
 * - If available candidate questions >= required threshold: active = true, poolStatus = 'sufficient'.
 * - If available candidate questions < required threshold: active = false, poolStatus = 'insufficient'.
 * - Re-running reconciliation never duplicates products (keyed by stable deterministic product code).
 * - When questions are added later, re-running reconciliation promotes products from inactive to active seamlessly.
 */

import { randomUUID } from "node:crypto";
import {
  type CourseId,
  type DocumentId,
  type ModuleId,
  type OrganizationId,
  type ProductRecord,
  type SpecialExamScope,
  type ExamBlueprintItem,
  asProductId,
  calculateSpecialExamPrice,
} from "@avana/domain";
import type { CommerceStore } from "../commerce/commerce-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { ModuleStore } from "../learning/learning-store.js";
import type { StudyService } from "./study-service.js";

export const COURSE_SPECIAL_EXAM_QUESTION_COUNT = 80;
export const CHAPTER_SPECIAL_EXAM_QUESTION_COUNT = 25;

export function getCourseSpecialExamCode(courseId: CourseId): string {
  return `special-exam-course-${courseId}-80`;
}

export function getChapterSpecialExamCode(moduleId: ModuleId): string {
  return `special-exam-chapter-${moduleId}-25`;
}

export interface SpecialExamAutomationOptions {
  commerceStore: CommerceStore;
  studyService: StudyService;
  courseStore: CourseStore;
  moduleStore: ModuleStore;
  systemOrganizationId?: OrganizationId;
}

export class SpecialExamAutomationService {
  private readonly commerceStore: CommerceStore;
  private readonly studyService: StudyService;
  private readonly courseStore: CourseStore;
  private readonly moduleStore: ModuleStore;
  private readonly systemOrganizationId?: OrganizationId;

  constructor(options: SpecialExamAutomationOptions) {
    this.commerceStore = options.commerceStore;
    this.studyService = options.studyService;
    this.courseStore = options.courseStore;
    this.moduleStore = options.moduleStore;
    this.systemOrganizationId = options.systemOrganizationId;
  }

  /**
   * Reconcile or create the Chapter Special Exam Product (25 questions, 12,500 Tomans).
   */
  async reconcileChapterExam(params: {
    organizationId: OrganizationId;
    courseId?: CourseId;
    moduleId: ModuleId;
  }): Promise<ProductRecord | null> {
    const { organizationId, moduleId } = params;
    const moduleRecord = await this.moduleStore.findById(moduleId);
    if (!moduleRecord || moduleRecord.deletedAt) {
      return null;
    }

    const courseId = params.courseId ?? moduleRecord.courseId;
    const requiredCount = CHAPTER_SPECIAL_EXAM_QUESTION_COUNT;
    const price = calculateSpecialExamPrice(requiredCount); // 12,500
    const code = getChapterSpecialExamCode(moduleId);

    // Evaluate pool sufficiency using shared candidate selection abstraction
    const candidates = await this.studyService.resolveCandidateQuestionsForPool(
      organizationId,
      {
        courseId,
        moduleId,
      },
    );

    const availableCount = candidates.length;
    const isSufficient = availableCount >= requiredCount;

    const title = `آزمون فصل: ${moduleRecord.title}`;
    const description = `آزمون شبیه‌ساز و تخصصی ۲۵ سؤالی از مباحث فصل ${moduleRecord.title}`;
    const scope: SpecialExamScope = {
      courseId,
      moduleId,
      topics: [moduleRecord.title],
    };
    const blueprint: ExamBlueprintItem[] = [
      {
        name: moduleRecord.title,
        courseId,
        moduleId,
        count: requiredCount,
      },
    ];

    const now = new Date().toISOString();
    const existing = await this.commerceStore.findProductByCode(code);

    if (existing) {
      const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
      const updated = await this.commerceStore.updateProduct(existing.id, {
        title: existing.title || title,
        description: existing.description || description,
        price,
        active: isSufficient,
        metadata: {
          ...existingMeta,
          questionCount: requiredCount,
          difficulty: existingMeta.difficulty || "medium",
          scope,
          blueprint,
          publicationStatus: isSufficient ? "published" : "draft",
          poolStatus: isSufficient ? "sufficient" : "insufficient",
          targetType: "module",
          targetId: moduleId,
          availableQuestions: availableCount,
          autoGenerated: true,
          lastReconciledAt: now,
        },
      });
      return updated ?? existing;
    }

    const newProduct: ProductRecord = {
      id: asProductId(randomUUID()),
      code,
      type: "special_exam",
      title,
      description,
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: isSufficient,
      metadata: {
        questionCount: requiredCount,
        difficulty: "medium",
        scope,
        blueprint,
        publicationStatus: isSufficient ? "published" : "draft",
        poolStatus: isSufficient ? "sufficient" : "insufficient",
        targetType: "module",
        targetId: moduleId,
        availableQuestions: availableCount,
        autoGenerated: true,
        lastReconciledAt: now,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    try {
      return await this.commerceStore.createProduct(newProduct);
    } catch (err) {
      const raceExisting = await this.commerceStore.findProductByCode(code);
      if (raceExisting) {
        const raceMeta = (raceExisting.metadata || {}) as Record<string, unknown>;
        const updated = await this.commerceStore.updateProduct(raceExisting.id, {
          title: raceExisting.title || title,
          description: raceExisting.description || description,
          price,
          active: isSufficient,
          metadata: {
            ...raceMeta,
            questionCount: requiredCount,
            difficulty: raceMeta.difficulty || "medium",
            scope,
            blueprint,
            publicationStatus: isSufficient ? "published" : "draft",
            poolStatus: isSufficient ? "sufficient" : "insufficient",
            targetType: "module",
            targetId: moduleId,
            availableQuestions: availableCount,
            autoGenerated: true,
            lastReconciledAt: now,
          },
        });
        return updated ?? raceExisting;
      }
      throw err;
    }
  }

  /**
   * Reconcile or create the Course Special Exam Product (80 questions, 40,000 Tomans).
   */
  async reconcileCourseExam(params: {
    organizationId: OrganizationId;
    courseId: CourseId;
  }): Promise<ProductRecord | null> {
    const { organizationId, courseId } = params;
    const courseRecord = await this.courseStore.findById(courseId);
    if (!courseRecord || courseRecord.deletedAt) {
      return null;
    }

    const requiredCount = COURSE_SPECIAL_EXAM_QUESTION_COUNT;
    const price = calculateSpecialExamPrice(requiredCount); // 40,000
    const code = getCourseSpecialExamCode(courseId);

    // Evaluate pool sufficiency across the course using shared candidate selection abstraction
    const candidates = await this.studyService.resolveCandidateQuestionsForPool(
      organizationId,
      {
        courseId,
      },
    );

    const availableCount = candidates.length;
    const isSufficient = availableCount >= requiredCount;

    const title = `آزمون جامع: ${courseRecord.name}`;
    const description = `آزمون جامع شبیه‌ساز ۸۰ سؤالی از کلیه مباحث دوره ${courseRecord.name}`;
    const scope: SpecialExamScope = {
      courseId,
      topics: [courseRecord.name],
    };
    const blueprint: ExamBlueprintItem[] = [
      {
        name: courseRecord.name,
        courseId,
        count: requiredCount,
      },
    ];

    const now = new Date().toISOString();
    const existing = await this.commerceStore.findProductByCode(code);

    if (existing) {
      const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
      const updated = await this.commerceStore.updateProduct(existing.id, {
        title: existing.title || title,
        description: existing.description || description,
        price,
        active: isSufficient,
        metadata: {
          ...existingMeta,
          questionCount: requiredCount,
          difficulty: existingMeta.difficulty || "medium",
          scope,
          blueprint,
          publicationStatus: isSufficient ? "published" : "draft",
          poolStatus: isSufficient ? "sufficient" : "insufficient",
          targetType: "course",
          targetId: courseId,
          availableQuestions: availableCount,
          autoGenerated: true,
          lastReconciledAt: now,
        },
      });
      return updated ?? existing;
    }

    const newProduct: ProductRecord = {
      id: asProductId(randomUUID()),
      code,
      type: "special_exam",
      title,
      description,
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: isSufficient,
      metadata: {
        questionCount: requiredCount,
        difficulty: "medium",
        scope,
        blueprint,
        publicationStatus: isSufficient ? "published" : "draft",
        poolStatus: isSufficient ? "sufficient" : "insufficient",
        targetType: "course",
        targetId: courseId,
        availableQuestions: availableCount,
        autoGenerated: true,
        lastReconciledAt: now,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    try {
      return await this.commerceStore.createProduct(newProduct);
    } catch (err) {
      const raceExisting = await this.commerceStore.findProductByCode(code);
      if (raceExisting) {
        const raceMeta = (raceExisting.metadata || {}) as Record<string, unknown>;
        const updated = await this.commerceStore.updateProduct(raceExisting.id, {
          title: raceExisting.title || title,
          description: raceExisting.description || description,
          price,
          active: isSufficient,
          metadata: {
            ...raceMeta,
            questionCount: requiredCount,
            difficulty: raceMeta.difficulty || "medium",
            scope,
            blueprint,
            publicationStatus: isSufficient ? "published" : "draft",
            poolStatus: isSufficient ? "sufficient" : "insufficient",
            targetType: "course",
            targetId: courseId,
            availableQuestions: availableCount,
            autoGenerated: true,
            lastReconciledAt: now,
          },
        });
        return updated ?? raceExisting;
      }
      throw err;
    }
  }

  /**
   * Reconcile both Course Exam and all Chapter Exams for a specific course.
   */
  async reconcileCourseAndModules(params: {
    organizationId: OrganizationId;
    courseId: CourseId;
  }): Promise<{ courseExam: ProductRecord | null; chapterExams: ProductRecord[] }> {
    const { organizationId, courseId } = params;
    const courseExam = await this.reconcileCourseExam({ organizationId, courseId });

    const modules = await this.moduleStore.listByCourse(courseId);
    const chapterExams: ProductRecord[] = [];

    for (const mod of modules) {
      if (mod.deletedAt) continue;
      const chapterProduct = await this.reconcileChapterExam({
        organizationId,
        courseId,
        moduleId: mod.id,
      });
      if (chapterProduct) {
        chapterExams.push(chapterProduct);
      }
    }

    return { courseExam, chapterExams };
  }

  /**
   * Reconcile exams associated with a specific document (e.g. after quiz materialization or bulk accept).
   */
  async reconcileForDocument(params: {
    organizationId: OrganizationId;
    documentId: DocumentId;
    courseId?: CourseId;
  }): Promise<{ chapterExam: ProductRecord | null; courseExam: ProductRecord | null }> {
    const { organizationId, documentId } = params;
    const moduleRecord = await this.moduleStore.findByDocument(documentId);

    let chapterExam: ProductRecord | null = null;
    let courseExam: ProductRecord | null = null;

    if (moduleRecord && !moduleRecord.deletedAt) {
      chapterExam = await this.reconcileChapterExam({
        organizationId,
        courseId: moduleRecord.courseId,
        moduleId: moduleRecord.id,
      });
      courseExam = await this.reconcileCourseExam({
        organizationId,
        courseId: moduleRecord.courseId,
      });
    } else if (params.courseId) {
      courseExam = await this.reconcileCourseExam({
        organizationId,
        courseId: params.courseId,
      });
    }

    return { chapterExam, courseExam };
  }

  /**
   * Reconcile all courses and chapters across the organization.
   */
  async reconcileAll(organizationId: OrganizationId): Promise<{
    reconciledCourses: number;
    reconciledModules: number;
    activeCourseExams: number;
    activeChapterExams: number;
  }> {
    // List all courses for this organization
    const courses = await this.courseStore.listByOrganization(
      organizationId,
      "system" as any,
      this.systemOrganizationId,
    );

    let reconciledCourses = 0;
    let reconciledModules = 0;
    let activeCourseExams = 0;
    let activeChapterExams = 0;

    for (const course of courses) {
      if (course.deletedAt) continue;
      const { courseExam, chapterExams } = await this.reconcileCourseAndModules({
        organizationId,
        courseId: course.id,
      });

      if (courseExam) {
        reconciledCourses++;
        if (courseExam.active) activeCourseExams++;
      }

      for (const ch of chapterExams) {
        reconciledModules++;
        if (ch.active) activeChapterExams++;
      }
    }

    return {
      reconciledCourses,
      reconciledModules,
      activeCourseExams,
      activeChapterExams,
    };
  }
}
