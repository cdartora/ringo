import type { LancamentoFinanceiro } from "@ringo/shared";

const tipoPt: Record<string, string> = {
  expense: "despesa",
  income: "receita",
};

export function formatLaunchLine(l: LancamentoFinanceiro): string {
  const tipo = tipoPt[l.tipo] ?? l.tipo;
  const valor = `${l.moeda ?? "—"} ${l.valor}`;
  const data = l.data ?? "?";
  const cat = l.categoria ? ` · ${l.categoria}` : "";
  return `${tipo} · ${valor} · ${l.descricao}${cat} (${data})`;
}
