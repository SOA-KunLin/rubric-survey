'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, API_BASE } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { rubric } from '@/lib/types';

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
  title: string;
  titleZh: string;
  order: number;
  active: boolean;
  hasResponseB: boolean;
  requiredDimensions: number;
  submitted: number;
  drafts: number;
}
interface Overview {
  totals: { raters: number; cases: number; submitted: number; drafts: number; expected: number };
  raters: RaterRow[];
  cases: CaseRow[];
  matrix: Record<string, Record<string, string>>;
}
interface StatBlock {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  dist?: Record<string, number>;
}
interface Stats {
  perCase: { caseId: string; title: string; titleZh: string; ratersSubmitted: number; dimensions: Record<string, StatBlock & { values: number[] }>; overall: StatBlock }[];
  perRater: { raterId: string; name: string; submitted: number; drafts: number; meanOverall: number | null }[];
  perDimension: Record<string, StatBlock>;
}
interface RatingRow {
  id: string;
  raterId: string;
  raterName: string;
  caseId: string;
  scores: Record<string, number | null>;
  notes: string;
  status: string;
  submittedAt?: string;
  updatedAt: string;
}

const TEMPLATE = {
  id: 'case-04',
  order: 40,
  title: 'Short English title',
  titleZh: '中文標題',
  scenario: 'Optional context for the rater',
  scenarioZh: '選填的情境說明',
  conversation: [{ role: 'patient', content: '...' }],
  patientQuery: 'The question the patient asked the chatbot',
  responseA: 'LLM response A (full text)',
  responseB: 'Optional second LLM response (needed for the consistency dimension)',
  sourceTitle: 'Optional source document title (for source attribution)',
  sourceText: 'Optional source document text',
  active: true,
};

