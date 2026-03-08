'use client';

import ReactMarkdown from 'react-markdown';

const supportMessageBodyStyles: React.CSSProperties = {
  wordBreak: 'break-word',
  lineHeight: 1.5,
};
const supportMessageBodyClass = 'support-message-body';

export default function SupportMessageBody({ body }: { body: string }) {
  if (!body?.trim()) return null;
  return (
    <div className={supportMessageBodyClass} style={supportMessageBodyStyles}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ margin: '0 0 0.5em' }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          code: ({ children }) => (
            <code style={{ background: 'var(--surface)', padding: '0.1em 0.35em', borderRadius: 4, fontSize: '0.9em' }}>
              {children}
            </code>
          ),
          ul: ({ children }) => <ul style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0.25em 0', paddingLeft: '1.25em' }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: '0.15em' }}>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
