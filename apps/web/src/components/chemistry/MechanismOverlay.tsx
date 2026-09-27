import React from "react";
import type { ChemicalReactionMechanism, MechanismArrow } from "@avana/domain";
import {
  extractMoleculeGeometry,
  type MoleculeGeometry,
  type LonePairGeometry,
  type AtomGeometry,
} from "./SmilesDrawerGeometryAdapter.js";
import {
  routeMechanismArrow,
  buildObstacleMap,
  computeBetaHydrogenGeometry,
  type Point,
} from "./MechanismRouting.js";

export interface MechanismOverlayProps {
  geometry: MoleculeGeometry;
  mechanism?: ChemicalReactionMechanism;
  participantRole: "reactant" | "product";
  participantIndex?: number;
  className?: string;
  isDarkMode?: boolean;
  suppressIntermolecularStubs?: boolean;
}

export interface LonePairDotItem {
  cx: number;
  cy: number;
  r: number;
  fill: string;
}

export interface MechanismArrowItem {
  id: string;
  d: string;
  color: string;
  markerEnd: string;
  strokeWidth: number;
  label?: string;
}

export interface BetaHydrogenVisual {
  x: number;
  y: number;
  bondStartX: number;
  bondStartY: number;
  label: string;
}

export interface ComputedMechanismVisuals {
  lonePairs: LonePairDotItem[];
  arrows: MechanismArrowItem[];
  betaHydrogen?: BetaHydrogenVisual;
}

/**
 * Pure geometric calculation of authentic ChemDraw-like mechanism annotations:
 * 1. Non-bonding electron lone pairs (••) on active donor/leaving atoms.
 * 2. Obstacle-aware curved electron-pushing arrows rooted at active lone pairs or bond midpoints.
 * 3. Anti-periplanar beta-hydrogen projection for E2 mechanisms.
 * 4. Fish-hook arrows for 1-electron/radical steps vs double-barbed for 2-electron polar steps.
 */
