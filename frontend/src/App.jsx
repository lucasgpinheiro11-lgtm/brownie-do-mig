import { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext.jsx';
import { Nav } from './components/Nav.jsx';
import { Toast } from './components/Toast.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Kanban } from './pages/Kanban.jsx';
import { Insumos } from './pages/Insumos.jsx';
import { FluxoCaixa } from './pages/FluxoCaixa.jsx';
import { Funil } from './pages/Funil.jsx';
import { Relatorios } from './pages/Relatorios.jsx';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mg_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    function handleLogout() { setUser(null); }
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  function handleLogin(userData) {
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem('mg_token');
    localStorage.removeItem('mg_user');
    setUser(null);
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const pages = {
    dashboard: <Dashboard />,
    kanban: <Kanban />,
    insumos: <Insumos />,
    fluxo: <FluxoCaixa />,
    funil: <Funil />,
    relatorios: <Relatorios />,
  };

  return (
    <AppProvider>
      <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
        <Nav tab={tab} setTab={setTab} user={user} onLogout={handleLogout} />
        <div className="page-enter" key={tab}>
          {pages[tab]}
        </div>
      </div>
      <Toast />
    </AppProvider>
  );
}
