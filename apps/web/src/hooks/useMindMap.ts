/**
 * React hook for Interactive AI Mind Map state, queries, and mutations.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createMindMapApi } from "../lib/api/mind-map.js";
import type {
  MindMapDto,
  MindMapPayload,
  MindMapNodeBase,
  MindMapUserModifications,
  MindMapNodeUserNote,
  MindMapCustomEdge,
  UpdateMindMapRequest,
} from "@avana/contracts";
import { computeEffectiveMindMap } from "@avana/domain";

export type MindMapSaveStatus = "saved" | "saving" | "conflict_retrying" | "conflict_manual" | "error";

export interface MindMapHistoryState {
  modifications: MindMapUserModifications;
  notes: Record<string, MindMapNodeUserNote>;
}

/**
 * Three-way merge function for reconciling local uncommitted changes
 * with fresh remote server payload during concurrent update conflicts.
 */
export function mergeThreeWay(
  _base: { modifications: MindMapUserModifications; notes: Record<string, MindMapNodeUserNote> } | null,
  remote: MindMapPayload,
  local: { userModifications: MindMapUserModifications; userNotes: Record<string, MindMapNodeUserNote> },
): { userModifications: MindMapUserModifications; userNotes: Record<string, MindMapNodeUserNote> } {
  const remoteMods = remote.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} };
  const remoteNotes = remote.userNotes ?? {};

  const localMods = local.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} };
  const localNotes = local.userNotes ?? {};

  // Deleted Node IDs: union of remote and local
  const deletedNodeIdsSet = new Set<string>([
    ...(remoteMods.deletedNodeIds ?? []),
    ...(localMods.deletedNodeIds ?? []),
  ]);

  // If local explicitly created or modified a custom node, ensure it is not marked as deleted
  for (const nodeId of Object.keys(localMods.customNodes ?? {})) {
    deletedNodeIdsSet.delete(nodeId);
  }

  // Custom nodes: merge remote and local, local wins for conflict
  const customNodes: Record<string, MindMapNodeBase> = {
    ...(remoteMods.customNodes ?? {}),
    ...(localMods.customNodes ?? {}),
  };
  for (const deletedId of deletedNodeIdsSet) {
    delete customNodes[deletedId];
  }

  // Overrides: merge remote and local, local wins
  const overrides = {
    ...(remoteMods.overrides ?? {}),
    ...(localMods.overrides ?? {}),
  };
  for (const deletedId of deletedNodeIdsSet) {
    delete overrides[deletedId];
  }

  // Custom edges: merge remote and local, local wins for conflict/order, filter deleted
  const remoteEdges = remoteMods.customEdges ?? [];
  const localEdges = localMods.customEdges ?? [];
  const edgeMap = new Map<string, MindMapCustomEdge>();
  for (const edge of [...remoteEdges, ...localEdges]) {
    if (!deletedNodeIdsSet.has(edge.source) && !deletedNodeIdsSet.has(edge.target)) {
      const key = `${edge.source}_${edge.sourceHandle || ""}_${edge.target}_${edge.targetHandle || ""}`;
      edgeMap.set(key, edge);
    }
  }

  // Notes: merge remote and local, local wins
  const userNotes = {
    ...remoteNotes,
    ...localNotes,
  };
  for (const deletedId of deletedNodeIdsSet) {
    delete userNotes[deletedId];
  }

  return {
    userModifications: {
      deletedNodeIds: Array.from(deletedNodeIdsSet),
      customNodes,
      overrides,
      customEdges: Array.from(edgeMap.values()),
    },
    userNotes,
  };
}

