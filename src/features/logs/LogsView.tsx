// Logcat viewer (spec §13, §29, §30): streaming bounded buffer, level/tag filters, save.

import { useEffect, useMemo, useRef, useState } from 'react';
import { LOGCAT_LEVELS, LOGCAT_TAGS } from '../../config/app';
import { getBridge, asAppError } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp, perfTweaks } from '../../stores/app';
import { Badge, Button, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { ErrorDialog } from '../../components/ConfirmDialog';
import type { AppError } from '../../types';

interface LogLine {
  id: number;
  raw: string;
  level: string;
  tag?: string;
  message?: string;
}

const THREADTIME_RE =
  /^(?:\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}\.\d{3}\s+\d+\s+\d+\s+([VDIWEFS])\s+([^:]+):\s*(.*)$/;

const LEVEL_PRIORITY: Record<string, number> = {
  V: 1,
  D: 2,
  I: 3,
  W: 4,
  E: 5,
  F: 6,
  S: 7,
};

let lineSeq = 0;

function parseLogLine(raw: string): LogLine {
  const match = THREADTIME_RE.exec(raw);
  if (match) {
    return {
      id: ++lineSeq,
      raw,
      level: match[1],
      tag: match[2].trim(),
      message: match[3],
    };
  }

  // Fallback heuristic for unstructured lines
  let level = 'I';
  if (/\b(?:E|ERROR|FATAL)\b/i.test(raw)) {
    level = 'E';
  } else if (/\b(?:W|WARN|WARNING)\b/i.test(raw)) {
    level = 'W';
  } else if (/\b(?:D|DEBUG)\b/i.test(raw)) {
    level = 'D';
  } else if (/\b(?:V|VERBOSE)\b/i.test(raw)) {
    level = 'V';
  }

  return {
    id: ++lineSeq,
    raw,
    level,
    message: raw,
  };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function LogsView({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const toast = useApp((s) => s.toast);
  const settings = useApp((s) => s.settings);
  const perf = perfTweaks(settings.performanceMode);
  const maxBuffer = settings.logcatMaxLines || perf.logcatBuffer || 5000;

  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [tagSpec, setTagSpec] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [tagFilter, setTagFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<AppError | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDir, setSaveDir] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = session;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const maxBufferRef = useRef(maxBuffer);
  maxBufferRef.current = maxBuffer;

  // Stream listener
  useEffect(() => {
    const off = getBridge().on('logcat-line', (payload) => {
      const p = payload as { session: string; line: string };
      if (p.session !== sessionRef.current) return;
      if (pausedRef.current) return;

      const rawLines = p.line.split('\n');
      const parsed: LogLine[] = [];
      for (const r of rawLines) {
        if (r.length === 0) continue;
        parsed.push(parseLogLine(r));
      }

      if (parsed.length > 0) {
        setLines((prev) => {
          const combined = prev.concat(parsed);
          const limit = maxBufferRef.current;
          return combined.length > limit ? combined.slice(-limit) : combined;
        });
      }
    });

    return () => {
      off();
      const currentSession = sessionRef.current;
      if (currentSession) {
        void getBridge().logcatStop(currentSession);
      }
    };
  }, []);

  // Auto-scroll on new lines
  useEffect(() => {
    if (!paused && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const spec = tagSpec.trim() || undefined;
      const id = await getBridge().logcatStart(serial, spec);
      setSession(id);
      setPaused(false);
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await getBridge().logcatStop(session);
      setSession(null);
      setPaused(false);
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setBusy(false);
    }
  };

  const togglePause = () => {
    setPaused((prev) => !prev);
  };

  const clear = () => {
    setLines([]);
  };

  const openSave = () => {
    setSaveName(`logcat-${timestamp()}.txt`);
    setSaveDir(settings.downloadDir || '~/Downloads/ADB Studio');
    setSaveOpen(true);
  };

  const saveLog = async () => {
    const cleanDir = (saveDir || '~/Downloads/ADB Studio').replace(/\/+$/, '');
    const cleanName = (saveName || `logcat-${timestamp()}.txt`).replace(/^\/+/, '');
    const fullPath = `${cleanDir}/${cleanName}`;
    const content = filteredLines.map((l) => l.raw).join('\n');

    setSaveBusy(true);
    const r = await act(() => getBridge().saveLogFile(fullPath, content));
    setSaveBusy(false);

    if (r.ok) {
      setSaveOpen(false);
      toast({ kind: 'success', title: t('logs.saved'), body: fullPath });
    } else {
      setError(r.error);
    }
  };

  // Filtered lines calculation
  const filteredLines = useMemo(() => {
    const minLevelPriority = levelFilter !== 'ALL' ? LEVEL_PRIORITY[levelFilter] ?? 0 : 0;
    const tf = tagFilter.trim().toLowerCase();
    const sf = search.trim().toLowerCase();

    return lines.filter((l) => {
      if (minLevelPriority > 0) {
        const prio = LEVEL_PRIORITY[l.level] ?? 0;
        if (prio < minLevelPriority) return false;
      }
      if (tf) {
        const tagMatch = l.tag ? l.tag.toLowerCase().includes(tf) : false;
        const rawMatch = l.raw.toLowerCase().includes(tf);
        if (!tagMatch && !rawMatch) return false;
      }
      if (sf) {
        if (!l.raw.toLowerCase().includes(sf)) return false;
      }
      return true;
    });
  }, [lines, levelFilter, tagFilter, search]);

  const errorCount = useMemo(() => {
    return lines.filter((l) => l.level === 'E' || l.level === 'F').length;
  }, [lines]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 8 }}>
      {/* Action bar */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        {!session ? (
          <Button variant="primary" size="small" onClick={start} disabled={busy}>
            ▶ {t('logs.start')}
          </Button>
        ) : (
          <>
            <Button variant="danger" size="small" onClick={stop} disabled={busy}>
              ■ {t('logs.stop')}
            </Button>
            <Button size="small" variant="ghost" onClick={togglePause}>
              {paused ? `▶ ${t('logs.resume')}` : `⏸ ${t('logs.pause')}`}
            </Button>
          </>
        )}

        <Button size="small" variant="ghost" onClick={clear} disabled={lines.length === 0}>
          {t('logs.clear')}
        </Button>

        <Button size="small" variant="ghost" onClick={openSave} disabled={lines.length === 0}>
          💾 {t('logs.save')}
        </Button>

        <div className="spacer" />

        {session && !paused && <Badge tone="ok">{t('logs.title')}</Badge>}
        {paused && <Badge tone="warn">{t('logs.paused')}</Badge>}
        {errorCount > 0 && <Badge tone="danger">{t('logs.errors', { n: errorCount })}</Badge>}

        <span className="dim small mono">{t('logs.lines', { n: filteredLines.length })}</span>
      </div>

      {/* Filter bar */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        {!session && (
          <input
            type="text"
            className="mono small"
            style={{ width: 190 }}
            placeholder={t('logs.tagPlaceholder')}
            value={tagSpec}
            onChange={(e) => setTagSpec(e.target.value)}
            title={t('logs.tagPlaceholder')}
          />
        )}

        <label className="row small" style={{ gap: 4 }}>
          <span className="dim">{t('logs.filter.level')}:</span>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={{ padding: '3px 8px', fontSize: 12 }}
          >
            <option value="ALL">ALL</option>
            {LOGCAT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </label>

        <input
          type="text"
          className="small"
          style={{ width: 140 }}
          placeholder={t('logs.filter.tag')}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          list="logcat-common-tags"
        />
        <datalist id="logcat-common-tags">
          {LOGCAT_TAGS.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>

        <input
          type="text"
          className="small"
          style={{ flex: 1, minWidth: 160 }}
          placeholder={t('logs.filter.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Main log view */}
      <div className="log-view" ref={bodyRef} aria-live="polite" style={{ flex: 1, minHeight: 0 }}>
        {filteredLines.length === 0 ? (
          <div className="dim" style={{ padding: 12 }}>
            {busy ? (
              <Spinner label={t('logs.starting')} />
            ) : !session ? (
              t('logs.idle')
            ) : lines.length === 0 ? (
              t('logs.waiting')
            ) : (
              t('logs.empty')
            )}
          </div>
        ) : (
          filteredLines.map((line) => (
            <div key={line.id} className={`log-line ${line.level}`}>
              {line.raw}
            </div>
          ))
        )}
      </div>

      {/* Footer / buffer hint */}
      <div className="row small dim" style={{ padding: '0 4px' }}>
        <span>{t('logs.limit', { cap: maxBuffer })}</span>
        {paused && <span className="dim" style={{ marginLeft: 12 }}>{t('logs.paused.hint')}</span>}
        <div className="spacer" />
        <span className="dim">{t('logs.hint')}</span>
      </div>

      {/* Save Modal */}
      {saveOpen && (
        <Modal title={t('logs.save')} onClose={() => setSaveOpen(false)}>
          <div className="m-body">
            <p className="small muted">{t('logs.save.dirHint')}</p>
            <label className="field">
              {t('logs.save.name')}
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </label>
            <label className="field">
              {t('logs.save.path')}
              <div className="row">
                <input
                  type="text"
                  value={saveDir}
                  onChange={(e) => setSaveDir(e.target.value)}
                />
                <Button
                  size="small"
                  variant="ghost"
                  onClick={async () => {
                    const picked = await getBridge().pickPath('directory');
                    if (picked) setSaveDir(picked);
                  }}
                >
                  …
                </Button>
              </div>
            </label>
          </div>
          <div className="m-actions">
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saveBusy}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={saveLog} disabled={saveBusy}>
              {t('logs.save')}
            </Button>
          </div>
        </Modal>
      )}

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
    </div>
  );
}
