export type ActionBarItem = {
  key: string;
  label: string;
  icon: ({ size }: { size?: number }) => React.JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  // the one action that finishes the job on this page, tinted to stand out
  primary?: boolean;
};

type ActionBarProps = {
  items: ActionBarItem[];
};

// Mobile-only frosted bar pinned above the bottom navigation, carrying the
// primary actions of whatever detail page is open. Rendering it as the last
// child of `.page` also emits the spacer that keeps content scrollable past it.
export const ActionBar = ({ items }: ActionBarProps) => {
  const visible = items.filter((item) => item.disabled !== true);
  if (visible.length === 0) return null;

  return (
    <>
      <div className="abar-spacer" aria-hidden="true" />
      <div className="abar" role="toolbar" aria-label="کارهای این صفحه">
        <div className="abar-inner">
          {visible.map(({ key, label, icon: Icon, onClick, primary }) => (
            <button
              key={key}
              className={`abar-btn ${primary === true ? 'primary' : ''}`}
              onClick={onClick}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
