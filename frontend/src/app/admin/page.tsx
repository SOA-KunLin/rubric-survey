'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, API_BASE } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { applyTheme } from '@/lib/theme';
import { SiteConfig, SurveyConfig } from '@/lib/types';

interface RaterRow {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt?: string;
  submitted: number;
  drafts: number;
  lastActivity?: string | null;
}
interface CaseRow {
  id: string;
  title: { en: string; zh: string };
  order: number;
  active: boolean;
  hasResponseB: boolean;
  requiredQuestions: number;
  submitted: number;
  drafts: number;
}
interface Overview {
  totals: { raters: number; cases: number; activeCases: number; submitted: number; drafts: number; expected: number };
  raters: RaterRow[];
  cases: CaseRow[];
  matrix: Record<string, Record<string, string>>;
}
interface StatBlock {
  n: number;
  mean?: number | null;
  sd?: number | null;
  median?: number | null;
  counts: Record<string, number>;
}
interface Stats {
  perCase: { caseId: string; title: { en: string; zh: string }; ratersSubmitted: number; questions: Record<string, StatBlock>; overall: StatBlock }[];
  perRater: { raterId: string; name: string; submitted: number; drafts: number; meanOverall: number | null }[];
  perQuestion: Record<string, StatBlock>;
}
interface RatingRow {
  id: string;
  raterId: string;
  raterName: string;
  caseId: string;
  scores: Record<string, any>;
  notes: string;
  status: string;
  submittedAt?: string;
  updatedAt: string;
}
interface RaterDetail {
  id: string;
  name: string;
  passcode: string | null;
  note: string;
  createdAt: string;
  lastActivity?: string | null;
  submitted: number;
  drafts: number;
}

