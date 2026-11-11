import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MindMapCustomNode, type MindMapCustomNodeData } from "../components/mindmap/MindMapCustomNode.js";
import { MindMapDetailDrawer } from "../components/mindmap/MindMapDetailDrawer.js";
import type { MindMapNodeBase, MindMapChemicalStructure } from "@avana/contracts";

// Mock ReactFlow handles since @xyflow/react Handle requires a ReactFlowProvider
vi.mock("@xyflow/react", () => ({
  Handle: ({ id, position }: { id?: string; position?: string }) => (
    <div data-testid={`mock-handle-${id || position}`} />
  ),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom",
  },
}));

// Mock ChemicalStructureBlock to verify it receives props without requiring actual canvas/DOM SmilesDrawer
vi.mock("../components/chemistry/ChemicalStructureBlock.js", () => ({
  ChemicalStructureBlock: ({ structure, showSarHighlights }: { structure: unknown; showSarHighlights?: boolean }) => (
    <div data-testid="mock-chemical-structure-block" data-sar={String(showSarHighlights)}>
      {(structure as { compoundName: string }).compoundName}
      {(structure as { formula?: string }).formula}
    </div>
  ),
}));

describe("AVANA MindMap Chemical Structure Frontend Rendering Suite", () => {
  const validAspirinStructure: MindMapChemicalStructure = {
    compoundName: "آسپرین",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
    formula: "C9H8O4",
    molecularWeight: 180.16,
    iupacName: "2-acetyloxybenzoic acid",
    drugClass: "NSAID",
    isValidated: true,
    confidence: "high",
  };

  const createNodeData = (overrides?: Partial<MindMapCustomNodeData>): MindMapCustomNodeData => ({
    id: "aspirin-node",
    title: "آسپرین (Aspirin)",
    shortDescription: "مهارکننده برگشت‌ناپذیر سیکلواکسیژناز ۱ و ۲",
    depth: 2,
    hasChildren: false,
    childrenCount: 0,
    isCollapsed: false,
    side: "right",
    calculatedWidth: 240,
    calculatedHeight: 80,
    ...overrides,
  });

  describe("1. MindMapCustomNode Canvas Indicator Rendering", () => {
    it("renders FlaskConical indicator when chemicalStatus is enriched with high confidence validated structure", () => {
      const data = createNodeData({
        chemicalStatus: "enriched",
        chemicalStructure: validAspirinStructure,
      });

      render(<MindMapCustomNode data={data} />);

      const indicator = screen.getByTestId("chemical-node-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute("title", "ساختار شیمیایی: آسپرین (C9H8O4)");
      expect(indicator).toHaveAttribute("aria-label", "دارای ساختار شیمیایی");
    });

    it("does NOT render indicator when node is root (depth === 0) even if chemical data is present", () => {
      const data = createNodeData({
        depth: 0,
        chemicalStatus: "enriched",
        chemicalStructure: validAspirinStructure,
      });

      render(<MindMapCustomNode data={data} />);

      expect(screen.queryByTestId("chemical-node-indicator")).not.toBeInTheDocument();
    });

    it("does NOT render indicator when chemicalStatus is not 'enriched' (needs_review, failed, not_required)", () => {
      const statuses = ["needs_review", "failed", "not_required", "not_checked"] as const;

      for (const status of statuses) {
        cleanup();
        const data = createNodeData({
          chemicalStatus: status,
          chemicalStructure: validAspirinStructure,
        });

        render(<MindMapCustomNode data={data} />);
        expect(screen.queryByTestId("chemical-node-indicator")).not.toBeInTheDocument();
      }
    });

    it("does NOT render indicator when structure is NOT validated (isValidated === false)", () => {
      const data = createNodeData({
        chemicalStatus: "enriched",
        chemicalStructure: {
          ...validAspirinStructure,
          isValidated: false,
        },
      });

      render(<MindMapCustomNode data={data} />);
      expect(screen.queryByTestId("chemical-node-indicator")).not.toBeInTheDocument();
    });

    it("does NOT render indicator when structure confidence is not 'high' (medium or low)", () => {
      for (const conf of ["medium", "low"] as const) {
        cleanup();
        const data = createNodeData({
          chemicalStatus: "enriched",
          chemicalStructure: {
            ...validAspirinStructure,
            confidence: conf,
          },
        });

        render(<MindMapCustomNode data={data} />);
        expect(screen.queryByTestId("chemical-node-indicator")).not.toBeInTheDocument();
      }
    });

    it("does NOT render indicator when node has no chemicalStructure", () => {
      const data = createNodeData({
        chemicalStatus: undefined,
        chemicalStructure: undefined,
      });

      render(<MindMapCustomNode data={data} />);
      expect(screen.queryByTestId("chemical-node-indicator")).not.toBeInTheDocument();
    });

    it("preserves exact calculated geometry without any dimension mutation", () => {
      const data = createNodeData({
        chemicalStatus: "enriched",
        chemicalStructure: validAspirinStructure,
        calculatedWidth: 260,
        calculatedHeight: 88,
      });

      const { container } = render(<MindMapCustomNode data={data} />);
      const nodeElement = container.firstElementChild as HTMLElement;

      expect(nodeElement.style.width).toBe("260px");
      expect(nodeElement.style.height).toBe("88px");
    });
  });

  describe("2. MindMapDetailDrawer Chemical Structure Section", () => {
    const createDrawerNode = (overrides?: Partial<MindMapNodeBase>): MindMapNodeBase => ({
      id: "aspirin-node",
      parentId: "nsaid-group",
      title: "آسپرین (Aspirin)",
      shortDescription: "مهارکننده سیکلواکسیژناز با اثرات ضدالتهابی و ضدپلاکت",
      category: "drug",
      ...overrides,
    });

    it("renders dedicated 'ساختار شیمیایی' section with ChemicalStructureBlock when node is enriched", () => {
      const node = createDrawerNode({
        chemicalStatus: "enriched",
        chemicalStructure: validAspirinStructure,
      });

      render(
        <MindMapDetailDrawer
          node={node}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
        />,
      );

      const section = screen.getByTestId("mindmap-chemical-section");
      expect(section).toBeInTheDocument();
      expect(section).toHaveTextContent("ساختار شیمیایی");

      const block = screen.getByTestId("mock-chemical-structure-block");
      expect(block).toBeInTheDocument();
      expect(block).toHaveTextContent("آسپرین");
      expect(block).toHaveAttribute("data-sar", "true");
    });

    it("does NOT render 'ساختار شیمیایی' section when chemicalStructure is absent", () => {
      const node = createDrawerNode({
        chemicalStatus: "not_required",
        chemicalStructure: undefined,
      });

      render(
        <MindMapDetailDrawer
          node={node}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
        />,
      );

      expect(screen.queryByTestId("mindmap-chemical-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-chemical-structure-block")).not.toBeInTheDocument();
    });

    it("does NOT render 'ساختار شیمیایی' section when status is 'needs_review', 'failed', or undefined", () => {
      for (const status of ["needs_review", "failed", undefined] as const) {
        cleanup();
        const node = createDrawerNode({
          chemicalStatus: status,
          chemicalStructure: validAspirinStructure,
        });

        render(
          <MindMapDetailDrawer
            node={node}
            isOpen={true}
            onClose={vi.fn()}
            onSaveNote={vi.fn()}
          />,
        );

        expect(screen.queryByTestId("mindmap-chemical-section")).not.toBeInTheDocument();
      }
    });

    it("does NOT render 'ساختار شیمیایی' section when structure is not validated or confidence is low", () => {
      const node = createDrawerNode({
        chemicalStatus: "enriched",
        chemicalStructure: {
          ...validAspirinStructure,
          isValidated: false,
        },
      });

      render(
        <MindMapDetailDrawer
          node={node}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
        />,
      );

      expect(screen.queryByTestId("mindmap-chemical-section")).not.toBeInTheDocument();
    });
  });

  describe("3. Real-world Medicinal Chemistry Scenario: Dedicated Structure vs Process Sibling", () => {
    it("renders chemical indicator and drawer section on dedicated 'ساختار مولکولی' node, but not on 'مکانیسم اثر' or 'فارماکوکینتیک'", () => {
      // 1. Dedicated structure child node
      const structNodeData = createNodeData({
        id: "node-aspirin-struct",
        title: "ساختار مولکولی",
        depth: 2,
        chemicalStatus: "enriched",
        chemicalStructure: validAspirinStructure,
      });

      render(<MindMapCustomNode data={structNodeData} />);
      const indicator = screen.getByTestId("chemical-node-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute("title", "ساختار شیمیایی: آسپرین (C9H8O4)");

      // Drawer for dedicated structure child
      const structDrawerNode: MindMapNodeBase = {
        id: "node-aspirin-struct",
        parentId: "node-aspirin-main",
        title: "ساختار مولکولی",
        shortDescription: "ساختار استیل سالیسیلیک اسید",
        keyPoints: [],
        examTips: [],
        examples: [],
        sortOrder: 1,
        chemicalStatus: "enriched",
        chemicalStructure: validAspirinStructure,
      };

      cleanup();
      render(
        <MindMapDetailDrawer
          node={structDrawerNode}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
        />,
      );

      expect(screen.getByTestId("mindmap-chemical-section")).toBeInTheDocument();
      const mockBlock = screen.getByTestId("mock-chemical-structure-block");
      expect(mockBlock).toBeInTheDocument();
      expect(mockBlock).toHaveTextContent("آسپرین");
      expect(mockBlock).toHaveTextContent("C9H8O4");

      // 2. Process sibling node: 'مکانیسم اثر'
      cleanup();
      const mechNodeData = createNodeData({
        id: "node-aspirin-mech",
        title: "مکانیسم اثر مهار کوکس",
        depth: 2,
        chemicalStatus: "not_required",
      });

      render(<MindMapCustomNode data={mechNodeData} />);
      expect(screen.queryByTestId("chemical-node-indicator")).not.toBeInTheDocument();

      const mechDrawerNode: MindMapNodeBase = {
        id: "node-aspirin-mech",
        parentId: "node-aspirin-main",
        title: "مکانیسم اثر مهار کوکس",
        shortDescription: "مهار غیرقابل بازگشت آنزیم سیکلواکسیژناز",
        keyPoints: [],
        examTips: [],
        examples: [],
        sortOrder: 2,
        chemicalStatus: "not_required",
      };

      cleanup();
      render(
        <MindMapDetailDrawer
          node={mechDrawerNode}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
        />,
      );

      expect(screen.queryByTestId("mindmap-chemical-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-chemical-structure-block")).not.toBeInTheDocument();
    });
  });

  describe("4. Related Chemicals Rendering (Category Nodes & Concept Nodes)", () => {
    const ampicillinStructure: MindMapChemicalStructure = {
      referenceCompoundId: "ampicillin",
      canonicalName: "Ampicillin",
      displayName: "آمپی‌سیلین (Ampicillin)",
      compoundName: "آمپی‌سیلین",
      smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)C(c3ccccc3)N)C(=O)O)C",
      formula: "C16H19N3O4S",
      molecularWeight: 349.4,
      drugClass: "Aminopenicillin",
      isValidated: true,
      confidence: "high",
      relationType: "related_chemical",
    };

    const amoxicillinStructure: MindMapChemicalStructure = {
      referenceCompoundId: "amoxicillin",
      canonicalName: "Amoxicillin",
      displayName: "آموکسی‌سیلین (Amoxicillin)",
      compoundName: "آموکسی‌سیلین",
      smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)C(c3ccc(cc3)O)N)C(=O)O)C",
      formula: "C16H19N3O5S",
      molecularWeight: 365.4,
      drugClass: "Aminopenicillin",
      isValidated: true,
      confidence: "high",
      relationType: "related_chemical",
    };

    it("renders indicator on category node when relatedChemicals are present with chemicalStatus enriched", () => {
      const data = createNodeData({
        id: "node-aminopenicillins",
        title: "آمینوپنی‌سیلین‌ها",
        nodeRole: "category",
        chemicalStatus: "enriched",
        relatedChemicals: [ampicillinStructure, amoxicillinStructure],
      });

      render(<MindMapCustomNode data={data} />);

      const indicator = screen.getByTestId("chemical-node-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute("title", "ترکیبات شیمیایی مرتبط: آمپی‌سیلین (Ampicillin)، آموکسی‌سیلین (Amoxicillin)");
    });

    it("renders dedicated related chemicals section with multiple ChemicalStructureBlock cards and scientific relation badges in drawer", () => {
      const categoryNode: MindMapNodeBase = {
        id: "node-aminopenicillins",
        parentId: "root",
        title: "آمینوپنی‌سیلین‌ها",
        nodeRole: "category",
        shortDescription: "شامل آمپی‌سیلین و آموکسی‌سیلین با طیف گسترده‌تر",
        keyPoints: [],
        examTips: [],
        examples: [],
        sortOrder: 1,
        chemicalStatus: "enriched",
        relatedChemicals: [
          {
            ...ampicillinStructure,
            relationType: "class_member",
            provenanceField: "shortDescription",
          },
          {
            ...amoxicillinStructure,
            relationType: "combination_component",
            educationalNote: "جزء بتالاکتام در فرمولاسیون کوآموکسی‌کلاو در کنار کلاوولانات.",
          },
        ],
      };

      render(
        <MindMapDetailDrawer
          node={categoryNode}
          isOpen={true}
          onClose={vi.fn()}
          onSaveNote={vi.fn()}
        />,
      );

      const section = screen.getByTestId("mindmap-related-chemicals-section");
      expect(section).toBeInTheDocument();
      expect(section).toHaveTextContent("ترکیبات شیمیایی مرتبط (۲)");

      const blocks = screen.getAllByTestId("mock-chemical-structure-block");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toHaveTextContent("آمپی‌سیلین");
      expect(blocks[1]).toHaveTextContent("آموکسی‌سیلین");

      // Verify scientific relation badges
      const badges = screen.getAllByTestId("chemical-relation-badge");
      expect(badges).toHaveLength(2);
      expect(badges[0]).toHaveTextContent("عضو رده دارویی");
      expect(badges[0]).toHaveAttribute("data-relation-type", "class_member");

      expect(badges[1]).toHaveTextContent("جزء فرمولاسیون ترکیبی");
      expect(badges[1]).toHaveAttribute("data-relation-type", "combination_component");

      // Verify educational note is displayed
      expect(screen.getByText(/کوآموکسی‌کلاو/)).toBeInTheDocument();
    });
  });
});


