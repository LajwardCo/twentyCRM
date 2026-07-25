import { useEffect } from 'react';

import { type CurrentUser } from '../api/auth';
import logoSquare from '../assets/usystems-square.png';
import { navigate, useRoute } from '../lib/router';
import { T } from '../lib/strings';
import {
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconX,
} from './icons';
import { activeNavKey, NAV } from './navItems';

type MobileMenuProps = {
  user: CurrentUser;
  theme: 'light' | 'dark';
  onClose: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
};

// Full-screen navigation sheet behind the mobile bar's "منو" button. It also
// carries the brand, search, theme toggle and account row, which the bottom bar
// has no room for.
export const MobileMenu = ({
  user,
  theme,
  onClose,
  onLogout,
  onToggleTheme,
  onOpenPalette,
}: MobileMenuProps) => {
  const route = useRoute();
  const active = activeNavKey(route.parts);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  return (
    <div className="msheet" role="dialog" aria-modal="true" aria-label="منو">
      <div className="msheet-top">
        <div className="brand">
          <img className="mark" src={logoSquare} alt="Usystems" />
          <div>
            <b>{T.brand}</b>
            <small>{T.brandSub}</small>
          </div>
        </div>
        <button className="msheet-x" onClick={onClose} aria-label="بستن منو">
          <IconX size={19} />
        </button>
      </div>

      <div className="msheet-body">
        <button className="msheet-cta" onClick={() => go('/new')}>
          <IconPlus size={17} />
          {T.newLead}
        </button>

        <div className="msheet-grid">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`msheet-tile ${active === key ? 'on' : ''}`}
              onClick={() => go(`/${key}`)}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="msheet-tools">
          <button
            onClick={() => {
              onClose();
              onOpenPalette();
            }}
          >
            <IconSearch size={17} />
            جستجو
          </button>
          <button onClick={onToggleTheme}>
            {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            {theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'}
          </button>
        </div>
      </div>

      <div className="msheet-user">
        <span className="avatar">{user.firstName.charAt(0) || 'ک'}</span>
        <div className="u-info">
          {user.firstName}
          <small>{user.userEmail}</small>
        </div>
        <button className="out" onClick={onLogout} aria-label={T.signOut}>
          <IconLogout size={17} />
        </button>
      </div>
    </div>
  );
};
