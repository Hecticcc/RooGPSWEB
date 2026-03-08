'use client';

import { useRef } from 'react';
import { Bold, Italic, Link, Code, List, ListOrdered, Quote } from 'lucide-react';

function insertAround(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string = before
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.slice(start, end);
  const newText = text.slice(0, start) + before + selected + after + text.slice(end);
  textarea.value = newText;
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = end + before.length;
  textarea.focus();
  return newText;
}

function insertLinePrefix(textarea: HTMLTextAreaElement, prefix: string) {
  const start = textarea.selectionStart;
  const text = textarea.value;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
  textarea.value = newText;
  textarea.selectionStart = start + prefix.length;
  textarea.selectionEnd = textarea.selectionStart;
  textarea.focus();
  return newText;
}

type SupportReplyEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: React.ReactNode;
  disabled?: boolean;
  minHeight?: string;
};

export default function SupportReplyEditor({
  id = 'reply',
  value,
  onChange,
  placeholder = 'Type your message...',
  rows = 4,
  label,
  disabled,
  minHeight,
}: SupportReplyEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleToolbar(e: React.MouseEvent<HTMLButtonElement>, action: () => string) {
    e.preventDefault();
    const ta = textareaRef.current;
    if (!ta) return;
    const newValue = action();
    onChange(newValue);
  }

  const toolbarBtn = (icon: React.ReactNode, title: string, action: () => string) =>
    <button
      type="button"
      title={title}
      className="admin-btn admin-btn--small"
      style={{ padding: '0.35rem 0.5rem' }}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        handleToolbar(e, action);
      }}
      aria-label={title}
    >
      {icon}
    </button>;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {label != null && (
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
          {label}
        </label>
      )}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.35rem 0.5rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-elevated, rgba(0,0,0,0.03))',
          }}
        >
          {toolbarBtn(
            <Bold size={16} />,
            'Bold',
            () => (textareaRef.current ? insertAround(textareaRef.current, '**', '**') : value)
          )}
          {toolbarBtn(
            <Italic size={16} />,
            'Italic',
            () => (textareaRef.current ? insertAround(textareaRef.current, '*', '*') : value)
          )}
          {toolbarBtn(
            <Link size={16} />,
            'Link',
            () => (textareaRef.current ? insertAround(textareaRef.current, '[', '](url)') : value)
          )}
          {toolbarBtn(
            <Code size={16} />,
            'Code',
            () => (textareaRef.current ? insertAround(textareaRef.current, '`', '`') : value)
          )}
          {toolbarBtn(
            <List size={16} />,
            'Bullet list',
            () => (textareaRef.current ? insertLinePrefix(textareaRef.current, '- ') : value)
          )}
          {toolbarBtn(
            <ListOrdered size={16} />,
            'Numbered list',
            () => (textareaRef.current ? insertLinePrefix(textareaRef.current, '1. ') : value)
          )}
          {toolbarBtn(
            <Quote size={16} />,
            'Quote',
            () => (textareaRef.current ? insertLinePrefix(textareaRef.current, '> ') : value)
          )}
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          className="admin-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          style={{
            width: '100%',
            resize: 'vertical',
            border: 'none',
            borderRadius: 0,
            minHeight: minHeight ?? undefined,
          }}
        />
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
        You can use **bold**, *italic*, [links](url), `code`, and lists.
      </p>
    </div>
  );
}
