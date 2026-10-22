export interface GlobalTemplateRecord {
  id: string;
  template_type: string; // 'curve' | 'weighting' | 'levels'
  title: string;
  description: string;
  payload: any;
  created_at?: string;
  updated_at?: string;
}
