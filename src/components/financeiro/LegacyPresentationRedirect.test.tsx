import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import LegacyPresentationRedirect from '@/components/financeiro/LegacyPresentationRedirect';

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <output>
      {location.pathname}{location.search}{location.hash}|{navigationType}
    </output>
  );
}

describe('compatibilidade dos deep links antigos da Apresentação Sócios', () => {
  it('redireciona com replace e preserva detalhe, query string e hash', async () => {
    render(
      <MemoryRouter initialEntries={['/financeiro/relatorio-socios/cmv?period=month&month=2026-03#categoria']}>
        <Routes>
          <Route path="/financeiro/relatorio-socios/:detail" element={<LegacyPresentationRedirect />} />
          <Route path="/financeiro/apresentacao-socios/:detail" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      '/financeiro/apresentacao-socios/cmv?period=month&month=2026-03#categoria|REPLACE',
    ));
  });
});

