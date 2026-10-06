import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useRetornoFoco } from './useRetornoFoco';

function Exemplo({ comReserva = false }: { comReserva?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [mostrarBotao, setMostrarBotao] = useState(true);
  const retorno = useRetornoFoco(comReserva ? () => document.getElementById('reserva') : undefined);
  return (
    <>
      <input id="reserva" aria-label="Reserva" />
      {mostrarBotao && <button type="button" onClick={() => setAberto(true)}>Abrir</button>}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent {...retorno}>
          <DialogTitle>Diálogo</DialogTitle>
          <button type="button" onClick={() => { setMostrarBotao(false); setAberto(false); }}>Processar linha</button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Como o diálogo de saldo do extrato: abre por estado (sem gatilho focado) e o campo tem autoFocus. */
function ComAutoFocus({ comReserva }: { comReserva: boolean }) {
  const [aberto, setAberto] = useState(false);
  const retorno = useRetornoFoco(comReserva ? () => document.getElementById('arquivo') : undefined);
  return (
    <>
      <input id="arquivo" aria-label="Arquivo" />
      <button type="button" onClick={() => setAberto(true)}>Abrir</button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent {...retorno}>
          <DialogTitle>Confirme o saldo</DialogTitle>
          <input aria-label="Saldo" autoFocus />
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('useRetornoFoco', () => {
  it('com autoFocus dentro do diálogo a origem não é capturada: a reserva recebe o foco', async () => {
    render(<ComAutoFocus comReserva />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Saldo'));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Arquivo')));
  });

  it('devolve o foco ao botão que abriu um diálogo controlado por estado', async () => {
    render(<Exemplo />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(abrir));
  });

  it('usa a reserva quando o elemento de origem saiu da tela', async () => {
    render(<Exemplo comReserva />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    await screen.findByRole('dialog');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Processar linha' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Reserva')));
  });
});
