/**
 * Sample Mule `error` objects for the Context panel's Error tab, so an
 * on-error script (error.description, error.errorType.identifier,
 * error.errorMessage.attributes.statusCode, ...) can be run without a Mule app.
 *
 * The shape follows MuleSoft's "Mule Errors" page: description,
 * detailedDescription, errorType (namespace, identifier, parentErrorType up to
 * MULE:ANY), cause, errorMessage (payload + attributes, only when the connector
 * had a response to report) and childErrors.
 */

type ErrorTypeJson = { namespace: string; identifier: string; parentErrorType: ErrorTypeJson | null };

// Parents per MuleSoft's error hierarchy. Anything not listed hangs off MULE:ANY.
const PARENTS: Record<string, string> = {
  'MULE:ANY': '',
  'MULE:SECURITY': 'MULE:ANY',
  'MULE:CLIENT_SECURITY': 'MULE:SECURITY',
  'MULE:SERVER_SECURITY': 'MULE:SECURITY',
  'MULE:CONNECTIVITY': 'MULE:ANY',
  'MULE:RETRY_EXHAUSTED': 'MULE:ANY',
  'MULE:ROUTING': 'MULE:ANY',
  'MULE:COMPOSITE_ROUTING': 'MULE:ROUTING',
  'MULE:VALIDATION': 'MULE:ANY',
  'MULE:TIMEOUT': 'MULE:ANY',
  'HTTP:UNAUTHORIZED': 'MULE:CLIENT_SECURITY',
  'HTTP:FORBIDDEN': 'MULE:CLIENT_SECURITY',
  'HTTP:CONNECTIVITY': 'MULE:CONNECTIVITY',
  'HTTP:TIMEOUT': 'MULE:TIMEOUT',
  'HTTP:RETRY_EXHAUSTED': 'MULE:RETRY_EXHAUSTED',
  'DB:CONNECTIVITY': 'MULE:CONNECTIVITY',
  'VALIDATION:INVALID_EMAIL': 'MULE:VALIDATION',
  'VALIDATION:NULL': 'MULE:VALIDATION',
  'VALIDATION:BLANK_STRING': 'MULE:VALIDATION',
};

function errorType(full: string): ErrorTypeJson {
  const [namespace, identifier] = full.split(':');
  const parent = PARENTS[full] ?? 'MULE:ANY';
  return { namespace, identifier, parentErrorType: parent ? errorType(parent) : null };
}

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;

const HOSTS = ['customers-sapi.internal', 'orders-api.cloudhub.io', 'inventory-sys.example.com', 'localhost'];
const RESOURCES = ['customers', 'orders', 'accounts', 'invoices', 'shipments', 'products'];
const FLOWS = ['get-customer-flow', 'create-order-flow', 'sync-accounts-flow', 'process-invoice-subflow'];

function httpUrl() {
  const host = pick(HOSTS);
  const port = host === 'localhost' ? pick([8081, 8082]) : pick([80, 443]);
  const id = pick([`${int(1000, 99999)}`, `C-${int(100, 999)}`, uuid()]);
  return `${port === 443 ? 'https' : 'http'}://${host}:${port}/api/v1/${pick(RESOURCES)}/${id}`;
}

function failingComponent() {
  const flow = pick(FLOWS);
  return `${flow}/processors/${int(0, 6)} @ ${flow.replace(/-(sub)?flow$/, '')}:${flow.replace(/-(sub)?flow$/, '')}.xml:${int(12, 140)}`;
}

function httpResponseAttributes(statusCode: number, reasonPhrase: string) {
  return {
    statusCode,
    reasonPhrase,
    headers: {
      date: new Date(Date.now() - int(0, 86_400_000)).toUTCString(),
      'content-type': 'application/json; charset=utf-8',
      'x-correlation-id': uuid(),
    },
  };
}

const HTTP_STATUS: Record<string, [number, string]> = {
  BAD_REQUEST: [400, 'Bad Request'],
  UNAUTHORIZED: [401, 'Unauthorized'],
  FORBIDDEN: [403, 'Forbidden'],
  NOT_FOUND: [404, 'Not Found'],
  METHOD_NOT_ALLOWED: [405, 'Method Not Allowed'],
  TOO_MANY_REQUESTS: [429, 'Too Many Requests'],
  INTERNAL_SERVER_ERROR: [500, 'Internal Server Error'],
  BAD_GATEWAY: [502, 'Bad Gateway'],
  SERVICE_UNAVAILABLE: [503, 'Service Unavailable'],
};

const BODIES: Record<number, () => unknown> = {
  400: () => ({ code: 'INVALID_REQUEST', message: pick(['email is required', 'amount must be a positive number', "Unknown field 'custId'"]) }),
  401: () => ({ error: 'invalid_token', error_description: 'The access token expired' }),
  403: () => ({ error: 'forbidden', message: 'Client is not allowed to call this resource' }),
  404: () => ({ code: 'NOT_FOUND', message: `${pick(['Customer', 'Order', 'Account'])} ${int(1000, 99999)} not found` }),
  405: () => ({ message: 'Method not allowed' }),
  429: () => ({ error: 'rate_limited', retryAfterSeconds: int(5, 60) }),
  500: () => ({ error: 'Internal Server Error', traceId: hex(16) }),
  502: () => ({ message: 'Upstream system did not respond correctly' }),
  503: () => ({ message: 'Service temporarily unavailable, try again later' }),
};

function base(type: string, description: string, extra: Record<string, unknown> = {}) {
  return {
    description,
    detailedDescription: description,
    errorType: errorType(type),
    cause: { message: description },
    failingComponent: failingComponent(),
    errorMessage: null as unknown,
    childErrors: [] as unknown[],
    ...extra,
  };
}

