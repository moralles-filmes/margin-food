// ────────────────────────────────────────────────────────────────────────────
// Modelos de mensagem WhatsApp para Cotação (RFQ).
// A mensagem final é sempre editável pelo usuário antes do envio — estes são só
// pontos de partida. Interpolação simples de {{variaveis}}.
// ────────────────────────────────────────────────────────────────────────────
import type { Cotacao, CotacaoFornecedor, CotacaoItem, CotacaoWhatsappTipo } from '@/types/cotacao';

export const WHATSAPP_TIPO_LABEL: Record<CotacaoWhatsappTipo, string> = {
  SOLICITACAO_COTACAO: 'Solicitar cotação',
  COBRANCA_RESPOSTA: 'Cobrar resposta',
  NEGOCIACAO: 'Negociar',
  FECHAMENTO_PEDIDO: 'Fechar pedido',
  CONFIRMACAO_PRAZO: 'Confirmar prazo',
};

export interface TemplateContext {
  fornecedor_nome: string;
  cotacao_codigo: string;
  cotacao_titulo: string;
  validade: string;   // ex.: " até 30/06/2026" ou ""
  itens_texto: string; // lista formatada (uma por linha)
  empresa_nome: string;
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return '';
  // iso = yyyy-MM-dd → dd/MM/yyyy
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? ` até ${d}/${m}/${y}` : '';
}

/** Monta o contexto de interpolação a partir das entidades da cotação. */
export function buildTemplateContext(
  cotacao: Cotacao,
  fornecedor: CotacaoFornecedor | null,
  itens: CotacaoItem[],
  empresaNome = '',
): TemplateContext {
  const itensTexto = itens
    .map(it => {
      const un = it.purchase_unit_snapshot || it.unidade_snapshot || 'UN';
      const qtd = Number(it.quantidade) || 0;
      return `• ${it.produto_nome_snapshot} — ${qtd} ${un}`;
    })
    .join('\n');
  return {
    fornecedor_nome: fornecedor?.supplier_nome_snapshot ?? 'fornecedor',
    cotacao_codigo: cotacao.codigo,
    cotacao_titulo: cotacao.titulo,
    validade: formatDateLabel(cotacao.data_validade),
    itens_texto: itensTexto,
    empresa_nome: empresaNome,
  };
}

const TEMPLATES: Record<CotacaoWhatsappTipo, (c: TemplateContext) => string> = {
  SOLICITACAO_COTACAO: (c) =>
    `Olá, ${c.fornecedor_nome}! Tudo bem?\n\n` +
    `Gostaríamos de uma cotação (ref. ${c.cotacao_codigo}) para os itens abaixo:\n\n` +
    `${c.itens_texto}\n\n` +
    `Pode nos enviar os preços${c.validade}? Informe também prazo de entrega e condição de pagamento, por favor.\n\n` +
    `Obrigado!`,
  COBRANCA_RESPOSTA: (c) =>
    `Olá, ${c.fornecedor_nome}! Tudo bem?\n\n` +
    `Ainda estamos aguardando os preços da cotação ${c.cotacao_codigo}. ` +
    `Consegue nos enviar hoje${c.validade}? Obrigado!`,
  NEGOCIACAO: (c) =>
    `Olá, ${c.fornecedor_nome}! Recebemos sua proposta da cotação ${c.cotacao_codigo}.\n\n` +
    `Estamos comparando com outros fornecedores. Há possibilidade de melhorar o valor ou as condições? ` +
    `Queremos muito fechar com vocês.`,
  FECHAMENTO_PEDIDO: (c) =>
    `Olá, ${c.fornecedor_nome}! Fechamos com vocês a cotação ${c.cotacao_codigo}. 🎉\n\n` +
    `Itens do pedido:\n${c.itens_texto}\n\n` +
    `Pode confirmar o pedido e o prazo de entrega, por favor?`,
  CONFIRMACAO_PRAZO: (c) =>
    `Olá, ${c.fornecedor_nome}! Pode confirmar o prazo de entrega do pedido da cotação ${c.cotacao_codigo}? Obrigado!`,
};

/** Renderiza o texto inicial de um modelo. */
export function renderTemplate(tipo: CotacaoWhatsappTipo, ctx: TemplateContext): string {
  return (TEMPLATES[tipo] ?? TEMPLATES.SOLICITACAO_COTACAO)(ctx);
}
