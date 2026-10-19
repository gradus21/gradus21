import { WorkspaceMode } from './workspace';

export type GuideChapterId =
  | 'overview_all'
  | 'class_setup_excel'
  | 'custom_grading_model'
  | 'speed_grading'
  | 'student_360_simulator'
  | 'privacy_security';

export interface GuideStepAction {
  label: string;
  actionType:
    | 'switch_mode'
    | 'open_class_wizard'
    | 'toggle_privacy_blur'
    | 'open_settings'
    | 'open_vault_inspector'
    | 'show_simulator'
    | 'show_curve_editor'
    | 'trigger_custom';
  payload?: any;
}

export interface GuideStep {
  id: string;
  title: string;
  content: string;
  targetId?: string; // matches data-tour="targetId"
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  targetMode?: WorkspaceMode; // Automatically switch to this workspace mode
  action?: GuideStepAction;
  highlightPadding?: number;
  badge?: string;
  tip?: string;
}

export interface GuideChapter {
  id: GuideChapterId;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  iconName: string;
  estimatedMinutes: number;
  tags: string[];
  steps: GuideStep[];
}
