import React from 'react';
import { Columns, Zap, UserCheck, Sliders } from 'lucide-react';
import { WorkspaceMode } from '../types/workspace';
import { triggerHapticFeedback } from '../utils/haptics';

export interface MobileTabBarProps {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ mode, setMode }) => {
  const tabs = [
    { id: 'matrix' as const, label: 'Matrix', icon: Columns, testId: 'mobile-tab-matrix' },
    { id: 'speed_grading' as const, label: 'Speed', icon: Zap, testId: 'mobile-tab-speed' },
    { id: 'student_360' as const, label: '360°-Akte', icon: UserCheck, testId: 'mobile-tab-student360' },
    { id: 'configurator' as const, label: 'Gewichtung', icon: Sliders, testId: 'mobile-tab-configurator' },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="mobile-tab-bar md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe border-t backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="grid grid-cols-4 px-2 py-1.5 gap-1.5 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={tab.testId}
              onClick={() => {
                triggerHapticFeedback(10);
                setMode(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-200 touch-target min-h-[50px] select-none ${
                active
                  ? 'font-extrabold shadow-xs'
                  : 'opacity-65 hover:opacity-100 active:scale-95'
              }`}
              style={{
                backgroundColor: active ? 'var(--primary-soft)' : 'transparent',
                color: active ? 'var(--primary-text)' : 'var(--text-secondary)',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
                    active ? 'scale-110 stroke-[2.4px]' : 'stroke-[1.8px]'
                  }`}
                  style={{ color: active ? 'var(--primary-500)' : 'currentColor' }}
                />
                {active && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--primary-500)' }}
                  />
                )}
              </div>
              <span className="text-[10px] leading-tight tracking-tight mt-1.5 truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
