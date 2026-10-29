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
      className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe border-t shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="grid grid-cols-4 px-2 py-1 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={tab.testId}
              onClick={() => {
                triggerHapticFeedback(8);
                setMode(tab.id);
              }}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 touch-target min-h-[48px] select-none ${
                active ? 'font-bold scale-[1.02]' : 'opacity-70 hover:opacity-100 active:scale-95'
              }`}
              style={{
                backgroundColor: active ? 'var(--primary-soft)' : 'transparent',
                color: active ? 'var(--primary-text)' : 'var(--text-secondary)',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform ${active ? 'scale-110' : ''}`}
                style={{ color: active ? 'var(--primary-500)' : 'currentColor' }}
              />
              <span className="text-[10px] leading-tight tracking-tight mt-1 truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
