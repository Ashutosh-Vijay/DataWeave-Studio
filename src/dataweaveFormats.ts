// AUTO-GENERATED from mulesoft/docs-dataweave@v2.11 (c3076b2). Do not edit by hand.
// Re-run: npm run docs:refresh
//
// Reader/writer configuration properties per data format — what may follow a
// MIME type on an `output`/`input` directive. Upstream is BSD-3-Clause; see
// licenses/ for attribution.

export interface FormatProperty {
  name: string;
  /** 'Boolean' | 'Number' | 'String' | a DW type name. */
  type: string;
  /** Documented default, as written in the docs (may be empty). */
  default: string;
  description: string;
  /** Enum values, when the docs spell out "Valid values are ...". */
  values?: string[];
}

export interface FormatDoc {
  /** Docs page id, e.g. 'json'. */
  id: string;
  mime: string;
  reader: FormatProperty[];
  writer: FormatProperty[];
}

/** Keyed by the MIME string the app uses (see MimeType in types/index.ts). */
export const DW_FORMATS: Record<string, FormatDoc> = {
  "application/json": {
    "id": "json",
    "mime": "application/json",
    "reader": [
      {
        "name": "streaming",
        "type": "Boolean",
        "default": "false",
        "description": "Streams input when set to true. Use only if entries are accessed sequentially. The input must be a top-level array. See the streaming example, and see DataWeave Readers. Valid values are true or false."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "duplicateKeyAsArray",
        "type": "Boolean",
        "default": "false",
        "description": "Converts the values of duplicate keys in an object to a single array of values to the duplicated key. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "'UTF-8'",
        "description": "The encoding to use for the output, such as UTF-8."
      },
      {
        "name": "indent",
        "type": "Boolean",
        "default": "true",
        "description": "Write indented output for better readability by default, or compress output into a single line when set to false. Valid values are true or false."
      },
      {
        "name": "skipNullOn",
        "type": "String",
        "default": "null",
        "description": "Skips null values in the specified data structure. By default, DataWeave does not skip the values. * arrays + Ignore and omit null values inside arrays from the JSON output, for example, with output application/json skipNullOn=\"arrays\". * objects + Ignore key-value pairs that have null as the value, for example, with output application/json skipNullOn=\"objects\". * everywhere + Apply skipNullOn to arrays and objects, for example, output application/json skipNullOn=\"everywhere\". Valid values are arrays or objects or everywhere.",
        "values": [
          "arrays",
          "objects",
          "everywhere"
        ]
      },
      {
        "name": "writeAttributes",
        "type": "Boolean",
        "default": "false",
        "description": "Converts attributes of a key into child key-value pairs of that key. The attribute key name starts with @. Valid values are true or false."
      }
    ]
  },
  "application/xml": {
    "id": "xml",
    "mime": "application/xml",
    "reader": [
      {
        "name": "collectionPath",
        "type": "String",
        "default": "null",
        "description": "Sets the path to the location in the document where the collection is located. Accepts a path expression that identifies the location of the elements to stream."
      },
      {
        "name": "externalEntities",
        "type": "Boolean",
        "default": "false",
        "description": "Indicates whether to process external entities. Disabled by default to avoid XML External Entity (XXE) attacks. Valid values are true or false."
      },
      {
        "name": "indexedReader",
        "type": "Boolean",
        "default": "true",
        "description": "Uses the indexed reader by default when reaching the threshold. Supports US-ASCII, UTF-8 and ISO-8859-1 encodings only. For other encodings, DataWeave uses the in-memory reader. Valid values are true or false."
      },
      {
        "name": "maxAttributeSize",
        "type": "Number",
        "default": "-1",
        "description": "Sets the maximum number of characters accepted in an XML attribute. _Available since Mule 4.2.1._"
      },
      {
        "name": "maxEntityCount",
        "type": "Number",
        "default": "1",
        "description": "Sets the maximum number of entity expansions. The limit helps avoid Billion Laughs attacks."
      },
      {
        "name": "nullValueOn",
        "type": "String",
        "default": "'blank'",
        "description": "Indicates whether to read an element with empty or blank text as a null value. Valid values are empty or none or blank.",
        "values": [
          "empty",
          "none",
          "blank"
        ]
      },
      {
        "name": "optimizeFor",
        "type": "String",
        "default": "'speed'",
        "description": "Configures the type of optimization for the XML parser to use. Valid values are speed or memory.",
        "values": [
          "speed",
          "memory"
        ]
      },
      {
        "name": "streaming",
        "type": "Boolean",
        "default": "false",
        "description": "Streams input when set to true. Use only if entries are accessed sequentially. The input must be a top-level array. See the streaming example, and see DataWeave Readers. Valid values are true or false."
      },
      {
        "name": "supportDtd",
        "type": "Boolean",
        "default": "false",
        "description": "Enable or disable DTD support. Disabling skips (and does not process) internal and external subsets. You can also enable this property by setting the Mule system property com.mulesoft.dw.xml.supportDTD. Note that the default for this property changed from true to false in Mule version 4.3.0-20210601, which includes the June 2021 patch of DataWeave version 2.3.0. Valid values are true or false."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "defaultNamespace",
        "type": "String",
        "default": "null",
        "description": "Specifies the default namespaces of the output XML."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "doubleQuoteInDeclaration",
        "type": "Boolean",
        "default": "false",
        "description": "Escapes double quotes in the XML declaration when set to true. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "null",
        "description": "The encoding to use for the output, such as UTF-8."
      },
      {
        "name": "escapeCR",
        "type": "Boolean",
        "default": "false",
        "description": "Escapes CR characters when set to true. Valid values are true or false."
      },
      {
        "name": "escapeGT",
        "type": "Boolean",
        "default": "false",
        "description": "Escapes '>' characters when set to true. Valid values are true or false."
      },
      {
        "name": "indent",
        "type": "Boolean",
        "default": "true",
        "description": "Write indented output for better readability by default, or compress output into a single line when set to false. Valid values are true or false."
      },
      {
        "name": "inlineCloseOn",
        "type": "String",
        "default": "'empty'",
        "description": "Write an inline close tag, or explicitly open and close tags when the value is null. Valid values are empty or none.",
        "values": [
          "empty",
          "none"
        ]
      },
      {
        "name": "onInvalidChar",
        "type": "String",
        "default": "null",
        "description": "Valid values are base64 or ignore or none.",
        "values": [
          "base64",
          "ignore",
          "none"
        ]
      },
      {
        "name": "skipNullOn",
        "type": "String",
        "default": "null",
        "description": "Skips null values in the specified data structure. By default, DataWeave does not skip the values. * elements + Ignore and omit null elements inside XML output, for example, with output application/xml skipNullOn=\"arrays\". * attributes + Ignore and omit null attributes inside XML, for example, with output application/xml skipNullOn=\"objects\". * everywhere + Apply skipNullOn to elements and attributes, for example, output application/xml skipNullOn=\"everywhere\". Valid values are elements or attributes or everywhere.",
        "values": [
          "elements",
          "attributes",
          "everywhere"
        ]
      },
      {
        "name": "writeDeclaration",
        "type": "Boolean",
        "default": "true",
        "description": "Writes the XML header declaration when set to true. Valid values are true or false."
      },
      {
        "name": "writeDeclaredNamespaces",
        "type": "String",
        "default": "null",
        "description": "Marks the namespaces to declare in the root element of the XML: * All: Write all declared namespaces in the root element. * ids:<comma separated namespace id>: Write only the specified namespaces. * regex:<regex>: Write only the matching namespaces."
      },
      {
        "name": "writeNilOnNull",
        "type": "Boolean",
        "default": "false",
        "description": "Writes the nil attribute for a null value when this property is set to true. Valid values are true or false."
      }
    ]
  },
  "application/csv": {
    "id": "csv",
    "mime": "application/csv",
    "reader": [
      {
        "name": "bodyStartLineNumber",
        "type": "Number",
        "default": "0",
        "description": "Line number on which the body starts."
      },
      {
        "name": "escape",
        "type": "String",
        "default": "\\",
        "description": "Character to use for escaping special characters, such as separators or quotes."
      },
      {
        "name": "header",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether a CSV header is present. * If header=true, you can access the fields within the input by name, for example, payload.userName. * If header=false, you must access the fields by index, referencing the entry first and the field next, for example, payload[107][2]. Valid values are true or false."
      },
      {
        "name": "headerLineNumber",
        "type": "Number",
        "default": "0",
        "description": "Line number on which the CSV header is located."
      },
      {
        "name": "ignoreEmptyLine",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether to ignore an empty line. Valid values are true or false."
      },
      {
        "name": "quote",
        "type": "String",
        "default": "\"",
        "description": "Character to use for quotes."
      },
      {
        "name": "separator",
        "type": "String",
        "default": ",",
        "description": "Character that separates one field from another field."
      },
      {
        "name": "streaming",
        "type": "Boolean",
        "default": "false",
        "description": "Streams input when set to true. Use only if entries are accessed sequentially. The input must be a top-level array. See the streaming example, and see DataWeave Readers. Valid values are true or false."
      }
    ],
    "writer": [
      {
        "name": "bodyStartLineNumber",
        "type": "Number",
        "default": "0",
        "description": "Line number on which the body starts."
      },
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "null",
        "description": "The encoding to use for the output, such as UTF-8."
      },
      {
        "name": "escape",
        "type": "String",
        "default": "\\",
        "description": "Character to use for escaping special characters, such as separators or quotes."
      },
      {
        "name": "header",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether a CSV header is present. * If header=true, you can access the fields within the input by name, for example, payload.userName. * If header=false, you must access the fields by index, referencing the entry first and the field next, for example, payload[107][2]. Valid values are true or false."
      },
      {
        "name": "headerLineNumber",
        "type": "Number",
        "default": "0",
        "description": "Line number on which the CSV header is located."
      },
      {
        "name": "ignoreEmptyLine",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether to ignore an empty line. Valid values are true or false."
      },
      {
        "name": "lineSeparator",
        "type": "String",
        "default": "New Line",
        "description": "Line separator to use when writing CSV, for example, \"\\r\\n\". By default, DataWeave uses the system line separator."
      },
      {
        "name": "quote",
        "type": "String",
        "default": "\"",
        "description": "Character to use for quotes."
      },
      {
        "name": "quoteHeader",
        "type": "Boolean",
        "default": "false",
        "description": "Quotes header values when set to true. Valid values are true or false."
      },
      {
        "name": "quoteValues",
        "type": "Boolean",
        "default": "false",
        "description": "Quotes every value when set to true, including values that contain special characters. Valid values are true or false."
      },
      {
        "name": "separator",
        "type": "String",
        "default": ",",
        "description": "Character that separates one field from another field."
      }
    ]
  },
  "application/yaml": {
    "id": "yaml",
    "mime": "application/yaml",
    "reader": [
      {
        "name": "maxEntityCount",
        "type": "Number",
        "default": "1",
        "description": "Sets the maximum number of entity expansions. The limit helps avoid Billion Laughs attacks."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "'UTF-8'",
        "description": "The encoding to use for the output, such as UTF-8."
      },
      {
        "name": "skipNullOn",
        "type": "String",
        "default": "null",
        "description": "Skips null values in the specified data structure. By default, DataWeave does not skip the values. * arrays + Ignore and omit null values inside arrays from the YAML output, for example, with output application/yaml skipNullOn=\"arrays\". * objects + Ignore key-value pairs that have null as the value, for example, with output application/yaml skipNullOn=\"objects\". * everywhere + Apply skipNullOn to arrays and objects, for example, output application/yaml skipNullOn=\"everywhere\". Valid values are arrays or objects or everywhere.",
        "values": [
          "arrays",
          "objects",
          "everywhere"
        ]
      },
      {
        "name": "writeDeclaration",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether to write the header declaration or not. Valid values are true or false."
      }
    ]
  },
  "application/x-ndjson": {
    "id": "ndjson",
    "mime": "application/x-ndjson",
    "reader": [
      {
        "name": "ignoreEmptyLine",
        "type": "Boolean",
        "default": "true",
        "description": "Ignores empty lines. Valid values are true or false."
      },
      {
        "name": "skipInvalid",
        "type": "Boolean",
        "default": "false",
        "description": "Skips invalid records and ignores values that aren't valid in this format. Valid values are true or false."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "'UTF-8'",
        "description": "Encoding that the writer uses for output. Defaults to \"UTF-8\"."
      },
      {
        "name": "skipNullOn",
        "type": "String",
        "default": "null",
        "description": "Skips null values. By default, DataWeave does not skip. * arrays + Ignore and omit null values inside arrays from the JSON output, for example, with output application/x-ndjson skipNullOn=\"arrays\". * objects + Ignore key-value pairs that have null as the value, for example, with output application/x-ndjson skipNullOn=\"objects\". * everywhere + Apply skipNullOn to arrays and objects, for example, output application/x-ndjson skipNullOn=\"everywhere\". Valid values are arrays or objects or everywhere.",
        "values": [
          "arrays",
          "objects",
          "everywhere"
        ]
      },
      {
        "name": "writeAttributes",
        "type": "Boolean",
        "default": "false",
        "description": "Converts attributes of a key into child key-value pairs of that key. The attribute key name starts with @. Valid values are true or false."
      }
    ]
  },
  "text/plain": {
    "id": "text",
    "mime": "text/plain",
    "reader": [],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "null",
        "description": "The encoding to use for the output, such as UTF-8."
      }
    ]
  },
  "application/x-www-form-urlencoded": {
    "id": "urlencoded",
    "mime": "application/x-www-form-urlencoded",
    "reader": [],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "null",
        "description": "The encoding to use for the output, such as UTF-8."
      }
    ]
  },
  "multipart/form-data": {
    "id": "multipart",
    "mime": "multipart/form-data",
    "reader": [
      {
        "name": "boundary",
        "type": "String",
        "default": "null",
        "description": "The multipart boundary value, a string to delimit parts."
      },
      {
        "name": "defaultContentType",
        "type": "String",
        "default": "'application/octet-stream'",
        "description": "Sets the default Content-Type to use on parts of the multipart/* format. When set, this property takes precedence over the setting for the xref:dataweave-system-properties.adoc[system property] com.mulesoft.dw.multipart.defaultContentType. _Introduced in DataWeave 2.3 (2.3.0-20210720) for the August 2021 release of Mule 4.3.0-20210719._"
      }
    ],
    "writer": [
      {
        "name": "boundary",
        "type": "String",
        "default": "null",
        "description": "The multipart boundary value, a string to delimit parts."
      },
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      }
    ]
  },
  "application/java": {
    "id": "java",
    "mime": "application/java",
    "reader": [],
    "writer": [
      {
        "name": "duplicateKeyAsArray",
        "type": "Boolean",
        "default": "false",
        "description": "Converts the values of duplicate keys in an object to a single array of values to the duplicated key. Valid values are true or false."
      },
      {
        "name": "writeAttributes",
        "type": "Boolean",
        "default": "false",
        "description": "Converts attributes of a key into child key-value pairs of that key. The attribute key name starts with @. Valid values are true or false."
      }
    ]
  },
  "application/dw": {
    "id": "dw",
    "mime": "application/dw",
    "reader": [
      {
        "name": "externalResources",
        "type": "Boolean",
        "default": "false",
        "description": "Enables the readUrl to read external entities. Valid values are true or false."
      },
      {
        "name": "javaModule",
        "type": "Boolean",
        "default": "false",
        "description": "Enables Java module functions to load. Valid values are true or false."
      },
      {
        "name": "onlyData",
        "type": "Boolean",
        "default": "false",
        "description": "Handles only data and not other types of content, such as functions, when set to true. The DataWeave parser runs faster in the onlyData mode. Valid values are true or false."
      },
      {
        "name": "privileges",
        "type": "String",
        "default": "''",
        "description": "Accepts a comma-separated list of privileges to use in the format, such as 'Resources,Properties'."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "ignoreSchema",
        "type": "Boolean",
        "default": "false",
        "description": "Ignores the schema when set to true. Valid values are true or false."
      },
      {
        "name": "indent",
        "type": "String",
        "default": "' '",
        "description": "String to use for indenting."
      },
      {
        "name": "maxCollectionSize",
        "type": "Number",
        "default": "-1",
        "description": "Maximum number of elements allowed in an array or an object. -1 indicates no limitation."
      },
      {
        "name": "onlyData",
        "type": "Boolean",
        "default": "true",
        "description": "Handles only data and not other types of content, such as functions, when set to true. The DataWeave parser runs faster in the onlyData mode. Valid values are true or false."
      }
    ]
  },
  "application/octet-stream": {
    "id": "binary",
    "mime": "application/octet-stream",
    "reader": [],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      }
    ]
  },
  "text/x-java-properties": {
    "id": "properties",
    "mime": "text/x-java-properties",
    "reader": [],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "null",
        "description": "The encoding to use for the output, such as UTF-8."
      }
    ]
  },
  "application/xlsx": {
    "id": "excel",
    "mime": "application/xlsx",
    "reader": [
      {
        "name": "header",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether the first line of the output contains header field names. Valid values are true or false."
      },
      {
        "name": "ignoreEmptyLine",
        "type": "Boolean",
        "default": "true",
        "description": "Ignores an empty line by default. Valid values are true or false."
      },
      {
        "name": "maxEntrySize",
        "type": "Number",
        "default": "null",
        "description": "Sets the maximum number of bytes a single entry in a ZIP file can have."
      },
      {
        "name": "minInflateRatio",
        "type": "Number",
        "default": "null",
        "description": "Sets the ratio between de- and inflated bytes to detect zip bomb. For example, if you set the value to 1 percent (= 0.01d) when the compression is better than 1 percent for any given read package part, the parsing fails to indicate a zip bomb."
      },
      {
        "name": "streaming",
        "type": "Boolean",
        "default": "false",
        "description": "Streams input when set to true. Use only if entries are accessed sequentially. The input must be a top-level array. See the streaming example, and see DataWeave Readers. Valid values are true or false."
      },
      {
        "name": "tableLimit",
        "type": "String",
        "default": "'Unbounded'",
        "description": "Position of the last column in each row. Accepts a pattern <Column> (for example, 'A' or 'AB'), the value 'HeaderSize', which uses the location of the last header, or 'Unbounded', which consumes each row."
      },
      {
        "name": "tableOffset",
        "type": "String",
        "default": "null",
        "description": "Sets the position of the first cell. Accepts the pattern <Column><Row>, for example, A1 or B3."
      },
      {
        "name": "zipBombCheck",
        "type": "Boolean",
        "default": "true",
        "description": "Turns off the zip bomb (decompression bomb) check when set to false. Valid values are true or false."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "header",
        "type": "Boolean",
        "default": "true",
        "description": "Indicates whether the first line of the output contains header field names. Valid values are true or false."
      },
      {
        "name": "ignoreEmptyLine",
        "type": "Boolean",
        "default": "true",
        "description": "Ignores an empty line by default. Valid values are true or false."
      },
      {
        "name": "maxEntrySize",
        "type": "Number",
        "default": "null",
        "description": "Sets the maximum number of bytes a single entry in a ZIP file can have."
      },
      {
        "name": "minInflateRatio",
        "type": "Number",
        "default": "null",
        "description": "Sets the ratio between de- and inflated bytes to detect zip bomb. For example, if you set the value to 1 percent (= 0.01d) when the compression is better than 1 percent for any given read package part, the parsing fails to indicate a zip bomb."
      },
      {
        "name": "tableOffset",
        "type": "String",
        "default": "null",
        "description": "Sets the position of the first cell. Accepts the pattern <Column><Row>, for example, A1 or B3."
      },
      {
        "name": "zipBombCheck",
        "type": "Boolean",
        "default": "true",
        "description": "Turns off the zip bomb (decompression bomb) check when set to false. Valid values are true or false."
      }
    ]
  },
  "application/avro": {
    "id": "avro",
    "mime": "application/avro",
    "reader": [],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false. |schemaUrl (Required) |String|''|The URL for the Avro schema. Valid URL schemes are classpath://, file://, or http://. For the reader, this property is optional but defaults to the schema embedded in the input Avro file. The reader requires an embedded schema. For the writer, DataWeave requires a schema value."
      }
    ]
  },
  "application/protobuf": {
    "id": "protobuf",
    "mime": "application/protobuf",
    "reader": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false. |descriptorUrl (Required) |String|''|The URL for the ProtoBuf descriptor. Valid values are classpath://, file://, or http://. |messageType (Required) |String|null|The message type's full name taken from the given descriptor, including the package where it's located."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false. |descriptorUrl (Required) |String|''|The URL for the ProtoBuf descriptor. Valid values are classpath://, file://, or http://. |messageType (Required) |String|null|The message type's full name taken from the given descriptor, including the package where it's located."
      }
    ]
  },
  "application/flatfile": {
    "id": "flatfile",
    "mime": "application/flatfile",
    "reader": [
      {
        "name": "allowLenientWithBinaryNotEndElement",
        "type": "Boolean",
        "default": "false",
        "description": "When the schema contains elements of type Binary or Packed, the lenient option does not allow short records, regardless of the last element's format type. When you set this property to true, the validation applies only to cases in which the record ends with type Binary or Packed. Valid values are true or false."
      },
      {
        "name": "enforceRequires",
        "type": "Boolean",
        "default": "false",
        "description": "Produces an error when set to true if a required value is missing. Valid values are true or false."
      },
      {
        "name": "missingValues",
        "type": "String",
        "default": "null",
        "description": "Fill character used to represent missing values. To activate a non-default setting, set the useMissCharAsDefaultForFill property to true, and use one of the following values to missingValues: * none (for the reader) or NONE (for the writer): Treats all data as values. * spaces (for the reader) or SPACES (for the writer): Interprets a field consisting of only spaces as a missing value. Default for flat file and fixed-width formats. * zeroes (for the reader) or ZEROES (for the writer): Interprets numeric fields consisting of only 0 characters _and_ character fields consisting of only spaces as missing values. * nulls (for the reader) or NULLS (for the writer): Interprets a field consisting only of 0 bytes as a missing value. Default for COBOL copybook schema. Valid values are none or spaces or zeroes or nulls.",
        "values": [
          "none",
          "spaces",
          "zeroes",
          "nulls"
        ]
      },
      {
        "name": "notTruncateDependingOnSubjectNotPresent",
        "type": "Boolean",
        "default": "false",
        "description": "Fills the entire group when the DEPENDING ON subject is not present. Valid values are true or false."
      },
      {
        "name": "recordParsing",
        "type": "String",
        "default": "'strict'",
        "description": "Specifies the expected type of separation between lines or records: * strict: Line break is expected at exact end of each record. strict is the default. * lenient: Line break is used, but records can be shorter or longer than the schema specifies. Don't use lenient if your payload lacks line breaks. The other options to recordParsing support records that lack line breaks. * noTerminator: Records follow one another with no separation. This option is preferred for fixed-length records that lack a line break. * singleRecord: The entire input is a single record. Note that schemas with type Binary or Packed don't allow for line break detection, so setting recordParsing to lenient only allows long records to be handled, not short ones. These schemas also currently only work with certain single-byte character encodings (so not with UTF-8 or any multibyte format). Valid values are strict or lenient or noTerminator or singleRecord.",
        "values": [
          "strict",
          "lenient",
          "noTerminator",
          "singleRecord"
        ]
      },
      {
        "name": "retainEmptyStringFieldsOnParsing",
        "type": "Boolean",
        "default": "false",
        "description": "Allow parsing behavior to keep missing string value fields with a default value in the output map Valid values are true or false. |schemaPath (Required) |String|null|Path to the schema definition. Specifies the location in your local disk of the schema file that parses your input."
      },
      {
        "name": "segmentIdent",
        "type": "String",
        "default": "null",
        "description": "Segment identifier in the schema for fixed-width or COBOL copybook schemas. Required when parsing a single segment or record definition if the schema includes multiple segment definitions."
      },
      {
        "name": "structureIdent",
        "type": "String",
        "default": "null",
        "description": "Structure identifier in the schema for flat file schemas. Required when parsing a structure definition if the schema includes multiple structure definitions."
      },
      {
        "name": "substituteCharacterAsMissingValue",
        "type": "Boolean",
        "default": "false",
        "description": "If set to true and the missingValues property is set to none, with useMissCharAsDefaultForFill set to true, the flat file parser handles the 0x1A (SUB) character as the missing value. + Otherwise, the flat file parser doesn't handle the 0x1A character as the missing value. Valid values are true or false."
      },
      {
        "name": "truncateDependingOn",
        "type": "Boolean",
        "default": "false",
        "description": "For COBOL copybook, truncates DEPENDING ON values to the length used. Valid values are true or false."
      },
      {
        "name": "useMissCharAsDefaultForFill",
        "type": "Boolean",
        "default": "false",
        "description": "By default, the flat file reader and writer use spaces for missing characters and ignore the setting of the missingValues property. When you set this property to true, DataWeave honors the missingValues property setting. Introduced in DataWeave 2.3 (2.3.0-20210823) for the September 2021 release of Mule 4.3.0-20210823. Valid values are true or false."
      },
      {
        "name": "zonedDecimalStrict",
        "type": "Boolean",
        "default": "false",
        "description": "For COBOL copybook, uses the 'strict' ASCII form of sign encoding for zoned decimal values. Valid values are true or false."
      }
    ],
    "writer": [
      {
        "name": "bufferSize",
        "type": "Number",
        "default": "8192",
        "description": "Size of the buffer writer, in bytes. The value must be greater than 8."
      },
      {
        "name": "deferred",
        "type": "Boolean",
        "default": "false",
        "description": "Generates the output as a data stream when set to true, and defers the script's execution until the generated content is consumed. Valid values are true or false."
      },
      {
        "name": "encoding",
        "type": "String",
        "default": "null",
        "description": "The encoding to use for the output, such as UTF-8."
      },
      {
        "name": "enforceRequires",
        "type": "Boolean",
        "default": "false",
        "description": "Produces an error when set to true if a required value is missing. Valid values are true or false."
      },
      {
        "name": "fillRedefinesByMaxLength",
        "type": "Boolean",
        "default": "false",
        "description": "If set to true, the flat file module fills the Redefines components that are considered to be missing values up to the maximum number of characters set in the maxLength parameter. + If set to false, the module uses all the defined view options to determine how to fill the Redefines components. Valid values are true or false."
      },
      {
        "name": "missingValues",
        "type": "String",
        "default": "null",
        "description": "Fill character used to represent missing values. To activate a non-default setting, set the useMissCharAsDefaultForFill property to true, and use one of the following values to missingValues: * none (for the reader) or NONE (for the writer): Treats all data as values. * spaces (for the reader) or SPACES (for the writer): Interprets a field consisting of only spaces as a missing value. Default for flat file and fixed-width formats. * zeroes (for the reader) or ZEROES (for the writer): Interprets numeric fields consisting of only 0 characters _and_ character fields consisting of only spaces as missing values. * nulls (for the reader) or NULLS (for the writer): Interprets a field consisting only of 0 bytes as a missing value. Default for COBOL copybook schema. Valid values are none or spaces or zeroes or nulls.",
        "values": [
          "none",
          "spaces",
          "zeroes",
          "nulls"
        ]
      },
      {
        "name": "notTruncateDependingOnSubjectNotPresent",
        "type": "Boolean",
        "default": "false",
        "description": "Fills the entire group when the DEPENDING ON subject is not present. Valid values are true or false."
      },
      {
        "name": "recordTerminator",
        "type": "String",
        "default": "null",
        "description": "Line break for a record separator. DataWeave uses this property as a separator only when there are multiple records. Values translate directly to character codes, and none leaves no termination on each record. Valid values are lf or cr or crlf or none. |schemaPath (Required) |String|null|Path to the schema definition. Specifies the location in your local disk of the schema file that parses your input.",
        "values": [
          "lf",
          "cr",
          "crlf",
          "none"
        ]
      },
      {
        "name": "segmentIdent",
        "type": "String",
        "default": "null",
        "description": "Segment identifier in the schema for fixed-width or COBOL copybook schemas. Required when parsing a single segment or record definition if the schema includes multiple segment definitions."
      },
      {
        "name": "structureIdent",
        "type": "String",
        "default": "null",
        "description": "Structure identifier in the schema for flat file schemas. Required when parsing a structure definition if the schema includes multiple structure definitions."
      },
      {
        "name": "trimValues",
        "type": "Boolean",
        "default": "false",
        "description": "Trim values that are longer than the width of a field. Valid values are true or false."
      },
      {
        "name": "truncateDependingOn",
        "type": "Boolean",
        "default": "false",
        "description": "For COBOL copybook, truncates DEPENDING ON values to the length used. Valid values are true or false."
      },
      {
        "name": "useMissCharAsDefaultForFill",
        "type": "Boolean",
        "default": "false",
        "description": "By default, the flat file reader and writer use spaces for missing characters and ignore the setting of the missingValues property. When you set this property to true, DataWeave honors the missingValues property setting. Introduced in DataWeave 2.3 (2.3.0-20210823) for the September 2021 release of Mule 4.3.0-20210823. Valid values are true or false."
      },
      {
        "name": "zonedDecimalStrict",
        "type": "Boolean",
        "default": "false",
        "description": "For COBOL copybook, uses the 'strict' ASCII form of sign encoding for zoned decimal values. Valid values are true or false."
      }
    ]
  }
};
