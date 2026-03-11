import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onHtmlChange: (html: string) => void;
  onTextChange: (text: string) => void;
  editorRef?: React.RefObject<HTMLDivElement | null>;
}

export function RichTextEditor({
  placeholder,
  autoFocus,
  className,
  onHtmlChange,
  onTextChange,
  editorRef: externalRef,
}: RichTextEditorProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = externalRef || internalRef;
  const [isEmpty, setIsEmpty] = useState(true);

  // Store latest callbacks in refs to avoid stale closures
  const onHtmlChangeRef = useRef(onHtmlChange);
  const onTextChangeRef = useRef(onTextChange);
  onHtmlChangeRef.current = onHtmlChange;
  onTextChangeRef.current = onTextChange;

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
    }
  }, [autoFocus]);

  // Use direct event handler to avoid stale closure on ref.current
  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    const text = el.innerText;
    setIsEmpty(!text.trim());
    onHtmlChangeRef.current(html);
    onTextChangeRef.current(text);
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        className={cn(
          'min-h-[120px] max-h-[400px] overflow-y-auto text-caption leading-relaxed outline-none',
          'prose prose-sm max-w-none',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_a]:text-primary [&_a]:underline',
        )}
        style={{ wordBreak: 'break-word' }}
      />
      {isEmpty && placeholder && (
        <div
          className="absolute top-0 left-0 text-caption text-muted-foreground pointer-events-none"
          aria-hidden
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}

/** Execute a formatting command on the current selection */
export function execFormat(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function formatBold() { execFormat('bold'); }
export function formatItalic() { execFormat('italic'); }
export function formatUnderline() { execFormat('underline'); }
export function formatInsertLink() {
  const url = prompt('Nhập URL liên kết:', 'https://');
  if (url) execFormat('createLink', url);
}
export function formatUnorderedList() { execFormat('insertUnorderedList'); }
export function clearEditor(ref: React.RefObject<HTMLDivElement | null>) {
  if (ref.current) {
    ref.current.innerHTML = '';
  }
}
