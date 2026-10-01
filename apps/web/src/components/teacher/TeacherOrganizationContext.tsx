/**
 * TeacherOrganizationContext.
 *
 * Scoped organization context strictly for the AVANA Teacher Platform (/teacher).
 *
 * Architecture & Rules:
 *  1. Normal teachers & org admins (teacher / organization_admin):
 *     - Resolved strictly from their active membership.
 *     - No switcher UI or organization mutation is exposed.
 *     - Zero extra API overhead, regression-free.
 *
 *  2. Platform Admin (platform_admin):
 *     - Does not require an implicit organization membership.
 *     - Fetches organizations via existing orgApi.listOrganizations().
 *     - 0 organizations: hasNoOrganizations=true, selectedOrgId=null, no query fired.
 *     - 1 organization: deterministic auto-selection.
 *     - >1 organizations: explicit selection required via TeacherOrgSwitcher.
 *       Persisted in sessionStorage ("avana_teacher_selected_org_id").
 *       Strict validation: if persisted ID is no longer in available organizations,
 *       it is immediately cleared and re-selection is required.
 *     - Never falls back to memberships[0].
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createOrganizationApi } from "../../lib/api/organizations.js";

export const TEACHER_SELECTED_ORG_STORAGE_KEY = "avana_teacher_selected_org_id";

export interface TeacherOrgOption {
  id: string;
  name: string;
}

export interface TeacherOrganizationContextValue {
  /** Currently active organization ID (or null if none/unselected). */
  selectedOrgId: string | null;
  /** Active organization details if selected. */
  selectedOrg: TeacherOrgOption | null;
  /** All available organizations for selection. */
  availableOrgs: TeacherOrgOption[];
  /** Loading state of organization fetching (for platform_admin). */
  isLoadingOrgs: boolean;
  /** Error message if organization fetch failed. */
  orgsError: string | null;
  /** True when >1 organizations exist but user has not explicitly chosen one. */
  needsOrgSelection: boolean;
  /** True when 0 organizations exist in the system for platform_admin. */
  hasNoOrganizations: boolean;
  /** True if current user is platform_admin. */
  isPlatformAdmin: boolean;
  /** Set or switch active organization. Persists to sessionStorage. */
  setSelectedOrgId: (orgId: string) => void;
}

const TeacherOrganizationContext = createContext<TeacherOrganizationContextValue | null>(null);

function getOrgApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createOrganizationApi(client);
}

