import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export default function ResumePdf({ file }) {
  const container = useRef(null);
  const [width, setWidth] = useState(600);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, entry.contentRect.width - 24)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" title="Previous page" aria-label="Previous page" disabled={page <= 1 || !pages} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[82px] text-center text-sm text-slate-600" aria-live="polite">{pages ? `${page} / ${pages}` : 'Loading...'}</span>
          <button type="button" className="btn-secondary btn-sm" title="Next page" aria-label="Next page" disabled={page >= pages || !pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut className="h-4 w-4" /></button>
          <span className="w-12 text-center text-sm text-slate-600">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn-secondary btn-sm" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + 0.25))}><ZoomIn className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mt-3 max-h-[65vh] overflow-auto bg-slate-100 p-3">
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : (
          <Document file={file} onLoadSuccess={({ numPages }) => { setPages(numPages); setPage(1); }} onLoadError={() => setError('This PDF could not be opened. Download the original file to inspect it.')} onPassword={() => setError('This PDF is password-protected. Download it to open with its password.')} loading={<p className="py-8 text-center text-sm text-slate-500">Opening PDF...</p>}>
            <Page pageNumber={page} width={Math.min(width, 770)} scale={zoom} renderAnnotationLayer={false} onRenderError={() => setError('This PDF page could not be rendered. Download the original file.')} />
          </Document>
        )}
      </div>
    </div>
  );
}
