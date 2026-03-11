import React, { useRef, useEffect, useState, useCallback } from 'react';

interface EmailHtmlIframeProps {
  html: string;
  className?: string;
}

/**
 * Renders raw email HTML inside a sandboxed iframe so that
 * embedded <style> tags, fonts, and layout rules cannot leak
 * into the parent page DOM.
 *
 * The iframe auto-resizes to fit its content height.
 */
export function EmailHtmlIframe({ html, className }: EmailHtmlIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const buildSrcDoc = useCallback((bodyHtml: string) => {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1a1a2e;
    word-break: break-word;
    overflow-wrap: break-word;
    background: transparent;
    overflow-x: hidden;
    /* Force body to respect container width */
    max-width: 100%;
  }
  /* ═══ Force OTA email tables to fit container ═══
     Agoda/Booking.com/Expedia use fixed-width table layouts (600-640px).
     These overrides force them to shrink to fit the available width. */
  table {
    max-width: 100% !important;
    width: 100% !important;
    table-layout: fixed !important;
  }
  td, th {
    max-width: 100% !important;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  /* Reset inline fixed widths on nested containers */
  div[style*="width"], table[style*="width"],
  td[style*="width"], center[style*="width"] {
    max-width: 100% !important;
  }
  img { max-width: 100% !important; height: auto !important; }
  a { color: #2563eb; text-decoration: underline; }
  /* Hide tracking pixels */
  img[width="1"], img[height="1"],
  img[style*="display:none"], img[style*="display: none"] {
    display: none !important;
  }
  /* Prevent horizontal overflow from any element */
  body > * { max-width: 100% !important; overflow-x: hidden; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let resizeObserver: ResizeObserver | null = null;

    const measureHeight = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const newHeight = Math.max(60, doc.body.scrollHeight + 4);
          setHeight(newHeight);
        }
      } catch {
        // cross-origin fallback
      }
    };

    const handleLoad = () => {
      measureHeight();
      // Watch for size changes (images loading, lazy content, etc.)
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          resizeObserver = new ResizeObserver(() => measureHeight());
          resizeObserver.observe(doc.body);
        }
      } catch {
        // fallback: no observer
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
      resizeObserver?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={buildSrcDoc(html)}
      sandbox="allow-same-origin"
      title="Email content"
      className={className}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 'none',
        display: 'block',
        overflow: 'hidden',
        background: 'transparent',
      }}
    />
  );
}
