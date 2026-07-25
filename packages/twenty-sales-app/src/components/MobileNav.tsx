import { navigate, useRoute } from '../lib/router';
import { IconMenu } from './icons';
import { activeNavKey, MOBILE_TABS } from './navItems';

type MobileNavProps = {
  menuOpen: boolean;
  onOpenMenu: () => void;
};

// Mobile-only bottom bar: three tabs plus a menu button. Everything else lives
// behind the menu, so each target stays wide enough to hit with a thumb.
export const MobileNav = ({ menuOpen, onOpenMenu }: MobileNavProps) => {
  const route = useRoute();
  const active = activeNavKey(route.parts);

  return (
    <nav className="mnav" aria-label="ناوبری اصلی">
      {MOBILE_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          className={`mnav-item ${!menuOpen && active === key ? 'on' : ''}`}
          onClick={() => navigate(`/${key}`)}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
      <button
        className={`mnav-item ${menuOpen ? 'on' : ''}`}
        onClick={onOpenMenu}
        aria-expanded={menuOpen}
      >
        <IconMenu size={21} />
        <span>منو</span>
      </button>
    </nav>
  );
};
