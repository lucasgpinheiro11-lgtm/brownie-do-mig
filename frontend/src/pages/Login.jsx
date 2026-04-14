import { useState } from 'react';
import * as api from '../lib/api.js';

function formatCpf(val) {
  const d = val.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6);
  return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
}

export function Login({ onLogin }) {
  const [cpf,      setCpf]      = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  function handleCpf(e) {
    setCpf(formatCpf(e.target.value));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const raw = cpf.replace(/\D/g, '');
      const data = await api.login(raw, password);
      localStorage.setItem('mg_token', data.token);
      localStorage.setItem('mg_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #2C1810 0%, #4A2518 50%, #3D1F12 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 24px 60px rgba(0,0,0,.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 12 }}>🍫</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2C1810', fontFamily: 'Sora, sans-serif' }}>
            Brownie do Miguel
          </div>
          <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
            Sistema de Gestão
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="fl">CPF</label>
            <input
              className="fi"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={handleCpf}
              autoFocus
              required
            />
          </div>

          <div className="fg" style={{ marginTop: 14 }}>
            <label className="fl">Senha</label>
            <input
              className="fi"
              type="password"
              placeholder="••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              required
            />
          </div>

          {error && (
            <div style={{
              marginTop: 12,
              padding: '9px 12px',
              background: 'var(--rl)',
              color: 'var(--red)',
              borderRadius: 'var(--rs)',
              fontSize: 12,
              fontWeight: 600,
            }}>
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-gold"
            style={{ width: '100%', marginTop: 20, padding: '11px 0', fontSize: 14 }}
          >
            {loading ? 'Entrando...' : '🔐 Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
