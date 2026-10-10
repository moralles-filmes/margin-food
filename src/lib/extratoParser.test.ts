import { describe, it, expect } from 'vitest';
import { parseExtrato, diaAnterior, decodeExtratoBuffer } from './extratoParser';

const OFX_COM_LEDGERBAL = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260805120000
<TRNAMT>-150.00
<FITID>txn-unique-123
<MEMO>Compra cartao
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>21302.42
<DTASOF>20260805120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const OFX_SEM_LEDGERBAL = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805120000
<TRNAMT>200.00
<MEMO>Deposito
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const OFC_LEGADO = `
<OFC>
<DTD>1.02
<CPAGE>1252
<ACCTSTMT>
<ACCTFROM>
<BANKID>001
<BRANCHID>1234
<ACCTID>98765-0
</ACCTFROM>
<STMTRS>
<DTSTART>20260801
<DTEND>20260814
<LEDGER>1.234,56
<STMTTRN>
<TRNTYPE>1
<DTPOSTED>20260813120000
<TRNAMT>-89,90
<FITID>ofc-legacy-123
<NAME>Fornecedor OFC
<MEMO>Compra importada
</STMTTRN>
</STMTRS>
</ACCTSTMT>
</OFC>
`;

describe('parseExtrato — extração de LEDGERBAL (OFX)', () => {
  it('extrai valor e data do bloco <LEDGERBAL> quando presente', () => {
    const result = parseExtrato('extrato.ofx', OFX_COM_LEDGERBAL);
    expect(result.saldoFinalArquivo).toEqual({ valor: 21302.42, data: '2026-08-05' });
  });

  it('preserva o FITID único de cada transação', () => {
    const result = parseExtrato('extrato.ofx', OFX_COM_LEDGERBAL);
    expect(result.linhas[0].fitId).toBe('txn-unique-123');
  });

  it('interpreta saldo e data no formato brasileiro emitido pelo PagBank', () => {
    const pagBank = OFX_COM_LEDGERBAL
      .replace('<BALAMT>21302.42', '<BALAMT>R$\u00a098.589,12')
      .replace('<DTASOF>20260805120000', '<DTASOF>01/08/2026');

    const result = parseExtrato('pagbank.ofx', pagBank);
    expect(result.saldoFinalArquivo).toEqual({ valor: 98589.12, data: '2026-08-01' });
  });

  it('mantém transações legítimas repetidas quando os FITIDs são diferentes', () => {
    const repeated = OFX_COM_LEDGERBAL.replace(
      '</BANKTRANLIST>',
      `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260805120000
<TRNAMT>-150.00
<FITID>txn-unique-456
<MEMO>Compra cartao
</STMTTRN>
</BANKTRANLIST>`,
    );

    const result = parseExtrato('extrato.ofx', repeated);
    expect(result.linhas).toHaveLength(2);
    expect(result.linhas.map(l => l.fitId)).toEqual(['txn-unique-123', 'txn-unique-456']);
  });

  it('não popula saldoFinalArquivo quando o arquivo não tem <LEDGERBAL>', () => {
    const result = parseExtrato('extrato.ofx', OFX_SEM_LEDGERBAL);
    expect(result.saldoFinalArquivo).toBeUndefined();
  });

  it('CSV nunca popula saldoFinalArquivo (dado não padronizado nesse formato)', () => {
    const csv = '05/08/2026;Venda;150,00\n';
    const result = parseExtrato('extrato.csv', csv);
    expect(result.saldoFinalArquivo).toBeUndefined();
  });
});

describe('parseExtrato — OFC legado', () => {
  it('importa transação, conta, FITID e saldo do formato OFC', () => {
    const result = parseExtrato('extrato.ofc', OFC_LEGADO);

    expect(result.conta).toEqual({
      numeroConta: '98765-0',
      agencia: '1234',
      banco: '001',
      bankId: '001',
    });
    expect(result.saldoFinalArquivo).toEqual({ valor: 1234.56, data: '2026-08-14' });
    expect(result.linhas).toEqual([{
      data: '2026-08-13',
      descricao: 'Compra importada',
      valor: 89.9,
      tipo: 'DESPESA',
      fitId: 'ofc-legacy-123',
    }]);
  });

  it('reconhece conteúdo OFC mesmo quando o banco entrega extensão .txt', () => {
    expect(parseExtrato('extrato.txt', OFC_LEGADO).linhas).toHaveLength(1);
  });
});

