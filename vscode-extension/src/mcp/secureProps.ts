/**
 * MuleSoft secure-properties encrypt/decrypt for the standalone MCP process.
 *
 * The extension host has its own copy (extension.ts securePropertiesInvoke), but
 * the MCP server runs as a SEPARATE Node process with no `vscode` and no access
 * to that function — so this is a self-contained port that shells the bundled
 * secure-properties-tool.jar with the extension's JRE. Output is byte-compatible
 * with what the Mule runtime decrypts.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveJava } from '../dwHost';

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'];
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'];

function resolveSecurePropsJar(extensionRoot: string): string {
  const candidates = [
    path.join(extensionRoot, 'resources', 'secure-properties', 'secure-properties-tool.jar'),
    path.join(extensionRoot, '..', 'src-tauri', 'resources', 'secure-properties', 'secure-properties-tool.jar'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`secure-properties-tool.jar not found. Looked in:\n${candidates.join('\n')}`);
}

export function securePropertiesInvoke(
  extensionRoot: string,
  operation: string,
  algorithm: string,
  mode: string,
  key: string,
  value: string,
  useRandomIv: boolean,
): Promise<string> {
  if (operation !== 'encrypt' && operation !== 'decrypt') {
    return Promise.reject(new Error(`Invalid operation '${operation}', expected 'encrypt' or 'decrypt'.`));
  }
  if (!ALGORITHMS.includes(algorithm)) return Promise.reject(new Error(`Invalid algorithm '${algorithm}'.`));
  if (!MODES.includes(mode)) return Promise.reject(new Error(`Invalid mode '${mode}'.`));
  if (!key) return Promise.reject(new Error('Key is required.'));
  if (!value) return Promise.reject(new Error('Value is required.'));

  const jar = resolveSecurePropsJar(extensionRoot);
  const java = resolveJava(extensionRoot);
  const cmdArgs = [
    '-cp', jar,
    'com.mulesoft.tools.SecurePropertiesTool',
    'string', operation, algorithm, mode, key, value,
  ];
  if (useRandomIv) cmdArgs.push('--use-random-iv');

  return new Promise<string>((resolve, reject) => {
    execFile(java, cmdArgs, { windowsHide: true }, (err, stdout, stderr) => {
      const out = (stdout || '').trim();
      const errOut = (stderr || '').trim();
      if (err) return reject(new Error(errOut || (err as Error).message));
      if (out.startsWith('Invalid arguments') || out.includes('Usage:')) {
        return reject(new Error(`secure-properties-tool rejected the inputs.\n${out}`));
      }
      resolve(out);
    });
  });
}
