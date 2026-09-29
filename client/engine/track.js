/**
 * client/engine/track.js
 * Responsibility: Mumen (Core Game Engine)
 *
 * Modular Multi-Track Configuration & Geometry Catalog.
 * Active Track: "Grand Prix Raceway (Kit Edition)" - 100% Asset-Assembled Circuit (1600x1000).
 * Legacy procedural tracks (Alpine Circuit, Lunar Skyway) are archived in client/archive/legacy_graphics.js.
 */

// Track: Grand Prix Kit Raceway (100% Modular Kit Assembled Circuit)
export const GRANDPRIX_WAYPOINTS = [
  { x: 743, y: 805 },  // 0: Start / Finish Gantry on Home Straight
  { x: 950, y: 805 },  // 1: Home Straight East
  { x: 1180, y: 805 }, // 2: Braking Zone Turn 1
  { x: 1320, y: 750 }, // 3: Turn 1 Apex
  { x: 1370, y: 600 }, // 4: East Straight Mid
  { x: 1370, y: 380 }, // 5: Turn 2 Entry
  { x: 1320, y: 160 }, // 6: Turn 2 Apex
  { x: 1150, y: 120 }, // 7: Back Straight East
  { x: 900, y: 120 },  // 8: Back Straight Mid
  { x: 650, y: 120 },  // 9: Back Straight West
  { x: 420, y: 120 },  // 10: Turn 3 Entry
  { x: 280, y: 160 },  // 11: Turn 3 Apex
  { x: 230, y: 400 },  // 12: West Straight Mid
  { x: 230, y: 600 },  // 13: West Straight South
  { x: 280, y: 750 },  // 14: Turn 4 Apex
  { x: 450, y: 805 }   // 15: Home Straight West
];

export const GRANDPRIX_GRID = [
  { slot: 'P1', x: 670, y: 775, angle: 0 },
  { slot: 'P2', x: 610, y: 835, angle: 0 },
  { slot: 'P3', x: 550, y: 775, angle: 0 },
  { slot: 'P4', x: 490, y: 835, angle: 0 }
];

export const GRANDPRIX_CHECKPOINTS = [
  { index: 0, name: 'Start / Finish', x: 743, y: 805, radius: 120, targetAngle: 0, isFinish: true },
  { index: 1, name: 'East Sector', x: 1370, y: 600, radius: 120, targetAngle: 270, isFinish: false },
  { index: 2, name: 'North Sector', x: 900, y: 120, radius: 120, targetAngle: 180, isFinish: false },
  { index: 3, name: 'West Sector', x: 230, y: 500, radius: 120, targetAngle: 90, isFinish: false }
];

// Triplet item box spawns (3 side-by-side per station for fair multiplayer access)
export const GRANDPRIX_ITEM_BOXES = [
  // Station 1: Home Straight (Eastbound)
  { id: 'gp-box-1a', x: 950, y: 765, radius: 22 },
  { id: 'gp-box-1b', x: 950, y: 805, radius: 22 },
  { id: 'gp-box-1c', x: 950, y: 845, radius: 22 },
  // Station 2: East Straight (Northbound)
  { id: 'gp-box-2a', x: 1330, y: 480, radius: 22 },
  { id: 'gp-box-2b', x: 1370, y: 480, radius: 22 },
  { id: 'gp-box-2c', x: 1410, y: 480, radius: 22 },
  // Station 3: Back Straight (Westbound)
  { id: 'gp-box-3a', x: 900, y: 80, radius: 22 },
  { id: 'gp-box-3b', x: 900, y: 120, radius: 22 },
  { id: 'gp-box-3c', x: 900, y: 160, radius: 22 },
  // Station 4: West Straight (Southbound)
  { id: 'gp-box-4a', x: 190, y: 500, radius: 22 },
  { id: 'gp-box-4b', x: 230, y: 500, radius: 22 },
  { id: 'gp-box-4c', x: 270, y: 500, radius: 22 }
];

// Discoverable sideline green UFO box spawn (located in grass near north road corridor)
export const GRANDPRIX_UFO_SPAWNS = [
  { id: 'gp-ufo-1', x: 750, y: 240, radius: 30 }
];