function httpStatusError(identifier: string) {
  const [code, reason] = HTTP_STATUS[identifier];
  const method = code === 405 ? 'DELETE' : pick(['GET', 'GET', 'POST', 'PUT']);
  const description = `HTTP ${method} on resource '${httpUrl()}' failed: ${reason.toLowerCase()} (${code}).`;
  return base(`HTTP:${identifier}`, description, {
    errorMessage: { payload: BODIES[code](), attributes: httpResponseAttributes(code, reason) },
  });
}

/** Every error type the picker offers, with its generator. */
export const MULE_ERRORS: { type: string; label: string; make: () => unknown }[] = [
  ...Object.keys(HTTP_STATUS).map((id) => ({
    type: `HTTP:${id}`,
    label: `HTTP:${id} (${HTTP_STATUS[id][0]})`,
    make: () => httpStatusError(id),
  })),
  {
    type: 'HTTP:CONNECTIVITY', label: 'HTTP:CONNECTIVITY',
    make: () => base('HTTP:CONNECTIVITY', `HTTP ${pick(['GET', 'POST'])} on resource '${httpUrl()}' failed: ${pick(['Connection refused', 'Remotely closed', 'UnknownHostException'])}.`),
  },
  {
    type: 'HTTP:TIMEOUT', label: 'HTTP:TIMEOUT',
    make: () => base('HTTP:TIMEOUT', `HTTP ${pick(['GET', 'POST'])} on resource '${httpUrl()}' failed: Timeout exceeded (${pick([10000, 30000, 60000])} ms).`),
  },
  {
    type: 'APIKIT:BAD_REQUEST', label: 'APIKIT:BAD_REQUEST',
    make: () => base('APIKIT:BAD_REQUEST', pick([
      'Error validating JSON. Error: - Missing required field "email"',
      'Invalid value \'abc\' for query parameter limit. Expected type integer',
      'Required header \'client_id\' not specified',
    ])),
  },
  {
    type: 'APIKIT:NOT_FOUND', label: 'APIKIT:NOT_FOUND',
    make: () => base('APIKIT:NOT_FOUND', `/api/v1/${pick(RESOURCES)}x/${int(1, 999)}`),
  },
  {
    type: 'APIKIT:METHOD_NOT_ALLOWED', label: 'APIKIT:METHOD_NOT_ALLOWED',
    make: () => base('APIKIT:METHOD_NOT_ALLOWED', `HTTP Method ${pick(['patch', 'delete'])} not allowed for : /${pick(RESOURCES)}/{id}`),
  },
  {
    type: 'DB:BAD_SQL_SYNTAX', label: 'DB:BAD_SQL_SYNTAX',
    make: () => base('DB:BAD_SQL_SYNTAX', `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'FORM ${pick(RESOURCES)} WHERE id = ${int(1, 999)}' at line 1`),
  },
  {
    type: 'DB:CONNECTIVITY', label: 'DB:CONNECTIVITY',
    make: () => base('DB:CONNECTIVITY', pick([
      'Communications link failure. The last packet sent successfully to the server was 0 milliseconds ago.',
      'Could not obtain connection from data source',
    ])),
  },
  {
    type: 'MULE:EXPRESSION', label: 'MULE:EXPRESSION',
    make: () => {
      const field = pick(['name', 'customerId', 'amount', 'email']);
      return base('MULE:EXPRESSION', `"Cannot coerce Null (null) to String\n\nTrace:\n  at main (line: 1, column: 1)" evaluating expression: "payload.${field} as String".`);
    },
  },
  {
    type: 'VALIDATION:INVALID_EMAIL', label: 'VALIDATION:INVALID_EMAIL',
    make: () => base('VALIDATION:INVALID_EMAIL', `${pick(['jane.doe@', 'john@example', 'not-an-email'])} is not a valid email address`),
  },
  {
    type: 'MULE:RETRY_EXHAUSTED', label: 'MULE:RETRY_EXHAUSTED',
    make: () => base('MULE:RETRY_EXHAUSTED', `'until-successful' retries exhausted. Last exception message was: Connection refused`),
  },
  {
    type: 'MULE:COMPOSITE_ROUTING', label: 'MULE:COMPOSITE_ROUTING (Scatter-Gather)',
    make: () => {
      const children = [httpStatusError(pick(['NOT_FOUND', 'INTERNAL_SERVER_ERROR', 'SERVICE_UNAVAILABLE'])), MULE_ERRORS.find((e) => e.type === 'HTTP:TIMEOUT')!.make()];
      const lines = children.map((c, i) => `\tRoute ${i}: ${(c as { description: string }).description}`).join('\n');
      return base('MULE:COMPOSITE_ROUTING', `Exception(s) were found for route(s): \n${lines}`, { childErrors: children });
    },
  },
  {
    type: 'APP:CUSTOM', label: 'APP:… (raise-error)',
    make: () => {
      const [id, description] = pick([
        ['CUSTOMER_NOT_FOUND', `No customer found for id ${int(1000, 99999)}`],
        ['ORDER_REJECTED', `Order ${int(10000, 99999)} was rejected by the warehouse`],
        ['DUPLICATE_REQUEST', `A request with correlation id ${uuid()} was already processed`],
        ['INVALID_STATE', `Invoice ${int(10000, 99999)} is already closed`],
      ]);
      return base(`APP:${id}`, description);
    },
  },
];

/** A fresh sample for `type`, or for a random type when `type` is empty. */
export function generateMuleError(type: string): string {
  const entry = MULE_ERRORS.find((e) => e.type === type) ?? pick(MULE_ERRORS);
  return JSON.stringify(entry.make(), null, 2);
}
