/**
 * Type-Safe Geometry Adapter for SmilesDrawer Internal Graph.
 *
 * Encapsulates dependency internals and extracts atom coordinates,
 * bond midpoints, normal vectors, and ChemDraw-proportional lone pairs
 * with deterministic anchor points for reaction mechanisms.
 */

export interface LonePairGeometry {
  /** 0-based deterministic index of the lone pair on this atom */
  index: number;
  /** Anchor point (midpoint between the two dots) for electron-pushing arrow origins */
  x: number;
  y: number;
  /** Angular direction in radians from atom center to lone pair anchor */
  angle: number;
  /** Coordinates of the first dot */
  dot1: { x: number; y: number };
  /** Coordinates of the second dot */
  dot2: { x: number; y: number };
}

export interface AtomGeometry {
  index: number;
  element: string;
  x: number;
  y: number;
  charge: number;
  hydrogenCount: number;
  isAromatic: boolean;
  /** Number of confirmed non-bonding lone pairs */
  lonePairsCount: number;
  /** Geometric positions and anchors for each lone pair */
  lonePairs: LonePairGeometry[];
  /** Neighbor atom indices connected by bonds */
  neighborIndices: number[];
}

export interface BondGeometry {
  atom1: number;
  atom2: number;
  order: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midpointX: number;
  midpointY: number;
  normalX: number;
  normalY: number;
  length: number;
}

export interface MoleculeGeometry {
  atoms: AtomGeometry[];
  bonds: BondGeometry[];
  /** Proportional reference bond length of the molecule, used for ChemDraw-like scaling */
  averageBondLength: number;
}

interface SmilesDrawerVertex {
  id: number;
  position: { x: number; y: number };
  value: {
    idx?: number;
    element: string;
    charge?: number;
    bondCount?: number;
    isPartOfAromaticRing?: boolean;
    bracket?: {
      element?: string;
      charge?: number;
      hcount?: number | null;
    } | null;
  };
  neighbours?: number[];
}

interface SmilesDrawerEdge {
  id: number;
  sourceId: number;
  targetId: number;
  weight?: number;
  bondType?: string;
}

interface SmilesDrawerGraph {
  vertices: SmilesDrawerVertex[];
  edges: SmilesDrawerEdge[];
}

interface SvgDrawerWithPreprocessor {
  preprocessor?: {
    graph?: SmilesDrawerGraph;
  };
}

/**
 * Computes confirmed lone pairs count for a specific atom using chemical valency,
 * formal charge, explicit/implicit hydrogens, and bond topology.
 *
 * Conservative: Returns 0 for any unverified, hypervalent, or ambiguous atom.
 */
function computeConfirmedLonePairsCount(
  element: string,
  charge: number,
  sumBondOrders: number,
  hCount: number,
  isAromatic: boolean,
): number {
  const el = element.toUpperCase();

  // 1. Halogens (F, Cl, Br, I)
  if (el === "F" || el === "CL" || el === "BR" || el === "I") {
    // Halide ion (e.g. [Br-], [Cl-])
    if (charge === -1 && sumBondOrders === 0 && hCount === 0) return 4;
    // Neutral single-bonded halogen (e.g. -Br, -Cl)
    if (charge === 0 && sumBondOrders === 1) return 3;
    return 0;
  }

  // 2. Oxygen (O)
  if (el === "O") {
    // Carbonyl / Imine double-bonded oxygen (=O)
    if (charge === 0 && sumBondOrders === 2 && hCount === 0) return 2;
    // Hydroxyl or ether (-O-, -OH)
    if (charge === 0 && sumBondOrders + hCount === 2) return 2;
    // Alkoxide, carboxylate or hydroxide ion ([O-], [OH-])
    if (charge === -1 && sumBondOrders + hCount === 1) return 3;
    // Isolated oxide ion ([O2-])
    if (charge === -2 && sumBondOrders === 0 && hCount === 0) return 4;
    // Oxonium ion ([O+])
    if (charge === 1 && sumBondOrders + hCount === 3) return 1;
    // Aromatic furan-like oxygen
    if (isAromatic && sumBondOrders >= 2) return 1;
    return 0;
  }

  // 3. Nitrogen (N)
  if (el === "N") {
    // Neutral trivalent amine / ammonia (-NH2, -NH-, -NR2, NH3)
    if (charge === 0 && sumBondOrders + hCount === 3) return 1;
    // Neutral nitrile (-C≡N)
    if (charge === 0 && sumBondOrders === 3 && hCount === 0) return 1;
    // Pyridine-type aromatic nitrogen (orthogonal sp2 lone pair)
    if (isAromatic && charge === 0 && hCount === 0) return 1;
    // Pyrrole-type aromatic nitrogen (lone pair delocalized in pi ring)
    if (isAromatic && (hCount > 0 || sumBondOrders > 2)) return 0;
    // Anionic amide ([N-], e.g. [NH2-])
    if (charge === -1 && sumBondOrders + hCount === 2) return 2;
    // Quaternary ammonium or nitro ([N+])
    if (charge === 1) return 0;
    return 0;
  }

  // 4. Sulfur (S)
  if (el === "S") {
    // Divalent sulfide or thiol (-S-, -SH)
    if (charge === 0 && sumBondOrders + hCount === 2) return 2;
    // Thiolate ion ([S-])
    if (charge === -1 && sumBondOrders + hCount === 1) return 3;
    // Sulfonium ([S+])
    if (charge === 1 && sumBondOrders + hCount === 3) return 1;
    // Thiophene aromatic sulfur
    if (isAromatic && sumBondOrders >= 2) return 1;
    // Sulfoxide (>S=O)
    if (charge === 0 && sumBondOrders === 4 && hCount === 0) return 1;
    return 0;
  }

  // 5. Carbon (C)
  if (el === "C") {
    // Carbanion ([C-], e.g. enolate carbanion [CH2-]C(=O)...)
    if (charge === -1 && sumBondOrders + hCount === 3) return 1;
    return 0;
  }

  return 0;
}

