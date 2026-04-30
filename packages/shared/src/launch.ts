/**
 * Lançamento financeiro normalizado (saída esperada da LLM).
 * Espelha o schema em docs/context/ringo-system.md.
 */
export type TipoLancamento = "expense" | "income";

/**
 * Moeda ISO 4217 (ex.: BRL). A doc de produto pode fixar BRL como padrão.
 */
export type Moeda = string;

export type LancamentoFinanceiro = {
  /** Versão do schema (`versao_schema` no JSON). */
  versao_schema: number;
  tipo: TipoLancamento;
  valor: number;
  moeda?: Moeda;
  descricao: string;
  categoria: string | null;
  /** `YYYY-MM-DD` ou null quando a LLM não inferir a data. */
  data: string | null;
  observacoes?: string | null;
  /** Confiança da extração; opcional até o prompt da LLM definir. */
  confianca?: "high" | "medium" | "low" | null;
};
