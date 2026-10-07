"use client";

import { useEffect, useState } from 'react';

export default function LegalAndRevealAdmin() {
  const [legalRequests, setLegalRequests] = useState<any[]>([]);
  
  // Legal Form
  const [source, setSource] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [decision, setDecision] = useState('');
  
  // Reveal Form
  const [targetUserId, setTargetUserId] = useState('');
  const [revealReason, setRevealReason] = useState('');
  const [revealRef, setRevealRef] = useState('');
  const [totp, setTotp] = useState('');
  const [revealedEmail, setRevealedEmail] = useState('');
  
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const fetchLegal = async () => {
    const res = await fetch('/api/admin/dashboard/legal');
    if (res.ok) setLegalRequests(await res.json());
  };

  useEffect(() => {
    fetchLegal();
  }, []);

  const handleLogLegal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMsg('');
    const res = await fetch('/api/admin/dashboard/legal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, reference, description, decision })
    });
    if (res.ok) {
      setMsg('Legal request logged securely.');
      setSource(''); setReference(''); setDescription(''); setDecision('');
      fetchLegal();
    } else {
      setError((await res.json()).error);
    }
  };

  const handleRequestReveal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMsg(''); setRevealedEmail('');
    const res = await fetch(`/api/admin/dashboard/users/${targetUserId}/reveal/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: revealReason, legalRef: revealRef, totp, code: totp }) // Send as both totp and code depending on what admin uses
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'PENDING') {
        setMsg('Reveal request logged. Awaiting second Superadmin approval.');
      } else {
        setMsg('Reveal request auto-approved (Solo Superadmin). Click View.');
      }
    } else {
      setError((await res.json()).error);
    }
  };

  const handleApproveReveal = async (reqId: string) => {
    setError(''); setMsg('');
    const res = await fetch(`/api/admin/dashboard/reveals/${reqId}/approve`, { method: 'POST' });
    if (res.ok) {
      setMsg('Request approved.');
    } else {
      setError((await res.json()).error);
    }
  };

  const handleViewReveal = async () => {
    setError(''); setMsg('');
    const res = await fetch(`/api/admin/dashboard/users/${targetUserId}/reveal/view`);
    if (res.ok) {
      const data = await res.json();
      setRevealedEmail(data.email);
      setMsg('Email revealed. This will disappear upon refresh and is logged.');
    } else {
      setError((await res.json()).error);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">LEGAL & IDENTITY COMPLIANCE</h1>

      {error && <div className="bg-red-900/30 border border-red-500 text-red-200 px-4 py-3 rounded">{error}</div>}
      {msg && <div className="bg-green-900/30 border border-green-500 text-green-200 px-4 py-3 rounded">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Break Glass */}
        <div className="bg-red-950/20 border-2 border-red-900 p-6 rounded shadow-lg">
          <h2 className="text-xl font-black mb-2 text-red-500 tracking-wider">BREAK GLASS: EMAIL REVEAL</h2>
          <p className="text-xs text-red-300/80 mb-6 font-mono">WARNING: This action decrypts PII. It writes a high-visibility audit log that cannot be deleted. If multiple superadmins exist, this requires dual authorization.</p>
          
          <form onSubmit={handleRequestReveal} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-red-400 mb-1">TARGET USER ID</label>
              <input required value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className="w-full bg-red-950/40 border border-red-900 rounded px-3 py-2 outline-none font-mono text-sm text-red-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-red-400 mb-1">REASON / JUSTIFICATION</label>
              <input required value={revealReason} onChange={e => setRevealReason(e.target.value)} className="w-full bg-red-950/40 border border-red-900 rounded px-3 py-2 outline-none text-sm text-red-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-red-400 mb-1">LEGAL REFERENCE (OPTIONAL)</label>
              <input value={revealRef} onChange={e => setRevealRef(e.target.value)} className="w-full bg-red-950/40 border border-red-900 rounded px-3 py-2 outline-none text-sm text-red-100" placeholder="e.g. Subpoena 123-A" />
            </div>
            <div>
              <label className="block text-xs font-bold text-red-400 mb-1">YOUR RE-AUTHENTICATION (OTP/TOTP)</label>
              <input required value={totp} onChange={e => setTotp(e.target.value)} className="w-full bg-red-950/40 border border-red-900 rounded px-3 py-2 outline-none text-sm font-mono tracking-widest text-red-100" placeholder="000000" />
            </div>
            
            <div className="flex gap-4 pt-4 border-t border-red-900/50">
              <button type="submit" className="flex-1 bg-red-800 hover:bg-red-700 text-white font-bold py-2 rounded transition shadow-lg shadow-red-900/50">
                REQUEST REVEAL
              </button>
              <button type="button" onClick={handleViewReveal} className="flex-1 bg-blue-800 hover:bg-blue-700 text-white font-bold py-2 rounded transition shadow-lg shadow-blue-900/50">
                VIEW APPROVED
              </button>
            </div>
          </form>

          {revealedEmail && (
            <div className="mt-6 p-6 border-2 border-green-500 bg-green-950/30 rounded text-center">
              <span className="block text-xs font-bold text-green-400 mb-2 uppercase tracking-widest">Decrypted Identity</span>
              <span className="text-3xl font-black text-green-100">{revealedEmail}</span>
            </div>
          )}
        </div>

        {/* Legal Requests Logger */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-bold mb-4 uppercase text-slate-500">Log External Legal Request</h2>
          <form onSubmit={handleLogLegal} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">SOURCE</label>
                <input required value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. Local Police" className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">REFERENCE #</label>
                <input required value={reference} onChange={e => setReference(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">REQUEST DESCRIPTION</label>
              <textarea required rows={3} value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">DECISION / ACTION TAKEN</label>
              <input required value={decision} onChange={e => setDecision(e.target.value)} placeholder="e.g. Provided log segment 14; declined full dump" className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 outline-none text-sm" />
            </div>
            <button type="submit" className="w-full bg-slate-800 text-white font-bold py-2 rounded">Log Request</button>
          </form>
        </div>
      </div>

      {/* Legal Requests Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 bg-slate-100 dark:bg-slate-950 border-b border-slate-800">
          <h2 className="font-bold text-sm uppercase tracking-wider text-slate-500">Legal Compliance Logbook</h2>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th className="p-4 font-bold">Date</th>
              <th className="p-4 font-bold">Source & Ref</th>
              <th className="p-4 font-bold">Description</th>
              <th className="p-4 font-bold">Decision</th>
              <th className="p-4 font-bold">Handler</th>
            </tr>
          </thead>
          <tbody>
            {legalRequests.map(r => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-4 text-xs font-mono text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="p-4 text-sm font-bold">{r.source} <br/><span className="font-mono text-xs text-slate-400">{r.reference}</span></td>
                <td className="p-4 text-sm max-w-sm">{r.description}</td>
                <td className="p-4 text-sm italic">{r.decision}</td>
                <td className="p-4 font-mono text-xs">{r.adminId.slice(0,8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
