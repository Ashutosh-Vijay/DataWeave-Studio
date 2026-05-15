import React from "react";
import ReactDOM from "react-dom/client";
// Slim Monaco entry: editor core API + contributions only, no language packs.
// Importing the default `monaco-editor` pulls in CSS, HTML, TypeScript, and
// ~80 basic languages we never use — adds 9MB of dead chunks. Splitting the
// import: editor.api gives us the typed API surface, edcore.main runs as a
// side-effect to register editor contributions (find, format, comment, etc.)
// without any language packs.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/edcore.main";
// Explicitly opt into the JSON language (used for payload + output editors).
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import { loader } from "@monaco-editor/react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./ThemeContext";
import "./index.css";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    return new editorWorker();
  },
};

// Use locally bundled Monaco instead of CDN
loader.config({ monaco });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
