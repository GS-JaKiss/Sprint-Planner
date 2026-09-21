import { app, BrowserWindow, clipboard, ipcMain, nativeImage, shell } from "electron";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ quiet: true });

type JiraConnection = {
  boardUrl: string;
  email: string;
  apiToken: string;
};

type JiraApiIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    issuetype?: { name: string };
    priority?: { name: string };
    status?: { name: string };
  };
};

type JiraPage = {
  issues: JiraApiIssue[];
  startAt: number;
  maxResults: number;
  total: number;
};

class JiraHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const readJiraError = async (response: Response) => {
  try {
    const body = await response.json() as { errorMessages?: string[]; message?: string };
    return body.errorMessages?.join(" ") || body.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

const importFromJiraApi = async (
  apiBaseUrl: string,
  boardId: string,
  authorization: string,
) => {
  const issues: JiraApiIssue[] = [];
  let startAt = 0;
  let total = 1;

  while (startAt < total && issues.length < 500) {
    const endpoint = new URL(apiBaseUrl);
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/rest/agile/1.0/board/${boardId}/issue`;
    endpoint.searchParams.set("startAt", String(startAt));
    endpoint.searchParams.set("maxResults", "100");
    endpoint.searchParams.set("fields", "summary,issuetype,priority,status");

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
      },
    });

    if (!response.ok) {
      throw new JiraHttpError(response.status, await readJiraError(response));
    }

    const page = await response.json() as JiraPage;
    issues.push(...page.issues);
    total = page.total;
    if (page.issues.length === 0) break;
    startAt = page.startAt + page.issues.length;
  }

  return issues;
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f4f2ec",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f4f2ec",
      symbolColor: "#252721",
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};

ipcMain.handle("jira:import-board", async (_event, connection: JiraConnection) => {
  const boardUrl = new URL(connection.boardUrl);
  if (boardUrl.protocol !== "https:" && boardUrl.hostname !== "localhost") {
    throw new Error("Jira board URL must use HTTPS.");
  }
  const boardId = boardUrl.pathname.match(/\/boards\/(\d+)(?:\/|$)/)?.[1];
  if (!boardId) {
    throw new Error("Could not find a numeric board ID in this Jira board URL.");
  }

  const email = connection.email.trim() || process.env.JIRA_EMAIL?.trim();
  const apiToken = connection.apiToken.trim() || process.env.JIRA_API_TOKEN?.trim();
  if (!email || !apiToken) {
    throw new Error("Add JIRA_EMAIL and JIRA_API_TOKEN to .env, or enter them in the import dialog.");
  }

  const authorization = Buffer.from(`${email}:${apiToken}`).toString("base64");
  let issues: JiraApiIssue[];

  try {
    issues = await importFromJiraApi(boardUrl.origin, boardId, authorization);
  } catch (error) {
    if (!(error instanceof JiraHttpError) || ![401, 403].includes(error.status)) throw error;

    const tenantResponse = await fetch(new URL("/_edge/tenant_info", boardUrl.origin));
    if (!tenantResponse.ok) throw error;
    const tenant = await tenantResponse.json() as { cloudId?: string };
    if (!tenant.cloudId) throw error;

    try {
      issues = await importFromJiraApi(
        `https://api.atlassian.com/ex/jira/${tenant.cloudId}`,
        boardId,
        authorization,
      );
    } catch (scopedError) {
      if (scopedError instanceof JiraHttpError && [401, 403].includes(scopedError.status)) {
        if (scopedError.message.toLowerCase().includes("scope does not match")) {
          throw new Error("This scoped token is missing Jira permissions. Regenerate it with read:board-scope:jira-software and read:issue-details:jira, or use a classic API token.");
        }
        throw new Error("Jira rejected the credentials or board access. Confirm the email owns this token and can view the board.");
      }
      throw scopedError;
    }
  }

  return issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    type: issue.fields.issuetype?.name ?? "Task",
    priority: issue.fields.priority?.name ?? "Medium",
    status: issue.fields.status?.name ?? "To Do",
  }));
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("clipboard:write-image", (_event, dataUrl: unknown) => {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > 30_000_000) {
    throw new Error("Invalid capacity image data.");
  }
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) throw new Error("Could not create the capacity image.");
  clipboard.writeImage(image);
});