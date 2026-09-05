/**
 * Realistic sample data, generated from the types your script already declares.
 *
 * The engine ships a generator nothing in the DataWeave ecosystem exposes: it
 * walks a resolved type and emits field-appropriate values, so `email` gets a
 * plausible address, `phone` a formatted number, `creditCard` a valid-looking
 * PAN and a `DateTime` a real timestamp — not `"string"` placeholders.
 *
 * Two steps, because the engine hands back a whole runnable script whose output
 * IS the sample rather than the sample itself:
 *
 *   1. `dw_tooling` kind=sampleData  -> a `%dw 2.0 / output <mime> / --- / …` script
 *   2. `run_dataweave` on that script -> the data
 *
 * Resolving a NAMED type needs a trick. `typeOf(start, end)` over a `type Foo =`
 * declaration returns nothing — it wants an expression, not a declaration. So we
 * keep the script's header (its directives and declarations), give it a body of
 * `null as Foo`, and ask for the type of that. The engine then reports `Foo`.
 */
import { invoke } from './bridge';

/** The engine's DocumentSymbol kind for a `type` declaration. */
const SYMBOL_KIND_TYPE = 11;

interface EngineSymbol {
  name: string;
  kind: number;
  location?: { startIndex?: number; endIndex?: number; startLine?: number };
}

interface RunResult {
  output: string;
  error: string | null;
}

/** Every `type X = …` the script declares, in source order. */
export async function listDeclaredTypes(script: string): Promise<string[]> {
  try {
    const res = await invoke<{ symbols?: EngineSymbol[] }>('dw_tooling', {
      kind: 'documentSymbol',
      script,
      offset: 0,
      payload: '',
      languageLevel: '',
    });
    const names = (res?.symbols ?? [])
      .filter((s) => s.kind === SYMBOL_KIND_TYPE && s.name)
      .map((s) => s.name);
    return Array.from(new Set(names));
  } catch {
    return []; // engine cold or the script doesn't parse — offer the output shape instead
  }
}

/**
 * The script's declarations with the body replaced by `null as <typeName>`, so
 * the engine resolves that named type as the mapping's type.
 *
 * Splits on the first line that is only dashes, which is what the `---` body
 * separator is; a `---` inside a string literal is never alone on its line.
 */
function probeForType(script: string, typeName: string): string {
  const lines = script.split(/\r?\n/);
  const sep = lines.findIndex((l) => /^-{3,}\s*$/.test(l.trim()));
  const declarations = sep >= 0 ? lines.slice(0, sep).join('\n') : script;
  return `${declarations}\n---\nnull as ${typeName}`;
}

export interface SampleResult {
  /** The generated data, rendered in the requested MIME type. */
  data: string;
  /** The type it was generated from, as the engine names it. */
  type: string;
}

/**
 * Generate sample data. `typeName` null means "the script's own output shape".
 *
 * Throws with a readable message rather than returning a half-result — the
 * caller shows it verbatim, so it has to make sense to a person.
 */
export async function generateSample(
  script: string,
  typeName: string | null,
  mimeType: string,
  repeat = 1,
): Promise<SampleResult> {
  const target = typeName ? probeForType(script, typeName) : script;

  const gen = await invoke<{ script?: string | null; type?: string }>('dw_tooling', {
    kind: 'sampleData',
    script: target,
    offset: 0,
    payload: '',
    languageLevel: '',
    mimeType,
    repeat,
  });

  if (!gen?.script) {
    throw new Error(
      typeName
        ? `Nothing to generate for ${typeName} — it resolves to a type with no fields.`
        : 'Nothing to generate — this script has no output shape the engine can fill in yet.',
    );
  }

  const run = await invoke<RunResult>('run_dataweave', {
    script: gen.script,
    payload: '{}',
    payloadMimeType: 'application/json',
    attributesJson: '{}',
    varsJson: '{}',
    namedInputsJson: '[]',
    payloadFilePath: null,
    classpath: [],
    timeoutMs: 15000,
    multipartPartsJson: null,
    modulesJson: null,
    // Sample data is scaffolding, not the user's transform: generate against the
    // full engine so an older target can't make the generator itself fail.
    languageLevel: null,
  });

  if (run.error) throw new Error(run.error.split('\n')[0]);
  return { data: run.output, type: gen.type || typeName || 'output' };
}
