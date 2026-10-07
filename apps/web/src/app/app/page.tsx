"use client";

import { useEffect, useState, useRef, FormEvent } from 'react';
import io, { Socket } from 'socket.io-client';
import { GlobalMessagePayload, SessionMessagePayload } from '@shared/core';

type AppState = 'HOME' | 'GLOBAL_CHAT' | 'SEARCHING' | 'MATCH_CHAT' | 'MATCH_ENDED';
type YearFilter = 'ANY' | 'SAME_YEAR';

export default function MainApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<AppState>('HOME');
  const [yearFilter, setYearFilter] = useState<YearFilter>('ANY');
  const [errorMsg, setErrorMsg] = useState('');

  // Global Chat State
  const [gMessages, setGMessages] = useState<GlobalMessagePayload[]>([]);
  const [gInput, setGInput] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);

  // Match Chat State
  const [mMessages, setMMessages] = useState<(SessionMessagePayload & { isMe?: boolean })[]>([]);
  const [mInput, setMInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showWidenOffer, setShowWidenOffer] = useState(false);

  const mMessagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    fetch('/api/chat/global/history')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setGMessages(data);
      })
      .catch(console.error);

    const s = io(process.env.NEXT_PUBLIC_API_URL || '', { withCredentials: true });
    
    s.on('error', (err) => setErrorMsg(err.message));
    s.on('online-count', (c) => setOnlineCount(c));

    s.on('global:receive', (msg) => {
      setGMessages(prev => {
        const next = [...prev, msg];
        if (next.length > 100) next.shift();
        return next;
      });
    });

    s.on('match:joined', () => {
      setState('MATCH_CHAT');
      setMMessages([]);
      setShowWidenOffer(false);
    });

    s.on('match:widen-offer', () => {
      setShowWidenOffer(true);
    });

    s.on('match:ended', () => {
      setState('MATCH_ENDED');
    });

    s.on('session:receive', (msg) => {
      setMMessages(prev => [...prev, msg]);
      setIsTyping(false);
    });

    s.on('session:typing', ({ isTyping }) => {
      setIsTyping(isTyping);
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  useEffect(() => {
    if (state === 'MATCH_CHAT') {
      mMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mMessages, state]);

  // --- Handlers ---
  const handleFind = () => {
    socket?.emit('match:search', { filter: yearFilter });
    setState('SEARCHING');
    setShowWidenOffer(false);
  };

  const handleCancelSearch = () => {
    socket?.emit('match:cancel');
    setState('HOME');
  };

  const handleSkip = () => {
    socket?.emit('match:skip');
    setState('SEARCHING');
  };

  const handleLeave = () => {
    socket?.emit('match:leave');
    setState('MATCH_ENDED');
  };

  const sendMatch = (e: FormEvent) => {
    e.preventDefault();
    if (!mInput.trim() || !socket) return;
    
    const msg = { body: mInput };
    socket.emit('session:message', msg);
    
    setMMessages(prev => [...prev, { id: Date.now().toString(), body: mInput, createdAt: new Date().toISOString(), isMe: true }]);
    setMInput('');
    socket.emit('session:typing', { isTyping: false });
  };

  const onMatchInput = (val: string) => {
    setMInput(val);
    socket?.emit('session:typing', { isTyping: val.length > 0 });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit('session:typing', { isTyping: false });
    }, 2000);
  };

  // --- Views ---
  if (state === 'HOME') {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-md mx-auto p-6 items-center justify-center relative shadow-2xl border-x border-slate-800">
        <h1 className="text-3xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Toru Chat</h1>
        
        <div className="w-full bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-xl mb-6">
          <h2 className="font-bold mb-4">1-on-1 Chat</h2>
          <label className="block text-sm text-slate-400 mb-2">Year Preference</label>
          <select 
            value={yearFilter} 
            onChange={(e) => setYearFilter(e.target.value as YearFilter)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ANY">Any Year</option>
            <option value="SAME_YEAR">Same Year Only</option>
          </select>
          <button 
            onClick={handleFind}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/50 transition transform active:scale-95"
          >
            Find Someone
          </button>
        </div>

        <button 
          onClick={() => setState('GLOBAL_CHAT')}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl border border-slate-700 transition"
        >
          Enter Global Chat ({onlineCount} online)
        </button>
      </div>
    );
  }

  if (state === 'SEARCHING') {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-md mx-auto p-6 items-center justify-center relative border-x border-slate-800">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-bold">Looking for a match...</h2>
          <p className="text-slate-400 mt-2 text-center">Finding someone who meets your criteria.</p>
        </div>

        {showWidenOffer && (
          <div className="mt-8 bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 text-center">
            <p className="text-sm mb-3">Taking longer than expected.</p>
            <button 
              onClick={() => { setYearFilter('ANY'); handleFind(); }}
              className="bg-blue-600 px-4 py-2 rounded-lg text-sm"
            >
              Widen to Any Year
            </button>
          </div>
        )}

        <button 
          onClick={handleCancelSearch}
          className="absolute bottom-10 text-slate-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (state === 'MATCH_CHAT' || state === 'MATCH_ENDED') {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-md mx-auto relative border-x border-slate-800">
        <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center z-10">
          <div className="flex gap-2">
            <button onClick={handleSkip} className="bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-sm transition">Skip</button>
            <button onClick={handleLeave} className="bg-red-900/50 hover:bg-red-900 px-3 py-1 rounded text-sm transition text-red-200">End</button>
          </div>
          <div className="flex gap-2">
            <button className="text-xs text-orange-400 hover:text-orange-300">Report</button>
            <button className="text-xs text-red-400 hover:text-red-300">Block</button>
          </div>
        </div>

        <div className="bg-emerald-900/40 text-emerald-300 text-xs p-2 text-center border-b border-emerald-900/50">
          Be respectful. Chats are stored briefly for safety and can be reported.
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mMessages.map((msg, idx) => (
            <div key={msg.id || idx} className={\`flex \${msg.isMe ? 'justify-end' : 'justify-start'}\`}>
              <div className={\`max-w-[80%] rounded-2xl p-3 shadow-md \${msg.isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700'}\`}>
                <p className="text-sm break-words whitespace-pre-wrap">{msg.body}</p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-slate-800 rounded-2xl p-3 rounded-bl-sm border border-slate-700 text-slate-400 text-sm">
                Typing...
              </div>
            </div>
          )}
          <div ref={mMessagesEndRef} />
        </div>

        {errorMsg && (
          <div className="bg-red-900/80 text-white text-xs p-2 text-center flex justify-between px-4 absolute bottom-20 w-full z-20">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')}>✕</button>
          </div>
        )}

        {state === 'MATCH_ENDED' ? (
          <div className="bg-slate-900 border-t border-slate-800 p-6 text-center">
            <p className="text-red-400 font-bold mb-4">The other person has left the chat.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setState('HOME')} className="bg-slate-800 px-4 py-2 rounded">Home</button>
              <button onClick={() => { setYearFilter('ANY'); handleFind(); }} className="bg-blue-600 px-4 py-2 rounded font-bold">Find New Match</button>
            </div>
          </div>
        ) : (
          <form onSubmit={sendMatch} className="bg-slate-900 border-t border-slate-800 p-3">
            <div className="text-right text-xs text-slate-500 mb-1">{mInput.length}/500</div>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={mInput}
                onChange={e => onMatchInput(e.target.value)}
                placeholder="Type a message..."
                maxLength={500}
                className="flex-1 bg-slate-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button 
                type="submit" 
                disabled={!mInput.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-full px-4 py-2 text-sm font-bold transition"
              >
                Send
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // Fallback to Global Chat (can be moved to a separate component in real prod, kept simple here)
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-md mx-auto shadow-2xl relative border-x border-slate-800">
       <div className="bg-slate-900 p-4 flex justify-between items-center border-b border-slate-800">
         <button onClick={() => setState('HOME')} className="text-sm text-slate-400 hover:text-white">← Back</button>
         <div className="text-green-400 text-xs">{onlineCount} Online</div>
       </div>
       <div className="flex-1 p-4 overflow-y-auto space-y-4">
         {gMessages.map(m => (
           <div key={m.id} className="bg-slate-800 p-3 rounded-lg shadow border border-slate-700">
             <span className="font-bold text-sm text-blue-400">{m.alias}</span>
             <p className="text-sm mt-1">{m.body}</p>
           </div>
         ))}
       </div>
       <form onSubmit={(e) => { e.preventDefault(); socket?.emit('global:send', { body: gInput }); setGInput(''); }} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
         <input type="text" value={gInput} onChange={e => setGInput(e.target.value)} className="flex-1 bg-slate-800 rounded-full px-4 text-sm" placeholder="Message Global..." />
         <button type="submit" className="bg-blue-600 rounded-full px-4 text-sm font-bold">Send</button>
       </form>
    </div>
  );
}
