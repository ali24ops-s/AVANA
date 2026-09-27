/**
 * MechanismRouting — Obstacle-Aware Electron-Pushing Arrow Routing Engine for ChemDraw Schemes.
 *
 * Implements deterministic geometric routing:
 * 1. Semantic source & target anchors (active lone pair, bond midpoint, atom perimeter).
 * 2. Obstacle map of covalent bonds, heavy atoms, and atom labels.
 * 3. Candidate Bezier trajectory evaluation with collision avoidance around molecular structures.
 * 4. Crisp ChemDraw target setback and tangent alignment into target center.
 * 5. Anti-periplanar beta-hydrogen spatial resolution for E2 eliminations.
 */

import type { MoleculeGeometry, AtomGeometry, BondGeometry } from "./SmilesDrawerGeometryAdapter.js";

export interface Point {
  x: number;
  y: number;
}

export interface ObstacleSegment {
  id: string;
  p1: Point;
  p2: Point;
  padding: number;
}

export interface ObstacleCircle {
  id: string;
  center: Point;
  radius: number;
}

export interface ObstacleMap {
  segments: ObstacleSegment[];
  circles: ObstacleCircle[];
}

export interface BetaHydrogenInfo {
  x: number;
  y: number;
  direction: Point;
  cBeta: Point;
  bondLength: number;
}

export interface ArrowRoutingOptions {
  source: Point;
  target: Point;
  sourceEntityId?: string;
  targetEntityId?: string;
  targetType?: "atom" | "bond";
  targetRadius?: number;
  arrowheadLength?: number;
  preferredDirection?: "clockwise" | "counter-clockwise" | "auto";
  curveOffset?: number;
  curveOrder?: number;
  ignoredObstacleIds?: string[];
  bondLength?: number;
}

export interface ArrowRouteResult {
  d: string;
  start: Point;
  ctrl: Point;
  end: Point;
  arrivalTangent: Point;
  collisionCount: number;
  offsetUsed: number;
}

/**
 * Calculates perpendicular distance from a point to a finite line segment.
 */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Samples points along a quadratic Bezier curve B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2.
 * Samples strictly within (tStart, tEnd) to exclude the immediate vicinity of source/target anchors.
 */
export function sampleQuadraticBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  samples = 14,
  tStart = 0.15,
  tEnd = 0.85,
): Point[] {
  const points: Point[] = [];
  const step = (tEnd - tStart) / Math.max(1, samples - 1);
  for (let i = 0; i < samples; i++) {
    const t = tStart + i * step;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
    points.push({ x, y });
  }
  return points;
}

/**
 * Builds a geometric obstacle map from one or more molecule geometries.
 * Can apply coordinate translation (for multi-participant reaction rows).
 */
export function buildObstacleMap(
  geometries: Array<{
    geometry: MoleculeGeometry;
    participantIndex: number;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
  }>,
): ObstacleMap {
  const segments: ObstacleSegment[] = [];
  const circles: ObstacleCircle[] = [];

  for (const item of geometries) {
    const { geometry, participantIndex, offsetX = 0, offsetY = 0, scale = 1 } = item;
    const avgBond = (geometry.averageBondLength || 25) * scale;
    const bondPadding = Math.max(3.5, avgBond * 0.22);
    const atomRadius = Math.max(6.5, avgBond * 0.32);

    // 1. Bond segments
    for (const bond of geometry.bonds || []) {
      const p1: Point = {
        x: bond.x1 * scale + offsetX,
        y: bond.y1 * scale + offsetY,
      };
      const p2: Point = {
        x: bond.x2 * scale + offsetX,
        y: bond.y2 * scale + offsetY,
      };
      const id = `bond_p${participantIndex}_${Math.min(bond.atom1, bond.atom2)}_${Math.max(bond.atom1, bond.atom2)}`;
      segments.push({ id, p1, p2, padding: bondPadding });
    }

    // 2. Atom circles
    for (const atom of geometry.atoms || []) {
      const center: Point = {
        x: atom.x * scale + offsetX,
        y: atom.y * scale + offsetY,
      };
      const id = `atom_p${participantIndex}_${atom.index}`;
      circles.push({ id, center, radius: atomRadius });
    }
  }

  return { segments, circles };
}

