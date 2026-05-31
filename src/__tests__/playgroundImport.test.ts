import { describe, it, expect } from 'vitest';
import { exportPlaygroundZip } from '../playgroundImport';
import { unzipSync, strFromU8 } from 'fflate';
import { ContextState, NamedInput } from '../types';

describe('playgroundImport', () => {
  describe('exportPlaygroundZip', () => {
    it('should generate a valid Playground export zip with the correct Maven structure and formats', async () => {
      const mockContext: ContextState = {
        method: 'POST',
        queryParams: [
          { key: 'page', value: '1', enabled: true },
          { key: 'ignored', value: 'yes', enabled: false },
        ],
        headers: [
          { key: 'Authorization', value: 'Bearer xyz', enabled: true },
        ],
        vars: [
          { key: 'env', value: 'dev', valueType: 'string', enabled: true },
          { key: 'config', value: '{"timeout": 30}', valueType: 'json', enabled: true },
          { key: 'disabledVar', value: 'off', valueType: 'string', enabled: false },
        ],
        configYaml: '',
        secureConfigYaml: '',
      };

      const mockNamedInputs: NamedInput[] = [
        {
          name: 'extra_input',
          content: '<xml/>',
          mimeType: 'application/xml',
        },
      ];

      const exportInput = {
        projectName: 'my-custom-flow',
        script: '%dw 2.0\noutput application/json\n---\npayload',
        payload: '{"id": 456}',
        payloadMimeType: 'application/json' as const,
        context: mockContext,
        namedInputs: mockNamedInputs,
      };

      // Export to a ZIP Blob
      const zipBlob = exportPlaygroundZip(exportInput);
      expect(zipBlob).toBeDefined();
      expect(zipBlob.type).toBe('application/zip');

      // Unpack the zip using fflate to verify internal layout and content
      const buffer = await zipBlob.arrayBuffer();
      const zipBytes = new Uint8Array(buffer);
      const files = unzipSync(zipBytes);

      const pathPrefix = 'my-custom-flow';
      const inputsBase = `${pathPrefix}/src/test/resources/${pathPrefix}/Playground/inputs`;

      // 1. Verify POM template substitution
      const pomPath = `${pathPrefix}/pom.xml`;
      expect(files[pomPath]).toBeDefined();
      const pomContent = strFromU8(files[pomPath]);
      expect(pomContent).toContain('<artifactId>my-custom-flow</artifactId>');
      expect(pomContent).toContain('<name>my-custom-flow-project</name>');

      // 2. Verify script injection
      const scriptPath = `${pathPrefix}/src/main/dw/${pathPrefix}.dwl`;
      expect(files[scriptPath]).toBeDefined();
      expect(strFromU8(files[scriptPath])).toBe(exportInput.script);

      // 3. Verify payload
      const payloadPath = `${inputsBase}/payload.json`;
      expect(files[payloadPath]).toBeDefined();
      expect(strFromU8(files[payloadPath])).toBe(exportInput.payload);

      // 4. Verify variables json serialization (vars.json)
      const varsPath = `${inputsBase}/vars.json`;
      expect(files[varsPath]).toBeDefined();
      const varsObj = JSON.parse(strFromU8(files[varsPath]));
      expect(varsObj.env).toBe('dev');
      expect(varsObj.config).toEqual({ timeout: 30 }); // parsed JSON
      expect(varsObj.disabledVar).toBeUndefined(); // disabled

      // 5. Verify request attributes JSON (attributes.json)
      const attrsPath = `${inputsBase}/attributes.json`;
      expect(files[attrsPath]).toBeDefined();
      const attrsObj = JSON.parse(strFromU8(files[attrsPath]));
      expect(attrsObj.method).toBe('POST');
      expect(attrsObj.queryParams).toEqual({ page: '1' });
      expect(attrsObj.headers).toEqual({ Authorization: 'Bearer xyz' });

      // 6. Verify named inputs
      const namedInputPath = `${inputsBase}/extra_input.xml`;
      expect(files[namedInputPath]).toBeDefined();
      expect(strFromU8(files[namedInputPath])).toBe('<xml/>');
    });

    it('should skip vars.json and attributes.json if they only contain default or disabled values', async () => {
      const defaultContext: ContextState = {
        method: 'GET',
        queryParams: [],
        headers: [],
        vars: [],
        configYaml: '',
        secureConfigYaml: '',
      };

      const exportInput = {
        projectName: 'minimal-project',
        script: 'payload',
        payload: 'test',
        payloadMimeType: 'text/plain' as const,
        context: defaultContext,
        namedInputs: [],
      };

      const zipBlob = exportPlaygroundZip(exportInput);
      const buffer = await zipBlob.arrayBuffer();
      const files = unzipSync(new Uint8Array(buffer));

      const pathPrefix = 'minimal-project';
      const inputsBase = `${pathPrefix}/src/test/resources/${pathPrefix}/Playground/inputs`;

      // Main files should still be present
      expect(files[`${pathPrefix}/pom.xml`]).toBeDefined();
      expect(files[`${pathPrefix}/src/main/dw/${pathPrefix}.dwl`]).toBeDefined();
      expect(files[`${inputsBase}/payload.txt`]).toBeDefined();

      // Context and vars should be omitted since they are empty/default
      expect(files[`${inputsBase}/vars.json`]).toBeUndefined();
      expect(files[`${inputsBase}/attributes.json`]).toBeUndefined();
    });
  });
});
