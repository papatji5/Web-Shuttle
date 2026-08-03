"use client";

import React, { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

export default function SocketTest() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => console.log('Socket connected', s.id);
    const onMessage = (m: string) => setMessages((prev) => [...prev, m]);

    s.on('connect', onConnect);
    s.on('message', onMessage);

    // ensure the server route is initialized
    fetch('/api/socketio').catch(() => {});

    return () => {
      s.off('connect', onConnect);
      s.off('message', onMessage);
    };
  }, []);

  return (
    <div>
      <h3>Socket Test</h3>
      <div>Messages: {messages.length}</div>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