export default function AdminPage() {
  const { t, lang, setLang } = useLang();
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [tab, setTab] = useState<'overview' | 'stats' | 'submissions' | 'cases'>('overview');
  const [ov, setOv] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statCase, setStatCase] = useState('');
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [fStatus, setFStatus] = useState('');
  const [fRater, setFRater] = useState('');
  const [fCase, setFCase] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const authHeaders: Record<string, string> = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['x-admin-token'] = token;
    return h;
  }, [token]);

  useEffect(() => {
    const saved = localStorage.getItem('rs-admin');
    if (saved) setToken(saved);
  }, []);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/overview`, {
      headers: authHeaders,
    });
    if (res.status === 401) {
      localStorage.removeItem('rs-admin');
      setToken(null);
      return;
    }
    setOv(await res.json());
  }, [authHeaders]);

  const loadStats = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: authHeaders,
    });
    if (res.ok) setStats(await res.json());
  }, [authHeaders]);

  const loadRatings = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fStatus) qs.set('status', fStatus);
    if (fRater) qs.set('raterId', fRater);
    if (fCase) qs.set('caseId', fCase);
    const res = await fetch(`${API_BASE}/admin/ratings?${qs}`, {
      headers: authHeaders,
    });
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

  const exportCsv = async () => {
    const res = await fetch(`${API_BASE}/admin/export`, {
      headers: authHeaders,
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ratings-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
  const fnum = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(2));

  if (!token) {
    return (
      <div className="container" style={{ maxWidth: 520 }}>
        <header className="topbar">
          <div className="brand">{t.adminConsole}</div>
          <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
            {t.langToggle}
          </button>
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

  const dimNames = (key: string) => {
    const d = rubric.dimensions.find((x) => x.key === key);
    return d ? (lang === 'zh' ? d.names.zh : d.names.en) : key;
  };

  const distBar = (dist?: Record<string, number>) => {
    if (!dist) return null;
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (!total) return <span className="muted">—</span>;
    return (
      <div className="distbar">
        {[1, 2, 3, 4, 5].map((s) => {
          const v = dist[String(s)] || 0;
          return (
            <span
              key={s}
              className={`d${s}`}
              style={{ width: `${(v / total) * 100}%` }}
              title={`${s}★: ${v}`}
            />
          );
        })}
      </div>
    );
  };

  const importCase = async () => {
    setImportMsg('');
    try {
      const obj = JSON.parse(importJson);
      await api.post('/admin/cases', obj);
      setImportMsg(t.importOk);
      setImportJson('');
      loadOverview();
      loadStats();
    } catch (e: any) {
      setImportMsg(t.importFail + e.message);
    }
  };

  const toggleCase = async (c: CaseRow) => {
    await fetch(`${API_BASE}/admin/cases/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ active: !c.active }),
    });
    loadOverview();
  };

  const deleteCase = async (c: CaseRow) => {
    if (!confirm(t.deleteCaseConfirm(lang === 'zh' && c.titleZh ? c.titleZh : c.title))) return;
    await fetch(`${API_BASE}/admin/cases/${c.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    loadOverview();
    loadStats();
  };

  const downloadTemplate = () => {
    const blob = new Blob([JSON.stringify(TEMPLATE, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'case-template.json';
    a.click();
  };

  const selectedStat = stats?.perCase.find((c) => c.caseId === statCase);

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          {t.adminConsole}
          <small>{t.autoRefresh}</small>
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
          <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
            {t.langToggle}
          </button>
        </div>
      </header>

      <div className="tabs">
        {(
          [
            ['overview', t.tabOverview],
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
              <div className="v">{ov.totals.cases}</div>
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
                      <th key={c.id}>
                        {t.case} {i + 1}
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
                          <td
                            key={c.id}
                            className={st === 'submitted' ? 'cell-ok' : st === 'draft' ? 'cell-warn' : 'cell-no'}
                          >
                            {st === 'submitted' ? '✓' : st === 'draft' ? '✎' : '—'}
                          </td>
                        );
                      })}
                      <td>
                        {r.submitted} / {ov.cases.length}
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

      {tab === 'stats' && stats && (
        <>
          <div className="card">
            <div className="row">
              <b>{t.selectCase}</b>
              <select value={statCase} onChange={(e) => setStatCase(e.target.value)} style={{ maxWidth: 380 }}>
                <option value="">— {t.all} —</option>
                {stats.perCase.map((c, i) => (
                  <option key={c.caseId} value={c.caseId}>
                    {t.case} {i + 1}: {lang === 'zh' && c.titleZh ? c.titleZh : c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {statCase && selectedStat && (
            <div className="card">
              <h2 className="section">
                {t.case}: {lang === 'zh' && selectedStat.titleZh ? selectedStat.titleZh : selectedStat.title} ({t.submittedBy}: {selectedStat.ratersSubmitted})
              </h2>
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
                  {rubric.dimensions
                    .filter((d) => selectedStat.dimensions[d.key])
                    .map((d) => {
                      const s = selectedStat.dimensions[d.key];
                      return (
                        <tr key={d.key}>
                          <td>
                            {d.order}. {lang === 'zh' ? d.names.zh : d.names.en}
                          </td>
                          <td>{s.n}</td>
                          <td>{fnum(s.mean)}</td>
                          <td>{fnum(s.sd)}</td>
                          <td>{fnum(s.median)}</td>
                          <td>{distBar(s.dist)}</td>
                        </tr>
                      );
                    })}
                  <tr style={{ fontWeight: 700 }}>
                    <td>{t.overall}</td>
                    <td>{selectedStat.overall.n}</td>
                    <td>{fnum(selectedStat.overall.mean)}</td>
                    <td>{fnum(selectedStat.overall.sd)}</td>
                    <td>{fnum(selectedStat.overall.median)}</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2 className="section">{t.perDimensionOverall}</h2>
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
                {rubric.dimensions.map((d) => {
                  const s = stats.perDimension[d.key];
                  if (!s) return null;
                  return (
                    <tr key={d.key}>
                      <td>
                        {d.order}. {lang === 'zh' ? d.names.zh : d.names.en}
                      </td>
                      <td>{s.n}</td>
                      <td>{fnum(s.mean)}</td>
                      <td>{fnum(s.sd)}</td>
                      <td>{fnum(s.median)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="section">{t.rater}</h2>
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
                      {rubric.dimensions.map((d) => (
                        <th key={d.key} title={d.names.en}>
                          {d.order}
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
                        {rubric.dimensions.map((d) => (
                          <td key={d.key}>{r.scores?.[d.key] ?? '—'}</td>
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
            <p className="muted">{t.casesTableNote}</p>
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
                  <tr key={c.id}>
                    <td>{c.order}</td>
                    <td>{c.id}</td>
                    <td>{lang === 'zh' && c.titleZh ? c.titleZh : c.title}</td>
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

          <div className="card">
            <h2 className="section row spread">
              {t.importCase}
              <span className="row">
                <button className="btn" onClick={downloadTemplate}>
                  {t.downloadTemplate}
                </button>
              </span>
            </h2>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              style={{ minHeight: 220, fontFamily: 'monospace', fontSize: '0.8rem' }}
              placeholder={JSON.stringify(TEMPLATE, null, 2)}
            />
            {importMsg && <div className="msg info">{importMsg}</div>}
            <button className="btn primary" onClick={importCase} disabled={!importJson.trim()}>
              {t.importBtn}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
