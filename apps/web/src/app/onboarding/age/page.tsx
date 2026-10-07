"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AgeGate() {
  const router = useRouter();
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/onboarding/age-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dob })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'Verification failed');
      } else {
        // success or neutral failure
        if (data.message.includes('cannot activate')) {
          setError(data.message);
        } else {
          router.push('/onboarding/alias');
        }
      }
    } catch (err) {
      setError('An error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-2xl shadow-xl text-white">
      <h1 className="text-2xl font-bold mb-4">Age Verification</h1>
      <p className="text-slate-400 mb-6 text-sm">You must be at least 18 years old to use this platform.</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Date of Birth</label>
          <input 
            type="date" 
            value={dob}
            onChange={e => setDob(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        {error && <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">{error}</div>}
        
        <button 
          disabled={loading || !dob}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
