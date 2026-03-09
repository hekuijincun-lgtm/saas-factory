// Support ticket types — shared between frontend and API

export type SupportCategory = 'bug' | 'feature' | 'support' | 'other';
export type SupportPriority = 'low' | 'medium' | 'high';
export type SupportStatus = 'new' | 'reviewing' | 'planned' | 'closed';

export interface SupportTicket {
  id: string;
  tenantId: string;
  category: SupportCategory;
  subject?: string;
  message: string;
  priority?: SupportPriority;
  wantsReply: boolean;
  contactEmail?: string;
  pageUrl?: string;
  userAgent?: string;
  status: SupportStatus;
  source: 'admin_ui';
  createdAt: string;
  // Future: screenshotUrl, assignee, resolvedAt, metadata
}
