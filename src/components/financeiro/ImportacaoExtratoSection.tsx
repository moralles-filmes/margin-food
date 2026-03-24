import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Upload, FileText, CheckCircle, XCircle, Save } from 'lucide-react';
import { fmtBRL } from '@/lib/money';

interface LinhaExtrato {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  selecionada: boolean;
}

export default function ImportacaoExtratoSection() {
  const { user } = useAuth();
  const [linhas, setLinhas] = useState<LinhaExtrato[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [contaSel, setContaSel] = useState('');
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useState(() => {
    supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setContas(data || []));
  });

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    const parsed: LinhaExtrato[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Try common CSV formats: date;desc;value or date,desc,value
      const sep = line.includes(';') ? ';' : ',';
      const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));

      if (parts.length < 3) continue;

      // Try to find date, description, value
      let data = '', descricao = '', valor = 0;

      // Attempt format: date, desc, value
      const dateCandidate = parts[0];
      if (/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(dateCandidate)) {
        // Parse dd/mm/yyyy or dd-mm-yyyy
        const dateParts = dateCandidate.split(/[\/\-]/);
        if (dateParts.length === 3) {
          const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
          data = `${year}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      } else if (/\d{4}-\d{2}-\d{2}/.test(dateCandidate)) {
        data = dateCandidate;
      }

      if (!data) continue; // Skip header or invalid lines

      descricao = parts[1] || '';

      // Value: last numeric column
      for (let j = parts.length - 1; j >= 2; j--) {
        const numStr = parts[j].replace(/\./g, '').replace(',', '.').replace(/[^\d\-\.]/g, '');
        const num = parseFloat(numStr);
        if (!isNaN(num) && num !== 0) {
          valor = num;
          break;
        }
      }

      if (!descricao || valor === 0) continue;

      parsed.push({
        data,
        descricao,
        valor: Math.abs(valor),
        tipo: valor > 0 ? 'RECEITA' : 'DESPESA',
        selecionada: true,
      });
    }

    return parsed;
  };

  const parseOFX = (text: string) => {
    const parsed: LinhaExtrato[] = [];
    const transactions = text.split('<STMTTRN>').slice(1);

    for (const tx of transactions) {
      const getTag = (tag: string) => {
        const match = tx.match(new RegExp(`<${tag}>([^<\\n]+)`));
        return match ? match[1].trim() : '';
      };

      const trntype = getTag('TRNTYPE');
      const dtposted = getTag('DTPOSTED');
      const trnamt = getTag('TRNAMT');
      const memo = getTag('MEMO') || getTag('NAME') || getTag('FITID');

      if (!dtposted || !trnamt) continue;

      const valor = parseFloat(trnamt.replace(',', '.'));
      const data = dtposted.length >= 8
        ? `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`
        : '';

      if (!data || isNaN(valor)) continue;

      parsed.push({
        data,
        descricao: memo || trntype || 'Sem descrição',
        valor: Math.abs(valor),
        tipo: valor >= 0 ? 'RECEITA' : 'DESPESA',
        selecionada: true,
      });
    }

    return parsed;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const ext = file.name.toLowerCase().split('.').pop();

      let parsed: LinhaExtrato[] = [];
      if (ext === 'ofx' || ext === 'qfx') {
        parsed = parseOFX(text);
      } else {
        parsed = parseCSV(text);
      }

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo. Verifique o formato.');
      } else {
        toast.success(`${parsed.length} transação(ões) encontrada(s)`);
      }

      setLinhas(parsed);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao processar arquivo');
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Importação de Extratos</h2>
          <p className="text-sm text-muted-foreground">Suporta CSV e OFX/QFX</p>
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
              <Label>Arquivo (CSV/OFX)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,.ofx,.qfx,.txt"
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
                  <TableCell className="font-mono text-sm">{linha.data}</TableCell>
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
          <p className="font-medium">Selecione um arquivo CSV ou OFX para importar</p>
          <p className="text-xs mt-2">
            <strong>CSV:</strong> data;descrição;valor (separado por ; ou ,)<br />
            <strong>OFX/QFX:</strong> formato padrão bancário
          </p>
        </CardContent></Card>
      )}
    </div>
  );
}
