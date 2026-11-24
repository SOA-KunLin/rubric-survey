'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';

export default function LandingPage() {
  const { t, lang, setLang } = useLang();
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await api.post<{ token: string; name: string }>('/survey/auth', {
        name: name.trim(),
        accessCode: code.trim(),
      });
      localStorage.setItem('rs-rater', JSON.stringify({ token: res.token, name: res.name }));
      router.push('/evaluate');
    } catch (e: any) {
      setErr(t.wrongCreds);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <header className="topbar">
        <div className="brand">
          {t.appName}
          <small>{t.appSub}</small>
        </div>
        <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
          {t.langToggle}
        </button>
      </header>

      <div className="card">
        <h2 className="section">{t.raterLogin}</h2>
        <form onSubmit={submit}>
          <label className="field">
            {t.yourName}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <label className="field">
            {t.accessCode}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={120}
              type="password"
            />
          </label>
          {err && <div className="msg err">{err}</div>}
          <button className="btn primary" disabled={busy || !name.trim() || !code.trim()}>
            {t.start}
          </button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          <a href="/admin">{t.adminLink} →</a>
        </p>
      </div>
    </div>
  );
}
