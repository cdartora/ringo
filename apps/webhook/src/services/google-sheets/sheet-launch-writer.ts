import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import type { IngestResponse, LancamentoFinanceiroParsed } from "@ringo/shared";
import type { GoogleSheetsEnvConfig } from "../../config.js";
import {
  COL,
  descriptionForColumnE,
  escapeSheetTitleForRange,
  ymdToPtBr,
} from "./sheet-layout.js";

export type PersistLaunchResult =
  | { ok: true; wroteToSheet: boolean }
  | { ok: false; response: IngestResponse };

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function isEmptyCell(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return false;
  return String(v).trim() === "";
}

/** Normaliza célula de data (A) para `YYYY-MM-DD`. */
export function normalizeCellToYmd(cell: unknown): string | null {
  if (cell === undefined || cell === null || cell === "") return null;
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return sheetsSerialToYmd(cell);
  }
  const s = String(cell).trim();
  const mPt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mPt) {
    const d = mPt[1]!.padStart(2, "0");
    const mo = mPt[2]!.padStart(2, "0");
    const y = mPt[3]!;
    return `${y}-${mo}-${d}`;
  }
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  return null;
}

/** Epoch Google Sheets: 30 Dec 1899 (serial 0 = 1899-12-30). */
function sheetsSerialToYmd(serial: number): string {
  const epochUtc = Date.UTC(1899, 11, 30);
  const ms = epochUtc + Math.round(serial * 86400000);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sheetErrorResponse(
  codigo: string,
  mensagemUsuario: string,
): PersistLaunchResult {
  return {
    ok: false,
    response: {
      ok: false,
      mensagem_usuario: mensagemUsuario,
      erro: { codigo, mensagem: mensagemUsuario },
    },
  };
}

async function resolveSheetId(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabTitle: string | null,
): Promise<{ sheetId: number; title: string } | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const list = meta.data.sheets ?? [];
  if (!list.length) return null;
  if (!tabTitle?.trim()) {
    const p = list[0]!.properties!;
    return { sheetId: p.sheetId!, title: p.title! };
  }
  const want = tabTitle.trim();
  for (const s of list) {
    const p = s.properties;
    if (p?.title === want) {
      return { sheetId: p.sheetId!, title: p.title! };
    }
  }
  return null;
}


function mapApiErr(
  err: unknown,
  serviceAccountEmail: string | null,
): PersistLaunchResult {
  const g = err as {
    code?: number | string;
    message?: string;
    response?: { status?: number };
  };
  const code =
    typeof g.code === "number"
      ? g.code
      : typeof g.code === "string" && Number.isFinite(Number(g.code))
        ? Number(g.code)
        : g.response?.status;
  if (code === 404) {
    return sheetErrorResponse(
      "sheet_not_found",
      "Planilha não encontrada. Confirma o ID e o acesso da service account.",
    );
  }
  if (code === 403 || code === 401) {
    const who =
      serviceAccountEmail ??
      "o valor de client_email no ficheiro da service account";
    return sheetErrorResponse(
      "sheet_permission_denied",
      `Sem permissão para editar a planilha. No Google Sheets: Partilhar → convida com permissão de editor: ${who}`,
    );
  }
  console.error("[ringo-webhook] sheets API error", code, g.message);
  return sheetErrorResponse(
    "sheet_api_error",
    "Não foi possível gravar na planilha. Tenta outra vez mais tarde.",
  );
}

