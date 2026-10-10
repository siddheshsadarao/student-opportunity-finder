import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Download, RotateCw } from 'lucide-react';

const ResumePdf = lazy(() => import('./ResumePdf'));

function WordPreview({ file }) {
  const host = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const root = host.current.shadowRoot || host.current.attachShadow({ mode: 'open' });
    const body = document.createElement('div');
    const styles = document.createElement('div');
    root.replaceChildren(styles, body);
    import('docx-preview').then(({ renderAsync }) => renderAsync(file, body, styles, {
      inWrapper: true, ignoreWidth: true, ignoreHeight: true,
      useBase64URL: true, renderAltChunks: false,
    })).then(() => {
      if (disposed) return;
      body.querySelectorAll('a').forEach((link) => { link.removeAttribute('href'); });
      setLoading(false);
    }).catch(() => {
      if (!disposed) { setError('This DOCX could not be previewed. Download the original file.'); setLoading(false); }
    });
    return () => { disposed = true; root.replaceChildren(); };
  }, [file]);

  return <>
    {loading && <p className="py-6 text-center text-sm text-slate-500">Opening document...</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div ref={host} className="max-h-[65vh] overflow-auto bg-white text-slate-900" />
  </>;
}

export default function ResumePreview({ loadFile, fileName = 'resume' }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const extension = fileName.split('.').pop().toLowerCase();

  useEffect(() => {
    let disposed = false;
    let objectUrl;
    setFile(null); setUrl(''); setError('');
    loadFile().then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setFile(blob); setUrl(objectUrl);
    }).catch((failure) => { if (!disposed) setError(failure.message || 'Resume is unavailable.'); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [loadFile, attempt]);

  const pdf = extension === 'pdf' || file?.type === 'application/pdf';
  const image = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);

  return (
    <section aria-label="Resume preview" className="min-w-0 space-y-3 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 break-all text-sm font-semibold text-slate-900">{fileName}</h3>
        {url && <a href={url} download={fileName} className="btn-secondary btn-sm shrink-0" title="Download original resume"><Download className="h-4 w-4" />Download</a>}
      </div>
      {error ? <div role="alert" className="space-y-3 text-sm text-red-600"><p>{error}</p><button type="button" className="btn-secondary btn-sm" onClick={() => setAttempt(attempt + 1)}><RotateCw className="h-4 w-4" />Retry</button></div> : !file ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading resume...</p> : pdf ? (
        <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Opening PDF viewer...</p>}><ResumePdf file={file} /></Suspense>
      ) : image ? (
        <div className="max-h-[65vh] overflow-auto bg-slate-100 p-3"><img src={url} alt="Uploaded resume" className="mx-auto h-auto max-w-full" onError={() => setError('This image could not be opened.')} /></div>
      ) : extension === 'docx' ? <WordPreview file={file} /> : <p className="text-sm text-slate-500">Preview is unavailable for this file type. Download the original file.</p>}
    </section>
  );
}
