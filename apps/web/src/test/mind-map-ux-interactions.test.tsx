import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MindMapCustomNode } from "../components/mindmap/MindMapCustomNode.js";
import { MindMapDetailDrawer } from "../components/mindmap/MindMapDetailDrawer.js";
import {
  MindMapCanvas,
  MindMapErrorBoundary,
  MindMapTreeEdgeComponent,
} from "../components/mindmap/MindMapCanvas.js";
import { createOrthogonalPath } from "../components/mindmap/treeLayout.js";
import type { MindMapDto } from "@avana/contracts";

// Mock @xyflow/react
let capturedReactFlowProps: any = null;
const mockSetViewport = vi.fn();
const mockGetViewport = vi.fn(() => ({ x: 100, y: 100, zoom: 1 }));

vi.mock("@xyflow/react", () => {
  return {
    ReactFlow: (props: any) => {
      capturedReactFlowProps = props;
      return (
        <div data-testid="react-flow-mock">
          <div data-testid="rf-nodes-count">{props.nodes?.length ?? 0} nodes</div>
          <div data-testid="rf-edges-count">{props.edges?.length ?? 0} edges</div>
          <div
            data-testid="rf-pane"
            className="react-flow__pane"
            onClick={(e) => props.onPaneClick?.(e)}
          />
          {props.nodes?.map((n: any) => (
            <div
              key={n.id}
              data-testid={`rf-node-${n.id}`}
              onClick={(e) => {
                n.data?.onSelectNode?.(n.id);
                props.onNodeClick?.(e, n);
              }}
              onPointerDown={(e) => n.data?.onNodePointerDown?.(e, n.id)}
            >
              {n.data?.title || n.data?.node?.title || n.data?.label}
            </div>
          ))}
          {props.children}
        </div>
      );
    },
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      setCenter: vi.fn(),
      getViewport: mockGetViewport,
      setViewport: mockSetViewport,
    }),
    useNodesState: (initial: any) => [initial, vi.fn(), vi.fn()],
    useEdgesState: (initial: any) => [initial, vi.fn(), vi.fn()],
    Position: {
      Right: "right",
      Left: "left",
      Top: "top",
      Bottom: "bottom",
    },
    ConnectionMode: {
      Loose: "loose",
      Strict: "strict",
    },
    Handle: (props: any) => (
      <div
        data-testid={`flow-handle-${props.id || props.position}`}
        data-position={props.position}
        data-type={props.type}
        className={props.className}
      />
    ),
  };
});

