"use client";

import { useEffect, useState } from 'react';

export default function AuditLogAdmin() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [adminId, setAdminId] = useState('');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: page.toString() });
    if (adminId) query.append('adminId', adminId);
    if (action) query.append('action', action);
    if (target) query.append('target', target);

    const res = await fetch(`/api/admin/dashboard/audit?${query.toString()}`);
    if (res.ok) setLogs(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const downloadCsv = () => {
    const query = new URLSearchParams({ format: 'csv' });
    if (adminId) query.append('adminId', adminId);
    if (action) query.append('action', action);
    if (target) query.append('target', target);
    
    window.open(`/api/admin/dashboard/audit?${query.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">AUDIT LOG</h1>
        <button onClick={downloadCsv} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded font-bold transition">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white dark:bg-slate-900 p-4 rounded shadow border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1">ADMIN ID</label>
          <input value={adminId} onChange={e => setAdminId(e.target.value)} className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 outline-none font-mono text-sm" placeholder="Any" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1">ACTION</label>
          <input value={action} onChange={e => setAction(e.target.value)} className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 outline-none font-mono text-sm" placeholder="e.g. UPDATE_COLLEGE_SETTINGS" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1">TARGET</label>
          <input value={target} onChange={e => setTarget(e.target.value)} className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 outline-none font-mono text-sm" placeholder="Target ID" />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded font-bold h-[42px]">Filter</button>
      </form>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-bold">Timestamp</th>
                <th className="p-4 font-bold">Admin</th>
                <th className="p-4 font-bold">Action</th>
                <th className="p-4 font-bold">Target</th>
                <th className="p-4 font-bold">Reason / Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No logs found matching criteria.</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-4 text-xs font-mono text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="p-4">
                    <div className="text-sm font-bold">{log.adminId.slice(0,8)}</div>
                    <div className="text-xs text-slate-400">{log.admin?.role}</div>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${log.action.includes('REVEAL') ? 'bg-red-900 text-red-200' : 'bg-slate-800 text-slate-300'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-400">{log.target}</td>
                  <td className="p-4 text-sm truncate max-w-md">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded disabled:opacity-50">Previous</button>
        <span className="text-sm font-bold">Page {page}</span>
        <button disabled={logs.length < 50} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}
