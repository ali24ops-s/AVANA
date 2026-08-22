/**
 * Admin Service.
 *
 * Handles admin-specific business logic, relying on the AdminStore.
 */

import type { AdminStore, DashboardStats, AdminUsersList, AdminGenerationJobRecord, DataIntegrityReport } from "./admin-store.js";
import { DomainError } from "@avana/domain";

export class AdminService {
  constructor(private readonly store: AdminStore) {}

  async getDashboardStats(): Promise<DashboardStats> {
    return this.store.getDashboardStats();
  }

  async listUsers(page: number, pageSize: number, search?: string): Promise<AdminUsersList> {
    if (page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (pageSize < 1 || pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    
    return this.store.listUsers({ page, pageSize, search });
  }

  async listGenerationJobs(page: number, pageSize: number, status?: string): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    if (page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (pageSize < 1 || pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    
    return this.store.listGenerationJobs({ page, pageSize, status });
  }

  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    return this.store.getDataIntegrityReport();
  }
}
