import { useEffect } from 'react';
import { WorkspaceMode } from '../types/workspace';

interface UseKeyboardShortcutsProps {
  setMode: (mode: WorkspaceMode) => void;
  setPrivacyBlur: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChapterSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useKeyboardShortcuts({
  setMode,
  setPrivacyBlur,
  setIsChapterSelectOpen,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setMode('matrix');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        setMode('speed_grading');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        setMode('student_360');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '4') {
        e.preventDefault();
        setMode('configurator');
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setPrivacyBlur((prev) => !prev);
      } else if (
        (e.key === '?' || e.key === 'F1') &&
        (e.target as HTMLElement)?.tagName !== 'INPUT' &&
        (e.target as HTMLElement)?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        setIsChapterSelectOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMode, setPrivacyBlur, setIsChapterSelectOpen]);
}
