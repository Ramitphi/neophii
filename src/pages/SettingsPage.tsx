import { useEffect, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { api, type HealthInfo } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import { LANDING } from '../landing/strings';
import type { LanguageCode } from '../types/neophi';

export function SettingsPage({
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  onRefresh,
  t,
}: {
  lang: LanguageCode;
  onChangeLang: (l: LanguageCode) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void api.health().then(setHealth).catch(() => {});
  }, []);

  const handleExport = async () => {
    const data = await api.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neophi-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const res = await api.importAll(parsed);
    setStatus(`Imported ${res.imported} memories.`);
    onRefresh();
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(t.settingsDeleteConfirm)) return;
    await api.deleteMe();
    setStatus('Everything deleted.');
    onRefresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
      <h1 className="serif-title" style={{ fontSize: '1.8rem' }}>
        {t.settingsTitle}
      </h1>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="serif-title" style={{ fontSize: '1.25rem' }}>
          {t.settingsLanguage}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {(
            [
              { code: 'en', label: 'English' },
              { code: 'hi', label: 'हिंदी' },
              { code: 'hinglish', label: 'Hinglish' },
            ] as const
          ).map((item) => (
            <button
              key={item.code}
              type="button"
              className={lang === item.code ? 'btn-primary' : ''}
              onClick={() => onChangeLang(item.code)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="serif-title" style={{ fontSize: '1.25rem' }}>
          {t.settingsTheme}
        </h2>
        <div>
          <button type="button" onClick={onToggleTheme}>
            {theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          </button>
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="serif-title" style={{ fontSize: '1.25rem' }}>
          {t.settingsModels}
        </h2>
        {health ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className="pill">Analysis: {health.models.analysis}</span>
            <span className="pill">
              Embedding: {health.models.embedding} ({health.models.embeddingDims} dims)
            </span>
            <span className="pill">Region: {health.region}</span>
          </div>
        ) : (
          <p className="muted">Loading model info…</p>
        )}
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="serif-title" style={{ fontSize: '1.25rem' }}>
          Data
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" onClick={() => void handleExport()}>
            <Download size={16} aria-hidden="true" />
            <span>{t.settingsExport}</span>
          </button>

          <label className="btn" role="button" tabIndex={0}>
            <Upload size={16} aria-hidden="true" />
            <span>{t.settingsImport}</span>
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => void handleImport(e.target.files?.[0] ?? null)}
            />
          </label>

          <button type="button" className="btn-danger" onClick={() => void handleDeleteAll()}>
            <Trash2 size={16} aria-hidden="true" />
            <span>{t.settingsDeleteAll}</span>
          </button>
        </div>
        {status && <p className="pill">{status}</p>}
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>{t.settingsPrivacyNote}</p>
        <a href="#welcome">{LANDING[lang].footer.welcomeAgain}</a>
      </section>
    </div>
  );
}
