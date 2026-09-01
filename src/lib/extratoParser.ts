/**
 * extratoParser.ts — Parser unificado de extratos bancários (OFX/QFX/OFC/CSV).
 *
 * Além das transações, extrai a identidade da conta do arquivo (quando disponível)
 * para possibilitar a verificação entre o extrato importado e a conta selecionada.
 *
 * OFX/QFX: lê <BANKACCTFROM> / <CCACCTFROM>; OFC legado usa <ACCTFROM>.
 * CSV: varredura best-effort das primeiras linhas por padrões de agência/conta.
 *
 * ── Blindagem contra variação entre bancos ──
 * O formato OFX é implementado de forma inconsistente por cada instituição. As
 * defesas abaixo existem porque a descrição e o valor viram chave de dedução de
 * duplicata na conciliação: qualquer instabilidade neles vira lançamento duplicado.
 *  - descrição normalizada na origem (espaços internos colapsados);
 *  - FITID nunca vira descrição (Santander/PagBank regeneram o FITID a cada download);
 *  - sinal do valor derivado de <TRNTYPE> quando o banco exporta tudo positivo;
 *  - separador decimal vs. milhar resolvido por número de casas;
 *  - arquivo com mais de uma conta é sinalizado em vez de misturado.
 */

interface ExtratoLinha {
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
  /** Saldo de razão informado no arquivo (OFX: LEDGERBAL; OFC: LEDGER). Pode cobrir só a conta corrente; ausente em CSV. */
  saldoFinalArquivo?: { valor: number; data: string };
  /**
   * Anomalias detectadas no arquivo que exigem conferência humana antes de
   * conciliar (mais de uma conta no mesmo arquivo, encoding corrompido,
   * sinal inferido por TRNTYPE). Vazio quando o arquivo é bem-comportado.
   */
  avisos: string[];
}

/* ───────── Normalização compartilhada ───────── */

/**
 * Colapsa espaços internos e remove caracteres de controle da descrição.
 *
 * O MEMO do OFX varia o espaçamento interno entre dois downloads do mesmo
 * extrato (confirmado no Santander: `"PIX RECEBIDO      04740876000125"` vira
 * `"PIX RECEBIDO   04740876000125"`). Como a descrição é parte da chave de
 * dedução de duplicata, normalizar aqui — na origem — faz o lançamento nascer
 * estável e protege qualquer consumidor futuro, não só os dois pontos que já
 * comparam com `regexp_replace`/`bankLineKey`.
 */
function normalizeDescricao(raw: string): string {
  // eslint-disable-next-line no-control-regex -- limpeza de bytes de controle vindos do arquivo do banco
  return raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Decodifica o arquivo respeitando o encoding real dos bytes.
 *
 * Extratos brasileiros costumam vir em Windows-1252 (o próprio header OFX
 * declara `CHARSET:1252` / `CPAGE:1252`). Decodificar esses bytes como UTF-8
 * — o que `File.text()` faz incondicionalmente — troca cada acento por U+FFFD,
 * e a descrição corrompida deixa de bater com o lançamento já conciliado.
 *
 * O gatilho é a evidência, não o header: só cai para Windows-1252 quando a
 * decodificação UTF-8 produz caractere de substituição, porque muitos bancos
 * declaram 1252 no header e entregam UTF-8 de fato.
 */
export function decodeExtratoBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf8;
  }
}

/* ───────── OFX/QFX/OFC parser ───────── */

function parseOFXNumber(raw: string): number {
  const normalized = raw.replace(/[^\d,.-]/g, '');
  if (!normalized) return NaN;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  // Os dois separadores presentes: o último é o decimal, o outro é milhar.
  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot
      ? Number(normalized.replace(/\./g, '').replace(',', '.'))
      : Number(normalized.replace(/,/g, ''));
  }

  const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
  if (!sep) return Number(normalized);

  // Um separador só é ambíguo: "1.234" é R$ 1.234,00 no BR e 1.234 no EN.
  // Banco não emite 3 casas decimais em BRL, então 3 dígitos após o separador
  // (ou o separador repetido, como "1.234.567") significa milhar.
  const ocorrencias = normalized.split(sep).length - 1;
  const casasFinais = normalized.length - normalized.lastIndexOf(sep) - 1;
  if (ocorrencias > 1 || casasFinais === 3) {
    return Number(normalized.split(sep).join(''));
  }
  return Number(normalized.replace(sep, '.'));
}

