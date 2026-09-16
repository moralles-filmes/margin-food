import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { FileDown, Copy, FileText } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { PurchaseOrder, PurchaseOrderItem } from '@/hooks/usePurchaseOrdersStore';
import { gerarPDFPedidoFornecedor } from '@/lib/pdfPedidoFornecedor';
import { fmtBRL, formatDateBR, formatDateValueBR, formatFixedBR } from '@/lib/formatters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
}

export default function ExportPedidoModal({ open, onOpenChange, order, items }: Props) {
  const toast = useScopedToast();
  const [includePrice, setIncludePrice] = useState(false);
  const [extraNotes, setExtraNotes] = useState('');

  const orderCode = `PC-${order.id.slice(0, 6).toUpperCase()}`;
  const orderDate = formatDateBR(new Date(order.created_at));

  const buildWhatsAppText = () => {
    let text = `*PEDIDO DE COMPRA*\n`;
    text += `Nº ${orderCode} — ${orderDate}\n`;
    text += `Prioridade: ${order.priority}\n`;
    if (order.supplier_name) text += `Fornecedor: ${order.supplier_name}\n`;
    if (order.need_by_date) text += `Data necessidade: ${formatDateValueBR(order.need_by_date)}\n`;
    if (order.delivery_forecast_date) text += `Previsão entrega: ${formatDateValueBR(order.delivery_forecast_date)}\n`;
    if (order.payment_type) text += `Pagamento: ${order.payment_type}\n`;
    text += `\n*ITENS:*\n`;
    items.forEach((item, idx) => {
      const unit = item.purchase_unit_snapshot || item.unit_snapshot;
      let line = `${idx + 1}. ${item.name_snapshot} — ${item.qty_requested} ${unit}`;
      if (includePrice) {
        const cost = item.purchase_unit_cost_snapshot ?? item.estimated_unit_value;
        line += ` × ${fmtBRL(cost)} = ${fmtBRL(item.qty_requested * cost)}`;
      }
      text += line + '\n';
    });
    text += `\nTotal de itens: ${items.length}`;
    if (includePrice) {
      const total = items.reduce((s, i) => {
        const cost = i.purchase_unit_cost_snapshot ?? i.estimated_unit_value;
        return s + i.qty_requested * cost;
      }, 0);
      text += `\nTotal estimado: ${fmtBRL(total)}`;
    }
    if (order.notes) text += `\n\nObs: ${order.notes}`;
    if (extraNotes) text += `\n${extraNotes}`;
    text += `\n\n_Favor confirmar disponibilidade e prazo de entrega._`;
    return text;
  };

  const handlePDF = () => {
    gerarPDFPedidoFornecedor({
      order,
      items,
      includePrice,
      extraNotes,
      orderCode,
    });
    toast.success('PDF gerado!');
  };

  const handleCopyText = () => {
    const text = buildWhatsAppText();
    navigator.clipboard.writeText(text);
    toast.success('Texto copiado! Cole no WhatsApp.');
  };

  const handleCSV = () => {
    const header = ['Item', 'Unidade', 'Quantidade'];
    if (includePrice) header.push('Preço Unit.', 'Subtotal');
    const rows = items.map(i => {
      const unit = i.purchase_unit_snapshot || i.unit_snapshot;
      const cost = i.purchase_unit_cost_snapshot ?? i.estimated_unit_value;
      const row = [i.name_snapshot, unit, formatFixedBR(i.qty_requested, 2)];
      if (includePrice) {
        row.push(formatFixedBR(cost, 2), formatFixedBR(i.qty_requested * cost, 2));
      }
      return row;
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pedido_${orderCode}_${order.supplier_name || 'sem-fornecedor'}_${orderDate.replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV baixado!');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-primary" />
            Exportar para Fornecedor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1">
            <p><strong>Pedido:</strong> {orderCode} — {order.title}</p>
            <p><strong>Fornecedor:</strong> {order.supplier_name}</p>
            <p><strong>Itens:</strong> {items.length}</p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="include-price" className="text-sm">Incluir preços</Label>
            <Switch id="include-price" checked={includePrice} onCheckedChange={setIncludePrice} />
          </div>

          <div>
            <Label className="text-sm">Observações adicionais para o fornecedor</Label>
            <Textarea
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              placeholder="Ex: Entregar pela manhã, até 9h..."
              className="mt-1 text-xs"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button onClick={handlePDF} className="gap-2 flex-1">
            <FileDown className="w-4 h-4" /> Gerar PDF
          </Button>
          <Button onClick={handleCSV} variant="outline" className="gap-2 flex-1">
            <FileText className="w-4 h-4" /> CSV
          </Button>
          <Button onClick={handleCopyText} variant="outline" className="gap-2 flex-1">
            <Copy className="w-4 h-4" /> WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
