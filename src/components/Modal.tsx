import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  title,
  children,
  onClose,
  width,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" ref={ref} tabIndex={-1} style={width ? { width } : undefined}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
