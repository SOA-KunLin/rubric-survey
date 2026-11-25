'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { applyTheme } from '@/lib/theme';
import { SiteConfig } from '@/lib/types';

export default function LandingPage() {
  const { t, lang, setLang } = useLang();
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [site, setSite] = useState<SiteConfig | null>(null);

  useEffect(() => {
    api
      .get<{ site: SiteConfig }>('/survey/site')
      .then((d) => {
        setSite(d.site);
        applyTheme(d.site);
        const chosen = localStorage.getItem('rs-lang');
        if (!chosen && d.site.defaultLang) setLang(d.site.defaultLang);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    } catch {
      setErr(t.wrongCreds);
    } finally {
      setBusy(false);
    }
  };

  const title = site ? (lang === 'zh' ? site.title.zh : site.title.en) : t.appName;
  const subtitle = site ? (lang === 'zh' ? site.subtitle.zh : site.subtitle.en) : t.appSub;

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <header className="topbar">
        <div className="brand">
          {title}
          <small>{subtitle}</small>
        </div>
        {(!site || site.allowLangToggle) && (
          <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
            {t.langToggle}
          </button>
        )}
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
