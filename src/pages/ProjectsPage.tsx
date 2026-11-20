import { useState } from 'react';
import { Copy, Download, Plus, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import type { StringsTable } from '../lib/i18n';
import type { Memory, Project, ProjectOutcome } from '../types/neophi';

function formatOutcomeMarkdown(project: Project, outcome: ProjectOutcome): string {
  const lines: string[] = [
    `# ${project.name} (${outcome.outcomeType === 'itinerary' ? 'Itinerary' : 'Content Brief'} — Draft)`,
    '',
  ];
  for (const sec of outcome.sections) {
    lines.push(`## ${sec.title}`);
    for (const line of sec.lines) {
      lines.push(`- ${line.text} *(source: ${line.sourceField}, memory ${line.sourceMemoryId})*`);
    }
    lines.push('');
  }
  lines.push('## Not known');
  lines.push(outcome.notKnown);
  return lines.join('\n');
}

export function ProjectsPage({
  projects,
  memories,
  onOpenMemory,
  onRefresh,
  t,
}: {
  projects: Project[];
  memories: Memory[];
  onOpenMemory: (id: string) => void;
  onRefresh: () => void;
  t: StringsTable;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outcomeType, setOutcomeType] = useState<'itinerary' | 'content_brief'>('itinerary');
  const [outcomes, setOutcomes] = useState<Record<string, ProjectOutcome>>({});
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createProject({ name: name.trim(), description: description.trim(), outcomeType });
    setName('');
    setDescription('');
    onRefresh();
  };

  const handleBuildOutcome = async (projectId: string) => {
    setBuildingId(projectId);
    try {
      const outcome = await api.buildProjectOutcome(projectId);
      setOutcomes((prev) => ({ ...prev, [projectId]: outcome }));
    } finally {
      setBuildingId(null);
    }
  };

  const sourceLabel = (field: 'note' | 'caption' | 'ai_reading') => {
    if (field === 'note') return 'from your note';
    if (field === 'caption') return 'caption';
    return 'AI reading';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 20 }}>
      <h1 className="serif-title" style={{ fontSize: '1.8rem' }}>
        {t.projectsTitle}
      </h1>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="card"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <h2 className="serif-title" style={{ fontSize: '1.2rem' }}>
          New project
        </h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (e.g. Goa trip)"
          style={{ minHeight: 48, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Goal (e.g. A relaxed three days in South Goa in January)"
          style={{ minHeight: 48, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select
            value={outcomeType}
            onChange={(e) => setOutcomeType(e.target.value as 'itinerary' | 'content_brief')}
            style={{ minHeight: 48, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}
          >
            <option value="itinerary">Travel itinerary</option>
            <option value="content_brief">Content brief</option>
          </select>
          <button type="submit" className="btn-primary">
            <Plus size={18} aria-hidden="true" />
            <span>Create project</span>
          </button>
        </div>
      </form>

      {projects.map((p) => {
        const projMemories = memories.filter((m) => m.projectIds.includes(p.id));
        const outcome = outcomes[p.id];

        return (
          <section key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 className="serif-title" style={{ fontSize: '1.4rem' }}>
                  {p.name}
                </h2>
                {p.description && <p className="muted" style={{ margin: '4px 0 0' }}>{p.description}</p>}
              </div>
              <span className="pill">
                {p.outcomeType === 'itinerary' ? 'Itinerary' : 'Content brief'} · {projMemories.length} saves
              </span>
            </div>

            {projMemories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {projMemories.map((m) => (
                  <button key={m.id} type="button" onClick={() => onOpenMemory(m.id)}>
                    {m.title}
                  </button>
                ))}
              </div>
            )}

            <div>
              <button
                type="button"
                className="btn-primary"
                disabled={buildingId === p.id || projMemories.length === 0}
                onClick={() => void handleBuildOutcome(p.id)}
              >
                <Sparkles size={18} aria-hidden="true" />
                <span>{buildingId === p.id ? 'Building…' : t.buildOutcome}</span>
              </button>
            </div>

            {outcome && (
              <div className="ai-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span className="pill pill-ai">{t.draftLabel}</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(formatOutcomeMarkdown(p, outcome));
                        setCopiedId(p.id);
                        setTimeout(() => setCopiedId(null), 1500);
                      }}
                    >
                      <Copy size={16} aria-hidden="true" />
                      <span>{copiedId === p.id ? 'Copied' : t.copyMarkdown}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const md = formatOutcomeMarkdown(p, outcome);
                        const blob = new Blob([md], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${p.id}-draft.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={16} aria-hidden="true" />
                      <span>{t.downloadMarkdown}</span>
                    </button>
                  </div>
                </div>

                {outcome.sections.map((sec, idx) => (
                  <div key={idx}>
                    <h3 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: 6 }}>
                      {sec.title}
                    </h3>
                    {sec.lines.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>No items cited for this section.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sec.lines.map((line, lIdx) => (
                          <li key={lIdx}>
                            <span>{line.text} </span>
                            <button
                              type="button"
                              onClick={() => onOpenMemory(line.sourceMemoryId)}
                              style={{ minHeight: 36, padding: '2px 8px', fontSize: '0.82rem' }}
                            >
                              {sourceLabel(line.sourceField)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                <div className="card">
                  <h3 className="serif-title" style={{ fontSize: '1.1rem', marginBottom: 4 }}>
                    {t.notKnownTitle}
                  </h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {outcome.notKnown}
                  </p>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