/**
 * Computes deterministic geometric positions and anchor points for an atom's lone pairs,
 * scaling strictly with the molecule's bond length.
 */
function computeLonePairGeometries(
  atomPos: { x: number; y: number },
  lonePairsCount: number,
  neighborBonds: Array<{ x: number; y: number }>,
  hCount: number,
  referenceBondLength: number,
): LonePairGeometry[] {
  if (lonePairsCount <= 0) return [];

  // ChemDraw-proportional dimensions based on current bond scale
  const rOffset = Math.max(10, referenceBondLength * 0.65);
  const dotSpacing = Math.max(3.2, referenceBondLength * 0.22);

  // Extract unit vectors and angles of connected bonds
  const bondAngles: number[] = [];
  for (const n of neighborBonds) {
    const dx = n.x - atomPos.x;
    const dy = n.y - atomPos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.001) {
      bondAngles.push(Math.atan2(dy, dx));
    }
  }

  const angles: number[] = [];

  // Case 0: Isolated atom with no connected heavy bonds (e.g. [OH-], [Br-], [Cl-])
  if (bondAngles.length === 0) {
    if (hCount > 0) {
      // Element label has appended "H" or "H2" extending to the right (+x),
      // so position lone pairs away from text: Top (-π/2), Left (π), Bottom (π/2)
      if (lonePairsCount === 1) angles.push(Math.PI);
      else if (lonePairsCount === 2) angles.push(-Math.PI / 2, Math.PI / 2);
      else if (lonePairsCount === 3) angles.push(-Math.PI / 2, Math.PI, Math.PI / 2);
      else angles.push(-Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 2);
    } else {
      // Symmetrical distribution around the atom
      const step = (Math.PI * 2) / lonePairsCount;
      const start = -Math.PI / 2; // start from top
      for (let i = 0; i < lonePairsCount; i++) {
        angles.push(start + i * step);
      }
    }
  }
  // Case 1: Terminal atom with exactly 1 bond (e.g. -Br, -Cl, =O, -O-)
  else if (bondAngles.length === 1) {
    const bondAngle = bondAngles[0];
    const opp = bondAngle + Math.PI;

    if (lonePairsCount === 1) {
      angles.push(opp);
    } else if (lonePairsCount === 2) {
      angles.push(opp - 0.7, opp + 0.7); // ±40 deg
    } else if (lonePairsCount === 3) {
      angles.push(opp - 1.15, opp, opp + 1.15); // ±66 deg and central
    } else {
      angles.push(opp - 1.57, opp - 0.52, opp + 0.52, opp + 1.57);
    }
  }
  // Case 2: Divalent atom with 2 bonds (e.g. -O-, -S-)
  else if (bondAngles.length === 2) {
    const u1x = Math.cos(bondAngles[0]);
    const u1y = Math.sin(bondAngles[0]);
    const u2x = Math.cos(bondAngles[1]);
    const u2y = Math.sin(bondAngles[1]);

    const sumX = u1x + u2x;
    const sumY = u1y + u2y;
    let extAngle: number;
    if (Math.hypot(sumX, sumY) < 0.05) {
      extAngle = bondAngles[0] + Math.PI / 2;
    } else {
      extAngle = Math.atan2(-sumY, -sumX);
    }

    if (lonePairsCount === 1) {
      angles.push(extAngle);
    } else if (lonePairsCount === 2) {
      angles.push(extAngle - 0.6, extAngle + 0.6); // ±34 deg
    } else {
      angles.push(extAngle - 1.0, extAngle, extAngle + 1.0);
    }
  }
  // Case 3: Trivalent or higher (e.g. :NR3)
  else {
    const sorted = [...bondAngles].map((a) => (a < 0 ? a + Math.PI * 2 : a)).sort((a, b) => a - b);
    let maxGap = 0;
    let gapBisector = 0;

    for (let i = 0; i < sorted.length; i++) {
      const nextIdx = (i + 1) % sorted.length;
      let gap = sorted[nextIdx] - sorted[i];
      if (gap < 0) gap += Math.PI * 2;
      if (gap > maxGap) {
        maxGap = gap;
        gapBisector = sorted[i] + gap / 2;
      }
    }

    if (lonePairsCount === 1) {
      angles.push(gapBisector);
    } else {
      angles.push(gapBisector - 0.5, gapBisector + 0.5);
    }
  }

  // Construct coordinates for each lone pair
  const result: LonePairGeometry[] = [];
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const anchorX = atomPos.x + rOffset * cosA;
    const anchorY = atomPos.y + rOffset * sinA;

    // Tangent vector perpendicular to radial line
    const tx = -sinA;
    const ty = cosA;

    result.push({
      index: i,
      x: anchorX,
      y: anchorY,
      angle,
      dot1: {
        x: anchorX + (dotSpacing / 2) * tx,
        y: anchorY + (dotSpacing / 2) * ty,
      },
      dot2: {
        x: anchorX - (dotSpacing / 2) * tx,
        y: anchorY - (dotSpacing / 2) * ty,
      },
    });
  }

  return result;
}