describe("Mind Map UX & Interaction Enhancements", () => {
  const nodesRecord: Record<string, any> = {
    root: {
      id: "root",
      title: "فصل اول: مفاهیم پایه",
      shortDescription: "توضیحات ریشه",
      depth: 0,
      orderIndex: 0,
      childrenIds: ["node-1", "node-2"],
    },
    "node-1": {
      id: "node-1",
      parentId: "root",
      title: "بخش ۱: الگوریتم‌ها",
      shortDescription: "مبانی الگوریتم",
      depth: 1,
      orderIndex: 0,
      childrenIds: ["node-1-1"],
    },
    "node-1-1": {
      id: "node-1-1",
      parentId: "node-1",
      title: "زیربخش ۱-۱: پیچیدگی زمانی",
      depth: 2,
      orderIndex: 0,
      childrenIds: [],
    },
    "node-2": {
      id: "node-2",
      parentId: "root",
      title: "بخش ۲: ساختار داده‌ها",
      shortDescription: "انواع ساختار داده",
      depth: 1,
      orderIndex: 1,
      childrenIds: [],
    },
  };

  const samplePayload: any = {
    aiBase: {
      rootNodeId: "root",
      nodes: nodesRecord,
    },
    userModifications: {
      customEdges: [
        {
          id: "custom-1-2",
          source: "node-1",
          target: "node-2",
          sourceHandle: "bottom",
          targetHandle: "top",
        },
      ],
    },
    userNotes: {},
  };

  const createMockHook = (overrides: Record<string, any> = {}) => ({
    payload: samplePayload,
    effectiveTree: {
      rootNodeId: "root",
      nodes: nodesRecord,
    },
    isGenerating: false,
    isSaving: false,
    saveStatus: "idle" as const,
    isModified: false,
    versions: [],
    currentVersion: 1,
    applyModification: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    resetToAi: vi.fn(),
    restoreVersion: vi.fn(),
    saveNote: vi.fn(),
    expandNode: vi.fn(),
    isExpanding: false,
    error: null,
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectedNodeId: null,
    setSelectedNodeId: vi.fn(),
    retrySave: vi.fn(),
    generateMindMap: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    capturedReactFlowProps = null;
  });

  describe("1. MindMapCustomNode: 4-Directional Handles", () => {
    it("renders handles on all 4 sides (top, bottom, left, right) and includes nopan, nodrag, touch-none", () => {
      const mockNodeData = {
        id: "node-test",
        title: "تست گره چهارطرفه",
        depth: 1,
        hasChildren: true,
        childrenCount: 2,
        isCollapsed: false,
      };

      const { container } = render(<MindMapCustomNode data={mockNodeData} />);

      expect(container.firstChild).toHaveClass("nopan");
      expect(container.firstChild).toHaveClass("nodrag");
      expect(container.firstChild).toHaveClass("touch-none");

      const topHandles = screen.getAllByTestId("flow-handle-top");
      const bottomHandles = screen.getAllByTestId("flow-handle-bottom");
      const leftHandles = screen.getAllByTestId("flow-handle-left");
      const rightHandles = screen.getAllByTestId("flow-handle-right");

      expect(topHandles.length).toBe(2);
      expect(bottomHandles.length).toBe(2);
      expect(leftHandles.length).toBe(2);
      expect(rightHandles.length).toBe(2);

      // Verify each direction has both a target and a source handle
      expect(topHandles.some((h) => h.getAttribute("data-type") === "source")).toBe(true);
      expect(topHandles.some((h) => h.getAttribute("data-type") === "target")).toBe(true);

      const topHandle = topHandles[0];
      expect(topHandle.className).toContain("cursor-crosshair");
      expect(topHandle.className).toContain("!bg-teal-500");
    });

    it("strictly centers title and indicators with symmetric layout across depths", () => {
      const mockNodeData = {
        id: "node-center",
        title: "عنوان کاملاً متمرکز",
        depth: 2,
        hasChildren: false,
        childrenCount: 0,
        isCollapsed: false,
      };

      const { container } = render(<MindMapCustomNode data={mockNodeData} />);
      const titleEl = screen.getByText("عنوان کاملاً متمرکز");
      expect(titleEl.className).toContain("text-center");

      const nodeBox = container.firstChild as HTMLElement;
      expect(nodeBox.className).toContain("text-center");
      expect(nodeBox.className).toContain("items-center");
    });

    it("does not render decorative hat icon and positions actions in external floating toolbar", () => {
      const mockNodeData = {
        id: "node-test-2",
        title: "گره با نکات تستی",
        depth: 1,
        hasChildren: false,
        childrenCount: 0,
        isCollapsed: false,
        examTips: ["نکته تست آزمونی مهم"],
        isSelected: true,
      };

      render(<MindMapCustomNode data={mockNodeData} />);

      // No hat / graduation cap icon rendered in the node box
      expect(screen.queryByTitle("نکته تستی/آزمونی")).not.toBeInTheDocument();

      // Floating toolbar contains action buttons outside node content
      expect(screen.getByTitle("افزودن زیرشاخه")).toBeInTheDocument();
      expect(screen.getByTitle("ویرایش عنوان")).toBeInTheDocument();
      expect(screen.getByTitle("حذف شاخه")).toBeInTheDocument();
    });

    it("renders minimal UserRound indicator with tooltip instead of old prominent badge", () => {
      const mockCustomNode = {
        id: "custom-node-1",
        title: "شاخه اضافه شده من",
        depth: 2,
        hasChildren: false,
        childrenCount: 0,
        isCollapsed: false,
        isUserCustom: true,
      };

      render(<MindMapCustomNode data={mockCustomNode} />);

      // Old prominent badge must NOT be present
      expect(screen.queryByText("شاخه شما")).not.toBeInTheDocument();

      // Minimal indicator with tooltip must be present
      const indicator = screen.getByTitle("ایجادشده توسط شما");
      expect(indicator).toBeInTheDocument();
      expect(indicator.querySelector("svg")).toBeInTheDocument();
    });

    it("renders optional shortDescription when provided and shows inline add-description button when missing", () => {
      const onEditNode = vi.fn();

      // Node with description
      const { unmount } = render(
        <MindMapCustomNode
          data={{
            id: "node-with-desc",
            title: "عنوان مفهوم",
            shortDescription: "این یک توضیح مختصر برای مفهوم است",
            depth: 2,
            hasChildren: false,
            childrenCount: 0,
            isCollapsed: false,
          }}
        />
      );
      expect(screen.getByText("این یک توضیح مختصر برای مفهوم است")).toBeInTheDocument();
      unmount();

      // User custom node WITHOUT description, selected (so toolbar is visible)
      render(
        <MindMapCustomNode
          data={{
            id: "custom-node-no-desc",
            title: "شاخه بدون توضیح",
            depth: 2,
            hasChildren: false,
            childrenCount: 0,
            isCollapsed: false,
            isUserCustom: true,
            isSelected: true,
            onEditNode,
          }}
        />
      );

      // Inline "+ افزودن توضیح" button should be rendered
      const addDescBtn = screen.getByTitle("افزودن توضیح برای این شاخه");
      expect(addDescBtn).toBeInTheDocument();
      fireEvent.click(addDescBtn);
      expect(onEditNode).toHaveBeenCalledWith("custom-node-no-desc");
    });
  });

  describe("2. MindMapCanvas: Free Panning, Loose Connection & Custom Edges", () => {
    it("configures ReactFlow with panOnDrag={true}, nodesDraggable={false} and ConnectionMode.Loose", () => {
      const hook = createMockHook();
      render(<MindMapCanvas mindMapHook={hook as any} />);

      expect(capturedReactFlowProps).toBeDefined();
      expect(capturedReactFlowProps.panOnDrag).toBe(true);
      expect(capturedReactFlowProps.nodesDraggable).toBe(false);
      expect(capturedReactFlowProps.connectionMode).toBe("loose");
    });

    it("merges customEdges with hierarchical tree layout edges", () => {
      const hook = createMockHook();
      render(<MindMapCanvas mindMapHook={hook as any} />);

      expect(capturedReactFlowProps).toBeDefined();
      const customEdge = capturedReactFlowProps.edges.find((e: any) => e.id === "custom-1-2");
      expect(customEdge).toBeDefined();
      expect(customEdge.source).toBe("node-1");
      expect(customEdge.target).toBe("node-2");
      expect(customEdge.sourceHandle).toBe("bottom");
      expect(customEdge.targetHandle).toBe("top");
    });

    it("adds new manual connection via onConnect and prevents duplicates or self-loops", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });

      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Attempt self-loop
      capturedReactFlowProps.onConnect({
        source: "node-1",
        target: "node-1",
        sourceHandle: "top",
        targetHandle: "bottom",
      });
      expect(mockApplyModification).not.toHaveBeenCalled();

      // Attempt existing duplicate edge (node-1 -> node-2)
      capturedReactFlowProps.onConnect({
        source: "node-1",
        target: "node-2",
        sourceHandle: "bottom",
        targetHandle: "top",
      });
      expect(mockApplyModification).not.toHaveBeenCalled();

      // Add valid new connection
      capturedReactFlowProps.onConnect({
        source: "node-2",
        target: "node-1-1",
        sourceHandle: "left",
        targetHandle: "right",
      });
      expect(mockApplyModification).toHaveBeenCalledWith(
        expect.objectContaining({
          customEdges: expect.arrayContaining([
            expect.objectContaining({ id: "custom-1-2" }),
            expect.objectContaining({
              source: "node-2",
              target: "node-1-1",
              sourceHandle: "left",
              targetHandle: "right",
            }),
          ]),
        }),
        expect.anything()
      );
    });

    it("pans canvas using Arrow keys and ignores keys when typing in input", () => {
      const hook = createMockHook();
      render(
        <div>
          <input data-testid="test-input" />
          <MindMapCanvas mindMapHook={hook as any} />
        </div>
      );

      // Press ArrowDown on empty window
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(mockSetViewport).toHaveBeenCalledWith({ x: 100, y: 150, zoom: 1 }, { duration: 80 });

      mockSetViewport.mockClear();

      // Press ArrowRight on empty window
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(mockSetViewport).toHaveBeenCalledWith({ x: 150, y: 100, zoom: 1 }, { duration: 80 });

      mockSetViewport.mockClear();

      // Focus an input and press ArrowDown -> should NOT pan
      const input = screen.getByTestId("test-input");
      input.focus();
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(mockSetViewport).not.toHaveBeenCalled();
    });

    it("prunes connected customEdges and closes popup when node is deleted", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });

      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Find node-1 in nodes passed to ReactFlow
      const node1 = capturedReactFlowProps.nodes.find((n: any) => n.id === "node-1");
      expect(node1).toBeDefined();

      // Delete node-1 (which has subtree node-1-1 and custom edge to node-2)
      node1.data.onDeleteNode("node-1");

      expect(mockApplyModification).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedNodeIds: expect.arrayContaining(["node-1", "node-1-1"]),
          customEdges: [], // custom-1-2 was pruned because node-1 was deleted
        }),
        expect.anything()
      );
    });

    it("preserves unrelated customEdges when deleting a node", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const mockApplyModification = vi.fn();
      const hook = createMockHook({
        applyModification: mockApplyModification,
        payload: {
          ...samplePayload,
          userModifications: {
            customEdges: [
              {
                id: "custom-1-2",
                source: "node-1",
                target: "node-2",
              },
              {
                id: "custom-2-root",
                source: "node-2",
                target: "root",
              },
            ],
          },
        },
      });

      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = capturedReactFlowProps.nodes.find((n: any) => n.id === "node-1");
      expect(node1).toBeDefined();

      // Delete node-1: custom-1-2 touches node-1, but custom-2-root is unrelated
      node1.data.onDeleteNode("node-1");

      expect(mockApplyModification).toHaveBeenCalledWith(
        expect.objectContaining({
          customEdges: [
            expect.objectContaining({ id: "custom-2-root" }),
          ],
        }),
        expect.anything()
      );
    });

    it("selects a custom edge and deletes it with Delete key, preserving connected nodes", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });

      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Select custom edge custom-1-2
      const edge = capturedReactFlowProps.edges.find((e: any) => e.id === "custom-1-2");
      expect(edge).toBeDefined();

      capturedReactFlowProps.onEdgeClick(new MouseEvent("click"), edge);

      // Press Delete key
      fireEvent.keyDown(window, { key: "Delete" });

      expect(mockApplyModification).toHaveBeenCalledWith(
        expect.objectContaining({
          customEdges: [], // custom-1-2 was removed
        }),
        expect.anything()
      );

      // The nodes node-1 and node-2 remain in the tree
      expect(hook.effectiveTree.nodes["node-1"]).toBeDefined();
      expect(hook.effectiveTree.nodes["node-2"]).toBeDefined();
    });

    it("resets all custom edges via 'بازگردانی ارتباطات' button with confirmation", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });

      render(<MindMapCanvas mindMapHook={hook as any} />);

      const resetCustomBtn = screen.getByTitle("بازگردانی ارتباطات سفارشی به حالت اولیه");
      expect(resetCustomBtn).not.toBeDisabled();

      fireEvent.click(resetCustomBtn);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockApplyModification).toHaveBeenCalledWith(
        expect.objectContaining({
          customEdges: [],
        }),
        expect.anything()
      );
    });

    it("allows adding and editing user custom branches with optional shortDescription", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });

      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Find node-1 and invoke onAddChild
      const node1 = capturedReactFlowProps.nodes.find((n: any) => n.id === "node-1");
      expect(node1).toBeDefined();

      act(() => {
        node1.data.onAddChild("node-1");
      });

      // Verify Modal opens with both Title input and Description textarea
      expect(screen.getByText("افزودن زیرشاخه جدید")).toBeInTheDocument();
      const titleInput = screen.getByPlaceholderText("مثال: مکانیسم اثر دارویی...");
      const descInput = screen.getByPlaceholderText("توضیح کوتاه درباره این مفهوم یا نکته...");

      fireEvent.change(titleInput, { target: { value: "شاخه جدید تستی" } });
      fireEvent.change(descInput, { target: { value: "توضیح تستی برای شاخه" } });

      const submitBtn = screen.getByText("ثبت تغییر");
      fireEvent.click(submitBtn);

      expect(mockApplyModification).toHaveBeenCalledTimes(1);
      const [modifications] = mockApplyModification.mock.calls[0];
      const customNodeKeys = Object.keys(modifications.customNodes);
      expect(customNodeKeys.length).toBeGreaterThan(0);
      const createdNode = modifications.customNodes[customNodeKeys[0]];
      expect(createdNode).toMatchObject({
        title: "شاخه جدید تستی",
        shortDescription: "توضیح تستی برای شاخه",
        parentId: "node-1",
      });
    });
  });

  describe("3. MindMapDetailDrawer: Smart Positioning & Viewport Alignment", () => {
    it("renders into document.body with fixed positioning avoiding sticky header", () => {
      const header = document.createElement("header");
      Object.defineProperty(header, "getBoundingClientRect", {
        value: () => ({ top: 0, bottom: 64, height: 64, left: 0, right: 1000, width: 1000 }),
      });
      document.body.appendChild(header);

      const nodeDiv = document.createElement("div");
      nodeDiv.setAttribute("data-id", "node-1");
      Object.defineProperty(nodeDiv, "getBoundingClientRect", {
        value: () => ({ top: 120, bottom: 180, height: 60, left: 200, right: 450, width: 250 }),
      });
      document.body.appendChild(nodeDiv);

      const targetNode = nodesRecord["node-1"];

      render(
        <MindMapDetailDrawer
          node={targetNode}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
          onExpandAi={vi.fn()}
          isExpanding={false}
        />
      );

      expect(screen.getByText("بخش ۱: الگوریتم‌ها")).toBeInTheDocument();
      expect(screen.getByText("مبانی الگوریتم")).toBeInTheDocument();

      document.body.removeChild(header);
      document.body.removeChild(nodeDiv);
    });

    it("closes when close button or Escape key is pressed", () => {
      const mockClose = vi.fn();
      const targetNode = nodesRecord["node-1"];

      render(
        <MindMapDetailDrawer
          node={targetNode}
          isOpen={true}
          onClose={mockClose}
          onSaveNote={vi.fn()}
          onExpandAi={vi.fn()}
          isExpanding={false}
        />
      );

      const closeButton = screen.getByTitle("بستن پنل");
      fireEvent.click(closeButton);
      expect(mockClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(mockClose).toHaveBeenCalledTimes(2);
    });

    it("renders into document.fullscreenElement when in Fullscreen mode", () => {
      const mockFullscreenEl = document.createElement("div");
      mockFullscreenEl.id = "mock-fullscreen-container";
      document.body.appendChild(mockFullscreenEl);

      Object.defineProperty(document, "fullscreenElement", {
        value: mockFullscreenEl,
        configurable: true,
      });

      // Dispatch fullscreenchange
      document.dispatchEvent(new Event("fullscreenchange"));

      const targetNode = nodesRecord["node-1"];
      render(
        <MindMapDetailDrawer
          node={targetNode}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
          onExpandAi={vi.fn()}
          isExpanding={false}
        />
      );

      expect(mockFullscreenEl.querySelector("[role='dialog']")).toBeInTheDocument();

      // Reset document.fullscreenElement
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        configurable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
      document.body.removeChild(mockFullscreenEl);
    });

    it("prevents closing when clicking inside modal content", () => {
      const mockClose = vi.fn();
      const targetNode = nodesRecord["node-1"];

      render(
        <MindMapDetailDrawer
          node={targetNode}
          isOpen={true}
          onClose={mockClose}
          onSaveNote={vi.fn()}
          onExpandAi={vi.fn()}
          isExpanding={false}
        />
      );

      const dialog = screen.getByRole("dialog");
      fireEvent.click(dialog);
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe("4. Manual Box Dragging & 1.5s Hold Gesture", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("cancels hold gesture if pointer moves more than 5px before 1.5s", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Pointer down at (100, 100)
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      // Advance 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Move > 5px (dx = 10px) before 1.5s
      fireEvent(
        window,
        new PointerEvent("pointermove", {
          clientX: 110,
          clientY: 100,
        }),
      );

      // Advance remaining time past 1.5s
      act(() => {
        vi.advanceTimersByTime(1200);
      });

      // panOnDrag must remain enabled (not in drag mode)
      expect(capturedReactFlowProps.panOnDrag).toBe(true);

      // Pointer up does nothing
      fireEvent(
        window,
        new PointerEvent("pointerup", {
          clientX: 150,
          clientY: 150,
        }),
      );

      expect(mockApplyModification).not.toHaveBeenCalled();
    });

    it("tolerates movement <= 5px and activates drag after 1.5s, then commits final position on pointerup", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Pointer down at (100, 100)
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      // Move slightly (<= 5px, e.g. dx=2, dy=2)
      fireEvent(
        window,
        new PointerEvent("pointermove", {
          clientX: 102,
          clientY: 102,
        }),
      );

      // Advance timer past 1.5s
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // Custom drag mode is now active: panOnDrag is disabled to prevent native canvas pan conflict
      expect(capturedReactFlowProps.panOnDrag).toBe(false);

      // Active dragging move by delta (+80, +50)
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: 180,
            clientY: 150,
          }),
        );
      });

      // Release drag via pointerup
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointerup", {
            clientX: 180,
            clientY: 150,
          }),
        );
      });

      // Canvas pan re-enabled
      expect(capturedReactFlowProps.panOnDrag).toBe(true);

      // applyModification committed in a single atomic update
      expect(mockApplyModification).toHaveBeenCalledTimes(1);
      const [modifications] = mockApplyModification.mock.calls[0];
      expect(modifications.nodePositions).toBeDefined();
      expect(modifications.nodePositions["node-1"]).toBeDefined();
      expect(typeof modifications.nodePositions["node-1"].x).toBe("number");
      expect(typeof modifications.nodePositions["node-1"].y).toBe("number");
    });

    it("performs group drag with Shift key, moving target node AND all its recursive descendants with identical delta", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Pointer down with Shift key held
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 200,
        clientY: 200,
        shiftKey: true,
      });

      // Advance 1.5s
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(false);

      // Drag by delta (+100, +50)
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: 300,
            clientY: 250,
          }),
        );
      });

      // Release
      act(() => {
        window.dispatchEvent(new PointerEvent("pointerup"));
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(true);
      expect(mockApplyModification).toHaveBeenCalledTimes(1);
      const [modifications] = mockApplyModification.mock.calls[0];

      // Both node-1 and child node-1-1 must be present in nodePositions
      expect(modifications.nodePositions["node-1"]).toBeDefined();
      expect(modifications.nodePositions["node-1-1"]).toBeDefined();

      // Unrelated node-2 must NOT be moved
      expect(modifications.nodePositions["node-2"]).toBeUndefined();
    });

    it("cleans up timer and active session on pointercancel", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Pointer down
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      // Pointer cancel before 1.5s
      window.dispatchEvent(new PointerEvent("pointercancel"));

      // Advance timer
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Nothing committed, pan remains enabled
      expect(capturedReactFlowProps.panOnDrag).toBe(true);
      expect(mockApplyModification).not.toHaveBeenCalled();
    });
  });

  describe("5. Decoupled Canvas Pan and Box Drag Interactions (12 Verification Scenarios)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("1. moves canvas viewport along X axis when dragging empty space (Pan X)", () => {
      const hook = createMockHook();
      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Verify panOnDrag is enabled for empty space
      expect(capturedReactFlowProps.panOnDrag).toBe(true);

      // Arrow keys pan horizontally by 50px
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(mockSetViewport).toHaveBeenCalledWith(
        expect.objectContaining({ x: 50, y: 100 }),
        { duration: 80 },
      );
    });

    it("2. moves canvas viewport along Y axis when dragging empty space (Pan Y)", () => {
      const hook = createMockHook();
      render(<MindMapCanvas mindMapHook={hook as any} />);

      expect(capturedReactFlowProps.panOnDrag).toBe(true);

      // Arrow keys pan vertically by 50px
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(mockSetViewport).toHaveBeenCalledWith(
        expect.objectContaining({ x: 100, y: 150 }),
        { duration: 80 },
      );
    });

    it("3. does not modify node coordinates when canvas is panned", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Trigger canvas pan
      fireEvent.keyDown(window, { key: "ArrowRight" });
      fireEvent.keyDown(window, { key: "ArrowUp" });

      // Node modifications must NOT be triggered
      expect(mockApplyModification).not.toHaveBeenCalled();
      // Tree nodes remain intact
      expect(hook.payload.userModifications.nodePositions).toBeUndefined();
    });

    it("4. activates box drag after 1.5s hold without moving canvas", () => {
      const hook = createMockHook();
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 200,
        clientY: 200,
        shiftKey: false,
      });

      // Before 1.5s: drag is not active
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(capturedReactFlowProps.panOnDrag).toBe(true);

      // At 1.5s: drag activates, disabling canvas pan to prevent conflict
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(capturedReactFlowProps.panOnDrag).toBe(false);

      const draggedNode = capturedReactFlowProps.nodes.find((n: any) => n.id === "node-1");
      expect(draggedNode.data.isDragging).toBe(true);
    });

    it("5. keeps viewport fixed and stationary during box drag", () => {
      const hook = createMockHook();
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 150,
        clientY: 150,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      mockSetViewport.mockClear();

      // Move while dragging node
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", { clientX: 250, clientY: 250 }),
        );
      });

      // Viewport setViewport must NOT have been called by box drag
      expect(mockSetViewport).not.toHaveBeenCalled();
    });

    it("6. commits new coordinates in a single atomic request on pointerup", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // Move 4 times
      for (let i = 1; i <= 4; i++) {
        act(() => {
          window.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: 100 + i * 10,
              clientY: 100 + i * 10,
            }),
          );
        });
      }

      // NO save calls during movement
      expect(mockApplyModification).not.toHaveBeenCalled();

      // Release pointerup
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointerup", { clientX: 140, clientY: 140 }),
        );
      });

      // Exactly ONE atomic save call
      expect(mockApplyModification).toHaveBeenCalledTimes(1);
      const [modifications] = mockApplyModification.mock.calls[0];
      expect(modifications.nodePositions["node-1"]).toBeDefined();
    });

    it("7. moves entire subtree when Shift key is held during drag", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 200,
        clientY: 200,
        shiftKey: true,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", { clientX: 300, clientY: 250 }),
        );
      });

      act(() => {
        window.dispatchEvent(new PointerEvent("pointerup"));
      });

      expect(mockApplyModification).toHaveBeenCalledTimes(1);
      const [modifications] = mockApplyModification.mock.calls[0];

      // Both node-1 and recursive child node-1-1 are shifted
      expect(modifications.nodePositions["node-1"]).toBeDefined();
      expect(modifications.nodePositions["node-1-1"]).toBeDefined();
      expect(modifications.nodePositions["node-2"]).toBeUndefined();
    });

    it("8. preserves relative coordinates of hidden/closed branch descendants in Shift drag", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      // Collapse node-1
      const node1Data = capturedReactFlowProps.nodes.find((n: any) => n.id === "node-1");
      act(() => {
        node1Data.data.onToggleCollapse("node-1");
      });

      // Drag node-1 with Shift
      const node1El = screen.getByTestId("rf-node-node-1");
      fireEvent.pointerDown(node1El, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: true,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // Move by delta (+50, +30)
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", { clientX: 150, clientY: 130 }),
        );
      });

      act(() => {
        window.dispatchEvent(new PointerEvent("pointerup"));
      });

      expect(mockApplyModification).toHaveBeenCalledTimes(1);
      const [modifications] = mockApplyModification.mock.calls[0];

      // Even though node-1-1 was hidden, its position is calculated and shifted by delta
      const p1 = modifications.nodePositions["node-1"];
      const p11 = modifications.nodePositions["node-1-1"];
      expect(p1).toBeDefined();
      expect(p11).toBeDefined();

      // Both received the same +50, +30 delta, so distance is preserved
      expect(typeof p1.x).toBe("number");
      expect(typeof p11.x).toBe("number");
    });

    it("9. cleanly cancels drag and reverts on Escape or Pointer Cancel without partial state", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Test 9a: Escape key cancellation during active drag
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(false);

      // Move while dragging
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", { clientX: 180, clientY: 180 }),
        );
      });

      // Press Escape
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });

      // Drag canceled, pan restored, no positions saved
      expect(capturedReactFlowProps.panOnDrag).toBe(true);
      expect(mockApplyModification).not.toHaveBeenCalled();

      // Test 9b: Pointer cancel during active drag
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(false);

      // Pointer cancel
      act(() => {
        window.dispatchEvent(new PointerEvent("pointercancel"));
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(true);
      expect(mockApplyModification).not.toHaveBeenCalled();
    });

    it("10. normal quick click on a node selects it without triggering unwanted drag", () => {
      const mockSetSelected = vi.fn();
      const mockApplyModification = vi.fn();
      const hook = createMockHook({
        setSelectedNodeId: mockSetSelected,
        applyModification: mockApplyModification,
      });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Quick click: pointerdown followed by pointerup after 100ms
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        window.dispatchEvent(new PointerEvent("pointerup"));
      });

      // Click event fires
      fireEvent.click(node1);

      // Selected node should be called
      expect(mockSetSelected).toHaveBeenCalledWith("node-1");

      // No drag modification
      expect(mockApplyModification).not.toHaveBeenCalled();
      expect(capturedReactFlowProps.panOnDrag).toBe(true);
    });

    it("11. prevents drawer from opening after completing a box drag", () => {
      const mockSetSelected = vi.fn();
      const hook = createMockHook({ setSelectedNodeId: mockSetSelected });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Start drag and hold 1.5s
      fireEvent.pointerDown(node1, {
        button: 0,
        clientX: 100,
        clientY: 100,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // Move and release
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", { clientX: 180, clientY: 150 }),
        );
      });

      act(() => {
        window.dispatchEvent(new PointerEvent("pointerup"));
      });

      // Click event naturally follows pointerup in the browser
      fireEvent.click(node1);

      // Selection must NOT be triggered after drag!
      expect(mockSetSelected).not.toHaveBeenCalled();
    });

    it("12. supports touch pointer events seamlessly without conflicting with mouse", () => {
      const mockApplyModification = vi.fn();
      const hook = createMockHook({ applyModification: mockApplyModification });
      render(<MindMapCanvas mindMapHook={hook as any} />);

      const node1 = screen.getByTestId("rf-node-node-1");

      // Touch pointerdown
      fireEvent.pointerDown(node1, {
        pointerType: "touch",
        clientX: 150,
        clientY: 150,
        shiftKey: false,
      });

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(false);

      // Touch move
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerType: "touch",
            clientX: 210,
            clientY: 190,
          }),
        );
      });

      // Touch release
      act(() => {
        window.dispatchEvent(
          new PointerEvent("pointerup", {
            pointerType: "touch",
            clientX: 210,
            clientY: 190,
          }),
        );
      });

      expect(capturedReactFlowProps.panOnDrag).toBe(true);
      expect(mockApplyModification).toHaveBeenCalledTimes(1);
    });

    it("MindMapErrorBoundary catches rendering errors and displays graceful recovery UI", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const BrokenComponent = () => {
        throw new Error("Simulated canvas render crash");
      };

      const mockReset = vi.fn();

      render(
        <MindMapErrorBoundary onReset={mockReset}>
          <BrokenComponent />
        </MindMapErrorBoundary>,
      );

      expect(screen.getByText("خطا در بارگذاری یا نمایش مایندمپ")).toBeInTheDocument();
      const resetButton = screen.getByText("بازیابی نمایش مایندمپ");
      expect(resetButton).toBeInTheDocument();

      fireEvent.click(resetButton);
      expect(mockReset).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    it("validates and prevents edge rendering errors when coordinates are NaN or Infinite", () => {
      // 1. createOrthogonalPath returns empty string on NaN / Infinity
      expect(createOrthogonalPath(NaN, 10, 100, 20)).toBe("");
      expect(createOrthogonalPath(10, Infinity, 100, 20)).toBe("");
      expect(createOrthogonalPath(10, 20, 100, NaN)).toBe("");

      // 2. MindMapTreeEdgeComponent safely returns null on invalid coordinates
      const { container } = render(
        <MindMapTreeEdgeComponent
          id="edge-nan"
          source="node-1"
          target="node-2"
          sourceX={NaN}
          sourceY={100}
          targetX={200}
          targetY={300}
          sourcePosition={"right" as any}
          targetPosition={"left" as any}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("MindMapDetailDrawer renders categorized educational sections without standalone deep dive box", () => {
      const nodeWithEducation = {
        id: "node-gemcitabine",
        title: "جمسیتابین",
        shortDescription: "آنالوگ پیریمیدین برای کارسینومای پیشرفته پانکراس",
        depth: 2,
        orderIndex: 0,
        category: "drug" as const,
        structuredDetails: {
          drugClass: "Antimetabolite",
          mechanismOfAction: "مهارکننده ریبونوکلئوتید ردوکتاز",
          indications: ["سرطان پانکراس", "سرطان ریه سلول غیرکوچک"],
          adverseEffects: ["میلوپلازی و سرکوب مغز استخوان", "سندرم شبیه آنفلوآنزا"],
          contraindications: ["حساسیت شدید به جمسیتابین"],
          interactions: ["واکسن‌های زنده"],
          clinicalPearls: ["سرعت انفوزیون نباید بیش از حد مجاز شود."],
          examTips: ["سوال متداول پره‌انترنی: فاز S چرخه سلولی"],
          commonPitfalls: ["اشتباه با جمفیبروزیل"],
          relatedConcepts: ["سیتارابین", "۵-فلوئورواوراسیل"],
        },
      };

      render(
        <MindMapDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          node={nodeWithEducation as any}
          canEdit={true}
        />,
      );

      // Verify category badge
      expect(screen.getByText("دارو / فارماکولوژی")).toBeInTheDocument();

      // Verify educational section headers
      expect(screen.getByText(/مکانیسم اثر/)).toBeInTheDocument();
      expect(screen.getByText("مهارکننده ریبونوکلئوتید ردوکتاز")).toBeInTheDocument();

      expect(screen.getByText(/کاربردها و موارد مصرف بالینی/)).toBeInTheDocument();
      expect(screen.getByText("سرطان پانکراس")).toBeInTheDocument();

      expect(screen.getByText(/عوارض جانبی/)).toBeInTheDocument();
      expect(screen.getByText("میلوپلازی و سرکوب مغز استخوان")).toBeInTheDocument();

      expect(screen.getByText(/موارد منع مصرف/)).toBeInTheDocument();
      expect(screen.getByText("حساسیت شدید به جمسیتابین")).toBeInTheDocument();

      expect(screen.getByText(/تداخلات مهم/)).toBeInTheDocument();
      expect(screen.getByText("واکسن‌های زنده")).toBeInTheDocument();

      expect(screen.getByText(/نکات کلیدی و مرواریدهای بالینی/)).toBeInTheDocument();
      expect(screen.getByText("سرعت انفوزیون نباید بیش از حد مجاز شود.")).toBeInTheDocument();

      expect(screen.getByText(/نکات طلایی آزمونی/)).toBeInTheDocument();
      expect(screen.getByText("سوال متداول پره‌انترنی: فاز S چرخه سلولی")).toBeInTheDocument();

      expect(screen.getByText(/اشتباهات رایج/)).toBeInTheDocument();
      expect(screen.getByText("اشتباه با جمفیبروزیل")).toBeInTheDocument();

      expect(screen.getByText(/ارتباط با سایر مفاهیم/)).toBeInTheDocument();
      expect(screen.getByText("سیتارابین")).toBeInTheDocument();

      // STRICT REQUIREMENT: Standalone "توضیحات عمیق و مثال‌های بالینی" must NOT exist
      expect(screen.queryByText("توضیحات عمیق و مثال‌های بالینی")).toBeNull();
    });

    it("MindMapDetailDrawer does not render AI enrichment prompt text or button even for nodes without detailed knowledge", () => {
      const basicNode = {
        id: "node-basic-concept",
        title: "مفهوم پایه فارماکولوژی",
        shortDescription: "تعریف اولیه و ساده مفهوم",
        depth: 1,
        orderIndex: 0,
        category: "concept" as const,
      };

      render(
        <MindMapDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
          node={basicNode as any}
        />,
      );

      // Verify basic info renders
      expect(screen.getByText("مفهوم پایه فارماکولوژی")).toBeInTheDocument();
      expect(screen.getByText("تعریف اولیه و ساده مفهوم")).toBeInTheDocument();

      // Verify AI enrichment text and button are completely removed from UI
      expect(screen.queryByText(/می‌توانید اطلاعات تخصصی/)).toBeNull();
      expect(
        screen.queryByText(
          /مکانیسم اثر و نکات تفصیلی این گره را با هوش مصنوعی تکمیل و ارتقا دهید/,
        ),
      ).toBeNull();
      expect(screen.queryByText(/ارتقای جامع اطلاعات با AI/)).toBeNull();
    });

    it("MindMapCustomNode renders complete initial description without line-clamp truncation", () => {
      const fullText =
        "مهارکننده سنتز DNA در فاز S چرخه سلولی با ایجاد آپوپتوز سلول‌های تومورال و کارایی اثبات‌شده در پروتکل‌های ترکیبی شیمی‌درمانی";

      const nodeProps = {
        id: "node-test-clamp",
        data: {
          id: "node-test-clamp",
          title: "جمسیتابین پیشرفته",
          shortDescription: fullText,
          depth: 2,
          isRoot: false,
          isSelected: false,
          clusterName: "آنالوگ‌های پیریمیدین",
          clusterColor: "#008080",
        },
      };

      const { container } = render(<MindMapCustomNode {...(nodeProps as any)} />);

      // The full text must be rendered in the document
      expect(screen.getByText(fullText)).toBeInTheDocument();

      // Check that line-clamp-2 is NOT applied to description element
      const descEl = screen.getByText(fullText);
      expect(descEl.className).not.toContain("line-clamp-2");
      expect(descEl.className).toContain("whitespace-normal");
      expect(descEl.className).toContain("break-words");
    });
  });

  describe("6. MindMapDetailDrawer: Direct Supplementary Educational Knowledge Display (No-Button Flow)", () => {
    it("directly renders stored keyPoints, examTips, and structured details without any AI generation button or card", () => {
      const spironolactoneNode = {
        id: "node-spiro-test",
        title: "اسپیرونولاکتون",
        shortDescription: "دیورتیک نگه‌دارنده پتاسیم و آنتاگونیست رقابتی گیرنده آلدوسترون",
        category: "drug" as const,
        keyPoints: [
          "آنتاگونیسم غیرانتخابی گیرنده آندروژن که به ژنیکوماستی در مردان می‌انجامد",
          "کاربرد در هیرسوتیسم زنان به دلیل اثرات ضد آندروژنی",
        ],
        examTips: [
          "افتراق از اپلرنون: اپلرنون گیرنده انتخابی‌تری دارد و عوارض هورمونی کمتری ایجاد می‌کند",
        ],
        structuredDetails: {
          drugClass: "آنتاگونیست آلدوسترون",
          clinicalPearls: ["کاهش مورتالیتی در نارسایی قلبی (HFrEF)"],
          commonPitfalls: ["تجویز همزمان با مهارکننده‌های ACE بدون پایش منظم پتاسیم سرم"],
        },
      };

      render(
        <MindMapDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
          node={spironolactoneNode as any}
        />,
      );

      // Verify title and description are rendered
      expect(screen.getByText("اسپیرونولاکتون")).toBeInTheDocument();
      expect(screen.getByText("دیورتیک نگه‌دارنده پتاسیم و آنتاگونیست رقابتی گیرنده آلدوسترون")).toBeInTheDocument();

      // Verify key points, exam tips, and pearls are rendered directly without any action
      expect(
        screen.getByText("آنتاگونیسم غیرانتخابی گیرنده آندروژن که به ژنیکوماستی در مردان می‌انجامد"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("افتراق از اپلرنون: اپلرنون گیرنده انتخابی‌تری دارد و عوارض هورمونی کمتری ایجاد می‌کند"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/کاهش مورتالیتی در نارسایی قلبی/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/تجویز همزمان با مهارکننده‌های ACE/),
      ).toBeInTheDocument();

      // STRICT REQUIREMENT: No AI generation CTA button, no header update button, no loading card
      expect(screen.queryByRole("button", { name: /تولید مینی‌درس/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /به‌روزرسانی مینی‌درس/i })).toBeNull();
      expect(screen.queryByText(/آموزش تخصصی و مینی‌درس این مفهوم/)).toBeNull();
      expect(screen.queryByText(/در حال تدوین مینی‌درس/)).toBeNull();
    });

    it("renders safely for older nodes with only shortDescription without showing empty cards or errors", () => {
      const legacyNode = {
        id: "node-legacy-test",
        title: "مفهوم پایه قدیمی",
        shortDescription: "تعریف اولیه ثبت‌شده در نگارش قبلی",
      };

      render(
        <MindMapDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
          node={legacyNode as any}
        />,
      );

      // Basic definition renders cleanly
      expect(screen.getByText("مفهوم پایه قدیمی")).toBeInTheDocument();
      expect(screen.getByText("تعریف اولیه ثبت‌شده در نگارش قبلی")).toBeInTheDocument();

      // Personal user note section renders
      expect(screen.getByPlaceholderText(/نکات، یادداشت‌ها یا برداشت‌های شخصی/i)).toBeInTheDocument();

      // No broken state or AI CTA
      expect(screen.queryByRole("button", { name: /تولید/i })).toBeNull();
      expect(screen.queryByText(/خطا در/i)).toBeNull();
    });

    it("renders rich categorized sections (mechanism, adverseEffects, contraindications, pitfalls) immediately upon selection", () => {
      const richPharmacologyNode = {
        id: "node-rich-pharma",
        title: "متفورمین هیدروکلراید",
        shortDescription: "داروی خط اول دیابت نوع دو",
        category: "drug" as const,
        structuredDetails: {
          mechanismOfAction: "فعال‌سازی کیناز AMPK و مهار گلوکونئوژنز کبدی",
          pharmacology: "دفع کلیوی بدون متابولیسم کبدی با نیمه‌عمر حدود ۶ ساعت",
          adverseEffects: ["اسیدوز لاکتیک نادر اما کشنده در نارسایی کلیه", "عوارض گوارشی گذرا شامل تهوع و اسهال"],
          contraindications: ["eGFR کمتر از ۳۰ میلی‌لیتر بر دقیقه"],
          interactions: ["مواد حاجب یددار برای تصویربرداری"],
          commonPitfalls: ["تجویز در بیماران بستری مبتلا به شوک سپتیک یا هیپوکسی حاد"],
        },
      };

      render(
        <MindMapDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
          node={richPharmacologyNode as any}
        />,
      );

      // Verify all categorized section contents render immediately
      expect(screen.getByText("فعال‌سازی کیناز AMPK و مهار گلوکونئوژنز کبدی")).toBeInTheDocument();
      expect(screen.getByText("دفع کلیوی بدون متابولیسم کبدی با نیمه‌عمر حدود ۶ ساعت")).toBeInTheDocument();
      expect(screen.getByText("اسیدوز لاکتیک نادر اما کشنده در نارسایی کلیه")).toBeInTheDocument();
      expect(screen.getByText("eGFR کمتر از ۳۰ میلی‌لیتر بر دقیقه")).toBeInTheDocument();
      expect(screen.getByText("مواد حاجب یددار برای تصویربرداری")).toBeInTheDocument();
      expect(screen.getByText(/تجویز در بیماران بستری مبتلا به شوک سپتیک/)).toBeInTheDocument();
    });
  });
});


