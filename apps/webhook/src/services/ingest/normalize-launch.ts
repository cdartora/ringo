import type { LancamentoFinanceiroParsed } from "@ringo/shared";

export function ensureMoedaDefault(
  l: LancamentoFinanceiroParsed,
): LancamentoFinanceiroParsed {
  if (l.moeda?.trim()) return l;
  return { ...l, moeda: "BRL" };
}

function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Quando `data` é null, usa a componente de calendário local de `recebido_em` (ISO). */
export function fillMissingLaunchDate(
  lancamento: LancamentoFinanceiroParsed,
  recebidoEmIso: string,
): LancamentoFinanceiroParsed {
  const withMoeda = ensureMoedaDefault(lancamento);
  if (withMoeda.data !== null) return withMoeda;
  const d = new Date(recebidoEmIso);
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return { ...withMoeda, data: formatLocalYMD(base) };
}

function formatValor(l: LancamentoFinanceiroParsed): string {
  const moeda = l.moeda ?? "BRL";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
    }).format(l.valor);
  } catch {
    return `${l.valor.toFixed(2)} ${moeda}`;
  }
}

export function buildLaunchConfirmationMessage(
  l: LancamentoFinanceiroParsed,
): string {
  const valorFmt = formatValor(l);
  const tipoPt = l.tipo === "expense" ? "Despesa" : "Receita";
  const cat =
    l.categoria !== null && l.categoria !== "" ? ` · ${l.categoria}` : "";
  return `${tipoPt}: ${valorFmt}${cat} · ${l.data ?? ""} — ${l.descricao}. Reconhecido (planilha ainda não ligada).`;
}
