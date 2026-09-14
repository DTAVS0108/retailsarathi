'use client';

import { cn } from './dashboard-ui';

export function ScrollableTabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        '-mx-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      role="tablist"
    >
      <div className="flex min-w-max snap-x snap-mandatory gap-2 px-1">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'snap-start whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-teal-700 text-white shadow-md shadow-teal-700/20 ring-2 ring-teal-600/30'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 active:scale-[0.98]',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