export function computeMechanismVisuals(
  geometry: MoleculeGeometry,
  mechanism?: ChemicalReactionMechanism,
  participantRole: "reactant" | "product" = "reactant",
  participantIndex = 0,
  isDarkMode = false,
  suppressIntermolecularStubs = false,
): ComputedMechanismVisuals {
  if (!mechanism || !mechanism.isVerified) {
    return { lonePairs: [], arrows: [] };
  }

  const { atoms = [], bonds = [], averageBondLength = 32 } = geometry;
  if (atoms.length === 0) {
    return { lonePairs: [], arrows: [] };
  }

  const avgBond = Math.max(16, Math.min(80, averageBondLength));
  const dotRadius = Math.max(1.1, Math.min(2.0, avgBond * 0.055));
  const arrowStrokeWidth = Math.max(1.5, Math.min(2.2, avgBond * 0.062));

  // ChemDraw theme colors
  const tealColor = "#0d9488";
  const roseColor = "#e11d48";
  const spectatorDotColor = isDarkMode ? "#94a3b8" : "#334155";
  const activeDotColor = tealColor;

  const reactionCenter = mechanism.reactionCenter;

  // 1. Gather all candidate arrows (either explicit arrows or synthesized SN2 arrows)
  let candidateArrows: MechanismArrow[] = [];
  if (Array.isArray(mechanism.arrows) && mechanism.arrows.length > 0) {
    candidateArrows = mechanism.arrows;
  } else if (reactionCenter?.nucleophile && reactionCenter?.electrophile && reactionCenter?.leavingGroup) {
    candidateArrows = [
      {
        id: "arrow_nu_to_c",
        type: "lone_pair_to_atom",
        from: {
          type: "lone_pair",
          atom: reactionCenter.nucleophile,
        },
        to: {
          type: "atom",
          atom: reactionCenter.electrophile,
        },
        direction: "counter-clockwise",
      },
      {
        id: "arrow_bond_to_lg",
        type: "bond_to_atom",
        from: {
          type: "bond",
          bond: {
            participantRole: "reactant",
            participantIndex: reactionCenter.electrophile.participantIndex ?? 0,
            atom1: reactionCenter.electrophile.atomIndex,
            atom2: reactionCenter.leavingGroup.atomIndex,
          },
        },
        to: {
          type: "atom",
          atom: reactionCenter.leavingGroup,
        },
        direction: "clockwise",
      },
    ];
  }

  // 2. Build local obstacle map for routing
  const obstacleMap = buildObstacleMap([{ geometry, participantIndex }]);

  // 3. Identify active donor atoms and determine their active lone pair
  const activeDonorLonePairMap = new Map<number, LonePairGeometry>();

  for (const arrow of candidateArrows) {
    if (arrow.from.type === "lone_pair" || arrow.from.type === "atom") {
      const fromRef = arrow.from.atom;
      if (
        fromRef &&
        (fromRef.participantRole || "reactant") === participantRole &&
        (fromRef.participantIndex ?? 0) === participantIndex
      ) {
        const atom = atoms.find((a) => a.index === fromRef.atomIndex);
        if (atom && atom.lonePairs && atom.lonePairs.length > 0) {
          // If explicit lone pair index specified
          const explicitLpIdx = arrow.lonePairIndex ?? arrow.from.lonePairIndex;
          if (explicitLpIdx !== undefined && atom.lonePairs[explicitLpIdx]) {
            activeDonorLonePairMap.set(atom.index, atom.lonePairs[explicitLpIdx]);
          } else {
            // Find direction towards arrow destination
            let targetDirX = 1;
            let targetDirY = 0;

            if (arrow.to.type === "atom" && arrow.to.atom) {
              const toRef = arrow.to.atom;
              if (
                (toRef.participantRole || "reactant") === participantRole &&
                (toRef.participantIndex ?? 0) === participantIndex
              ) {
                const toAtom = atoms.find((a) => a.index === toRef.atomIndex);
                if (toAtom) {
                  targetDirX = toAtom.x - atom.x;
                  targetDirY = toAtom.y - atom.y;
                }
              } else {
                // Intermolecular: nucleophile attacks to the right or opposite side
                targetDirX = (toRef?.participantIndex ?? 1) >= participantIndex ? 1 : -1;
                targetDirY = 0;
              }
            } else if (arrow.to.type === "bond" && arrow.to.bond) {
              const toBondRef = arrow.to.bond;
              if (
                (toBondRef.participantRole || "reactant") === participantRole &&
                (toBondRef.participantIndex ?? 0) === participantIndex
              ) {
                const bond = bonds.find(
                  (b) =>
                    (b.atom1 === toBondRef.atom1 && b.atom2 === toBondRef.atom2) ||
                    (b.atom1 === toBondRef.atom2 && b.atom2 === toBondRef.atom1),
                );
                if (bond) {
                  targetDirX = bond.midpointX - atom.x;
                  targetDirY = bond.midpointY - atom.y;
                }
              }
            }

            const len = Math.hypot(targetDirX, targetDirY) || 1;
            targetDirX /= len;
            targetDirY /= len;

            // Pick the lone pair pointing closest towards the target direction
            let bestLp = atom.lonePairs[0];
            let bestDot = -Infinity;
            for (const lp of atom.lonePairs) {
              const lpDirX = lp.x - atom.x;
              const lpDirY = lp.y - atom.y;
              const lpLen = Math.hypot(lpDirX, lpDirY) || 1;
              const dot = (lpDirX / lpLen) * targetDirX + (lpDirY / lpLen) * targetDirY;
              if (dot > bestDot) {
                bestDot = dot;
                bestLp = lp;
              }
            }
            activeDonorLonePairMap.set(atom.index, bestLp);
          }
        }
      }
    }
  }

  // 4. Check for targeted Beta-Hydrogen (in E2 elimination mechanisms)
  let betaHydrogenVisual: BetaHydrogenVisual | undefined;
  let betaHydrogenAtomIdx: number | null = null;

  if (mechanism.reactionType === "E2") {
    for (const arrow of candidateArrows) {
      if (arrow.to.type === "atom" && arrow.to.atom) {
        const toRef = arrow.to.atom;
        if (
          (toRef.participantRole || "reactant") === participantRole &&
          (toRef.participantIndex ?? 0) === participantIndex
        ) {
          const targetAtom = atoms.find((a) => a.index === toRef.atomIndex);
          if (targetAtom && targetAtom.element === "C") {
            // Find neighbor C-alpha and leaving group
            const cAlpha = atoms.find((a) => targetAtom.neighborIndices.includes(a.index) && a.element === "C");
            if (cAlpha) {
              const lgAtom = atoms.find(
                (a) =>
                  cAlpha.neighborIndices.includes(a.index) &&
                  a.index !== targetAtom.index &&
                  ["BR", "CL", "I", "F", "O"].includes(a.element.toUpperCase()),
              );
              const betaHInfo = computeBetaHydrogenGeometry(targetAtom, cAlpha, lgAtom, avgBond);
              betaHydrogenVisual = {
                x: betaHInfo.x,
                y: betaHInfo.y,
                bondStartX: betaHInfo.cBeta.x,
                bondStartY: betaHInfo.cBeta.y,
                label: "H",
              };
              betaHydrogenAtomIdx = targetAtom.index;
              break;
            }
          }
        }
      }
    }
  }

  // 5. Render Lone Pairs on relevant atoms
  const renderedLonePairDots: LonePairDotItem[] = [];
  const relevantAtomIndices = new Set<number>();

  for (const atom of atoms) {
    let isRelevant = false;
    if (activeDonorLonePairMap.has(atom.index)) {
      isRelevant = true;
    }
    if (
      reactionCenter?.nucleophile &&
      (reactionCenter.nucleophile.participantRole || "reactant") === participantRole &&
      (reactionCenter.nucleophile.participantIndex ?? 0) === participantIndex &&
      reactionCenter.nucleophile.atomIndex === atom.index
    ) {
      isRelevant = true;
    }
    if (
      reactionCenter?.leavingGroup &&
      (reactionCenter.leavingGroup.participantRole || "reactant") === participantRole &&
      (reactionCenter.leavingGroup.participantIndex ?? 0) === participantIndex &&
      reactionCenter.leavingGroup.atomIndex === atom.index
    ) {
      isRelevant = true;
    }
    if (atom.charge !== 0 && atom.lonePairs && atom.lonePairs.length > 0) {
      isRelevant = true;
    }

    if (isRelevant) {
      relevantAtomIndices.add(atom.index);
    }
  }

  for (const atomIdx of relevantAtomIndices) {
    const atom = atoms.find((a) => a.index === atomIdx);
    if (!atom || !atom.lonePairs || atom.lonePairs.length === 0) continue;

    const activeLp = activeDonorLonePairMap.get(atomIdx);

    for (const lp of atom.lonePairs) {
      const isActive = activeLp && activeLp.index === lp.index;
      const fill = isActive ? activeDotColor : spectatorDotColor;

      if (Number.isFinite(lp.dot1.x) && Number.isFinite(lp.dot1.y)) {
        renderedLonePairDots.push({
          cx: Math.round(lp.dot1.x * 10) / 10,
          cy: Math.round(lp.dot1.y * 10) / 10,
          r: dotRadius,
          fill,
        });
      }
      if (Number.isFinite(lp.dot2.x) && Number.isFinite(lp.dot2.y)) {
        renderedLonePairDots.push({
          cx: Math.round(lp.dot2.x * 10) / 10,
          cy: Math.round(lp.dot2.y * 10) / 10,
          r: dotRadius,
          fill,
        });
      }
    }
  }

  // 6. Render Mechanism Arrows
  const renderedArrows: MechanismArrowItem[] = [];

  for (const [aIdx, arrow] of candidateArrows.entries()) {
    const isRadical = arrow.electronCount === 1;
    const arrowId = arrow.id || `rxn_arrow_${aIdx}`;

    // A. Lone Pair -> Atom (or Atom -> Atom)
    if (arrow.type === "lone_pair_to_atom" || arrow.type === "atom_to_atom") {
      const fromRef = arrow.from.atom;
      const toRef = arrow.to.atom;
      const fromIsHere =
        fromRef &&
        (fromRef.participantRole || "reactant") === participantRole &&
        (fromRef.participantIndex ?? 0) === participantIndex;
      const toIsHere =
        toRef &&
        (toRef.participantRole || "reactant") === participantRole &&
        (toRef.participantIndex ?? 0) === participantIndex;

      // Case A1: Intramolecular (Both from and to are in this participant)
      if (fromIsHere && toIsHere && fromRef && toRef) {
        const fromAtom = atoms.find((a) => a.index === fromRef.atomIndex);
        const toAtom = atoms.find((a) => a.index === toRef.atomIndex);

        if (fromAtom && toAtom) {
          const activeLp = activeDonorLonePairMap.get(fromAtom.index);
          const startX = activeLp ? activeLp.x : fromAtom.x;
          const startY = activeLp ? activeLp.y : fromAtom.y - avgBond * 0.25;

          const route = routeMechanismArrow(
            {
              source: { x: startX, y: startY },
              target: { x: toAtom.x, y: toAtom.y },
              sourceEntityId: `atom_p${participantIndex}_${fromAtom.index}`,
              targetEntityId: `atom_p${participantIndex}_${toAtom.index}`,
              targetType: "atom",
              targetRadius: avgBond * 0.25,
              preferredDirection: arrow.direction || "counter-clockwise",
              curveOffset: arrow.curveOffset,
              bondLength: avgBond,
            },
            obstacleMap,
          );

          renderedArrows.push({
            id: arrowId,
            d: route.d,
            color: tealColor,
            markerEnd: isRadical ? "url(#electron-arrowhead-fishhook-teal)" : "url(#electron-arrowhead-teal)",
            strokeWidth: arrowStrokeWidth,
            label: arrow.label,
          });
        }
      }
      // Case A2: Intermolecular Outgoing (Fallback stub if not suppressed)
      else if (fromIsHere && fromRef && !suppressIntermolecularStubs) {
        const fromAtom = atoms.find((a) => a.index === fromRef.atomIndex);
        if (fromAtom) {
          const activeLp = activeDonorLonePairMap.get(fromAtom.index);
          const startX = activeLp ? activeLp.x : fromAtom.x;
          const startY = activeLp ? activeLp.y : fromAtom.y;

          const targetIndex = toRef?.participantIndex ?? (participantIndex + 1);
          const dirX = targetIndex >= participantIndex ? 1 : -1;

          const endX = startX + dirX * (avgBond * 0.85);
          const endY = startY - avgBond * 0.22;
          const ctrlX = startX + dirX * (avgBond * 0.45);
          const ctrlY = startY - avgBond * 0.6;

          renderedArrows.push({
            id: `${arrowId}_outgoing`,
            d: `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`,
            color: tealColor,
            markerEnd: isRadical ? "url(#electron-arrowhead-fishhook-teal)" : "url(#electron-arrowhead-teal)",
            strokeWidth: arrowStrokeWidth,
            label: arrow.label,
          });
        }
      }
      // Case A3: Intermolecular Incoming (Fallback stub if not suppressed)
      else if (toIsHere && toRef && !suppressIntermolecularStubs) {
        const toAtom = atoms.find((a) => a.index === toRef.atomIndex);
        if (toAtom) {
          const lgAtom =
            reactionCenter?.leavingGroup &&
            (reactionCenter.leavingGroup.participantRole || "reactant") === participantRole &&
            (reactionCenter.leavingGroup.participantIndex ?? 0) === participantIndex
              ? atoms.find((a) => a.index === reactionCenter.leavingGroup!.atomIndex)
              : undefined;

          let startX: number;
          let startY: number;
          let ctrlX: number;
          let ctrlY: number;
          let endX: number;
          let endY: number;

          if (lgAtom) {
            const lgDx = lgAtom.x - toAtom.x;
            const lgDy = lgAtom.y - toAtom.y;
            const lgLen = Math.hypot(lgDx, lgDy) || 1;
            const ux = lgDx / lgLen;
            const uy = lgDy / lgLen;

            const attackDist = avgBond * 1.05;
            startX = toAtom.x - ux * attackDist;
            startY = toAtom.y - uy * attackDist;
            endX = toAtom.x - ux * (avgBond * 0.22);
            endY = toAtom.y - uy * (avgBond * 0.22);

            const nx = -uy;
            const ny = ux;
            ctrlX = (startX + endX) / 2 + nx * (avgBond * 0.28);
            ctrlY = (startY + endY) / 2 + ny * (avgBond * 0.28);
          } else {
            const sourceIndex = fromRef?.participantIndex ?? (participantIndex - 1);
            const dirX = sourceIndex <= participantIndex ? -1 : 1;
            startX = toAtom.x + dirX * (avgBond * 0.85);
            startY = toAtom.y - avgBond * 0.55;
            endX = toAtom.x + dirX * (avgBond * 0.2);
            endY = toAtom.y - avgBond * 0.1;
            ctrlX = startX - dirX * (avgBond * 0.35);
            ctrlY = startY - avgBond * 0.3;
          }

          renderedArrows.push({
            id: `${arrowId}_incoming`,
            d: `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`,
            color: tealColor,
            markerEnd: isRadical ? "url(#electron-arrowhead-fishhook-teal)" : "url(#electron-arrowhead-teal)",
            strokeWidth: arrowStrokeWidth,
            label: arrow.label,
          });
        }
      }
    }

    // B. Bond -> Atom (Bond cleavage, e.g. C-LG bond breaks onto LG)
    if (arrow.type === "bond_to_atom") {
      const bondRef = arrow.from.bond;
      const toRef = arrow.to.atom;

      if (
        bondRef &&
        toRef &&
        (bondRef.participantRole || "reactant") === participantRole &&
        (bondRef.participantIndex ?? 0) === participantIndex &&
        (toRef.participantRole || "reactant") === participantRole &&
        (toRef.participantIndex ?? 0) === participantIndex
      ) {
        const bond = bonds.find(
          (b) =>
            (b.atom1 === bondRef.atom1 && b.atom2 === bondRef.atom2) ||
            (b.atom1 === bondRef.atom2 && b.atom2 === bondRef.atom1),
        );
        const toAtom = atoms.find((a) => a.index === toRef.atomIndex);

        if (bond && toAtom) {
          const bondId = `bond_p${participantIndex}_${Math.min(bond.atom1, bond.atom2)}_${Math.max(bond.atom1, bond.atom2)}`;
          const atomId = `atom_p${participantIndex}_${toAtom.index}`;

          const route = routeMechanismArrow(
            {
              source: { x: bond.midpointX, y: bond.midpointY },
              target: { x: toAtom.x, y: toAtom.y },
              sourceEntityId: bondId,
              targetEntityId: atomId,
              targetType: "atom",
              targetRadius: avgBond * 0.22,
              preferredDirection: arrow.direction || "clockwise",
              curveOffset: arrow.curveOffset,
              bondLength: avgBond,
            },
            obstacleMap,
          );

          renderedArrows.push({
            id: arrowId,
            d: route.d,
            color: roseColor,
            markerEnd: isRadical ? "url(#electron-arrowhead-fishhook-rose)" : "url(#electron-arrowhead-rose)",
            strokeWidth: arrowStrokeWidth,
            label: arrow.label,
          });
        }
      }
    }

    // C. Bond -> Bond (Bond rearrangement, e.g. E2 beta-elimination C-H -> C=C)
    if (arrow.type === "bond_to_bond") {
      const fromBondRef = arrow.from.bond;
      const toBondRef = arrow.to.bond;

      if (
        fromBondRef &&
        toBondRef &&
        (fromBondRef.participantRole || "reactant") === participantRole &&
        (fromBondRef.participantIndex ?? 0) === participantIndex &&
        (toBondRef.participantRole || "reactant") === participantRole &&
        (toBondRef.participantIndex ?? 0) === participantIndex
      ) {
        const b1 = bonds.find(
          (b) =>
            (b.atom1 === fromBondRef.atom1 && b.atom2 === fromBondRef.atom2) ||
            (b.atom1 === fromBondRef.atom2 && b.atom2 === fromBondRef.atom1),
        );
        const b2 = bonds.find(
          (b) =>
            (b.atom1 === toBondRef.atom1 && b.atom2 === toBondRef.atom2) ||
            (b.atom1 === toBondRef.atom2 && b.atom2 === toBondRef.atom1),
        );

        if (b1 && b2) {
          // If beta-hydrogen is present and from-bond matches C-beta to C-alpha, route from C-H bond to C-C
          let startPt: Point = { x: b1.midpointX, y: b1.midpointY };
          if (betaHydrogenVisual && fromBondRef.atom1 === 0 && fromBondRef.atom2 === 1 && toBondRef.atom1 === 0 && toBondRef.atom2 === 1) {
            startPt = {
              x: (betaHydrogenVisual.bondStartX + betaHydrogenVisual.x) / 2,
              y: (betaHydrogenVisual.bondStartY + betaHydrogenVisual.y) / 2,
            };
          }

          const route = routeMechanismArrow(
            {
              source: startPt,
              target: { x: b2.midpointX, y: b2.midpointY },
              sourceEntityId: `bond_p${participantIndex}_${Math.min(b1.atom1, b1.atom2)}_${Math.max(b1.atom1, b1.atom2)}`,
              targetEntityId: `bond_p${participantIndex}_${Math.min(b2.atom1, b2.atom2)}_${Math.max(b2.atom1, b2.atom2)}`,
              targetType: "bond",
              targetRadius: 0,
              preferredDirection: arrow.direction || "counter-clockwise",
              curveOffset: arrow.curveOffset,
              bondLength: avgBond,
            },
            obstacleMap,
          );

          renderedArrows.push({
            id: arrowId,
            d: route.d,
            color: tealColor,
            markerEnd: isRadical ? "url(#electron-arrowhead-fishhook-teal)" : "url(#electron-arrowhead-teal)",
            strokeWidth: arrowStrokeWidth,
            label: arrow.label,
          });
        }
      }
    }

    // D. Lone Pair -> Bond (Resonance or conjugate addition)
    if (arrow.type === "lone_pair_to_bond") {
      const fromRef = arrow.from.atom;
      const toBondRef = arrow.to.bond;

      if (
        fromRef &&
        toBondRef &&
        (fromRef.participantRole || "reactant") === participantRole &&
        (fromRef.participantIndex ?? 0) === participantIndex &&
        (toBondRef.participantRole || "reactant") === participantRole &&
        (toBondRef.participantIndex ?? 0) === participantIndex
      ) {
        const fromAtom = atoms.find((a) => a.index === fromRef.atomIndex);
        const toBond = bonds.find(
          (b) =>
            (b.atom1 === toBondRef.atom1 && b.atom2 === toBondRef.atom2) ||
            (b.atom1 === toBondRef.atom2 && b.atom2 === toBondRef.atom1),
        );

        if (fromAtom && toBond) {
          const activeLp = activeDonorLonePairMap.get(fromAtom.index);
          const startX = activeLp ? activeLp.x : fromAtom.x;
          const startY = activeLp ? activeLp.y : fromAtom.y;

          const route = routeMechanismArrow(
            {
              source: { x: startX, y: startY },
              target: { x: toBond.midpointX, y: toBond.midpointY },
              sourceEntityId: `atom_p${participantIndex}_${fromAtom.index}`,
              targetEntityId: `bond_p${participantIndex}_${Math.min(toBond.atom1, toBond.atom2)}_${Math.max(toBond.atom1, toBond.atom2)}`,
              targetType: "bond",
              targetRadius: 0,
              preferredDirection: arrow.direction || "counter-clockwise",
              curveOffset: arrow.curveOffset,
              bondLength: avgBond,
            },
            obstacleMap,
          );

          renderedArrows.push({
            id: arrowId,
            d: route.d,
            color: tealColor,
            markerEnd: isRadical ? "url(#electron-arrowhead-fishhook-teal)" : "url(#electron-arrowhead-teal)",
            strokeWidth: arrowStrokeWidth,
            label: arrow.label,
          });
        }
      }
    }
  }

  return {
    lonePairs: renderedLonePairDots,
    arrows: renderedArrows,
    betaHydrogen: betaHydrogenVisual,
  };
}

