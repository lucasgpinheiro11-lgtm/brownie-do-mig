import { useApp } from '../context/AppContext.jsx';

export function Toast() {
  const { toastMsg, toastOn } = useApp();
  return (
    <div className={`toast ${toastOn ? 'show' : ''}`}>
      {toastMsg}
    </div>
  );
}
