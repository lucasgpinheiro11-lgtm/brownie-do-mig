export function StatCard({ accent, icon, label, value, sub }) {
  return (
    <div className="mc" style={{ '--accent': accent }}>
      <div className="mc-ico">{icon}</div>
      <div className="mc-lbl">{label}</div>
      <div className="mc-val">{value}</div>
      {sub && <div className="mc-sub">{sub}</div>}
    </div>
  );
}
