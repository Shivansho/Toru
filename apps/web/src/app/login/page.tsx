"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send OTP');
      setStep('OTP');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid OTP');
      // On success, navigating to root will trigger the AuthGuard logic
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-md mx-auto p-6 items-center justify-center relative shadow-2xl border-x border-slate-800">
      <div className="w-full bg-slate-900 rounded-xl p-8 border border-slate-800 shadow-xl text-center">
        <h1 className="text-3xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Toru Chat
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {step === 'EMAIL' ? 'Enter your college email to continue.' : `Enter the 6-digit code sent to ${email}`}
        </p>
        
        {error && <div className="bg-red-900/50 text-red-200 p-3 rounded-lg mb-4 text-sm border border-red-800">{error}</div>}

        {step === 'EMAIL' ? (
          <form className="space-y-4" onSubmit={handleRequestOtp}>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student1@college.example" 
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              type="submit"
              disabled={loading || !email}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/50 transition transform active:scale-95"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleVerifyOtp}>
            <input 
              type="text" 
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456" 
              required
              maxLength={6}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg font-mono"
            />
            <button 
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-emerald-900/50 transition transform active:scale-95"
            >
              {loading ? 'Verifying...' : 'Verify Login'}
            </button>
            <button 
              type="button" 
              onClick={() => { setStep('EMAIL'); setOtp(''); setError(''); }}
              className="text-xs text-slate-400 hover:text-white mt-4"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
