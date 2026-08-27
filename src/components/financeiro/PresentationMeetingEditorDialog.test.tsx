import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresentationMeetingEditorDialog from './PresentationMeetingEditorDialog';
import { createPresentationMeetingDetail } from '@/test/fixtures/presentationMeeting';
import { AUTHOR_ID, RESPONSIBLE_ID } from '@/test/fixtures/presentationDecision';

vi.mock('@/hooks/usePresentationDecisions', () => ({
  usePresentationDecisionDetail: () => ({ data: undefined, isPending: false }),
}));

const companyId = '99999999-2222-4999-8999-999999999999';
const profiles = [
  { id: RESPONSIBLE_ID, nome: 'Responsável Operacional', email: 'responsavel@empresa.test', avatarUrl: null },
  { id: AUTHOR_ID, nome: 'Sócio Autor', email: 'socio@empresa.test', avatarUrl: null },
];

function renderEditor(overrides: Partial<React.ComponentProps<typeof PresentationMeetingEditorDialog>> = {}) {
  const detail = createPresentationMeetingDetail();
  const props: React.ComponentProps<typeof PresentationMeetingEditorDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    companyId,
    userId: AUTHOR_ID,
    period: detail.session.period,
    granularity: 'month',
    profiles,
    decisions: [],
    previousSessions: [],
    existingDetail: detail,
    saving: false,
    onSave: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return { ...render(<PresentationMeetingEditorDialog {...props} />), props };
}

describe('editor da sessão executiva', () => {
  beforeEach(() => sessionStorage.clear());

  it('expõe labels, ordem acessível e persiste a reordenação somente após clique explícito', async () => {
    const { props } = renderEditor();
    expect(screen.getByRole('dialog', { name: 'Editar sessão executiva' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título *', { selector: '#meeting-title' })).toHaveValue('Ritual executivo de março');
    expect(screen.getByLabelText('Data da reunião *')).toHaveValue('2026-03-20');
    expect(screen.getByRole('button', { name: 'Mover item 1 para cima' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover item 1 para baixo' })).toBeEnabled();
    expect(props.onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mover item 1 para baixo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(vi.mocked(props.onSave).mock.calls[0][0].agendaItems.map(item => item.title))
      .toEqual(['Item executivo extenso 2', 'Revisar decisão de custos']);
  });

  it('avisa antes de perder notas e restaura o foco no fluxo do diálogo', () => {
    const { props } = renderEditor();
    fireEvent.change(screen.getByLabelText('Notas da discussão', { selector: '#agenda-notes-0' }), {
      target: { value: 'Nota local ainda não salva.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('alertdialog', { name: 'Alterações não salvas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('Notas da discussão', { selector: '#agenda-notes-0' }))
      .toHaveValue('Nota local ainda não salva.');
  });

  it('preserva texto local durante conflito e exige resolução consciente', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const reapply = vi.fn().mockResolvedValue(undefined);
    renderEditor({
      conflict: 'A sessão mudou em outra tela.',
      onReloadConflict: reload,
      onReapplyConflict: reapply,
    });
    const notes = screen.getByLabelText('Notas da discussão', { selector: '#agenda-notes-0' });
    fireEvent.change(notes, { target: { value: 'Edição local preservada.' } });
    expect(screen.getByText('Conflito de concorrência')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar versão do banco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reaplicar conscientemente' }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(reapply).toHaveBeenCalledOnce();
    expect(notes).toHaveValue('Edição local preservada.');
  });

  it('não infere data, responsável, participante ou pauta ao preparar nova reunião', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ existingDetail: undefined, onSave });
    expect(screen.getByRole('dialog', { name: 'Preparar reunião' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Título *', { selector: '#meeting-title' })).toHaveValue('');
      expect(screen.getByLabelText('Data da reunião *')).toHaveValue('');
    });
    expect(screen.getByText('Nenhum item informado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar sessão' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('não restaura o rascunho da sessão editada ao abrir uma nova reunião', async () => {
    const detail = createPresentationMeetingDetail();
    const { props, rerender } = renderEditor({ existingDetail: detail });
    fireEvent.change(screen.getByLabelText('Notas da discussão', { selector: '#agenda-notes-0' }), {
      target: { value: 'Nota exclusiva da sessão existente.' },
    });
    await waitFor(() => expect(sessionStorage.length).toBe(1));

    rerender(<PresentationMeetingEditorDialog {...props} existingDetail={undefined} />);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Preparar reunião' })).toBeInTheDocument();
      expect(screen.getByLabelText('Título *', { selector: '#meeting-title' })).toHaveValue('');
    });
    expect(screen.queryByDisplayValue('Nota exclusiva da sessão existente.')).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(1);
  });
});
