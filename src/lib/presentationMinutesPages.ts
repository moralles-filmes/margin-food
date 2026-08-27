import type {
  PresentationMinutesExport,
  PresentationMeetingCanonicalReference,
} from '@/domain/financeiro/presentation';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';

export interface PresentationMinutesPageBlock {
  heading: string;
  body: string;
}

export interface PresentationMinutesPage {
  kind: 'cover' | 'content';
  title: string;
  subtitle: string;
  blocks: readonly PresentationMinutesPageBlock[];
  notes: string;
}

const MAX_PAGE_CHARS = 600;
const MAX_BLOCK_CHARS = 340;
const MAX_PAGE_HEIGHT_UNITS = 4.5;
const MAX_BLOCK_VISUAL_LINES = 5;
const MAX_BLOCKS_PER_PAGE = 2;
const APPROX_CHARS_PER_LINE = 74;

function formatDate(value: string | null): string {
  if (!value) return 'Não informado';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleDateString('pt-BR');
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleString('pt-BR');
}

function formatMetric(key: string, value: number | null): string {
  if (value === null) return 'Indisponível';
  return key === 'marginPercent' || key === 'cmvPercent'
    ? formatPercentBR(value, 1)
    : fmtBRL(value);
}

function splitText(text: string, maximum = MAX_BLOCK_CHARS): string[] {
  const normalized = text.trim();
  if (!normalized) return ['Não registrado'];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0) {
    const hardEnd = Math.min(remaining.length, maximum);
    let visualEnd = hardEnd;
    let lines = 1;
    let column = 0;
    for (let index = 0; index < hardEnd; index += 1) {
      if (remaining[index] === '\n') {
        lines += 1;
        column = 0;
      } else {
        column += 1;
        if (column >= APPROX_CHARS_PER_LINE) {
          lines += 1;
          column = 0;
        }
      }
      if (lines > MAX_BLOCK_VISUAL_LINES) {
        visualEnd = index;
        break;
      }
    }
    if (visualEnd >= remaining.length) {
      chunks.push(remaining);
      break;
    }
    let boundary = remaining.lastIndexOf('\n', visualEnd);
    if (boundary < Math.min(visualEnd * 0.55, 40)) boundary = remaining.lastIndexOf(' ', visualEnd);
    if (boundary < Math.min(visualEnd * 0.55, 40)) boundary = visualEnd;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  return chunks;
}

export function estimatePresentationMinutesVisualLines(text: string): number {
  return Math.max(1, Math.ceil(text.length / APPROX_CHARS_PER_LINE) + (text.match(/\n/g)?.length ?? 0));
}

export function estimatePresentationMinutesHeadingLines(text: string): number {
  return Math.max(1, Math.ceil(text.length / 78));
}

function paginateBlocks(input: {
  title: string;
  subtitle: string;
  blocks: readonly PresentationMinutesPageBlock[];
  notes: string;
}): PresentationMinutesPage[] {
  const continuationTitle = () => {
    if (input.title === 'Base financeira apresentada') return 'Base financeira · cont.';
    if (input.title === 'Pauta, discussão e conclusões') return 'Pauta e conclusões · cont.';
    if (input.title === 'Decisões e compromissos relacionados') return 'Decisões e ações · cont.';
    if (input.title === 'Identificação e participantes') return 'Participantes · cont.';
    if (input.title === 'Comparação e aprovação') return 'Comparação · cont.';
    return `${input.title} · cont.`;
  };
  const expanded = input.blocks.flatMap(block => splitText(block.body).map((body, index) => ({
    heading: index === 0 ? block.heading : `${block.heading} (continuação)`,
    body,
  })));
  const pages: PresentationMinutesPage[] = [];
  let current: PresentationMinutesPageBlock[] = [];
  let size = 0;
  let heightUnits = 0;
  expanded.forEach(block => {
    const blockSize = block.heading.length + block.body.length + 40;
    const bodyLines = estimatePresentationMinutesVisualLines(block.body);
    const headingHeightUnits = Math.max(0.34, estimatePresentationMinutesHeadingLines(block.heading) * 0.28);
    const blockHeightUnits = headingHeightUnits + 0.26 + Math.max(0.36, bodyLines * 0.23);
    if (current.length > 0 && (
      size + blockSize > MAX_PAGE_CHARS
      || heightUnits + blockHeightUnits > MAX_PAGE_HEIGHT_UNITS
      || current.length >= MAX_BLOCKS_PER_PAGE
    )) {
      pages.push({
        kind: 'content',
        title: pages.length === 0 ? input.title : continuationTitle(),
        subtitle: input.subtitle,
        blocks: current,
        notes: input.notes,
      });
      current = [];
      size = 0;
      heightUnits = 0;
    }
    current.push(block);
    size += blockSize;
    heightUnits += blockHeightUnits;
  });
  if (current.length > 0 || pages.length === 0) {
    pages.push({
      kind: 'content',
      title: pages.length === 0 ? input.title : continuationTitle(),
      subtitle: input.subtitle,
      blocks: current,
      notes: input.notes,
    });
  }
  return pages;
}

