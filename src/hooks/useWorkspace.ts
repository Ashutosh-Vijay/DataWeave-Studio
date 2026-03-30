import { useState, useCallback } from 'react';
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

interface UseWorkspaceReturn {
  // State
  projectName: string;
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  nodeLabel: string;
  context: ContextState;
  namedInputs: NamedInput[];
  queryTemplate: string;
  // Setters
  setProjectName: (name: string) => void;
  setScript: (script: string) => void;
  setPayload: (payload: string) => void;
  setPayloadMimeType: (mime: MimeType) => void;
  setNodeLabel: (label: string) => void;
  setContext: (ctx: ContextState) => void;
  setNamedInputs: (inputs: NamedInput[]) => void;
  setQueryTemplate: (query: string) => void;
  // Workspace operations
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
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [payloadMimeType, setPayloadMimeType] = useState<MimeType>('application/json');
  const [nodeLabel, setNodeLabel] = useState('Transform');
  const [context, setContext] = useState<ContextState>(DEFAULT_CONTEXT);
  const [namedInputs, setNamedInputs] = useState<NamedInput[]>([]);
  const [queryTemplate, setQueryTemplate] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // Mark dirty on any change
  const wrapSetter = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (val: T) => {
      setter(val);
      setIsDirty(true);
    };
  };

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
      },
      context,
    };

    const path = await invoke<string>('save_workspace', { workspace });
    setIsDirty(false);
    const filename = path.split(/[/\\]/).pop() || '';
    setCurrentFile(filename);
    return path;
  }, [projectName, script, payload, payloadMimeType, nodeLabel, namedInputs, queryTemplate, context]);

  const loadWorkspace = useCallback(async (filename: string) => {
    const ws = await invoke<WorkspaceFile>('load_workspace', { filename });
    setProjectName(ws.projectName);
    setScript(ws.singleTransform.script);
    setPayload(ws.singleTransform.payload);
    setPayloadMimeType(ws.singleTransform.payloadMimeType as MimeType);
    setNodeLabel(ws.singleTransform.nodeLabel);
    setNamedInputs(ws.singleTransform.namedInputs || []);
    setQueryTemplate(ws.singleTransform.queryTemplate || '');
    setContext(ws.context);
    setCurrentFile(filename);
    setIsDirty(false);
  }, []);

  const listWorkspaces = useCallback(async () => {
    return invoke<string[]>('list_workspaces');
  }, []);

  const deleteWorkspace = useCallback(async (filename: string) => {
    await invoke('delete_workspace', { filename });
    if (currentFile === filename) {
      setCurrentFile(null);
    }
  }, [currentFile]);

  const newWorkspace = useCallback(() => {
    setProjectName('Untitled');
    setScript(DEFAULT_SCRIPT);
    setPayload(DEFAULT_PAYLOAD);
    setPayloadMimeType('application/json');
    setNodeLabel('Transform');
    setNamedInputs([]);
    setQueryTemplate('');
    setContext(DEFAULT_CONTEXT);
    setCurrentFile(null);
    setIsDirty(false);
  }, []);

  return {
    projectName,
    script,
    payload,
    payloadMimeType,
    nodeLabel,
    context,
    namedInputs,
    queryTemplate,
    setProjectName: wrapSetter(setProjectName),
    setScript: wrapSetter(setScript),
    setPayload: wrapSetter(setPayload),
    setPayloadMimeType: wrapSetter(setPayloadMimeType),
    setNodeLabel: wrapSetter(setNodeLabel),
    setContext: wrapSetter(setContext),
    setNamedInputs: wrapSetter(setNamedInputs),
    setQueryTemplate: wrapSetter(setQueryTemplate),
    saveWorkspace,
    loadWorkspace,
    listWorkspaces,
    deleteWorkspace,
    newWorkspace,
    isDirty,
    currentFile,
  };
}
