/** Defesa de estado local; a autorização do WebSocket continua sendo do servidor. */
export function companyRealtimeListener(companyId: string, onChange: () => void) {
  let active = true;
  return {
    receive(payload: { eventType: string; new: Record<string, unknown> }) {
      if (!active) return;
      // DELETE não garante company_id no payload. Só invalida e relê via RLS;
      // nunca aplica OLD ao estado nem o trata como recurso autorizado.
      if (payload.eventType !== 'DELETE' && payload.new.company_id !== companyId) return;
      onChange();
    },
    dispose() { active = false; },
  };
}
