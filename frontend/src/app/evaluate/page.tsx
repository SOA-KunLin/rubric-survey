'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { applyTheme } from '@/lib/theme';
import { ResolvedCase, SiteConfig } from '@/lib/types';

function savedRater(): { token: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('rs-rater') || 'null');
  } catch {
    return null;
  }
}

export default function EvaluateListPage() {
  const { t, lang, setLang } = useLang();
  const router = useRouter();
  const [rater, setRater] = useState<{ token: string; name: string } | null>(null);
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [cases, setCases] = useState<ResolvedCase[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const r = savedRater();
    if (!r) {
      router.replace('/');
      return;
    }
    setRater(r);
    api
      .get<{ site: SiteConfig; cases: ResolvedCase[] }>(`/survey/cases?token=${r.token}`)
      .then((d) => {
        setSite(d.site);
        applyTheme(d.site);
        if (!localStorage.getItem('rs-lang') && d.site.defaultLang) setLang(d.site.defaultLang);
        setCases(d.cases);
      })
      .catch(() => setErr(t.errorLoad));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = cases?.length || 0;
  const done = cases?.filter((c) => c.myStatus === 'submitted').length || 0;
  const started = cases?.filter((c) => c.myStatus !== 'not-started' && c.myStatus !== 'submitted').length || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const logout = () => {
    localStorage.removeItem('rs-rater');
    router.push('/');
  };

  const caseTitle = (c: ResolvedCase) => (lang === 'zh' ? c.title.zh || c.title.en : c.title.en || c.title.zh);

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          {site ? (lang === 'zh' ? site.title.zh : site.title.en) : t.appName}
          <small>{rater ? `${t.rater}: ${rater.name}` : ''}</small>
        </div>
        <div className="row">
          {(!site || site.allowLangToggle) && (
            <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
              {t.langToggle}
            </button>
          )}
          <button className="btn" onClick={logout}>
            {t.logout}
          </button>
        </div>
      </header>

      {err && <div className="msg err">{err}</div>}
      {!cases && !err && <div className="card muted">{t.loading}</div>}

      {cases && (
        <>
          <div className="card">
            <div className="row spread" style={{ marginBottom: 8 }}>
              <h2 className="section" style={{ margin: 0 }}>
                {t.progress}: {done} / {total} ({t.statusSubmitted})
              </h2>
              <span className="muted">
                {t.statusDraft}: {started}
              </span>
            </div>
            <div className="progressbar">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="card">
            <h2 className="section">{t.caseList}</h2>
            {cases.length === 0 && <div className="muted">—</div>}
            {cases.map((c, i) => {
              const answered = c.answeredCount ?? 0;
              const required = c.requiredCount ?? 0;
              const isDone = c.myStatus === 'submitted';
              const isDraft = c.myStatus === 'draft';
              return (
                <div
                  key={c.id}
                  className="row spread"
                  style={{ borderTop: i ? '1px solid var(--line)' : 'none', padding: '12px 0' }}
                >
                  <div>
                    <b>
                      {t.caseBadge} {i + 1}: {caseTitle(c)}
                    </b>
                    <div className="muted">
                      {isDone ? (
                        <span className="badge ok">{t.statusSubmitted}</span>
                      ) : isDraft ? (
                        <span className="badge warn">{t.statusDraft}</span>
                      ) : (
                        <span className="badge gray">{t.statusNotStarted}</span>
                      )}{' '}
                      {t.answered} {answered} {t.of} {required}
                    </div>
                  </div>
                  <Link className="btn primary" href={`/evaluate/${c.id}`}>
                    {t.open} →
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
