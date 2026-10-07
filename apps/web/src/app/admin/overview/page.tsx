"use client";

import { useEffect, useState } from 'react';

export default function OverviewDashboard() {
  const [stats, setStats] = useState<any>(null);

  const fetchStats = async () => {
    const res = await fetch('/api/admin/dashboard/overview');
    if (res.ok) {
      setStats(await res.json());
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="p-8 text-slate-500">Loading overview...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">PLATFORM OVERVIEW</h1>
        <button onClick={fetchStats} className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2 rounded font-bold">Refresh</button>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Users Online</span>
          <span className="text-4xl font-black text-green-500">{stats.usersOnline}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Active Chats</span>
          <span className="text-4xl font-black text-blue-500">{stats.activeChats}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">New Signups (Today)</span>
          <span className="text-4xl font-black text-slate-800 dark:text-slate-100">{stats.signupsToday} <span className="text-sm font-normal text-slate-400">/ {stats.signupsWeek} week</span></span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Messages Today</span>
          <span className="text-4xl font-black text-slate-800 dark:text-slate-100">{stats.msgsToday}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Moderation Column */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-bold mb-4 uppercase tracking-widest text-slate-500">Moderation Queue Health</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
              <span className="block text-sm font-bold text-slate-400 mb-1">Open Reports</span>
              <ul className="space-y-2 mt-2">
                {stats.reportsByPriority.map((r: any) => (
                  <li key={r.priority} className="flex justify-between font-mono text-sm">
                    <span>Priority {r.priority}</span>
                    <span className="font-bold text-red-500">{r.count}</span>
                  </li>
                ))}
                {stats.reportsByPriority.length === 0 && <li className="text-slate-500 text-sm">Queue is empty.</li>}
              </ul>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
              <span className="block text-sm font-bold text-slate-400 mb-1">Median Resolution Time</span>
              <div className="text-3xl font-black mt-2">
                {stats.medianResolutionMins} <span className="text-sm font-normal text-slate-500">mins</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-bold mb-4 uppercase tracking-widest text-slate-500">Discipline</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-400">Total Sanctions Issued</span>
              <span className="font-black text-xl">{stats.sanctionsIssued}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-400">Deactivated/Banned Accounts</span>
              <span className="font-black text-xl text-red-500">{stats.deactivated}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
