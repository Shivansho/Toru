"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ReportDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Action State
  const [actionReason, setActionReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reports/${params.id}`);
    if (res.ok) {
      setReport(await res.json());
    } else {
      setError('Failed to load report.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReport();
  }, [params.id]);

  const handleAssign = async () => {
    const res = await fetch(`/api/admin/reports/${params.id}/assign`, { method: 'PATCH' });
    if (res.ok) fetchReport();
    else alert('Failed to assign. Might be assigned already.');
  };

  const handleAction = async (action: string) => {
    if (!actionReason) return alert('A reason is mandatory for all actions.');
    
    setActionProcessing(true);
    const res = await fetch(`/api/admin/reports/${params.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason: actionReason })
    });
    setActionProcessing(false);

    if (res.ok) {
      fetchReport();
    } else {
      const err = await res.json();
      alert('Action failed: ' + err.error);
    }
  };

  const handleEscalate = async () => {
    if (!actionReason) return alert('A reason is mandatory to escalate.');
    
    setActionProcessing(true);
    const res = await fetch(`/api/admin/reports/${params.id}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: actionReason })
    });
    setActionProcessing(false);

    if (res.ok) {
      fetchReport();
    } else {
      const err = await res.json();
      alert('Escalation failed: ' + err.error);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading Report Details...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!report) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">
          REPORT <span className="text-slate-400 font-mono text-sm ml-2">{report.id}</span>
        </h1>
        <Link href="/admin/reports" className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2 rounded font-bold hover:bg-slate-300 transition">
          ← Back to Queue
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Transcript & Reporter Note */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-bold mb-4 uppercase text-slate-500 tracking-wider text-sm flex justify-between">
              <span>Transcript Evidence</span>
              {report.session ? (
                <span className="text-xs bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded">Session: {report.session.id.slice(0,8)}</span>
              ) : (
                <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-500 px-2 py-1 rounded">Global Message</span>
              )}
            </h2>
            
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-4 h-96 overflow-y-auto space-y-4">
              {report.transcript ? (
                report.transcript.map((msg: any, i: number) => {
                  const isReportedUser = msg.senderId === report.reportedId;
                  return (
                    <div key={i} className={`flex flex-col ${isReportedUser ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-slate-400 mb-1">
                        {isReportedUser ? 'Reported User (Alias: ' + report.reported?.alias + ')' : 'Other Participant'}
                      </span>
                      <div className={`px-4 py-2 rounded max-w-[80%] ${isReportedUser ? 'bg-red-900/20 border-red-500/50 border text-red-100' : 'bg-slate-200 dark:bg-slate-800'}`}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic">No transcript data available.</div>
              )}
            </div>
            
            {report.note && (
              <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded">
                <span className="block text-xs font-bold text-orange-500 uppercase tracking-wider mb-2">Reporter's Note</span>
                <p className="text-sm text-slate-800 dark:text-orange-200">{report.note}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: User History & Actions */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-bold mb-4 uppercase text-slate-500 tracking-wider text-sm">Target Profile</h2>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase">Internal ID</span>
                <span className="font-mono text-sm">{report.reported?.internalId.slice(0,8)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase">Alias</span>
                <span className="font-bold text-sm">{report.reported?.alias}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase">Prior Reports</span>
                <span className="font-bold text-sm text-orange-500">{report.reported?.priorReportsCount || 0}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase">Active Sanctions</span>
                <span className="font-bold text-sm text-red-500">{report.reported?.sanctions?.length || 0}</span>
              </div>
            </div>

            <h2 className="font-bold mb-4 uppercase text-slate-500 tracking-wider text-sm">Assignment</h2>
            {report.reviewerId ? (
              <div className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 p-3 rounded text-sm text-center">
                Assigned to <span className="font-mono text-slate-400 ml-1">{report.reviewerId.slice(0,8)}</span>
              </div>
            ) : (
              <button onClick={handleAssign} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition">
                Assign To Me
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-bold mb-4 uppercase text-slate-500 tracking-wider text-sm">Action Panel</h2>
            
            {report.status !== 'OPEN' && report.status !== 'IN_REVIEW' ? (
              <div className="text-center p-4 bg-green-900/30 text-green-500 font-bold border border-green-900 rounded">
                This report is {report.status}.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">MANDATORY REASON</label>
                  <textarea 
                    rows={2} 
                    value={actionReason} 
                    onChange={e => setActionReason(e.target.value)} 
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 outline-none text-sm"
                    placeholder="Provide a reason for the audit log..." 
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button disabled={actionProcessing} onClick={() => handleAction('dismiss')} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded text-xs transition">
                    DISMISS
                  </button>
                  <button disabled={actionProcessing} onClick={() => handleAction('warn')} className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded text-xs transition">
                    WARN
                  </button>
                  <button disabled={actionProcessing} onClick={() => handleAction('mute')} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded text-xs transition">
                    MUTE 24H
                  </button>
                  <button disabled={actionProcessing} onClick={() => handleAction('suspend')} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded text-xs transition">
                    SUSPEND 7D
                  </button>
                  <button disabled={actionProcessing} onClick={() => handleEscalate()} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs transition col-span-2">
                    ESCALATE PRIORITY
                  </button>
                  <button disabled={actionProcessing} onClick={() => handleAction('ban')} className="bg-red-800 hover:bg-red-700 text-white font-bold py-2 rounded text-xs transition col-span-2 shadow-lg shadow-red-900/20">
                    PERMANENT BAN
                  </button>
                  <button disabled={actionProcessing} onClick={() => handleAction('suspected_minor')} className="bg-slate-950 border border-red-500 text-red-500 hover:bg-red-900 hover:text-white font-bold py-2 rounded text-xs transition col-span-2">
                    SUSPECTED MINOR (SCORCHED EARTH)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
