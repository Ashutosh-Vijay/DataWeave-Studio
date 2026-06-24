import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseSpecText, buildSpec, sampleFromSchema, buildDwScript } from '../components/OpenApiReader';

const OPENAPI_3 = `
openapi: 3.0.1
info:
  title: Pet Store
  version: 1.2.0
servers:
  - url: https://api.example.com/v1
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
    noauthAuth:
      type: http
      scheme: noauth
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        status:
          type: string
          enum: [available, pending, sold]
        tags:
          type: array
          items:
            type: string
paths:
  /login:
    post:
      tags: [auth]
      security:
        - noauthAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                user: { type: string }
            example:
              user: admin
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  token: { type: string }
  /pets:
    get:
      tags: [pets]
      summary: List pets
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
    post:
      tags: [pets]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Pet'
      responses:
        '201':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
`;

const SWAGGER_2 = `
swagger: "2.0"
info:
  title: Legacy API
  version: 0.9.0
produces: [application/json]
consumes: [application/json]
definitions:
  User:
    type: object
    properties:
      userId: { type: integer }
      email: { type: string, format: email }
paths:
  /users:
    post:
      tags: [users]
      parameters:
        - in: body
          name: body
          schema:
            $ref: '#/definitions/User'
      responses:
        '200':
          schema:
            $ref: '#/definitions/User'
`;

