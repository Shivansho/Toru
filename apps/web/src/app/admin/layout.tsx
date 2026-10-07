"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [idleTime, setIdleTime] = useState(0);
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  useEffect(() => {
    if (pathname === '/admin/login') {
      setLoading(false);
      return;
    }

    fetch('/api/admin/me')
      .then(r => {
        if (!r.ok) throw new Error('Unauthorized');
        return r.json();
      })
      .then(data => {
        setRole(data.role);
        setLoading(false);
      })
      .catch(() => {
        router.push('/admin/login');
      });
  }, [pathname, router]);

  // Idle timeout (15 mins = 900s). Warning at 14 mins.
  useEffect(() => {
    if (pathname === '/admin/login') return;
    
    const timer = setInterval(() => {
      setIdleTime(prev => {
        const next = prev + 1;
        if (next === 840) setShowIdleWarning(true); // 14 mins
        if (next >= 900) {
          fetch('/api/admin/logout', { method: 'POST' }).finally(() => router.push('/admin/login'));
        }
        return next;
      });
    }, 1000);

    const resetIdle = () => {
      setIdleTime(0);
      setShowIdleWarning(false);
    };

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keypress', resetIdle);

    return () => {
      clearInterval(timer);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keypress', resetIdle);
    };
  }, [pathname, router]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Loading Admin...</div>;

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const navItems = [
    { label: 'Overview', href: '/admin/overview', roles: ['superadmin', 'moderator'] },
    { label: 'Reports', href: '/admin/reports', roles: ['superadmin', 'moderator'] },
    { label: 'Users', href: '/admin/users', roles: ['superadmin', 'moderator'] },
    { label: 'Live chat', href: '/admin/live-chat', roles: ['superadmin', 'moderator'] },
    { label: 'Word lists', href: '/admin/wordlists', roles: ['superadmin'] },
    { label: 'College settings', href: '/admin/settings', roles: ['superadmin'] },
    { label: 'Audit log', href: '/admin/audit', roles: ['superadmin'] }
  ];

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 text-white flex flex-col border-r border-red-900/50 hidden md:flex">
        <div className="p-6">
          <h1 className="text-2xl font-black tracking-wider text-red-500">TORU ADMIN</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">{role}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.filter(item => item.roles.includes(role!)).map(item => (
            <Link 
              key={item.href} 
              href={item.href}
              className={`block px-4 py-2 rounded transition ${pathname.startsWith(item.href) ? 'bg-red-600 text-white font-bold shadow-lg shadow-red-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { fetch('/api/admin/logout', { method: 'POST' }).then(() => router.push('/admin/login')) }} className="w-full text-left px-4 py-2 text-slate-400 hover:text-white transition">
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="md:hidden bg-slate-950 text-white p-4 flex justify-between items-center border-b border-red-900/50">
           <h1 className="text-xl font-black text-red-500">TORU ADMIN</h1>
           <span className="text-xs uppercase text-slate-400">{role}</span>
        </header>

        <main className="flex-1 overflow-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-900">
          {showIdleWarning && (
            <div className="bg-orange-900/50 border border-orange-500 text-orange-200 px-4 py-3 rounded mb-6 flex justify-between items-center shadow-lg">
              <span>Your admin session is about to expire due to inactivity.</span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
