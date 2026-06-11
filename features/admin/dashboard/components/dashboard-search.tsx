'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useRouter } from '@/lib/i18n';

interface DashboardSearchProps {
  placeholder: string;
  submitLabel: string;
}

/**
 * Header quick-search. A functional stand-in for a global command palette:
 * routes the operator into the guest directory (`/admin/guests?q=`), which
 * already matches on name, phone, and email. Locale-aware via the next-intl
 * router. The full cross-entity ⌘K palette is a documented next step.
 */
export function DashboardSearch({ placeholder, submitLabel }: DashboardSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/admin/guests?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative w-full sm:w-72">
      <Search
        className="text-sarat-black-600 pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={submitLabel}
        className="rounded-button border-sarat-black/20 text-sarat-black placeholder:text-sarat-black-600 h-11 w-full [border-width:0.5px] bg-white ps-10 pe-4 text-base"
      />
    </form>
  );
}
