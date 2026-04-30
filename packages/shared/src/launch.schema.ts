import { z } from "zod";

const dataLancamentoSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.null(),
]);

export const lancamentoFinanceiroSchema = z.object({
  versao_schema: z.literal(1),
  tipo: z.enum(["expense", "income"]),
  valor: z.number().finite(),
  moeda: z.string().min(1).optional(),
  descricao: z.string().min(1),
  categoria: z.union([z.string(), z.null()]),
  data: dataLancamentoSchema,
  observacoes: z.union([z.string(), z.null()]).optional(),
  confianca: z
    .enum(["high", "medium", "low"])
    .nullable()
    .optional(),
});

export type LancamentoFinanceiroParsed = z.infer<
  typeof lancamentoFinanceiroSchema
>;

export type ParseLancamentoFinanceiroResult =
  | { ok: true; value: LancamentoFinanceiroParsed }
  | { ok: false; error: z.ZodError };

export function parseLancamentoFinanceiro(
  json: unknown,
): ParseLancamentoFinanceiroResult {
  const parsed = lancamentoFinanceiroSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, value: parsed.data };
}
