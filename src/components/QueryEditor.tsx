import Editor, { BeforeMount } from '@monaco-editor/react';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

interface QueryEditorProps {
  query: string;
  onChange: (val: string | undefined) => void;
  language: string; // "SOQL" or "SQL"
}

const HINTS: Record<string, string> = {
  SOQL: "':param' for strings, :param bare for dates/numbers",
  SQL: ':param only — quoting handled by JDBC driver',
};

export function QueryEditor({ query, onChange, language }: QueryEditorProps) {
  const { isDark } = useTheme();
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  return (
    <div className="flex flex-col h-full border border-line rounded-md overflow-hidden bg-surface-panel">
      <div className="bg-surface-elevated px-3 py-1.5 text-xs text-content-secondary font-medium border-b border-line flex items-center justify-between">
        <span>{language} Query</span>
        <span className="text-[10px] text-content-faint">{HINTS[language] || HINTS.SQL}</span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="sql"
          theme={editorTheme}
          beforeMount={handleBeforeMount}
          value={query}
          onChange={onChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            folding: true,
          }}
        />
      </div>
    </div>
  );
}