export function TeacherOrganizationProvider({ children }: { children: ReactNode }) {
  const { user, memberships } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin";

  // Standard teacher / organization_admin resolution from memberships
  const teacherMembership = useMemo(() => {
    if (!memberships || !Array.isArray(memberships)) return undefined;
    return memberships.find(
      (m) => m.role === "teacher" || m.role === "organization_admin",
    );
  }, [memberships]);

  const normalOrgId = teacherMembership?.organization_id || memberships?.[0]?.organization_id || null;

  // Platform Admin: fetch available organizations via existing API
  const orgListQuery = useQuery({
    queryKey: ["organizations", "teacher-platform"],
    queryFn: () => getOrgApi().listOrganizations(),
    enabled: isPlatformAdmin,
    staleTime: 60_000,
  });

  const availableOrgs = useMemo<TeacherOrgOption[]>(() => {
    if (!isPlatformAdmin) {
      if (normalOrgId) {
        return [{ id: normalOrgId, name: "سازمان آموزشی" }];
      }
      return [];
    }
    return (orgListQuery.data?.items ?? []).map((o) => ({
      id: o.id,
      name: o.name,
    }));
  }, [isPlatformAdmin, normalOrgId, orgListQuery.data?.items]);

  // Read initial stored selection from sessionStorage (only relevant for platform_admin)
  const [userSelectedOrgId, setUserSelectedOrgIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(TEACHER_SELECTED_ORG_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Strict validation of sessionStorage against current availableOrgs
  useEffect(() => {
    if (!isPlatformAdmin) return;
    if (orgListQuery.isLoading) return;

    if (availableOrgs.length === 0) {
      // 0 organizations: clear any stale stored ID
      if (userSelectedOrgId !== null) {
        setUserSelectedOrgIdState(null);
        try {
          sessionStorage.removeItem(TEACHER_SELECTED_ORG_STORAGE_KEY);
        } catch {
          // ignore storage error
        }
      }
      return;
    }

    if (availableOrgs.length === 1) {
      // 1 organization: deterministic auto-selection
      const singleOrg = availableOrgs[0];
      if (userSelectedOrgId !== singleOrg.id) {
        setUserSelectedOrgIdState(singleOrg.id);
        try {
          sessionStorage.setItem(TEACHER_SELECTED_ORG_STORAGE_KEY, singleOrg.id);
        } catch {
          // ignore
        }
      }
      return;
    }

    // >1 organizations: ensure userSelectedOrgId is valid and exists in availableOrgs
    if (userSelectedOrgId) {
      const isValid = availableOrgs.some((o) => o.id === userSelectedOrgId);
      if (!isValid) {
        // Invalid or deleted organization in storage: wipe it
        setUserSelectedOrgIdState(null);
        try {
          sessionStorage.removeItem(TEACHER_SELECTED_ORG_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }
  }, [isPlatformAdmin, orgListQuery.isLoading, availableOrgs, userSelectedOrgId]);

  const setSelectedOrgId = useCallback(
    (orgId: string) => {
      if (!isPlatformAdmin) return;
      const valid = availableOrgs.some((o) => o.id === orgId);
      if (!valid) return;

      setUserSelectedOrgIdState(orgId);
      try {
        sessionStorage.setItem(TEACHER_SELECTED_ORG_STORAGE_KEY, orgId);
      } catch {
        // ignore
      }
    },
    [isPlatformAdmin, availableOrgs],
  );

  // Compute final values
  const contextValue = useMemo<TeacherOrganizationContextValue>(() => {
    if (!isPlatformAdmin) {
      return {
        selectedOrgId: normalOrgId,
        selectedOrg: normalOrgId ? { id: normalOrgId, name: "سازمان آموزشی" } : null,
        availableOrgs: normalOrgId ? [{ id: normalOrgId, name: "سازمان آموزشی" }] : [],
        isLoadingOrgs: false,
        orgsError: null,
        needsOrgSelection: false,
        hasNoOrganizations: !normalOrgId,
        isPlatformAdmin: false,
        setSelectedOrgId: () => {},
      };
    }

    const isLoading = orgListQuery.isLoading;
    const orgsError = orgListQuery.error ? (orgListQuery.error as Error).message : null;
    const count = availableOrgs.length;

    let activeOrgId: string | null = null;
    let needsSelection = false;
    let hasZero = false;

    if (!isLoading) {
      if (count === 0) {
        hasZero = true;
      } else if (count === 1) {
        activeOrgId = availableOrgs[0].id;
      } else {
        // count > 1: check if userSelectedOrgId is in availableOrgs
        const matched = userSelectedOrgId
          ? availableOrgs.find((o) => o.id === userSelectedOrgId)
          : undefined;
        if (matched) {
          activeOrgId = matched.id;
        } else {
          needsSelection = true;
        }
      }
    }

    const activeOrg = activeOrgId
      ? availableOrgs.find((o) => o.id === activeOrgId) ?? null
      : null;

    return {
      selectedOrgId: activeOrgId,
      selectedOrg: activeOrg,
      availableOrgs,
      isLoadingOrgs: isLoading,
      orgsError,
      needsOrgSelection: needsSelection,
      hasNoOrganizations: hasZero,
      isPlatformAdmin: true,
      setSelectedOrgId,
    };
  }, [
    isPlatformAdmin,
    normalOrgId,
    orgListQuery.isLoading,
    orgListQuery.error,
    availableOrgs,
    userSelectedOrgId,
    setSelectedOrgId,
  ]);

  return (
    <TeacherOrganizationContext.Provider value={contextValue}>
      {children}
    </TeacherOrganizationContext.Provider>
  );
}

export function useTeacherOrganization(): TeacherOrganizationContextValue {
  const context = useContext(TeacherOrganizationContext);
  if (!context) {
    throw new Error(
      "useTeacherOrganization must be used within a TeacherOrganizationProvider",
    );
  }
  return context;
}
