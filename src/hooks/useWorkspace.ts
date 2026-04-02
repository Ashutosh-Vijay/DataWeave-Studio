import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceFile, ContextState, MimeType, NamedInput } from '../types';

const DEFAULT_CONTEXT: ContextState = {
  method: 'GET',
  queryParams: [],
  headers: [],
  vars: [],
};

const DEFAULT_SCRIPT = `%dw 2.0
output application/json
---
{
  hello: payload.message
}`;

const DEFAULT_PAYLOAD = `{
  "message": "world"
}`;

const DEFAULT_SCRIPTS: Record<string, string> = {
  Transform: DEFAULT_SCRIPT,
  'Salesforce Query': '%dw 2.0\noutput application/json\n---\n{\n  drink: payload.drink\n}',
  'DB Query': '%dw 2.0\noutput application/json\n---\n{\n  id: payload.id\n}',
};

function defaultScriptFor(label: string): string {
  return DEFAULT_SCRIPTS[label] ?? DEFAULT_SCRIPT;
}

interface UseWorkspaceReturn {
  projectName: string;
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  payloadFilePath: string | null;
  nodeLabel: string;
  context: ContextState;
  namedInputs: NamedInput[];
  queryTemplate: string;
  classpath: string[];
  timeoutMs: number;
  setProjectName: (name: string) => void;
  setScript: (script: string) => void;
  setPayload: (payload: string) => void;
  setPayloadMimeType: (mime: MimeType) => void;
  setPayloadFilePath: (path: string | null) => void;
  setNodeLabel: (label: string) => void;
  setContext: (ctx: ContextState) => void;
  setNamedInputs: (inputs: NamedInput[]) => void;
  setQueryTemplate: (query: string) => void;
  setClasspath: (cp: string[]) => void;
  setTimeoutMs: (ms: number) => void;
  saveWorkspace: () => Promise<string>;
  loadWorkspace: (filename: string) => Promise<void>;
  listWorkspaces: () => Promise<string[]>;
  deleteWorkspace: (filename: string) => Promise<void>;
  newWorkspace: () => void;
  isDirty: boolean;
  currentFile: string | null;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [projectName, setProjectName] = useState('Untitled');
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [payloadMimeType, setPayloadMimeType] = useState<MimeType>('application/json');
  const [nodeLabel, setNodeLabelState] = useState('Transform');
  const [script, setScriptState] = useState(DEFAULT_SCRIPT);
  const [context, setContext] = useState<ContextState>(DEFAULT_CONTEXT);
  const [namedInputs, setNamedInputs] = useState<NamedInput[]>([]);
  const [queryTemplate, setQueryTemplate] = useState('');
  const [classpath, setClasspathState] = useState<string[]>([]);
  const [timeoutMs, setTimeoutMsState] = useState(30000);
  const [payloadFilePath, setPayloadFilePathState] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // Keeps per-label scripts in sync without causing extra renders
  const scriptsByLabel = useRef<Record<string, string>>({
    Transform: DEFAULT_SCRIPT,
    'Salesforce Query': DEFAULT_SCRIPTS['Salesforce Query'],
    'DB Query': DEFAULT_SCRIPTS['DB Query'],
  });
  const currentLabel = useRef('Transform');

  const wrapSetter = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (val: T) => { setter(val); setIsDirty(true); };

  const setClasspath = useCallback((cp: string[]) => { setClasspathState(cp); setIsDirty(true); }, []);
  const setTimeoutMs = useCallback((ms: number) => { setTimeoutMsState(ms); setIsDirty(true); }, []);
  const setPayloadFilePath = useCallback((path: string | null) => { setPayloadFilePathState(path); setIsDirty(true); }, []);

  const setScript = useCallback((val: string) => {
    scriptsByLabel.current[currentLabel.current] = val;
    setScriptState(val);
    setIsDirty(true);
  }, []);

  const setNodeLabel = useCallback((label: string) => {
    // Save current script before switching
    scriptsByLabel.current[currentLabel.current] = script;
    currentLabel.current = label;
    // Restore script for the new label
    const next = scriptsByLabel.current[label] ?? defaultScriptFor(label);
    setScriptState(next);
    setNodeLabelState(label);
    setIsDirty(true);
  }, [script]);