// Static solid obstacles (Spectator grandstand tents & paddock buildings)
export const GRANDPRIX_OBSTACLES = [
  // Pavilion grandstand 1 (outfield South)
  { id: 'tent-1', x: 400, y: 920, width: 233, height: 75, type: 'tent' },
  // Pavilion grandstand 2 (outfield South)
  { id: 'tent-2', x: 933, y: 920, width: 233, height: 75, type: 'tent' },
  // Paddock pit buildings (infield)
  { id: 'bldg-1', x: 417, y: 450, width: 133, height: 195, type: 'building' },
  { id: 'bldg-2', x: 583, y: 450, width: 133, height: 195, type: 'building' }
];

import { CANYON_SLALOM } from './tracks/canyon_slalom.js';
import { HOURGLASS } from './tracks/hourglass.js';

export const TRACK_CATALOG = {
  grandprix: {
    id: 'grandprix',
    name: 'Grand Prix Raceway',
    difficulty: 'Easy',
    preview: '/assets/kit/track_assembled.png',
    theme: 'kit',
    image: '/assets/kit/track_assembled.png',
    width: 1600,
    height: 1000,
    roadWidth: 136,
    kerbWidth: 26,
    waypoints: GRANDPRIX_WAYPOINTS,
    startingGrid: GRANDPRIX_GRID,
    checkpoints: GRANDPRIX_CHECKPOINTS,
    itemBoxes: GRANDPRIX_ITEM_BOXES,
    ufoSpawns: GRANDPRIX_UFO_SPAWNS,
    obstacles: GRANDPRIX_OBSTACLES,
    svgPath: null
  },
  hourglass: HOURGLASS,
  canyon_slalom: CANYON_SLALOM
};

export const TRACK_LIST = [
  {
    id: 'grandprix',
    name: 'Grand Prix Raceway',
    difficulty: 'Easy',
    preview: '/assets/kit/track_assembled.png'
  },
  {
    id: 'hourglass',
    name: 'Hourglass Raceway',
    difficulty: 'Medium',
    preview: '/assets/tracks/hourglass/preview.webp'
  },
  {
    id: 'canyon_slalom',
    name: 'Canyon Slalom',
    difficulty: 'Hard',
    preview: '/assets/tracks/canyon_slalom/preview.webp'
  }
];

let currentTrackId = 'grandprix';

export function getActiveTrack(trackId = currentTrackId) {
  const track = TRACK_CATALOG[trackId] || TRACK_CATALOG.grandprix;
  if (!track.svgPath) {
    track.svgPath = getTrackSvgPath(track.waypoints);
  }
  return track;
}

export function setActiveTrack(trackId) {
  if (TRACK_CATALOG[trackId]) {
    currentTrackId = trackId;
  }
  return getActiveTrack();
}

// Backwards-compatible aliases for active track
export const TRACK_WIDTH = 1600;
export const TRACK_HEIGHT = 1000;
export const ROAD_WIDTH = 136;
export const KERB_WIDTH = 26;
export const TRACK_WAYPOINTS = GRANDPRIX_WAYPOINTS;
export const STARTING_GRID = GRANDPRIX_GRID;
export const CHECKPOINTS = GRANDPRIX_CHECKPOINTS;
export const ITEM_BOX_SPAWNS = GRANDPRIX_ITEM_BOXES;
export const UFO_BOX_SPAWNS = GRANDPRIX_UFO_SPAWNS;
export const OBSTACLES = GRANDPRIX_OBSTACLES;

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function checkTrackSurface(x, y, track = null) {
  const activeTrack = track || getActiveTrack();
  const pts = activeTrack.waypoints;
  const count = pts.length;
  let minDist = Infinity;

  for (let i = 0; i < count; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % count];
    const d = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    if (d < minDist) {
      minDist = d;
    }
  }

  const roadHalf = activeTrack.roadWidth / 2; // 68px (dark asphalt)
  const kerbHalf = roadHalf + activeTrack.kerbWidth; // 94px (rumble strip curb lines)

  if (minDist <= roadHalf) {
    return { surface: 'asphalt', friction: 1.0, minDist, isOnTrack: true };
  } else if (minDist <= kerbHalf) {
    return { surface: 'kerb', friction: 0.75, minDist, isOnTrack: true };
  } else {
    return { surface: 'gravel', friction: 0.40, minDist, isOnTrack: false };
  }
}

export function getTrackSvgPath(waypoints = null) {
  const pts = waypoints || GRANDPRIX_WAYPOINTS;
  const n = pts.length;
  const startMidX = (pts[n - 1].x + pts[0].x) / 2;
  const startMidY = (pts[n - 1].y + pts[0].y) / 2;
  let d = `M ${startMidX.toFixed(1)} ${startMidY.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  d += ' Z';
  return d;
}
