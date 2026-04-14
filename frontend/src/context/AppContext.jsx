import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../lib/api.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [orders,   setOrders]   = useState([]);
  const [insumos,  setInsumos]  = useState([]);
  const [compras,  setCompras]  = useState([]);
  const [lancs,    setLancs]    = useState([]);
  const [funnel,   setFunnel]   = useState([]);
  const [config,   setConfig]   = useState({ pix: '', wa: '', gs: '' });
  const [loading,  setLoading]  = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [toastOn,  setToastOn]  = useState(false);
  const timerRef = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setToastOn(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastOn(false), 2800);
  }, []);

  const refreshOrders  = useCallback(async () => { const d = await api.getOrders();  setOrders(d);  }, []);
  const refreshInsumos = useCallback(async () => { const d = await api.getInsumos(); setInsumos(d); }, []);
  const refreshCompras = useCallback(async () => { const d = await api.getCompras(); setCompras(d); }, []);
  const refreshLancs   = useCallback(async () => { const d = await api.getLancs();   setLancs(d);   }, []);
  const refreshFunnel  = useCallback(async () => { const d = await api.getFunnel();  setFunnel(d);  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [o, i, c, l, f, cfg] = await Promise.all([
        api.getOrders(), api.getInsumos(), api.getCompras(),
        api.getLancs(),  api.getFunnel(),  api.getConfig(),
      ]);
      setOrders(o); setInsumos(i); setCompras(c);
      setLancs(l);  setFunnel(f);  setConfig(cfg);
    } catch (e) {
      console.error('refreshAll error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  return (
    <AppContext.Provider value={{
      orders,   setOrders,   refreshOrders,
      insumos,  setInsumos,  refreshInsumos,
      compras,  setCompras,  refreshCompras,
      lancs,    setLancs,    refreshLancs,
      funnel,   setFunnel,   refreshFunnel,
      config,   setConfig,
      loading,
      toast, toastMsg, toastOn,
      refreshAll,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