describe('parseExtrato — valores numéricos do CSV', () => {
  it('interpreta decimal brasileiro (vírgula, sem separador de milhar)', () => {
    const result = parseExtrato('extrato.csv', '05/08/2026;Venda;150,00\n');
    expect(result.linhas).toEqual([{ data: '2026-08-05', descricao: 'Venda', valor: 150, tipo: 'RECEITA' }]);
  });

  it('interpreta decimal brasileiro com separador de milhar', () => {
    const result = parseExtrato('extrato.csv', '05/08/2026;Venda grande;1.234,56\n');
    expect(result.linhas[0].valor).toBe(1234.56);
  });

  it('não infla em 100x um CSV com decimal em ponto e sem separador de milhar (locale EN)', () => {
    const result = parseExtrato('extrato.csv', '05/08/2026,Compra,150.00\n');
    expect(result.linhas[0].valor).toBe(150);
  });

  it('interpreta decimal em ponto com separador de milhar em vírgula (locale EN)', () => {
    const result = parseExtrato('extrato.csv', '05/08/2026;Compra grande;1,234.56\n');
    expect(result.linhas[0].valor).toBe(1234.56);
  });
});

describe('diaAnterior', () => {
  it('retorna o dia anterior dentro do mesmo mês', () => {
    expect(diaAnterior('2026-08-05')).toBe('2026-08-04');
  });

  it('cruza a virada de mês corretamente', () => {
    expect(diaAnterior('2026-08-01')).toBe('2026-07-31');
  });

  it('cruza a virada de ano corretamente', () => {
    expect(diaAnterior('2026-01-01')).toBe('2025-12-31');
  });
});

/* ───────── Blindagem contra variação entre bancos ───────── */

describe('parseExtrato — descrição estável entre downloads', () => {
  it('colapsa espaçamento interno variável do MEMO (Santander: 143 duplicatas em 2026-08-28)', () => {
    // O mesmo extrato baixado duas vezes vem com espaçamento interno diferente.
    // Normalizar na origem faz o lançamento nascer estável.
    const download1 = OFX_COM_LEDGERBAL.replace('<MEMO>Compra cartao', '<MEMO>PIX RECEBIDO                 04740876000125');
    const download2 = OFX_COM_LEDGERBAL.replace('<MEMO>Compra cartao', '<MEMO>PIX RECEBIDO    04740876000125');
    expect(parseExtrato('e.ofx', download1).linhas[0].descricao).toBe('PIX RECEBIDO 04740876000125');
    expect(parseExtrato('e.ofx', download1).linhas[0].descricao)
      .toBe(parseExtrato('e.ofx', download2).linhas[0].descricao);
  });

  it('nunca usa o FITID como descrição (Santander regenera o FITID a cada download)', () => {
    // Sem MEMO nem NAME, cair no FITID faria a descrição mudar a cada exportação
    // e nenhuma reimportação seria reconhecida como já conciliada.
    const semMemo = OFX_COM_LEDGERBAL.replace('<MEMO>Compra cartao\n', '');
    const linha = parseExtrato('e.ofx', semMemo).linhas[0];
    expect(linha.descricao).toBe('Sem descrição');
    expect(linha.fitId).toBe('txn-unique-123');
  });

  it('usa <NAME> quando o banco não envia <MEMO>', () => {
    const comName = OFX_COM_LEDGERBAL.replace('<MEMO>Compra cartao', '<NAME>Fornecedor XPTO');
    expect(parseExtrato('e.ofx', comName).linhas[0].descricao).toBe('Fornecedor XPTO');
  });
});

