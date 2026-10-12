/**
 * DataWeave Academy, Chapter 0: the source of the nine "Start here" lessons.
 *
 * Nothing here ships until `npm run academy:verify` has run every example and
 * every check through the bundled engine (scripts/academy/verify-chapter0.mjs),
 * which then writes src/academy/chapter0.json for the app. Same rule as Practice:
 * a snippet the engine has not run is not allowed to teach anyone.
 *
 * Prose conventions: `code` for anything typed; *word* for a term being
 * introduced (the app shows its definition from `terms` on hover).
 * No em dashes. Plain words. Every term explained the first time it appears.
 */

// The running example: an online shop's order, used from 0.1 to 0.8.
const ORDER = {
  orderId: 'SO-1001',
  placedAt: '2026-10-02T11:24:07Z',
  total: 159,
  currency: 'EUR',
  customer: {
    firstName: 'Maria',
    lastName: 'Rossi',
    email: 'maria@example.com',
    address: { city: 'Milan', country: 'IT' },
  },
  lines: [
    { sku: 'MUG-01', name: 'Coffee mug', qty: 2, price: 12.5 },
    { sku: 'LAMP-07', name: 'Desk lamp', qty: 1, price: 89 },
    { sku: 'BOOK-3', name: 'Notebook', qty: 3, price: 15 },
  ],
};
// A second order, so a check cannot be passed by typing the first order's answer.
const ORDER_2 = {
  orderId: 'SO-1002',
  placedAt: '2026-10-03T08:02:51Z',
  total: 42,
  currency: 'EUR',
  customer: {
    firstName: 'Kenji',
    lastName: 'Sato',
    email: 'kenji@example.com',
    address: { city: 'Osaka', country: 'JP' },
  },
  lines: [{ sku: 'PEN-12', name: 'Fountain pen', qty: 1, price: 42 }],
};
const ORDER_EMPTY = { ...ORDER_2, orderId: 'SO-1003', total: 0, lines: [] };
const j = (v) => JSON.stringify(v, null, 2);

// What the warehouse wants (0.2 onwards).
const WAREHOUSE = {
  ref: 'SO-1001',
  shipTo: { name: 'Maria Rossi', city: 'Milan', country: 'IT' },
  items: [
    { sku: 'MUG-01', quantity: 2 },
    { sku: 'LAMP-07', quantity: 1 },
    { sku: 'BOOK-3', quantity: 3 },
  ],
};

const FULL_MAPPING = `%dw 2.0
output application/json
---
{
  ref: payload.orderId,
  shipTo: {
    name: payload.customer.firstName ++ " " ++ payload.customer.lastName,
    city: payload.customer.address.city,
    country: payload.customer.address.country
  },
  items: payload.lines map (line) -> {
    sku: line.sku,
    quantity: line.qty
  }
}`;

export const terms = {
  payload: 'The data a message carries: the body of a request or an event. In a DataWeave script it is called payload.',
  JSON: 'A common way to write data as text: objects in { }, lists in [ ], text in quotes, numbers and true/false as they are.',
  field: 'A named value inside an object, like "city": "Milan". The name is the key, the part after the colon is the value.',
  mapping: 'The rules that turn data in one shape into the same data in another shape.',
  source: 'The data you start from. Here, the shop\'s order.',
  target: 'The shape you need to produce. Here, what the warehouse expects.',
  DataWeave: 'The language MuleSoft uses to write mappings. It runs inside Mule apps.',
  'Mule app': 'An integration built with MuleSoft: it receives messages, works on them, and sends them on.',
  selector: 'A dot followed by a field name, like .city. It picks that field out of the data.',
  null: 'DataWeave\'s word for "nothing here". A missing field gives null.',
  map: 'Runs the same small piece of script once for every item in a list, and collects the results into a new list.',
  XML: 'Another way to write data as text, with tags like <city>Milan</city>. Common in older and enterprise systems.',
  CSV: 'Comma-separated values: a table written as text, one row per line. What spreadsheets export.',
  attributes: 'Details that come with a request but are not its body: headers, query parameters, the method.',
  vars: 'Values a Mule app saved earlier in the same flow, so later steps can read them.',
  webhook: 'A message one system sends another, on its own, to say that something just happened.',
  property: 'A setting kept outside the script, in a config file, so it can differ between test and production.',
};

