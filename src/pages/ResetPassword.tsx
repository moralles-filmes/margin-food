import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import PasswordInput from '@/components/PasswordInput';
import { toast } from 'sonner';
import { APP_NAME } from '@/lib/brand';
import { useNavigate } from 'react-router-dom';
import { usePasswordValidation } from '@/hooks/usePasswordValidation';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import logoMarginPro from '@/assets/logo-marginpro.png';

export default function ResetPassword() {
  const { password, setPassword, strength, strengthLabel, strengthColor, localErrors, serverErrors, isChecking, checkServer } = usePasswordValidation();
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('type=recovery')) {
      toast.error('Link inválido ou expirado');
      navigate('/login');
    }
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Senhas não coincidem');
      return;
    }

    if (localErrors.length > 0) {
      toast.error('Senha não atende os requisitos');
      return;
    }

    setLoading(true);
    
    // Check breached password server-side
    const isServerValid = await checkServer();
    if (!isServerValid) {
      toast.error('Senha não aprovada pela verificação de segurança');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else {
      toast.success('Senha atualizada com sucesso!');
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logoMarginPro} alt="MarginPro" className="h-16 mx-auto mb-2 object-contain" />
          <h2 className="text-lg font-display font-semibold text-foreground">Nova Senha</h2>
          <p className="text-xs text-muted-foreground mt-1">Mínimo 12 caracteres com maiúscula, minúscula, número e símbolo</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Nova senha</Label>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={12}
                wrapperClassName="mt-1"
              />
              <PasswordStrengthMeter
                strength={strength}
                strengthLabel={strengthLabel}
                strengthColor={strengthColor}
                errors={localErrors}
                serverErrors={serverErrors}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Confirmar senha</Label>
              <PasswordInput
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                wrapperClassName="mt-1"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[10px] text-destructive mt-1">Senhas não coincidem</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading || isChecking || localErrors.length > 0}>
              {loading || isChecking ? 'Verificando...' : 'Redefinir Senha'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
