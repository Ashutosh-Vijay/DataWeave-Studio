/// <reference types="vite/client" />

// Set to '1' only by the Microsoft Store build (scripts/pack-msix.ps1). When on,
// the app never self-updates — the Store delivers updates instead.
interface ImportMetaEnv {
  readonly VITE_STORE_BUILD?: string;
}

// Monaco's package.json doesn't list its subpath ESM files in its exports
// types map, so TS can't find the .d.ts for editor.api / edcore.main even
// though they exist on disk. Declare the types via re-export.
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor';
}
declare module 'monaco-editor/esm/vs/editor/edcore.main';
declare module 'monaco-editor/esm/vs/language/json/monaco.contribution';
