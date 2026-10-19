import { useState } from 'react';
import { GuideChapterId } from '../types/guide';
import { WorkspaceMode } from '../types/workspace';

interface UseInteractiveGuideProps {
  setMode: (mode: WorkspaceMode) => void;
  setShowClassWizard: (open: boolean) => void;
  setPrivacyBlur: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSettingsModal: (open: boolean) => void;
  setShowVaultInspector: (open: boolean) => void;
  setShowOnDemandSimulator: (open: boolean) => void;
  setShowOnDemandCurveEditor: (open: boolean) => void;
}

export function useInteractiveGuide({
  setMode,
  setShowClassWizard,
  setPrivacyBlur,
  setShowSettingsModal,
  setShowVaultInspector,
  setShowOnDemandSimulator,
  setShowOnDemandCurveEditor,
}: UseInteractiveGuideProps) {
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [currentGuideChapterId, setCurrentGuideChapterId] = useState<GuideChapterId>('overview_all');
  const [currentGuideStepIndex, setCurrentGuideStepIndex] = useState<number>(0);
  const [isChapterSelectOpen, setIsChapterSelectOpen] = useState<boolean>(false);
  const [completedChapters, setCompletedChapters] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gradus21_completed_tour_chapters');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showWelcomeBanner, setShowWelcomeBanner] = useState<boolean>(() => {
    try {
      const dismissed = localStorage.getItem('gradus21_welcome_banner_dismissed') === 'true';
      const completed = localStorage.getItem('gradus21_tour_completed') === 'true';
      return !dismissed && !completed;
    } catch {
      return false;
    }
  });

  const handleStartGuideChapter = (chapterId: GuideChapterId, stepIndex: number = 0) => {
    setCurrentGuideChapterId(chapterId);
    setCurrentGuideStepIndex(stepIndex);
    setIsGuideOpen(true);
    setIsChapterSelectOpen(false);
  };

  const handleChapterCompleted = (chapterId: string) => {
    setCompletedChapters((prev) => {
      const next = Array.from(new Set([...prev, chapterId]));
      try {
        localStorage.setItem('gradus21_completed_tour_chapters', JSON.stringify(next));
        if (next.length >= 1) {
          localStorage.setItem('gradus21_tour_completed', 'true');
        }
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const handleDismissWelcomeBanner = () => {
    setShowWelcomeBanner(false);
    try {
      localStorage.setItem('gradus21_welcome_banner_dismissed', 'true');
    } catch (e) {
      console.error(e);
    }
  };

  const handleGuideAction = (actionType: string, payload?: any) => {
    switch (actionType) {
      case 'switch_mode':
        if (payload) setMode(payload);
        break;
      case 'open_class_wizard':
        setShowClassWizard(true);
        break;
      case 'toggle_privacy_blur':
        setPrivacyBlur((prev) => !prev);
        break;
      case 'open_settings':
        setShowSettingsModal(true);
        break;
      case 'open_vault_inspector':
        setShowVaultInspector(true);
        break;
      case 'show_simulator':
        setShowOnDemandSimulator(true);
        break;
      case 'show_curve_editor':
        setShowOnDemandCurveEditor(true);
        break;
      default:
        break;
    }
  };

  return {
    isGuideOpen,
    setIsGuideOpen,
    currentGuideChapterId,
    setCurrentGuideChapterId,
    currentGuideStepIndex,
    setCurrentGuideStepIndex,
    isChapterSelectOpen,
    setIsChapterSelectOpen,
    completedChapters,
    showWelcomeBanner,
    handleStartGuideChapter,
    handleChapterCompleted,
    handleDismissWelcomeBanner,
    handleGuideAction,
  };
}
