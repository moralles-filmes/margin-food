import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface QuickSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (supplierName: string, supplierId: string) => void;
  defaultName?: string;
}

export default function QuickSupplierDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultName = '',
}: QuickSupplierDialogProps) {
  const { addSupplier } = useSalmonStore();
  const [name, setName] = useState(defaultName);
  const [cnpj, setCnpj] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);

  // Update name when defaultName changes and dialog opens
  useState(() => {
    if (open && defaultName && !name) {
      setName(defaultName);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('O nome do fornecedor é obrigatório');
      return;
    }

    setLoading(true);
    try {
      const newSupplier = await addSupplier({
        name: name.trim(),
        cnpj: cnpj.trim(),
        contact: contact.trim(),
        notes: 'Cadastrado via atalho rápido',
        active: true,
        categoriasAtendidas: [],
        prazoEntregaPadrao: 0,
        formaPagamentoPadrao: '',
      });

      toast.success(`Fornecedor "${newSupplier.name}" cadastrado com sucesso!`);
      onSuccess?.(newSupplier.name, newSupplier.id);
      onOpenChange(false);
      // Reset form
      setName('');
      setCnpj('');
      setContact('');
    } catch (error) {
      // Error is already handled by toast in useSalmonStore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Cadastro Rápido de Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome / Razão Social *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Ambev S.A."
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cnpj">CNPJ (Opcional)</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact">Contato (Opcional)</Label>
              <Input
                id="contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Tel, WhatsApp ou Email"
                disabled={loading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-primary-strong text-primary-foreground border-0"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Cadastrar Fornecedor'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
