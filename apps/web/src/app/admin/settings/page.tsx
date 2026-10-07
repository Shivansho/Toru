"use client";

import { useEffect, useState } from 'react';

export default function CollegeSettingsAdmin() {
  const [collegeId, setCollegeId] = useState('');
  const [settings, setSettings] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  
  // Form State
  const [domains, setDomains] = useState('');
  const [studentPattern, setStudentPattern] = useState('');
  const [staffPattern, setStaffPattern] = useState('');
  const [mustPassSamples, setMustPassSamples] = useState('');
  const [timeoutSecs, setTimeoutSecs] = useState(25);
  const [minPoolSize, setMinPoolSize] = useState(2);
  const [globalMessagesRet, setGlobalMessagesRet] = useState(30);
  const [chatSessionsRet, setChatSessionsRet] = useState(3);
  const [dailyAliasRotation, setDailyAliasRotation] = useState(true);

  // Tester State
  const [testSample, setTestSample] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const fetchSettings = async () => {
    if (!collegeId) return;
    const res = await fetch(`/api/admin/colleges/${collegeId}`);
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      setVersions(data.settingsVersions || []);
      
      setDomains(data.domains.join(', '));
      setStudentPattern(data.studentPattern);
      setStaffPattern(data.staffPattern);
      setMustPassSamples((data.mustPassSamples || []).join('\\n'));
      setTimeoutSecs(data.matcherSettings?.timeoutSecs || 25);
      setMinPoolSize(data.matcherSettings?.minPoolSize || 2);
      setGlobalMessagesRet(data.retentionSettings?.globalMessages || 30);
      setChatSessionsRet(data.retentionSettings?.chatSessions || 3);
      setDailyAliasRotation(data.featureFlags?.dailyAliasRotation || false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMsg('');
    
    const payload = {
      domains: domains.split(',').map(d => d.trim()).filter(Boolean),
      studentPattern,
      staffPattern,
      mustPassSamples: mustPassSamples.split('\\n').map(s => s.trim()).filter(Boolean),
      programmeLengths: settings?.programmeLengths || {},
      matcherSettings: { timeoutSecs: Number(timeoutSecs), minPoolSize: Number(minPoolSize) },
      retentionSettings: { globalMessages: Number(globalMessagesRet), chatSessions: Number(chatSessionsRet) },
      featureFlags: { dailyAliasRotation }
    };

    const res = await fetch(`/api/admin/colleges/${collegeId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      setMsg('Settings saved successfully and version snapshotted.');
      fetchSettings();
    } else {
      const err = await res.json();
      setError(err.error || 'Failed to save');
    }
  };

  const handleTest = async () => {
    const res = await fetch(`/api/admin/colleges/test-pattern`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample: testSample, studentPattern, staffPattern })
    });
    if (res.ok) {
      setTestResult(await res.json());
    }
  };

  const handleRevert = async (versionId: string) => {
    const res = await fetch(`/api/admin/colleges/${collegeId}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId })
    });
    if (res.ok) {
      setMsg('Reverted successfully.');
      fetchSettings();
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-3xl font-black tracking-widest text-slate-800 dark:text-slate-100">COLLEGE SETTINGS</h1>
      
      <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800">
        <label className="block text-sm font-bold text-slate-400 mb-2 uppercase">Load College by ID</label>
        <div className="flex gap-4">
          <input 
            className="flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-red-500"
            value={collegeId} 
            onChange={e => setCollegeId(e.target.value)} 
            placeholder="uuid" 
          />
          <button onClick={fetchSettings} className="bg-slate-800 text-white px-4 py-2 rounded font-bold">Load</button>
        </div>
      </div>

      {error && <div className="bg-red-900/30 border border-red-500 text-red-200 p-4 rounded">{error}</div>}
      {msg && <div className="bg-green-900/30 border border-green-500 text-green-200 p-4 rounded">{msg}</div>}

      {settings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-xl font-bold mb-4">Configuration</h2>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">DOMAINS (comma separated)</label>
              <input value={domains} onChange={e => setDomains(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">STUDENT REGEX PATTERN</label>
              <input value={studentPattern} onChange={e => setStudentPattern(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-sm" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">STAFF REGEX PATTERN</label>
              <input value={staffPattern} onChange={e => setStaffPattern(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-sm" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">MUST PASS SAMPLES (One per line)</label>
              <textarea rows={3} value={mustPassSamples} onChange={e => setMustPassSamples(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">MATCH TIMEOUT (SEC)</label>
                <input type="number" value={timeoutSecs} onChange={e => setTimeoutSecs(Number(e.target.value))} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">MIN POOL SIZE</label>
                <input type="number" value={minPoolSize} onChange={e => setMinPoolSize(Number(e.target.value))} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">GLOBAL MSGS (DAYS)</label>
                <input type="number" value={globalMessagesRet} onChange={e => setGlobalMessagesRet(Number(e.target.value))} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">SESSIONS (DAYS)</label>
                <input type="number" value={chatSessionsRet} onChange={e => setChatSessionsRet(Number(e.target.value))} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2" />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" checked={dailyAliasRotation} onChange={e => setDailyAliasRotation(e.target.checked)} id="rot" />
              <label htmlFor="rot" className="text-sm font-bold">Enable Daily Alias Rotation</label>
            </div>

            <button type="submit" className="w-full bg-red-600 text-white font-bold py-3 rounded mt-4">Save Configuration</button>
          </form>

          <div className="space-y-6">
            {/* Tester */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold mb-4 text-blue-500">Regex Pattern Tester</h2>
              <input value={testSample} onChange={e => setTestSample(e.target.value)} placeholder="Enter sample email" className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded px-3 py-2 mb-2 font-mono text-sm" />
              <button onClick={handleTest} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full">Simulate Parsing</button>
              
              {testResult && (
                <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded">
                  <div className="font-bold text-lg mb-2">Result: <span className={testResult.result === 'REJECTED' ? 'text-red-500' : 'text-green-500'}>{testResult.result}</span></div>
                  <pre className="text-xs text-slate-400">{JSON.stringify(testResult.groups, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* Version History */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded shadow border border-slate-200 dark:border-slate-800">
              <h2 className="text-xl font-bold mb-4">Version History</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {versions.map(v => (
                  <div key={v.id} className="p-3 bg-slate-100 dark:bg-slate-950 border border-slate-800 rounded flex justify-between items-center">
                    <div>
                      <div className="text-sm font-bold text-slate-300">{new Date(v.createdAt).toLocaleString()}</div>
                      <div className="text-xs text-slate-500">By: {v.adminId.slice(0,8)}</div>
                    </div>
                    <button onClick={() => handleRevert(v.id)} className="text-red-500 font-bold text-xs uppercase hover:underline">Revert to this</button>
                  </div>
                ))}
                {versions.length === 0 && <p className="text-slate-500 text-sm">No previous versions.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
