// Geradores determinísticos de formas orgânicas para o cenário do Habitat.
// A mesma semente produz sempre a mesma forma — nada muda entre renders,
// mas nenhuma silhueta é um círculo ou faixa geométrica perfeita.

export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Point = [number, number];

function closedCatmullRom(points: Point[]): string {
  const n = points.length;
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

export interface BlobOptions {
  bumps?: number;
  jitter?: number;
  squashY?: number;
  seed?: number;
}

/** Mancha orgânica fechada (massa de folhagem, nuvem, musgo, clareira…). */
export function blobPath(
  cx: number,
  cy: number,
  r: number,
  { bumps = 10, jitter = 0.16, squashY = 0.92, seed = 1 }: BlobOptions = {},
): string {
  const points: Point[] = [];
  for (let i = 0; i < bumps; i += 1) {
    const angle = (i / bumps) * Math.PI * 2;
    const wobble = 1 + (pseudoRandom(seed * 13 + i) - 0.5) * 2 * jitter;
    points.push([
      cx + Math.cos(angle) * r * wobble,
      cy + Math.sin(angle) * r * wobble * squashY,
    ]);
  }
  return closedCatmullRom(points);
}

/**
 * Cumeada ondulada fechada até `bottomY` — colinas e linhas de floresta
 * distante. Mais `bumps` = recortes de copa mais miúdos.
 */
export function ridgePath(
  width: number,
  baseY: number,
  amplitude: number,
  bumps: number,
  seed: number,
  bottomY: number,
): string {
  const points: Point[] = [];
  for (let i = 0; i <= bumps; i += 1) {
    const x = (i / bumps) * width;
    const lift = pseudoRandom(seed * 7 + i) * amplitude;
    points.push([x, baseY - lift]);
  }

  let d = `M -14 ${bottomY} L -14 ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} L ${width + 14} ${bottomY} Z`;
}

/** Tufo de capim: hastes curvas independentes partindo de (x, baseY). */
export function grassTuft(
  x: number,
  baseY: number,
  height: number,
  blades: number,
  seed: number,
): string[] {
  const paths: string[] = [];
  for (let i = 0; i < blades; i += 1) {
    const rootX = x + (i - (blades - 1) / 2) * 5;
    const lean = (pseudoRandom(seed * 23 + i) - 0.5) * 1.7;
    const h = height * (0.55 + pseudoRandom(seed * 41 + i) * 0.5);
    const tipX = rootX + lean * h * 0.55;
    const ctrlX = rootX + lean * h * 0.2;
    paths.push(
      `M ${rootX.toFixed(1)} ${baseY.toFixed(1)} Q ${ctrlX.toFixed(1)} ${(baseY - h * 0.6).toFixed(1)} ${tipX.toFixed(1)} ${(baseY - h).toFixed(1)}`,
    );
  }
  return paths;
}
