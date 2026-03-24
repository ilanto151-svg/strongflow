import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

// Screen IDs: role | t-setup | t-login | t-forgot | t-reset | patient
export default function Login() {
  const { login } = useAuth();
  const navigate   = useNavigate();

  const [screen, setScreen] = useState('role');
  const [isSetup, setIsSetup] = useState(false);
  const [resetToken, setResetToken]   = useState('');

  // Form state
  const [email, setEmail]     = useState('');
  const [pw, setPw]           = useState('');
  const [pw2, setPw2]         = useState('');
  const [phone, setPhone]     = useState('');
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check URL for reset token and therapist setup status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get('reset');
    if (rt) {
      window.history.replaceState({}, '', window.location.pathname);
      setResetToken(rt);
      setScreen('t-reset');
      return;
    }
    api.get('/auth/therapist/status')
      .then(r => {
        setIsSetup(r.data.isSetup);
        setEmail(r.data.email || '');
      })
      .catch(() => {});
  }, []);

  function go(s) { setError(''); setSuccess(''); setScreen(s); }

  // ── Therapist setup ───────────────────────────────────────────────────────
  async function handleSetup() {
    if (!email || !email.includes('@')) return setError('Please enter a valid email address.');
    if (pw.length < 6) return setError('Password must be at least 6 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const r = await api.post('/auth/therapist/setup', { email, password: pw });
      login(r.data.token, { id: 't1', name: r.data.name, role: 'therapist' });
      navigate('/therapist');
    } catch (e) { setError(e.response?.data?.error || 'Setup failed'); }
    finally { setLoading(false); }
  }

  // ── Therapist login ───────────────────────────────────────────────────────
  async function handleLogin() {
    if (!pw) return setError('Please enter your password.');
    setLoading(true);
    try {
      const r = await api.post('/auth/therapist/login', { password: pw });
      login(r.data.token, { id: 't1', name: r.data.name, role: 'therapist' });
      navigate('/therapist');
    } catch (e) { setError(e.response?.data?.error || 'Login failed'); }
    finally { setLoading(false); }
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  async function handleForgot() {
    setLoading(true);
    try {
      const r = await api.post('/auth/therapist/forgot');
      const token = r.data.token;
      const resetUrl = window.location.origin + '/?reset=' + token;
      const body = `Hi,\n\nYou requested a password reset for your StrongFlow therapist account.\n\nClick the link below to set a new password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.\n\n— StrongFlow`;
      window.location.href = `mailto:${r.data.email}?subject=${encodeURIComponent('StrongFlow — Password Reset')}&body=${encodeURIComponent(body)}`;
      setSuccess('✅ Your email client has opened with the reset link. Send it to yourself and click the link to reset your password.');
    } catch (e) { setError(e.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  }

  // ── Reset password ────────────────────────────────────────────────────────
  async function handleReset() {
    if (pw.length < 6) return setError('Password must be at least 6 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await api.post('/auth/therapist/reset', { token: resetToken, password: pw });
      setPw(''); setPw2('');
      setError('');
      setSuccess('✅ Password updated. Please sign in.');
      go('t-login');
    } catch (e) { setError(e.response?.data?.error || 'Reset failed'); }
    finally { setLoading(false); }
  }

  // ── Patient phone login ───────────────────────────────────────────────────
  async function handlePhone() {
    if (!phone) return setError('Please enter your phone number.');
    if (phone.replace(/\D/g,'').length < 7) return setError('Please enter a valid phone number.');
    setLoading(true);
    try {
      const r = await api.post('/auth/patient/login', { phone });
      login(r.data.token, { id: r.data.id, name: r.data.name, role: 'patient', patientId: r.data.id });
      navigate('/patient');
    } catch (e) { setError(e.response?.data?.error || 'Phone not found'); }
    finally { setLoading(false); }
  }

  const PwEye = ({ show, toggle }) => (
    <button type="button" className="pw-eye" onClick={toggle}>{show ? '🙈' : '👁'}</button>
  );

  return (
    <div id="screen-login">
      <div className="splash-card">
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
          <img src="/logo.png" alt="StrongFlow" className="splash-logo" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
<img
  src="/strongflow.jpg"
  alt="StrongFlow logo"
  className="w-20 h-20 mx-auto mb-4 rounded-3xl object-cover shadow-lg"
/>/
          <div className="splash-title">StrongFlow</div>
          <div className="splash-sub">Remote Exercise Care Platform</div>
        </div>

        {/* ── Role picker ────────────────────────────────────────────── */}
        {screen === 'role' && (
          <div>
            <div className="splash-prompt">Who are you?</div>
            <button className="role-card" onClick={() => { setError(''); go(isSetup ? 't-login' : 't-setup'); }}>
              <div className="role-icon t">🩺</div>
              <div><div className="role-title">Therapist</div><div className="role-desc">Build exercise plans and manage your patients</div></div>
            </button>
            <button className="role-card" onClick={() => go('patient')}>
              <div className="role-icon p">🌿</div>
              <div><div className="role-title">Patient</div><div className="role-desc">View your plan and complete your daily check-in</div></div>
            </button>
          </div>
        )}

        {/* ── Therapist first-time setup ─────────────────────────────── */}
        {screen === 't-setup' && (
          <div>
            <div className="splash-prompt" style={{ marginBottom:4 }}>Set up your account</div>
            <div style={{ color:'rgba(255,255,255,.45)', fontSize:13, textAlign:'center', marginBottom:18 }}>First time here — create a password to secure your dashboard</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <input className="auth-field" type="email" placeholder="Your email address (for password resets)" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
              <div className="pw-toggle">
                <input className="auth-field" type={showPw?'text':'password'} placeholder="Choose a password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSetup()} autoComplete="new-password" />
                <PwEye show={showPw} toggle={() => setShowPw(p => !p)} />
              </div>
              <div className="pw-toggle">
                <input className="auth-field" type={showPw2?'text':'password'} placeholder="Confirm password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSetup()} autoComplete="new-password" />
                <PwEye show={showPw2} toggle={() => setShowPw2(p => !p)} />
              </div>
              <div className="auth-error">{error}</div>
              <button className="auth-btn" onClick={handleSetup} disabled={loading}>{loading ? 'Creating…' : 'Create Account →'}</button>
            </div>
          </div>
        )}

        {/* ── Therapist login ────────────────────────────────────────── */}
        {screen === 't-login' && (
          <div>
            <div className="splash-prompt" style={{ marginBottom:4 }}>Therapist Sign In</div>
            <div style={{ color:'rgba(255,255,255,.45)', fontSize:13, textAlign:'center', marginBottom:18 }}>Enter your password to access the dashboard</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="pw-toggle">
                <input className="auth-field" type={showPw?'text':'password'} placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key==='Enter' && handleLogin()} autoComplete="current-password" autoFocus />
                <PwEye show={showPw} toggle={() => setShowPw(p => !p)} />
              </div>
              <div className="auth-error" style={success ? { color:'#86efac' } : {}}>{error || success}</div>
              <button className="auth-btn" onClick={handleLogin} disabled={loading}>{loading ? 'Signing in…' : 'Sign In →'}</button>
              <div style={{ textAlign:'center', marginTop:4 }}>
                <button className="auth-link" onClick={() => go('t-forgot')}>Forgot password?</button>
              </div>
            </div>
            <button className="back-btn" onClick={() => go('role')}>← Back</button>
          </div>
        )}

        {/* ── Forgot password ────────────────────────────────────────── */}
        {screen === 't-forgot' && (
          <div>
            <div className="splash-prompt" style={{ marginBottom:4 }}>Reset Password</div>
            <div style={{ color:'rgba(255,255,255,.45)', fontSize:13, textAlign:'center', marginBottom:18 }}>A reset link will be sent to your registered email</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="auth-error" style={{ color:'rgba(255,255,255,.55)', minHeight:0 }}>{email ? `Reset link will be sent to: ${email}` : 'No email address on file.'}</div>
              <button className="auth-btn" onClick={handleForgot} disabled={loading}>{loading ? 'Sending…' : 'Send Reset Link →'}</button>
              <div className="auth-success">{success}</div>
            </div>
            <button className="back-btn" onClick={() => go('t-login')}>← Back to sign in</button>
          </div>
        )}

        {/* ── Reset password ─────────────────────────────────────────── */}
        {screen === 't-reset' && (
          <div>
            <div className="splash-prompt" style={{ marginBottom:4 }}>Create New Password</div>
            <div style={{ color:'rgba(255,255,255,.45)', fontSize:13, textAlign:'center', marginBottom:18 }}>Enter and confirm your new password</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="pw-toggle">
                <input className="auth-field" type={showPw?'text':'password'} placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
                <PwEye show={showPw} toggle={() => setShowPw(p => !p)} />
              </div>
              <div className="pw-toggle">
                <input className="auth-field" type={showPw2?'text':'password'} placeholder="Confirm new password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key==='Enter' && handleReset()} />
                <PwEye show={showPw2} toggle={() => setShowPw2(p => !p)} />
              </div>
              <div className="auth-error">{error}</div>
              <button className="auth-btn" onClick={handleReset} disabled={loading}>{loading ? 'Saving…' : 'Set New Password →'}</button>
            </div>
          </div>
        )}

        {/* ── Patient phone login ────────────────────────────────────── */}
        {screen === 'patient' && (
          <div>
            <div className="splash-prompt" style={{ marginBottom:4 }}>Enter your phone number</div>
            <div style={{ color:'rgba(255,255,255,.45)', fontSize:13, textAlign:'center', marginBottom:18 }}>Your therapist has registered you with this number</div>
            <div className="phone-login-wrap">
              <div className="phone-input-row">
                <div className="phone-prefix">📱</div>
                <input
                  className="phone-field" type="tel"
                  placeholder="e.g. 050-123-4567"
                  value={phone} onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && handlePhone()}
                  autoFocus autoComplete="tel"
                />
              </div>
              <div className="phone-error">{error}</div>
              <button className="phone-login-btn" onClick={handlePhone} disabled={loading}>
                {loading ? 'Looking up…' : 'Access My Program →'}
              </button>
            </div>
            <button className="back-btn" onClick={() => go('role')}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
