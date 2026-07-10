import { dockRemove, useDock, type DockKind } from '../lib/workbench';
import { navigate, useRoute } from '../lib/router';
import {
  IconBuilding,
  IconPlus,
  IconSearch,
  IconSummary,
  IconTasks,
} from './icons';

const KIND_ICON: Record<DockKind, ({ size }: { size?: number }) => React.JSX.Element> = {
  lead: IconBuilding,
  task: IconTasks,
  new: IconPlus,
  page: IconSummary,
  search: IconSearch,
};

export const Dock = () => {
  const items = useDock();
  const route = useRoute();

  if (items.length === 0) return null;

  const current = `/${route.path}`;

  return (
    <div className="dock" role="toolbar" aria-label="صفحات باز">
      <div className="dock-inner">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind] ?? IconSummary;
          const active = current === item.route;
          return (
            <span key={item.route} className={`dock-chip ${active ? 'on' : ''}`}>
              <button
                className="dock-open"
                onClick={() => navigate(item.route)}
                title={item.label}
              >
                <Icon size={13} />
                <span className="dock-label">{item.label}</span>
              </button>
              <button
                className="dock-close"
                aria-label={`بستن ${item.label}`}
                onClick={() => dockRemove(item.route)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
};