export const lessons = [
  // ───────────────────────────────────────────────────────────── 0.1
  {
    id: '0.1',
    title: 'Systems talk in messages',
    minutes: 4,
    body: [
      { p: 'Your company runs many apps: an online shop, a warehouse system, a billing tool. They don\'t share a brain. When the shop takes an order, it has to *tell* the warehouse, and it does that by sending a message.' },
      { p: 'The useful part of a message is its *payload*: the data itself. On the right is the payload the shop sends for one order.' },
      { p: 'It is written in *JSON*, the most common way to write data as text. Four things to know:' },
      { list: [
        '`{ }` holds an object: a set of named values. Each one is a *field*: a name in quotes, a colon, then the value.',
        '`[ ]` holds a list. `lines` is a list of three items, one per product.',
        'Text is in quotes, like `"Milan"`. Numbers are not, like `159`.',
        'Values can hold more values. `customer` is an object with an `address` inside it.',
      ] },
      { p: 'To find something, follow the names from the outside in: the order, then `customer`, then `address`, then `city`.' },
    ],
    interactive: {
      kind: 'json-explorer',
      label: 'Click any value in the order. The path to it lights up.',
      payload: j(ORDER),
    },
    check: {
      kind: 'choice',
      question: 'Where is the customer\'s city?',
      options: [
        { text: 'order → city', correct: false, why: 'The order has no city of its own. Look inside the customer.' },
        { text: 'order → customer → address → city', correct: true, why: 'Right. Follow the names from the outside in.' },
        { text: 'order → lines → city', correct: false, why: '`lines` holds the products, not where they go.' },
      ],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.2
  {
    id: '0.2',
    title: 'What mapping means',
    minutes: 5,
    body: [
      { p: 'The warehouse needs the same order, but it was built by a different team, years ago, and it wants the data in its own shape.' },
      { p: 'Compare the two. The shop calls the order number `orderId`; the warehouse calls it `ref`. The shop splits the name in two; the warehouse wants one `name`. The warehouse doesn\'t care about prices or the email at all.' },
      { p: 'Turning one shape into the other is called *mapping*. You start from the *source* (the shop\'s order) and build the *target* (what the warehouse wants). Every mapping is made of a few kinds of rule:' },
      { list: [
        '**Rename:** `orderId` becomes `ref`.',
        '**Move:** `city` sits inside `customer.address` in the source, and inside `shipTo` in the target.',
        '**Combine:** `firstName` and `lastName` become one `name`.',
        '**Leave out:** `email`, `price` and `total` are not sent.',
      ] },
      { p: 'Most integration work is exactly this, over and over. Before writing any code, try it by hand.' },
    ],
    interactive: {
      kind: 'mapper',
      label: 'Click each target field to see which source fields fill it.',
      source: j(ORDER),
      target: j(WAREHOUSE),
      links: [
        { to: 'ref', from: ['orderId'] },
        { to: 'shipTo.name', from: ['customer.firstName', 'customer.lastName'] },
        { to: 'shipTo.city', from: ['customer.address.city'] },
        { to: 'shipTo.country', from: ['customer.address.country'] },
        { to: 'items[].sku', from: ['lines[].sku'] },
        { to: 'items[].quantity', from: ['lines[].qty'] },
      ],
    },
    check: {
      kind: 'choice',
      question: 'The warehouse\'s `name` needs two source fields joined. Which two?',
      options: [
        { text: '`firstName` and `email`', correct: false, why: 'The email is left out of the target completely.' },
        { text: '`firstName` and `lastName`', correct: true, why: 'Right: "Maria" and "Rossi" become "Maria Rossi".' },
        { text: '`orderId` and `lastName`', correct: false, why: '`orderId` goes to `ref` on its own.' },
      ],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.3
  {
    id: '0.3',
    title: 'Meet DataWeave',
    minutes: 5,
    body: [
      { p: '*DataWeave* is the language MuleSoft uses to write mapping rules. It runs inside a *Mule app*: the integration that sits between the shop and the warehouse.' },
      { diagram: 'flow', steps: ['Shop sends the order', 'Transform Message (your DataWeave script)', 'Warehouse receives its shape'] },
      { p: 'The step in the middle is where your script runs. Every message that passes through gets the same rules applied.' },
      { p: 'On the right is the whole mapping from the last lesson, written as a script. It has three parts:' },
      { list: [
        '**The header**, above the line: `%dw 2.0` says which DataWeave version, and `output application/json` says the result should be JSON.',
        '**The separator:** three dashes, `---`.',
        '**The body**, below it: a picture of the result you want, with the values filled in from `payload`.',
      ] },
      { p: 'You don\'t need to understand every line yet. The next three lessons take it apart piece by piece. For now, edit something in the body, say change `"ref"` to `"orderNumber"`, and watch the output follow.' },
    ],
    examples: [
      { label: 'The mapping from 0.2', script: FULL_MAPPING, payload: j(ORDER), output: j(WAREHOUSE) },
    ],
    interactive: { kind: 'editor', example: 0 },
    check: {
      kind: 'choice',
      question: 'Which part of the script decides that the result is JSON?',
      options: [
        { text: '`%dw 2.0`', correct: false, why: 'That line says which version of DataWeave the script is written in.' },
        { text: '`output application/json`', correct: true, why: 'Right. Change it to `application/xml` and the same data comes out as XML (lesson 0.7).' },
        { text: '`---`', correct: false, why: 'The dashes only separate the header from the body.' },
      ],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.4
  {
    id: '0.4',
    title: 'Reaching into the payload',
    minutes: 5,
    body: [
      { p: 'In a script, the incoming data is always called `payload`. To point at something inside it, write a dot and the field\'s name: a *selector*.' },
      { p: '`payload.customer` is the whole customer object. Keep adding dots to go deeper: `payload.customer.address.city` is `"Milan"`.' },
      { p: 'A selector on a list reaches into every item at once: `payload.lines.sku` gives the three SKUs as a list.' },
      { callout: 'A missing field is not an error', text: 'This order has no `discount`. Asking for `payload.discount` gives *null*, DataWeave\'s word for "nothing here". When you want a fallback instead, add `default`: `payload.discount default 0` gives `0`.' },
      { p: 'A field name with a dash or a space goes in quotes after the dot, like `payload."order-id"`.' },
    ],
    examples: [
      { label: 'One field', script: '%dw 2.0\noutput application/json\n---\npayload.customer.address.city', payload: j(ORDER), output: '"Milan"' },
      { label: 'Into every item of a list', script: '%dw 2.0\noutput application/json\n---\npayload.lines.sku', payload: j(ORDER), output: j(['MUG-01', 'LAMP-07', 'BOOK-3']) },
      { label: 'A missing field', script: '%dw 2.0\noutput application/json\n---\npayload.discount', payload: j(ORDER), output: 'null' },
      { label: 'A fallback with default', script: '%dw 2.0\noutput application/json\n---\npayload.discount default 0', payload: j(ORDER), output: '0' },
      { label: 'A name with a dash', script: '%dw 2.0\noutput application/json\n---\npayload."order-id"', payload: '{ "order-id": "SO-1001" }', output: '"SO-1001"' },
    ],
    interactive: { kind: 'editor', example: 0, editableLine: 4, chips: ['payload.customer', 'payload.customer.address.city', 'payload.lines.sku', 'payload.discount', 'payload.discount default 0'] },
    check: {
      kind: 'build',
      prompt: 'Return the order\'s total.',
      starter: '%dw 2.0\noutput application/json\n---\npayload',
      solution: '%dw 2.0\noutput application/json\n---\npayload.total',
      cases: [
        { input: j(ORDER), output: '159' },
        { input: j(ORDER_2), output: '42' },
      ],
      hints: ['The total sits at the top level of the order, next to `orderId`.', 'One dot is enough: `payload.` and the field\'s name.'],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.5
  {
    id: '0.5',
    title: 'Building the shape you need',
    minutes: 6,
    body: [
      { p: 'The body of a script is a picture of the result. To build an object, write `{ }` and list its fields as `name: value`, separated by commas.' },
      { p: 'The name on the left is whatever the target wants. The value on the right can be a selector, so renaming is just this: `ref: payload.orderId`.' },
      { p: 'A value can also be fixed text in quotes, like `source: "web-shop"`, the same on every message.' },
      { p: 'To join text, use `++`. `payload.customer.firstName ++ " " ++ payload.customer.lastName` gives `"Maria Rossi"`; the `" "` in the middle is the space between the two names.' },
      { p: 'Numbers work with `+`, `-`, `*` and `/`, as on a calculator: `payload.total * 2` is `318`.' },
      { p: 'Objects can hold objects. Build `shipTo` by nesting another `{ }` inside, exactly as in the target.' },
    ],
    examples: [
      { label: 'Rename and add a fixed value', script: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId,\n  source: "web-shop"\n}', payload: j(ORDER), output: j({ ref: 'SO-1001', source: 'web-shop' }) },
      { label: 'Join text with ++', script: '%dw 2.0\noutput application/json\n---\npayload.customer.firstName ++ " " ++ payload.customer.lastName', payload: j(ORDER), output: '"Maria Rossi"' },
      { label: 'Arithmetic', script: '%dw 2.0\noutput application/json\n---\npayload.total * 2', payload: j(ORDER), output: '318' },
      { label: 'An object inside an object', script: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId,\n  shipTo: {\n    city: payload.customer.address.city\n  }\n}', payload: j(ORDER), output: j({ ref: 'SO-1001', shipTo: { city: 'Milan' } }) },
    ],
    interactive: { kind: 'editor', example: 0 },
    check: {
      kind: 'build',
      prompt: 'Build the warehouse\'s order header: `{ ref, customerName, country }`, where `customerName` is the first and last name with a space between them.',
      starter: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId\n}',
      solution: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId,\n  customerName: payload.customer.firstName ++ " " ++ payload.customer.lastName,\n  country: payload.customer.address.country\n}',
      cases: [
        { input: j(ORDER), output: j({ ref: 'SO-1001', customerName: 'Maria Rossi', country: 'IT' }) },
        { input: j(ORDER_2), output: j({ ref: 'SO-1002', customerName: 'Kenji Sato', country: 'JP' }) },
      ],
      hints: ['Add two more `name: value` lines, separated by commas.', 'For the name: `payload.customer.firstName ++ " " ++ payload.customer.lastName`.'],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.6
  {
    id: '0.6',
    title: 'Lists: doing it for every item',
    minutes: 6,
    body: [
      { p: 'An order has a list of lines, and the warehouse wants a list of items. You don\'t write a rule per line, since the next order might have one line or fifty. You describe what to do with *one* line, and `map` does it for every line.' },
      { code: 'payload.lines map (line) -> {\n  sku: line.sku,\n  quantity: line.qty\n}' },
      { p: 'Read it as: "take `payload.lines`, and for each `line`, build this". `line` is a name you choose for the current item; inside the braces, `line.sku` is that item\'s SKU. The result is a new list with one entry per line.' },
      { p: 'There is a short form. Without the `(line) ->` part, the current item is called `$`: `payload.lines map { sku: $.sku }`. Both mean the same. The long form reads better while you are learning.' },
      { callout: 'An empty list is fine', text: 'If an order has no lines, `map` gives an empty list, `[]`. Nothing breaks.' },
    ],
    examples: [
      { label: 'A picking list', script: '%dw 2.0\noutput application/json\n---\npayload.lines map (line) -> {\n  sku: line.sku,\n  quantity: line.qty\n}', payload: j(ORDER), output: j(WAREHOUSE.items) },
      { label: 'The short form with $', script: '%dw 2.0\noutput application/json\n---\npayload.lines map { sku: $.sku }', payload: j(ORDER), output: j([{ sku: 'MUG-01' }, { sku: 'LAMP-07' }, { sku: 'BOOK-3' }]) },
      { label: 'Working something out per item', script: '%dw 2.0\noutput application/json\n---\npayload.lines map (line) -> {\n  sku: line.sku,\n  lineTotal: line.qty * line.price\n}', payload: j(ORDER), output: j([{ sku: 'MUG-01', lineTotal: 25 }, { sku: 'LAMP-07', lineTotal: 89 }, { sku: 'BOOK-3', lineTotal: 45 }]) },
      { label: 'No lines at all', script: '%dw 2.0\noutput application/json\n---\npayload.lines map (line) -> {\n  sku: line.sku\n}', payload: j(ORDER_EMPTY), output: '[]' },
    ],
    interactive: { kind: 'editor', example: 0 },
    check: {
      kind: 'build',
      prompt: 'Return the picking list: one `{ sku, quantity, product }` per line, where `product` is the line\'s `name`.',
      starter: '%dw 2.0\noutput application/json\n---\npayload.lines',
      solution: '%dw 2.0\noutput application/json\n---\npayload.lines map (line) -> {\n  sku: line.sku,\n  quantity: line.qty,\n  product: line.name\n}',
      cases: [
        { input: j(ORDER), output: j(ORDER.lines.map((l) => ({ sku: l.sku, quantity: l.qty, product: l.name }))) },
        { input: j(ORDER_2), output: j([{ sku: 'PEN-12', quantity: 1, product: 'Fountain pen' }]) },
        { input: j(ORDER_EMPTY), output: '[]' },
      ],
      hints: ['Start with `payload.lines map (line) -> { }`.', 'Inside the braces, three fields: `sku: line.sku`, then `quantity` and `product` the same way.'],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.7
  {
    id: '0.7',
    title: 'Same data, different formats',
    minutes: 6,
    body: [
      { p: 'JSON is not the only way to write data down. Older and enterprise systems often use *XML*, with tags around each value. Spreadsheets and file drops use *CSV*: a table, one row per line, values separated by commas.' },
      { p: 'DataWeave reads all of them into the same thing, so the body of your script hardly changes. What changes is one line in the header: `output application/xml` or `output application/csv`.' },
      { p: 'Two rules come with the formats:' },
      { list: [
        '**XML needs exactly one outer element**, called the root. Wrap your result in one: `{ order: { ... } }`.',
        '**CSV is a table**, so its result must be a list of flat objects: one object per row, one field per column.',
      ] },
      { p: 'It works the other way too. When the *input* is XML, select into it with the tag names, root first: for `<order><ref>SO-1001</ref></order>`, the value is `payload.order.ref`.' },
    ],
    examples: [
      { label: 'The header as XML', script: '%dw 2.0\noutput application/xml\n---\n{\n  order: {\n    ref: payload.orderId,\n    city: payload.customer.address.city\n  }\n}', payload: j(ORDER), outputMime: 'application/xml', compare: 'text',
        output: '<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n<order>\n  <ref>SO-1001</ref>\n  <city>Milan</city>\n</order>' },
      { label: 'The picking list as CSV', script: '%dw 2.0\noutput application/csv\n---\npayload.lines map (line) -> {\n  sku: line.sku,\n  quantity: line.qty\n}', payload: j(ORDER), outputMime: 'application/csv', compare: 'text',
        output: 'sku,quantity\nMUG-01,2\nLAMP-07,1\nBOOK-3,3' },
      { label: 'Reading XML input', script: '%dw 2.0\noutput application/json\n---\npayload.order.ref', payload: '<order><ref>SO-1001</ref><city>Milan</city></order>', payloadMime: 'application/xml', output: '"SO-1001"' },
      { label: 'XML without a single root fails', script: '%dw 2.0\noutput application/xml\n---\n{\n  ref: payload.orderId,\n  city: payload.customer.address.city\n}', payload: j(ORDER), outputMime: 'application/xml', fails: true },
    ],
    interactive: { kind: 'format-switch', example: 1, formats: ['application/json', 'application/xml', 'application/csv'] },
    check: {
      kind: 'build',
      prompt: 'The warehouse\'s file drop wants the picking list as CSV, with the columns `sku` and `quantity`.',
      starter: '%dw 2.0\noutput application/json\n---\npayload.lines map (line) -> {\n  sku: line.sku,\n  quantity: line.qty\n}',
      solution: '%dw 2.0\noutput application/csv\n---\npayload.lines map (line) -> {\n  sku: line.sku,\n  quantity: line.qty\n}',
      compare: 'text',
      outputMime: 'application/csv',
      cases: [
        { input: j(ORDER), output: 'sku,quantity\nMUG-01,2\nLAMP-07,1\nBOOK-3,3' },
        { input: j(ORDER_2), output: 'sku,quantity\nPEN-12,1' },
      ],
      hints: ['The body is already right. Only one line needs to change.', 'Look at the `output` line in the header.'],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.8
  {
    id: '0.8',
    title: 'Where data comes from in Mule',
    minutes: 6,
    body: [
      { p: 'In a real Mule app, a script can read more than the payload. Three things come up all the time:' },
      { list: [
        '`attributes`: details that arrive with a request but are not its body, such as headers and query parameters. `attributes.headers."x-source"` reads a header called x-source.',
        '`vars`: values the Mule app saved earlier in the same flow. If an earlier step stored a correlation id, `vars.correlationId` reads it.',
        '`p(\'name\')`: a *property*, a setting kept in a config file instead of the script, so test and production can use different values. `p(\'warehouse.code\')` reads it.',
      ] },
      { p: 'In DataWeave Studio, all three live in the **Context** panel under the payload: Request for attributes, Vars for vars, and Config for properties. Set them there and your script sees them exactly as it would inside Mule.' },
      { callout: 'Why this matters', text: 'The online Playground only has the payload. Anything that reads a header, a var or a property is where DataWeave Studio earns its keep.' },
    ],
    examples: [
      { label: 'A header', script: '%dw 2.0\noutput application/json\n---\nattributes.headers."x-source"', payload: j(ORDER), attributes: j({ headers: { 'x-source': 'web-shop' } }), output: '"web-shop"' },
      { label: 'A value saved earlier in the flow', script: '%dw 2.0\noutput application/json\n---\nvars.correlationId', payload: j(ORDER), vars: j({ correlationId: 'c-7f3a' }), output: '"c-7f3a"' },
      { label: 'A property from the Config tab', script: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId,\n  warehouse: p(\'warehouse.code\')\n}', payload: j(ORDER), config: { 'warehouse.code': 'WH-MXP' }, output: j({ ref: 'SO-1001', warehouse: 'WH-MXP' }) },
    ],
    interactive: { kind: 'context', example: 0, focus: 'Request', label: 'Change the x-source header in the Context panel and run again.' },
    check: {
      kind: 'build',
      prompt: 'Return `{ ref, channel }`, where `channel` comes from the request\'s `x-source` header.',
      starter: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId\n}',
      solution: '%dw 2.0\noutput application/json\n---\n{\n  ref: payload.orderId,\n  channel: attributes.headers."x-source"\n}',
      cases: [
        { input: j(ORDER), attributes: j({ headers: { 'x-source': 'web-shop' } }), output: j({ ref: 'SO-1001', channel: 'web-shop' }) },
        { input: j(ORDER_2), attributes: j({ headers: { 'x-source': 'mobile-app' } }), output: j({ ref: 'SO-1002', channel: 'mobile-app' }) },
      ],
      hints: ['Headers live under `attributes.headers`.', 'The name has a dash, so it goes in quotes: `."x-source"`.'],
    },
  },

  // ───────────────────────────────────────────────────────────── 0.9
  {
    id: '0.9',
    title: 'Your first real transform',
    minutes: 8,
    body: [
      { p: 'Time to put it together on a message you haven\'t seen. When a customer pays, the payment provider sends the shop a *webhook*: a message announcing that something happened. Here is one.' },
      { p: 'The shop wants it in this shape:' },
      { shape: '{\n  orderId,   // the order the payment is for\n  paidBy,    // the payer\'s name\n  amount,    // in euros: the webhook sends cents, so divide by 100\n  method,    // how they paid, or "unknown" when the webhook doesn\'t say\n  skus       // the list of SKUs that were paid for\n}' },
      { p: 'Everything you need is in this chapter: selectors, renaming, arithmetic, `default`, and either `map` or a selector on a list. Your script is checked against three different webhooks, so it has to follow the rules rather than the values.' },
      { p: 'When it passes, you have written a real integration mapping. Part 1 starts from here, one topic at a time.' },
    ],
    payloadLabel: 'The payment provider\'s webhook',
    interactive: { kind: 'editor', fromCheck: true },
    check: {
      kind: 'build',
      prompt: 'Turn the payment webhook into `{ orderId, paidBy, amount, method, skus }`.',
      starter: '%dw 2.0\noutput application/json\n---\n{\n  orderId: payload.data.orderRef\n}',
      solution: '%dw 2.0\noutput application/json\n---\n{\n  orderId: payload.data.orderRef,\n  paidBy: payload.data.payer.name,\n  amount: payload.data.amountCents / 100,\n  method: payload.data.method default "unknown",\n  skus: payload.data.items.sku\n}',
      cases: [
        {
          input: j({ id: 'evt_9001', type: 'payment.succeeded', data: { orderRef: 'SO-1001', amountCents: 15900, payer: { name: 'Maria Rossi' }, method: 'card', items: [{ sku: 'MUG-01', qty: 2 }, { sku: 'LAMP-07', qty: 1 }, { sku: 'BOOK-3', qty: 3 }] } }),
          output: j({ orderId: 'SO-1001', paidBy: 'Maria Rossi', amount: 159, method: 'card', skus: ['MUG-01', 'LAMP-07', 'BOOK-3'] }),
        },
        {
          input: j({ id: 'evt_9002', type: 'payment.succeeded', data: { orderRef: 'SO-1002', amountCents: 4250, payer: { name: 'Kenji Sato' }, items: [{ sku: 'PEN-12', qty: 1 }] } }),
          output: j({ orderId: 'SO-1002', paidBy: 'Kenji Sato', amount: 42.5, method: 'unknown', skus: ['PEN-12'] }),
        },
        {
          input: j({ id: 'evt_9003', type: 'payment.succeeded', data: { orderRef: 'SO-1004', amountCents: 999, payer: { name: 'Ana Lima' }, method: 'paypal', items: [{ sku: 'CARD-1', qty: 4 }, { sku: 'CARD-2', qty: 1 }] } }),
          output: j({ orderId: 'SO-1004', paidBy: 'Ana Lima', amount: 9.99, method: 'paypal', skus: ['CARD-1', 'CARD-2'] }),
        },
      ],
      // Wrong answers the checks must reject, so they can't be passed by luck.
      mustFail: [
        '%dw 2.0\noutput application/json\n---\n{\n  orderId: payload.data.orderRef,\n  paidBy: payload.data.payer.name,\n  amount: payload.data.amountCents,\n  method: payload.data.method default "unknown",\n  skus: payload.data.items.sku\n}',
        '%dw 2.0\noutput application/json\n---\n{\n  orderId: payload.data.orderRef,\n  paidBy: payload.data.payer.name,\n  amount: payload.data.amountCents / 100,\n  method: payload.data.method,\n  skus: payload.data.items.sku\n}',
      ],
      hints: ['Everything lives under `payload.data`.', 'Cents to euros: divide by 100.', 'For the method: `payload.data.method default "unknown"`.', 'For the SKUs, a selector on the list works: `payload.data.items.sku`.'],
      finish: 'You\'re ready for Part 1. Start with unit 1, Select and shape.',
    },
  },
];
