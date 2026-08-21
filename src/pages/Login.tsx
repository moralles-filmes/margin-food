import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordInput from '@/components/PasswordInput';
import { toast } from 'sonner';
import { APP_TAGLINE } from '@/lib/brand';
import logoMarginPro from '@/assets/logo-marginpro.png';

export default function Login() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgot, setIsForgot] = useState(false);

  // If already authenticated, redirect to home
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error('Email ou senha incorretos.');
      setLoading(false);
    }
    // On success, onAuthStateChange in AuthContext will update user state,
    // which triggers the useEffect above to navigate to /
    // Keep loading=true to prevent double-click
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Informe o email'); return; }
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    toast.success('Se esse email existir no sistema, enviaremos um link para redefinição.');
    setLoading(false);
  };

  // Don't show login form if already authenticated
  if (authLoading || user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logoMarginPro} alt="MarginPro" className="h-16 mx-auto mb-2 object-contain" />
          <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          {isForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Recuperar Senha</h2>
              <p className="text-xs text-muted-foreground">Informe seu email para receber o link de redefinição.</p>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link'}
              </Button>
              <button type="button" onClick={() => setIsForgot(false)} className="text-xs text-primary hover:underline w-full text-center">
                Voltar ao login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Entrar</h2>

              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Senha</Label>
                <PasswordInput value={password} onChange={e => setPassword(e.target.value)} required wrapperClassName="mt-1" />
              </div>

              <button type="button" onClick={() => setIsForgot(true)} className="text-xs text-primary hover:underline">
                Esqueceu a senha?
              </button>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Carregando...' : 'Entrar'}
              </Button>

              <p className="text-[10px] text-center text-muted-foreground mt-3">
                Acesso restrito. Usuários são criados pelo administrador.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
