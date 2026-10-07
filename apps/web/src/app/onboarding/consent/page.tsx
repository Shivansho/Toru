"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const res = await fetch('/api/onboarding/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: 'terms', version: '1.0' })
    });
    
    if (res.ok) {
      router.push('/app'); // Or year correction if needed
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-2xl shadow-xl text-white">
      <h1 className="text-2xl font-bold mb-4">Terms & Guidelines</h1>
      
      <div className="bg-slate-800 rounded-lg p-4 h-64 overflow-y-auto mb-6 text-sm text-slate-300">
        <p className="mb-4">[Placeholder for Terms of Service Markdown]</p>
        <p className="mb-4">Community Guidelines:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Be respectful.</li>
          <li>No spam.</li>
          <li>Protect your identity.</li>
        </ul>
      </div>

      <label className="flex items-start space-x-3 mb-6 cursor-pointer">
        <input 
          type="checkbox" 
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-800"
        />
        <span className="text-sm text-slate-300">
          I have read and agree to the Terms of Service and Community Guidelines.
        </span>
      </label>

      <button 
        onClick={handleSubmit}
        disabled={loading || !agreed}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'Accept & Continue'}
      </button>
    </div>
  );
}