export default function AdminPage() {
  const { t, lang, setLang } = useLang();
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [tab, setTab] = useState<'overview' | 'raters' | 'stats' | 'submissions' | 'cases'>('overview');
  const [ov, setOv] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statCase, setStatCase] = useState('');
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [fStatus, setFStatus] = useState('');
  const [fRater, setFRater] = useState('');
  const [fCase, setFCase] = useState('');
  const [cfgRaw, setCfgRaw] = useState('');
  const [cfgMsg, setCfgMsg] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [authSettings, setAuthSettings] = useState<{ mode: 'open' | 'accounts'; accessCode: string } | null>(null);
  const [authMsg, setAuthMsg] = useState('');
  const [raterRows, setRaterRows] = useState<RaterDetail[] | null>(null);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');

  const authHeaders: Record<string, string> = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['x-admin-token'] = token;
    return h;
  }, [token]);

  useEffect(() => {
    const saved = localStorage.getItem('rs-admin');
    if (saved) setToken(saved);
    api
      .get<{ site: SiteConfig }>('/survey/site')
      .then((d) => {
        setSite(d.site);
        applyTheme(d.site);
        if (!localStorage.getItem('rs-lang') && d.site.defaultLang) setLang(d.site.defaultLang);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/overview`, { headers: authHeaders });
    if (res.status === 401) {
      localStorage.removeItem('rs-admin');
      setToken(null);
      return;
    }
    setOv(await res.json());
  }, [authHeaders]);

  const loadStats = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/stats`, { headers: authHeaders });
    if (res.ok) setStats(await res.json());
  }, [authHeaders]);

  const loadConfigRaw = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/config`, { headers: authHeaders });
    if (res.ok) {
      const d: { raw: any; resolved: SurveyConfig } = await res.json();
      setCfgRaw(JSON.stringify(d.raw, null, 2));
    }
  }, [authHeaders]);

  const loadAuthSettings = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/auth-settings`, { headers: authHeaders });
    if (res.ok) setAuthSettings(await res.json());
  }, [authHeaders]);

  const loadRaters = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/raters`, { headers: authHeaders });
    if (res.ok) setRaterRows(await res.json());
  }, [authHeaders]);

  const loadRatings = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fStatus) qs.set('status', fStatus);
    if (fRater) qs.set('raterId', fRater);
    if (fCase) qs.set('caseId', fCase);
    const res = await fetch(`${API_BASE}/admin/ratings?${qs}`, { headers: authHeaders });
    if (res.ok) setRatings(await res.json());
  }, [authHeaders, fStatus, fRater, fCase]);

  useEffect(() => {
    if (!token) return;
    loadOverview();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || tab !== 'submissions') return;
    loadRatings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, fStatus, fRater, fCase]);

  useEffect(() => {
    if (!token || tab !== 'cases') return;
    loadConfigRaw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  useEffect(() => {
    if (!token || tab !== 'raters') return;
    loadAuthSettings();
    loadRaters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const iv = setInterval(() => {
      loadOverview();
      if (tab === 'submissions') loadRatings();
    }, 15000);
    return () => clearInterval(iv);
  }, [token, autoRefresh, tab, loadOverview, loadRatings]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr('');
    try {
      const res = await api.post<{ token: string }>('/admin/login', { password: pw });
      localStorage.setItem('rs-admin', res.token);
      setToken(res.token);
    } catch (e: any) {
      setLoginErr(e?.status === 401 ? t.wrongCreds : `${t.loginFailed}: ${e?.message || 'network error'}`);
    }
  };

  const questionKeys = useMemo(() => {
    const out: string[] = [];
    for (const pc of stats?.perCase || []) {
      for (const k of Object.keys(pc.questions)) {
        if (!out.includes(k)) out.push(k);
      }
    }
    return out;
  }, [stats]);

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
  const fnum = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(2);
  const caseTitle = (c: { title: { en: string; zh: string } }) =>
    lang === 'zh' ? c.title.zh || c.title.en : c.title.en || c.title.zh;

  const qName = (key: string): string => {
    // resolve display name from resolved config passed in overview? use stats keys directly
    return key;
  };

  const distBar = (counts: Record<string, number>) => {
    const entries = Object.entries(counts);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    if (!total) return <span className="muted">—</span>;
    const numeric = entries.every(([k]) => Number(k) >= 1 && Number(k) <= 5);
    if (numeric) {
      return (
        <div className="distbar">
          {[1, 2, 3, 4, 5].map((s) => {
            const v = counts[String(s)] || 0;
            return <span key={s} className={`d${s}`} style={{ width: `${(v / total) * 100}%` }} title={`${s}: ${v}`} />;
          })}
        </div>
      );
    }
    return (
      <span className="row" style={{ gap: 6 }}>
        {entries.map(([k, v]) => (
          <span key={k} className="badge blue">
            {k}: {v}
          </span>
        ))}
      </span>
    );
  };

  const applyConfig = async () => {
    setCfgMsg('');
    try {
      const parsed = JSON.parse(cfgRaw);
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ config: parsed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.errors) {
          setCfgMsg(`${t.configInvalid} ${data.errors.join(' | ')}`);
        } else {
          setCfgMsg(`${t.configInvalid} HTTP ${res.status}${data?.message ? ` (${data.message})` : ''}`);
        }
        return;
      }
      setCfgMsg(t.configApplied);
      loadOverview();
      loadStats();
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        setCfgMsg(`${t.configInvalid} JSON parse error`);
      } else {
        setCfgMsg(`${t.configInvalid} ${e.message}`);
      }
    }
  };

  const downloadConfig = () => {
    const blob = new Blob([cfgRaw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'survey.config.json';
    a.click();
  };

  const toggleCase = async (c: CaseRow) => {
    await fetch(`${API_BASE}/admin/cases/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ active: !c.active }),
    });
    loadOverview();
    loadConfigRaw();
  };

  const deleteCase = async (c: CaseRow) => {
    if (!confirm(t.deleteCaseConfirm(caseTitle(c)))) return;
    await fetch(`${API_BASE}/admin/cases/${c.id}`, { method: 'DELETE', headers: authHeaders });
    loadOverview();
    loadStats();
    loadConfigRaw();
  };

  const doReset = async (scope: 'ratings' | 'all') => {
    const question = scope === 'all' ? t.resetAllConfirm : t.resetRatingsConfirm;
    if (!confirm(question)) return;
    const res = await fetch(`${API_BASE}/admin/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ scope }),
    });
    if (res.ok) {
      setAuthMsg(t.resetDone);
      loadOverview();
      loadStats();
      if (tab === 'submissions') loadRatings();
      alert(t.resetDone);
    }
  };

  const genCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  const saveAuthSettings = async () => {
    if (!authSettings) return;
    setAuthMsg('');
    const res = await fetch(`${API_BASE}/admin/auth-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(authSettings),
    });
    if (res.ok) {
      setAuthMsg(t.saved);
      loadOverview();
    }
  };

  const createRater = async () => {
    setAuthMsg('');
    if (!newName.trim()) return;
    const res = await fetch(`${API_BASE}/admin/raters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ name: newName.trim(), passcode: newCode.trim() || undefined }),
    });
    if (res.ok) {
      setNewName('');
      setNewCode('');
      loadRaters();
    } else {
      const data = await res.json().catch(() => null);
      setAuthMsg(data?.message === 'This name already exists' ? t.nameExists : `${t.addRaterFail}${data?.message || res.status}`);
    }
  };

  const regenerateRater = async (r: RaterDetail) => {
    await fetch(`${API_BASE}/admin/raters/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ passcode: '' }),
    });
    loadRaters();
  };

  const deleteRater = async (r: RaterDetail) => {
    if (!confirm(t.deleteCaseConfirm(r.name))) return;
    await fetch(`${API_BASE}/admin/raters/${r.id}`, { method: 'DELETE', headers: authHeaders });
    loadRaters();
    loadOverview();
  };

  const exportCsv = async () => {
    const res = await fetch(`${API_BASE}/admin/export`, { headers: authHeaders });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ratings-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (!token) {
    return (
      <div className="container" style={{ maxWidth: 520 }}>
        <header className="topbar">
          <div className="brand">{site ? (lang === 'zh' ? site.title.zh : site.title.en) : t.adminConsole}</div>
          {(!site || site.allowLangToggle) && (
            <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
              {t.langToggle}
            </button>
          )}
        </header>
        <div className="card">
          <h2 className="section">{t.adminLogin}</h2>
          <form onSubmit={login}>
            <label className="field">
              {t.password}
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </label>
            {loginErr && <div className="msg err">{loginErr}</div>}
            <button className="btn primary">{t.login}</button>
          </form>
          <p className="muted">
            <Link href="/">← {t.appName}</Link>
          </p>
        </div>
      </div>
    );
  }

  const selectedStat = stats?.perCase.find((c) => c.caseId === statCase);

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          {t.adminConsole}
          <small>{site ? (lang === 'zh' ? site.title.zh : site.title.en) : ''} · {t.autoRefresh}</small>
        </div>
        <div className="row">
          <label className="muted" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            {t.autoRefresh}
          </label>
          <button className="btn" onClick={exportCsv}>
            {t.exportCsv}
          </button>
          <button className="btn" onClick={() => { localStorage.removeItem('rs-admin'); setToken(null); }}>
            {t.logout}
          </button>
          {(!site || site.allowLangToggle) && (
            <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
              {t.langToggle}
            </button>
          )}
        </div>
      </header>

      <div className="tabs">
        {(
          [
            ['overview', t.tabOverview],
            ['raters', t.tabRaters],
            ['stats', t.tabStats],
            ['submissions', t.tabSubmissions],
            ['cases', t.tabCases],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && ov && (
        <>
          <div className="statgrid">
            <div className="statcard">
              <div className="v">{ov.totals.raters}</div>
              <div className="k">{t.statRaters}</div>
            </div>
            <div className="statcard">
              <div className="v">
                {ov.totals.activeCases}/{ov.totals.cases}
              </div>
              <div className="k">{t.statCases}</div>
            </div>
            <div className="statcard">
              <div className="v">{ov.totals.submitted}</div>
              <div className="k">{t.statSubmitted}</div>
            </div>
            <div className="statcard">
              <div className="v">{ov.totals.drafts}</div>
              <div className="k">{t.statDrafts}</div>
            </div>
            <div className="statcard">
              <div className="v">
                {ov.totals.expected ? Math.round((ov.totals.submitted / ov.totals.expected) * 100) : 0}%
              </div>
              <div className="k">{t.completionRate}</div>
            </div>
          </div>

          <div className="card">
            <h2 className="section">{t.progress} matrix</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t.rater}</th>
                    {ov.cases.map((c, i) => (
                      <th key={c.id} style={c.active ? undefined : { opacity: 0.45 }}>
                        {t.case} {i + 1}
                        {c.active ? '' : ' *'}
                      </th>
                    ))}
                    <th>{t.statSubmitted}</th>
                    <th>{t.lastActivity}</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.raters.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.name}</b>
                      </td>
                      {ov.cases.map((c) => {
                        const st = ov.matrix[r.id]?.[c.id];
                        return (
                          <td key={c.id} className={st === 'submitted' ? 'cell-ok' : st === 'draft' ? 'cell-warn' : 'cell-no'}>
                            {st === 'submitted' ? '✓' : st === 'draft' ? '✎' : '—'}
                          </td>
                        );
                      })}
                      <td>
                        {r.submitted} / {ov.totals.activeCases}
                      </td>
                      <td>{fmt(r.lastActivity)}</td>
                    </tr>
                  ))}
                  {ov.raters.length === 0 && (
                    <tr>
                      <td colSpan={ov.cases.length + 3} className="muted">
                        —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {tab === 'raters' && (
        <>
          <div className="card">
            <h2 className="section">{t.authMode}</h2>
            <div className="row" style={{ gap: 18, marginBottom: 8 }}>
              <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={authSettings?.mode === 'open'}
                  onChange={() => setAuthSettings((s) => (s ? { ...s, mode: 'open' } : s))}
                />
                {t.authOpen}
              </label>
              <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={authSettings?.mode === 'accounts'}
                  onChange={() => setAuthSettings((s) => (s ? { ...s, mode: 'accounts' } : s))}
                />
                {t.authAccounts}
              </label>
            </div>
            {authSettings?.mode === 'open' && (
              <label className="field" style={{ maxWidth: 340 }}>
                {t.sharedCode}
                <input
                  value={authSettings.accessCode}
                  onChange={(e) => setAuthSettings((s) => (s ? { ...s, accessCode: e.target.value } : s))}
                />
              </label>
            )}
            {authSettings?.mode === 'accounts' && <p className="muted">{t.ratersNote}</p>}
            <button className="btn primary" onClick={saveAuthSettings} disabled={!authSettings}>
              {t.save}
            </button>
            {authMsg && <div className="msg ok">{authMsg}</div>}
          </div>

          <div className="card">
            <h2 className="section">{t.addRater}</h2>
            <div className="row">
              <input
                placeholder={t.raterName}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <input
                placeholder={t.passcode}
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                style={{ maxWidth: 160 }}
              />
              <button className="btn" onClick={() => setNewCode(genCode())}>
                {t.autoGenerate}
              </button>
              <button className="btn primary" onClick={createRater} disabled={!newName.trim()}>
                {t.addRater}
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t.rater}</th>
                    <th>{t.passcode}</th>
                    <th>{t.statSubmitted}</th>
                    <th>{t.statDrafts}</th>
                    <th>{t.lastActivity}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(raterRows || []).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.name}</b>
                      </td>
                      <td>
                        <code>{r.passcode || '—'}</code>
                      </td>
                      <td>{r.submitted}</td>
                      <td>{r.drafts}</td>
                      <td>{fmt(r.lastActivity)}</td>
                      <td className="row">
                        <button className="btn" onClick={() => regenerateRater(r)}>
                          {t.regenerate}
                        </button>
                        <button className="btn danger" onClick={() => deleteRater(r)}>
                          {t.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(raterRows || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">
                        —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="section">{t.dangerZone}</h2>
            <p className="muted">{t.resetHint}</p>
            <div className="row">
              <button className="btn danger" onClick={() => doReset('ratings')}>
                {t.resetRatings}
              </button>
              <button className="btn danger" onClick={() => doReset('all')}>
                {t.resetAll}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'stats' && stats && (
        <>
          <div className="card">
            <div className="row">
              <b>{t.selectCase}</b>
              <select value={statCase} onChange={(e) => setStatCase(e.target.value)} style={{ maxWidth: 380 }}>
                <option value="">— {t.all} —</option>
                {stats.perCase.map((c, i) => (
                  <option key={c.caseId} value={c.caseId}>
                    {t.case} {i + 1}: {caseTitle(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {statCase && selectedStat && (
            <div className="card">
              <h2 className="section">
                {t.case}: {caseTitle(selectedStat)} ({t.submittedBy}: {selectedStat.ratersSubmitted})
              </h2>
              <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t.dimension}</th>
                    <th>{t.n}</th>
                    <th>{t.mean}</th>
                    <th>{t.sd}</th>
                    <th>{t.median}</th>
                    <th>{t.dist}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedStat.questions).map(([key, s]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{s.n}</td>
                      <td>{s.mean !== undefined ? fnum(s.mean) : '—'}</td>
                      <td>{s.sd !== undefined ? fnum(s.sd) : '—'}</td>
                      <td>{s.median !== undefined ? fnum(s.median) : '—'}</td>
                      <td>{distBar(s.counts)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td>{t.overall}</td>
                    <td>{selectedStat.overall.n}</td>
                    <td>{fnum(selectedStat.overall.mean ?? null)}</td>
                    <td>{fnum(selectedStat.overall.sd ?? null)}</td>
                    <td>{fnum(selectedStat.overall.median ?? null)}</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="section">{t.perDimensionOverall}</h2>
            <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t.dimension}</th>
                  <th>{t.n}</th>
                  <th>{t.mean}</th>
                  <th>{t.sd}</th>
                  <th>{t.median}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.perQuestion).map(([key, s]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{s.n}</td>
                    <td>{fnum(s.mean ?? null)}</td>
                    <td>{fnum(s.sd ?? null)}</td>
                    <td>{fnum(s.median ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="card">
            <h2 className="section">{t.rater}</h2>
            <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t.rater}</th>
                  <th>{t.statSubmitted}</th>
                  <th>{t.statDrafts}</th>
                  <th>{t.mean}</th>
                </tr>
              </thead>
              <tbody>
                {stats.perRater.map((r) => (
                  <tr key={r.raterId}>
                    <td>{r.name}</td>
                    <td>{r.submitted}</td>
                    <td>{r.drafts}</td>
                    <td>{fnum(r.meanOverall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {tab === 'submissions' && (
        <>
          <div className="card">
            <div className="row">
              <label className="field" style={{ marginBottom: 0, width: 160 }}>
                {t.statusFilter}
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="">{t.all}</option>
                  <option value="submitted">{t.statusSubmitted}</option>
                  <option value="draft">{t.statusDraft}</option>
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0, width: 200 }}>
                {t.raterFilter}
                <select value={fRater} onChange={(e) => setFRater(e.target.value)}>
                  <option value="">{t.all}</option>
                  {(ov?.raters || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0, width: 200 }}>
                {t.caseFilter}
                <select value={fCase} onChange={(e) => setFCase(e.target.value)}>
                  <option value="">{t.all}</option>
                  {(ov?.cases || []).map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {t.case} {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card">
            {ratings && ratings.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t.rater}</th>
                      <th>{t.case}</th>
                      <th>{t.statusFilter}</th>
                      {questionKeys.map((k) => (
                        <th key={k} title={k}>
                          {k.length > 8 ? k.slice(0, 8) + '…' : k}
                        </th>
                      ))}
                      <th>{t.updatedAt}</th>
                      <th>{t.viewNotes}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratings.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>{r.raterName}</b>
                        </td>
                        <td>{(ov?.cases || []).findIndex((c) => c.id === r.caseId) + 1}</td>
                        <td>
                          {r.status === 'submitted' ? (
                            <span className="badge ok">{t.statusSubmitted}</span>
                          ) : (
                            <span className="badge warn">{t.statusDraft}</span>
                          )}
                        </td>
                        {questionKeys.map((k) => (
                          <td key={k}>{r.scores?.[k] ?? '—'}</td>
                        ))}
                        <td>{fmt(r.updatedAt)}</td>
                        <td style={{ maxWidth: 260 }}>{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">{t.noSubmissions}</div>
            )}
          </div>
        </>
      )}

      {tab === 'cases' && ov && (
        <>
          <div className="card">
            <h2 className="section">{t.tabCases}</h2>
            <p className="muted">{t.configHint}</p>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn primary" onClick={applyConfig}>
                {t.applyConfig}
              </button>
              <button className="btn" onClick={loadConfigRaw}>
                {t.reloadConfig}
              </button>
              <button className="btn" onClick={downloadConfig}>
                {t.downloadConfig}
              </button>
            </div>
            {cfgMsg && <div className={`msg ${cfgMsg.startsWith(t.configInvalid) ? 'err' : 'ok'}`}>{cfgMsg}</div>}
            <textarea
              value={cfgRaw}
              onChange={(e) => setCfgRaw(e.target.value)}
              style={{ minHeight: 320, fontFamily: 'monospace', fontSize: '0.78rem' }}
              spellCheck={false}
            />
          </div>

          <div className="card">
            <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ID</th>
                  <th>{t.case}</th>
                  <th>Response B</th>
                  <th>{t.statusFilter}</th>
                  <th>{t.statSubmitted}</th>
                  <th>{t.statDrafts}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ov.cases.map((c, i) => (
                  <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                    <td>{c.order}</td>
                    <td>{c.id}</td>
                    <td>{caseTitle(c)}</td>
                    <td>{c.hasResponseB ? '✓' : '—'}</td>
                    <td>{c.active ? t.active : t.inactive}</td>
                    <td>{c.submitted}</td>
                    <td>{c.drafts}</td>
                    <td className="row">
                      <button className="btn" onClick={() => toggleCase(c)}>
                        {t.toggleActive}
                      </button>
                      <button className="btn danger" onClick={() => deleteCase(c)}>
                        {t.delete}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="muted">* {t.casesTableNote}</p>
          </div>
        </>
      )}
    </div>
  );
}
