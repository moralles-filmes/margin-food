import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { X, AtSign } from 'lucide-react';

interface UserOption {
  id: string;
  nome: string;
  email: string;
}

interface UserMentionSelectProps {
  value: string;
  onChange: (userId: string, userName: string) => void;
  placeholder?: string;
}

export default function UserMentionSelect({ value, onChange, placeholder = 'Buscar usuário (@nome)...' }: UserMentionSelectProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_profiles_minimal', { p_search: '', p_limit: 200 });
      if (data) setUsers(data as UserOption[]);
    })();
  }, []);

  // Resolve initial value
  useEffect(() => {
    if (value && users.length > 0 && !selectedUser) {
      const found = users.find(u => u.id === value);
      if (found) setSelectedUser(found);
    }
  }, [value, users, selectedUser]);

  const filtered = useMemo(() => {
    const q = search.replace('@', '').toLowerCase();
    if (!q) return users.slice(0, 10);
    return users.filter(u =>
      u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [users, search]);

  const handleSelect = (user: UserOption) => {
    setSelectedUser(user);
    onChange(user.id, user.nome);
    setSearch('');
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedUser(null);
    onChange('', '');
    setSearch('');
  };

  if (selectedUser) {
    return (
      <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-1.5">
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{selectedUser.nome.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-foreground font-medium flex-1">@{selectedUser.nome}</span>
        <button onClick={handleClear} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <AtSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="pl-8 text-xs bg-secondary border-border"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(u => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(u); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{u.nome.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{u.nome}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
