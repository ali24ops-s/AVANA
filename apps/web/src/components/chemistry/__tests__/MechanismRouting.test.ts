import { describe, it, expect } from "vitest";
import {
  pointToSegmentDistance,
  sampleQuadraticBezier,
  buildObstacleMap,
  computeBetaHydrogenGeometry,
  routeMechanismArrow,
  type Point,
} from "../MechanismRouting.js";
import type { AtomGeometry, MoleculeGeometry } from "../SmilesDrawerGeometryAdapter.js";

describe("MechanismRouting — Obstacle-Aware Arrow Trajectory & Geometry", () => {
  it("calculates perpendicular and endpoint distances from a point to a segment", () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 100, y: 0 };

    // Point exactly above midpoint
    expect(pointToSegmentDistance({ x: 50, y: 25 }, a, b)).toBeCloseTo(25, 2);

    // Point on the segment
    expect(pointToSegmentDistance({ x: 30, y: 0 }, a, b)).toBeCloseTo(0, 2);

    // Point beyond end 'b'
    expect(pointToSegmentDistance({ x: 130, y: 40 }, a, b)).toBeCloseTo(50, 2); // 30^2 + 40^2 = 50^2

    // Point beyond start 'a'
    expect(pointToSegmentDistance({ x: -30, y: 40 }, a, b)).toBeCloseTo(50, 2);
  });

  it("samples points along a quadratic Bezier curve strictly within intermediate t range", () => {
    const p0: Point = { x: 0, y: 0 };
    const p1: Point = { x: 50, y: 100 };
    const p2: Point = { x: 100, y: 0 };

    const samples = sampleQuadraticBezier(p0, p1, p2, 10, 0.15, 0.85);
    expect(samples).toHaveLength(10);

    // Every sample must be strictly between 0 and 100 in X and above 0 in Y
    for (const pt of samples) {
      expect(pt.x).toBeGreaterThan(0);
      expect(pt.x).toBeLessThan(100);
      expect(pt.y).toBeGreaterThan(0);
    }
  });

  it("routes an arrow directly with target setback when no obstacles are present", () => {
    const source: Point = { x: 10, y: 50 };
    const target: Point = { x: 90, y: 50 };

    const route = routeMechanismArrow({
      source,
      target,
      targetType: "atom",
      targetRadius: 8,
    });

    expect(route.d).toBeTruthy();
    expect(route.d).toMatch(/^M 10\.0 50\.0 Q/);
    expect(route.collisionCount).toBe(0);

    // End point must be set back from target (8 + 1.2 = 9.2px)
    const distToEnd = Math.hypot(target.x - route.end.x, target.y - route.end.y);
    expect(distToEnd).toBeCloseTo(9.2, 1);
  });

  it("evades an obstacle bond directly blocking the path by routing around it", () => {
    const source: Point = { x: 10, y: 50 };
    const target: Point = { x: 110, y: 50 };

    // Obstacle vertical bond right across the middle at x=60, y from 30 to 70
    const obstacleGeom: MoleculeGeometry = {
      atoms: [
        { index: 0, element: "C", x: 60, y: 30, charge: 0, hydrogenCount: 0, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [1] },
        { index: 1, element: "C", x: 60, y: 70, charge: 0, hydrogenCount: 0, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [0] },
      ],
      bonds: [
        { atom1: 0, atom2: 1, order: 1, x1: 60, y1: 30, x2: 60, y2: 70, midpointX: 60, midpointY: 50, normalX: 1, normalY: 0, length: 40 },
      ],
      averageBondLength: 40,
    };

    const obstacleMap = buildObstacleMap([{ geometry: obstacleGeom, participantIndex: 0 }]);

    const route = routeMechanismArrow(
      {
        source,
        target,
        targetType: "atom",
        targetRadius: 8,
      },
      obstacleMap,
    );

    // The chosen curve must have 0 collisions by curving around the bond
    expect(route.collisionCount).toBe(0);
    // Control point Y must be far enough from y=50 to clear the bond
    expect(Math.abs(route.ctrl.y - 50)).toBeGreaterThan(25);
  });

  it("computes stereochemically anti-periplanar beta-hydrogen for E2 elimination", () => {
    // CCBr: C-beta at (20, 50), C-alpha at (50, 50), Br at (70, 70) (towards +y)
    const cBeta: AtomGeometry = {
      index: 0,
      element: "C",
      x: 20,
      y: 50,
      charge: 0,
      hydrogenCount: 3,
      isAromatic: false,
      lonePairsCount: 0,
      lonePairs: [],
      neighborIndices: [1],
    };
    const cAlpha: AtomGeometry = {
      index: 1,
      element: "C",
      x: 50,
      y: 50,
      charge: 0,
      hydrogenCount: 2,
      isAromatic: false,
      lonePairsCount: 0,
      lonePairs: [],
      neighborIndices: [0, 2],
    };
    const lgBr: AtomGeometry = {
      index: 2,
      element: "Br",
      x: 70,
      y: 70, // Br is situated downwards (+y)
      charge: 0,
      hydrogenCount: 0,
      isAromatic: false,
      lonePairsCount: 3,
      lonePairs: [],
      neighborIndices: [1],
    };

    const betaH = computeBetaHydrogenGeometry(cBeta, cAlpha, lgBr, 30);

    // Since Br is at +y, anti-periplanar H must be on the opposite side (-y)
    expect(betaH.y).toBeLessThan(cBeta.y);
    // H must extend away from C-alpha (x < cBeta.x)
    expect(betaH.x).toBeLessThan(cBeta.x);
    // Bond length must match expected distance
    const dist = Math.hypot(betaH.x - cBeta.x, betaH.y - cBeta.y);
    expect(dist).toBeGreaterThan(20);
  });
});
