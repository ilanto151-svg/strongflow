import { useState } from 'react';
import api from '../../utils/api';
import { weekLabel } from '../../utils/calendar';
import Modal from '../shared/Modal';

// Google Drive: upload HTML blob via multipart upload API
async function uploadToGoogleDrive(htmlContent, fileName) {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google API not loaded. Add GOOGLE_CLIENT_ID to your config.');
  }
  if (!window.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID not configured. See DEPLOYMENT.md for setup.');
  }

  const token = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: window.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => resp.error ? reject(new Error(resp.error)) : resolve(resp.access_token),
    });
    client.requestAccessToken();
  });

  const boundary = 'oncomove_boundary_xyz';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: fileName, mimeType: 'text/html' }),
    `--${boundary}`,
    'Content-Type: text/html',
    '',
    htmlContent,
    `--${boundary}--`,
  ].join('\r\n');

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive upload failed (${resp.status})`);
  }

  const file = await resp.json();

  // Make the file publicly readable so patients can open it
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  // webContentLink triggers direct download/open; prefer webViewLink as fallback
  return file.webContentLink || file.webViewLink;
}

export default function ShareProgram({ patient, onClose }) {
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [result,       setResult]       = useState(null);
  // result: { programUrl, html, filename, firstName, weekSummary, driveLink }

  async function generate() {
    if (!patient) return alert('No patient selected.');
    setLoading(true);
    try {
      const res = await api.post(`/share/generate/${patient.id}`, { weekOffset });
      const { token, html, filename, firstName, weekSummary } = res.data;
      const origin     = `${window.location.protocol}//${window.location.host}`;
      const programUrl = `${origin}/s/${token}`;
      setResult({ programUrl, html, filename, firstName, weekSummary, driveLink: null });
    } catch (err) {
      alert('Failed to generate program: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleDriveUpload() {
    if (!result) return;
    setDriveLoading(true);
    try {
      const driveLink = await uploadToGoogleDrive(result.html, result.filename);
      setResult(r => ({ ...r, driveLink }));
    } catch (err) {
      alert(err.message);
    } finally {
      setDriveLoading(false);
    }
  }

  // Always use Drive link when available, otherwise the hosted server URL
  const shareUrl = result?.driveLink || result?.programUrl;

  function buildMsg(url) {
    const name = result?.firstName || patient?.name?.split(' ')[0] || '';
    return `Hi ${name}! 👋\n\nYour StrongFlow exercise program is ready. Open the link below on any device:\n\n${url}\n\nStay strong! 💪`;
  }

  function buildWhatsAppUrl() {
    const text = encodeURIComponent(buildMsg(shareUrl));
    // Normalise phone to digits-only (wa.me requires no +, spaces or dashes)
    const digits = (patient?.phone || '').replace(/\D/g, '');
    return digits
      ? `https://wa.me/${digits}?text=${text}`
      : `https://wa.me/?text=${text}`;
  }

  return (
    <Modal title="Share Program" onClose={onClose} size="modal-sm">

      {/* ── Step 1: Pick week & generate ── */}
      {!result && (
        <div>
          {!patient ? (
            <p style={{ color: 'var(--gray-500)' }}>Please select a patient first.</p>
          ) : (
            <>
              <p style={{ marginBottom: 16 }}>
                Create an online exercise program for <strong>{patient.name}</strong> — shareable via a clickable link.
              </p>
              <div className="form-row">
                <label className="form-label">Starting week</label>
                <select className="form-input" value={weekOffset} onChange={e => setWeekOffset(+e.target.value)}>
                  {[-1, 0, 1, 2].map(o => <option key={o} value={o}>{weekLabel(o)}</option>)}
                </select>
              </div>
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
                The link opens instantly on any mobile or desktop browser — no app or download needed.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={generate} disabled={loading}>
                  {loading ? 'Generating…' : '🔗 Generate Link'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 2: Share the link ── */}
      {result && (
        <div>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Program ready!</p>
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              Share the link with {patient.name}
            </p>
          </div>

          {/* Link preview box */}
          <div style={{
            background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
              {result.driveLink ? '📁 Google Drive link' : '🔗 Program link'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <a href={shareUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 13, color: 'var(--blue)', wordBreak: 'break-all', flex: 1, lineHeight: 1.5 }}>
                {shareUrl}
              </a>
              <button
                className="btn btn-ghost"
                style={{ padding: '5px 10px', fontSize: 12, flexShrink: 0 }}
                title="Copy link"
                onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => alert('Link copied!'))}
              >
                📋
              </button>
            </div>
          </div>

          {/* WhatsApp / Email buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <a
              href={buildWhatsAppUrl()}
              target="_blank" rel="noreferrer"
              className="btn btn-whatsapp"
            >
              💬 WhatsApp
            </a>
            {patient.email && (
              <a
                href={`mailto:${patient.email}?subject=${encodeURIComponent(`StrongFlow – ${result.firstName}'s Exercise Program`)}&body=${encodeURIComponent(buildMsg(shareUrl))}`}
                className="btn btn-email"
              >
                ✉️ Email
              </a>
            )}
          </div>

          {/* Google Drive upload section */}
          <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 14 }}>
            {result.driveLink ? (
              <div style={{
                background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 13, color: '#166534',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✅</span>
                <span>Saved to Google Drive — the link above now points to Drive.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>📁 Save to Google Drive</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                    Upload to your Drive and share the Drive link instead.
                  </div>
                </div>
                <button
                  className="btn btn-outline-green"
                  style={{ fontSize: 13, flexShrink: 0 }}
                  onClick={handleDriveUpload}
                  disabled={driveLoading}
                >
                  {driveLoading ? 'Uploading…' : '↑ Upload'}
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose}>Done</button>
          </div>
        </div>
      )}

    </Modal>
  );
}
