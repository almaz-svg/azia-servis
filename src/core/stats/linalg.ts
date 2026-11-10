/** Минимальная линейная алгебра для регрессий 2–4 параметров. Матрицы — массивы строк. */

export type Matrix = number[][];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const out = zeros(a.length, b[0]?.length ?? 0);
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < b.length; k++) {
      const aik = a[i]![k]!;
      if (aik === 0) continue;
      for (let j = 0; j < out[0]!.length; j++) {
        out[i]![j]! += aik * b[k]![j]!;
      }
    }
  }
  return out;
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Обращение матрицы методом Гаусса–Жордана с выбором главного элемента. null — если матрица вырождена. */
export function invert(a: Matrix): Matrix | null {
  const n = a.length;
  const m: Matrix = a.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];

    const p = m[col]![col]!;
    for (let j = 0; j < 2 * n; j++) m[col]![j]! /= p;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) m[r]![j]! -= f * m[col]![j]!;
    }
  }
  return m.map((row) => row.slice(n));
}
