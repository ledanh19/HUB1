import React, { useState, useRef, useCallback, KeyboardEvent, ClipboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isValidEmail, extractEmail } from '../utils/emailHelpers';

export interface Recipient {
  email: string;
  name?: string;
  valid: boolean;
}

interface RecipientChipInputProps {
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Parse raw text into Recipient[] — handles:
 * - Plain emails: user@example.com
 * - Angle bracket: "Display Name <user@example.com>"
 * - Comma/semicolon/space-separated lists
 *
 * Rejects non-email strings entirely (no invalid chips).
 */
function parseEmails(raw: string): Recipient[] {
  const results: Recipient[] = [];

  // Split on comma/semicolon but preserve angle-bracket groups
  const parts = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    const { email, displayPart } = extractEmail(part);
    if (isValidEmail(email)) {
      results.push({ email, name: displayPart || undefined, valid: true });
    }
    // Silently drop non-email strings — never create invalid chips
  }
  return results;
}

export function RecipientChipInput({ recipients, onChange, placeholder, disabled, className }: RecipientChipInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commitInput = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const newRecipients = parseEmails(trimmed);
    if (newRecipients.length > 0) {
      onChange([...recipients, ...newRecipients]);
    }
    setInputValue('');
  }, [recipients, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
      e.preventDefault();
      commitInput(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      onChange(recipients.slice(0, -1));
    }
  }, [inputValue, recipients, onChange, commitInput]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const newRecipients = parseEmails(pasted);
    if (newRecipients.length > 0) {
      onChange([...recipients, ...newRecipients]);
    }
  }, [recipients, onChange]);

  const handleBlur = useCallback(() => {
    commitInput(inputValue);
  }, [inputValue, commitInput]);

  const removeRecipient = useCallback((index: number) => {
    onChange(recipients.filter((_, i) => i !== index));
  }, [recipients, onChange]);

  return (
    <div
      className={cn(
        'flex items-center gap-1 min-h-[28px] max-h-[56px] overflow-x-auto scrollbar-none cursor-text',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {recipients.map((r, i) => (
        <span
          key={`${r.email}-${i}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs max-w-[220px]',
            r.valid
              ? 'bg-[#E0EBF5] text-primary border border-primary/30'
              : 'bg-destructive/10 text-destructive border border-destructive/30'
          )}
          title={r.valid ? r.email : `Email không hợp lệ: ${r.email}`}
        >
          <span className="truncate">{r.name || r.email}</span>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeRecipient(i); }}
              className="shrink-0 rounded-full hover:bg-foreground/10 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          placeholder={recipients.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-caption h-7 border-0 p-0"
          disabled={disabled}
        />
      )}
    </div>
  );
}
