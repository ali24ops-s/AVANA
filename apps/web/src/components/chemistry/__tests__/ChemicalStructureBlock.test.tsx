import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChemicalStructureBlock } from "../ChemicalStructureBlock.js";
import type { ChemicalStructure } from "@avana/domain";

describe("ChemicalStructureBlock Component Suite", () => {
  it("renders Lidocaine structure with metadata, formula, and SAR points", () => {
    const lidocaine: ChemicalStructure = {
      id: "lidocaine",
      compoundName: "لیدوکائین (Lidocaine)",
      smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
      formula: "C14H22N2O",
      molecularWeight: 234.34,
      drugClass: "بی‌حس‌کننده موضعی آمیدی",
      sarHighlights: [
        {
          feature: "پیوند آمیدی",
          description: "پایداری بالاتر نسبت به استرها در برابر هیدرولیز",
        },
      ],
    };

    const { container } = render(<ChemicalStructureBlock structure={lidocaine} />);

    expect(screen.getByText("لیدوکائین (Lidocaine)")).toBeInTheDocument();
    expect(screen.getByText("بی‌حس‌کننده موضعی آمیدی")).toBeInTheDocument();
    expect(screen.getByText("C14H22N2O")).toBeInTheDocument();
    expect(screen.getByText("پیوند آمیدی:")).toBeInTheDocument();
    expect(
      screen.getByText("پایداری بالاتر نسبت به استرها در برابر هیدرولیز"),
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders Procaine structure", () => {
    const procaine: ChemicalStructure = {
      id: "procaine",
      compoundName: "پروکائین (Procaine)",
      smiles: "CCN(CC)CCOC(=O)c1ccc(N)cc1",
      formula: "C13H20N2O2",
      molecularWeight: 236.31,
      drugClass: "بی‌حس‌کننده موضعی استری",
    };

    render(<ChemicalStructureBlock structure={procaine} />);

    expect(screen.getByText("پروکائین (Procaine)")).toBeInTheDocument();
    expect(screen.getByText("بی‌حس‌کننده موضعی استری")).toBeInTheDocument();
    expect(screen.getByText("C13H20N2O2")).toBeInTheDocument();
  });

  it("shows needsReview badge when validation detects discrepancies", () => {
    const uncertainMolecule: ChemicalStructure = {
      compoundName: "مولکول نیازمند بررسی",
      smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
      formula: "C5H5", // formula mismatch
      molecularWeight: 100,
    };

    render(<ChemicalStructureBlock structure={uncertainMolecule} />);

    expect(screen.getByText("نیازمند بازبینی علمی")).toBeInTheDocument();
  });

  it("renders different sized molecules (e.g. multi-ring tall molecules and horizontal chains) with responsive SVG", async () => {
    // 1. Horizontal chain (Ranitidine)
    const ranitidine: ChemicalStructure = {
      compoundName: "رانیتیدین (Ranitidine)",
      smiles: "CNC(=C[N+](=O)[O-])NCCSCc1ccc(CN(C)C)o1",
      formula: "C13H22N4O3S",
    };
    const { container: c1 } = render(<ChemicalStructureBlock structure={ranitidine} />);
    expect(screen.getByText("رانیتیدین (Ranitidine)")).toBeInTheDocument();
    const svg1 = c1.querySelector("svg");
    expect(svg1).toBeInTheDocument();

    // 2. Multi-ring / tall complex molecule (Morphine)
    const morphine: ChemicalStructure = {
      compoundName: "مورفین (Morphine)",
      smiles: "CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O",
      formula: "C17H19NO3",
    };
    const { container: c2 } = render(<ChemicalStructureBlock structure={morphine} />);
    expect(screen.getByText("مورفین (Morphine)")).toBeInTheDocument();
    const svg2 = c2.querySelector("svg");
    expect(svg2).toBeInTheDocument();
  });
});