describe('parseExtrato — sinal do valor via TRNTYPE', () => {
  const semSinal = `
<OFX><BANKACCTFROM><BANKID>033
<ACCTID>12345-6
</BANKACCTFROM>
<STMTTRN><TRNTYPE>CREDIT
<DTPOSTED>20260805120000
<TRNAMT>500.00
<FITID>a1
<MEMO>Venda
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT
<DTPOSTED>20260806120000
<TRNAMT>150.00
<FITID>a2
<MEMO>Tarifa
</STMTTRN>
</OFX>`;

  it('deduz DESPESA pelo TRNTYPE quando o banco exporta tudo positivo', () => {
    // Lido só pelo sinal, o extrato inteiro viraria receita e o saldo estouraria.
    const linhas = parseExtrato('e.ofx', semSinal).linhas;
    expect(linhas.map(l => l.tipo)).toEqual(['RECEITA', 'DESPESA']);
    expect(linhas[1].valor).toBe(150);
  });

  it('avisa que o sentido foi deduzido do TRNTYPE', () => {
    expect(parseExtrato('e.ofx', semSinal).avisos.some(a => a.includes('TRNTYPE'))).toBe(true);
  });

  it('o sinal manda quando o arquivo tem qualquer valor negativo', () => {
    // Banco que usa sinal + TRNTYPE=DEBIT não pode ter o tipo reinterpretado.
    const comSinal = semSinal.replace('<TRNAMT>150.00', '<TRNAMT>-150.00');
    const result = parseExtrato('e.ofx', comSinal);
    expect(result.linhas.map(l => l.tipo)).toEqual(['RECEITA', 'DESPESA']);
    expect(result.avisos.some(a => a.includes('TRNTYPE'))).toBe(false);
  });

  it('não reinterpreta TRNTYPE ambíguo (XFER/PAYMENT servem aos dois sentidos)', () => {
    const ambiguo = semSinal.replace('<TRNTYPE>DEBIT', '<TRNTYPE>XFER');
    expect(parseExtrato('e.ofx', ambiguo).linhas.map(l => l.tipo)).toEqual(['RECEITA', 'RECEITA']);
  });
});

describe('parseExtrato — arquivo com mais de uma conta', () => {
  it('avisa quando o arquivo traz extratos de contas diferentes', () => {
    // Importado em bloco, o movimento de uma conta entraria na outra.
    const duasContas = OFX_COM_LEDGERBAL + OFX_SEM_LEDGERBAL.replace('<ACCTID>12345-6', '<ACCTID>99999-9');
    const avisos = parseExtrato('e.ofx', duasContas).avisos;
    expect(avisos.some(a => a.includes('contas diferentes'))).toBe(true);
  });

  it('não avisa quando o mesmo ACCTID se repete no arquivo', () => {
    const mesmaConta = OFX_COM_LEDGERBAL + OFX_SEM_LEDGERBAL;
    expect(parseExtrato('e.ofx', mesmaConta).avisos.some(a => a.includes('contas diferentes'))).toBe(false);
  });
});

describe('parseExtrato — separador de milhar sem casas decimais', () => {
  it('lê "1.234" como 1234, não como 1,234 (CSV brasileiro sem centavos)', () => {
    expect(parseExtrato('e.csv', '05/08/2026;Venda;1.234\n').linhas[0].valor).toBe(1234);
  });

  it('lê "1,234" como 1234 (milhar em vírgula, sem centavos)', () => {
    expect(parseExtrato('e.csv', '05/08/2026;Venda;1,234\n').linhas[0].valor).toBe(1234);
  });

  it('lê milhar repetido "1.234.567" como 1234567', () => {
    expect(parseExtrato('e.csv', '05/08/2026;Venda;1.234.567\n').linhas[0].valor).toBe(1234567);
  });

  it('preserva 2 casas decimais como decimal, não como milhar', () => {
    expect(parseExtrato('e.csv', '05/08/2026;Venda;1.23\n').linhas[0].valor).toBe(1.23);
  });
});

describe('parseExtrato — CSV com coluna de saldo', () => {
  it('não confunde o saldo acumulado com o valor do lançamento', () => {
    // Layout dominante Data;Histórico;Valor;Saldo — varrer de trás para frente
    // elegia o saldo como valor do lançamento.
    const csv = 'Data;Historico;Valor;Saldo\n05/08/2026;Venda;150,00;9.850,00\n';
    expect(parseExtrato('e.csv', csv).linhas[0].valor).toBe(150);
  });

  it('usa a primeira coluna numérica quando o CSV não tem cabeçalho', () => {
    const csv = '05/08/2026;Venda;150,00;9.850,00\n';
    expect(parseExtrato('e.csv', csv).linhas[0].valor).toBe(150);
  });

  it('mantém a linha quando a descrição vem vazia', () => {
    // Descartar a linha sumia com uma transação real do extrato sem aviso.
    const linhas = parseExtrato('e.csv', '05/08/2026;;150,00\n').linhas;
    expect(linhas).toHaveLength(1);
    expect(linhas[0].descricao).toBe('Sem descrição');
  });
});

