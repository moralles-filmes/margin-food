/**
 * extratoParser.ts — Parser unificado de extratos bancários (OFX/QFX/OFC/CSV).
 *
 * Além das transações, extrai a identidade da conta do arquivo (quando disponível)
 * para possibilitar a verificação entre o extrato importado e a conta selecionada.
 *
 * OFX/QFX: lê <BANKACCTFROM> / <CCACCTFROM>; OFC legado usa <ACCTFROM>.
 * CSV: varredura best-effort das primeiras linhas por padrões de agência/conta.
 */

export interface ExtratoLinha {
  data: string;       // ISO yyyy-MM-dd
  descricao: string;
  valor: number;      // absoluto
  tipo: 'RECEITA' | 'DESPESA';
  /** Identificador único fornecido pelo banco (OFX/OFC FITID), quando disponível. */
  fitId?: string;
}

/** Identidade da conta extraída do arquivo (todos os campos opcionais) */
export interface ExtratoConta {
  numeroConta?: string;  // ex: "12345-6" ou "12345"
  agencia?: string;      // ex: "1234" ou "1234-5"
  banco?: string;        // nome livre (CSV) ou código BANKID (OFX)
  bankId?: string;       // código numérico do banco (OFX BANKID)
}

export interface ExtratoParseResult {
  linhas: ExtratoLinha[];
  conta: ExtratoConta;
  /** Saldo final informado no arquivo (OFX: LEDGERBAL; OFC: LEDGER). Ausente em CSV. */
  saldoFinalArquivo?: { valor: number; data: string };
}

/* ───────── OFX/QFX/OFC parser ───────── */

function parseOFXNumber(raw: string): number {
  const normalized = raw.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma > lastDot) {
    return Number(normalized.replace(/\./g, '').replace(',', '.'));
  }
  if (lastDot > lastComma && lastComma >= 0) {
    return Number(normalized.replace(/,/g, ''));
  }
  if (lastComma >= 0) {
    return Number(normalized.replace(',', '.'));
  }
  return Number(normalized);
}

function parseOFXDate(raw: string): string {
  const value = raw.trim();
  const isoLike = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;

  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return '';
}

