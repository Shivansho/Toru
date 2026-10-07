"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function YearCorrectionPage() {
  const router = useRouter();
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/onboarding/year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correctedYear: parseInt(year, 10) })
    });
    
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.push('/app'), 2000);
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update year');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-2xl shadow-xl text-white">
      <h1 className="text-2xl font-bold mb-2">Lateral Entry Correction</h1>
      <p className="text-slate-400 mb-6 text-sm">
        If you joined as a lateral entry student, you can adjust your current year of study here. 
        This can only be done once.
      </p>

      {success ? (
        <div className="bg-green-900/30 text-green-400 p-4 rounded-lg">
          Successfully updated! Redirecting...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Actual Year of Study</label>
            <select 
              value={year}
              onChange={e => setYear(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="" disabled>Select your current year</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
              <option value="5">5th Year</option>
            </select>
          </div>
          
          {error && <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">{error}</div>}
          
          <button 
            disabled={loading || !year}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Update Year'}
          </button>
        </form>
      )}
    </div>
  );
}