/**
 * Standard ChemDraw-style SVG marker definitions for polar (2-electron)
 * and radical (1-electron fish-hook) mechanisms.
 */
export function renderMechanismDefsToSvg(targetDefs: SVGDefsElement): void {
  const ns = "http://www.w3.org/2000/svg";

  // 1. Standard double-barbed arrowhead (Teal)
  if (!targetDefs.querySelector("#electron-arrowhead-teal")) {
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "electron-arrowhead-teal");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6.2");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M 1 0.6 L 6.5 3 L 1 5.4 L 2.6 3 Z");
    path.setAttribute("fill", "#0d9488");
    marker.appendChild(path);
    targetDefs.appendChild(marker);
  }

  // 2. Standard double-barbed arrowhead (Rose)
  if (!targetDefs.querySelector("#electron-arrowhead-rose")) {
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "electron-arrowhead-rose");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6.2");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M 1 0.6 L 6.5 3 L 1 5.4 L 2.6 3 Z");
    path.setAttribute("fill", "#e11d48");
    marker.appendChild(path);
    targetDefs.appendChild(marker);
  }

  // 3. Fish-hook single-barbed arrowhead (Teal) for 1-electron movements
  if (!targetDefs.querySelector("#electron-arrowhead-fishhook-teal")) {
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "electron-arrowhead-fishhook-teal");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6.2");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M 1 0.6 L 6.5 3 L 2.6 3 Z");
    path.setAttribute("fill", "#0d9488");
    marker.appendChild(path);
    targetDefs.appendChild(marker);
  }

  // 4. Fish-hook single-barbed arrowhead (Rose) for 1-electron movements
  if (!targetDefs.querySelector("#electron-arrowhead-fishhook-rose")) {
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "electron-arrowhead-fishhook-rose");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6.2");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M 1 0.6 L 6.5 3 L 2.6 3 Z");
    path.setAttribute("fill", "#e11d48");
    marker.appendChild(path);
    targetDefs.appendChild(marker);
  }
}

