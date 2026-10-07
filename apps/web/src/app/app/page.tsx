"use client";

import { useEffect, useState, useRef, FormEvent } from 'react';
import io, { Socket } from 'socket.io-client';
import { GlobalMessagePayload } from '@shared/core';

export default function ChatApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<GlobalMessagePayload[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [input, setInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load history
  useEffect(() => {
    fetch('/api/chat/global/history')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(console.error);
  }, []);

  // Socket connection
  useEffect(() => {
    const s = io(process.env.NEXT_PUBLIC_API_URL || '', { withCredentials: true });
    
    s.on('connect_error', (err) => {
      setErrorMsg(err.message);
    });

    s.on('error', (err) => {
      setErrorMsg(err.message);
      if (err.code === 'FLOODING') s.disconnect();
    });

    s.on('online-count', (c) => setOnlineCount(c));

    s.on('global:receive', (msg: GlobalMessagePayload) => {
      setMessages(prev => {
        const next = [...prev, msg];
        if (next.length > 100) next.shift(); // keep 100 in memory
        return next;
      });
      // Handle auto scroll
      if (isAtBottom) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setShowNewIndicator(true);
      }
    });

    s.on('global:delete', ({ id }) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    });

    setSocket(s);

    const interval = setInterval(() => {
      if (s.connected) s.emit('heartbeat');
    }, 25000);

    return () => {
      clearInterval(interval);
      s.disconnect();
    };
  }, [isAtBottom]);

  // Initial scroll
  useEffect(() => {
    if (messages.length > 0 && isAtBottom) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [messages, isAtBottom]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
    if (atBottom) setShowNewIndicator(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
    setShowNewIndicator(false);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    if (input.length > 500) {
      setErrorMsg('Message too long (max 500)');
      return;
    }
    
    socket.emit('global:send', { body: input });
    setInput('');
  };

  const handleAction = async (endpoint: string, id: string) => {
    await fetch(\`/api/chat/\${endpoint}\`, { method: 'POST', body: JSON.stringify({ id }) });
    alert(\`\${endpoint} submitted\`);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-md mx-auto shadow-2xl relative border-x border-slate-800">
      
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="font-bold text-lg">College Global</h1>
        <div className="flex items-center text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
          {onlineCount} Online
        </div>
      </div>

      {/* Rules Banner */}
      <div className="bg-blue-900/40 text-blue-300 text-xs p-2 text-center border-b border-blue-900/50">
        Be respectful. No personal info. Messages are monitored.
      </div>
      
      {/* Messages */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 mt-10">No messages yet. Say hi!</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="bg-slate-800 rounded-lg p-3 shadow group relative">
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-bold text-sm text-blue-400">{msg.alias}</span>
                <span className="text-xs text-slate-500">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{msg.body}</p>
              
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-2 transition bg-slate-800/90 rounded p-1">
                <button onClick={() => handleAction('report', msg.id)} className="text-xs text-orange-400 hover:text-orange-300">Report</button>
                <button onClick={() => handleAction('block', msg.id)} className="text-xs text-red-400 hover:text-red-300">Block</button>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating New Indicator */}
      {showNewIndicator && (
        <button 
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-4 py-2 rounded-full shadow-lg"
        >
          New messages ↓
        </button>
      )}

      {/* Error / Status Bar */}
      {errorMsg && (
        <div className="bg-red-900/80 text-white text-xs p-2 text-center absolute bottom-16 w-full flex justify-between px-4">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')}>✕</button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={send} className="bg-slate-900 border-t border-slate-800 p-3">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 bg-slate-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button 
            type="submit" 
            disabled={!input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full px-4 py-2 text-sm font-bold transition"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
