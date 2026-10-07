"use client";

import { useEffect, useState } from 'react';

export default function WordlistAdmin() {
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState('BLOCK');
  const [collegeId, setCollegeId] = useState('');
  const [colleges, setColleges] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const fetchLists = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/wordlists');
    if (res.ok) setLists(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchLists();
    // Assuming a generic endpoint to get colleges for dropdown
    // For now, we mock it or expect the user to enter a college ID. Let's assume a generic fetch.
    // In a real app we'd fetch from /api/colleges but we can just use the first available college ID from list or manual entry.
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const res = await fetch('/api/admin/wordlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, kind, collegeId })
    });
    if (res.ok) {
      setTerm('');
      fetchLists();
      setMsg('Term added.');
    } else {
      const data = await res.json();
      setError(data.error);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(\`/api/admin/wordlists/\${id}\`, { method: 'DELETE' });
    if (res.ok) fetchLists();
  };

  const handleRefresh = async () => {
    setMsg('');
    const res = await fetch('/api/admin/wordlists/refresh', { method: 'POST' });
    if (res.ok) setMsg('Cache refresh signal sent to all instances.');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">WORD LISTS</h1>
        <button onClick={handleRefresh} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-bold transition shadow-lg shadow-red-900/20">
          Sync Cache to Servers
        </button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">{error}</div>}
      {msg && <div className="bg-green-900/30 border border-green-500 text-green-200 px-4 py-3 rounded mb-4">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ADD FORM */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-6 h-fit">
          <h2 className="font-bold mb-4 uppercase text-slate-500 tracking-wider text-sm">Add New Rule</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">College ID</label>
              <input 
                required 
                value={collegeId} 
                onChange={e => setCollegeId(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-red-500"
                placeholder="College ID"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Term / Regex</label>
              <input 
                required 
                value={term} 
                onChange={e => setTerm(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-red-500 font-mono"
                placeholder="e.g. badword"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Action</label>
              <select 
                value={kind} 
                onChange={e => setKind(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-red-500"
              >
                <option value="BLOCK">Block (Auto-reject)</option>
                <option value="REVIEW">Flag for Review</option>
              </select>
            </div>
            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded transition">
              Add Rule
            </button>
          </form>
        </div>

        {/* LIST */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-bold">Term</th>
                <th className="p-4 font-bold">Action</th>
                <th className="p-4 font-bold">College</th>
                <th className="p-4 font-bold text-right">Delete</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading...</td></tr>
              ) : lists.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">No active word list rules.</td></tr>
              ) : lists.map(item => (
                <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-4 font-mono font-bold text-sm text-slate-800 dark:text-slate-200">{item.term}</td>
                  <td className="p-4">
                    <span className={\`text-xs font-bold px-2 py-1 rounded \${item.kind === 'BLOCK' ? 'bg-red-900 text-red-200' : 'bg-yellow-900 text-yellow-200'}\`}>
                      {item.kind}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-500">{item.college?.name || item.collegeId.slice(0,8)}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-400 font-bold text-sm uppercase tracking-wider">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