/**
 * React Component for rendering ChemDraw-style mechanism overlays.
 */
export function MechanismOverlay({
  geometry,
  mechanism,
  participantRole,
  participantIndex = 0,
  className = "",
  isDarkMode = false,
  suppressIntermolecularStubs = false,
}: MechanismOverlayProps) {
  const visuals = computeMechanismVisuals(
    geometry,
    mechanism,
    participantRole,
    participantIndex,
    isDarkMode,
    suppressIntermolecularStubs,
  );

  if (visuals.lonePairs.length === 0 && visuals.arrows.length === 0 && !visuals.betaHydrogen) {
    return null;
  }

  return (
    <g className={`rxn-mechanism-overlay ${className}`} pointerEvents="none" data-testid="mechanism-overlay">
      <defs>
        <marker
          id="electron-arrowhead-teal"
          markerWidth="8"
          markerHeight="8"
          refX="6.2"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 1 0.6 L 6.5 3 L 1 5.4 L 2.6 3 Z" fill="#0d9488" />
        </marker>
        <marker
          id="electron-arrowhead-rose"
          markerWidth="8"
          markerHeight="8"
          refX="6.2"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 1 0.6 L 6.5 3 L 1 5.4 L 2.6 3 Z" fill="#e11d48" />
        </marker>
        <marker
          id="electron-arrowhead-fishhook-teal"
          markerWidth="8"
          markerHeight="8"
          refX="6.2"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 1 0.6 L 6.5 3 L 2.6 3 Z" fill="#0d9488" />
        </marker>
        <marker
          id="electron-arrowhead-fishhook-rose"
          markerWidth="8"
          markerHeight="8"
          refX="6.2"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 1 0.6 L 6.5 3 L 2.6 3 Z" fill="#e11d48" />
        </marker>
      </defs>

      {/* 0. Anti-periplanar Beta-Hydrogen (for E2 elimination) */}
      {visuals.betaHydrogen && (
        <g className="rxn-beta-hydrogen" data-testid="mechanism-beta-hydrogen">
          <line
            x1={visuals.betaHydrogen.bondStartX}
            y1={visuals.betaHydrogen.bondStartY}
            x2={visuals.betaHydrogen.x}
            y2={visuals.betaHydrogen.y}
            stroke={isDarkMode ? "#94a3b8" : "#475569"}
            strokeWidth={1.5}
            strokeDasharray="2.5,2.5"
            strokeLinecap="round"
          />
          <text
            x={visuals.betaHydrogen.x}
            y={visuals.betaHydrogen.y}
            dominantBaseline="central"
            textAnchor="middle"
            className="element"
            fill={isDarkMode ? "#94a3b8" : "#475569"}
            style={{
              fontSize: "10pt",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontWeight: "bold",
            }}
          >
            H
          </text>
        </g>
      )}

      {/* 1. Real Lone Pair Dots */}
      <g className="rxn-lone-pairs" data-testid="mechanism-lone-pairs">
        {visuals.lonePairs.map((dot, idx) => (
          <circle
            key={`lp-dot-${idx}`}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill={dot.fill}
          />
        ))}
      </g>

      {/* 2. Curved Electron-Pushing Arrows */}
      <g className="rxn-curved-arrows" data-testid="mechanism-arrows">
        {visuals.arrows.map((arrow) => (
          <path
            key={arrow.id}
            id={arrow.id}
            d={arrow.d}
            fill="none"
            stroke={arrow.color}
            strokeWidth={arrow.strokeWidth}
            strokeLinecap="round"
            markerEnd={arrow.markerEnd}
          />
        ))}
      </g>
    </g>
  );
}