/**
 * Extracts comprehensive molecule geometry, bonds, and ChemDraw-proportional lone pairs
 * from a SmilesDrawer SvgDrawer instance after draw() has executed.
 */
export function extractMoleculeGeometry(
  drawerInstance: unknown,
): MoleculeGeometry | null {
  if (!drawerInstance || typeof drawerInstance !== "object") {
    return null;
  }

  const drawer = drawerInstance as SvgDrawerWithPreprocessor;
  const graph = drawer.preprocessor?.graph;

  if (!graph || !Array.isArray(graph.vertices)) {
    return null;
  }

  // 1. First pass: extract bonds and calculate reference bond length
  const bonds: BondGeometry[] = [];
  let totalBondLength = 0;

  if (Array.isArray(graph.edges)) {
    for (const edge of graph.edges) {
      const v1 = graph.vertices[edge.sourceId];
      const v2 = graph.vertices[edge.targetId];
      if (v1 && v2 && v1.position && v2.position) {
        const x1 = v1.position.x;
        const y1 = v1.position.y;
        const x2 = v2.position.x;
        const y2 = v2.position.y;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        const order =
          edge.weight === 2 || edge.bondType === "="
            ? 2
            : edge.weight === 3 || edge.bondType === "#"
              ? 3
              : edge.bondType === ":"
                ? 1.5
                : 1;

        bonds.push({
          atom1: edge.sourceId,
          atom2: edge.targetId,
          order,
          x1,
          y1,
          x2,
          y2,
          midpointX: midX,
          midpointY: midY,
          normalX: nx,
          normalY: ny,
          length: len,
        });

        totalBondLength += len;
      }
    }
  }

  const averageBondLength = bonds.length > 0 ? totalBondLength / bonds.length : 20;

  // 2. Second pass: extract atoms and compute verified lone pairs
  const atoms: AtomGeometry[] = graph.vertices.map((v, idx) => {
    const atomIdx = typeof v.id === "number" ? v.id : idx;
    const element = v.value?.element || "C";
    const x = v.position?.x ?? 0;
    const y = v.position?.y ?? 0;

    // Formal charge
    const charge = v.value?.bracket?.charge ?? v.value?.charge ?? 0;

    // Hydrogen count
    const hCount = v.value?.bracket?.hcount ?? 0;

    // Aromaticity
    const isAromatic = !!v.value?.isPartOfAromaticRing;

    // Find incident bonds and neighbors
    const incidentBonds = bonds.filter((b) => b.atom1 === atomIdx || b.atom2 === atomIdx);
    const neighborBonds: Array<{ x: number; y: number }> = [];
    const neighborIndices: number[] = [];
    let sumBondOrders = 0;

    for (const b of incidentBonds) {
      sumBondOrders += b.order;
      const otherId = b.atom1 === atomIdx ? b.atom2 : b.atom1;
      neighborIndices.push(otherId);
      const otherVertex = graph.vertices[otherId];
      if (otherVertex && otherVertex.position) {
        neighborBonds.push({ x: otherVertex.position.x, y: otherVertex.position.y });
      }
    }

    const lonePairsCount = computeConfirmedLonePairsCount(
      element,
      charge,
      sumBondOrders,
      hCount,
      isAromatic,
    );

    const lonePairs = computeLonePairGeometries(
      { x, y },
      lonePairsCount,
      neighborBonds,
      hCount,
      averageBondLength,
    );

    return {
      index: atomIdx,
      element,
      x,
      y,
      charge,
      hydrogenCount: hCount,
      isAromatic,
      lonePairsCount,
      lonePairs,
      neighborIndices,
    };
  });

  return { atoms, bonds, averageBondLength };
}

