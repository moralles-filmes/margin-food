
-- Auto-update updated_at triggers for financial tables
CREATE TRIGGER trg_updated_at_fin_lancamentos
  BEFORE UPDATE ON fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_fin_contas_pagar
  BEFORE UPDATE ON fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at_fin_contas_receber
  BEFORE UPDATE ON fin_contas_receber
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
