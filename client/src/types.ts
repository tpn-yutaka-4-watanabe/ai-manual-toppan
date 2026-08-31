export type PublicHandbookConfig = {
  slug: string;
  title: string;
  assistantLabel: string;
  inputPlaceholder: string;
  initialMessage: string;
  connectionName: string;
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