export function createSheetLaunchWriter(
  cfg: GoogleSheetsEnvConfig,
): {
  persist(lancamento: LancamentoFinanceiroParsed): Promise<PersistLaunchResult>;
} {
  const auth = new google.auth.GoogleAuth({
    keyFile: cfg.credentialsPath,
    scopes: SCOPES,
  });

  const sheets = google.sheets({ version: "v4", auth });

  return {
    async persist(lancamento: LancamentoFinanceiroParsed) {
      const ymd = lancamento.data;
      if (!ymd) {
        return sheetErrorResponse(
          "sheet_invalid_launch",
          "Data do lançamento em falta; não foi possível gravar na planilha.",
        );
      }

      try {
        const tab = await resolveSheetId(
          sheets,
          cfg.spreadsheetId,
          cfg.tabTitle,
        );
        if (!tab) {
          return sheetErrorResponse(
            "sheet_tab_not_found",
            "Não encontrei a aba da planilha configurada. Confirma GOOGLE_SHEETS_TAB.",
          );
        }

        const { sheetId, title } = tab;
        const t = escapeSheetTitleForRange(title);
        const lastRow = cfg.firstDataRow + cfg.maxDataRows - 1;
        const range = `${t}!A${cfg.firstDataRow}:E${lastRow}`;
        const got = await sheets.spreadsheets.values.get({
          spreadsheetId: cfg.spreadsheetId,
          range,
          valueRenderOption: "FORMATTED_VALUE",
        });

        const grid = got.data.values ?? [];
        const rowYmd = (i: number) =>
          normalizeCellToYmd(grid[i]?.[COL.A]);

        let firstIdx = -1;
        for (let i = 0; i < grid.length; i++) {
          if (rowYmd(i) === ymd) {
            firstIdx = i;
            break;
          }
        }
        if (firstIdx === -1) {
          return sheetErrorResponse(
            "sheet_date_not_found",
            `Não há linha com a data ${ymdToPtBr(ymd)} na coluna A. Confirma a planilha.`,
          );
        }

        let lastIdx = firstIdx;
        for (let j = firstIdx + 1; j < grid.length; j++) {
          if (rowYmd(j) === ymd) lastIdx = j;
          else break;
        }

        const valueCol =
          lancamento.tipo === "income" ? COL.B : COL.C;
        const lastRowArr = grid[lastIdx] ?? [];
        const targetCell = lastRowArr[valueCol];
        const sheetRow1Based = cfg.firstDataRow + lastIdx;

        const desc = descriptionForColumnE(lancamento);
        const displayDate = ymdToPtBr(ymd);
        const amount = lancamento.valor;

        if (isEmptyCell(targetCell)) {
          const valueRange =
            valueCol === COL.B
              ? `${t}!B${sheetRow1Based}`
              : `${t}!C${sheetRow1Based}`;
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: cfg.spreadsheetId,
            requestBody: {
              valueInputOption: "USER_ENTERED",
              data: [
                { range: `${t}!A${sheetRow1Based}`, values: [[displayDate]] },
                { range: valueRange, values: [[amount]] },
                { range: `${t}!E${sheetRow1Based}`, values: [[desc]] },
              ],
            },
          });
          return { ok: true, wroteToSheet: true };
        }

        const zeroInsert = sheetRow1Based;
        const requests: sheets_v4.Schema$Request[] = [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: zeroInsert,
                endIndex: zeroInsert + 1,
              },
              inheritFromBefore: true,
            },
          },
          {
            copyPaste: {
              source: {
                sheetId,
                startRowIndex: zeroInsert - 1,
                endRowIndex: zeroInsert,
                startColumnIndex: COL.D,
                endColumnIndex: COL.D + 1,
              },
              destination: {
                sheetId,
                startRowIndex: zeroInsert,
                endRowIndex: zeroInsert + 1,
                startColumnIndex: COL.D,
                endColumnIndex: COL.D + 1,
              },
              pasteType: "PASTE_NORMAL",
              pasteOrientation: "NORMAL",
            },
          },
        ];

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: cfg.spreadsheetId,
          requestBody: { requests },
        });

        const newRow1Based = sheetRow1Based + 1;
        const valueRange =
          valueCol === COL.B
            ? `${t}!B${newRow1Based}`
            : `${t}!C${newRow1Based}`;
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: cfg.spreadsheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: [
              { range: `${t}!A${newRow1Based}`, values: [[displayDate]] },
              { range: valueRange, values: [[amount]] },
              { range: `${t}!E${newRow1Based}`, values: [[desc]] },
            ],
          },
        });

        return { ok: true, wroteToSheet: true };
      } catch (err) {
        return mapApiErr(err, cfg.serviceAccountEmail);
      }
    },
  };
}