describe('decodeExtratoBuffer', () => {
  it('decodifica Windows-1252 quando os bytes não são UTF-8 válido', () => {
    // "TARIFA MANUTENÇÃO" em Windows-1252: Ç=0xC7, Ã=0xC3, O=0x4F
    const bytes = new Uint8Array([0x54, 0x41, 0x52, 0x49, 0x46, 0x41, 0x20, 0xC7, 0xC3, 0x4F]);
    expect(decodeExtratoBuffer(bytes.buffer)).toBe('TARIFA ÇÃO');
  });

  it('mantém UTF-8 quando o arquivo já é UTF-8 válido', () => {
    const bytes = new TextEncoder().encode('TARIFA MANUTENÇÃO');
    expect(decodeExtratoBuffer(bytes.buffer)).toBe('TARIFA MANUTENÇÃO');
  });
});

describe('parseExtrato — ACCTID de conta destino não conta como segunda conta', () => {
  it('ignora <BANKACCTTO> ao detectar múltiplas contas', () => {
    // Transferência detalhada traz a conta destino no mesmo arquivo; contá-la
    // como "segunda conta" faria o aviso disparar em todo extrato com TED.
    const comDestino = OFX_COM_LEDGERBAL.replace(
      '</BANKACCTFROM>',
      '</BANKACCTFROM>\n<BANKACCTTO>\n<BANKID>237\n<ACCTID>77777-7\n</BANKACCTTO>',
    );
    expect(parseExtrato('e.ofx', comDestino).avisos.some(a => a.includes('contas diferentes'))).toBe(false);
  });
});

// Layout do OFX do Itaú (mais novo primeiro): cada dia abre com uma linha que só
// informa o saldo, e o período fecha com o SALDO ANTERIOR. Valores sintéticos.
const itauTrn = (dia: string, valor: string, fitId: string, memo: string, tipo = valor.startsWith('-') ? 'DEBIT' : 'CREDIT') => `<STMTTRN>
<TRNTYPE>${tipo}
<DTPOSTED>${dia}100000[-03:EST]
<TRNAMT>${valor}
<FITID>${fitId}
<CHECKNUM>${fitId}
<MEMO>${memo}
</STMTTRN>`;

