import { useEffect } from 'react';
import { TYPE_META } from '../../constants';

export default function Lightbox({ exercise, onClose }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const meta = TYPE_META[exercise.type] || TYPE_META.other;
  const hasImg = exercise.img_data || exercise.img_url;

  return (
    <div className="img-lightbox" onClick={onClose}>
      <div className="img-lightbox-inner" onClick={e => e.stopPropagation()}>
        {hasImg ? (
          <img src={exercise.img_data || exercise.img_url}
               alt={exercise.name}
               style={{ maxWidth: '90vw', maxHeight: '70vh', borderRadius: 12, objectFit: 'contain' }} />
        ) : (
          <div className="img-lightbox-emoji">{exercise.image || meta.icon}</div>
        )}
        <div className="img-lightbox-name">{exercise.name}</div>
        <span className="img-lightbox-type" style={{ background: meta.bg, color: meta.color }}>
          {meta.icon} {meta.label}
        </span>
        {exercise.description && (
          <p style={{ color: '#ccc', maxWidth: 360, textAlign: 'center', marginTop: 4 }}>
            {exercise.description}
          </p>
        )}
        <button className="btn" onClick={onClose} style={{ marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}
