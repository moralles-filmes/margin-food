import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PasswordValidation {
  password: string;
  setPassword: (pw: string) => void;
  strength: number; // 0-5
  strengthLabel: string;
  strengthColor: string;
  localErrors: string[];
  serverErrors: string[];
  isChecking: boolean;
  isValid: boolean;
  checkServer: () => Promise<boolean>;
}

const COMMON_PASSWORDS = [
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', 'master',
  'dragon', 'login', 'princess', 'password1', 'qwerty123', 'letmein', 'welcome',
  '1234567890', 'admin', 'passw0rd', 'senha123', 'mudar123',
];

export function usePasswordValidation(): PasswordValidation {
  const [password, setPassword] = useState('');
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const localErrors = useMemo(() => {
    if (!password) return [];
    const errs: string[] = [];
    if (password.length < 12) errs.push('Mínimo 12 caracteres');
    if (!/[A-Z]/.test(password)) errs.push('1 letra maiúscula');
    if (!/[a-z]/.test(password)) errs.push('1 letra minúscula');
    if (!/[0-9]/.test(password)) errs.push('1 número');
    if (!/[^A-Za-z0-9]/.test(password)) errs.push('1 símbolo especial');
    if (COMMON_PASSWORDS.includes(password.toLowerCase())) errs.push('Senha muito comum');
    return errs;
  }, [password]);

  const strength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const strengthLabel = useMemo(() => {
    if (!password) return '';
    if (strength <= 1) return 'Muito fraca';
    if (strength <= 2) return 'Fraca';
    if (strength <= 3) return 'Razoável';
    if (strength <= 4) return 'Boa';
    return 'Forte';
  }, [password, strength]);

  const strengthColor = useMemo(() => {
    if (strength <= 1) return 'bg-destructive';
    if (strength <= 2) return 'bg-destructive/70';
    if (strength <= 3) return 'bg-warning';
    if (strength <= 4) return 'bg-primary';
    return 'bg-success';
  }, [strength]);

  const checkServer = useCallback(async (): Promise<boolean> => {
    if (localErrors.length > 0) {
      setServerErrors([]);
      return false;
    }
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-password', {
        body: { password }
      });
      if (error) {
        setServerErrors([]);
        return true; // Don't block on function errors
      }
      setServerErrors(data.errors || []);
      return data.valid === true;
    } catch {
      setServerErrors([]);
      return true;
    } finally {
      setIsChecking(false);
    }
  }, [password, localErrors]);

  return {
    password, setPassword,
    strength, strengthLabel, strengthColor,
    localErrors, serverErrors, isChecking,
    isValid: localErrors.length === 0 && serverErrors.length === 0,
    checkServer,
  };
}
