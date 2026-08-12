import { describe, it, expect } from 'vitest';
import { parseExtrato, diaAnterior } from './extratoParser';

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