const ofxItau = (transacoes: string[], ledger = { valor: '90.00', dia: '20261003' }) => `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<ACCTID>0242988228
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001100000[-03:EST]
<DTEND>20261003100000[-03:EST]
${transacoes.join('\n')}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>${ledger.valor}
<DTASOF>${ledger.dia}100000[-03:EST]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const ITAU_DIA_02 = [
  itauTrn('20261002', '250.00', '20261002001', 'SALDO TOTAL DISPONÍVEL DIA'),
  itauTrn('20261002', '-50.00', '20261002002', 'COMPRA NO DEBITO PADARIA'),
  itauTrn('20261002', '100.00', '20261002003', 'PIX RECEBIDO CLIENTE'),
];
const ITAU_DIA_01 = [
  itauTrn('20261001', '200.00', '20261001001', 'SALDO TOTAL DISPONÍVEL DIA'),
  itauTrn('20261001', '300.00', '20261001002', 'PIX RECEBIDO CLIENTE'),
  itauTrn('20261001', '-100.00', '20261001003', 'TAR PACOTE'),
];
const ITAU_SALDO_ANTERIOR = itauTrn('20260930', '0.00', '20260930001', 'SALDO ANTERIOR');
const ITAU_PADRAO = [...ITAU_DIA_02, ...ITAU_DIA_01, ITAU_SALDO_ANTERIOR];

describe('parseExtrato — linhas de saldo informativas (Itaú)', () => {
  it('descarta SALDO TOTAL DISPONÍVEL DIA e SALDO ANTERIOR e avisa quantas saíram', () => {
    // Caso real (AOI Sushi, 2026-10-10): as 8 linhas de saldo entravam como RECEITA.
    const result = parseExtrato('itau.ofx', ofxItau(ITAU_PADRAO));
    expect(result.linhas.map(l => l.descricao)).toEqual([
      'COMPRA NO DEBITO PADARIA', 'PIX RECEBIDO CLIENTE', 'PIX RECEBIDO CLIENTE', 'TAR PACOTE',
    ]);
    expect(result.avisos).toEqual([
      '3 linhas de saldo informadas pelo banco (SALDO TOTAL DISPONÍVEL DIA, SALDO ANTERIOR) foram desconsideradas — saldo não é movimentação.',
    ]);
  });

  it('reconhece a descrição sem acento e com outra caixa', () => {
    const variantes = ofxItau(ITAU_PADRAO)
      .replace('<MEMO>SALDO TOTAL DISPONÍVEL DIA', '<MEMO>Saldo do dia')
      .replace('<MEMO>SALDO TOTAL DISPONÍVEL DIA', '<MEMO>SALDO TOTAL DISPONIVEL DIA');
    const result = parseExtrato('itau.ofx', variantes);
    expect(result.linhas).toHaveLength(4);
    expect(result.linhas.some(l => /saldo/i.test(l.descricao))).toBe(false);
  });

  it('mantém movimento que só contém a palavra SALDO', () => {
    const comResgate = [itauTrn('20261002', '80.00', '20261002004', 'RESGATE SALDO APLIC'), ...ITAU_PADRAO];
    const result = parseExtrato('itau.ofx', ofxItau(comResgate));
    expect(result.linhas.map(l => l.descricao)).toContain('RESGATE SALDO APLIC');
  });

  it('sugere o saldo do último dia quando fecha com SALDO ANTERIOR + movimentos', () => {
    // O LEDGERBAL (R$ 90 em 03/10) inclui movimento do dia do download que não
    // está no arquivo; a conferência pelo último dia listado fecha no centavo.
    const result = parseExtrato('itau.ofx', ofxItau(ITAU_PADRAO));
    expect(result.saldoFinalArquivo).toEqual({ valor: 250, data: '2026-10-02' });
  });

  it('mantém o LEDGERBAL quando o saldo diário não fecha com os movimentos', () => {
    // Saldo com limite ou aplicação embutidos não é o saldo da conta.
    const comLimite = ofxItau(ITAU_PADRAO).replace('<TRNAMT>250.00', '<TRNAMT>1250.00');
    expect(parseExtrato('itau.ofx', comLimite).saldoFinalArquivo).toEqual({ valor: 90, data: '2026-10-03' });
  });

  it('mantém o LEDGERBAL quando há movimento depois do último saldo diário', () => {
    const comDia03 = [itauTrn('20261003', '-160.00', '20261003001', 'PIX ENVIADO FORNECEDOR'), ...ITAU_PADRAO];
    expect(parseExtrato('itau.ofx', ofxItau(comDia03)).saldoFinalArquivo).toEqual({ valor: 90, data: '2026-10-03' });
  });

  it('mantém o LEDGERBAL quando o arquivo não traz o SALDO ANTERIOR', () => {
    const semAnterior = [...ITAU_DIA_02, ...ITAU_DIA_01];
    expect(parseExtrato('itau.ofx', ofxItau(semAnterior)).saldoFinalArquivo).toEqual({ valor: 90, data: '2026-10-03' });
  });

  it('saldo negativo não desliga a dedução do sentido pelo TRNTYPE', () => {
    // Banco sem sinal nos movimentos: só o saldo da conta no vermelho vem negativo.
    const semSinal = ofxItau([
      itauTrn('20261001', '-70.00', '20261001001', 'SALDO DO DIA', 'DEBIT'),
      itauTrn('20261001', '100.00', '20261001002', 'TAR PACOTE', 'DEBIT'),
      itauTrn('20261001', '30.00', '20261001003', 'PIX RECEBIDO CLIENTE', 'CREDIT'),
    ]);
    const result = parseExtrato('itau.ofx', semSinal);
    expect(result.linhas.map(l => [l.descricao, l.tipo])).toEqual([
      ['TAR PACOTE', 'DESPESA'],
      ['PIX RECEBIDO CLIENTE', 'RECEITA'],
    ]);
  });

  it('CSV: descarta as linhas de saldo e avisa, sem popular saldoFinalArquivo', () => {
    const csv = [
      '09/10/2026;SALDO ANTERIOR;1.000,00',
      '09/10/2026;PIX RECEBIDO CLIENTE;150,00',
      '09/10/2026;SALDO DO DIA;1.150,00',
    ].join('\n');
    const result = parseExtrato('itau.csv', csv);
    expect(result.linhas.map(l => l.descricao)).toEqual(['PIX RECEBIDO CLIENTE']);
    expect(result.avisos).toEqual([
      '2 linhas de saldo informadas pelo banco (SALDO ANTERIOR, SALDO DO DIA) foram desconsideradas — saldo não é movimentação.',
    ]);
    expect(result.saldoFinalArquivo).toBeUndefined();
  });
});
