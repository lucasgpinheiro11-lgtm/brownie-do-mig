export function Modal({ isOpen, onClose, title, children, footer, maxWidth = '500px' }) {
  if (!isOpen) return null;

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={`mo ${isOpen ? 'open' : ''}`} onClick={handleBackdrop}>
      <div className="mbox" style={{ maxWidth }}>
        <div className="mhd">
          <h2 className="mtitle">{title}</h2>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mbody">{children}</div>
        {footer && <div className="mft">{footer}</div>}
      </div>
    </div>
  );
}
