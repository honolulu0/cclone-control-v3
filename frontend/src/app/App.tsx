import { NavLink, Outlet } from "react-router-dom";

export function App() {
  const navItems: Array<{ to: string; label: string }> = [
    { to: "/", label: "工作台" },
    { to: "/templates", label: "回复模板" },
    { to: "/profiles", label: "发送配置" },
    { to: "/history", label: "发送历史" },
    { to: "/codex-settings", label: "Codex 设置" },
    { to: "/diagnostics", label: "诊断" }
  ];

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="brandBlock">
          <div className="brandTitle">cclone-control-v3</div>
          <div className="brandSubtitle">事件驱动、领域化组件化的 Codex 控制台</div>
        </div>
        <nav className="topNav">
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `navButton ${isActive ? "is-selected" : ""}`}>{label}</NavLink>
          ))}
        </nav>
      </header>
      <div className="pageBody">
        <Outlet />
      </div>
    </div>
  );
}
