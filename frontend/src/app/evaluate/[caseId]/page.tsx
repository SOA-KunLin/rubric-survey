'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { EvalCase, Rating, RubricDimension, rubric } from '@/lib/types';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function localKey(caseId: string) {
  return `rs-local-${caseId}`;
}

export default function ScoringPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;
  const { t, lang, setLang } = useLang();
  const router = useRouter();

  const [caseData, setCaseData] = useState<EvalCase | null>(null);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'submitted' | 'not-started'>('not-started');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<{ scores: any; notes: string; ts: number } | null>(null);
  const [submitErr, setSubmitErr] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');

  const token = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('rs-rater') || 'null')?.token : null;
  const firstLoad = useRef(true);
  const dirtyRef = useRef(false);
  const payloadRef = useRef({ scores, notes });
  payloadRef.current = { scores, notes };

  const dims: RubricDimension[] = useMemo(() => {
    if (!caseData) return [];
    return rubric.dimensions.filter(
      (d) => !d.requires || (d.requires === 'responseB' && !!caseData.responseB),
    );
  }, [caseData]);

  const missing = useMemo(
    () => dims.filter((d) => !scores[d.key] || scores[d.key]! < 1),
    [dims, scores],
  );

  // ---------- load ----------
  useEffect(() => {
    if (!token) {
      router.replace('/');
      return;
    }
    Promise.all([
      api.get<{ cases: EvalCase[] }>(`/survey/cases?token=${token}`),
      api.get<{ rating: Rating | null }>(`/survey/rating/${caseId}?token=${token}`),
    ])
      .then(([{ cases }, ratingRes]) => {
        const c = cases.find((x) => x.id === caseId);
        if (!c) {
          setErr(t.noCase);
          return;
        }
        setCaseData(c);
        setSiblings(cases.map((x) => x.id));
        const r = ratingRes.rating;
        if (r) {
          setScores(r.scores || {});
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
    (s: Record<string, number | null>, n: string) => {
      dirtyRef.current = true;
      setSaveState('dirty');
      localStorage.setItem(localKey(caseId), JSON.stringify({ scores: s, notes: n, ts: Date.now() }));
    },
    [caseId],
  );

  // debounce autosave on changes
  useEffect(() => {
    if (firstLoad.current || status === 'submitted') return;
    if (!dirtyRef.current) return;
    const h = setTimeout(save, 800);
    return () => clearTimeout(h);
  }, [scores, notes, save, status]);

  // periodic safety save
  useEffect(() => {
    const iv = setInterval(() => {
      if (dirtyRef.current && status !== 'submitted') save();
    }, 30000);
    return () => clearInterval(iv);
  }, [save, status]);

  useEffect(() => {
    firstLoad.current = false;
  }, [caseData]);

  // save on unload
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
  const pick = (key: string, score: number) => {
    if (status === 'submitted') return;
    setScores((prev) => {
      const next = { ...prev, [key]: score };
      markDirty(next, notes);
      return next;
    });
  };

  const clearDim = (key: string) => {
    if (status === 'submitted') return;
    setScores((prev) => {
      const next = { ...prev, [key]: null };
      markDirty(next, notes);
      return next;
    });
  };

  const onNotes = (v: string) => {
    if (status === 'submitted') return;
    setNotes(v);
    markDirty(scores, v);
  };

  const restoreLocal = () => {
    if (!localDraft) return;
    setScores(localDraft.scores || {});
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
        { scores, notes },
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

  const idx = siblings.indexOf(caseId);
  const prevId = idx > 0 ? siblings[idx - 1] : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

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

  const title = lang === 'zh' && caseData.titleZh ? caseData.titleZh : caseData.title;
  const scenario = lang === 'zh' && caseData.scenarioZh ? caseData.scenarioZh : caseData.scenario;

  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          <Link href="/evaluate">← {t.backToList}</Link>
          <small>
            {t.caseBadge} {idx + 1}: {title}
          </small>
        </div>
        <button className="btn" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}>
          {t.langToggle}
        </button>
      </header>

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

      {/* ---------- case content ---------- */}
      <div className="card">
        {scenario && (
          <>
            <h2 className="section">{t.scenario}</h2>
            <p className="casedesc muted" style={{ marginTop: 0 }}>
              {scenario}
            </p>
          </>
        )}

        {caseData.conversation && caseData.conversation.length > 0 && (
          <>
            <h2 className="section">{t.conversation}</h2>
            {caseData.conversation.map((turn, i) => (
              <div key={i} className={`bubble ${turn.role}`}>
                <b>{turn.role === 'patient' ? 'Patient / 病人' : 'Assistant / 助手'}</b>
                <div>{turn.content}</div>
              </div>
            ))}
          </>
        )}

        <h2 className="section">{t.patientQuery}</h2>
        <div className="bubble patient">
          <div>{caseData.patientQuery}</div>
        </div>

        <h2 className="section">
          {t.responseA} <span className="badge blue">A</span>
        </h2>
        <div className="resp a">{caseData.responseA}</div>

        {caseData.responseB && (
          <>
            <h2 className="section">
              {t.responseB} <span className="badge blue">B</span>
            </h2>
            <div className="resp b">{caseData.responseB}</div>
          </>
        )}

        {caseData.sourceText && (
          <>
            <h2 className="section row spread" style={{ cursor: 'pointer' }} onClick={() => setShowSource(!showSource)}>
              {t.sourceTitle}
              <button className="btn">{showSource ? t.hideSource : t.showSource}</button>
            </h2>
            {showSource && (
              <div className="resp">
                <div className="muted" style={{ marginBottom: 6 }}>
                  {caseData.sourceTitle}
                </div>
                {caseData.sourceText}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- dimensions ---------- */}
      <div className="card">
        <h2 className="section">{t.dimensions}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {t.rubricInstruction}
        </p>

        {dims.map((d) => {
          const chosen = scores[d.key];
          const isCollapsed = collapsed[d.key];
          const chosenLevel = d.levels.find((l) => l.score === chosen);
          return (
            <div key={d.key} className="dim">
              <div
                className="dim-head"
                onClick={() => setCollapsed((c) => ({ ...c, [d.key]: !c[d.key] }))}
              >
                <span className="num">{d.order}</span>
                <span className="name">{lang === 'zh' ? d.names.zh : d.names.en}</span>
                <span className="ref">{lang === 'zh' && d.refZh ? d.refZh : d.ref}</span>
                <span className="chosen">
                  {chosen ? (
                    <>
                      <b>{chosen}</b> · {lang === 'zh' ? chosenLevel!.short.zh : chosenLevel!.short.en}
                    </>
                  ) : (
                    '—'
                  )}{' '}
                  {isCollapsed ? '▾' : '▴'}
                </span>
              </div>
              {!isCollapsed && (
                <div className="dim-body">
                  {d.levels.map((l) => {
                    const sel = chosen === l.score;
                    return (
                      <div
                        key={l.score}
                        className={`level ${sel ? 'selected' : ''}`}
                        onClick={() => pick(d.key, l.score)}
                      >
                        <span className="sc">{l.score}</span>
                        <span className="txt">
                          <b>{lang === 'zh' ? l.short.zh : l.short.en}</b>
                          {lang === 'zh' ? l.anchor.zh : l.anchor.en}
                        </span>
                      </div>
                    );
                  })}
                  {chosen && status !== 'submitted' && (
                    <button className="btn" onClick={() => clearDim(d.key)}>
                      {t.clearScore}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <label className="field" style={{ marginTop: 12 }}>
          {t.notes}
          <textarea
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
            disabled={status === 'submitted'}
            maxLength={5000}
          />
        </label>

        {submitErr && <div className="msg err">{submitErr}</div>}

        <div className="row spread" style={{ marginTop: 12 }}>
          <span className="muted">
            {missing.length === 0 ? '' : t.missingBeforeSubmit(missing.length)}
          </span>
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

      {/* ---------- references ---------- */}
      <div className="card">
        <h2 className="section">{t.references}</h2>
        {rubric.references.map((r, i) => (
          <div key={i} className="muted" style={{ fontSize: '0.78rem' }}>
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}
