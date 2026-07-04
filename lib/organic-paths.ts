type Point = {
  x: number;
  y: number;
};

export function fmt(value: number) {
  return Number(value.toFixed(1));
}

export function seededUnit(seed: number, index: number) {
  const value = Math.sin(seed * 97.133 + index * 38.771) * 43758.5453;
  return value - Math.floor(value);
}

export function organicBlobPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  pointCount = 12,
  roughness = 0.18,
) {
  const points = Array.from({ length: pointCount }, (_, index) => {
    const angle =
      (Math.PI * 2 * index) / pointCount +
      (seededUnit(seed, index) - 0.5) * 0.24;
    const radius = 1 + (seededUnit(seed, index + 19) - 0.5) * roughness;

    return {
      x: cx + Math.cos(angle) * rx * radius,
      y: cy + Math.sin(angle) * ry * radius,
    };
  });

  return smoothClosedPath(points);
}

export function almondLeafPath(cx: number, cy: number, size: number) {
  const width = size * 0.34;
  const top = cy - size * 0.56;
  const bottom = cy + size * 0.56;

  return [
    `M ${fmt(cx)} ${fmt(top)}`,
    `C ${fmt(cx + width)} ${fmt(cy - size * 0.34)} ${fmt(cx + width)} ${fmt(cy + size * 0.26)} ${fmt(cx)} ${fmt(bottom)}`,
    `C ${fmt(cx - width)} ${fmt(cy + size * 0.26)} ${fmt(cx - width)} ${fmt(cy - size * 0.34)} ${fmt(cx)} ${fmt(top)}`,
    "Z",
  ].join(" ");
}

export function grassBladePath(
  x: number,
  y: number,
  height: number,
  bend: number,
  width = 3.2,
) {
  const tipX = x + bend;
  const tipY = y - height;
  const leftBase = x - width * 0.5;
  const rightBase = x + width * 0.5;

  return [
    `M ${fmt(leftBase)} ${fmt(y)}`,
    `C ${fmt(x - width)} ${fmt(y - height * 0.36)} ${fmt(x + bend * 0.26)} ${fmt(y - height * 0.74)} ${fmt(tipX)} ${fmt(tipY)}`,
    `C ${fmt(x + bend * 0.5)} ${fmt(y - height * 0.66)} ${fmt(x + width)} ${fmt(y - height * 0.26)} ${fmt(rightBase)} ${fmt(y)}`,
    "Z",
  ].join(" ");
}

function smoothClosedPath(points: Point[]) {
  const tension = 0.86;
  const length = points.length;
  const [first] = points;
  const segments = [`M ${fmt(first.x)} ${fmt(first.y)}`];

  for (let index = 0; index < length; index += 1) {
    const previous = points[(index - 1 + length) % length];
    const current = points[index];
    const next = points[(index + 1) % length];
    const afterNext = points[(index + 2) % length];

    const c1 = {
      x: current.x + ((next.x - previous.x) / 6) * tension,
      y: current.y + ((next.y - previous.y) / 6) * tension,
    };
    const c2 = {
      x: next.x - ((afterNext.x - current.x) / 6) * tension,
      y: next.y - ((afterNext.y - current.y) / 6) * tension,
    };

    segments.push(
      `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(next.x)} ${fmt(next.y)}`,
    );
  }

  segments.push("Z");

  return segments.join(" ");
}
