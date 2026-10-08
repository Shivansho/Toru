"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEGAL_VERSIONS } from '@shared/core';

export default function ConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const documents = [
        { document: 'terms', version: LEGAL_VERSIONS.terms },
        { document: 'privacy', version: LEGAL_VERSIONS.privacy },
        { document: 'guidelines', version: LEGAL_VERSIONS.guidelines },
      ];

      await Promise.all(documents.map(doc => 
        fetch('/api/onboarding/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc)
        }).then(res => {
          if (!res.ok) throw new Error('Failed to record consent');
        })
      ));
      
      router.push('/app'); 
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-2xl shadow-xl text-white mt-10">
      <h1 className="text-2xl font-bold mb-4">Terms, Privacy & Guidelines</h1>
      
      <div className="bg-slate-800 rounded-lg p-4 mb-6 text-sm text-slate-300">
        <p className="mb-4">Before using the app, you must agree to the latest versions of our legal documents.</p>
        <ul className="list-disc pl-5 space-y-2 mb-4">
          <li><a href="/legal/terms" target="_blank" className="text-blue-400 hover:underline">Terms of Use ({LEGAL_VERSIONS.terms})</a></li>
          <li><a href="/legal/privacy" target="_blank" className="text-blue-400 hover:underline">Privacy Policy ({LEGAL_VERSIONS.privacy})</a></li>
          <li><a href="/legal/guidelines" target="_blank" className="text-blue-400 hover:underline">Community Guidelines ({LEGAL_VERSIONS.guidelines})</a></li>
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
          I have read and agree to the Terms of Service, Privacy Policy, and Community Guidelines.
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
