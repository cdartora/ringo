import type { LancamentoFinanceiroParsed } from "@ringo/shared";

export const COL = { A: 0, B: 1, C: 2, D: 3, E: 4 } as const;

export const DEFAULT_FIRST_DATA_ROW = 4;
export const DEFAULT_MAX_DATA_ROWS = 400;

export function escapeSheetTitleForRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export function ymdToPtBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function descriptionForColumnE(l: LancamentoFinanceiroParsed): string {
  const desc = l.descricao.trim();
  const cat = l.categoria?.trim();
  if (cat) return `${cat} — ${desc}`;
  return desc;
}
