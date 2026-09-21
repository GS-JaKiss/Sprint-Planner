import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sprintPlanner", {
  importJiraBoard: (connection: unknown) => ipcRenderer.invoke("jira:import-board", connection),
  copyImageToClipboard: (dataUrl: string) => ipcRenderer.invoke("clipboard:write-image", dataUrl),
});