  const saveWorkspace = useCallback(async () => {
    const workspace: WorkspaceFile = {
      version: '1.0',
      projectName,
      createdAt: '',
      updatedAt: '',
      mode: 'single',
      singleTransform: {
        script,
        payload,
        payloadMimeType,
        nodeLabel,
        namedInputs,
        queryTemplate,
        classpath,
        timeoutMs,
        payloadFilePath: payloadFilePath ?? undefined,
      },
      context,
    };
    const path = await invoke<string>('save_workspace', { workspace });
    setIsDirty(false);
    const filename = path.split(/[/\\]/).pop() || '';
    setCurrentFile(filename);
    return path;
  }, [projectName, script, payload, payloadMimeType, nodeLabel, namedInputs, queryTemplate, classpath, timeoutMs, payloadFilePath, context]);

  const loadWorkspace = useCallback(async (filename: string) => {
    const ws = await invoke<WorkspaceFile>('load_workspace', { filename });
    // Reset per-label scripts, then set the loaded label's script
    scriptsByLabel.current = {
      Transform: DEFAULT_SCRIPT,
      'Salesforce Query': DEFAULT_SCRIPTS['Salesforce Query'],
      'DB Query': DEFAULT_SCRIPTS['DB Query'],
      [ws.singleTransform.nodeLabel]: ws.singleTransform.script,
    };
    currentLabel.current = ws.singleTransform.nodeLabel;
    setProjectName(ws.projectName);
    setScriptState(ws.singleTransform.script);
    setPayload(ws.singleTransform.payload);
    setPayloadMimeType(ws.singleTransform.payloadMimeType as MimeType);
    setNodeLabelState(ws.singleTransform.nodeLabel);
    setNamedInputs(ws.singleTransform.namedInputs || []);
    setQueryTemplate(ws.singleTransform.queryTemplate || '');
    setClasspathState(ws.singleTransform.classpath || []);
    setTimeoutMsState(ws.singleTransform.timeoutMs ?? 30000);
    setPayloadFilePathState(ws.singleTransform.payloadFilePath ?? null);
    setContext(ws.context);
    setCurrentFile(filename);
    setIsDirty(false);
  }, []);

  const listWorkspaces = useCallback(async () => {
    return invoke<string[]>('list_workspaces');
  }, []);

  const deleteWorkspace = useCallback(async (filename: string) => {
    await invoke('delete_workspace', { filename });
    if (currentFile === filename) setCurrentFile(null);
  }, [currentFile]);

  const newWorkspace = useCallback(() => {
    scriptsByLabel.current = {
      Transform: DEFAULT_SCRIPT,
      'Salesforce Query': DEFAULT_SCRIPTS['Salesforce Query'],
      'DB Query': DEFAULT_SCRIPTS['DB Query'],
    };
    currentLabel.current = 'Transform';
    setProjectName('Untitled');
    setScriptState(DEFAULT_SCRIPT);
    setPayload(DEFAULT_PAYLOAD);
    setPayloadMimeType('application/json');
    setNodeLabelState('Transform');
    setNamedInputs([]);
    setQueryTemplate('');
    setClasspathState([]);
    setTimeoutMsState(30000);
    setPayloadFilePathState(null);
    setContext(DEFAULT_CONTEXT);
    setCurrentFile(null);
    setIsDirty(false);
  }, []);

  return {
    projectName,
    script,
    payload,
    payloadMimeType,
    payloadFilePath,
    nodeLabel,
    context,
    namedInputs,
    queryTemplate,
    classpath,
    timeoutMs,
    setProjectName: wrapSetter(setProjectName),
    setScript,
    setPayload: wrapSetter(setPayload),
    setPayloadMimeType: wrapSetter(setPayloadMimeType),
    setPayloadFilePath,
    setNodeLabel,
    setContext: wrapSetter(setContext),
    setNamedInputs: wrapSetter(setNamedInputs),
    setQueryTemplate: wrapSetter(setQueryTemplate),
    setClasspath,
    setTimeoutMs,
    saveWorkspace,
    loadWorkspace,
    listWorkspaces,
    deleteWorkspace,
    newWorkspace,
    isDirty,
    currentFile,
  };
}
