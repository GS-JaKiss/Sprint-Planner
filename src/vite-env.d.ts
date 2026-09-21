/// <reference types="vite/client" />

type JiraConnection = {
  boardUrl: string;
  email: string;
  apiToken: string;
};

type ImportedJiraIssue = {
  id: string;
  key: string;
  summary: string;
  type: string;
  priority: string;
  status: string;
};

interface Window {
  sprintPlanner?: {
    importJiraBoard: (connection: JiraConnection) => Promise<ImportedJiraIssue[]>;
    copyImageToClipboard: (dataUrl: string) => Promise<void>;
  };
}