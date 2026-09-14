import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAttention } from '@/hooks/queries';
import { useTheme } from '@/hooks/useTheme';
import { useOnline } from '@/hooks/useOnline';
import {
  BellIcon, BoxIcon, HomeIcon, MoonIcon, ScanIcon, SearchIcon, SunIcon, UserIcon,
} from '@/components/Icons';
import './AppShell.css';

const TABS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/scan', label: 'Scan', icon: ScanIcon },
  { to: '/places', label: 'Places', icon: BoxIcon },
  { to: '/profile', label: 'You', icon: UserIcon },
];

export function AppShell() {
  const { theme, toggle } = useTheme();
  const online = useOnline();
  const location = useLocation();

  // The badge is the whole point of the attention endpoint — surface it in the chrome.
  const { data: attention } = useAttention(30);
  const attentionCount = attention
    ? attention.expiring.length + attention.warranty.length + attention.overdue.length + attention.lowStock.length
    : 0;

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <NavLink to="/" className="brand">
          <span className="brand-mark"><BoxIcon size={16} /></span>
          FindMyStuff
        </NavLink>

        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
          >
            <Icon size={18} />
            {label}
            {to === '/' && attentionCount > 0 && <span className="side-badge">{attentionCount}</span>}
          </NavLink>
        ))}

        <div className="side-foot">
          <button className="side-link" onClick={toggle} style={{ width: '100%', border: 0, background: 'none' }}>
            {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </nav>

      <div className="shell-main">
        <header className="appbar">
          <NavLink to="/" className="brand">
            <span className="brand-mark"><BoxIcon size={16} /></span>
            FindMyStuff
          </NavLink>
          <div className="grow" />
          <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
            {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <NavLink to="/" aria-label="Reminders" className="icon-btn">
            <BellIcon size={18} />
            {attentionCount > 0 && <span className="dot-badge">{attentionCount}</span>}
          </NavLink>
        </header>

        {!online && <div className="offline-bar">You’re offline — showing the last loaded data.</div>}

        <main className="content" key={location.pathname.split('/')[1]}>
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <span className="tab-icon"><Icon size={21} /></span>
            {label}
            {to === '/' && attentionCount > 0 && <span className="tab-badge">{attentionCount}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