/**
 * Computes the stereochemically accurate 2D coordinates for an anti-periplanar beta-hydrogen
 * on C-beta during an E2 elimination.
 *
 * In E2, the beta C-H bond must be coplanar and anti (180 deg) to the alpha C-LG bond.
 * In a 2D projection, the H atom is positioned extending away from C-beta on the opposite side
 * of the C(beta)-C(alpha) axis from the leaving group.
 */
export function computeBetaHydrogenGeometry(
  cBeta: AtomGeometry,
  cAlpha: AtomGeometry,
  lgAtom?: AtomGeometry,
  bondLength = 25,
): BetaHydrogenInfo {
  // Vector from C-beta to C-alpha
  const vbaX = cAlpha.x - cBeta.x;
  const vbaY = cAlpha.y - cBeta.y;
  const lenBa = Math.hypot(vbaX, vbaY) || 1;
  const ubaX = vbaX / lenBa;
  const ubaY = vbaY / lenBa;

  // Normal to C(beta)-C(alpha) axis
  const nX = -ubaY;
  const nY = ubaX;

  // Leaving group orientation relative to axis
  let lgSide = 1;
  if (lgAtom) {
    const vlgX = lgAtom.x - cAlpha.x;
    const vlgY = lgAtom.y - cAlpha.y;
    const dot = vlgX * nX + vlgY * nY;
    lgSide = dot >= 0 ? 1 : -1;
  }

  // Anti-periplanar side is opposite to LG side
  const hSide = -lgSide;

  // 120-degree angle projection for sp3 C-beta (cos(60 deg) = 0.5 away from C-alpha, sin(60 deg) = 0.866 along normal)
  const hDirX = -ubaX * 0.5 + nX * hSide * 0.866;
  const hDirY = -ubaY * 0.5 + nY * hSide * 0.866;
  const hDirLen = Math.hypot(hDirX, hDirY) || 1;
  const normHDirX = hDirX / hDirLen;
  const normHDirY = hDirY / hDirLen;

  const hDist = Math.max(16, bondLength * 0.88);
  const hX = cBeta.x + normHDirX * hDist;
  const hY = cBeta.y + normHDirY * hDist;

  return {
    x: hX,
    y: hY,
    direction: { x: normHDirX, y: normHDirY },
    cBeta: { x: cBeta.x, y: cBeta.y },
    bondLength: hDist,
  };
}

/**
 * Obstacle-aware trajectory router for electron-pushing curved arrows.
 *
 * Evaluates candidate Bezier curves around molecular structures and selects
 * the trajectory that avoids bond and atom collisions while maintaining proper ChemDraw
 * arrival angle and target setback.
 */
