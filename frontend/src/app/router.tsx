import { createBrowserRouter } from "react-router-dom";

import { App } from "./App";
import { WorkbenchPage } from "../features/workbench/WorkbenchPage";
import { TemplatesPage } from "../features/templates/TemplatesPage";
import { ProfilesPage } from "../features/profiles/ProfilesPage";
import { HistoryPage } from "../features/history/HistoryPage";
import { DiagnosticsPage } from "../features/diagnostics/DiagnosticsPage";
import { CodexSettingsPage } from "../features/codex-settings/CodexSettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <WorkbenchPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "profiles", element: <ProfilesPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "diagnostics", element: <DiagnosticsPage /> },
      { path: "codex-settings", element: <CodexSettingsPage /> }
    ]
  }
]);
