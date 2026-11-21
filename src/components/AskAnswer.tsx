// The thing the person asked for, shown whole (a speech, a recipe, a summary), with Copy and Download.
import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { AskStrings } from '../pages/feedStrings';

export function AskAnswer({ text, fileStem, T }: { text: string; fileStem: string; T: AskStrings }) {
  const [copied, setCopied] = useState(false);
  const long = text.length > 600;
  const [open, setOpen] = useState(!long);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the text is shown selectable, so it can still be copied by hand */
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileStem.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'neophi-save'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ask-answer-box">
      <p className={`ask-answer${open ? '' : ' is-folded'}`}>{text}</p>
      <div className="ask-answer-actions">
        <button type="button" onClick={() => void copy()}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? T.copied : T.copy}
        </button>
        <button type="button" onClick={download}>
          <Download size={16} aria-hidden="true" /> {T.download}
        </button>
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? '−' : '+'}
          </button>
        )}
      </div>
    </div>
  );
}
