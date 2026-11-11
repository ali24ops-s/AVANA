import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMindMap, mergeThreeWay } from "../hooks/useMindMap.js";
import type { MindMapDto, MindMapPayload } from "@avana/contracts";

const mockGetMindMap = vi.fn();
const mockGenerateMindMap = vi.fn();
const mockUpdateMindMap = vi.fn();
const mockExpandNode = vi.fn();
const mockResetMindMap = vi.fn();
const mockListVersions = vi.fn().mockResolvedValue({ versions: [], currentVersion: 0 });
const mockRestoreVersion = vi.fn();

vi.mock("../lib/api/client.js", () => ({
  createApiClient: () => ({}),
  getApiBaseUrl: () => "http://localhost:3000",
}));

vi.mock("../lib/api/mind-map.js", () => ({
  createMindMapApi: () => ({
    getMindMap: mockGetMindMap,
    generateMindMap: mockGenerateMindMap,
    updateMindMap: mockUpdateMindMap,
    expandNode: mockExpandNode,
    resetToAiBase: mockResetMindMap,
    resetMindMap: mockResetMindMap,
    listVersions: mockListVersions,
    restoreVersion: mockRestoreVersion,
  }),
}));

describe("MindMap Autosave Queue & Concurrency Suite", () => {
  const initialPayload: MindMapPayload = {
    kind: "mind_map",
    version: 1,
    sourceType: "document",
    sourceId: "doc-1",
    updatedAt: "2026-11-03T10:00:00.000Z",
    aiBase: {
      rootNodeId: "root",
      generatedAt: "2026-11-03T10:00:00.000Z",
      model: "gemini-3.5-flash-lite",
      nodes: {
        root: { id: "root", parentId: null, title: "مفاهیم پایه" },
        node_1: { id: "node_1", parentId: "root", title: "مبحث اول" },
        node_2: { id: "node_2", parentId: "root", title: "مبحث دوم" },
      },
    },
    userModifications: {
      deletedNodeIds: [],
      customNodes: {},
      overrides: {},
    },
    userNotes: {},
  };

  const initialDto: MindMapDto = {
    id: "record-1",
    userId: "user-1",
    moduleId: "mod-1",
    courseId: "course-1",
    version: 1,
    status: "completed",
    costToman: 0,
    updatedAt: "2026-11-03T10:00:00.000Z",
    createdAt: "2026-11-03T10:00:00.000Z",
    payload: initialPayload,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMindMap.mockResolvedValue({
      has_mind_map: true,
      mind_map: initialDto,
      source_available: true,
      source_type: "document",
    });
  });

  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  describe("1. Three-Way Merge Function (mergeThreeWay)", () => {
    it("preserves non-conflicting remote and local modifications and notes", () => {
      const remotePayload: MindMapPayload = {
        ...initialPayload,
        updatedAt: "2026-11-03T10:05:00.000Z",
        userModifications: {
          deletedNodeIds: ["node_2"],
          customNodes: {
            remote_node: { id: "remote_node", parentId: "root", title: "گره ریموت" },
          },
          overrides: {
            node_1: { title: "عنوان تغییریافته در سرور" },
          },
        },
        userNotes: {
          node_1: { noteText: "یادداشت سرور", updatedAt: "2026-11-03T10:05:00.000Z" },
        },
      };

      const localEdits = {
        userModifications: {
          deletedNodeIds: [],
          customNodes: {
            local_node: { id: "local_node", parentId: "root", title: "گره محلی کاربر" },
          },
          overrides: {},
        },
        userNotes: {
          local_node: { noteText: "یادداشت کاربر", updatedAt: "2026-11-03T10:06:00.000Z" },
        },
      };

      const merged = mergeThreeWay(null, remotePayload, localEdits);

      // Union of deleted nodes
      expect(merged.userModifications.deletedNodeIds).toContain("node_2");
      // Both custom nodes preserved
      expect(merged.userModifications.customNodes["remote_node"]?.title).toBe("گره ریموت");
      expect(merged.userModifications.customNodes["local_node"]?.title).toBe("گره محلی کاربر");
      // Remote override preserved
      expect(merged.userModifications.overrides["node_1"]?.title).toBe("عنوان تغییریافته در سرور");
      // Both notes preserved
      expect(merged.userNotes["node_1"]?.noteText).toBe("یادداشت سرور");
      expect(merged.userNotes["local_node"]?.noteText).toBe("یادداشت کاربر");
    });

    it("gives precedence to local modifications and notes when same node is modified", () => {
      const remotePayload: MindMapPayload = {
        ...initialPayload,
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {
            node_1: { title: "عنوان تغییریافته در سرور" },
          },
        },
        userNotes: {
          node_1: { noteText: "یادداشت سرور", updatedAt: "2026-11-03T10:05:00.000Z" },
        },
      };

      const localEdits = {
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {
            node_1: { title: "عنوان محلی کاربر" },
          },
        },
        userNotes: {
          node_1: { noteText: "یادداشت بازنویسی شده کاربر", updatedAt: "2026-11-03T10:06:00.000Z" },
        },
      };

      const merged = mergeThreeWay(null, remotePayload, localEdits);
      // Local wins in direct conflict
      expect(merged.userModifications.overrides["node_1"]?.title).toBe("عنوان محلی کاربر");
      expect(merged.userNotes["node_1"]?.noteText).toBe("یادداشت بازنویسی شده کاربر");
    });

    it("merges customEdges, deduplicates, and prunes edges touching deleted nodes", () => {
      const remotePayload: MindMapPayload = {
        ...initialPayload,
        updatedAt: "2026-11-03T10:05:00.000Z",
        userModifications: {
          deletedNodeIds: ["node_2"],
          customNodes: {},
          overrides: {},
          customEdges: [
            { id: "e1", source: "root", target: "node_1" },
            { id: "e2", source: "node_1", target: "node_2" }, // node_2 is deleted!
          ],
        },
      };

      const localEdits = {
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {},
          customEdges: [
            { id: "e1", source: "root", target: "node_1" }, // duplicate of remote e1
            { id: "e3", source: "root", target: "node_1", sourceHandle: "bottom", targetHandle: "top" },
          ],
        },
        userNotes: {},
      };

      const merged = mergeThreeWay(null, remotePayload, localEdits);

      // e2 must be pruned because node_2 is deleted
      expect(merged.userModifications.customEdges?.find((e) => e.id === "e2")).toBeUndefined();
      // e1 preserved without duplicate
      const e1Edges = merged.userModifications.customEdges?.filter((e) => e.source === "root" && e.target === "node_1" && !e.sourceHandle);
      expect(e1Edges?.length).toBe(1);
      // e3 preserved
      expect(merged.userModifications.customEdges?.find((e) => e.id === "e3")).toBeDefined();
    });
  });

  describe("2. Serialized Autosave Queue & Coalescing", () => {
    it("coalesces rapid sequential modifications and sends in FIFO queue", async () => {
      let resolveFirstUpdate: (val: any) => void;
      const firstUpdatePromise = new Promise((resolve) => {
        resolveFirstUpdate = resolve;
      });

      mockUpdateMindMap
        .mockImplementationOnce(async () => {
          return firstUpdatePromise;
        })
        .mockImplementationOnce(async (_modId, req) => {
          return {
            mind_map: {
              ...initialDto,
              updatedAt: "2026-11-03T10:02:00.000Z",
              payload: {
                ...initialPayload,
                userModifications: req.userModifications,
                userNotes: req.userNotes,
                updatedAt: "2026-11-03T10:02:00.000Z",
              },
            },
          };
        });

      const { result } = renderHook(() => useMindMap("mod-1", "course-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hasMindMap).toBe(true);
      });

      // Rapid modification 1
      act(() => {
        result.current.applyModification(
          {
            deletedNodeIds: [],
            customNodes: { n1: { id: "n1", parentId: "root", title: "ویرایش ۱" } },
            overrides: {},
          },
          {},
        );
      });

      expect(result.current.isSaving).toBe(true);
      expect(result.current.isDirty).toBe(true);
      expect(mockUpdateMindMap).toHaveBeenCalledTimes(1);

      // Rapid modification 2 while 1 is in-flight
      act(() => {
        result.current.applyModification(
          {
            deletedNodeIds: [],
            customNodes: {
              n1: { id: "n1", parentId: "root", title: "ویرایش ۱" },
              n2: { id: "n2", parentId: "root", title: "ویرایش ۲ فوری" },
            },
            overrides: {},
          },
          { n2: { noteText: "نکته فوری", updatedAt: new Date().toISOString() } },
        );
      });

      // Still 1 request in flight (serialized, not running concurrently)
      expect(mockUpdateMindMap).toHaveBeenCalledTimes(1);

      // Finish first update
      await act(async () => {
        resolveFirstUpdate!({
          mind_map: {
            ...initialDto,
            updatedAt: "2026-11-03T10:01:00.000Z",
            payload: {
              ...initialPayload,
              updatedAt: "2026-11-03T10:01:00.000Z",
            },
          },
        });
      });

      // Wait for coalesced second save to complete
      await waitFor(() => {
        expect(mockUpdateMindMap).toHaveBeenCalledTimes(2);
      });

      // Verify the second call used the confirmed timestamp from the first call
      const secondCallArgs = mockUpdateMindMap.mock.calls[1];
      expect(secondCallArgs[1].clientUpdatedAt).toBe("2026-11-03T10:01:00.000Z");
      expect(secondCallArgs[1].userModifications.customNodes["n2"]?.title).toBe("ویرایش ۲ فوری");

      await waitFor(() => {
        expect(result.current.saveStatus).toBe("saved");
        expect(result.current.isDirty).toBe(false);
      });
    });

    it("handles 409 conflict with 3-way merge and retries up to 3 times", async () => {
      // 1st update fails with 409 Conflict
      const conflictError: any = new Error("تعارض هم‌زمانی");
      conflictError.status = 409;
      mockUpdateMindMap.mockRejectedValueOnce(conflictError);

      // Fresh remote returned on getMindMap
      const freshRemoteDto: MindMapDto = {
        ...initialDto,
        updatedAt: "2026-11-03T10:05:00.000Z",
        payload: {
          ...initialPayload,
          updatedAt: "2026-11-03T10:05:00.000Z",
          userModifications: {
            deletedNodeIds: ["node_2"],
            customNodes: {},
            overrides: { node_1: { title: "تغییر یافته توسط دستگاه دیگر" } },
          },
          userNotes: {},
        },
      };
      mockGetMindMap.mockResolvedValue({
        has_mind_map: true,
        mind_map: freshRemoteDto,
        source_available: true,
        source_type: "document",
      });

      // 2nd update (after merge) succeeds
      mockUpdateMindMap.mockResolvedValueOnce({
        mind_map: {
          ...freshRemoteDto,
          updatedAt: "2026-11-03T10:06:00.000Z",
          payload: {
            ...freshRemoteDto.payload,
            updatedAt: "2026-11-03T10:06:00.000Z",
          },
        },
      });

      const { result } = renderHook(() => useMindMap("mod-1", "course-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hasMindMap).toBe(true);
      });

      // Apply modification
      act(() => {
        result.current.applyModification(
          {
            deletedNodeIds: [],
            customNodes: { local_custom: { id: "local_custom", parentId: "root", title: "گره من" } },
            overrides: {},
          },
          {},
        );
      });

      // Wait for retry and resolution
      await waitFor(() => {
        expect(mockUpdateMindMap).toHaveBeenCalledTimes(2);
      });

      // Verify that retry sent merged modifications and updated timestamp
      const retryArgs = mockUpdateMindMap.mock.calls[1];
      expect(retryArgs[1].clientUpdatedAt).toBe("2026-11-03T10:05:00.000Z");
      expect(retryArgs[1].userModifications.deletedNodeIds).toContain("node_2");
      expect(retryArgs[1].userModifications.customNodes["local_custom"]).toBeDefined();

      await waitFor(() => {
        expect(result.current.saveStatus).toBe("saved");
        expect(result.current.isDirty).toBe(false);
      });
    });

    it("supports undo and redo of customEdges modifications", async () => {
      const { result } = renderHook(() => useMindMap("mod-1", "course-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hasMindMap).toBe(true);
      });

      expect(result.current.canUndo).toBe(false);

      // Apply modification with customEdge
      act(() => {
        result.current.applyModification(
          {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            customEdges: [{ id: "edge-1", source: "root", target: "node_1" }],
          },
          {},
        );
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.payload?.userModifications?.customEdges).toHaveLength(1);

      // Undo
      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo).toBe(true);
      expect(result.current.payload?.userModifications?.customEdges ?? []).toHaveLength(0);

      // Redo
      act(() => {
        result.current.redo();
      });

      expect(result.current.payload?.userModifications?.customEdges).toHaveLength(1);
    });

    it("persists pending customEdges in localStorage on autosave failure and clears on successful save", async () => {
      const store: Record<string, string> = {};
      const mockStorage = {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, val: string) => {
          store[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
        clear: vi.fn(() => {
          for (const k in store) delete store[k];
        }),
      };
      Object.defineProperty(window, "localStorage", { value: mockStorage, configurable: true });

      // Update will reject with error
      mockUpdateMindMap.mockRejectedValueOnce(new Error("Simulated Network Error"));

      const { result } = renderHook(() => useMindMap("mod-1", "course-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hasMindMap).toBe(true);
      });

      act(() => {
        result.current.applyModification(
          {
            deletedNodeIds: [],
            customNodes: {},
            overrides: {},
            customEdges: [{ id: "edge-persist", source: "root", target: "node_1" }],
          },
          {},
        );
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe("error");
      });

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        "avana_mindmap_pending_mod-1",
        expect.stringContaining("edge-persist"),
      );

      // Subsequent retry succeeds
      mockUpdateMindMap.mockResolvedValueOnce({
        mind_map: {
          ...initialDto,
          updatedAt: "2026-11-03T10:03:00.000Z",
          payload: {
            ...initialPayload,
            updatedAt: "2026-11-03T10:03:00.000Z",
          },
        },
      });

      act(() => {
        result.current.retrySave();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe("saved");
      });

      expect(mockStorage.removeItem).toHaveBeenCalledWith("avana_mindmap_pending_mod-1");
    });
  });
});