export function routeMechanismArrow(
  options: ArrowRoutingOptions,
  obstacles?: ObstacleMap,
): ArrowRouteResult {
  const {
    source,
    target,
    sourceEntityId,
    targetEntityId,
    targetType = "atom",
    targetRadius = 7.5,
    arrowheadLength = 6.0,
    preferredDirection = "auto",
    curveOffset,
    curveOrder = 0,
    ignoredObstacleIds = [],
    bondLength = 25,
  } = options;

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const directDist = Math.hypot(dx, dy) || 1;
  const uDirX = dx / directDist;
  const uDirY = dy / directDist;

  // Normal vector perpendicular to direct source->target chord
  const normX = -uDirY;
  const normY = uDirX;

  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  // Build ignored set for obstacle detection
  const ignoredSet = new Set<string>(ignoredObstacleIds);
  if (sourceEntityId) ignoredSet.add(sourceEntityId);
  if (targetEntityId) ignoredSet.add(targetEntityId);

  // ChemDraw setback from target: arrowhead tip touches atom perimeter or bond padding
  const setback =
    targetRadius === 0
      ? 0
      : Math.min(
          directDist * 0.35,
          targetType === "atom" ? targetRadius + 1.2 : 3.5,
        );

  // Determine candidate curvature offsets
  const baseOffset =
    curveOffset !== undefined
      ? Math.abs(curveOffset)
      : Math.max(14, Math.min(65, directDist * 0.38 + curveOrder * 8));

  // Candidate multipliers for curve displacement
  const candidateMagnitudes = [1.0, 1.45, 1.9, 0.7, 2.4];
  const candidateOffsets: number[] = [];

  const prefSign = preferredDirection === "clockwise" ? -1 : preferredDirection === "counter-clockwise" ? 1 : 0;

  if (prefSign !== 0) {
    for (const mag of candidateMagnitudes) {
      candidateOffsets.push(prefSign * baseOffset * mag);
    }
    for (const mag of candidateMagnitudes) {
      candidateOffsets.push(-prefSign * baseOffset * mag);
    }
  } else {
    // Default/auto: prioritize upward curvature into open space in SVG coordinates
    const upwardSign = uDirX >= 0 ? -1 : 1;
    for (const mag of candidateMagnitudes) {
      candidateOffsets.push(upwardSign * baseOffset * mag);
      candidateOffsets.push(-upwardSign * baseOffset * mag);
    }
  }

  interface CandidateEvaluation {
    ctrl: Point;
    end: Point;
    arrivalTangent: Point;
    offset: number;
    collisions: number;
    penalty: number;
  }

  const evaluated: CandidateEvaluation[] = [];

  for (const offset of candidateOffsets) {
    const rawCtrlX = midX + normX * offset;
    const rawCtrlY = midY + normY * offset;

    // Arrival tangent at target: vector from control point to target
    const toArrX = target.x - rawCtrlX;
    const toArrY = target.y - rawCtrlY;
    const arrLen = Math.hypot(toArrX, toArrY) || 1;
    const arrNormX = toArrX / arrLen;
    const arrNormY = toArrY / arrLen;

    // Setback end point along arrival tangent
    const endX = target.x - arrNormX * setback;
    const endY = target.y - arrNormY * setback;

    let collisions = 0;
    let penalty = 0;

    // Direction preference penalty if candidate opposes preferred direction
    if (prefSign !== 0 && Math.sign(offset) !== prefSign) {
      penalty += 35;
    }

    // Excessive arch penalty (favor natural ChemDraw curvature when clear)
    penalty += Math.abs(offset - baseOffset) * 0.2;

    if (obstacles) {
      const curvePoints = sampleQuadraticBezier(
        source,
        { x: rawCtrlX, y: rawCtrlY },
        { x: endX, y: endY },
        14,
        0.18,
        0.82,
      );

      // Check segments (bonds)
      for (const seg of obstacles.segments) {
        if (ignoredSet.has(seg.id)) continue;
        for (const pt of curvePoints) {
          const d = pointToSegmentDistance(pt, seg.p1, seg.p2);
          if (d < seg.padding) {
            collisions += 1;
            penalty += (seg.padding - d) * 15;
          }
        }
      }

      // Check circles (atoms)
      for (const circ of obstacles.circles) {
        if (ignoredSet.has(circ.id)) continue;
        for (const pt of curvePoints) {
          const d = Math.hypot(pt.x - circ.center.x, pt.y - circ.center.y);
          if (d < circ.radius) {
            collisions += 1;
            penalty += (circ.radius - d) * 20;
          }
        }
      }
    }

    evaluated.push({
      ctrl: { x: rawCtrlX, y: rawCtrlY },
      end: { x: endX, y: endY },
      arrivalTangent: { x: arrNormX, y: arrNormY },
      offset,
      collisions,
      penalty,
    });

    // If zero collisions found and matches preferred direction, we can break early
    if (collisions === 0 && (prefSign === 0 || Math.sign(offset) === prefSign)) {
      break;
    }
  }

  // Pick candidate with least collisions first, then least penalty
  evaluated.sort((a, b) => {
    if (a.collisions !== b.collisions) return a.collisions - b.collisions;
    return a.penalty - b.penalty;
  });

  const best = evaluated[0] || {
    ctrl: { x: midX + normX * baseOffset, y: midY + normY * baseOffset },
    end: { x: target.x - uDirX * setback, y: target.y - uDirY * setback },
    arrivalTangent: { x: uDirX, y: uDirY },
    offset: baseOffset,
    collisions: 0,
    penalty: 0,
  };

  const pathData = `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} Q ${best.ctrl.x.toFixed(1)} ${best.ctrl.y.toFixed(1)} ${best.end.x.toFixed(1)} ${best.end.y.toFixed(1)}`;

  return {
    d: pathData,
    start: source,
    ctrl: best.ctrl,
    end: best.end,
    arrivalTangent: best.arrivalTangent,
    collisionCount: best.collisions,
    offsetUsed: best.offset,
  };
}
