import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, Save, AlertTriangle } from 'lucide-react';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { parseExtrato, verifyContaExtrato, type ExtratoConta } from '@/lib/extratoParser';

import { useCan } from '@/permissions/hooks';
interface LinhaExtrato {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  selecionada: boolean;
}

interface ContaRef {
  id: string;
  nome: string;
  numero_conta: string | null;
  agencia: string | null;
  banco: string | null;
}

export default function ImportacaoExtratoSection() {
  const canViewRbac = useCan('financeiro:conciliacao:view');
  const { user } = useAuth();
  const [linhas, setLinhas] = useState<LinhaExtrato[]>([]);
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [contaSel, setContaSel] = useState('');
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Dialogo de alerta quando o extrato não pertence à conta selecionada
  const [contaMismatch, setContaMismatch] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    extratoInfo: ExtratoConta;
  } | null>(null);

  useState(() => {
    supabase.from('fin_contas').select('id, nome, numero_conta, agencia, banco').eq('ativo', true).order('nome')
      .then(({ data }) => setContas((data as ContaRef[]) || []));
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const result = parseExtrato(file.name, text);
      const parsed: LinhaExtrato[] = result.linhas.map(l => ({ ...l, selecionada: true }));

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo. Verifique o formato.');
        return;
      }

      // Verifica se o extrato pertence à conta selecionada (só quando uma conta está selecionada)
      if (contaSel) {
        const contaCadastro = contas.find(c => c.id === contaSel);
        const verdict = verifyContaExtrato(result.conta, contaCadastro);

        if (verdict.status === 'mismatch') {
          setContaMismatch({ open: true, parsed, extratoInfo: result.conta });
          return;
        }

        if (verdict.status === 'unverified' && (result.conta.numeroConta || result.conta.agencia)) {
          toast.warning('Não foi possível confirmar a conta do extrato — verifique se a conta selecionada está correta.');
        }
      }

      setLinhas(parsed);
      toast.success(`${parsed.length} transação(ões) encontrada(s)`);
    } catch (err) {
      console.error('[ImportacaoExtratoSection.handleFile]', err);
      toast.error('Erro ao processar arquivo');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleAll = (checked: boolean) => {
    setLinhas(prev => prev.map(l => ({ ...l, selecionada: checked })));
  };

  const importar = async () => {
    if (!contaSel) { toast.error('Selecione uma conta bancária'); return; }
    const selecionadas = linhas.filter(l => l.selecionada);
    if (selecionadas.length === 0) { toast.error('Nenhuma linha selecionada'); return; }

    setImportando(true);
    try {
      const lancamentos = selecionadas.map(l => ({
        data_competencia: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        conta_id: contaSel,
        status: 'REALIZADO',
        created_by: user?.id,
      }));

      const { error } = await supabase.from('fin_lancamentos').insert(lancamentos);
      if (error) throw error;

      toast.success(`${selecionadas.length} lançamento(s) importado(s) com sucesso!`);
      setLinhas([]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao importar');
    }
    setImportando(false);
  };

  const fmt = fmtBRL;
  const selecionadas = linhas.filter(l => l.selecionada);
  const totalEntradas = selecionadas.filter(l => l.tipo === 'RECEITA').reduce((s, l) => s + l.valor, 0);
  const totalSaidas = selecionadas.filter(l => l.tipo === 'DESPESA').reduce((s, l) => s + l.valor, 0);


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Importação de Extratos</h2>
          <p className="text-sm text-muted-foreground">Suporta CSV, OFX, QFX e OFC</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label>Conta Bancária</Label>
              <Select value={contaSel} onValueChange={setContaSel}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Arquivo (CSV/OFX/QFX/OFC)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,.ofx,.qfx,.ofc,.txt"
                onChange={handleFile}
                disabled={loading}
                className="max-w-[280px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {linhas.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              {selecionadas.length}/{linhas.length} selecionada(s) •
              <span className="text-success ml-1">+{fmt(totalEntradas)}</span> /
              <span className="text-destructive ml-1">-{fmt(totalSaidas)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Selecionar Todos</Button>
              <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Desmarcar Todos</Button>
              <Button size="sm" onClick={importar} disabled={importando || selecionadas.length === 0}>
                <Save className={`w-4 h-4 mr-1 ${importando ? 'animate-spin' : ''}`} />
                Importar {selecionadas.length}
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">✓</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((linha, i) => (
                <TableRow key={i} className={!linha.selecionada ? 'opacity-40' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={linha.selecionada}
                      onCheckedChange={(v) => setLinhas(prev => prev.map((l, j) => j === i ? { ...l, selecionada: !!v } : l))}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(linha.data))}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{linha.descricao}</TableCell>
                  <TableCell>
                    <Badge variant={linha.tipo === 'RECEITA' ? 'default' : 'destructive'}>{linha.tipo}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-bold ${linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>
                    {linha.tipo === 'RECEITA' ? '+' : '-'} {fmt(linha.valor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {linhas.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Selecione um arquivo CSV, OFX, QFX ou OFC para importar</p>
          <p className="text-xs mt-2">
            <strong>CSV:</strong> data;descrição;valor (separado por ; ou ,)<br />
            <strong>OFX/QFX/OFC:</strong> formatos bancários suportados
          </p>
        </CardContent></Card>
      )}

      {/* ========== CONTA MISMATCH ALERT ========== */}
      {contaMismatch && (
        <AlertDialog open={contaMismatch.open}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Conta do extrato diverge da selecionada
              </AlertDialogTitle>
            </AlertDialogHeader>

            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="font-semibold text-foreground">Identificação no arquivo:</p>
                {contaMismatch.extratoInfo.numeroConta && (
                  <p className="text-muted-foreground">
                    Conta: <span className="font-mono font-medium text-foreground">{contaMismatch.extratoInfo.numeroConta}</span>
                  </p>
                )}
                {contaMismatch.extratoInfo.agencia && (
                  <p className="text-muted-foreground">
                    Agência: <span className="font-mono font-medium text-foreground">{contaMismatch.extratoInfo.agencia}</span>
                  </p>
                )}
                {contaMismatch.extratoInfo.banco && (
                  <p className="text-muted-foreground">
                    Banco: <span className="font-medium text-foreground">{contaMismatch.extratoInfo.banco}</span>
                  </p>
                )}
              </div>

              {(() => {
                const cad = contas.find(c => c.id === contaSel);
                return cad ? (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                    <p className="font-semibold text-foreground">Conta selecionada: {cad.nome}</p>
                    {(cad.numero_conta || cad.agencia) ? (
                      <>
                        {cad.numero_conta && (
                          <p className="text-muted-foreground">
                            Conta: <span className="font-mono font-medium text-foreground">{cad.numero_conta}</span>
                          </p>
                        )}
                        {cad.agencia && (
                          <p className="text-muted-foreground">
                            Agência: <span className="font-mono font-medium text-foreground">{cad.agencia}</span>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Número/agência não cadastrados</p>
                    )}
                  </div>
                ) : null;
              })()}

              <p className="text-muted-foreground text-xs">
                Selecione a conta correta no dropdown ou confirme para importar mesmo assim.
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setContaMismatch(null)}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => {
                  const pending = contaMismatch.parsed;
                  setContaMismatch(null);
                  setLinhas(pending);
                  toast.success(`${pending.length} transação(ões) carregada(s)`);
                }}
              >
                Importar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