describe('OpenApiReader spec parsing', () => {
  it('parses an OpenAPI 3.x spec into operations with request + response schemas', () => {
    const doc = parseSpecText(OPENAPI_3);
    const spec = buildSpec(doc);
    expect(spec.title).toBe('Pet Store');
    expect(spec.specKind).toBe('OpenAPI 3.0.1');
    expect(spec.servers).toEqual(['https://api.example.com/v1']);
    expect(spec.ops).toHaveLength(3);

    const post = spec.ops.find((o) => o.method === 'POST' && o.path === '/pets')!;
    expect(post.schemas.map((s) => s.label)).toContain('Request');
    expect(post.schemas.map((s) => s.label)).toContain('201');
  });

  it('captures the reusable schema catalog (types)', () => {
    const spec = buildSpec(parseSpecText(OPENAPI_3));
    expect(spec.schemas.map((s) => s.name)).toContain('Pet');
  });

  it('resolves effective security: global bearer, per-op override', () => {
    const spec = buildSpec(parseSpecText(OPENAPI_3));
    const login = spec.ops.find((o) => o.path === '/login')!;
    const getPets = spec.ops.find((o) => o.method === 'GET' && o.path === '/pets')!;
    expect(login.security).toEqual(['noauthAuth']); // operation override
    expect(getPets.security).toEqual(['bearerAuth']); // inherited global
    expect(spec.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('captures a media-type / schema example as a selectable named example', () => {
    const spec = buildSpec(parseSpecText(OPENAPI_3));
    const login = spec.ops.find((o) => o.path === '/login')!;
    const req = login.schemas.find((s) => s.label === 'Request')!;
    expect(req.examples).toHaveLength(1);
    expect(req.examples[0].value).toEqual({ user: 'admin' });
  });

  it('parses a Swagger 2.0 body parameter as the request schema', () => {
    const doc = parseSpecText(SWAGGER_2);
    const spec = buildSpec(doc);
    expect(spec.specKind).toBe('Swagger 2.0');
    const post = spec.ops[0];
    const req = post.schemas.find((s) => s.label === 'Request')!;
    expect(req).toBeTruthy();
    expect(req.mime).toBe('application/json');
  });

  it('rejects a non-spec document', () => {
    expect(() => buildSpec({ hello: 'world' })).toThrow();
  });

  it('generates a sample payload that resolves $refs, enums, and arrays', () => {
    const doc = parseSpecText(OPENAPI_3);
    const spec = buildSpec(doc);
    const get = spec.ops.find((o) => o.method === 'GET')!;
    const respSchema = get.schemas.find((s) => s.label === '200')!;
    const sample = sampleFromSchema(respSchema.schema, doc, 0, new Set());

    expect(Array.isArray(sample)).toBe(true);
    const pet = sample[0];
    expect(pet).toMatchObject({ id: 0, name: 'string', status: 'available' });
    expect(pet.tags).toEqual(['string']);
  });

  it('uses string formats for realistic primitives', () => {
    const doc = parseSpecText(SWAGGER_2);
    const sample = sampleFromSchema({ $ref: '#/definitions/User' }, doc, 0, new Set());
    expect(sample.email).toBe('user@example.com');
    expect(sample.userId).toBe(0);
  });

  it('builds a multipart skeleton (parts + octet-stream) for multipart bodies', () => {
    const dw = buildDwScript({ trackingId: 'T1', file1: '' }, 'multipart/form-data');
    expect(dw).toContain('output multipart/form-data');
    expect(dw).toContain('parts:');
    expect(dw).toContain('content: payload.trackingId');
    // binary (empty-string) field gets an octet-stream content type
    expect(dw).toContain('application/octet-stream');
  });

  it('builds form-urlencoded and xml/json outputs from the content type', () => {
    expect(buildDwScript({ a: 1 }, 'application/x-www-form-urlencoded')).toContain('output application/x-www-form-urlencoded');
    expect(buildDwScript({ a: 1 }, 'application/xml')).toContain('output application/xml');
    expect(buildDwScript({ a: 1 }, 'application/json')).toContain('output application/json');
  });
});

// Real-world spec: the Orchestrator(FIU TSP) 3.1 file the user pointed at.
// Skipped automatically if the example isn't present (it's a local sample).
const REAL_SPEC = 'example/Orch-TSP - 3.1.1.yaml';
describe.runIf(existsSync(REAL_SPEC))('real Orchestrator spec', () => {
  const spec = buildSpec(parseSpecText(readFileSync(REAL_SPEC, 'utf8')));

  it('parses every operation and the full schema catalog', () => {
    expect(spec.title).toContain('Orchestrator');
    expect(spec.specKind).toBe('OpenAPI 3.0.0');
    expect(spec.servers).toEqual(['https://flex-uat.crif.com/orchestrator']);
    expect(spec.ops.length).toBeGreaterThan(20);
    // 4 reusable component schemas; the rest are inline per-operation.
    expect(spec.schemas.map((s) => s.name)).toEqual(['BureauRequest', 'InquiryDataValue', 'RequestIdValue', 'InquiryResponseValue']);
    // every op should carry a resolved security label (global bearer or override)
    expect(spec.ops.every((o) => Array.isArray(o.security))).toBe(true);
  });

  it('uses the rich `example:` block on BureauRequest instead of a synthesized one', () => {
    const doc = parseSpecText(readFileSync(REAL_SPEC, 'utf8'));
    const sample = sampleFromSchema({ $ref: '#/components/schemas/BureauRequest' }, doc, 0, new Set());
    expect(sample.trackingId).toBe('external_bureau_inquiry_data_01');
    expect(sample.serviceType).toBe('INQUIRY_DATA');
  });

  it('generates a sample for every reusable type without throwing', () => {
    const doc = parseSpecText(readFileSync(REAL_SPEC, 'utf8'));
    for (const s of spec.schemas) {
      expect(() => JSON.stringify(sampleFromSchema(s.schema, doc, 0, new Set()))).not.toThrow();
    }
  });

  it('keeps a multipart/form-data request body as multipart (not forced to JSON)', () => {
    const pdf = spec.ops.find((o) => o.path === '/fiu-ws/pdf-analytics/initiate')!;
    expect(pdf).toBeTruthy();
    const req = pdf.schemas.find((s) => s.label === 'Request')!;
    expect(req.mime).toBe('multipart/form-data');
  });

  it('surfaces ALL named webhook examples (no schema), not just the first', () => {
    const notify = spec.ops.find((o) => o.path === '/notification')!;
    expect(notify).toBeTruthy();
    const req = notify.schemas.find((s) => s.label === 'Request')!;
    // examples-only body: no schema, but every named scenario is captured.
    expect(req.schema).toBeUndefined();
    expect(req.examples.length).toBeGreaterThanOrEqual(6);
    const names = req.examples.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['CONSENT', 'DATA', 'ANALYTICS', 'REDIRECTION']));
    // each carries its own distinct value
    const consent = req.examples.find((e) => e.name === 'CONSENT')!;
    expect(consent.value.notificationType).toBe('CONSENT');
    const data = req.examples.find((e) => e.name === 'DATA')!;
    expect(data.value.notificationType).toBe('DATA');
    expect(Array.isArray(data.value.accounts)).toBe(true);
  });
});