function parseOFX(text: string): ExtratoParseResult {
  const linhas: ExtratoLinha[] = [];

  // Extrai identidade da conta do cabeçalho. OFC legado usa <ACCTFROM>.
  const conta: ExtratoConta = {};
  const acctBlock =
    text.match(/<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/i)?.[1] ||
    text.match(/<CCACCTFROM>([\s\S]*?)<\/CCACCTFROM>/i)?.[1] ||
    text.match(/<ACCTFROM>([\s\S]*?)<\/ACCTFROM>/i)?.[1] ||
    // Fallback: alguns OFX não fecham com </BANKACCTFROM>, apenas abrem e usam próxima tag de mesmo nível
    text.match(/<BANKACCTFROM>([\s\S]*?)(?=<STMTTRNRS|<STMTRS|<CCSTMTRS|$)/i)?.[1] ||
    text.match(/<CCACCTFROM>([\s\S]*?)(?=<STMTTRNRS|<STMTRS|<CCSTMTRS|$)/i)?.[1] ||
    text.match(/<ACCTFROM>([\s\S]*?)(?=<STMTRS|<STMTTRN|$)/i)?.[1];

  if (acctBlock) {
    const getHeaderTag = (tag: string) => {
      const m = acctBlock.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const acctId = getHeaderTag('ACCTID');
    const branchId = getHeaderTag('BRANCHID');
    const bankId = getHeaderTag('BANKID');
    if (acctId) conta.numeroConta = acctId;
    if (branchId) conta.agencia = branchId;
    if (bankId) { conta.bankId = bankId; conta.banco = bankId; }
  } else {
    // Tentativa flat (OFX sem bloco fechado): procurar as tags soltas no início do arquivo
    const getFlat = (tag: string) => {
      const m = text.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const acctId = getFlat('ACCTID');
    const branchId = getFlat('BRANCHID');
    const bankId = getFlat('BANKID');
    if (acctId) conta.numeroConta = acctId;
    if (branchId) conta.agencia = branchId;
    if (bankId) { conta.bankId = bankId; conta.banco = bankId; }
  }

  // Saldo final do extrato (<LEDGERBAL><BALAMT>/<DTASOF>) — usado na conferência de saldo ao importar
  let saldoFinalArquivo: { valor: number; data: string } | undefined;
  const ledgerBlock =
    text.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i)?.[1] ||
    text.match(/<LEDGERBAL>([\s\S]*?)(?=<AVAILBAL|<\/STMTRS|<\/CCSTMTRS|$)/i)?.[1];
  if (ledgerBlock) {
    const getLedgerTag = (tag: string) => {
      const m = ledgerBlock.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const balAmt = getLedgerTag('BALAMT');
    const dtAsOf = getLedgerTag('DTASOF');
    if (balAmt) {
      const valor = parseOFXNumber(balAmt);
      if (!isNaN(valor)) {
        const data = parseOFXDate(dtAsOf);
        if (data) saldoFinalArquivo = { valor, data };
      }
    }
  } else {
    // OFC legado informa o saldo como campo simples <LEDGER> e usa <DTEND>
    // como data final do período do extrato.
    const ledgerValue = text.match(/<LEDGER>([^<\n\r]+)/i)?.[1]?.trim();
    const statementEnd = text.match(/<DTEND>([^<\n\r]+)/i)?.[1]?.trim();
    if (ledgerValue && statementEnd) {
      const valor = parseOFXNumber(ledgerValue);
      const data = parseOFXDate(statementEnd);
      if (!isNaN(valor) && data) saldoFinalArquivo = { valor, data };
    }
  }

  // Transações
  const transactions = text.split(/<STMTTRN>/i).slice(1);
  for (const tx of transactions) {
    const getTag = (tag: string) => {
      const m = tx.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const dtposted = getTag('DTPOSTED');
    const trnamt = getTag('TRNAMT');
    const fitId = getTag('FITID');
    const memo = getTag('MEMO') || getTag('NAME') || fitId;
    if (!dtposted || !trnamt) continue;
    const valor = parseOFXNumber(trnamt);
    const data = parseOFXDate(dtposted);
    if (!data || isNaN(valor)) continue;
    linhas.push({
      data,
      descricao: memo || 'Sem descrição',
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'RECEITA' : 'DESPESA',
      fitId: fitId || undefined,
    });
  }

  return { linhas, conta, saldoFinalArquivo };
}

/* ───────── CSV parser ───────── */

// Padrões usados em cabeçalhos de CSV de bancos brasileiros para achar nº da conta / agência
const CSV_AGENCIA_RE = /ag[eê]ncia[:\s#]+([0-9x-]+)/i;
const CSV_CONTA_RE = /(?:conta|c[/]c|c[.]c[.])[:\s#]+([0-9x.-]+)/i;
const CSV_BANCO_RE = /banco[:\s]+([^;\n,]+)/i;

function parseCSV(text: string): ExtratoParseResult {
  const rawLines = text.split('\n');
  const linhas: ExtratoLinha[] = [];
  const conta: ExtratoConta = {};

  // Varre as primeiras 15 linhas em busca de metadados de conta
  const headerZone = rawLines.slice(0, 15);
  for (const hl of headerZone) {
    if (!conta.agencia) {
      const m = CSV_AGENCIA_RE.exec(hl);
      if (m) conta.agencia = m[1].trim();
    }
    if (!conta.numeroConta) {
      const m = CSV_CONTA_RE.exec(hl);
      if (m) conta.numeroConta = m[1].trim();
    }
    if (!conta.banco) {
      const m = CSV_BANCO_RE.exec(hl);
      if (m) conta.banco = m[1].trim();
    }
  }

  // Transações
  for (const line of rawLines) {
    if (!line.trim()) continue;
    const sep = line.includes(';') ? ';' : ',';
    const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) continue;

    let data = '';
    let descricao = '';
    let valor = 0;

    const dateCandidate = parts[0];
    if (/\d{2}[/-]\d{2}[/-]\d{2,4}/.test(dateCandidate)) {
      const dateParts = dateCandidate.split(/[/-]/);
      if (dateParts.length === 3) {
        const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
        data = `${year}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
      }
    } else if (/\d{4}-\d{2}-\d{2}/.test(dateCandidate)) {
      data = dateCandidate;
    }

    if (!data) continue;
    descricao = parts[1] || '';

    for (let j = parts.length - 1; j >= 2; j--) {
      const num = parseOFXNumber(parts[j]);
      if (!isNaN(num) && num !== 0) { valor = num; break; }
    }

    if (!descricao || valor === 0) continue;
    linhas.push({
      data,
      descricao,
      valor: Math.abs(valor),
      tipo: valor > 0 ? 'RECEITA' : 'DESPESA',
    });
  }

  return { linhas, conta };
}

/* ───────── Entry point ───────── */

/** Escolhe o parser pela extensão do arquivo e retorna linhas + identidade da conta. */
export function parseExtrato(filename: string, text: string): ExtratoParseResult {
  const ext = filename.toLowerCase().split('.').pop();
  const hasFinancialTags = /<STMTTRN>/i.test(text) && /<DTPOSTED>/i.test(text) && /<TRNAMT>/i.test(text);
  return ext === 'ofx' || ext === 'qfx' || ext === 'ofc' || hasFinancialTags
    ? parseOFX(text)
    : parseCSV(text);
}

/* ───────── Verificação de conta ───────── */

export type ContaVerdictStatus = 'match' | 'mismatch' | 'unverified';

export interface ContaVerdict {
  status: ContaVerdictStatus;
  /** Mensagem legível explicando o motivo (usada no AlertDialog). */
  motivo: string;
}

/** Normaliza para só dígitos, sem zeros à esquerda. */
function normDigits(v: string | null | undefined): string {
  if (!v) return '';
  return v.replace(/\D/g, '').replace(/^0+/, '') || '';
}

/**
 * Tolera dígito verificador: ex "12345" bate com "123456" porque um é prefixo do outro
 * e as strings diferem em no máximo 2 chars (dígito + eventual hífen removido).
 */
function digitosCompativeis(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 0 || b.length === 0) return false;
  // Prefixo: o menor está contido no início do maior e diferem em ≤ 2 chars
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return longer.startsWith(shorter) && longer.length - shorter.length <= 2;
}

/**
 * Compara a identidade lida do extrato com o cadastro em `fin_contas`.
 *
 * Retorna:
 * - `match`     — pelo menos um campo chave bate (confiável o suficiente para liberar sem aviso).
 * - `mismatch`  — pelo menos um campo chave foi comparável e NÃO bateu → bloquear com override.
 * - `unverified`— não há dados suficientes em nenhum dos lados para comparar → permitir com aviso.
 */
export function verifyContaExtrato(
  extrato: ExtratoConta,
  cadastro: { numero_conta?: string | null; agencia?: string | null; banco?: string | null } | undefined,
): ContaVerdict {
  if (!cadastro) {
    return { status: 'unverified', motivo: 'Conta não encontrada no cadastro.' };
  }

  const extNumero = normDigits(extrato.numeroConta);
  const cadNumero = normDigits(cadastro.numero_conta);
  const extAgencia = normDigits(extrato.agencia);
  const cadAgencia = normDigits(cadastro.agencia);

  const temExtratoId = extNumero.length > 0 || extAgencia.length > 0;
  const temCadastroId = cadNumero.length > 0 || cadAgencia.length > 0;

  if (!temExtratoId || !temCadastroId) {
    return {
      status: 'unverified',
      motivo: temExtratoId
        ? 'A conta selecionada não tem número/agência cadastrado — não é possível confirmar automaticamente.'
        : 'O arquivo não contém identificação de conta — não é possível confirmar automaticamente.',
    };
  }

  // Compara número de conta (campo mais confiável)
  if (extNumero && cadNumero) {
    if (digitosCompativeis(extNumero, cadNumero)) {
      return { status: 'match', motivo: 'Número de conta confere.' };
    }
    return {
      status: 'mismatch',
      motivo: `Número da conta diverge: extrato "${extrato.numeroConta}" vs cadastro "${cadastro.numero_conta}".`,
    };
  }

  // Fallback: só agência disponível dos dois lados
  if (extAgencia && cadAgencia) {
    if (digitosCompativeis(extAgencia, cadAgencia)) {
      return { status: 'match', motivo: 'Agência confere.' };
    }
    return {
      status: 'mismatch',
      motivo: `Agência diverge: extrato "${extrato.agencia}" vs cadastro "${cadastro.agencia}".`,
    };
  }

  // Um lado tem nº/agência mas o outro não tem o campo comparável → não podemos decidir
  return {
    status: 'unverified',
    motivo: 'Não foi possível comparar os campos disponíveis no extrato com o cadastro.',
  };
}

/**
 * Retorna a data anterior (1 dia) em ISO 'yyyy-MM-dd', usando componentes
 * locais — nunca `new Date(iso)`, que é interpretado como UTC meia-noite e
 * desloca o dia no fuso BR (mesmo bug documentado para rótulos de mês).
 */
export function diaAnterior(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