function referenceLine(reference: PresentationMeetingCanonicalReference): string {
  const meta = [
    `estado ${reference.status}`,
    `versão ${reference.version}`,
    reference.responsibleName ? `responsável ${reference.responsibleName}` : 'responsável não informado',
    reference.dueDate ? `prazo ${formatDate(reference.dueDate)}` : 'sem prazo',
    reference.priority ? `prioridade ${reference.priority}` : 'sem prioridade',
  ];
  return `${reference.title}\n${meta.join(' · ')}\nID ${reference.id}`;
}

function auditNotes(data: PresentationMinutesExport): string {
  const session = data.detail.session;
  const revision = data.revision;
  const snapshot = revision?.content.snapshot ?? session.snapshot;
  const sourceLines = snapshot
    ? Object.entries(snapshot.sources).map(([key, value]) => `- ${key}: ${value}`).join('\n')
    : '- snapshot indisponível';
  const ruleLines = snapshot
    ? Object.entries(snapshot.rules).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`).join('\n')
    : '- rules indisponíveis';
  return `[Meeting audit]\n- sessionId=${session.id}\n- sessionVersion=${session.version}\n- sessionStatus=${session.status}\n- revisionId=${revision?.id ?? 'draft'}\n- revisionNumber=${revision?.revisionNumber ?? 'draft'}\n- approvedAt=${revision?.approvedAt ?? 'not-approved'}\n- approvedBy=${revision?.approvedBy ?? 'not-approved'}\n- snapshotVersion=${snapshot?.contractVersion ?? 'not-captured'}\n- formulaVersion=${snapshot?.formulaVersion ?? 'not-captured'}\n- cutoffDate=${snapshot?.cutoffDate ?? 'not-captured'}\n- capturedAt=${snapshot?.capturedAt ?? 'not-captured'}\n- exportedAt=${data.exportedAt}\n[Sources]\n${sourceLines}\n[Rules]\n${ruleLines}`;
}

export function buildPresentationMinutesPages(data: PresentationMinutesExport): readonly PresentationMinutesPage[] {
  const detail = data.detail;
  const revision = data.revision;
  const content = revision?.content;
  const session = content?.session ?? detail.session;
  const participants = content?.participants ?? detail.participants;
  const agenda = content?.agendaItems ?? detail.agendaItems;
  const snapshot = content?.snapshot ?? detail.session.snapshot;
  const notes = auditNotes(data);
  const pages: PresentationMinutesPage[] = [{
    kind: 'cover',
    title: 'Ata Executiva',
    subtitle: session.title,
    blocks: [{
      heading: `${formatDate(session.period.start)} a ${formatDate(new Date(new Date(`${session.period.endExclusive}T12:00:00`).getTime() - 86_400_000).toISOString().slice(0, 10))}`,
      body: `Reunião em ${formatDate(session.meetingDate)}\nResponsável pela ata: ${session.minutesResponsibleName}\nEstado: ${detail.session.status}\nSessão ${detail.session.id}${revision ? ` · Ata v${revision.revisionNumber}` : ''}`,
    }],
    notes,
  }];

  pages.push(...paginateBlocks({
    title: 'Identificação e participantes',
    subtitle: 'Somente pessoas explicitamente incluídas',
    notes,
    blocks: [
      { heading: 'Contexto', body: session.context || 'Não informado' },
      { heading: 'Responsável pela ata', body: `${session.minutesResponsibleName}\nID ${session.minutesResponsibleUserId ?? 'usuário removido'}` },
      ...participants.map((participant, index) => ({
        heading: `Participante ${index + 1}`,
        body: `${participant.nameSnapshot}${participant.emailSnapshot ? ` · ${participant.emailSnapshot}` : ''}\nID ${participant.userId ?? 'usuário removido'}`,
      })),
    ],
  }));

  const metrics = snapshot?.metrics;
  pages.push(...paginateBlocks({
    title: 'Base financeira apresentada',
    subtitle: snapshot ? `Corte ${formatDate(snapshot.cutoffDate)} · ${snapshot.filters.comparisonMode}` : 'Snapshot ainda não capturado',
    notes,
    blocks: snapshot && metrics ? [
      {
        heading: 'KPIs exibidos',
        body: [
          `Receita: ${formatMetric('revenue', metrics.revenue)}`,
          `Despesa: ${formatMetric('expense', metrics.expense)}`,
          `Resultado: ${formatMetric('result', metrics.result)}`,
          `Margem: ${formatMetric('marginPercent', metrics.marginPercent)}`,
          `CMV: ${formatMetric('cmv', metrics.cmv)}`,
          `CMV sobre receita: ${formatMetric('cmvPercent', metrics.cmvPercent)}`,
        ].join('\n'),
      },
      { heading: 'Fontes', body: Object.entries(snapshot.sources).map(([key, value]) => `${key}: ${value}`).join('\n') },
      { heading: 'Regras e fórmula', body: `Fórmula: ${snapshot.formulaVersion}\n${Object.entries(snapshot.rules).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}` },
      { heading: 'Dados indisponíveis', body: snapshot.dataUnavailable.length ? snapshot.dataUnavailable.join('\n') : 'Nenhum campo sinalizado como indisponível' },
    ] : [{ heading: 'Disponibilidade', body: 'Snapshot não capturado. Nenhum valor foi convertido para zero.' }],
  }));

  pages.push(...paginateBlocks({
    title: 'Pauta, discussão e conclusões',
    subtitle: `${agenda.length} item(ns) na versão exportada`,
    notes,
    blocks: agenda.map(item => ({
      heading: `${item.position}. ${item.title} · ${item.reviewState}`,
      body: [
        `Tipo: ${item.itemType}`,
        `Objetivo/pergunta: ${item.objective || 'Não registrado'}`,
        `Discussão: ${item.discussionNotes || 'Não registrada'}`,
        `Conclusão: ${item.conclusion || 'Não registrada'}`,
        item.referenceId ? `Referência: ${item.referenceType} ${item.referenceId} · versão ${item.referenceVersion ?? 'indisponível'} · estado ${item.referenceStatus ?? 'indisponível'}` : 'Referência canônica: não aplicável',
      ].join('\n'),
    })),
  }));

  pages.push(...paginateBlocks({
    title: 'Decisões e compromissos relacionados',
    subtitle: 'Referências canônicas da Fase 11',
    notes,
    blocks: detail.canonicalReferences.length
      ? detail.canonicalReferences.map(reference => ({
        heading: reference.entityType === 'DECISION' ? 'Decisão' : 'Ação',
        body: referenceLine(reference),
      }))
      : [{ heading: 'Referências', body: 'Nenhuma decisão ou ação explicitamente relacionada.' }],
  }));

  pages.push(...paginateBlocks({
    title: 'Follow-up',
    subtitle: data.followUp.comparisonState === 'no-previous-session' ? 'Sem base de comparação' : 'Mudanças factuais por versão e timestamp',
    notes,
    blocks: [
      { heading: 'Pendências da pauta', body: data.followUp.unresolvedAgendaItems.length ? data.followUp.unresolvedAgendaItems.map(item => `${item.position}. ${item.title} · ${item.reviewState}`).join('\n') : 'Nenhuma' },
      { heading: 'Ações vencidas', body: data.followUp.overdueActions.length ? data.followUp.overdueActions.map(referenceLine).join('\n\n') : 'Nenhuma' },
      { heading: 'Ações na janela escolhida', body: data.followUp.dueSoonActions.length ? data.followUp.dueSoonActions.map(referenceLine).join('\n\n') : 'Nenhuma' },
      { heading: 'Ações sem prazo', body: data.followUp.noDueDateActions.length ? data.followUp.noDueDateActions.map(referenceLine).join('\n\n') : 'Nenhuma' },
      { heading: 'Ações sem prioridade', body: data.followUp.noPriorityActions.length ? data.followUp.noPriorityActions.map(referenceLine).join('\n\n') : 'Nenhuma' },
      { heading: 'Mudanças desde o snapshot', body: data.followUp.changedSinceSnapshot.length ? data.followUp.changedSinceSnapshot.map(referenceLine).join('\n\n') : 'Nenhuma mudança de versão ou estado detectada' },
    ],
  }));

  pages.push(...paginateBlocks({
    title: 'Comparação e aprovação',
    subtitle: data.comparison.state === 'available' ? 'Diferenças factuais entre versões' : data.comparison.state === 'no-previous-session' ? 'Sem base de comparação' : 'Comparação incompatível',
    notes,
    blocks: [
      {
        heading: 'Mudanças',
        body: data.comparison.state === 'available'
          ? data.comparison.differences.length
            ? data.comparison.differences.map(item => `${item.path}: ${String(item.before ?? 'ausente')} -> ${String(item.after ?? 'ausente')}`).join('\n')
            : 'Nenhuma diferença factual'
          : data.comparison.state === 'no-previous-session' ? 'Sem sessão anterior selecionada' : 'Períodos ou versões incompatíveis',
      },
      {
        heading: 'Aprovação da versão',
        body: revision
          ? `Ata v${revision.revisionNumber}\nEstado: ${revision.state}\nAprovada por: ${revision.approvedByName ?? 'Não aprovada'}\nAprovada em: ${formatTimestamp(revision.approvedAt)}\nMotivo da revisão: ${revision.revisionReason}\nID ${revision.id}`
          : 'Rascunho sem versão aprovada.',
      },
    ],
  }));
  return pages;
}
