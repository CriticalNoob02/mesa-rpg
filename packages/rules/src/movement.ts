/**
 * Movimento no grid tático (quadrado = 1,5 m = 5 pés), diagonal 1-2-1: a 1ª
 * diagonal custa 1, a 2ª custa 2, a 3ª 1… contando todas as diagonais da rodada.
 * `parity` guarda se a próxima diagonal custa 2 (1) ou 1 (0).
 */

export type Cell = { x: number; y: number };

export const SQUARE_FEET = 5;
export const SQUARE_METERS = 1.5;

/** Custo em quadrados de ir em linha "reta" (mínimo) de `a` até `b`, e a paridade depois. */
export function moveCost(a: Cell, b: Cell, parity = 0): { squares: number; parity: number } {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const diagonals = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonals;
  return {
    squares: straight + diagonals + Math.floor((diagonals + parity) / 2),
    parity: (parity + diagonals) % 2,
  };
}

/** Custo de um caminho célula a célula (cada passo para uma vizinha). */
export function pathCost(path: Cell[], parity = 0): { squares: number; parity: number } {
  let squares = 0;
  let p = parity;
  for (let i = 1; i < path.length; i++) {
    const step = moveCost(path[i - 1]!, path[i]!, p);
    if (Math.abs(path[i]!.x - path[i - 1]!.x) > 1 || Math.abs(path[i]!.y - path[i - 1]!.y) > 1) {
      throw new Error("Caminho com salto: passos devem ser entre células vizinhas.");
    }
    squares += step.squares;
    p = step.parity;
  }
  return { squares, parity: p };
}

/** Quadrados por ação de movimento a partir do deslocamento em pés. */
export const speedSquares = (feet: number) => Math.floor(feet / SQUARE_FEET);

/** Limites da rodada: uma ação de movimento, movimento dobrado e corrida. */
export function moveBudgets(speedFeet: number, runMultiplier = 4) {
  const move = speedSquares(speedFeet);
  return { move, double: move * 2, run: move * runMultiplier };
}

/**
 * Custo mínimo de `origin` até cada célula do retângulo `cols`×`rows` (sem
 * obstáculos), respeitando a paridade já gasta na rodada. Devolve só as células
 * com custo ≤ `budget`, como mapa "x:y" → quadrados.
 */
export function reachable(
  origin: Cell,
  budget: number,
  bounds: { cols: number; rows: number },
  parity = 0,
): Map<string, number> {
  const out = new Map<string, number>();
  if (budget < 0) return out;
  const r = budget; // nenhuma célula além de `budget` em qualquer eixo
  for (let y = Math.max(0, origin.y - r); y <= Math.min(bounds.rows - 1, origin.y + r); y++) {
    for (let x = Math.max(0, origin.x - r); x <= Math.min(bounds.cols - 1, origin.x + r); x++) {
      const { squares } = moveCost(origin, { x, y }, parity);
      if (squares <= budget) out.set(`${x}:${y}`, squares);
    }
  }
  return out;
}

export const squaresToMeters = (squares: number) => squares * SQUARE_METERS;
