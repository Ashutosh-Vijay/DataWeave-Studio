import { describe, it, expect } from 'vitest';
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

// Three shapes the Pet Store spec doesn't exercise: a component carrying its own
// `example:`, a multipart upload, and a webhook body that has named examples but
// no schema at all.
const OPENAPI_EXTRAS = `
openapi: 3.0.0
info:
  title: Parcel Tracker
  version: 2.0.0
servers:
  - url: https://parcels.example.com/api
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    Shipment:
      type: object
      properties:
        trackingId: { type: string }
        service: { type: string }
      example:
        trackingId: PKG-0001
        service: EXPRESS
    Address:
      type: object
      properties:
        city: { type: string }
paths:
  /shipments:
    post:
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Shipment'
      responses:
        '201':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Shipment'
  /labels/upload:
    post:
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                trackingId: { type: string }
                file:
                  type: string
                  format: binary
      responses:
        '200':
          description: OK
  /events:
    post:
      requestBody:
        content:
          application/json:
            examples:
              PICKED_UP:
                value: { event: PICKED_UP, trackingId: PKG-0001 }
              IN_TRANSIT:
                value: { event: IN_TRANSIT, hops: [HUB-1, HUB-2] }
              DELIVERED:
                value: { event: DELIVERED, signedBy: A. Recipient }
      responses:
        '200':
          description: OK
`;

describe('OpenApiReader edge shapes', () => {
  const doc = parseSpecText(OPENAPI_EXTRAS);
  const spec = buildSpec(doc);

  it('parses the catalog and resolves security on every operation', () => {
    expect(spec.specKind).toBe('OpenAPI 3.0.0');
    expect(spec.servers).toEqual(['https://parcels.example.com/api']);
    expect(spec.schemas.map((s) => s.name)).toEqual(['Shipment', 'Address']);
    expect(spec.ops.every((o) => Array.isArray(o.security))).toBe(true);
  });

  it('uses a schema\'s own `example:` block instead of a synthesized one', () => {
    const sample = sampleFromSchema({ $ref: '#/components/schemas/Shipment' }, doc, 0, new Set());
    expect(sample).toEqual({ trackingId: 'PKG-0001', service: 'EXPRESS' });
  });

  it('generates a sample for every reusable type without throwing', () => {
    for (const s of spec.schemas) {
      expect(() => JSON.stringify(sampleFromSchema(s.schema, doc, 0, new Set()))).not.toThrow();
    }
  });

  it('keeps a multipart/form-data request body as multipart (not forced to JSON)', () => {
    const upload = spec.ops.find((o) => o.path === '/labels/upload')!;
    expect(upload.schemas.find((s) => s.label === 'Request')!.mime).toBe('multipart/form-data');
  });

  it('surfaces ALL named examples on a body with no schema, not just the first', () => {
    const events = spec.ops.find((o) => o.path === '/events')!;
    const req = events.schemas.find((s) => s.label === 'Request')!;
    expect(req.schema).toBeUndefined();
    expect(req.examples.map((e) => e.name)).toEqual(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']);
    expect(req.examples.find((e) => e.name === 'IN_TRANSIT')!.value.hops).toEqual(['HUB-1', 'HUB-2']);
  });
});
