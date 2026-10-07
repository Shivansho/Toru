"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [totp, setTotp] = useState('');
  const [step, setStep] = useState<'EMAIL' | 'CODE'>('EMAIL');
  const [error, setError] = useState('');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch('/api/admin/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setStep('CODE');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to request OTP');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/admin/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, totp: totp || undefined })
      });
      const data = await res.json();
      
      if (res.ok) {
        router.push('/admin/overview');
      } else {
        setError(data.error || 'Invalid code');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/50 p-8 rounded-xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-red-500 tracking-wider mb-2">TORU ADMIN</h1>
          <p className="text-slate-400 text-sm">Secure Portal Access</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 text-red-200 px-4 py-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}

        {step === 'EMAIL' ? (
          <form onSubmit={handleRequest} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                placeholder="admin@toru.college"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Request Access
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Verification Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:ring-2 focus:ring-red-500 outline-none text-center tracking-widest text-lg font-mono"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Authenticator Code (if enrolled)</label>
              <input
                type="text"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:ring-2 focus:ring-red-500 outline-none text-center tracking-widest text-lg font-mono"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Verify & Login
            </button>
            <button
              type="button"
              onClick={() => setStep('EMAIL')}
              className="w-full text-slate-400 hover:text-white text-sm"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
