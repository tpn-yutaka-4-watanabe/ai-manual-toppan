export type SourcePageTag = {
  tag: string;
  label: string;
  sourcePage: number;
  pdfPage: number;
};

export type PublicHandbookConfig = {
  slug: string;
  title: string;
  assistantLabel: string;
  inputPlaceholder: string;
  initialMessage: string;
  connectionName: string;
  source?: {
    label: string;
    pdfUrl?: string;
    pageTags: SourcePageTag[];
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isLoading?: boolean;
};

export type StreamPayload = {
  message?: string;
  state?: unknown;
  quickReplies?: string[];
  connection?: {
    name?: string;
  };
};

export type AdminHandbookIndex = {
  title: string;
  apps: PublicHandbookConfig[];
};