/**
 * Imperative SVG DOM renderer for SmilesDrawer integration.
 * Injects ChemDraw-style lone pairs, beta-hydrogen, and curved electron-pushing arrows directly into the drawer SVG.
 */
export function renderMechanismOverlayToSvg(
  targetSvg: SVGSVGElement,
  drawerInstance: unknown,
  mechanism: ChemicalReactionMechanism | undefined,
  role: "reactant" | "product",
  participantIndex = 0,
  isDarkMode = false,
  suppressIntermolecularStubs = false,
): void {
  if (!mechanism || !mechanism.isVerified) return;

  // Clean up any existing overlay to prevent duplicate rendering
  const existing = targetSvg.querySelector(".rxn-mechanism-overlay");
  if (existing) {
    existing.remove();
  }

  const geometry = extractMoleculeGeometry(drawerInstance);
  if (!geometry || !geometry.atoms || geometry.atoms.length === 0) return;

  const visuals = computeMechanismVisuals(
    geometry,
    mechanism,
    role,
    participantIndex,
    isDarkMode,
    suppressIntermolecularStubs,
  );
  if (visuals.lonePairs.length === 0 && visuals.arrows.length === 0 && !visuals.betaHydrogen) return;

  const ns = "http://www.w3.org/2000/svg";

  // Ensure marker defs exist in the target SVG
  let defs = targetSvg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(ns, "defs");
    targetSvg.prepend(defs);
  }
  renderMechanismDefsToSvg(defs);

  const overlayGroup = document.createElementNS(ns, "g");
  overlayGroup.setAttribute("class", "rxn-mechanism-overlay");
  overlayGroup.setAttribute("pointer-events", "none");
  overlayGroup.setAttribute("data-testid", "mechanism-overlay");

  // 0. Beta-hydrogen group (if present)
  if (visuals.betaHydrogen) {
    const bhGroup = document.createElementNS(ns, "g");
    bhGroup.setAttribute("class", "rxn-beta-hydrogen");
    bhGroup.setAttribute("data-testid", "mechanism-beta-hydrogen");

    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(visuals.betaHydrogen.bondStartX));
    line.setAttribute("y1", String(visuals.betaHydrogen.bondStartY));
    line.setAttribute("x2", String(visuals.betaHydrogen.x));
    line.setAttribute("y2", String(visuals.betaHydrogen.y));
    line.setAttribute("stroke", isDarkMode ? "#94a3b8" : "#475569");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-dasharray", "2.5,2.5");
    line.setAttribute("stroke-linecap", "round");
    bhGroup.appendChild(line);

    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(visuals.betaHydrogen.x));
    text.setAttribute("y", String(visuals.betaHydrogen.y));
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "element");
    text.setAttribute("fill", isDarkMode ? "#94a3b8" : "#475569");
    text.setAttribute("style", "font-size: 10pt; font-family: Arial, Helvetica, sans-serif; font-weight: bold;");
    text.textContent = "H";
    bhGroup.appendChild(text);

    overlayGroup.appendChild(bhGroup);
  }

  // 1. Lone pairs group
  if (visuals.lonePairs.length > 0) {
    const lpGroup = document.createElementNS(ns, "g");
    lpGroup.setAttribute("class", "rxn-lone-pairs");
    lpGroup.setAttribute("data-testid", "mechanism-lone-pairs");

    for (const dot of visuals.lonePairs) {
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", String(dot.cx));
      circle.setAttribute("cy", String(dot.cy));
      circle.setAttribute("r", String(dot.r));
      circle.setAttribute("fill", dot.fill);
      lpGroup.appendChild(circle);
    }
    overlayGroup.appendChild(lpGroup);
  }

  // 2. Curved arrows group
  if (visuals.arrows.length > 0) {
    const arrowsGroup = document.createElementNS(ns, "g");
    arrowsGroup.setAttribute("class", "rxn-curved-arrows");
    arrowsGroup.setAttribute("data-testid", "mechanism-arrows");

    for (const arrow of visuals.arrows) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("id", arrow.id);
      path.setAttribute("d", arrow.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", arrow.color);
      path.setAttribute("stroke-width", String(arrow.strokeWidth));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("marker-end", arrow.markerEnd);
      arrowsGroup.appendChild(path);
    }
    overlayGroup.appendChild(arrowsGroup);
  }

  if (overlayGroup.hasChildNodes()) {
    targetSvg.appendChild(overlayGroup);
  }
}
