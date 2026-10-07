"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AliasGen() {
  const router = useRouter();
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAlias = async () => {
    setLoading(true);
    const res = await fetch('/api/onboarding/alias', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setAlias(data.alias);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlias();
  }, []);

  const handleContinue = () => {
    setSaving(true);
    router.push('/onboarding/consent');
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-2xl shadow-xl text-white text-center">
      <h1 className="text-2xl font-bold mb-2">Your Anonymous Alias</h1>
      <p className="text-slate-400 mb-8 text-sm">This is how you will appear to others.</p>
      
      {loading ? (
        <div className="animate-pulse bg-slate-800 h-16 rounded-xl mb-6"></div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
          <span className="text-3xl font-mono text-blue-400 font-bold">{alias}</span>
        </div>
      )}
      
      <div className="space-y-3">
        <button 
          onClick={fetchAlias}
          disabled={loading || saving}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg transition"
        >
          Regenerate Alias
        </button>
        
        <button 
          onClick={handleContinue}
          disabled={loading || saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
