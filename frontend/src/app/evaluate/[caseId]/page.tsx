'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { applyTheme } from '@/lib/theme';
import {
  ContentBlock,
  QuestionOption,
  ResolvedCase,
  ResolvedQuestion,
  SiteConfig,
} from '@/lib/types';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function localKey(caseId: string) {
  return `rs-local-${caseId}`;
}

function optionMain(o: QuestionOption, lang: 'en' | 'zh'): string {
  const b = o.short || o.label;
  if (!b) return String(o.value);
  return lang === 'zh' ? b.zh || b.en : b.en || b.zh;
}

function optionSecondary(o: QuestionOption, lang: 'en' | 'zh'): string {
  const b = o.anchor;
  if (!b) return '';
  return lang === 'zh' ? b.zh || b.en : b.en || b.zh;
}

function qName(q: ResolvedQuestion, lang: 'en' | 'zh'): string {
  return lang === 'zh' ? q.names.zh || q.names.en : q.names.en || q.names.zh;
}

function isAnswered(q: ResolvedQuestion, v: any): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (q.type === 'text' && String(v).trim() === '') return false;
  return true;
}

export default function ScoringPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;
  const { t, lang, setLang } = useLang();
  const router = useRouter();

  const [site, setSite] = useState<SiteConfig | null>(null);
  const [caseData, setCaseData] = useState<ResolvedCase | null>(null);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'submitted' | 'not-started'>('not-started');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<{ scores: any; notes: string; ts: number } | null>(null);
  const [submitErr, setSubmitErr] = useState('');
  const [openSource, setOpenSource] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');

  const token = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('rs-rater') || 'null')?.token : null;
  const firstLoad = useRef(true);
  const dirtyRef = useRef(false);
  const payloadRef = useRef({ scores: answers, notes });
  payloadRef.current = { scores: answers, notes };

  const questions: ResolvedQuestion[] = useMemo(() => caseData?.questions || [], [caseData]);
  const missing = useMemo(
    () => questions.filter((q) => q.required && !isAnswered(q, answers[q.key])),
    [questions, answers],
  );

  // ---------- load ----------
  useEffect(() => {
    if (!token) {
      router.replace('/');
      return;
    }
    Promise.all([
      api.get<{ site: SiteConfig; cases: ResolvedCase[] }>(`/survey/cases?token=${token}`),
      api.get<{ rating: any | null }>(`/survey/rating/${caseId}?token=${token}`),
    ])
      .then(([{ site, cases }, ratingRes]) => {
        const c = cases.find((x) => x.id === caseId);
        if (!c) {
          setErr(t.noCase);
          return;
        }
        setSite(site);
        applyTheme(site);
        if (!localStorage.getItem('rs-lang') && site.defaultLang) setLang(site.defaultLang);
        setCaseData(c);
        setSiblings(cases.map((x) => x.id));
        const r = ratingRes.rating;
        if (r) {
          setAnswers(r.scores || {});
          setNotes(r.notes || '');
          setStatus(r.status);
          setLastSavedAt(r.updatedAt || null);
        } else {
          setStatus('not-started');
        }
        try {
          const local = JSON.parse(localStorage.getItem(localKey(caseId)) || 'null');
          if (local && typeof local.ts === 'number') {
            const serverTs = r?.updatedAt ? Date.parse(r.updatedAt) : 0;
            const differs =
              JSON.stringify(local.scores || {}) !== JSON.stringify(r?.scores || {}) ||
              (local.notes || '') !== (r?.notes || '');
            if (differs && local.ts > serverTs) setLocalDraft(local);
          }
        } catch {}
      })
      .catch(() => setErr(t.errorLoad));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // ---------- autosave ----------
  const save = useCallback(async () => {
    if (status === 'submitted') return;
    setSaveState('saving');
    try {
      const res = await api.put<{ updatedAt: string }>(
        `/survey/rating/${caseId}/draft?token=${token}`,
        { scores: payloadRef.current.scores, notes: payloadRef.current.notes },
      );
      setSaveState('saved');
      setLastSavedAt(res.updatedAt);
      setStatus((s) => (s === 'not-started' ? 'draft' : s));
      dirtyRef.current = false;
      localStorage.setItem(
        localKey(caseId),
        JSON.stringify({ ...payloadRef.current, ts: 0, synced: Date.now() }),
      );
      setLocalDraft(null);
    } catch {
      setSaveState('error');
      setTimeout(() => {
        if (dirtyRef.current) save();
      }, 4000);
    }
  }, [caseId, token, status]);

  const markDirty = useCallback(
    (a: Record<string, any>, n: string) => {
      dirtyRef.current = true;
      setSaveState('dirty');
      localStorage.setItem(localKey(caseId), JSON.stringify({ scores: a, notes: n, ts: Date.now() }));
    },
    [caseId],
  );

  useEffect(() => {
    if (firstLoad.current || status === 'submitted') return;
    if (!dirtyRef.current) return;
    const h = setTimeout(save, 800);
    return () => clearTimeout(h);
  }, [answers, notes, save, status]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (dirtyRef.current && status !== 'submitted') save();
    }, 30000);
    return () => clearInterval(iv);
  }, [save, status]);

  useEffect(() => {
    firstLoad.current = false;
  }, [caseData]);

  useEffect(() => {
    const handler = () => {
      if (dirtyRef.current && status !== 'submitted') {
        try {
          fetch(`${API_BASE}/survey/rating/${caseId}/draft?token=${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadRef.current),
            keepalive: true,
          });
        } catch {}
      }
    };
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, [caseId, token, status]);

  // ---------- actions ----------
  const setAnswer = (key: string, value: any) => {
    if (status === 'submitted') return;
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      markDirty(next, notes);
      return next;
    });
  };

  const clearAnswer = (key: string) => setAnswer(key, null);

  const onNotes = (v: string) => {
    if (status === 'submitted') return;
    setNotes(v);
    markDirty(answers, v);
  };

  const restoreLocal = () => {
    if (!localDraft) return;
    setAnswers(localDraft.scores || {});
    setNotes(localDraft.notes || '');
    markDirty(localDraft.scores || {}, localDraft.notes || '');
    setLocalDraft(null);
  };

  const discardLocal = () => {
    localStorage.removeItem(localKey(caseId));
    setLocalDraft(null);
  };

  const doSubmit = async () => {
    if (missing.length > 0) {
      setSubmitErr(t.missingBeforeSubmit(missing.length));
      return;
    }
    setSubmitErr('');
    if (!confirm(t.confirmSubmit)) return;
    try {
      const res = await api.post<{ submittedAt: string }>(
        `/survey/rating/${caseId}/submit?token=${token}`,
        { scores: answers, notes },
      );
      setStatus('submitted');
      setLastSavedAt(res.submittedAt);
      setSaveState('idle');
      dirtyRef.current = false;
      localStorage.removeItem(localKey(caseId));
    } catch (e: any) {
      setSubmitErr(t.submitFailed + e.message);
    }
  };

  const doRetract = async () => {
    try {
      await api.post(`/survey/rating/${caseId}/retract?token=${token}`);
      setStatus('draft');
    } catch (e: any) {
      setSubmitErr(t.submitFailed + e.message);
    }
  };

  const saveDot =
    saveState === 'saving' ? 'saving' : saveState === 'error' ? 'err' : saveState === 'dirty' ? '' : 'saved';
  const saveText =
    saveState === 'saving'
      ? t.saveStateSaving
      : saveState === 'error'
        ? t.saveStateError
        : saveState === 'dirty'
          ? t.saveStateDirty
          : t.saveStateIdle;

  if (err) {
    return (
      <div className="container">
        <div className="msg err">{err}</div>
        <Link className="btn" href="/evaluate">
          ← {t.backToList}
        </Link>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="container">
        <div className="card muted">{t.loading}</div>
      </div>
    );
  }

  const idx = siblings.indexOf(caseId);
  const prevId = idx > 0 ? siblings[idx - 1] : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const title = lang === 'zh' ? caseData.title.zh || caseData.title.en : caseData.title.en || caseData.title.zh;

  const renderBlock = (b: ContentBlock, i: number) => {
    const text = caseData.data[b.key];
    if (!text) return null;
    const label = lang === 'zh' ? b.label.zh || b.label.en : b.label.en || b.label.zh;
    if (b.style === 'source') {
      const open = openSource[b.key];
      return (
        <React.Fragment key={i}>
          <h2 className="section row spread" style={{ cursor: 'pointer' }} onClick={() => setOpenSource((o) => ({ ...o, [b.key]: !o[b.key] }))}>
            {label}
            <button className="btn">{open ? t.hideSource : t.showSource}</button>
          </h2>
          {open && (
            <div className="resp">
              {text}
            </div>
          )}
        </React.Fragment>
      );
    }
    if (b.style === 'paragraph') {
      return (
        <React.Fragment key={i}>
          <h2 className="section">{label}</h2>
          <p className="casedesc muted" style={{ marginTop: 0 }}>{text}</p>
        </React.Fragment>
      );
    }
    const cls = b.style === 'bubble-assistant' ? 'bubble assistant' : b.style === 'response' ? 'resp a' : 'bubble patient';
    return (
      <React.Fragment key={i}>
        <h2 className="section">{label}</h2>
        <div className={cls}>{text}</div>
      </React.Fragment>
    );
  };

  const renderQuestion = (q: ResolvedQuestion) => {
    const chosen = answers[q.key];
    const chosenOpt = (q.options || []).find((o) => o.value === chosen);
    const chosenNo = (q.options || []).findIndex((o) => o.value === chosen) + 1;
    const isCollapsed = collapsed[q.key];
    const name = qName(q, lang);
    const ref = lang === 'zh' && q.refZh ? q.refZh : q.ref;
    return (
      <div key={q.key} className="dim">
        <div className="dim-head" onClick={() => setCollapsed((c) => ({ ...c, [q.key]: !c[q.key] }))}>
          <span className="name">{name}</span>
          {ref && <span className="ref">{ref}</span>}
          <span className="chosen">
            {isAnswered(q, chosen) ? (
              <>
                <b>
                  {q.type === 'checkboxes' && Array.isArray(chosen)
                    ? `${chosen.length} ✓`
                    : q.type === 'number' || q.type === 'anchor'
                      ? String(chosen)
                      : chosenNo > 0
                        ? String(chosenNo)
                        : String(chosen)}
                </b>
                {chosenOpt && q.type !== 'checkboxes' ? ` · ${optionMain(chosenOpt, lang)}` : q.type === 'text' ? ' ✓' : ''}
              </>
            ) : (
              '—'
            )}{' '}
            {isCollapsed ? '▾' : '▴'}
          </span>
        </div>
        {!isCollapsed && (
          <div className="dim-body">
            {(q.type === 'anchor' || q.type === 'singleChoice' || q.type === 'checkboxes') &&
              (q.options || []).map((o, oi) => {
                const multi = q.type === 'checkboxes';
                const arr = multi && Array.isArray(chosen) ? chosen : [];
                const sel = multi ? arr.includes(o.value) : chosen === o.value;
                const secondary = optionSecondary(o, lang);
                return (
                  <div
                    key={String(o.value)}
                    className={`level ${sel ? 'selected' : ''}`}
                    onClick={() =>
                      multi
                        ? setAnswer(q.key, sel ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                        : setAnswer(q.key, o.value)
                    }
                  >
                    <span className="sc">{oi + 1}</span>
                    <span className="txt">
                      <b>{optionMain(o, lang)}</b>
                      {secondary}
                    </span>
                  </div>
                );
              })}
            {q.type === 'dropdown' && (
              <select
                value={chosen === null || chosen === undefined ? '' : String(chosen)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setAnswer(q.key, null);
                    return;
                  }
                  const found = (q.options || []).find((o) => String(o.value) === raw);
                  setAnswer(q.key, found ? found.value : raw);
                }}
                disabled={status === 'submitted'}
                style={{ maxWidth: 340 }}
              >
                <option value="">{t.selectPlaceholder}</option>
                {(q.options || []).map((o, oi) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {oi + 1}. {optionMain(o, lang)}
                  </option>
                ))}
              </select>
            )}
            {q.type === 'yesno' && (
              <div className="row">
                {[
                  { v: 'yes', label: t.yes },
                  { v: 'no', label: t.no },
                ].map((o) => (
                  <button
                    key={o.v}
                    className={`btn ${chosen === o.v ? 'primary' : ''}`}
                    onClick={() => setAnswer(q.key, o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {q.type === 'number' && (
              <div className="numfield">
                <input
                  type="number"
                  value={chosen ?? ''}
                  min={q.min}
                  max={q.max}
                  onChange={(e) => setAnswer(q.key, e.target.value === '' ? null : Number(e.target.value))}
                  disabled={status === 'submitted'}
                />
                <span className="unit">
                  {q.min !== undefined || q.max !== undefined ? `${q.min ?? '-'} – ${q.max ?? '∞'}` : '#'}
                </span>
              </div>
            )}
            {q.type === 'text' && (
              <textarea
                value={chosen ?? ''}
                placeholder={q.placeholder ? (lang === 'zh' ? q.placeholder.zh : q.placeholder.en) : ''}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                disabled={status === 'submitted'}
                maxLength={5000}
              />
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <span className="badge gray">{q.required ? t.required : t.optional}</span>
              {isAnswered(q, chosen) && status !== 'submitted' && (
                <button className="btn" onClick={() => clearAnswer(q.key)}>
                  {t.clearScore}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const savebar = (
    <div className="savebar">
      <span className={`dot ${saveDot}`} />
      <b style={{ fontSize: '0.85rem' }}>{saveText}</b>
      {lastSavedAt && (
        <span className="muted">
          {t.lastSaved}: {new Date(lastSavedAt).toLocaleString()}
        </span>
      )}
      <span className="muted right">{t.autosaveNote}</span>
    </div>
  );

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          <Link href="/evaluate">← {t.backToList}</Link>
          <small>
            {t.caseBadge} {idx + 1}: {title}
          </small>
        </div>
        {(!site || site.allowLangToggle) && (
          <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
            {t.langToggle}
          </button>
        )}
      </header>

      {savebar}

      {localDraft && (
        <div className="msg info row spread">
          <span>{t.localDraftFound}</span>
          <span className="row">
            <button className="btn primary" onClick={restoreLocal}>
              {t.restore}
            </button>
            <button className="btn" onClick={discardLocal}>
              {t.discardLocal}
            </button>
          </span>
        </div>
      )}

      {status === 'submitted' && (
        <div className="msg ok row spread">
          <span>{t.submittedLocked}</span>
          <button className="btn" onClick={doRetract}>
            {t.reopenDraft}
          </button>
        </div>
      )}

      {caseData.content.length > 0 && <div className="card">{caseData.content.map(renderBlock)}</div>}

      {(() => {
        const groups = caseData.questionGroups?.length
          ? caseData.questionGroups
          : [{ keys: questions.map((q) => q.key), instruction: site?.instruction, references: site?.references }];
        return groups.map((g, gi) => {
          const qs = g.keys
            .map((k) => questions.find((q) => q.key === k))
            .filter((q): q is ResolvedQuestion => !!q);
          if (qs.length === 0) return null;
          const instr = lang === 'zh' ? g.instruction?.zh || g.instruction?.en : g.instruction?.en || g.instruction?.zh;
          const refs = g.references ?? [];
          return (
            <div className="card" key={gi}>
              <h2 className="section">
                {t.dimensions}
                {groups.length > 1 ? ` (${gi + 1}/${groups.length})` : ''}
              </h2>
              {instr && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {instr}
                </p>
              )}
              {qs.map(renderQuestion)}
              {refs.length > 0 && (
                <>
                  <h2 className="section" style={{ marginTop: 16 }}>{t.references}</h2>
                  {refs.map((r, i) => (
                    <div key={i} className="muted" style={{ fontSize: '0.78rem' }}>
                      {r}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        });
      })()}

      {site?.showNotes && (
        <div className="card">
          <label className="field" style={{ marginBottom: 0 }}>
            {t.notes}
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              placeholder={t.notesPlaceholder}
              disabled={status === 'submitted'}
              maxLength={5000}
            />
          </label>
        </div>
      )}

      <div className="card">
        {submitErr && <div className="msg err">{submitErr}</div>}
        <div className="row spread" style={{ marginTop: 4 }}>
          <span className="muted">{missing.length === 0 ? '' : t.missingBeforeSubmit(missing.length)}</span>
          <span className="row">
            {prevId && (
              <Link className="btn" href={`/evaluate/${prevId}`}>
                ← {t.prev}
              </Link>
            )}
            {status !== 'submitted' ? (
              <button className="btn ok" onClick={doSubmit}>
                {t.submit}
              </button>
            ) : (
              <span className="badge ok" style={{ fontSize: '0.9rem', padding: '8px 16px' }}>
                {t.statusSubmitted}
              </span>
            )}
            {nextId && (
              <Link className="btn" href={`/evaluate/${nextId}`}>
                {t.next} →
              </Link>
            )}
          </span>
        </div>
      </div>

    </div>
  );
}