function parseOFXDate(raw: string): string {
  const value = raw.trim();
  const isoLike = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;

  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return '';
}

/**
 * TRNTYPEs que significam saída de dinheiro sem ambiguidade.
 *
 * Ficam de fora os tipos que servem aos dois sentidos (XFER, PAYMENT, ATM,
 * CASH, DEP, OTHER): inferir despesa a partir deles inverteria receita legítima.
 */
const TRNTYPE_DEBITO = new Set(['DEBIT', 'FEE', 'SRVCHG', 'DIRECTDEBIT', 'CHECK']);

interface TransacaoCrua {
  data: string;
  descricao: string;
  valor: number;      // com sinal, como veio do arquivo
  trnType: string;
  fitId?: string;
}

function parseOFX(text: string): ExtratoParseResult {
  const avisos: string[] = [];

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

  // Um arquivo com mais de um ACCTID traz o extrato de várias contas (corrente +
  // poupança, ou o pacote da empresa inteira). Como as transações são lidas em
  // bloco e importadas na conta selecionada na tela, isso lançaria movimento de
  // uma conta dentro de outra — sinalizar em vez de misturar em silêncio.
  // Só os blocos de ORIGEM entram na contagem: <BANKACCTTO>/<CCACCTTO> (conta
  // destino de transferência) também carregam <ACCTID> e gerariam falso alarme.
  const acctIds = Array.from(
    text.matchAll(/<(?:BANK|CC)?ACCTFROM>([\s\S]*?)(?=<\/(?:BANK|CC)?ACCTFROM>|<BANKTRANLIST|<STMTTRN|<LEDGERBAL|$)/gi),
  )
    .map(bloco => bloco[1].match(/<ACCTID>([^<\n\r]+)/i)?.[1]?.trim() || '')
    .filter(Boolean);
  const acctIdsDistintos = Array.from(new Set(acctIds));
  if (acctIdsDistintos.length > 1) {
    avisos.push(
      `O arquivo contém extratos de ${acctIdsDistintos.length} contas diferentes (${acctIdsDistintos.join(', ')}). ` +
      'Todas as transações seriam importadas na conta selecionada — exporte um extrato por conta.',
    );
  }

  if (text.includes('\uFFFD')) {
    avisos.push('O arquivo tem caracteres ilegíveis (problema de codificação) — confira as descrições antes de conciliar.');
  }

  // Saldo de razão do extrato (<LEDGERBAL><BALAMT>/<DTASOF>). O chamador
  // classifica o escopo: Santander com ContaMax informa apenas a conta corrente.
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

  // Transações — 1ª passada: coleta crua (o sinal só pode ser decidido depois
  // de conhecer o arquivo inteiro, ver `usarTrnType` abaixo).
  const crus: TransacaoCrua[] = [];
  const transactions = text.split(/<STMTTRN>/i).slice(1);
  for (const tx of transactions) {
    const getTag = (tag: string) => {
      const m = tx.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const dtposted = getTag('DTPOSTED');
    const trnamt = getTag('TRNAMT');
    const fitId = getTag('FITID');
    // O FITID jamais entra na descrição: Santander e PagBank o regeneram a cada
    // download (embutem o timestamp), então usá-lo como texto faria a descrição
    // mudar a cada exportação e nenhuma reimportação seria reconhecida.
    const descricao = normalizeDescricao(
      getTag('MEMO') || getTag('NAME') || getTag('CHECKNUM') || '',
    );
    if (!dtposted || !trnamt) continue;
    const valor = parseOFXNumber(trnamt);
    const data = parseOFXDate(dtposted);
    if (!data || isNaN(valor)) continue;
    crus.push({
      data,
      descricao: descricao || 'Sem descrição',
      valor,
      trnType: getTag('TRNTYPE').toUpperCase(),
      fitId: fitId || undefined,
    });
  }

  // 2ª passada: definir receita/despesa. Parte dos bancos exporta TRNAMT sempre
  // positivo e deixa o sentido só em <TRNTYPE> — lido pelo sinal, o extrato
  // inteiro viraria receita. Só recorremos ao TRNTYPE quando NENHUMA linha do
  // arquivo tem valor negativo (prova de que o banco não usa sinal); havendo
  // qualquer negativo, o sinal é a fonte da verdade.
  const algumNegativo = crus.some(t => t.valor < 0);
  const usarTrnType = !algumNegativo && crus.some(t => TRNTYPE_DEBITO.has(t.trnType));
  if (usarTrnType) {
    avisos.push('O banco exportou todos os valores sem sinal — o sentido de cada lançamento foi deduzido do tipo da transação (TRNTYPE). Confira as despesas.');
  }

  const linhas: ExtratoLinha[] = crus.map(t => ({
    data: t.data,
    descricao: t.descricao,
    valor: Math.abs(t.valor),
    tipo: (usarTrnType ? TRNTYPE_DEBITO.has(t.trnType) : t.valor < 0) ? 'DESPESA' : 'RECEITA',
    fitId: t.fitId,
  }));

  return { linhas, conta, saldoFinalArquivo, avisos };
}

/* ───────── CSV parser ───────── */

// Padrões usados em cabeçalhos de CSV de bancos brasileiros para achar nº da conta / agência
const CSV_AGENCIA_RE = /ag[eê]ncia[:\s#]+([0-9x-]+)/i;
const CSV_CONTA_RE = /(?:conta|c[/]c|c[.]c[.])[:\s#]+([0-9x.-]+)/i;
const CSV_BANCO_RE = /banco[:\s]+([^;\n,]+)/i;

// Cabeçalhos de coluna: distinguir a coluna de VALOR da coluna de SALDO é
// essencial — lidas na ordem errada, o saldo acumulado vira o valor do lançamento.
const CSV_COL_VALOR_RE = /^(valor|vlr|montante|quantia|amount|cr[eé]dito|d[eé]bito)/i;
const CSV_COL_SALDO_RE = /^(saldo|balance)/i;

function splitCSVLine(line: string): string[] {
  const sep = line.includes(';') ? ';' : ',';
  return line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
}

function parseCSV(text: string): ExtratoParseResult {
  const rawLines = text.split('\n');
  const linhas: ExtratoLinha[] = [];
  const conta: ExtratoConta = {};
  const avisos: string[] = [];

  if (text.includes('\uFFFD')) {
    avisos.push('O arquivo tem caracteres ilegíveis (problema de codificação) — confira as descrições antes de conciliar.');
  }

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

  // Localiza as colunas de valor e de saldo pelo cabeçalho, quando houver.
  let idxValor = -1;
  let idxSaldo = -1;
  for (const hl of headerZone) {
    const cells = splitCSVLine(hl);
    const v = cells.findIndex(c => CSV_COL_VALOR_RE.test(c));
    const s = cells.findIndex(c => CSV_COL_SALDO_RE.test(c));
    if (v >= 0 || s >= 0) { idxValor = v; idxSaldo = s; break; }
  }

  // Transações
  for (const line of rawLines) {
    if (!line.trim()) continue;
    const parts = splitCSVLine(line);
    if (parts.length < 3) continue;

    let data = '';
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
    const descricao = normalizeDescricao(parts[1] || '');

    if (idxValor >= 0 && idxValor < parts.length) {
      const num = parseOFXNumber(parts[idxValor]);
      if (!isNaN(num)) valor = num;
    } else {
      // Sem cabeçalho: varrer da esquerda para a direita e ficar com a PRIMEIRA
      // coluna numérica — o layout dominante é Data;Histórico;Valor;Saldo, e
      // varrer de trás para frente elegia o saldo acumulado como valor.
      for (let j = 2; j < parts.length; j++) {
        if (j === idxSaldo) continue;
        const num = parseOFXNumber(parts[j]);
        if (!isNaN(num) && num !== 0) { valor = num; break; }
      }
    }

    if (valor === 0) continue;
    linhas.push({
      data,
      descricao: descricao || 'Sem descrição',
      valor: Math.abs(valor),
      tipo: valor > 0 ? 'RECEITA' : 'DESPESA',
    });
  }

  return { linhas, conta, avisos };
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

type ContaVerdictStatus = 'match' | 'mismatch' | 'unverified';

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
