"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ReportsQueue() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('OPEN');

  const fetchReports = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reports?status=${statusFilter}`);
    if (res.ok) {
      setReports(await res.json());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, [statusFilter]);

  // Keyboard shortcut example (R to refresh)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        fetchReports();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [statusFilter]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">REPORT QUEUE</h1>
        <div className="flex gap-4">
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2 rounded font-bold"
          >
            <option value="OPEN">Open</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
          <button onClick={fetchReports} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-bold transition">
            Refresh [R]
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th className="p-4 font-bold">Priority</th>
              <th className="p-4 font-bold">Reason</th>
              <th className="p-4 font-bold">Target User</th>
              <th className="p-4 font-bold">Prior Reports</th>
              <th className="p-4 font-bold">Time Waiting</th>
              <th className="p-4 font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading...</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No reports in this queue.</td></tr>
            ) : reports.map(r => {
              const hoursWaiting = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 3600000);
              const isBreachingSLA = hoursWaiting > 24;

              return (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-4">
                    {r.priority > 0 ? (
                      <span className="bg-red-900 text-red-200 text-xs font-bold px-2 py-1 rounded border border-red-500">HIGH ({r.priority})</span>
                    ) : (
                      <span className="text-slate-500 text-xs font-bold">NORMAL</span>
                    )}
                  </td>
                  <td className="p-4 font-mono text-sm">{r.reason}</td>
                  <td className="p-4 text-sm font-bold">{r.reported?.alias} <span className="text-slate-500 font-normal text-xs ml-2">ID: {r.reported?.internalId?.slice(0,8)}</span></td>
                  <td className="p-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${r.reported?.priorReportsCount > 2 ? 'bg-orange-900 text-orange-200' : 'bg-slate-800 text-slate-300'}`}>
                      {r.reported?.priorReportsCount}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`text-sm font-bold ${isBreachingSLA ? 'text-red-500' : 'text-slate-400'}`}>
                      {hoursWaiting}h
                    </span>
                  </td>
                  <td className="p-4">
                    <Link href={`/admin/reports/${r.id}`} className="text-blue-500 hover:text-blue-400 font-bold text-sm">
                      Review →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