export function useMindMap(moduleId: string | null, courseId?: string | null) {
  const queryClient = useQueryClient();

  const api = useMemo(() => {
    const client = createApiClient({
      baseUrl: getApiBaseUrl(),
    });
    return createMindMapApi(client);
  }, []);

  const queryKey = ["personal-mind-map", moduleId, courseId];

  // 1. Fetch Latest Mind Map
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => (moduleId ? api.getMindMap(moduleId, courseId) : null),
    enabled: Boolean(moduleId),
    staleTime: 60_000,
  });

  const mindMapDto: MindMapDto | null = data?.mind_map ?? null;
  const payload: MindMapPayload | null = mindMapDto?.payload ?? null;
  const hasMindMap = Boolean(data?.has_mind_map && mindMapDto && payload);
  const sourceAvailable = data?.source_available ?? false;
  const sourceType = data?.source_type ?? null;

  // 2. Undo / Redo History State
  const [history, setHistory] = useState<MindMapHistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // 3. Serialized Save Queue & Concurrency Management
  const [saveStatus, setSaveStatus] = useState<MindMapSaveStatus>("saved");
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const inFlightRequestRef = useRef<boolean>(false);
  const pendingSnapshotRef = useRef<{
    userModifications: MindMapUserModifications;
    userNotes: Record<string, MindMapNodeUserNote>;
  } | null>(null);
  const lastConfirmedUpdatedAtRef = useRef<string | null>(null);
  const lastConfirmedSnapshotRef = useRef<{
    modifications: MindMapUserModifications;
    notes: Record<string, MindMapNodeUserNote>;
  } | null>(null);
  const conflictRetryCountRef = useRef<number>(0);

  // Sync confirmed timestamp from fetched server payload when idle
  useEffect(() => {
    if (mindMapDto?.updatedAt && !inFlightRequestRef.current && !pendingSnapshotRef.current) {
      lastConfirmedUpdatedAtRef.current = mindMapDto.updatedAt;
      lastConfirmedSnapshotRef.current = {
        modifications: payload?.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} },
        notes: payload?.userNotes ?? {},
      };
    }
  }, [mindMapDto?.updatedAt, payload?.userModifications, payload?.userNotes]);

  // Auxiliary beforeunload warning if dirty or saving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty || inFlightRequestRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  // Effective Nodes Computation (Merging 3 layers)
  const effectiveTree = useMemo(() => {
    if (!payload) return null;
    return computeEffectiveMindMap(payload);
  }, [payload]);

  // Serialized FIFO Queue processing
  const processQueue = useCallback(async () => {
    if (inFlightRequestRef.current) {
      return;
    }
    if (!pendingSnapshotRef.current) {
      return;
    }
    if (!moduleId) return;

    inFlightRequestRef.current = true;
    setSaveStatus((prev) => (prev === "conflict_retrying" ? "conflict_retrying" : "saving"));

    while (pendingSnapshotRef.current) {
      const toSend = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;

      try {
        const res = await api.updateMindMap(
          moduleId,
          {
            userModifications: toSend.userModifications,
            userNotes: toSend.userNotes,
            clientUpdatedAt: lastConfirmedUpdatedAtRef.current ?? undefined,
          },
          courseId,
        );

        // Success
        lastConfirmedUpdatedAtRef.current = res.mind_map.updatedAt;
        lastConfirmedSnapshotRef.current = {
          modifications: toSend.userModifications,
          notes: toSend.userNotes,
        };
        conflictRetryCountRef.current = 0;

        queryClient.setQueryData(queryKey, (prev: any) => {
          if (!prev?.mind_map) return prev;
          return {
            ...prev,
            mind_map: {
              ...prev.mind_map,
              updatedAt: res.mind_map.updatedAt,
              version: res.mind_map.version,
              payload: {
                ...prev.mind_map.payload,
                updatedAt: res.mind_map.payload.updatedAt,
                ...(!pendingSnapshotRef.current
                  ? {
                      userModifications: res.mind_map.payload.userModifications,
                      userNotes: res.mind_map.payload.userNotes,
                    }
                  : {}),
              },
            },
          };
        });

        if (!pendingSnapshotRef.current) {
          setSaveStatus("saved");
          setIsDirty(false);
          try {
            if (typeof window !== "undefined" && window.localStorage && moduleId) {
              window.localStorage.removeItem(`avana_mindmap_pending_${moduleId}`);
            }
          } catch {}
        }
      } catch (err: any) {
        const isConflict =
          err?.status === 409 ||
          err?.statusCode === 409 ||
          err?.message?.includes("409") ||
          err?.message?.includes("تعارض") ||
          err?.data?.error?.code === "conflict";

        if (isConflict) {
          if (conflictRetryCountRef.current < 3) {
            conflictRetryCountRef.current += 1;
            setSaveStatus("conflict_retrying");

            try {
              const fresh = await api.getMindMap(moduleId, courseId);
              if (fresh?.mind_map?.payload) {
                const remotePayload = fresh.mind_map.payload;
                const merged = mergeThreeWay(
                  lastConfirmedSnapshotRef.current,
                  remotePayload,
                  toSend,
                );

                lastConfirmedUpdatedAtRef.current = fresh.mind_map.updatedAt;
                lastConfirmedSnapshotRef.current = {
                  modifications: remotePayload.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} },
                  notes: remotePayload.userNotes ?? {},
                };

                if (pendingSnapshotRef.current) {
                  pendingSnapshotRef.current = mergeThreeWay(
                    null,
                    { ...remotePayload, userModifications: merged.userModifications, userNotes: merged.userNotes },
                    pendingSnapshotRef.current,
                  );
                } else {
                  pendingSnapshotRef.current = merged;
                }

                // Apply merged state into cache
                queryClient.setQueryData(queryKey, (prev: any) => {
                  if (!prev?.mind_map?.payload) return prev;
                  return {
                    ...prev,
                    mind_map: {
                      ...prev.mind_map,
                      payload: {
                        ...prev.mind_map.payload,
                        userModifications: pendingSnapshotRef.current!.userModifications,
                        userNotes: pendingSnapshotRef.current!.userNotes,
                        aiBase: remotePayload.aiBase ?? prev.mind_map.payload.aiBase,
                      },
                    },
                  };
                });

                continue;
              }
            } catch {
              pendingSnapshotRef.current = toSend;
              setSaveStatus("error");
              break;
            }
          } else {
            pendingSnapshotRef.current = toSend;
            setSaveStatus("conflict_manual");
            break;
          }
        } else {
          pendingSnapshotRef.current = toSend;
          setSaveStatus("error");
          try {
            if (typeof window !== "undefined" && window.localStorage && moduleId) {
              window.localStorage.setItem(
                `avana_mindmap_pending_${moduleId}`,
                JSON.stringify({ pending: toSend, timestamp: new Date().toISOString() }),
              );
            }
          } catch {}
          break;
        }
      }
    }

    inFlightRequestRef.current = false;
  }, [moduleId, courseId, api, queryClient, queryKey]);

  // Retry save
  const retrySave = useCallback(() => {
    conflictRetryCountRef.current = 0;
    if (!pendingSnapshotRef.current && payload) {
      pendingSnapshotRef.current = {
        userModifications: payload.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} },
        userNotes: payload.userNotes ?? {},
      };
    }
    setIsDirty(true);
    processQueue();
  }, [payload, processQueue]);

  // Recover unsaved pending changes from localStorage cache if newer than server
  useEffect(() => {
    if (!moduleId || typeof window === "undefined" || !window.localStorage) return;
    try {
      const cachedStr = window.localStorage.getItem(`avana_mindmap_pending_${moduleId}`);
      if (!cachedStr) return;
      const cached = JSON.parse(cachedStr);
      if (cached?.pending && cached?.timestamp) {
        const cacheTime = new Date(cached.timestamp).getTime();
        const serverTime = mindMapDto?.updatedAt ? new Date(mindMapDto.updatedAt).getTime() : 0;
        if (cacheTime > serverTime && !pendingSnapshotRef.current && !inFlightRequestRef.current) {
          pendingSnapshotRef.current = cached.pending;
          setIsDirty(true);
          processQueue();
        }
      }
    } catch {}
  }, [moduleId, mindMapDto?.updatedAt, processQueue]);

  // 4. Generate Mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!moduleId) throw new Error("No module ID");
      return api.generateMindMap(moduleId, courseId);
    },
    onSuccess: (res) => {
      queryClient.setQueryData(queryKey, {
        has_mind_map: true,
        mind_map: res.mind_map,
        source_available: true,
        source_type: res.mind_map.payload.sourceType,
      });
      lastConfirmedUpdatedAtRef.current = res.mind_map.updatedAt;
      pendingSnapshotRef.current = null;
      setIsDirty(false);
      setSaveStatus("saved");
      setHistory([]);
      setHistoryIndex(-1);
    },
  });

  const generateMindMap = useCallback(async () => {
    try {
      return await generateMutation.mutateAsync();
    } catch {
      return null;
    }
  }, [generateMutation]);

  // 5. Expand Node Mutation
  const expandNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      if (!moduleId) throw new Error("No module ID");
      return api.expandNode(moduleId, nodeId, courseId);
    },
    onSuccess: (res) => {
      queryClient.setQueryData(queryKey, (prev: any) => {
        if (!prev?.mind_map?.payload) return prev;
        const newPayload = { ...prev.mind_map.payload };
        if (newPayload.aiBase?.nodes?.[res.nodeId]) {
          newPayload.aiBase.nodes[res.nodeId].detailedExplanation = res.detailedExplanation;
          newPayload.aiBase.nodes[res.nodeId].examples = res.examples;
          newPayload.aiBase.nodes[res.nodeId].examTips = res.examTips;
          if (res.structuredDetails) {
            newPayload.aiBase.nodes[res.nodeId].structuredDetails = res.structuredDetails;
          }
        } else if (newPayload.userModifications?.customNodes?.[res.nodeId]) {
          newPayload.userModifications.customNodes[res.nodeId].detailedExplanation = res.detailedExplanation;
          newPayload.userModifications.customNodes[res.nodeId].examples = res.examples;
          newPayload.userModifications.customNodes[res.nodeId].examTips = res.examTips;
          if (res.structuredDetails) {
            newPayload.userModifications.customNodes[res.nodeId].structuredDetails = res.structuredDetails;
          }
        }
        return {
          ...prev,
          mind_map: {
            ...prev.mind_map,
            payload: newPayload,
          },
        };
      });
    },
  });

  // 6. Reset Mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!moduleId) throw new Error("No module ID");
      return api.resetMindMap(moduleId, courseId);
    },
    onSuccess: (res) => {
      queryClient.setQueryData(queryKey, (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          mind_map: res.mind_map,
        };
      });
      lastConfirmedUpdatedAtRef.current = res.mind_map.updatedAt;
      pendingSnapshotRef.current = null;
      try {
        if (typeof window !== "undefined" && window.localStorage && moduleId) {
          window.localStorage.removeItem(`avana_mindmap_pending_${moduleId}`);
        }
      } catch {}
      setIsDirty(false);
      setSaveStatus("saved");
      setHistory([]);
      setHistoryIndex(-1);
    },
  });

  // 7. Version History Queries & Mutation
  const { data: versionsData, refetch: refetchVersions, isLoading: isLoadingVersions } = useQuery({
    queryKey: ["personal-mind-map-versions", moduleId, courseId],
    queryFn: () => (moduleId ? api.listVersions(moduleId, courseId) : null),
    enabled: Boolean(moduleId),
    staleTime: 30_000,
  });

  const restoreMutation = useMutation({
    mutationFn: async (version: number) => {
      if (!moduleId) throw new Error("No module ID");
      return api.restoreVersion(moduleId, version, courseId);
    },
    onSuccess: (res) => {
      const restoredMap = res.mind_map;
      if (restoredMap) {
        queryClient.setQueryData(queryKey, (prev: any) => ({
          ...prev,
          has_mind_map: true,
          mind_map: restoredMap,
          source_available: true,
          source_type: restoredMap.payload.sourceType,
        }));
        lastConfirmedUpdatedAtRef.current = restoredMap.updatedAt;
      }
      queryClient.invalidateQueries({ queryKey: ["personal-mind-map-versions", moduleId, courseId] });
      pendingSnapshotRef.current = null;
      try {
        if (typeof window !== "undefined" && window.localStorage && moduleId) {
          window.localStorage.removeItem(`avana_mindmap_pending_${moduleId}`);
        }
      } catch {}
      setIsDirty(false);
      setSaveStatus("saved");
      setHistory([]);
      setHistoryIndex(-1);
    },
  });

  // Actions for modifying nodes
  const applyModification = useCallback(
    (
      newModifications: MindMapUserModifications,
      newNotes: Record<string, MindMapNodeUserNote>,
    ) => {
      if (!payload) return;

      // Push to history
      const currentSnapshot: MindMapHistoryState = {
        modifications: payload.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} },
        notes: payload.userNotes ?? {},
      };
      const nextSnapshot: MindMapHistoryState = {
        modifications: newModifications,
        notes: newNotes,
      };

      const baseHistory = history.length === 0
        ? [currentSnapshot]
        : history.slice(0, historyIndex + 1);

      const newHistory = [...baseHistory, nextSnapshot];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      // Optimistic update
      queryClient.setQueryData(queryKey, (prev: any) => {
        if (!prev?.mind_map?.payload) return prev;
        return {
          ...prev,
          mind_map: {
            ...prev.mind_map,
            payload: {
              ...prev.mind_map.payload,
              userModifications: newModifications,
              userNotes: newNotes,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      });

      // Buffer and trigger save queue
      pendingSnapshotRef.current = {
        userModifications: newModifications,
        userNotes: newNotes,
      };
      setIsDirty(true);
      processQueue();
    },
    [payload, history, historyIndex, queryClient, queryKey, processQueue],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0 || !history[historyIndex - 1]) return;
    const targetIndex = historyIndex - 1;
    const targetState = history[targetIndex];
    setHistoryIndex(targetIndex);

    // Optimistic cache update
    queryClient.setQueryData(queryKey, (prev: any) => {
      if (!prev?.mind_map?.payload) return prev;
      return {
        ...prev,
        mind_map: {
          ...prev.mind_map,
          payload: {
            ...prev.mind_map.payload,
            userModifications: targetState.modifications,
            userNotes: targetState.notes,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });

    pendingSnapshotRef.current = {
      userModifications: targetState.modifications,
      userNotes: targetState.notes,
    };
    setIsDirty(true);
    processQueue();
  }, [historyIndex, history, queryClient, queryKey, processQueue]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1 || !history[historyIndex + 1]) return;
    const targetIndex = historyIndex + 1;
    const targetState = history[targetIndex];
    setHistoryIndex(targetIndex);

    // Optimistic cache update
    queryClient.setQueryData(queryKey, (prev: any) => {
      if (!prev?.mind_map?.payload) return prev;
      return {
        ...prev,
        mind_map: {
          ...prev.mind_map,
          payload: {
            ...prev.mind_map.payload,
            userModifications: targetState.modifications,
            userNotes: targetState.notes,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });

    pendingSnapshotRef.current = {
      userModifications: targetState.modifications,
      userNotes: targetState.notes,
    };
    setIsDirty(true);
    processQueue();
  }, [historyIndex, history, queryClient, queryKey, processQueue]);

  return {
    mindMapDto,
    mindMap: mindMapDto,
    payload,
    effectiveTree,
    hasMindMap,
    sourceAvailable,
    sourceType,
    isLoading,
    isError,
    error,
    refetch,
    // Mutations
    generateMutation,
    generateMindMap,
    isGenerating: generateMutation.isPending,
    isSaving: saveStatus === "saving" || saveStatus === "conflict_retrying",
    saveStatus,
    isDirty,
    retrySave,
    expandNode: expandNodeMutation.mutateAsync,
    isExpanding: expandNodeMutation.isPending,
    resetToAiBase: resetMutation.mutateAsync,
    isResetting: resetMutation.isPending,
    // Version History
    versions: versionsData?.versions ?? [],
    currentVersion: versionsData?.currentVersion ?? 0,
    isLoadingVersions,
    refetchVersions,
    restoreVersion: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
    // History & User Edits
    applyModification,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex >= 0 && historyIndex < history.length - 1,
    // UI state
    selectedNodeId,
    setSelectedNodeId,
    searchTerm,
    setSearchTerm,
  };
}
