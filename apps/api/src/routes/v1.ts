import type { FastifyPluginAsync } from "fastify";
import { healthRoutes } from "./health.js";
import { readinessRoutes } from "./readiness.js";
import { organizationRoutes } from "../modules/organizations/index.js";
import { courseRoutes } from "../modules/courses/index.js";
import { learningRoutes, contentRoutes } from "../modules/learning/index.js";
import type { OrganizationStore } from "../modules/organizations/organization-store.js";
import type { CourseStore } from "../modules/courses/course-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
} from "../modules/learning/learning-store.js";
import type { SessionStore } from "../modules/identity/session-store.js";
import type { UserStore } from "../modules/identity/user-store.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
} from "../modules/identity/index.js";
import type { AuditService } from "../observability/audit-service.js";

export interface V1RouteOptions {
  config: IdentityPluginOptions["config"];
  sessionStore: SessionStore;
  userStore: UserStore;
  organizationStore: OrganizationStore;
  courseStore?: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  progressStore?: ProgressStore;
  auditService?: AuditService;
}

export const v1Routes: FastifyPluginAsync<Partial<V1RouteOptions>> = async (
  app,
  opts,
) => {
  void app.register(healthRoutes);
  void app.register(readinessRoutes);

  // Register identity (auth) module if stores are provided
  if (opts.config && opts.sessionStore && opts.userStore) {
    await registerIdentityModule(app, {
      config: opts.config,
      sessionStore: opts.sessionStore,
      userStore: opts.userStore,
    });
  }

  // Register organization routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore
  ) {
    await app.register(organizationRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      organizationStore: opts.organizationStore,
      auditService: opts.auditService,
    });
  }

  // Register course routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.courseStore
  ) {
    await app.register(courseRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      organizationStore: opts.organizationStore,
      courseStore: opts.courseStore,
      auditService: opts.auditService,
    });
  }

  // Register content (authoring) routes if all required stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.courseStore &&
    opts.moduleStore &&
    opts.lessonStore
  ) {
    await app.register(contentRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      courseStore: opts.courseStore,
      organizationStore: opts.organizationStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      auditService: opts.auditService,
    });
  }

  // Register learning routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.courseStore &&
    opts.moduleStore &&
    opts.lessonStore &&
    opts.progressStore
  ) {
    await app.register(learningRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      courseStore: opts.courseStore,
      organizationStore: opts.organizationStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      progressStore: opts.progressStore,
      auditService: opts.auditService,
    });
  }
};
