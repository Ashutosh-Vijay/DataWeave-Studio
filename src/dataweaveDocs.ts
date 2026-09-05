// AUTO-GENERATED from mulesoft/docs-dataweave@v2.12. Do not edit by hand.
// Re-run scripts/extract-dw-docs.mjs to refresh.
// Modules the docs repo does not cover (asserts, tests, filesystem, ndjson,
// protobuf) come from the engine jar's own doc comments, added by
// scripts/extract-dw-bundled-docs.mjs.

export interface FnExample { source: string; output: string; }
export interface FnOverload {
  module: string;
  signature: string;
  description: string;
  examples: FnExample[];
}
export interface FnDoc {
  name: string;
  overloads: FnOverload[];
}

export const DW_FUNCTIONS: Record<string, FnDoc> = {
  "++": {
    "name": "++",
    "overloads": [
      {
        "module": "core",
        "signature": "++<S, T>(source: Array<S>, with: Array<T>): Array<S | T>",
        "description": "Concatenates two values.\n\n\nThis version of `++` concatenates the elements of two arrays into a\nnew array. Other versions act on strings, objects, and the various date and\ntime formats that DataWeave supports.\n\nIf the two arrays contain different types of elements, the resulting array\nis all of `S` type elements of `Array<S>` followed by all the `T` type elements\nof `Array<T>`. Either of the arrays can also have mixed-type elements. Also\nnote that the arrays can contain any supported data type.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"result\" : [0, 1, 2] ++ [\"a\", \"b\", \"c\"] }",
            "output": "{ \"result\": [0, 1, 2, \"a\", \"b\", \"c\"] }"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"a\" : [0, 1, true, \"my string\"] ++ [2, [3,4,5], {\"a\": 6}] }",
            "output": "{ \"a\": [0, 1, true, \"my string\", 2, [3, 4, 5], { \"a\": 6}] }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(source: String, with: String): String",
        "description": "Concatenates the characters of two strings.\n\n\nStrings are treated as arrays of characters, so the `++` operator concatenates\nthe characters of each string as if they were arrays of single-character\nstring.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"name\" : \"Mule\" ++ \"Soft\" }",
            "output": "{ \"name\": \"MuleSoft\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++<T <: Object, Q <: Object>(source: T, with: Q): T & Q",
        "description": "Concatenates two objects and returns one flattened object.\n\n\nThe `++` operator extracts all the key-values pairs from each object,\nthen combines them together into one result object.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/xml\n---\n{ concat : {aa: \"a\", bb: \"b\"} ++ {cc: \"c\"} }",
            "output": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<concat>\n  <aa>a</aa>\n  <bb>b</bb>\n  <cc>c</cc>\n</concat>"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(date: Date, time: LocalTime): LocalDateTime",
        "description": "Appends a `LocalTime` with a `Date` to return a `LocalDateTime` value.\n\n\n`Date` and `LocalTime` instances are written in standard Java notation,\nsurrounded by pipe (`&#124;`) symbols. The result is a `LocalDateTime` object\nin the standard Java format. Note that the order in which the two objects are\nconcatenated is irrelevant, so logically, `Date ++ LocalTime` produces the\nsame result as `LocalTime ++ Date`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"LocalDateTime\" : (|2017-10-01| ++ |23:57:59|) }",
            "output": "{ \"LocalDateTime\": \"2017-10-01T23:57:59\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(time: LocalTime, date: Date): LocalDateTime",
        "description": "Appends a `LocalTime` with a `Date` to return a `LocalDateTime`.\n\n\nNote that the order in which the two objects are concatenated is irrelevant,\nso logically, `LocalTime ++ Date` produces the same result as\n`Date ++ LocalTime`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"LocalDateTime\" : (|23:57:59| ++ |2003-10-01|) }",
            "output": "{ \"LocalDateTime\": \"2017-10-01T23:57:59\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(date: Date, time: Time): DateTime",
        "description": "Appends a `Date` to a `Time` in order to return a `DateTime`.\n\n\nNote that the order in which the two objects are concatenated is irrelevant,\nso logically, `Date` + `Time`  produces the same result as `Time` + `Date`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ |2017-10-01| ++ |23:57:59-03:00|, |2017-10-01| ++ |23:57:59Z| ]",
            "output": "[ \"2017-10-01T23:57:59-03:00\", \"2017-10-01T23:57:59Z\" ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(time: Time, date: Date): DateTime",
        "description": "Appends a `Date` to a `Time` object to return a `DateTime`.\n\n\nNote that the order in which the two objects are concatenated is irrelevant,\nso logically, `Date` + `Time`  produces the same result as a `Time` + `Date`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n|2018-11-30| ++ |23:57:59+01:00|",
            "output": "\"2018-11-30T23:57:59+01:00\""
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  \"DateTime1\" : (|23:57:59| as Time) ++ |2017-10-01|,\n  \"DateTime2\" : |23:57:59Z| ++ |2017-10-01|,\n  \"DateTime3\" : |2017-10-01| ++ |23:57:59+02:00|\n}",
            "output": "{\n  \"DateTime1\": \"2017-10-01T23:57:59Z\",\n  \"DateTime2\": \"2017-10-01T23:57:59Z\",\n  \"DateTime3\": \"2017-10-01T23:57:59+02:00\"\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(date: Date, timezone: TimeZone): DateTime",
        "description": "Appends a `TimeZone` to a `Date` type value and returns a `DateTime` result.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"DateTime\" : (|2017-10-01| ++ |-03:00|) }",
            "output": "{ \"DateTime\": \"2017-10-01T00:00:00-03:00\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(timezone: TimeZone, date: Date): DateTime",
        "description": "Appends a `Date` to a `TimeZone` in order to return a `DateTime`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"DateTime\" : |-03:00| ++ |2017-10-01| }",
            "output": "{ \"DateTime\": \"2017-10-01T00:00:00-03:00\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(dateTime: LocalDateTime, timezone: TimeZone): DateTime",
        "description": "Appends a `TimeZone` to a `LocalDateTime` in order to return a `DateTime`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"DateTime\" : (|2003-10-01T23:57:59| ++ |-03:00|) }",
            "output": "{ \"DateTime\": \"2003-10-01T23:57:59-03:00 }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(timezone: TimeZone, datetime: LocalDateTime): DateTime",
        "description": "Appends a `LocalDateTime` to a `TimeZone` in order to return a `DateTime`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"TimeZone\" : (|-03:00| ++ |2003-10-01T23:57:59|) }",
            "output": "{ \"TimeZone\": \"2003-10-01T23:57:59-03:00\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(time: LocalTime, timezone: TimeZone): Time",
        "description": "Appends a `TimeZone` to a `LocalTime` in order to return a `Time`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"Time\" : (|23:57| ++ |-03:00|) }",
            "output": "{ \"Time\": \"23:57:00-03:00\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "++(timezone: TimeZone, time: LocalTime): Time",
        "description": "Appends a `LocalTime` to a `TimeZone` in order to return a `Time`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"Time\" : (|-03:00| ++ |23:57|) }",
            "output": "{\n  \"Time\": \"23:57:00-03:00\"\n}"
          }
        ]
      }
    ]
  },
  "--": {
    "name": "--",
    "overloads": [
      {
        "module": "core",
        "signature": "--<S>(source: Array<S>, toRemove: Array<Any>): Array<S>",
        "description": "Removes specified values from an input value.\n\n\nThis version of `--` removes all instances of the specified items from an array. Other\nversions act on objects, strings, and the various date and time formats that\nare supported by DataWeave.\n\n[%header, cols=\"1,3\"]\n|===\n| Name   | Description\n| source | The array containing items to remove.\n| toRemove | Items to remove from the source array.\n|===",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"a\" : [0, 1, 1, 2] -- [1,2] }",
            "output": "{ \"a\": [0] }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "--<K, V>(source: { (K)?: V }, toRemove: Object): { (K)?: V }",
        "description": "Removes specified key-value pairs from an object.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"hello\" : \"world\", \"name\" : \"DW\" } -- { \"hello\" : \"world\"}",
            "output": "{ \"name\": \"DW\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "--(source: Object, keys: Array<String>)",
        "description": "Removes all key-value pairs from the source object that match the specified search key.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"yes\" : \"no\", \"good\" : \"bad\", \"old\" : \"new\" } -- [\"yes\", \"old\"]",
            "output": "{ \"good\": \"bad\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "--(source: Object, keys: Array<Key>)",
        "description": "Removes specified key-value pairs from an object.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"hello\" : \"world\", \"name\" : \"DW\" } -- [\"hello\" as Key]",
            "output": "{ \"name\": \"DW\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "--(source: Null, keys: Any)",
        "description": "Helper function that enables `--` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "abs": {
    "name": "abs",
    "overloads": [
      {
        "module": "core",
        "signature": "abs(number: Number): Number",
        "description": "Returns the absolute value of a number.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ abs(-2), abs(2.5), abs(-3.4), abs(3) ]",
            "output": "[ 2, 2.5, 3.4, 3 ]"
          }
        ]
      }
    ]
  },
  "acos": {
    "name": "acos",
    "overloads": [
      {
        "module": "math",
        "signature": "acos(angle: Number): Number | NaN",
        "description": "Returns an arc cosine value that can range from `0.0` through pi.\n\n\nIf the absolute value of the input is greater than `1`,\nthe result is `null`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"acos0\": acos(0),\n  \"acos13\": acos(0.13),\n  \"acos-1\": acos(-1),\n  \"acos1\": acos(1),\n  \"acos1.1\": acos(1.1)\n}",
            "output": "{\n   \"acos0\": 1.5707963267948966,\n   \"acos13\": 1.440427347091751,\n   \"acos-1\": 3.141592653589793,\n   \"acos1\": 0.0,\n   \"acos1.1\": null\n }"
          }
        ]
      }
    ]
  },
  "anyof": {
    "name": "anyOf",
    "overloads": [
      {
        "module": "asserts",
        "signature": "anyOf(matchers: Array<Matcher<Any>>): Matcher<Any>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the value satisfies at least one of the given matchers",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"A Text\" must anyOf(beObject(), beString())",
            "output": ""
          }
        ]
      }
    ]
  },
  "appendifmissing": {
    "name": "appendIfMissing",
    "overloads": [
      {
        "module": "strings",
        "signature": "appendIfMissing(text: String, suffix: String): String",
        "description": "Appends the `suffix` to the end of the `text` if the `text` does not already\nends with the `suffix`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport appendIfMissing from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": appendIfMissing(null, \"\"),\n  \"b\": appendIfMissing(\"abc\", \"\"),\n  \"c\": appendIfMissing(\"\", \"xyz\") ,\n  \"d\": appendIfMissing(\"abc\", \"xyz\") ,\n  \"e\": appendIfMissing(\"abcxyz\", \"xyz\")\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"abc\",\n  \"c\": \"xyz\",\n  \"d\": \"abcxyz\",\n  \"e\": \"abcxyz\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "appendIfMissing(text: Null, suffix: String): Null",
        "description": "Helper function that enables `appendIfMissing` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "arrayitem": {
    "name": "arrayItem",
    "overloads": [
      {
        "module": "types",
        "signature": "arrayItem(t: Type): Type",
        "description": "Returns the type of the given array. This function fails if the input is not an Array type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ArrayOfString = Array<String>\ntype ArrayOfNumber = Array<Number>\ntype ArrayOfAny = Array<Any>\ntype ArrayOfAnyDefault = Array\noutput application/json\n---\n{\n   a: arrayItem(ArrayOfString),\n   b: arrayItem(ArrayOfNumber),\n   c: arrayItem(ArrayOfAny),\n   d: arrayItem(ArrayOfAnyDefault)\n}",
            "output": "{\n  \"a\": \"String\",\n  \"b\": \"Number\",\n  \"c\": \"Any\",\n  \"d\": \"Any\"\n}"
          }
        ]
      }
    ]
  },
  "asexpressionstring": {
    "name": "asExpressionString",
    "overloads": [
      {
        "module": "tree",
        "signature": "asExpressionString(path: Path): String",
        "description": "Transforms a `Path` value into a string representation of the path.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\noutput application/json\n---\nasExpressionString([\n        {kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n        {kind: ATTRIBUTE_TYPE, selector: \"name\", namespace: null}\n    ])",
            "output": "\".user.@name\""
          }
        ]
      }
    ]
  },
  "asin": {
    "name": "asin",
    "overloads": [
      {
        "module": "math",
        "signature": "asin(angle: Number): Number | NaN",
        "description": "Returns an arc sine value that can range from `-pi/2` through `pi/2`.\n\n\nIf the absolute value of the input is greater than 1, the result\nis `null`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"asin0\": asin(0),\n  \"asin13\": asin(0.13),\n  \"asin-1\": asin(-1),\n  \"asin1.1\": asin(1.1)\n}",
            "output": "{\n   \"asin0\": 0.0,\n   \"asin13\": 0.1303689797031455,\n   \"asin-1\": -1.5707963267948966,\n   \"asin1.1\": null\n }"
          }
        ]
      }
    ]
  },
  "atan": {
    "name": "atan",
    "overloads": [
      {
        "module": "math",
        "signature": "atan(angle: Number): Number",
        "description": "Returns an arc tangent value that can range from `-pi/2` through `pi/2`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"atan0\":  atan(0),\n  \"atan13\": atan(0.13),\n  \"atan-1\": atan(-1)\n}",
            "output": "{\n   \"atan0\": 0.0,\n   \"atan13\": 0.12927500404814307,\n   \"atan-1\": -0.7853981633974483\n}"
          }
        ]
      }
    ]
  },
  "atbeginningofday": {
    "name": "atBeginningOfDay",
    "overloads": [
      {
        "module": "dates",
        "signature": "atBeginningOfDay(dateTime: DateTime): DateTime",
        "description": "Returns a  new `DateTime` value that changes the `Time` value in the input to the\nbeginning of the specified _day_.\n\n\nThe hours, minutes, and seconds in the input change to `00:00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  \"atBeginningOfDayDateTime\": atBeginningOfDay(|2020-10-06T18:23:20.351-03:00|)\n}",
            "output": "{\n  \"atBeginningOfDayDateTime\": \"2020-10-06T00:00:00-03:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfDay(localDateTime: LocalDateTime): LocalDateTime",
        "description": "Returns a new `LocalDateTime` value that changes the `Time` value within the\ninput to the start of the specified _day_.\n\n\nThe hours, minutes, and seconds in the input change to `00:00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  \"atBeginningOfDayLocalDateTime\": atBeginningOfDay(|2020-10-06T18:23:20.351|)\n}",
            "output": "{\n  \"atBeginningOfDayLocalDateTime\": \"2020-10-06T00:00:00\"\n}"
          }
        ]
      }
    ]
  },
  "atbeginningofhour": {
    "name": "atBeginningOfHour",
    "overloads": [
      {
        "module": "dates",
        "signature": "atBeginningOfHour(dateTime: DateTime): DateTime",
        "description": "Returns a  new `DateTime` value that changes the `Time` value in the input to the\nbeginning of the specified _hour_.\n\n\nThe minutes and seconds in the input change to `00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n   \"atBeginningOfHourDateTime\": atBeginningOfHour(|2020-10-06T18:23:20.351-03:00|)\n}",
            "output": "{\n \"atBeginningOfHourDateTime\": \"2020-10-06T18:00:00-03:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfHour(localDateTime: LocalDateTime): LocalDateTime",
        "description": "Returns a  new `LocalDateTime` value that changes the `Time` value in the input to the\nbeginning of the specified _hour_.\n\n\nThe minutes and seconds in the input change to `00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n   \"atBeginningOfHourLocalDateTime\": atBeginningOfHour(|2020-10-06T18:23:20.351|)\n}",
            "output": "{\n \"atBeginningOfHourLocalDateTime\": \"2020-10-06T18:00:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfHour(localTime: LocalTime): LocalTime",
        "description": "Returns a  new `LocalTime` value that changes its value in the input to the\nbeginning of the specified _hour_.\n\n\nThe minutes and seconds in the input change to `00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n   \"atBeginningOfHourLocalTime\": atBeginningOfHour(|18:23:20.351|)\n}",
            "output": "{\n \"atBeginningOfHourLocalTime\": \"18:00:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfHour(time: Time): Time",
        "description": "Returns a new `Time` value that changes the input value to the\nbeginning of the specified _hour_.\n\n\nThe minutes and seconds in the input change to `00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n   \"atBeginningOfHourTime\": atBeginningOfHour(|18:23:20.351-03:00|)\n}",
            "output": "{\n \"atBeginningOfHourTime\":  \"18:00:00-03:00\"\n}"
          }
        ]
      }
    ]
  },
  "atbeginningofmonth": {
    "name": "atBeginningOfMonth",
    "overloads": [
      {
        "module": "dates",
        "signature": "atBeginningOfMonth(dateTime: DateTime): DateTime",
        "description": "Returns a new `DateTime` value that changes the `Day` value from the\ninput to the first day of the specified _month_. It also sets the `Time` value to `00:00:00`.\n\n\nThe day and time in the input changes to `01T00:00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  \"atBeginningOfMonthDateTime\": atBeginningOfMonth(|2020-10-06T18:23:20.351-03:00|)\n}",
            "output": "{\n  \"atBeginningOfMonthDateTime\": \"2020-10-01T00:00:00-03:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfMonth(localDateTime: LocalDateTime): LocalDateTime",
        "description": "Returns a new `LocalDateTime` value that changes the `Day` and `LocalTime`\nvalues from the input to the beginning of the specified _month_.\n\n\nThe day and time in the input changes to `01T00:00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n \"atBeginningOfMonthLocalDateTime\": atBeginningOfMonth(|2020-10-06T18:23:20.351|)\n}",
            "output": "{\n  \"atBeginningOfMonthLocalDateTime\": \"2020-10-01T00:00:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfMonth(date: Date): Date",
        "description": "Returns a new `Date` value that changes the `Day` value from the\ninput to the first day of the specified _month_.\n\n\nThe day in the input changes to `01`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfMonthDate: atBeginningOfMonth(|2020-10-06|)\n}",
            "output": "{\n  \"atBeginningOfMonthDate\": \"2020-10-01\"\n}"
          }
        ]
      }
    ]
  },
  "atbeginningofweek": {
    "name": "atBeginningOfWeek",
    "overloads": [
      {
        "module": "dates",
        "signature": "atBeginningOfWeek(dateTime: DateTime): DateTime",
        "description": "Returns a new `DateTime` value that changes the `Day` and `Time` values from the\ninput to the beginning of the first day of the specified _week_.\n\n\nThe function treats Sunday as the first day of the week.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfWeekDateTime: atBeginningOfWeek(|2020-10-06T18:23:20.351-03:00|)\n}",
            "output": "{\n  \"atBeginningOfWeekDateTime\": \"2020-10-04T00:00:00-03:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfWeek(localDateTime: LocalDateTime): LocalDateTime",
        "description": "Returns a new `LocalDateTime` value that changes the `Day` and `Time` values from the\ninput to the beginning of the first day of the specified _week_.\n\n\nThe function treats Sunday as the first day of the week.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfWeekLocalDateTime: atBeginningOfWeek(|2020-10-06T18:23:20.351|)\n}",
            "output": "{\n  \"atBeginningOfWeekLocalDateTime\": \"2020-10-04T00:00:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfWeek(date: Date): Date",
        "description": "Returns a new `Date` value that changes the `Date` input\ninput to the first day of the specified _week_.\n\n\nThe function treats Sunday as the first day of the week.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfWeekDate: atBeginningOfWeek(|2020-10-06|)\n}",
            "output": "{\n  \"atBeginningOfWeekDate\": \"2020-10-04\"\n}"
          }
        ]
      }
    ]
  },
  "atbeginningofyear": {
    "name": "atBeginningOfYear",
    "overloads": [
      {
        "module": "dates",
        "signature": "atBeginningOfYear(dateTime: DateTime): DateTime",
        "description": "Takes a `DateTime` value as input and returns a `DateTime` value for\nthe first day of the _year_ specified in the input. It also sets the `Time` value to `00:00:00`.\n\n\nThe month, day, and time in the input changes to `01-01T00:00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfYearDateTime: atBeginningOfYear(|2020-10-06T18:23:20.351-03:00|)\n}",
            "output": "{\n  \"atBeginningOfYearDateTime\": \"2020-01-01T00:00:00.000-03:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfYear(localDateTime: LocalDateTime): LocalDateTime",
        "description": "Takes a `LocalDateTime` value as input and returns a `LocalDateTime` value for\nthe first day of the _year_ specified in the input. It also sets the `Time` value to `00:00:00`.\n\n\nThe month, day, and time in the input changes to `01-01T00:00:00`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfYearLocalDateTime: atBeginningOfYear(|2020-10-06T18:23:20.351|)\n}",
            "output": "{\n  \"atBeginningOfYearLocalDateTime\": \"2020-01-01T00:00:00\"\n}"
          }
        ]
      },
      {
        "module": "dates",
        "signature": "atBeginningOfYear(date: Date): Date",
        "description": "Takes a `Date` value as input and returns a `Date` value for\nthe first day of the _year_ specified in the input.\n\n\nThe month and day in the input changes to `01-01`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  atBeginningOfYearDate: atBeginningOfYear(|2020-10-06|)\n}",
            "output": "{\n  \"atBeginningOfYearDate\": \"2020-01-01\"\n}"
          }
        ]
      }
    ]
  },
  "attr": {
    "name": "attr",
    "overloads": [
      {
        "module": "values",
        "signature": "attr(namespace: Namespace | Null = null, name: String): PathElement",
        "description": "This function creates a `PathElement` to use for selecting an XML\nattribute and populates the type's `selector` field with the given string.\n\n\nSome versions of the `update` and `mask` functions accept a `PathElement` as\nan argument.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Values\nns ns0 http://acme.com/fo\n---\nattr(ns0 , \"myAttr\")",
            "output": "{\n   \"kind\": \"Attribute\",\n   \"namespace\": \"http://acme.com/foo\",\n   \"selector\": \"myAttr\"\n }"
          }
        ]
      }
    ]
  },
  "avg": {
    "name": "avg",
    "overloads": [
      {
        "module": "core",
        "signature": "avg(values: Array<Number>): Number",
        "description": "Returns the average of numbers listed in an array.\n\n\nAn array that is empty or that contains a non-numeric value results\nin an error.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ a: avg([1, 1000]), b: avg([1, 2, 3]) }",
            "output": "{ \"a\": 500.5, \"b\": 2 }"
          }
        ]
      }
    ]
  },
  "basenameof": {
    "name": "baseNameOf",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "baseNameOf(path: Path): String",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the base name of this file",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ndw::io::file::FileSystem::baseNameOf(\"/tmp/a/test.json\")",
            "output": "\"test\""
          }
        ]
      }
    ]
  },
  "basetypeof": {
    "name": "baseTypeOf",
    "overloads": [
      {
        "module": "types",
        "signature": "baseTypeOf(t: Type): Type",
        "description": "Returns an the base type of the given type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = String {format: \"YYYY-MM-dd\"}\noutput application/json\n---\n{\n   a: baseTypeOf(AType)\n}",
            "output": "{\n  \"a\": \"String\"\n}"
          }
        ]
      }
    ]
  },
  "bearray": {
    "name": "beArray",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beArray(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value is of type Array",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n[1, 4, 7] must beArray()",
            "output": ""
          }
        ]
      }
    ]
  },
  "beblank": {
    "name": "beBlank",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beBlank(): Matcher<String | Null>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the String value is blank",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"  \" must beBlank()",
            "output": ""
          }
        ]
      }
    ]
  },
  "beboolean": {
    "name": "beBoolean",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beBoolean(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value is of type Boolean",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\ntrue must beBoolean()",
            "output": ""
          }
        ]
      }
    ]
  },
  "beempty": {
    "name": "beEmpty",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beEmpty(): Matcher<String | Object | Array | Null>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the value (String, Object or Array) is empty",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n[] must beEmpty()",
            "output": ""
          }
        ]
      }
    ]
  },
  "begreaterthan": {
    "name": "beGreaterThan",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beGreaterThan(expected: Comparable, inclusive: Boolean = false): Matcher<Comparable>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the asserted Comparable value is greater than the given one\n\n Can be equal to when using the _inclusive_ argument",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n3 must beGreaterThan(2)",
            "output": ""
          },
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n3 must beGreaterThan(2, true)",
            "output": ""
          }
        ]
      }
    ]
  },
  "belowerthan": {
    "name": "beLowerThan",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beLowerThan(expected: Comparable, inclusive: Boolean = false): Matcher<Comparable>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the asserted Comparable value is lower than the given one\n\nCan be equal to when using the _inclusive_ argument",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n1 must beLowerThan(2)",
            "output": ""
          },
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n1 must beLowerThan(2, true)",
            "output": ""
          }
        ]
      }
    ]
  },
  "benull": {
    "name": "beNull",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beNull(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value is of type Null",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\nnull must beNull()",
            "output": ""
          }
        ]
      }
    ]
  },
  "benumber": {
    "name": "beNumber",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beNumber(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value is of type Number",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n123 must beNumber()",
            "output": ""
          }
        ]
      }
    ]
  },
  "beobject": {
    "name": "beObject",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beObject(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value is of type Object",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n{ name : \"Lionel\", lastName: \"Messi\"} must beObject()",
            "output": ""
          }
        ]
      }
    ]
  },
  "beoneof": {
    "name": "beOneOf",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beOneOf(expected:Array<Any>): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the value is contained in the given Array",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n1 must beOneOf([1, \"A Text\", true])",
            "output": ""
          }
        ]
      }
    ]
  },
  "bestring": {
    "name": "beString",
    "overloads": [
      {
        "module": "asserts",
        "signature": "beString(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value is of type String",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"A Text\" must beString()",
            "output": ""
          }
        ]
      }
    ]
  },
  "between": {
    "name": "between",
    "overloads": [
      {
        "module": "periods",
        "signature": "between(endDateExclusive: Date, startDateInclusive: Date): Period",
        "description": "Returns a Period (P) value consisting of the number\nof years, months, and days between two Date values.\n\n\nThe start date is included, but the end date is not.\nThe result of this method can be a negative period\nif the end date (`endDateExclusive`) is before the\nstart date (`startDateInclusive`).\n\nNote that the first parameter of the function is the `endDateExclusive`\nand the second one is the `startDateInclusive`.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "import * from dw::core::Periods\noutput application/json\n---\n{\n   a: between(|2010-12-12|,|2010-12-10|),\n   b: between(|2011-12-11|,|2010-11-10|),\n   c: between(|2020-02-29|,|2020-03-30|)\n}",
            "output": "{\n   \"a\": \"P2D\",\n   \"b\": \"P1Y1M1D\",\n   \"c\": \"P-1M-1D\"\n }"
          }
        ]
      }
    ]
  },
  "camelize": {
    "name": "camelize",
    "overloads": [
      {
        "module": "strings",
        "signature": "camelize(text: String): String",
        "description": "Returns a string in camel case based on underscores in the string.\n\n\nAll underscores are deleted, including any underscores at the beginning of the string.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\" : camelize(\"customer_first_name\"),\n  \"b\" : camelize(\"_name_starts_with_underscore\")\n}",
            "output": "{\n   \"a\": \"customerFirstName\",\n   \"b\": \"nameStartsWithUnderscore\"\n }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "camelize(text: Null): Null",
        "description": "Helper function that enables `camelize` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "capitalize": {
    "name": "capitalize",
    "overloads": [
      {
        "module": "strings",
        "signature": "capitalize(text: String): String",
        "description": "Capitalizes the first letter of each word in a string.\n\n\nThe function treats every non-alphabetic character as a separator and replaces underscores with spaces. For example, `capitalize(\"a*s_b’s\")` results in `\"A*S B’S\"`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\" : capitalize(\"customer\"),\n  \"b\" : capitalize(\"customer_first_name\"),\n  \"c\" : capitalize(\"customer NAME\"),\n  \"d\" : capitalize(\"customerName\"),\n  \"e\" : capitalize(\"a*s_b’s\")\n}",
            "output": "{\n  \"a\": \"Customer\",\n  \"b\": \"Customer First Name\",\n  \"c\": \"Customer Name\",\n  \"d\": \"Customer Name\",\n  \"e\": \"A*S B’S\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "capitalize(text: Null): Null",
        "description": "Helper function that enables `capitalize` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "causedby": {
    "name": "causedBy",
    "overloads": [
      {
        "module": "mule",
        "signature": "causedBy(@DesignOnlyType error: Error, errorType: String): Boolean",
        "description": "This function matches an error by its type, like an error handler does.\n\n\n`causedBy` is useful when you need to match by a super type, but the\nspecific sub-type logic is also needed. It can also useful when handling a\nCOMPOSITE_ROUTING error that contains child errors of different types.",
        "examples": [
          {
            "source": "<error-handler name=\"securityHandler\">\n  <on-error-continue type=\"SECURITY\">\n    <!-- general error handling for all SECURITY errors -->\n    <choice>\n      <when expression=\"#[Mule::causedBy(error, 'HTTP:UNAUTHORIZED')]\">\n        <!-- specific error handling only for HTTP:UNAUTHORIZED errors -->\n      </when>\n      <when expression=\"#[Mule::causedBy('HTTP:FORBIDDEN')]\">\n        <!-- specific error handling only for HTTP:FORBIDDEN errors -->\n      </when>\n    </choice>\n  </on-error-continue>\n</error-handler>",
            "output": ""
          }
        ]
      }
    ]
  },
  "ceil": {
    "name": "ceil",
    "overloads": [
      {
        "module": "core",
        "signature": "ceil(number: Number): Number",
        "description": "Rounds a number up to the nearest whole number.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\n[ ceil(1.5), ceil(2.1), ceil(3) ]",
            "output": "[ 2, 3, 3 ]"
          }
        ]
      }
    ]
  },
  "charcode": {
    "name": "charCode",
    "overloads": [
      {
        "module": "strings",
        "signature": "charCode(text: String): Number",
        "description": "Returns the Unicode for the first character in an input string.\n\n\nFor an empty string, the function fails and returns `Unexpected empty string`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"charCode\" : charCode(\"Mule\")\n}",
            "output": "{ \"charCode\" : 77 }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "charCode(text: Null): Null",
        "description": "Helper function that enables `charCode` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "charcodeat": {
    "name": "charCodeAt",
    "overloads": [
      {
        "module": "strings",
        "signature": "charCodeAt(content: String, position: Number): Number",
        "description": "Returns the Unicode for a character at the specified index.\n\n\nThis function fails if the index is invalid.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"charCodeAt\" : charCodeAt(\"MuleSoft\", 1)\n}",
            "output": "{ \"charCodeAt\": 117 }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "charCodeAt(content: Null, position: Any): Null",
        "description": "Helper function that enables `charCodeAt` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "collapse": {
    "name": "collapse",
    "overloads": [
      {
        "module": "strings",
        "signature": "collapse(text: String): Array<String>",
        "description": "Collapses the string into substrings of equal characters.\n\n\nEach substring contains a single character or identical characters\nthat are adjacent to one another in the input string. Empty spaces\nare treated as characters.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport collapse from dw::core::Strings\noutput application/json\n---\ncollapse(\"a  b babb a\")",
            "output": "[\"a\", \"  \", \"b\", \" \", \"b\", \"a\", \"bb\", \" \", \"a\"]"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "collapse(text: Null): Null",
        "description": "Helper function that enables `collapse` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "compose": {
    "name": "compose",
    "overloads": [
      {
        "module": "url",
        "signature": "compose(parts: Array<String>, interpolation: Array<String>): String",
        "description": "Uses a custom string interpolator to replace URL components with a\n`encodeURIComponent` result. You can call this function using the standard call, or a simplified version.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nvar urlPath = \"content folder\"\nimport * from dw::core::URL\n---\n { \"encodedURL\" : compose([\"http://examplewebsite.com/\", \"/page.html\"], [\"$(urlPath)\"]) }",
            "output": "{ \"encodedURL\" : \"http://examplewebsite.com/content%20folder/page.html\" }"
          },
          {
            "source": "%dw 2.0\noutput application/json\nvar urlPath = \"content folder\"\nimport * from dw::core::URL\n---\n{ \"encodedURL\" : compose `http://examplewebsite.com/$(urlPath)/page.html`}",
            "output": "{ \"encodedURL\" : \"http://examplewebsite.com/content%20folder/page.html\" }"
          }
        ]
      }
    ]
  },
  "concatwith": {
    "name": "concatWith",
    "overloads": [
      {
        "module": "binaries",
        "signature": "concatWith(source: Binary, with: Binary): Binary",
        "description": "Concatenates the content of two binaries.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Binaries\noutput application/dw\n---\n\"CAFE\" as Binary {base: \"16\"} concatWith \"ABCD\" as Binary {base: \"16\"}",
            "output": "\"yv6rzQ==\" as Binary {base: \"64\"}"
          }
        ]
      },
      {
        "module": "binaries",
        "signature": "concatWith(source: Binary, with: Null): Binary",
        "description": "Helper function that enables `concatWith` to work with a `null` value.",
        "examples": []
      },
      {
        "module": "binaries",
        "signature": "concatWith(source: Null, with: Binary): Binary",
        "description": "Helper function that enables `concatWith` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "contain": {
    "name": "contain",
    "overloads": [
      {
        "module": "asserts",
        "signature": "contain(expected:String): Matcher<String>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the asserted String contains the given String",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"A Text\" must contain(\"ex\")",
            "output": ""
          }
        ]
      },
      {
        "module": "asserts",
        "signature": "contain(expected: Any): Matcher<Array<Any>>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the asserted Array contains the given value",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n[1, \"A Text\", true] must contain(1)",
            "output": ""
          }
        ]
      }
    ]
  },
  "contains": {
    "name": "contains",
    "overloads": [
      {
        "module": "core",
        "signature": "contains<T>(@StreamCapable items: Array<T>, element: Any): Boolean",
        "description": "Returns `true` if an input contains a given value, `false` if not.\n\n\nThis version of `contains` accepts an array as input. Other versions\naccept a string and can use another string or regular expression to\ndetermine whether there is a match.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ 1, 2, 3, 4 ] contains(2)",
            "output": "true"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\nContainsRequestedItem: payload.root.*order.*items contains \"3\"",
            "output": "{ \"ContainsRequestedItem\": true }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "contains(text: String, toSearch: String): Boolean",
        "description": "Indicates whether a string contains a given substring. Returns `true`\nor `false`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"mulesoft\" contains(\"mule\")",
            "output": "true"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ ContainsString : payload.root.mystring contains(\"me\") }",
            "output": "{ \"ContainsString\": true }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "contains(text: String, matcher: Regex): Boolean",
        "description": "Returns `true` if a string contains a match to a regular expression, `false`\nif not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ncontains(\"mulesoft\", /[e-g]/)",
            "output": "true"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\nContainsString: payload.root.mystring contains /s[t|p]rin/",
            "output": "{ \"ContainsString\": true }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "contains(text: Null, matcher: Any): false",
        "description": "Helper function that enables `contains` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "contentof": {
    "name": "contentOf",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "contentOf(path: Path): Binary",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the content of the given path",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ncontentOf(\"/tmp/foo/bar.txt\") as String {encoding: \"UTF-8\"}",
            "output": "\"Hello\""
          }
        ]
      }
    ]
  },
  "copyto": {
    "name": "copyTo",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "copyTo(binary: Binary, path: Path): Number",
        "description": "`import * from dw::io::file::FileSystem`\n\nCopies the specified binary into the given path.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ncopyTo( \"Hello\" as Binary {encoding: \"UTF-8\"}, \"/tmp/foo/bar.txt\")",
            "output": "5"
          }
        ]
      }
    ]
  },
  "cos": {
    "name": "cos",
    "overloads": [
      {
        "module": "math",
        "signature": "cos(angle: Number): Number",
        "description": "Returns the trigonometric cosine of an angle from a given number of radians.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"cos0\": cos(0),\n  \"cos13\": cos(0.13),\n  \"cos-1\": cos(-1)\n}",
            "output": "{\n  \"cos0\": 1.0,\n  \"cos13\": 0.9915618937147881,\n  \"cos-1\": 0.5403023058681398\n}"
          }
        ]
      }
    ]
  },
  "countby": {
    "name": "countBy",
    "overloads": [
      {
        "module": "arrays",
        "signature": "countBy<T>(@StreamCapable array: Array<T>, matchingFunction: (T) -> Boolean): Number",
        "description": "Counts the elements in an array that return `true` when the matching function is applied to the value of each element.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\n---\n{ \"countBy\" : [1, 2, 3, 4] countBy (($ mod 2) == 0) }",
            "output": "{ \"countBy\": 2 }"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "countBy(array: Null, matchingFunction: (Nothing) -> Any): Null",
        "description": "Helper function that enables `countBy` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "countcharactersby": {
    "name": "countCharactersBy",
    "overloads": [
      {
        "module": "strings",
        "signature": "countCharactersBy(text: String, predicate: (character: String) -> Boolean): Number",
        "description": "Counts the number of times an expression that iterates through\neach character in a string returns `true`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n\"42 = 11 * 2 + 20\" countCharactersBy isNumeric($)",
            "output": "7"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "countCharactersBy(text: Null, predicate: (character: Nothing) -> Any): Null",
        "description": "Helper function to make `countCharactersBy` work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "countmatches": {
    "name": "countMatches",
    "overloads": [
      {
        "module": "strings",
        "signature": "countMatches(text: String, pattern: String): Number",
        "description": "Counts the number of matches in a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport countMatches from dw::core::Strings\noutput application/json\n---\n\"hello worlo!\" countMatches \"lo\"",
            "output": "2"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "countMatches(text: String, pattern: Regex): Number",
        "description": "Counts the number of times a regular expression matches text in a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport countMatches from dw::core::Strings\noutput application/json\n---\n\"hello, ciao!\" countMatches /[aeiou]/",
            "output": "5"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "countMatches(text: Null, pattern: Any): Null",
        "description": "Helper function that enables `countMatches` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "currentmilliseconds": {
    "name": "currentMilliseconds",
    "overloads": [
      {
        "module": "timer",
        "signature": "currentMilliseconds(): Number",
        "description": "Returns the current time in milliseconds.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Timer\noutput application/json\n---\n{ \"currentMilliseconds\" : currentMilliseconds() }",
            "output": "{ \"currentMilliseconds\": 1532923168900 }"
          }
        ]
      }
    ]
  },
  "dasherize": {
    "name": "dasherize",
    "overloads": [
      {
        "module": "strings",
        "signature": "dasherize(text: String): String",
        "description": "Replaces spaces, underscores, and camel-casing in a string with dashes\n(hyphens).\n\n\nIf no spaces, underscores, and camel-casing are present, the output will\nmatch the input.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\" : dasherize(\"customer\"),\n  \"b\" : dasherize(\"customer_first_name\"),\n  \"c\" : dasherize(\"customer NAME\"),\n  \"d\" : dasherize(\"customerName\")\n}",
            "output": "{\n  \"a\": \"customer\",\n  \"b\": \"customer-first-name\",\n  \"c\": \"customer-name\",\n  \"d\": \"customer-name\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "dasherize(text: Null): Null",
        "description": "Helper function that enables `dasherize` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "dataformatsdescriptor": {
    "name": "dataFormatsDescriptor",
    "overloads": [
      {
        "module": "runtime",
        "signature": "dataFormatsDescriptor(): Array<DataFormatDescriptor>",
        "description": "Returns an array of all `DataFormatDescriptor` values that are installed in\nthe current instance of DataWeave.\n\n_Experimental:_ This function is an experimental feature that is subject to change or removal from future versions of DataWeave.",
        "examples": [
          {
            "source": "import * from dw::Runtime\n---\ndataFormatsDescriptor()",
            "output": "[\n      {\n           \"id\": \"json\",\n           \"binary\": false,\n           \"defaultEncoding\": \"UTF-8\",\n           \"extensions\": [\n             \".json\"\n           ],\n           \"defaultMimeType\": \"application/json\",\n           \"acceptedMimeTypes\": [\n             \"application/json\"\n           ],\n           \"readerProperties\": [\n             {\n               \"name\": \"streaming\",\n               \"optional\": true,\n               \"defaultValue\": false,\n               \"description\": \"Used for streaming input (use only if entries are accessed sequentially).\",\n               \"possibleValues\": [\n                 true,\n                 false\n               ]\n             }\n           ],\n           \"writerProperties\": [\n             {\n               \"name\": \"writeAttributes\",\n               \"optional\": true,\n               \"defaultValue\": false,\n               \"description\": \"Indicates that if a key has attributes, they are going to be added as children key-value pairs of the key that contains them. The attribute new key name will start with @.\",\n               \"possibleValues\": [\n                 true,\n                 false\n               ]\n             },\n             {\n              \"name\": \"skipNullOn\",\n                 \"optional\": true,\n                 \"defaultValue\": \"None\",\n                 \"description\": \"Indicates where is should skips null values if any or not. By default it doesn't skip.\",\n                 \"possibleValues\": [\n                   \"arrays\",\n                   \"objects\",\n                   \"everywhere\"\n                 ]\n               }\n             ]\n           },\n           {\n             \"id\": \"xml\",\n             \"binary\": false,\n             \"extensions\": [\n               \".xml\"\n             ],\n             \"defaultMimeType\": \"application/xml\",\n             \"acceptedMimeTypes\": [\n               \"application/xml\"\n             ],\n             \"readerProperties\": [\n               {\n               \"name\": \"supportDtd\",\n               \"optional\": true,\n               \"defaultValue\": true,\n               \"description\": \"Whether DTD handling is enabled or disabled; disabling means both internal and external subsets will just be skipped unprocessed.\",\n               \"possibleValues\": [\n                 true,\n                 false\n               ]\n             },\n             {\n               \"name\": \"streaming\",\n               \"optional\": true,\n               \"defaultValue\": false,\n               \"description\": \"Used for streaming input (use only if entries are accessed sequentially).\",\n               \"possibleValues\": [\n                 true,\n                 false\n               ]\n             },\n             {\n               \"name\": \"maxEntityCount\",\n               \"optional\": true,\n               \"defaultValue\": 1,\n               \"description\": \"The maximum number of entity expansions. The limit is in place to avoid Billion Laughs attacks.\",\n               \"possibleValues\": [\n\n               ]\n             }\n           ],\n           \"writerProperties\": [\n             {\n               \"name\": \"writeDeclaration\",\n               \"optional\": true,\n               \"defaultValue\": true,\n               \"description\": \"Indicates whether to write the XML header declaration or not.\",\n               \"possibleValues\": [\n                 true,\n                 false\n               ]\n             },\n             {\n               \"name\": \"indent\",\n               \"optional\": true,\n               \"defaultValue\": true,\n               \"description\": \"Indicates whether to indent the code for better readability or to compress it into a single line.\",\n               \"possibleValues\": [\n                 true,\n                 false\n               ]\n             }\n           ]\n         }\n]"
          }
        ]
      }
    ]
  },
  "date": {
    "name": "date",
    "overloads": [
      {
        "module": "dates",
        "signature": "date(parts: DateFactory): Date",
        "description": "Creates a `Date` value from values specified for `year`, `month`, and `day` fields.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n   newDate: date({year: 2012, month: 10, day: 11})\n}",
            "output": "{\n   \"newDate\": \"2012-10-11\"\n}"
          }
        ]
      }
    ]
  },
  "datetime": {
    "name": "dateTime",
    "overloads": [
      {
        "module": "dates",
        "signature": "dateTime(parts: DateTimeFactory): DateTime",
        "description": "Creates a `DateTime` value from values specified for `year`, `month`, `day`, `hour`,\n`minutes`, `seconds`, and `timezone` fields.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n    newDateTime: dateTime({year: 2012, month: 10, day: 11, hour: 12, minutes: 30, seconds: 40 , timeZone: |-03:00|})\n}",
            "output": "{\n   \"newDateTime\": \"2012-10-11T12:30:40-03:00\"\n}"
          }
        ]
      }
    ]
  },
  "days": {
    "name": "days",
    "overloads": [
      {
        "module": "periods",
        "signature": "days(nDays: Number): Period",
        "description": "Creates a Period value from the provided number of days.\n\n\nThe function applies the `period` function to input that is a whole number\nand the `duration` function to decimal input.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n   tomorrow: |2020-10-05T20:22:34.385Z| + days(1),\n   yesterday: |2020-10-05T20:22:34.385Z| - days(1),\n   decimalDaysPlusQuarter:  |2020-10-05T00:00:00.000Z| + days(0.25),\n   decimalDaysPlusHalf:  |2020-10-05T00:00:00.000Z| + days(0.5),\n   decimalDaysPlusThreeQuarters:  |2020-10-05T00:00:00.000Z| + days(0.75),\n   decimalInputAsPeriod : days(4.555),\n   fourDayPeriod: days(4),\n   negativeValue: days(-1)\n}",
            "output": "{\n   \"tomorrow\": \"2020-10-06T20:22:34.385Z\",\n   \"yesterday\": \"2020-10-04T20:22:34.385Z\",\n   \"decimalDaysPlusQuarter\": \"2020-10-05T06:00:00Z\",\n   \"decimalDaysPlusHalf\": \"2020-10-05T12:00:00Z\",\n   \"decimalDaysPlusThreeQuarters\": \"2020-10-05T18:00:00Z\",\n   \"decimalInputAsPeriod\": \"PT109H19M12S\",\n   \"fourDayPeriod\": \"P4D\",\n   \"negativeValue\": \"P-1D\"\n}"
          }
        ]
      }
    ]
  },
  "daysbetween": {
    "name": "daysBetween",
    "overloads": [
      {
        "module": "core",
        "signature": "daysBetween(from: Date, to: Date): Number",
        "description": "Returns the number of days between two dates.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ days : daysBetween('2016-10-01T23:57:59-03:00', '2017-10-01T23:57:59-03:00') }",
            "output": "{ \"days\" : 365 }"
          }
        ]
      }
    ]
  },
  "decimaladd": {
    "name": "decimalAdd",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalAdd(lhs: Number, rhs: Number, ctx: OperationContext = DECIMAL_128_CONTEXT): Number",
        "description": "Performs number addition with rounding specified by the operation context.",
        "examples": []
      }
    ]
  },
  "decimaldivide": {
    "name": "decimalDivide",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalDivide(dividend: Number, divisor: Number, ctx: OperationContext = DECIMAL_128_CONTEXT): Number",
        "description": "Performs number division with rounding specified by the operation context. If precision is set to 0 (unlimited precision)\nand the result has an infinite decimal expansion, the function returns an error.",
        "examples": []
      }
    ]
  },
  "decimalmultiply": {
    "name": "decimalMultiply",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalMultiply(leftFactor: Number, rightFactor: Number, ctx: OperationContext = DECIMAL_128_CONTEXT): Number",
        "description": "Performs number multiplication with rounding specified by the operation context.",
        "examples": []
      }
    ]
  },
  "decimalpow": {
    "name": "decimalPow",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalPow(base: Number, exponent: Number, ctx: OperationContext = DECIMAL_128_CONTEXT): Number",
        "description": "Returns a number with value base^exponent with rounding specified by the operation context. The maximum value for exponent\nis 99999999.",
        "examples": []
      }
    ]
  },
  "decimalround": {
    "name": "decimalRound",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalRound(n: Number, ctx: OperationContext = DECIMAL_128_CONTEXT)",
        "description": "Returns the argument number with rounding specified by the operation context.",
        "examples": []
      }
    ]
  },
  "decimalsqrt": {
    "name": "decimalSqrt",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalSqrt(n: Number, ctx: OperationContext = DECIMAL_128_CONTEXT): Number",
        "description": "Returns a number that approximates the square root of the argument with rounding specified by the operation context.",
        "examples": []
      }
    ]
  },
  "decimalsubtract": {
    "name": "decimalSubtract",
    "overloads": [
      {
        "module": "math",
        "signature": "decimalSubtract(lhs: Number, rhs: Number, ctx: OperationContext = DECIMAL_128_CONTEXT): Number",
        "description": "Performs number subtraction with rounding specified by the operation context.",
        "examples": []
      }
    ]
  },
  "decodeuri": {
    "name": "decodeURI",
    "overloads": [
      {
        "module": "url",
        "signature": "decodeURI(text: String): String",
        "description": "Decodes the escape sequences (such as `%20`) in a URI.\n\n\nThe function replaces each escape sequence in the encoded URI with the\ncharacter that it represents, but does not decode escape sequences that\ncould not have been introduced by `encodeURI`. The character `#` is not\ndecoded from escape sequences.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::URL\noutput application/json\n---\n{\n  \"decodeURI\" : decodeURI('http://asd/%20text%20to%20decode%20/text')\n}",
            "output": "{\n  \"decodeURI\": \"http://asd/ text to decode /text\"\n}"
          }
        ]
      }
    ]
  },
  "decodeuricomponent": {
    "name": "decodeURIComponent",
    "overloads": [
      {
        "module": "url",
        "signature": "decodeURIComponent(text: String): String",
        "description": "Decodes a Uniform Resource Identifier (URI) component previously created\nby `encodeURIComponent` or a similar routine.\n\n\nFor an example, see `encodeURIComponent`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::URL\noutput application/json\n---\n{\n  \"decodeURIComponent\": {\n    \"decodeURIComponent\" : decodeURIComponent(\"%20PATH/%20TO%20/DECODE%20\"),\n    \"decodeURIComponent\" : decodeURIComponent(\"%3B%2C%2F%3F%3A%40%26%3D\"),\n    \"decodeURIComponent\" : decodeURIComponent(\"%2D%5F%2E%21%7E%2A%27%28%29%24\"),\n  }\n}",
            "output": "{\n   decodeURIComponent: {\n     decodeURIComponent: \" PATH/ TO /DECODE \",\n     decodeURIComponent: \";,/?:@&=\",\n    decodeURIComponent: \"-_.!~*'()\\$\"\n   }\n}"
          }
        ]
      }
    ]
  },
  "describedby": {
    "name": "describedBy",
    "overloads": [
      {
        "module": "tests",
        "signature": "describedBy(suite: String, testsToRun: Array<() -> TestResult> ): TestResult",
        "description": "`import * from dw::test::Tests`\n\nDefines a new test suite with the list of test cases.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::test::Tests\n ---\n\n \"Matcher api\" describedBy [\n     \"It should support nested matching\" in  do {\n         var payload = {}\n         ---\n         payload must [\n             beObject(),\n             $.foo must [\n                 beNull()\n             ]\n         ]\n     },\n]",
            "output": ""
          }
        ]
      }
    ]
  },
  "diff": {
    "name": "diff",
    "overloads": [
      {
        "module": "diff",
        "signature": "diff(actual: Any, expected: Any, diffConfig: { unordered?: Boolean } = {}, path: String = \"(root)\"): Diff",
        "description": "Returns the structural differences between two values.\n\n\nDifferences between objects can be ordered (the default) or unordered. Ordered\nmeans that two objects do not differ if their key-value pairs are in the same\norder. Differences are expressed as `Difference` type.",
        "examples": [
          {
            "source": "import diff from dw::util::Diff\nns ns0 http://locahost.com\nns ns1 http://acme.com\noutput application/dw\n---\n{\n  \"a\": diff({a: 1}, {b:1}),\n  \"b\": diff({ns0#a: 1}, {ns1#a:1}),\n  \"c\": diff([1,2,3], []),\n  \"d\": diff([], [1,2,3]),\n  \"e\": diff([1,2,3], [1,2,3, 4]),\n  \"f\": diff([{a: 1}], [{a: 2}]),\n  \"g\": diff({a @(c: 2): 1}, {a @(c: 3): 1}),\n  \"h\": diff(true, false),\n  \"i\": diff(1, 2),\n  \"j\": diff(\"test\", \"other test\"),\n  \"k\": diff({a: 1}, {a:1}),\n  \"l\": diff({ns0#a: 1}, {ns0#a:1}),\n  \"m\": diff([1,2,3], [1,2,3]),\n  \"n\": diff([], []),\n  \"o\": diff([{a: 1}], [{a: 1}]),\n  \"p\": diff({a @(c: 2): 1}, {a @(c:2): 1}),\n  \"q\": diff(true, true),\n  \"r\": diff(1, 1),\n  \"s\": diff(\"other test\", \"other test\"),\n  \"t\": diff({a:1 ,b: 2},{b: 2, a:1}, {unordered: true}),\n  \"u\": [{format: \"ssn\",data: \"ABC\"}] diff [{ format: \"ssn\",data: \"ABC\"}]\n}",
            "output": "ns ns0 http://locahost.com\nns ns1 http://acme.com\n---\n{\n  a: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"Entry (root).a with type Number\",\n        actual: \"was not present in object.\",\n        path: \"(root).a\"\n      }\n    ]\n  },\n  b: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"Entry (root).ns0#a with type Number\",\n        actual: \"was not present in object.\",\n        path: \"(root).ns0#a\"\n      }\n    ]\n  },\n  c: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"Array size is 0\",\n        actual: \"was 3\",\n        path: \"(root)\"\n      }\n    ]\n  },\n  d: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"Array size is 3\",\n        actual: \"was 0\",\n        path: \"(root)\"\n      }\n    ]\n  },\n  e: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"Array size is 4\",\n        actual: \"was 3\",\n        path: \"(root)\"\n      }\n    ]\n  },\n  f: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"1\" as String {mimeType: \"application/dw\"},\n        actual: \"2\" as String {mimeType: \"application/dw\"},\n        path: \"(root)[0].a\"\n      }\n    ]\n  },\n  g: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"3\" as String {mimeType: \"application/dw\"},\n        actual: \"2\" as String {mimeType: \"application/dw\"},\n        path: \"(root).a.@.c\"\n      }\n    ]\n  },\n  h: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"false\",\n        actual: \"true\",\n        path: \"(root)\"\n      }\n    ]\n  },\n  i: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"2\",\n        actual: \"1\",\n        path: \"(root)\"\n      }\n    ]\n  },\n  j: {\n    matches: false,\n    diffs: [\n      {\n        expected: \"\\\"other test\\\"\",\n        actual: \"\\\"test\\\"\",\n        path: \"(root)\"\n      }\n    ]\n  },\n  k: {\n    matches: true,\n    diffs: []\n  },\n  l: {\n    matches: true,\n    diffs: []\n  },\n  m: {\n    matches: true,\n    diffs: []\n  },\n  n: {\n    matches: true,\n    diffs: []\n  },\n  o: {\n    matches: true,\n    diffs: []\n  },\n  p: {\n    matches: true,\n    diffs: []\n  },\n  q: {\n    matches: true,\n    diffs: []\n  },\n  r: {\n    matches: true,\n    diffs: []\n  },\n  s: {\n    matches: true,\n    diffs: []\n  },\n  t: {\n    matches: true,\n    diffs: []\n  },\n  u: {\n    matches: true,\n    diffs: []\n  }\n}"
          }
        ]
      }
    ]
  },
  "distinctby": {
    "name": "distinctBy",
    "overloads": [
      {
        "module": "core",
        "signature": "distinctBy<T>(@StreamCapable items: Array<T>, criteria: (item: T, index: Number) -> Any): Array<T>",
        "description": "Iterates over the input and returns the unique elements in it.\n\n\nDataWeave uses the result of the provided lambda as the\nuniqueness criteria.\n\nThis version of `distinctBy` finds unique values in an array. Other versions\nact on an object and handle a `null` value.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[0, 1, 2, 3, 3, 2, 1, 4] distinctBy (value) -> { \"unique\" : value }",
            "output": "[ 0, 1, 2, 3, 4]"
          },
          {
            "source": "%dw 2.0\noutput application/json\nvar record =  {\n  \"title\": \"XQuery Kick Start\",\n  \"author\": [\n    \"James McGovern\",\n    \"Per Bothner\",\n    \"Kurt Cagle\",\n    \"James Linn\",\n    \"Kurt Cagle\",\n    \"Kurt Cagle\",\n    \"Kurt Cagle\",\n    \"Vaidyanathan Nagarajan\"\n  ],\n  \"year\":\"2000\"\n}\n---\n{\n    \"book\" : {\n      \"title\" : record.title,\n      \"year\" : record.year,\n      \"authors\" : record.author distinctBy $\n    }\n}",
            "output": "{\n  \"book\": {\n    \"title\": \"XQuery Kick Start\",\n    \"year\": \"2000\",\n    \"authors\": [\n      \"James McGovern\",\n      \"Per Bothner\",\n      \"Kurt Cagle\",\n      \"James Linn\",\n      \"Vaidyanathan Nagarajan\"\n    ]\n  }\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "distinctBy<K, V>(object: { (K)?: V }, criteria: (value: V, key: K) -> Any): Object",
        "description": "Removes duplicate key-value pairs from an object.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{a : \"b\", a : \"b\", A : \"b\", a : \"B\"} distinctBy (value) -> { \"unique\" : value }",
            "output": "{ \"a\": \"b\", \"a\": \"B\" }"
          },
          {
            "source": "%dw 2.0\noutput application/xml\n---\n{\n   book : {\n     title : payload.book.title,\n     authors: payload.book.&author distinctBy $\n   }\n}",
            "output": "<book>\n  <title> \"XQuery Kick Start\"</title>\n  <authors>\n      <author>James Linn</author>\n      <author>Per Bothner</author>\n      <author>James McGovern</author>\n  </authors>\n</book>"
          }
        ]
      },
      {
        "module": "core",
        "signature": "distinctBy(@StreamCapable items: Null, criteria: (item: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `distinctBy` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "divideby": {
    "name": "divideBy",
    "overloads": [
      {
        "module": "arrays",
        "signature": "divideBy<T>(items: Array<T>, amount: Number): Array<Array<T>>",
        "description": "Breaks up an array into sub-arrays that contain the\nspecified number of elements.\n\n\nWhen there are fewer elements in the input array than the specified number,\nthe function fills the sub-array with those elements. When there are more\nelements, the function fills as many sub-arrays needed with the extra\nelements.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\n---\n{\n  \"divideBy\" : [\n      { \"divideBy2\" : [1, 2, 3, 4, 5] divideBy 2 },\n      { \"divideBy2\" : [1, 2, 3, 4, 5, 6] divideBy 2 },\n      { \"divideBy3\" : [1, 2, 3, 4, 5] divideBy 3 }\n  ]\n}",
            "output": "{\n \"divideBy\": [\n  {\n    \"divideBy2\": [\n      [ 1, 2 ],\n      [ 3, 4 ],\n      [ 5 ]\n    ]\n  },\n  {\n    \"divideBy2\": [\n      [ 1, 2 ],\n      [ 3, 4 ],\n      [ 5, 6 ]\n    ]\n  },\n    {\n      \"divideBy3\": [\n        [ 1, 2, 3 ],\n        [ 4, 5 ]\n      ]\n    }\n ]\n}"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "divideBy(items: Null, amount: Any): Null",
        "description": "Helper function that enables `divideBy` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      },
      {
        "module": "objects",
        "signature": "divideBy(items: Object, amount: Number): Array<Object>",
        "description": "Breaks up an object into sub-objects that contain the specified number of\nkey-value pairs.\n\n\nIf there are fewer key-value pairs in an object than the specified number, the\nfunction will fill the object with those pairs. If there are more pairs, the\nfunction will fill another object with the extra pairs.",
        "examples": [
          {
            "source": "%dw 2.0\nimport divideBy from dw::core::Objects\noutput application/json\n---\n{ \"divideBy\" : {\"a\": 1, \"b\" : true, \"a\" : 2, \"b\" : false, \"c\" : 3} divideBy 2 }",
            "output": "{\n  \"divideBy\": [\n    {\n      \"a\": 1,\n      \"b\": true\n    },\n    {\n      \"a\": 2,\n      \"b\": false\n    },\n    {\n      \"c\": 3\n    }\n  ]\n}"
          }
        ]
      }
    ]
  },
  "doctypeasstring": {
    "name": "docTypeAsString",
    "overloads": [
      {
        "module": "dtd",
        "signature": "docTypeAsString(docType: DocType): String",
        "description": "Transforms a `DocType` value to a string representation.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::xml::Dtd\noutput application/json\n---\ndocTypeAsString({rootName: \"cXML\", systemId: \"http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd\"})",
            "output": "\"cXML SYSTEM http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd\""
          },
          {
            "source": "%dw 2.0\nimport * from dw::xml::Dtd\noutput application/json\n---\ndocTypeAsString({rootName: \"html\", publicId: \"-//W3C//DTD XHTML 1.0 Transitional//EN\", systemId: \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\"})",
            "output": "\"html PUBLIC -//W3C//DTD XHTML 1.0 Transitional//EN http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\""
          }
        ]
      }
    ]
  },
  "drop": {
    "name": "drop",
    "overloads": [
      {
        "module": "arrays",
        "signature": "drop<T>(array: Array<T>, n: Number): Array<T>",
        "description": "Drops the first `n` elements. It returns the original array when `n &lt;= 0`\nand an empty array when `n > sizeOf(array)`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\nvar users = [\"Mariano\", \"Leandro\", \"Julian\"]\noutput application/json\n---\ndrop(users, 2)",
            "output": "[\n  \"Julian\"\n]"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "drop(array: Null, n: Any): Null",
        "description": "Helper function that enables `drop` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "dropwhile": {
    "name": "dropWhile",
    "overloads": [
      {
        "module": "arrays",
        "signature": "dropWhile<T>(array: Array<T>, condition: (item: T) -> Boolean): Array<T>",
        "description": "Drops elements from the array while the condition is met but stops the selection process\nwhen it reaches an element that fails to satisfy the condition.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar arr = [0,1,3,2,1]\n---\narr dropWhile $ < 3",
            "output": "[\n  3,\n  2,\n  1\n]"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "dropWhile(array: Null, condition: (item: Nothing) -> Any): Null",
        "description": "Helper function that enables `dropWhile` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "duration": {
    "name": "duration",
    "overloads": [
      {
        "module": "periods",
        "signature": "duration(period: { days?: Number, hours?: Number, minutes?: Number, seconds?: Number }): Period",
        "description": "Creates a Period value that represents a number of days, hours,\nminutes, or seconds.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n   dayAfterDateTime: |2020-10-05T20:22:34.385Z| + duration({days: 1}),\n   dayAndHourBeforeDateTime: |2020-10-05T20:22:34.385Z| - duration({days: 1, hours: 1}),\n   pointInTimeBefore: |2020-10-05T20:22:34.385Z| - duration({days: 1, hours: 1, minutes: 20, seconds: 10}),\n   emptyDuration: duration({}),\n   constructDuration: duration({days:4, hours:11, minutes:28}),\n   selectHoursFromDuration: duration({days:4, hours:11, minutes:28}).hours,\n   decimalAsPeriod:  duration({seconds: 30.5}),\n   addNegativeValue: duration({ minutes : 1 }) + duration({ seconds : -1 })\n}",
            "output": "{\n   \"dayAfterDateTime\": \"2020-10-06T20:22:34.385Z\",\n   \"dayAndHourBeforeDateTime\": \"2020-10-04T19:22:34.385Z\",\n   \"pointInTimeBefore\": \"2020-10-04T19:02:24.385Z\",\n   \"emptyDuration\": \"PT0S\",\n   \"constructDuration\": \"PT107H28M\",\n   \"selectHoursFromDuration\": 11,\n   \"decimalAsPeriod\": \"PT30.5S\",\n   \"addNegativeValue\": 59\n}"
          }
        ]
      },
      {
        "module": "timer",
        "signature": "duration<T>(valueToMeasure: () -> T): DurationMeasurement<T>",
        "description": "Executes the input function and returns an object with execution time in\nmilliseconds and result of that function.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nfun myFunction() = dw::Runtime::wait(\"My result\",100)\n---\ndw::util::Timer::duration(() -> myFunction())",
            "output": "{\n  \"time\": 101,\n  \"result\": \"My result\"\n}"
          }
        ]
      }
    ]
  },
  "eachitem": {
    "name": "eachItem",
    "overloads": [
      {
        "module": "asserts",
        "signature": "eachItem(matcher: Matcher<Any>): Matcher<Array<Any>>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that each item of the array satisfies the given matcher",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n[1,2,3] must eachItem(beNumber())",
            "output": ""
          }
        ]
      }
    ]
  },
  "encodeuri": {
    "name": "encodeURI",
    "overloads": [
      {
        "module": "url",
        "signature": "encodeURI(text: String): String",
        "description": "Encodes a URI with UTF-8 escape sequences.\n\n\nApplies up to four escape sequences for characters composed of two \"surrogate\"\ncharacters. The function assumes that the URI is a complete URI, so it does\nnot encode reserved characters that have special meaning.\n\nThe function _does not encode these characters_ with UTF-8 escape sequences:\n\n[%header, cols=\"2,2\"]\n|===\n| Type (not escaped)   | Examples\n| Reserved characters  | ; , / ? : @ & = $\n| Unescaped characters | alphabetic, decimal digits, - _ . ! ~ * ' ( )\n| Number sign          | #\n|===",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::URL\noutput application/json\n---\n{\n    \"encodeURI\" : encodeURI(\"http://asd/ text to decode /%/\\\"\\\\/text\"),\n    \"not_encoded\": encodeURI(\"http://:;,/?:@&=\\$_-_.!~*'()\")\n}",
            "output": "{\n    \"encodeURI\": \"http://asd/%20text%20to%20decode%20/%25/%22%5C/text\",\n    \"not_encoded\": \"http://:;,/?:@&=$_-_.!~*'()\"\n}"
          }
        ]
      }
    ]
  },
  "encodeuricomponent": {
    "name": "encodeURIComponent",
    "overloads": [
      {
        "module": "url",
        "signature": "encodeURIComponent(text: String): String",
        "description": "Escapes certain characters in a URI component using UTF-8 encoding.\n\n\nThere can be only four escape sequences for characters composed of two\n\"surrogate\" * characters. `encodeURIComponent` escapes all characters\n_except the following_: alphabetic, decimal digits, `- _ . ! ~ * ' ( )`.\nNote that `encodeURIComponent` differs from `encodeURI` in that it encodes\nreserved characters and the Number sign `#` of `encodeURI`:\n\n[%header, cols=\"2,2\"]\n|===\n| Type                 | Includes\n| Reserved characters  |\n| Unescaped characters | alphabetic, decimal digits, - _ . ! ~ * ' ( )\n| Number sign          |\n|===",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::URL\noutput application/json\n---\n{\n  \"comparing_encode_functions_output\" : {\n  \t\"encodeURIComponent\" : encodeURI(\" PATH/ TO /ENCODE \"),\n  \t\"encodeURI\" : encodeURI(\" PATH/ TO /ENCODE \"),\n  \t\"encodeURIComponent_to_hex\" : encodeURIComponent(\";,/?:@&=\"),\n  \t\"encodeURI_not_to_hex\" : encodeURI(\";,/?:@&=\"),\n  \t\"encodeURIComponent_not_encoded\" : encodeURIComponent(\"-_.!~*'()\"),\n  \t\"encodeURI_not_encoded\" : encodeURI(\"-_.!~*'()\")\n  }\n}",
            "output": "{\n  \"comparing_encode_functions_output\": {\n    \"encodeURIComponent\": \"%20PATH/%20TO%20/ENCODE%20\",\n    \"encodeURI\": \"%20PATH/%20TO%20/ENCODE%20\",\n    \"encodeURIComponent_to_hex\": \"%3B%2C%2F%3F%3A%40%26%3D\",\n    \"encodeURI_not_to_hex\": \";,/?:@&=\",\n    \"encodeURIComponent_not_encoded\": \"-_.!~*'()\",\n    \"encodeURI_not_encoded\": \"-_.!~*'()\"\n  }\n}"
          }
        ]
      }
    ]
  },
  "endswith": {
    "name": "endsWith",
    "overloads": [
      {
        "module": "core",
        "signature": "endsWith(text: String, suffix: String): Boolean",
        "description": "Returns `true` if a string ends with a provided substring, `false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ \"Mariano\" endsWith \"no\", \"Mariano\" endsWith \"to\" ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "endsWith(text: Null, suffix: Any): false",
        "description": "Helper function that enables `endsWith` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "endwith": {
    "name": "endWith",
    "overloads": [
      {
        "module": "asserts",
        "signature": "endWith(expected:String): Matcher<String>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the asserted String ends with the given String",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"A Text\" must endWith(\"xt\")",
            "output": ""
          }
        ]
      }
    ]
  },
  "entriesof": {
    "name": "entriesOf",
    "overloads": [
      {
        "module": "core",
        "signature": "entriesOf<T <: Object>(obj: T): Array<{| key: Key, value: Any, attributes: Object |}>",
        "description": "Returns an array of key-value pairs that describe the key, value, and any\nattributes in the input object.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nvar myVar = read('<xml attr=\"x\"><a>true</a><b>1</b></xml>', 'application/xml')\noutput application/json\n---\n{ \"entriesOf\" : entriesOf(myVar) }",
            "output": "{\n  \"entriesOf\": [\n    {\n       \"key\": \"xml\",\n       \"value\": {\n         \"a\": \"true\",\n         \"b\": \"1\"\n       },\n       \"attributes\": {\n         \"attr\": \"x\"\n       }\n    }\n  ]\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "entriesOf(obj: Null): Null",
        "description": "Helper function that enables `entriesOf` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "entryset": {
    "name": "entrySet",
    "overloads": [
      {
        "module": "objects",
        "signature": "entrySet<T <: Object>(obj: T): Array<{| key: Key, value: Any, attributes: Object |}>",
        "description": "Returns an array of key-value pairs that describe the key, value, and any\nattributes in the input object.\n\n_This function is *Deprecated*. Use xref:dw-core-functions-entriesof.adoc[dw::Core::entriesOf], instead._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Objects\nvar myVar = read('<xml attr=\"x\"><a>true</a><b>1</b></xml>', 'application/xml')\noutput application/json\n---\n{ \"entrySet\" : entrySet(myVar) }",
            "output": "{\n  \"entrySet\": [\n    {\n       \"key\": \"xml\",\n       \"value\": {\n         \"a\": \"true\",\n         \"b\": \"1\"\n       },\n       \"attributes\": {\n         \"attr\": \"x\"\n       }\n    }\n  ]\n}"
          }
        ]
      }
    ]
  },
  "envvar": {
    "name": "envVar",
    "overloads": [
      {
        "module": "system",
        "signature": "envVar(variableName: String): String | Null",
        "description": "Returns an environment variable with the specified name or `null` if the\nenvironment variable is not defined.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::System\noutput application/json\n---\n{\n    \"envVars\" : [\n       \"real\" : envVar(\"SHELL\"),\n       \"fake\" : envVar(\"FAKE_ENV_VAR\")\n    ]\n}",
            "output": "\"envVars\": [\n  {\n    \"real\": \"/bin/bash\"\n  },\n  {\n    \"fake\": null\n  }\n]"
          }
        ]
      }
    ]
  },
  "envvars": {
    "name": "envVars",
    "overloads": [
      {
        "module": "system",
        "signature": "envVars(): Dictionary<String>",
        "description": "Returns all the environment variables defined in the host system as an array of strings.",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::System\noutput application/json\n---\n{ \"envVars\" : dw::System::envVars().SHELL }",
            "output": "{ \"envVars\": \"/bin/bash\" }"
          }
        ]
      }
    ]
  },
  "equalto": {
    "name": "equalTo",
    "overloads": [
      {
        "module": "asserts",
        "signature": "equalTo(expected: Any, equalToConfig: {unordered?: Boolean} = {}): Matcher<Any>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a value is equal to another one",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n(1 + 2) must equalTo(3)",
            "output": ""
          }
        ]
      }
    ]
  },
  "equaltoresource": {
    "name": "equalToResource",
    "overloads": [
      {
        "module": "asserts",
        "signature": "equalToResource(resourceName: String, contentType: String = \"application/dw\", readerProperties: Object = {}): Matcher<Any>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the given value is equal to the content of a resource file\n\nThe resource file must belong to the classpath",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n{ name: \"Lionel\", lastName: \"Messi\" } must equalToResource(\"user.json\", \"application/json\")",
            "output": ""
          }
        ]
      }
    ]
  },
  "eval": {
    "name": "eval",
    "overloads": [
      {
        "module": "runtime",
        "signature": "eval(fileToExecute: String, fs: Dictionary<String>, readerInputs: Dictionary<ReaderInput> = {}, inputValues: Dictionary<Any> = {}, configuration: RuntimeExecutionConfiguration = {}): EvalResult",
        "description": "Evaluates a script with the specified context and returns the result of that evaluation.\n\n_Experimental:_ This function is an experimental feature that is subject to change or removal from future versions of DataWeave.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\n\nvar jsonValue = {\n   value: '{\"name\": \"Mariano\"}' as Binary {encoding: \"UTF-8\"},\n   encoding: \"UTF-8\",\n   properties: {},\n   mimeType: \"application/json\"\n}\n\nvar jsonValue2 = {\n   value: '{\"name\": \"Mariano\", \"lastName\": \"achaval\"}' as Binary {encoding: \"UTF-8\"},\n   encoding: \"UTF-8\",\n   properties: {},\n   mimeType: \"application/json\"\n}\n\nvar invalidJsonValue = {\n   value: '{\"name\": \"Mariano' as Binary {encoding: \"UTF-8\"},\n   encoding: \"UTF-8\",\n   properties: {},\n   mimeType: \"application/json\"\n}\n\nvar Utils = \"fun sum(a,b) = a +b\"\noutput application/json\n---\n{\n   \"execute_ok\" : run(\"main.dwl\", {\"main.dwl\": \"{a: 1}\"}, {\"payload\": jsonValue }),\n   \"logs\" : do {\n     var execResult = run(\"main.dwl\", {\"main.dwl\": \"{a: log(1)}\"}, {\"payload\": jsonValue })\n     ---\n     {\n         m: execResult.logs.message,\n         l: execResult.logs.level\n     }\n   },\n   \"grant\" : eval(\"main.dwl\", {\"main.dwl\": \"{a: readUrl(`http://google.com`)}\"}, {\"payload\": jsonValue }, {},{ securityManager: (grant, args) -> false }),\n   \"library\" : eval(\"main.dwl\", {\"main.dwl\": \"Utils::sum(1,2)\", \"/Utils.dwl\": Utils }, {\"payload\": jsonValue }),\n   \"timeout\" : eval(\"main.dwl\", {\"main.dwl\": \"(1 to 1000000000000) map \\$ + 1\" }, {\"payload\": jsonValue }, {},{timeOut: 2}).success,\n   \"execFail\" : eval(\"main.dwl\", {\"main.dwl\": \"dw::Runtime::fail('My Bad')\" }, {\"payload\": jsonValue }),\n   \"parseFail\" : eval(\"main.dwl\", {\"main.dwl\": \"(1 + \" }, {\"payload\": jsonValue }),\n   \"writerFail\" : eval(\"main.dwl\", {\"main.dwl\": \"output application/xml --- 2\" }, {\"payload\": jsonValue }),\n   \"defaultOutput\" : eval(\"main.dwl\", {\"main.dwl\": \"payload\" }, {\"payload\": jsonValue2}, {},{outputMimeType: \"application/csv\", writerProperties: {\"separator\": \"|\"}}),\n   \"onExceptionFail\": do  {\n     dw::Runtime::try( () ->\n         eval(\"main.dwl\", {\"main.dwl\": \"dw::Runtime::fail('Failing Test')\" }, {\"payload\": jsonValue2}, {},{onException: \"FAIL\"})\n     ).success\n   },\n   \"customLogger\":\n        eval(\n  \"main.dwl\",\n           {\"main.dwl\": \"log(1234)\" },\n   {\"payload\": jsonValue2},\n    {},\n   {\n                  loggerService: {\n                     initialize: () -> {token: \"123\"},\n                     log: (level, msg, context) -> log(\"$(level) $(msg)\", context)\n                  }\n                }\n           )\n}",
            "output": "{\n  \"execute_ok\": {\n    \"success\": true,\n    \"value\": \"{\\n  a: 1\\n}\",\n    \"mimeType\": \"application/dw\",\n    \"encoding\": \"UTF-8\",\n    \"logs\": [\n\n    ]\n  },\n  \"logs\": {\n    \"m\": [\n      \"1\"\n    ],\n    \"l\": [\n      \"INFO\"\n    ]\n  },\n  \"grant\": {\n    \"success\": false,\n    \"message\": \"The given required permissions: `Resource` are not being granted for this execution.\\nTrace:\\n  at readUrl (Unknown)\\n  at main::main (line: 1, column: 5)\",\n    \"location\": {\n      \"start\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"end\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"content\": \"Unknown location\"\n    },\n    \"stack\": [\n      \"readUrl (anonymous:0:0)\",\n      \"main (main:1:5)\"\n    ],\n    \"logs\": [\n\n    ]\n  },\n  \"library\": {\n    \"success\": true,\n    \"value\": 3,\n    \"logs\": [\n\n    ]\n  },\n  \"timeout\": true,\n  \"execFail\": {\n    \"success\": false,\n    \"message\": \"My Bad\\nTrace:\\n  at fail (Unknown)\\n  at main::main (line: 1, column: 1)\",\n    \"location\": {\n      \"start\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"end\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"content\": \"Unknown location\"\n    },\n    \"stack\": [\n      \"fail (anonymous:0:0)\",\n      \"main (main:1:1)\"\n    ],\n    \"logs\": [\n\n    ]\n  },\n  \"parseFail\": {\n    \"success\": false,\n    \"message\": \"Invalid input \\\"1 + \\\", expected parameter or parenEnd (line 1, column 2):\\n\\n\\n1| (1 + \\n    ^^^^\\nLocation:\\nmain (line: 1, column:2)\",\n    \"location\": {\n      \"start\": {\n        \"index\": 0,\n        \"line\": 1,\n        \"column\": 2\n      },\n      \"end\": {\n        \"index\": 4,\n        \"line\": 1,\n        \"column\": 6\n      },\n      \"content\": \"\\n1| (1 + \\n    ^^^^\"\n    },\n    \"logs\": [\n\n    ]\n  },\n  \"writerFail\": {\n    \"success\": true,\n    \"value\": 2,\n    \"logs\": [\n\n    ]\n  },\n  \"defaultOutput\": {\n    \"success\": true,\n    \"value\": {\n      \"name\": \"Mariano\",\n      \"lastName\": \"achaval\"\n    },\n    \"logs\": [\n\n    ]\n  },\n  \"onExceptionFail\": false,\n  \"customLogger\": {\n    \"success\": true,\n    \"value\": 1234,\n    \"logs\": [\n\n    ]\n  }\n}"
          }
        ]
      }
    ]
  },
  "evalpath": {
    "name": "evalPath",
    "overloads": [
      {
        "module": "tests",
        "signature": "evalPath(dwlFilePath: String, context: Object, mimeType: String) : Any",
        "description": "`import * from dw::test::Tests`\n\nRuns a specific mapping with the given context and mimetype.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::test::Tests\nimport * from dw::test::Asserts\n---\n\"Test MyMapping\" describedBy [\n    \"Assert SimpleScenario\" in do {\n        evalPath(\"MyMapping.dwl\", inputsFrom(\"MyMapping/SimpleScenario\"), \"application/json\" ) must\n                  equalTo(outputFrom(\"MyMapping/SimpleScenario\"))\n    }\n ]",
            "output": ""
          }
        ]
      },
      {
        "module": "tests",
        "signature": "evalPath(testUrl: {content: String, url: String}, context: Object, mimeType: String): Any",
        "description": "`import * from dw::test::Tests`\n\nEvals a test with a given input values as a context and using the specified mimeType as default one when not specified in the file",
        "examples": []
      }
    ]
  },
  "evaluatecompatibilityflag": {
    "name": "evaluateCompatibilityFlag",
    "overloads": [
      {
        "module": "core",
        "signature": "evaluateCompatibilityFlag(flag: String): Boolean",
        "description": "Returns the value of the compatibility flag with the specified name.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  \"com.mulesoft.dw.xml_reader.honourMixedContentStructure\": evaluateCompatibilityFlag(\"com.mulesoft.dw.xml_reader.honourMixedContentStructure\")\n}",
            "output": "{\n  \"com.mulesoft.dw.xml_reader.honourMixedContentStructure\": true\n}"
          }
        ]
      }
    ]
  },
  "evalurl": {
    "name": "evalUrl",
    "overloads": [
      {
        "module": "runtime",
        "signature": "evalUrl(url: String, readerInputs: Dictionary<ReaderInput> = {}, inputValues: Dictionary<Any> = {}, configuration: RuntimeExecutionConfiguration = {}): EvalResult",
        "description": "Evaluates the script at the specified URL.\n\n_Experimental:_ This function is an experimental feature that is subject to change or removal from future versions of DataWeave.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\nvar jsonValue = {\n  value: '{\"name\": \"Mariano\"}' as Binary {encoding: \"UTF-8\"},\n  encoding: \"UTF-8\",\n  properties: {},\n  mimeType: \"application/json\"\n}\n\nvar Utils = \"fun sum(a,b) = a +b\"\noutput application/json\n---\n{\n  \"execute_ok\" : evalUrl(\"classpath://org/mule/weave/v2/engine/runtime_evalUrl/example.dwl\", {\"payload\": jsonValue }),\n  \"execute_ok_withValue\" : evalUrl(\"classpath://org/mule/weave/v2/engine/runtime_evalUrl/example.dwl\", {}, {\"payload\": {name: \"Mariano\"}})\n}",
            "output": "{\n   \"execute_ok\": {\n     \"success\": true,\n     \"value\": \"Mariano\",\n     \"logs\": [\n\n     ]\n   },\n   \"execute_ok_withValue\": {\n     \"success\": true,\n     \"value\": \"Mariano\",\n     \"logs\": [\n\n     ]\n   }\n }"
          }
        ]
      }
    ]
  },
  "every": {
    "name": "every",
    "overloads": [
      {
        "module": "arrays",
        "signature": "every<T>(list: Array<T>, condition: (T) -> Boolean): Boolean",
        "description": "Returns `true` if every element in the array matches the condition.\n\n\nThe function stops iterating after the first negative evaluation of an\nelement in the array.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\nvar arr0 = [] as Array<Number>\noutput application/json\n---\n{ \"results\" : [\n     \"ok\" : [\n        [1,1,1] every ($ == 1),\n        [1] every ($ == 1)\n     ],\n     \"err\" : [\n        [1,2,3] every ((log('should stop at 2 ==', $) mod 2) == 1),\n        [1,1,0] every ($ == 1),\n        [0,1,1,0] every (log('should stop at 0 ==', $) == 1),\n        [1,2,3] every ($ == 1),\n        arr0 every true,\n     ]\n   ]\n }",
            "output": "{\n   \"results\": [\n     {\n       \"ok\": [ true, true ]\n     },\n     {\n       \"err\": [ false, false, false, false, false ]\n     }\n   ]\n }"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "every(value: Null, condition: (Nothing) -> Any): Boolean",
        "description": "Helper function that enables `every` to work with a `null` value.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": []
      }
    ]
  },
  "everycharacter": {
    "name": "everyCharacter",
    "overloads": [
      {
        "module": "strings",
        "signature": "everyCharacter(text: String, condition: (character: String) -> Boolean): Boolean",
        "description": "Checks whether a condition is valid for _every_ character in a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n\"12 34  56\" everyCharacter $ == \" \" or isNumeric($)",
            "output": "true"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "everyCharacter(text: Null, condition: (character: Nothing) -> Any): true",
        "description": "Helper function that enables `everyCharacter` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "everyentry": {
    "name": "everyEntry",
    "overloads": [
      {
        "module": "objects",
        "signature": "everyEntry(object: Object, condition: (value: Any, key: Key) -> Boolean): Boolean",
        "description": "Returns `true` if every entry in the object matches the condition.\n\n\nThe function stops iterating after the first negative evaluation of an\nelement in the object.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport everyEntry from dw::core::Objects\noutput application/json\n---\n{\n    a: {} everyEntry (value, key) -> value is String,\n    b: {a: \"\", b: \"123\"} everyEntry (value, key) -> value is String,\n    c: {a: \"\", b: 123} everyEntry (value, key) -> value is String,\n    d: {a: \"\", b: 123} everyEntry (value, key) -> key as String == \"a\",\n    e: {a: \"\"} everyEntry (value, key) -> key as String == \"a\",\n    f: null everyEntry ((value, key) -> key as String == \"a\")\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false,\n  \"d\": false,\n  \"e\": true,\n  \"f\": true\n}"
          }
        ]
      },
      {
        "module": "objects",
        "signature": "everyEntry(list: Null, condition: (Nothing, Nothing) -> Boolean): Boolean",
        "description": "Helper function that enables `everyEntry` to work with a `null` value.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": []
      }
    ]
  },
  "exists": {
    "name": "exists",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "exists(path: Path):Boolean",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns true if the file exits",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ndw::io::file::FileSystem::exists(\"/tmp\")",
            "output": "true"
          }
        ]
      }
    ]
  },
  "extensionof": {
    "name": "extensionOf",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "extensionOf(path: Path): String | Null",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the extension of the file with the dot.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n%dw 2.0\n import * from dw::io::file::FileSystem\n output application/json\n ---\n {\n   a: extensionOf(path(\"/tmp\",\"foo.txt\")),\n   b: extensionOf(path(\"/tmp\",\"foo.html\")),\n   c: extensionOf(path(\"/tmp\",\"foo.json\")),\n   d: extensionOf(tmp()) //Directory should return null\n }",
            "output": "{\n   \"a\": \".txt\",\n   \"b\": \".html\",\n   \"c\": \".json\",\n   \"d\": null\n }"
          }
        ]
      }
    ]
  },
  "fail": {
    "name": "fail",
    "overloads": [
      {
        "module": "runtime",
        "signature": "fail(message: String = 'Error'): Nothing",
        "description": "Throws an exception with the specified message.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\nvar result = []\noutput application/json\n---\nif(sizeOf(result) <= 0) fail('Data was empty') else result",
            "output": "ERROR 2018-07-29 11:47:44,983 ...\n*********************************\nMessage               : \"Data was empty\n..."
          }
        ]
      }
    ]
  },
  "failif": {
    "name": "failIf",
    "overloads": [
      {
        "module": "runtime",
        "signature": "failIf<T>(value: T, evaluator: (value: T) -> Boolean, message: String = 'Failed'): T",
        "description": "Produces an error with the specified message if the expression in\nthe evaluator returns `true`. Otherwise, the function returns the value.",
        "examples": [
          {
            "source": "%dw 2.0\nimport failIf from dw::Runtime\nvar result = {}\noutput application/json\n---\n{ \"result\" : \"SUCCESS\" failIf (isEmpty(result)) }",
            "output": "ERROR 2018-07-29 11:56:39,988 ...\n**********************************\nMessage               : \"Failed"
          }
        ]
      }
    ]
  },
  "field": {
    "name": "field",
    "overloads": [
      {
        "module": "multipart",
        "signature": "field(opts: {| name: String, value: Any, mime?: String, fileName?: String |}): MultipartPart",
        "description": "Creates a `MultipartPart` data structure using the specified part name,\ninput content for the part, format (or mime type), and optionally, file name.\n\n\nThis version of the `field` function accepts arguments as an array of objects\nthat use the parameter names as keys, for example:\n`Multipart::field({name:\"order\",value: myOrder, mime: \"application/json\", fileName: \"order.json\"})`",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput multipart/form-data\nvar firstPart = \"content for my first part\"\nvar secondPart = \"content for my second part\"\n---\n{\n  parts: {\n    part1: Multipart::field({name:\"myFirstPart\",value: firstPart}),\n    part2: Multipart::field(\"mySecondPart\", secondPart)\n  }\n}",
            "output": "------=_Part_320_1528378161.1542639222352\nContent-Disposition: form-data; name=\"myFirstPart\"\ncontent for my first part\n------=_Part_320_1528378161.1542639222352\nContent-Disposition: form-data; name=\"mySecondPart\"\ncontent for my second part\n------=_Part_320_1528378161.1542639222352--"
          },
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput multipart/form-data\nvar myOrder = [\n  {\n    order: 1,\n    amount: 2\n  },\n  {\n    order: 32,\n    amount: 1\n  }\n]\nvar myClients = {\n  clients: {\n    client: {\n      id: 1,\n      name: \"Mariano\"\n    },\n    client: {\n      id: 2,\n      name: \"Shoki\"\n    }\n  }\n}\n---\n{\n  parts: {\n    order: Multipart::field({name:\"order\",value: myOrder, mime: \"application/json\", fileName: \"order.json\"}),\n    clients: Multipart::field({name:\"clients\", value: myClients, mime: \"application/xml\"})\n  }\n}",
            "output": "------=_Part_8032_681891620.1542560124825\nContent-Type: application/json\nContent-Disposition: form-data; name=\"order\"; filename=\"order.json\"\n\n[\n  {\n    \"order\": 1,\n    \"amount\": 2\n  },\n  {\n    \"order\": 32,\n    \"amount\": 1\n  }\n]\n------=_Part_8032_681891620.1542560124825\nContent-Type: application/xml\nContent-Disposition: form-data; name=\"clients\"\n\n<clients>\n  <client>\n    <id>1</id>\n    <name>Mariano</name>\n  </client>\n  <client>\n    <id>2</id>\n    <name>Shoki</name>\n  </client>\n</clients>\n------=_Part_8032_681891620.1542560124825--"
          }
        ]
      },
      {
        "module": "multipart",
        "signature": "field(name: String, value: Any, mime: String = \"\", fileName: String = \"\"): MultipartPart",
        "description": "Creates a `MultipartPart` data structure using the specified part name,\ninput content for the part, format (or mime type), and optionally, file name.\n\n\nThis version of the `field` function accepts arguments in a comma-separated\nlist, for example:\n\n[source,txt,linenums]\n----\nMultipart::field(\"order\", myOrder,\"application/json\", \"order.json\")`\n----",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput multipart/form-data\nvar myOrder = [\n  {\n    order: 1,\n    amount: 2\n  },\n  {\n    order: 32,\n    amount: 1\n  }\n]\nvar myClients = {\n  clients: {\n    client: {\n      id: 1,\n      name: \"Mariano\"\n    },\n    client: {\n      id: 2,\n      name: \"Shoki\"\n    }\n  }\n}\n---\n{\n  parts: {\n    order: Multipart::field(\"order\", myOrder, \"application/json\", \"order.json\"),\n    clients: Multipart::field(\"clients\", myClients, \"application/xml\")\n  }\n}",
            "output": "------=_Part_4846_2022598837.1542560230901\nContent-Type: application/json\nContent-Disposition: form-data; name=\"order\"; filename=\"order.json\"\n\n[\n  {\n    \"order\": 1,\n    \"amount\": 2\n  },\n  {\n    \"order\": 32,\n    \"amount\": 1\n  }\n]\n------=_Part_4846_2022598837.1542560230901\nContent-Type: application/xml\nContent-Disposition: form-data; name=\"clients\"\n\n<clients>\n  <client>\n    <id>1</id>\n    <name>Mariano</name>\n  </client>\n  <client>\n    <id>2</id>\n    <name>Shoki</name>\n  </client>\n</clients>\n------=_Part_4846_2022598837.1542560230901--"
          }
        ]
      },
      {
        "module": "values",
        "signature": "field(namespace: Namespace | Null = null, name: String): PathElement",
        "description": "This function creates a `PathElement` data type to use for selecting an\n_object field_ and populates the type's `selector` field with the given\nstring.\n\n\nSome versions of the `update` and `mask` functions accept a `PathElement` as\nan argument.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Values\nns ns0 http://acme.com/foo\n---\nfield(ns0 , \"myFieldName\")",
            "output": "{\n   \"kind\": \"Object\",\n   \"namespace\": \"http://acme.com/foo\",\n   \"selector\": \"myFieldName\"\n }"
          }
        ]
      }
    ]
  },
  "file": {
    "name": "file",
    "overloads": [
      {
        "module": "multipart",
        "signature": "file(opts: {| name: String, path: String, mime?: String, fileName?: String |})",
        "description": "Creates a `MultipartPart` data structure from a resource file.\n\n\nThis version of the `file` function accepts as argument an object containing key/value pairs, enabling you to enter the key/value pairs in any order, for example:\n\n[source,txt,linenums]\n----\nMultipart::file({ name: \"myFile\", path: \"myClients.json\", mime: \"application/json\", fileName: \"partMyClients.json\"})\n----",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput application/dw\nvar ordersFilePath = \"./orders.xml\"\n---\nMultipart::file{ name: \"file\", path: ordersFilePath, mime: \"application/xml\", fileName: \"orders.xml\" }",
            "output": "{\nheaders: {\n    \"Content-Type\": \"application/xml\",\n    \"Content-Disposition\": {\n      name: \"file\",\n      filename: \"orders.xml\"\n    }\n  },\n  content: \"<?xml version='1.0' encoding='UTF-8'?>\\n<orders>\\n  <order>\\n    <item>\\n      <id>1001</id>\\n      <qty>1</qty>\\n      <price>\\$100</price>\\n    </item>\\n    <item>\\n      <id>2001</id>\\n      <qty>2</qty>\\n      <price>\\$50</price>\\n    </item>\\n  </order>\\n</orders>\"\n}"
          },
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput multipart/form-data\nvar ordersFilePath = \"./orders.xml\"\nvar myArgs = { name: \"file\", path: ordersFilePath, mime: \"application/xml\", fileName: \"myorders.xml\"}\n---\nMultipart::form([\n  Multipart::file(myArgs)\n])",
            "output": "------=_Part_5349_1228640551.1560391284935\nContent-Type: application/xml\nContent-Disposition: form-data; name=\"file\"; filename=\"myorders.xml\"\n<?xml version='1.0' encoding='UTF-8'?>\n<orders>\n  <order>\n    <item>\n      <id>1001</id>\n      <qty>1</qty>\n      <price>$100</price>\n    </item>\n    <item>\n      <id>2001</id>\n      <qty>2</qty>\n      <price>$50</price>\n    </item>\n  </order>\n</orders>\n------=_Part_5349_1228640551.1560391284935--"
          }
        ]
      },
      {
        "module": "multipart",
        "signature": "file(fieldName: String, path: String, mime: String = 'application/octet-stream', sentFileName: String = 'filename')",
        "description": "Creates a `MultipartPart` data structure from a resource file.\n\n\nThis version of the `file` function accepts String arguments in a comma-separated\nlist, for example:\n\n[source,txt,linenums]\n----\nMultipart::field(\"myFile\", myClients, 'application/json', \"partMyClients.json\")\n----",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\nvar myClients = \"myClients.json\"\noutput multipart/form-data\n---\nMultipart::form([\n Multipart::file(\"myFile\", myClients, 'application/json', \"partMyClients.json\")\n])",
            "output": "------=_Part_1586_1887987980.1542569342438\nContent-Type: application/json\nContent-Disposition: form-data; name=\"myFile\"; filename=\"partMyClients.json\"\n\n{\n   clients: {\n     client: {\n       id: 1,\n       name: \"Mariano\"\n     },\n     client: {\n       id: 2,\n       name: \"Shoki\"\n     }\n   }\n}\n------=_Part_1586_1887987980.1542569342438--"
          }
        ]
      }
    ]
  },
  "filter": {
    "name": "filter",
    "overloads": [
      {
        "module": "core",
        "signature": "filter<T>(@StreamCapable items: Array<T>, criteria: (item: T, index: Number) -> Boolean): Array<T>",
        "description": "Iterates over an array and applies an expression that returns matching values.\n\n\nThe expression must return `true` or `false`. If the expression returns `true`\nfor a value or index in the array, the value gets captured in the output array.\nIf it returns `false` for a value or index in the array, that item gets\nfiltered out of the output. If there are no matches, the output array will\nbe empty.",
        "examples": [
          {
            "source": "[9,2,3,4,5] filter (value, index) -> (value > 2)",
            "output": "[9,3,4,5]"
          },
          {
            "source": "%dw 2.0\n---\n[{name: \"Mariano\", age: 37}, {name: \"Shoki\", age: 30}, {name: \"Tomo\", age: 25}, {name: \"Ana\", age: 29}]\n          filter ((value, index) -> value.age >= 30)",
            "output": "[\n   {\n     \"name\": \"Mariano\",\n     \"age\": 37\n   },\n   {\n     \"name\": \"Shoki\",\n     \"age\": 30\n   }\n]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "filter(@StreamCapable text: String, criteria: (character: String, index: Number) -> Boolean): String",
        "description": "Iterates over a string and applies an expression that returns matching values.\n\n\nThe expression must return `true` or `false`. If the expression returns `true`\nfor a character or index in the array, the character gets captured in the output string.\nIf it returns `false` for a character or index in the array, that character gets\nfiltered out of the output. If there are no matches, the output string will\nbe empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"hello world\" filter ($$ mod 2) == 0",
            "output": "\"hlowrd\""
          }
        ]
      },
      {
        "module": "core",
        "signature": "filter(@StreamCapable value: Null, criteria: (item: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `filter` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "filterarrayleafs": {
    "name": "filterArrayLeafs",
    "overloads": [
      {
        "module": "tree",
        "signature": "filterArrayLeafs(value: Any, criteria: (value: Any, path: Path) -> Boolean): Any",
        "description": "Applies a filtering expression to leaf or `Path` values of an array.\n\n\nThe leaf values in the array must be `SimpleType` or `Null` values. See\nhttps://docs.mulesoft.com/dataweave/latest/dw-core-types[Core Types]\nfor descriptions of the types.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\nvar myArray = [1, {name: [\"\", true], test: 213}, \"123\", null]\noutput application/json\n---\n{\n   a: myArray filterArrayLeafs ((value, path) ->\n        !(value is Null or value is String)),\n   b:  myArray filterArrayLeafs ((value, path) ->\n        (value is Null or value == 1)),\n   c: { a : [1,2] } filterArrayLeafs ((value, path) ->\n        (value is Null or value == 1)),\n   d: myArray filterArrayLeafs ((value, path) ->\n        !isArrayType(path))\n}",
            "output": "{\n  \"a\": [\n    1,\n    {\n      \"name\": [\n        true\n      ],\n      \"test\": 213\n    }\n  ],\n  \"b\": [\n    1,\n    {\n      \"name\": [\n\n      ],\n      \"test\": 213\n    },\n    null\n  ],\n  \"c\": {\n    \"a\": [\n     1\n    ]\n  },\n  \"d\": [\n    {\n      \"name\": [\n\n      ],\n      \"test\": 213\n    }\n  ]\n}"
          }
        ]
      }
    ]
  },
  "filterobject": {
    "name": "filterObject",
    "overloads": [
      {
        "module": "core",
        "signature": "filterObject<K, V>(@StreamCapable value: { (K)?: V }, criteria: (value: V, key: K, index: Number) -> Boolean): { (K)?: V }",
        "description": "Iterates a list of key-value pairs in an object and applies an expression that\nreturns only matching objects, filtering out the rest from the output.\n\n\nThe expression must return `true` or `false`. If the expression returns `true`\nfor a key, value, or index of an object, the object gets captured in the\noutput. If it returns `false` for any of them, the object gets filtered out\nof the output. If there are no matches, the output array will be empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\"a\" : \"apple\", \"b\" : \"banana\"} filterObject ((value) -> value == \"apple\")",
            "output": "{ \"a\": \"apple\" }"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\"letter1\": \"a\", \"letter2\": \"b\", \"id\": 1} filterObject ((value, key) -> key startsWith \"letter\")",
            "output": "{ \"letter1\": \"a\", \"letter2\": \"b\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "filterObject(value: Null, criteria: (value: Nothing, key: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `filterObject` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "filterobjectleafs": {
    "name": "filterObjectLeafs",
    "overloads": [
      {
        "module": "tree",
        "signature": "filterObjectLeafs(value: Any, criteria: (value: Any, path: Path) -> Boolean): Any",
        "description": "Applies a filtering expression to leaf or `Path` values of keys in\nan object.\n\n\nThe leaf values in the object must be `SimpleType` or `Null` values. See\nhttps://docs.mulesoft.com/dataweave/latest/dw-core-types[Core Types]\nfor descriptions of the types.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\nvar myArray = [{name @(mail: \"me@me.com\", test:123 ): \"\", id:\"test\"},\n               {name: \"Me\", id:null}]\noutput application/json\n---\n{\n a: {\n     name: \"Mariano\",\n     lastName: null,\n     age: 123,\n     friends: myArray\n    }  filterObjectLeafs ((value, path) ->\n         !(value is Null or value is String)),\n b: { c : null, d : \"hello\" } filterObjectLeafs ((value, path) ->\n         (value is Null and isObjectType(path)))\n}",
            "output": "{\n  \"a\": {\n    \"age\": 123,\n    \"friends\": [\n      {\n\n      },\n      {\n\n      }\n    ]\n  },\n  \"b\": {\n    \"c\": null\n  }\n}"
          }
        ]
      }
    ]
  },
  "filtertree": {
    "name": "filterTree",
    "overloads": [
      {
        "module": "tree",
        "signature": "filterTree(value: Any, criteria: (value: Any, path: Path) -> Boolean): Any",
        "description": "Filters the value or path of nodes in an input based on a\nspecified `criteria`.\n\n\nThe function iterates through the nodes in the input. The\n`criteria` can apply to the value or path in the input. If\nthe `criteria` evaluates to `true`, the node remains in the\noutput. If `false`, the function filters out the node.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\noutput application/dw\n---\n{\n    a: {\n          name : \"\",\n          lastName @(foo: \"\"): \"Achaval\",\n          friends @(id: 123): [{id: \"\", test: true}, {age: 123}, \"\"]\n        } filterTree ((value, path) ->\n            value match  {\n                            case s is String -> !isEmpty(s)\n                            else -> true\n                          }\n    ),\n    b: null filterTree ((value, path) -> value is String),\n    c: [\n            {name: \"Mariano\", friends: []},\n            {test: [1,2,3]},\n            {dw: \"\"}\n        ] filterTree ((value, path) ->\n            value match  {\n                            case a is Array ->  !isEmpty(a as Array)\n                            else -> true\n                        })\n}",
            "output": "{\n  a: {\n    lastName: \"Achaval\",\n    friends @(id: 123): [\n      {\n        test: true\n      },\n      {\n        age: 123\n      }\n    ]\n  },\n  b: null,\n  c: [\n    {\n      name: \"Mariano\"\n    },\n    {\n      test: [\n        1,\n        2,\n        3\n      ]\n    },\n    {\n      dw: \"\"\n    }\n  ]\n}"
          }
        ]
      }
    ]
  },
  "find": {
    "name": "find",
    "overloads": [
      {
        "module": "core",
        "signature": "find<T>(@StreamCapable() elements: Array<T>, elementToFind: Any): Array<Number>",
        "description": "Returns indices of an input that match a specified value.\n\n\nThis version of the function returns indices of an array. Others return\nindices of a string.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[\"Bond\", \"James\", \"Bond\"] find \"Bond\"",
            "output": "[0,2]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "find(@StreamCapable() text: String, matcher: Regex): Array<Array<Number>>",
        "description": "Returns the indices in the text that match the specified regular expression\n(regex), followed by the capture groups.\n\n\nThe first element in each resulting sub-array is the index in the text that\nmatches the regex, and the next ones are the capture groups in the regex\n(if present).\n\nNote: To retrieve parts of the text that match a regex. use the `scan` function.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"I heart DataWeave\" find /\\w*ea\\w*(\\b)/",
            "output": "[ [2,7], [8,17] ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "find(@StreamCapable() text: String, textToFind: String): Array<Number>",
        "description": "Lists indices where the specified characters of a string are present.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"aabccdbce\" find \"a\"",
            "output": "[0,1]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "find(@StreamCapable() text: Null, textToFind: Any): Array<Nothing>",
        "description": "Helper function that enables `find` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "finddataformatdescriptorbymime": {
    "name": "findDataFormatDescriptorByMime",
    "overloads": [
      {
        "module": "runtime",
        "signature": "findDataFormatDescriptorByMime(mime: dw::module::Mime::MimeType): DataFormatDescriptor | Null",
        "description": "Returns the `DataFormatDescriptor` based on the `dw::module::Mime::MimeType` specified or `null` if\nthere is no `DataFormatDescriptor` for the given `MimeType`.\n\n_Experimental:_ This function is an experimental feature that is subject to change or removal from future versions of DataWeave.\n\n_Introduced in DataWeave version 2.7.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\noutput application/json\n\nvar jsonDF = findDataFormatDescriptorByMime({'type': \"*\", subtype: \"json\", parameters: {}})\nvar unknownDF = findDataFormatDescriptorByMime({'type': \"*\", subtype: \"*\", parameters: {}})\n\nfun simplify(df: DataFormatDescriptor | Null) = df  match {\n  case d is DataFormatDescriptor -> { name: d.name, defaultMimeType: d.defaultMimeType }\n  case is Null -> { name: \"unknown\", defaultMimeType: \"unknown\" }\n}\n---\n{\n  json: simplify(jsonDF),\n  unknown: simplify(unknownDF)\n}",
            "output": "{\n  \"json\": {\n    \"name\": \"json\",\n    \"defaultMimeType\": \"application/json\"\n  },\n  \"unknown\": {\n    \"name\": \"unknown\",\n    \"defaultMimeType\": \"unknown\"\n  }\n}"
          }
        ]
      }
    ]
  },
  "first": {
    "name": "first",
    "overloads": [
      {
        "module": "strings",
        "signature": "first(text: String, amount: Number): String",
        "description": "Returns characters from the beginning of a string to the\nspecified number of characters in the string, for example,\nthe first two characters of a string.\n\n\nIf the number is equal to or greater than the number of characters\nin the string, the function returns the entire string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport first from dw::core::Strings\noutput application/json\n---\n\"hello world!\" first 5",
            "output": "\"hello\""
          }
        ]
      },
      {
        "module": "strings",
        "signature": "first(text: Null, amount: Any): Null",
        "description": "Helper function that enables `first` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "firstwith": {
    "name": "firstWith",
    "overloads": [
      {
        "module": "arrays",
        "signature": "firstWith<T>(array: Array<T>, condition: (item: T, index: Number) -> Boolean): T | Null",
        "description": "Returns the first element that satisfies the condition, or returns `null` if no\nelement meets the condition.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport firstWith from dw::core::Arrays\nvar users = [{name: \"Mariano\", lastName: \"Achaval\"}, {name: \"Ana\", lastName: \"Felisatti\"}, {name: \"Mariano\", lastName: \"de Sousa\"}]\n---\n{\n  a: users firstWith ((user, index) -> user.name == \"Mariano\"),\n  b: users firstWith ((user, index) -> user.name == \"Peter\")\n}",
            "output": "{\n  \"a\": {\n    \"name\": \"Mariano\",\n    \"lastName\": \"Achaval\"\n  },\n  \"b\": null\n}"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "firstWith(array: Null, condition: (item: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `firstWith` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "flatmap": {
    "name": "flatMap",
    "overloads": [
      {
        "module": "core",
        "signature": "flatMap<T, R>(@StreamCapable items: Array<T>, mapper: (item: T, index: Number) -> Array<R>): Array<R>",
        "description": "Iterates over each item in an array and flattens the results.\n\n\nInstead of returning an array of arrays (as `map` does when you iterate over\nthe values within an input like `[ [1,2], [3,4] ]`), `flatMap` returns a\nflattened array that looks like this: `[1, 2, 3, 4]`. `flatMap` is similar to\n`flatten`, but `flatten` only acts on the values of the arrays, while\n`flatMap` can act on values and indices of items in the array.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ [3,5], [0.9,5.5] ] flatMap (value, index) -> value",
            "output": "[ 3, 5, 0.9, 5.5]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "flatMap<T, R>(@StreamCapable value: Null, mapper: (item: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `flatMap` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "flatten": {
    "name": "flatten",
    "overloads": [
      {
        "module": "core",
        "signature": "flatten<T, Q>(@StreamCapable items: Array<Array<T> | Q>): Array<T | Q>",
        "description": "Turns a set of subarrays (such as `[ [1,2,3], [4,5,[6]], [], [null] ]`) into a single, flattened array (such as `[ 1, 2, 3, 4, 5, [6], null ]`).\n\n\nNote that it flattens only the first level of subarrays and omits empty subarrays.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nvar array1 = [1,2,3]\nvar array2 = [4,5,6]\nvar array3 = [7,8,9]\nvar arrayOfArrays = [array1, array2, array3]\n---\nflatten(arrayOfArrays)",
            "output": "[ 1,2,3,4,5,6,7,8,9 ]"
          },
          {
            "source": "%dw 2.0\nvar myData =\n{ user : [\n   {\n     group : \"dev\",\n     myarray : [\n       { name : \"Shoki\", id : 5678 },\n       { name : \"Mariano\", id : 9123 }\n     ]\n   },\n   {\n     group : \"test\",\n     myarray : [\n       { name : \"Sai\", id : 2001 },\n       { name : \"Peter\", id : 2002 }\n     ]\n   }\n ]\n}\noutput application/json\n---\nflatten(myData.user.myarray)",
            "output": "[\n  {\n    \"name\": \"Shoki\",\n    \"id\": 5678\n  },\n  {\n    \"name\": \"Mariano\",\n    \"id\": 9123\n  },\n  {\n    \"name\": \"Sai\",\n    \"id\": 2001\n  },\n  {\n    \"name\": \"Peter\",\n    \"id\": 2002\n  }\n]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "flatten(@StreamCapable value: Null): Null",
        "description": "Helper function that enables `flatten` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "floor": {
    "name": "floor",
    "overloads": [
      {
        "module": "core",
        "signature": "floor(number: Number): Number",
        "description": "Rounds a number down to the nearest whole number.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ floor(1.5), floor(2.2), floor(3) ]",
            "output": "[ 1, 2, 3]"
          }
        ]
      }
    ]
  },
  "form": {
    "name": "form",
    "overloads": [
      {
        "module": "multipart",
        "signature": "form(parts: Array<MultipartPart>): Multipart",
        "description": "Creates a `Multipart` data structure using a specified array of parts.",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput multipart/form-data\nvar myOrders = \"./orders.xml\"\nvar fileArgs = { name: \"file\", path: myOrders, mime: \"application/xml\", fileName: \"myorders.xml\"}\nvar fieldArgs = {name:\"userName\",value: \"Annie Point\", mime: \"text/plain\"}\n---\nMultipart::form([\n  Multipart::file(fileArgs),\n  Multipart::field(fieldArgs),\n  Multipart::field(\"myJson\", {\"user\": \"Annie Point\"}, \"application/json\", \"userInfo.json\")\n])",
            "output": "------=_Part_146_143704079.1560394078604\nContent-Type: application/xml\nContent-Disposition: form-data; name=\"file\"; filename=\"myorders.xml\"\n<?xml version='1.0' encoding='UTF-8'?>\n<orders>\n  <order>\n    <item>\n      <id>1001</id>\n      <qty>1</qty>\n      <price>$100</price>\n    </item>\n    <item>\n      <id>2001</id>\n      <qty>2</qty>\n      <price>$50</price>\n    </item>\n  </order>\n</orders>\n------=_Part_146_143704079.1560394078604\nContent-Type: text/plain\nContent-Disposition: form-data; name=\"userName\"\nAnnie Point\n------=_Part_146_143704079.1560394078604\nContent-Type: application/json\nContent-Disposition: form-data; name=\"myJson\"; filename=\"userInfo.json\"\n{\n  \"user\": \"Annie Point\"\n}\n------=_Part_146_143704079.1560394078604--"
          },
          {
            "source": "%dw 2.0\nimport dw::module::Multipart\noutput multipart/form-data\nvar firstPart = \"content for my first part\"\nvar secondPart = \"content for my second part\"\n---\n{\n  parts: {\n    part1: Multipart::field({name:\"myFirstPart\",value: firstPart}),\n    part2: Multipart::field(\"mySecondPart\", secondPart)\n  }\n}",
            "output": "------=_Part_320_1528378161.1542639222352\nContent-Disposition: form-data; name=\"myFirstPart\"\n\ncontent for my first part\n------=_Part_320_1528378161.1542639222352\nContent-Disposition: form-data; name=\"mySecondPart\"\n\ncontent for my second part\n------=_Part_320_1528378161.1542639222352--"
          }
        ]
      }
    ]
  },
  "frombase64": {
    "name": "fromBase64",
    "overloads": [
      {
        "module": "binaries",
        "signature": "fromBase64(base64String: String): Binary",
        "description": "Transforms a Base64 string into a binary value.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Binaries\noutput application/octet-stream\n---\nfromBase64(payload)",
            "output": ""
          }
        ]
      }
    ]
  },
  "frombinary": {
    "name": "fromBinary",
    "overloads": [
      {
        "module": "numbers",
        "signature": "fromBinary(binaryText: String): Number",
        "description": "Transforms from a binary number into a decimal number.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport fromBinary from dw::core::Numbers\noutput application/json\n---\n{\n    a: fromBinary(\"-10\"),\n    b: fromBinary(\"11111000111010111010110100101011100001001110000011010101100010111101001011100000100010011000011101100101101001111101111010110010010100110010100100000000000000000000000000000000000000000000000000000000000000\"),\n    c: fromBinary(0),\n    d: fromBinary(null),\n    e: fromBinary(\"100\"),\n}",
            "output": "{\n  \"a\": -2,\n  \"b\": 100000000000000000000000000000000000000000000000000000000000000,\n  \"c\": 0,\n  \"d\": null,\n  \"e\": 4\n}"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "fromBinary(binaryText: Null): Null",
        "description": "Helper function that enables `fromBinary` to work with null value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "fromcharcode": {
    "name": "fromCharCode",
    "overloads": [
      {
        "module": "strings",
        "signature": "fromCharCode(charCode: Number): String",
        "description": "Returns a character that matches the specified Unicode.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"fromCharCode\" : fromCharCode(117)\n}",
            "output": "{ \"fromCharCode\": \"u\" }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "fromCharCode(charCode: Null): Null",
        "description": "Helper function that enables `fromCharCode` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "fromhex": {
    "name": "fromHex",
    "overloads": [
      {
        "module": "binaries",
        "signature": "fromHex(hexString: String): Binary",
        "description": "Transforms a hexadecimal string into a binary.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Binaries\noutput application/dw\n---\n{ \"hexToBinary\": fromHex(\"4D756C65\") }",
            "output": "{\n   hexToBinary: \"TXVsZQ==\" as Binary {base: \"64\"}\n}"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "fromHex(hexText: String): Number",
        "description": "Transforms a hexadecimal number into decimal number.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport fromHex from dw::core::Numbers\noutput application/json\n---\n{\n    a: fromHex(\"-1\"),\n    b: fromHex(\"3e3aeb4ae1383562f4b82261d969f7ac94ca4000000000000000\"),\n    c: fromHex(0),\n    d: fromHex(null),\n    e: fromHex(\"f\"),\n}",
            "output": "{\n  \"a\": -1,\n  \"b\": 100000000000000000000000000000000000000000000000000000000000000,\n  \"c\": 0,\n  \"d\": null,\n  \"e\": 15\n}"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "fromHex(hexText: Null): Null",
        "description": "Helper function that enables `fromHex` to work with null value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "fromradixnumber": {
    "name": "fromRadixNumber",
    "overloads": [
      {
        "module": "numbers",
        "signature": "fromRadixNumber(numberStr: String, radix: Number): Number",
        "description": "Transforms a number in the specified radix into decimal number\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport fromRadixNumber from dw::core::Numbers\noutput application/json\n---\n{\n    a: fromRadixNumber(\"10\", 2),\n    b: fromRadixNumber(\"FF\", 16)\n}",
            "output": "{\n  \"a\": 2,\n  \"b\": 255\n}"
          }
        ]
      }
    ]
  },
  "fromstring": {
    "name": "fromString",
    "overloads": [
      {
        "module": "mime",
        "signature": "fromString(mimeType: String): Result<MimeType, MimeTypeError>",
        "description": "Transforms a MIME type string value representation to a `MimeType`.\n\n_Introduced in DataWeave version 2.7.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::module::Mime\noutput application/json\n---\nfromString(\"application/json\")",
            "output": "{\n  \"success\": true,\n  \"result\": {\n      \"type\": \"application\",\n      \"subtype\": \"json\",\n      \"parameters\": {}\n  }\n}"
          },
          {
            "source": "%dw 2.0\nimport * from dw::module::Mime\noutput application/json\n---\nfromString(\"multipart/form-data; boundary=the-boundary\")",
            "output": "{\n  \"success\": true,\n  \"result\": {\n      \"type\": \"multipart\",\n      \"subtype\": \"form-data\",\n      \"parameters\": {\n          \"boundary\": \"the-boundary\"\n      }\n  }\n}"
          }
        ]
      }
    ]
  },
  "functionparamtypes": {
    "name": "functionParamTypes",
    "overloads": [
      {
        "module": "types",
        "signature": "functionParamTypes(t: Type): Array<FunctionParam>",
        "description": "Returns the list of parameters from the given function type.\nThis function fails if the provided type is not a Function type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::core::Types\ntype AFunction = (String, Number) -> Number\ntype AFunction2 = () -> Number\n---\n{\n    a: functionParamTypes(AFunction),\n    b: functionParamTypes(AFunction2)\n}",
            "output": "{\n   \"a\": [\n     {\n       \"paramType\": \"String\",\n       \"optional\": false\n     },\n     {\n       \"paramType\": \"Number\",\n       \"optional\": false\n     }\n   ],\n   \"b\": [\n\n   ]\n }"
          }
        ]
      }
    ]
  },
  "functionreturntype": {
    "name": "functionReturnType",
    "overloads": [
      {
        "module": "types",
        "signature": "functionReturnType(t: Type): Type | Null",
        "description": "Returns the type of a function's return type.\nThis function fails if the input type is not a Function type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::core::Types\ntype AFunction = (String, Number) -> Number\ntype AFunction2 = () -> Number\n---\n{\n    a: functionReturnType(AFunction),\n    b: functionReturnType(AFunction2)\n}",
            "output": "{\n  \"a\": \"Number\",\n  \"b\": \"Number\"\n}"
          }
        ]
      }
    ]
  },
  "generateboundary": {
    "name": "generateBoundary",
    "overloads": [
      {
        "module": "multipart",
        "signature": "generateBoundary(len: Number = 70): String",
        "description": "Helper function for generating boundaries in `Multipart` data structures.",
        "examples": []
      }
    ]
  },
  "groupby": {
    "name": "groupBy",
    "overloads": [
      {
        "module": "core",
        "signature": "groupBy<T, R>(items: Array<T>, criteria: (item: T, index: Number) -> R): {| (R): Array<T> |}",
        "description": "Returns an object that groups items from an array based on specified\ncriteria, such as an expression or matching selector.\n\n\nThis version of `groupBy` groups the elements of an array using the\n`criteria` function. Other versions act on objects and handle null values.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[\"a\",\"b\",\"c\"] groupBy (item, index) -> index",
            "output": "{ \"2\": [ \"c\" ], \"1\": [ \"b\" ], \"0\": [ \"a\" ] }"
          },
          {
            "source": "%dw 2.0\nvar myArray = [\n   { \"name\": \"Foo\", \"language\": \"Java\" },\n   { \"name\": \"Bar\", \"language\": \"Scala\" },\n   { \"name\": \"FooBar\", \"language\": \"Java\" }\n]\noutput application/json\n---\nmyArray groupBy (item) -> item.language",
            "output": "{\n  \"Scala\": [\n    { \"name\": \"Bar\", \"language\": \"Scala\" }\n  ],\n  \"Java\": [\n    { \"name\": \"Foo\", \"language\": \"Java\" },\n    { \"name\": \"FooBar\", \"language\": \"Java\" }\n  ]\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "groupBy<R>(text: String, criteria: (character: String, index: Number) -> R): { (R): String }",
        "description": "Returns an object that groups characters from a string based on specified\ncriteria, such as an expression or matching selector.\n\n\nThis version of `groupBy` groups the elements of an array using the\n`criteria` function. Other versions act on objects and handle `null` values.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"hello world!\" groupBy (not isEmpty($ find /[aeiou]/))",
            "output": "{\n  \"false\": \"hll wrld!\",\n  \"true\": \"eoo\"\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "groupBy<K, V, R>(object: { (K)?: V }, criteria: (value: V, key: K) -> R): { (R): { (K)?: V } }",
        "description": "Groups elements of an object based on criteria that the `groupBy`\nuses to iterate over elements in the input.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"a\" : \"b\", \"c\" : \"d\"} groupBy upper($)",
            "output": "{ \"D\": { \"c\": \"d\" }, \"B\": { \"a\": \"b\" } }"
          },
          {
            "source": "%dw 2.0\nvar myRead =\nread(\"<prices><price>9.99</price><price>10.99</price></prices>\",\"application/xml\")\noutput application/json\n---\nmyRead.prices groupBy \"costs\"",
            "output": "{ \"costs\" : { \"price\": \"9.99\", \"price\": \"10.99\" } }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "groupBy(value: Null, criteria: (Nothing, Nothing) -> Any): Null",
        "description": "Helper function that enables `groupBy` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "hammingdistance": {
    "name": "hammingDistance",
    "overloads": [
      {
        "module": "strings",
        "signature": "hammingDistance(a: String, b: String): Number | Null",
        "description": "Returns the Hamming distance between two strings.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport hammingDistance from dw::core::Strings\noutput application/json\n---\n\"holu\" hammingDistance \"chau\"",
            "output": "3"
          }
        ]
      }
    ]
  },
  "hashwith": {
    "name": "hashWith",
    "overloads": [
      {
        "module": "crypto",
        "signature": "hashWith(content: Binary, @CryptographicSink algorithm: String = \"SHA-1\"): Binary",
        "description": "Computes the hash value of binary content using a specified algorithm.\n\n\nThe first argument specifies the binary content to use to calculate the hash value, and the second argument specifies the hashing algorithm to use. The second argument must be any of the accepted Algorithm names:\n\n\n[%header%autowidth.spread]\n|===\n|Algorithm names |Description\n|`MD2` |The MD2 message digest algorithm as defined in https://www.ietf.org/rfc/rfc1319.txt[RFC 1319].\n|`MD5` |The MD5 message digest algorithm as defined in https://www.ietf.org/rfc/rfc1321.txt[RFC 1321].\n|`SHA-1`, `SHA-256`, `SHA-384`, `SHA-512` | Hash algorithms defined in the https://csrc.nist.gov/publications/fips[FIPS PUB 180-2]. SHA-256 is a 256-bit hash function intended to provide 128 bits of security against collision attacks, while SHA-512 is a 512-bit hash function intended to provide 256 bits of security. A 384-bit hash may be obtained by truncating the SHA-512 output.\n|===",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::Crypto\noutput application/json\n---\n{ \"md2\" : Crypto::hashWith(\"hello\" as Binary, \"MD2\") }",
            "output": "{ \"md2\": \"\\ufffd\\u0004ls\\ufffd\\u00031\\ufffdh\\ufffd}8\\u0004\\ufffd\\u0006U\" }"
          }
        ]
      }
    ]
  },
  "haveitem": {
    "name": "haveItem",
    "overloads": [
      {
        "module": "asserts",
        "signature": "haveItem(matcher: Matcher<Any>): Matcher<Array<Any>>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that at least one item of the array satisfies the given matcher",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n[1, true, \"a text\"] must haveItem(beNumber())",
            "output": ""
          }
        ]
      }
    ]
  },
  "havekey": {
    "name": "haveKey",
    "overloads": [
      {
        "module": "asserts",
        "signature": "haveKey(keyName: String): Matcher<Object>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the Object has the given key",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n{ name: \"Lionel\", lastName: \"Messi\" } must haveKey(\"name\")",
            "output": ""
          }
        ]
      }
    ]
  },
  "havesize": {
    "name": "haveSize",
    "overloads": [
      {
        "module": "asserts",
        "signature": "haveSize(expectedSize: Number): Matcher<Array | String | Object | Null>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the array has the given size",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n[1, 4, 7] must haveSize(3)",
            "output": ""
          }
        ]
      }
    ]
  },
  "havevalue": {
    "name": "haveValue",
    "overloads": [
      {
        "module": "asserts",
        "signature": "haveValue(value: Any): Matcher<Object>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the Object has the given value",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n{ name: \"Lionel\", lastName: \"Messi\" } must haveValue(\"Messi\")",
            "output": ""
          }
        ]
      }
    ]
  },
  "hmacbinary": {
    "name": "HMACBinary",
    "overloads": [
      {
        "module": "crypto",
        "signature": "HMACBinary(secret: Binary, content: Binary, @CryptographicSink algorithm: String = \"HmacSHA1\"): Binary",
        "description": "Computes an HMAC hash (with a secret cryptographic key) on input content.\n\n\nSee also, `HMACWith`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::Crypto\noutput application/json\n---\n{\n  \"HMACBinary\" : Crypto::HMACBinary(\"confidential\" as Binary, \"xxxxx\" as Binary, \"HmacSHA512\")\n}",
            "output": "{\n  \"HMACBinary\": \"\\ufffd\\ufffd\\ufffd\\ufffd^h\\ufffd!3\\u0005\\ufffd֎\\u00017\\ufffd\\ufffd\\ufffd`\\ufffd8?\\ufffdjn7\\ufffdbs;\\t\\ufffdƅ\\ufffd\\ufffd\\ufffdx&g\\ufffd~\\ufffd\\ufffd%\\ufffd7>1\\ufffdK\\u000e@\\ufffdC\\u0011\\ufffdT\\ufffd}W\"\n}"
          }
        ]
      }
    ]
  },
  "hmacwith": {
    "name": "HMACWith",
    "overloads": [
      {
        "module": "crypto",
        "signature": "HMACWith(secret: Binary, content: Binary, @Since(version = \"2.2.0\") algorithm: String = \"HmacSHA1\"): String",
        "description": "Computes an HMAC hash (with a secret cryptographic key) on input content,\nthen transforms the result into a lowercase, hexadecimal string.\n\n\nSee also, `HMACBinary`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::Crypto\noutput application/json\n---\n{ \"HMACWith\" : Crypto::HMACWith(\"secret_key\" as Binary, \"Some value to hash\" as Binary, \"HmacSHA256\") }",
            "output": "{ \"HMACWith\": \"b51b4fe8c4e37304605753272b5b4321f9644a9b09cb1179d7016c25041d1747\" }"
          }
        ]
      }
    ]
  },
  "home": {
    "name": "home",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "home(): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the Path value of the home directory.",
        "examples": []
      }
    ]
  },
  "hours": {
    "name": "hours",
    "overloads": [
      {
        "module": "periods",
        "signature": "hours(nHours: Number): Period",
        "description": "Creates a Period value from the provided number of hours.\n\n\nThe function applies the `duration` function to the input value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n   nextHour: |2020-10-05T20:22:34.385Z| + hours(1),\n   previousHour: |2020-10-05T20:22:34.385Z| - hours(1),\n   threeHoursLater: |20:22| + hours(3),\n   addDecimalInput: |20:22| + hours(3.5),\n   decimalInputAsPeriod : hours(4.555),\n   fourHourPeriod : hours(4),\n   addNegativeValue: hours(-1) + hours(2)\n}",
            "output": "{\n   \"nextHour\": \"2020-10-05T21:22:34.385Z\",\n   \"previousHour\": \"2020-10-05T19:22:34.385Z\",\n   \"threeHoursLater\": \"23:22:00\",\n   \"addDecimalInput\": \"23:52:00\",\n   \"decimalInputAsPeriod\": \"PT4H33M18S\",\n   \"fourHourPeriod\": \"PT4H\",\n   \"addNegativeValue\": 3600\n}"
          }
        ]
      }
    ]
  },
  "in": {
    "name": "in",
    "overloads": [
      {
        "module": "tests",
        "signature": "in<Ctx <: Object>(testSetup: { config: TestConfig<Ctx>, testName: String }, test: (c: Ctx) -> MatcherResult): TestResult",
        "description": "`import * from dw::test::Tests`\n\nDefines a new test case inside a test suite with its relevant context.\nIntended to be used in combination with withConfig",
        "examples": [
          {
            "source": "var config = {\n  setup: () -> { contextString: \"context\" },\n  teardown: () -> {}\n}\n---\n\"It should generate context for following tests\" withConfig config in do {\n  $.contextString must beString()\n }",
            "output": ""
          }
        ]
      },
      {
        "module": "tests",
        "signature": "in<Ctx <: Object>(testSetup: { config: TestConfig<Ctx>, testName: String }, test: Array<(c: Ctx) -> MatcherResult>): TestResult",
        "description": "`import * from dw::test::Tests`\n\nDefines multiple new test cases inside a test suite that share the same context.\nIntended to be used in combination with withConfig",
        "examples": [
          {
            "source": "var config = {\n  setup: () -> { contextString: \"context\" },\n  teardown: () -> {}\n}\n---\n\"It should generate context for following tests\" withConfig config in  [\n  do { $.contextString must beString() },\n  do { $.otherContext must equalTo(3) }\n]",
            "output": ""
          }
        ]
      },
      {
        "module": "tests",
        "signature": "in<T>(testName: String, testCases: (Null) -> MatcherResult): TestResult",
        "description": "`import * from dw::test::Tests`\n\nDefines a new test case inside a test suite with a single assertion.",
        "examples": [
          {
            "source": "\"It should support nested matching\" in  do {\n   \"foo\" must beString()\n}",
            "output": ""
          }
        ]
      },
      {
        "module": "tests",
        "signature": "in(testName: String, callback: Array<(Null) -> MatcherResult>): TestResult",
        "description": "`import * from dw::test::Tests`\n\nDefines a new test case with multiple assertions",
        "examples": [
          {
            "source": "\"It should support multiple root cases\" in do {\n     var payload = {}\n     var flowVar = {a: 123}\n     ---\n    [\n        payload must beObject(),\n        flowVar must [\n             beObject(),\n             $.a must equalTo(123)\n          ]\n      ]\n }",
            "output": ""
          }
        ]
      }
    ]
  },
  "index": {
    "name": "index",
    "overloads": [
      {
        "module": "values",
        "signature": "index(index: Number): PathElement",
        "description": "This function creates a `PathElement` data type to use for selecting an\n_array element_ and populates the type's `selector` field with the specified\nindex.\n\n\nSome versions of the `update` and `mask` functions accept a `PathElement` as\nan argument.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Values\nns ns0 http://acme.com/foo\n---\nindex(0)",
            "output": "{\n   \"kind\": \"Array\",\n   \"namespace\": null,\n   \"selector\": 0\n }"
          }
        ]
      }
    ]
  },
  "indexof": {
    "name": "indexOf",
    "overloads": [
      {
        "module": "arrays",
        "signature": "indexOf<T>(array: Array<T>, toFind: T): Number",
        "description": "Returns the index of the first occurrence of an element within the array. If the value is not found, the function returns `-1`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar users = [\"Mariano\", \"Leandro\", \"Julian\"]\n---\nindexOf(users, \"Julian\")",
            "output": "2"
          }
        ]
      },
      {
        "module": "core",
        "signature": "indexOf(array: Array, value: Any): Number",
        "description": "Returns the index of the _first_ occurrence of the specified element in this array, or `-1` if this list does not contain the element.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  present: [\"a\",\"b\",\"c\",\"d\"] indexOf \"c\",\n  notPresent: [\"x\",\"w\",\"x\"] indexOf \"c\",\n  presentMoreThanOnce: [\"a\",\"b\",\"c\",\"c\"] indexOf \"c\",\n}",
            "output": "{\n   \"present\": 2,\n   \"notPresent\": -1,\n   \"presentMoreThanOnce\": 2\n }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "indexOf(theString: String, search: String): Number",
        "description": "Returns the index of the *first* occurrence of the specified String in this String.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  present: \"abcd\" indexOf \"c\",\n  notPresent: \"xyz\" indexOf \"c\",\n  presentMoreThanOnce: \"abcdc\" indexOf \"c\",\n}",
            "output": "{\n   \"present\": 2,\n   \"notPresent\": -1,\n   \"presentMoreThanOnce\": 2\n }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "indexOf(array: Null, value: Any): Number",
        "description": "Helper method to make indexOf null friendly\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "indexwhere": {
    "name": "indexWhere",
    "overloads": [
      {
        "module": "arrays",
        "signature": "indexWhere<T>(array: Array<T>, condition: (item: T) -> Boolean): Number",
        "description": "Returns the index of the first occurrence of an element that matches a\ncondition within the array. If no element matches the condition, the function returns `-1`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar users = [\"Mariano\", \"Leandro\", \"Julian\"]\n---\nusers indexWhere (item) -> item startsWith \"Jul\"",
            "output": "2"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "indexWhere(array: Null, condition: (item: Nothing) -> Any): Null",
        "description": "Helper function that enables `indexWhere` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "inputsfrom": {
    "name": "inputsFrom",
    "overloads": [
      {
        "module": "tests",
        "signature": "inputsFrom(dir: String): {_?: Any}",
        "description": "`import * from dw::test::Tests`\n\nBuilds an object with all the inputs to be used as context for a specific mapping.",
        "examples": []
      }
    ]
  },
  "intersectionitems": {
    "name": "intersectionItems",
    "overloads": [
      {
        "module": "types",
        "signature": "intersectionItems(t: Type): Array<Type>",
        "description": "Returns an array of all the types that define a given Intersection type.\nThis function fails if the input is not an Intersection type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = {name: String} & {age: Number}\noutput application/json\n---\n{\n   a: intersectionItems(AType)\n}",
            "output": "{\n  \"a\": [\"Object\",\"Object\"]\n}"
          }
        ]
      }
    ]
  },
  "isalpha": {
    "name": "isAlpha",
    "overloads": [
      {
        "module": "strings",
        "signature": "isAlpha(text: String): Boolean",
        "description": "Checks if the `text` contains only Unicode digits. This excludes digits, punctuation, and other nonletter characters.\n\n\nNote that the method does not allow for a leading sign, either positive or negative.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport isAlpha from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": isAlpha(null),\n  \"b\": isAlpha(\"\"),\n  \"c\": isAlpha(\"  \"),\n  \"d\": isAlpha(\"abc\"),\n  \"e\": isAlpha(\"ab2c\"),\n  \"f\": isAlpha(\"ab-c\")\n}",
            "output": "{\n  \"a\": false,\n  \"b\": false,\n  \"c\": false,\n  \"d\": true,\n  \"e\": false,\n  \"f\": false\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "isAlpha(text: Null): Boolean",
        "description": "Helper function that enables `isAlpha` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "isalphanumeric": {
    "name": "isAlphanumeric",
    "overloads": [
      {
        "module": "strings",
        "signature": "isAlphanumeric(text: String): Boolean",
        "description": "Checks if the `text` contains only Unicode letters or digits.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport isAlphanumeric from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": isAlphanumeric(null),\n  \"b\": isAlphanumeric(\"\"),\n  \"c\": isAlphanumeric(\"  \"),\n  \"d\": isAlphanumeric(\"abc\"),\n  \"e\": isAlphanumeric(\"ab c\"),\n  \"f\": isAlphanumeric(\"ab2c\"),\n  \"g\": isAlphanumeric(\"ab-c\")\n}",
            "output": "{\n  \"a\": false,\n  \"b\": false,\n  \"c\": false,\n  \"d\": true,\n  \"e\": false,\n  \"f\": true,\n  \"g\": false\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "isAlphanumeric(text: Null): Boolean",
        "description": "Helper function that enables `isAlphanumeric` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "isanytype": {
    "name": "isAnyType",
    "overloads": [
      {
        "module": "types",
        "signature": "isAnyType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Any type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AAny = Any\noutput application/json\n---\n{\n   a: isAnyType(AAny),\n   b: isAnyType(Any),\n   c: isAnyType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isarraytype": {
    "name": "isArrayType",
    "overloads": [
      {
        "module": "tree",
        "signature": "isArrayType(path: Path): Boolean",
        "description": "Returns `true` if the provided `Path` value is an `ARRAY_TYPE` expression.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\noutput application/json\n---\n{\n  a: isArrayType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n                  {kind: ATTRIBUTE_TYPE, selector: \"name\", namespace: null}]),\n  b: isArrayType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n                  {kind: ARRAY_TYPE, selector: 0, namespace: null}]),\n  c: isArrayType([{kind: ARRAY_TYPE, selector: 0, namespace: null}])\n}",
            "output": "{\n  \"a\": false,\n  \"b\": true,\n  \"c\": true\n}"
          }
        ]
      },
      {
        "module": "types",
        "signature": "isArrayType(t: Type): Boolean",
        "description": "Returns `true` if the input type is the Array type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = Array<String>\noutput application/json\n---\n{\n   a: isArrayType(AType),\n   b: isArrayType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false\n}"
          }
        ]
      }
    ]
  },
  "isattributetype": {
    "name": "isAttributeType",
    "overloads": [
      {
        "module": "tree",
        "signature": "isAttributeType(path: Path): Boolean",
        "description": "Returns `true` if the provided `Path` value is an `ATTRIBUTE_TYPE` expression.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\noutput application/json\n---\n{\n  a: isAttributeType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n                      {kind: ATTRIBUTE_TYPE, selector: \"name\", namespace: null}]),\n  b: isAttributeType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n                      {kind: ARRAY_TYPE, selector: \"name\", namespace: null}]),\n  c: isAttributeType([{kind: ATTRIBUTE_TYPE, selector: \"name\", namespace: null}])\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false,\n  \"c\": true\n}"
          }
        ]
      }
    ]
  },
  "isbinarytype": {
    "name": "isBinaryType",
    "overloads": [
      {
        "module": "types",
        "signature": "isBinaryType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Binary type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ABinary = Binary\noutput application/json\n---\n{\n   a: isBinaryType(ABinary),\n   b: isBinaryType(Binary),\n   c: isBinaryType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isblank": {
    "name": "isBlank",
    "overloads": [
      {
        "module": "core",
        "signature": "isBlank(text: String | Null): Boolean",
        "description": "Returns `true` if the given string is empty (`\"\"`), completely composed of whitespaces, or `null`. Otherwise, the function returns `false`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput  application/json\nvar someString = \"something\"\nvar nullString = null\n---\n{\n  // checking if the string is blank\n  \"emptyString\" : isBlank(\"\"),\n  \"stringWithSpaces\" : isBlank(\"      \"),\n  \"textString\" : isBlank(someString),\n  \"somePayloadValue\" : isBlank(payload.nonExistingValue),\n  \"nullString\" : isBlank(nullString),\n\n  // checking if the string is not blank\n  \"notEmptyTextString\" : not isBlank(\" 1234\"),\n  \"notEmptyTextStringTwo\" : ! isBlank(\"\")\n}",
            "output": "{\n  \"emptyString\": true,\n  \"stringWithSpaces\": true,\n  \"textString\": false,\n  \"somePayloadValue\": true,\n  \"nullString\": true,\n  \"notEmptyTextString\": true,\n  \"notEmptyTextStringTwo\": false\n}"
          }
        ]
      }
    ]
  },
  "isbooleantype": {
    "name": "isBooleanType",
    "overloads": [
      {
        "module": "types",
        "signature": "isBooleanType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Boolean type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ABoolean = Boolean\noutput application/json\n---\n{\n   a: isBooleanType(ABoolean),\n   b: isBooleanType(Boolean),\n   c: isBooleanType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isdatetimetype": {
    "name": "isDateTimeType",
    "overloads": [
      {
        "module": "types",
        "signature": "isDateTimeType(t: Type): Boolean",
        "description": "Returns `true` if the input is the DateTime type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ADateTime = DateTime\noutput application/json\n---\n{\n   a: isDateTimeType(ADateTime),\n   b: isDateTimeType(DateTime),\n   c: isDateTimeType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isdatetype": {
    "name": "isDateType",
    "overloads": [
      {
        "module": "types",
        "signature": "isDateType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Date type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ADate = Date\noutput application/json\n---\n{\n   a: isDateType(ADate),\n   b: isDateType(Date),\n   c: isDateType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isdecimal": {
    "name": "isDecimal",
    "overloads": [
      {
        "module": "core",
        "signature": "isDecimal(number: Number): Boolean",
        "description": "Returns `true` if the given number contains a decimal, `false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isDecimal(1.1), isDecimal(1), isDecimal(\"1.1\") ]",
            "output": "[ true, false, true ]"
          }
        ]
      }
    ]
  },
  "isempty": {
    "name": "isEmpty",
    "overloads": [
      {
        "module": "core",
        "signature": "isEmpty(elements: Array<Any>): Boolean",
        "description": "Returns `true` if the given input value is empty, `false` if not.\n\n\nThis version of `isEmpty` acts on an array. Other versions\nact on a string or object, and handle null values.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isEmpty([]), isEmpty([1]) ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "isEmpty(value: String): Boolean",
        "description": "Returns `true` if the input string is empty, `false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isEmpty(\"\"), isEmpty(\"DataWeave\") ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "isEmpty(value: Object): Boolean",
        "description": "Returns `true` if the given object is empty, `false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isEmpty({}), isEmpty({name: \"DataWeave\"}) ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "isEmpty(value: Binary): Boolean",
        "description": "Returns `true` if the input binary is empty, `false` if not.\n\n_Introduced in DataWeave version 2.11.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isEmpty(\"\" as Binary), isEmpty(\"DataWeave\" as Binary) ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "isEmpty(value: Null): true",
        "description": "Returns `true` if the input is `null`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"nullValue\" : isEmpty(null) }",
            "output": "{ \"nullValue\": true }"
          }
        ]
      }
    ]
  },
  "iseven": {
    "name": "isEven",
    "overloads": [
      {
        "module": "core",
        "signature": "isEven(number: Number): Boolean",
        "description": "Returns `true` if the number or numeric result of a mathematical operation is\neven, `false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput  application/json\n---\n{ \"isEven\" : [ isEven(0), isEven(1), isEven(1+1) ] }",
            "output": "{ \"isEven\" : [ true, false, true ] }"
          }
        ]
      }
    ]
  },
  "isfunctiontype": {
    "name": "isFunctionType",
    "overloads": [
      {
        "module": "types",
        "signature": "isFunctionType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Function type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AFunction = (String) -> String\noutput application/json\n---\n{\n   a: isFunctionType(AFunction),\n   b: isFunctionType(Boolean)\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false\n}"
          }
        ]
      }
    ]
  },
  "ishandledby": {
    "name": "isHandledBy",
    "overloads": [
      {
        "module": "mime",
        "signature": "isHandledBy(base: MimeType, other: MimeType): Boolean",
        "description": "Returns `true` if the given `MimeType` value is handled by the base `MimeType` value.\n\n_Introduced in DataWeave version 2.7.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::module::Mime\noutput application/json\n\nvar JSON = {'type': \"application\", subtype: \"json\", parameters: {}}\nvar MULTIPART = {'type': \"multipart\", subtype: \"form-data\", parameters: {boundary: \"my-boundary\"}}\nvar ALL = {'type': \"*\", subtype: \"*\", parameters: {}}\n---\n{\n  a: isHandledBy(JSON, JSON),\n  b: isHandledBy({'type': \"*\", subtype: \"json\", parameters: {}}, JSON),\n  c: isHandledBy({'type': \"application\", subtype: \"*\", parameters: {}}, JSON),\n  d: isHandledBy(ALL, MULTIPART),\n  e: isHandledBy(MULTIPART, ALL),\n  f: isHandledBy(JSON, MULTIPART),\n  g: isHandledBy(\n    {'type': \"application\", subtype: \"*+xml\", parameters: {}},\n    {'type': \"application\", subtype: \"soap+xml\", parameters: {}})\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": true,\n  \"d\": true,\n  \"e\": false,\n  \"f\": false,\n  \"g\": true\n}"
          }
        ]
      }
    ]
  },
  "isinteger": {
    "name": "isInteger",
    "overloads": [
      {
        "module": "core",
        "signature": "isInteger(number: Number): Boolean",
        "description": "Returns `true` if the given number is an integer (which lacks decimals),\n`false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[isInteger(1), isInteger(2.0), isInteger(2.2), isInteger(\"1\")]",
            "output": "[ true, true, false, true ]"
          }
        ]
      }
    ]
  },
  "isintersectiontype": {
    "name": "isIntersectionType",
    "overloads": [
      {
        "module": "types",
        "signature": "isIntersectionType(t: Type): Boolean",
        "description": "Returns `true` if the input type is the Intersection type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = {name: String} & {age: Number}\noutput application/json\n---\n{\n   a: isIntersectionType(AType),\n   b: isIntersectionType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false\n}"
          }
        ]
      }
    ]
  },
  "iskeytype": {
    "name": "isKeyType",
    "overloads": [
      {
        "module": "types",
        "signature": "isKeyType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Key type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AKey = Key\noutput application/json\n---\n{\n   a: isKeyType(AKey),\n   b: isKeyType(Key),\n   c: isKeyType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isleapyear": {
    "name": "isLeapYear",
    "overloads": [
      {
        "module": "core",
        "signature": "isLeapYear(dateTime: DateTime): Boolean",
        "description": "Returns `true` if it receives a date for a leap year, `false` if not.\n\n\nThis version of `leapYear` acts on a `DateTime` type. Other versions act on\nthe other date and time formats that DataWeave supports.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isLeapYear(|2016-10-01T23:57:59|), isLeapYear(|2017-10-01T23:57:59|) ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "isLeapYear(date: Date): Boolean",
        "description": "Returns `true` if the input `Date` is a leap year, 'false' if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ isLeapYear(|2016-10-01|), isLeapYear(|2017-10-01|) ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "isLeapYear(datetime: LocalDateTime): Boolean",
        "description": "Returns `true` if the input local date-time is a leap year, 'false' if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ |2016-10-01T23:57:59-03:00|, |2016-10-01T23:57:59Z| ] map isLeapYear($)",
            "output": "[ true, true ]"
          }
        ]
      }
    ]
  },
  "isliteraltype": {
    "name": "isLiteralType",
    "overloads": [
      {
        "module": "types",
        "signature": "isLiteralType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Literal type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ALiteralType = \"Mariano\"\noutput application/json\n---\n{\n   a: isLiteralType(ALiteralType),\n   b: isLiteralType(Boolean)\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false\n}"
          }
        ]
      }
    ]
  },
  "islocaldatetimetype": {
    "name": "isLocalDateTimeType",
    "overloads": [
      {
        "module": "types",
        "signature": "isLocalDateTimeType(t: Type): Boolean",
        "description": "Returns `true` if the input is the LocalDateTime type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ALocalDateTime = LocalDateTime\noutput application/json\n---\n{\n   a: isLocalDateTimeType(ALocalDateTime),\n   b: isLocalDateTimeType(LocalDateTime),\n   c: isLocalDateTimeType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "islocaltimetype": {
    "name": "isLocalTimeType",
    "overloads": [
      {
        "module": "types",
        "signature": "isLocalTimeType(t: Type): Boolean",
        "description": "Returns `true` if the input is the LocalTime type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ALocalTime = LocalTime\noutput application/json\n---\n{\n   a: isLocalTimeType(ALocalTime),\n   b: isLocalTimeType(LocalTime),\n   c: isLocalTimeType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "islowercase": {
    "name": "isLowerCase",
    "overloads": [
      {
        "module": "strings",
        "signature": "isLowerCase(text: String): Boolean",
        "description": "Checks if the `text` contains only lowercase Unicode characters.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport isLowerCase from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": isLowerCase(null),\n  \"b\": isLowerCase(\"\"),\n  \"c\": isLowerCase(\"  \"),\n  \"d\": isLowerCase(\"abc\"),\n  \"e\": isLowerCase(\"aBC\"),\n  \"f\": isLowerCase(\"a c\"),\n  \"g\": isLowerCase(\"a1c\"),\n  \"h\": isLowerCase(\"a/c\"),\n  \"i\": isLowerCase(\"mulesöft\"),\n  \"j\": isLowerCase(\"mulesÖft\")\n}",
            "output": "{\n  \"a\": false,\n  \"b\": false,\n  \"c\": false,\n  \"d\": false,\n  \"e\": false,\n  \"f\": false,\n  \"g\": false,\n  \"h\": false,\n  \"i\": true,\n  \"j\": false\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "isLowerCase(text: Null): Boolean",
        "description": "Helper function that enables `isLowerCase` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "isnamespacetype": {
    "name": "isNamespaceType",
    "overloads": [
      {
        "module": "types",
        "signature": "isNamespaceType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Namespace type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ANamespace = Namespace\noutput application/json\n---\n{\n   a: isNamespaceType(ANamespace),\n   b: isNamespaceType(Namespace),\n   c: isNamespaceType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isnothingtype": {
    "name": "isNothingType",
    "overloads": [
      {
        "module": "types",
        "signature": "isNothingType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Nothing type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ANothing = Nothing\noutput application/json\n---\n{\n   a: isNothingType(ANothing),\n   b: isNothingType(Nothing),\n   c: isNothingType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isnulltype": {
    "name": "isNullType",
    "overloads": [
      {
        "module": "types",
        "signature": "isNullType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Null type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ANull = Null\noutput application/json\n---\n{\n   a: isNullType(ANull),\n   b: isNullType(Null),\n   c: isNullType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isnumbertype": {
    "name": "isNumberType",
    "overloads": [
      {
        "module": "types",
        "signature": "isNumberType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Number type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ANumber = Number\noutput application/json\n---\n{\n   a: isNumberType(ANumber),\n   b: isNumberType(Number),\n   c: isNumberType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isnumeric": {
    "name": "isNumeric",
    "overloads": [
      {
        "module": "strings",
        "signature": "isNumeric(text: String): Boolean",
        "description": "Checks if the `text` contains only Unicode digits.\n\n\nA decimal point is not a Unicode digit and returns false.\nNote that the method does not allow for a leading sign, either positive or\nnegative.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport isNumeric from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": isNumeric(null),\n  \"b\": isNumeric(\"\"),\n  \"c\": isNumeric(\"  \"),\n  \"d\": isNumeric(\"123\"),\n  \"e\": isNumeric(\"१२३\"),\n  \"f\": isNumeric(\"12 3\"),\n  \"g\": isNumeric(\"ab2c\"),\n  \"h\": isNumeric(\"12-3\"),\n  \"i\": isNumeric(\"12.3\"),\n  \"j\": isNumeric(\"-123\"),\n  \"k\": isNumeric(\"+123\")\n}",
            "output": "{\n  \"a\": false,\n  \"b\": false,\n  \"c\": false,\n  \"d\": true,\n  \"e\": true,\n  \"f\": false,\n  \"g\": false,\n  \"h\": false,\n  \"i\": false,\n  \"j\": false,\n  \"k\": false\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "isNumeric(text: Null): Boolean",
        "description": "Helper function that enables `isNumeric` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "isobjecttype": {
    "name": "isObjectType",
    "overloads": [
      {
        "module": "tree",
        "signature": "isObjectType(path: Path): Boolean",
        "description": "Returns `true` if the provided `Path` value is an `OBJECT_TYPE` expression.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\noutput application/json\n---\n{\n  a: isObjectType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n                   {kind: ATTRIBUTE_TYPE, selector: \"name\", namespace: null}]),\n  b: isObjectType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null},\n                   {kind: OBJECT_TYPE, selector: \"name\", namespace: null}]),\n  c: isObjectType([{kind: OBJECT_TYPE, selector: \"user\", namespace: null}])\n}",
            "output": "{\n  \"a\": false,\n  \"b\": true,\n  \"c\": true\n}"
          }
        ]
      },
      {
        "module": "types",
        "signature": "isObjectType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Object type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = {name: String}\noutput application/json\n---\n{\n   a: isObjectType(AType),\n   b: isObjectType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false\n}"
          }
        ]
      }
    ]
  },
  "isodd": {
    "name": "isOdd",
    "overloads": [
      {
        "module": "core",
        "signature": "isOdd(number: Number): Boolean",
        "description": "Returns `true` if the number or numeric result of a mathematical operation is\nodd, `false` if not.",
        "examples": [
          {
            "source": "%dw 2.0\noutput  application/json\n---\n{ \"isOdd\" : [ isOdd(0), isOdd(1), isOdd(2+2) ] }",
            "output": "{ \"isOdd\": [ false, true, false ] }"
          }
        ]
      }
    ]
  },
  "isperiodtype": {
    "name": "isPeriodType",
    "overloads": [
      {
        "module": "types",
        "signature": "isPeriodType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Period type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype APeriod = Period\noutput application/json\n---\n{\n   a: isPeriodType(APeriod),\n   b: isPeriodType(Period),\n   c: isPeriodType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "israngetype": {
    "name": "isRangeType",
    "overloads": [
      {
        "module": "types",
        "signature": "isRangeType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Range type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ARange = Range\noutput application/json\n---\n{\n   a: isRangeType(ARange),\n   b: isRangeType(Range),\n   c: isRangeType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isreferencetype": {
    "name": "isReferenceType",
    "overloads": [
      {
        "module": "types",
        "signature": "isReferenceType(t: Type): Boolean",
        "description": "Returns `true` if the input type is a Reference type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::core::Types\n type AArray = Array<String> {n: 1}\n type AArray2 = Array<AArray>\n ---\n {\n     a: isReferenceType( AArray),\n     b: isReferenceType(arrayItem(AArray2)),\n     c: isReferenceType(String)\n }",
            "output": "{\n  \"a\": false,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isregextype": {
    "name": "isRegexType",
    "overloads": [
      {
        "module": "types",
        "signature": "isRegexType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Regex type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ARegex = Regex\noutput application/json\n---\n{\n   a: isRegexType(ARegex),\n   b: isRegexType(Regex),\n   c: isRegexType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isstringtype": {
    "name": "isStringType",
    "overloads": [
      {
        "module": "types",
        "signature": "isStringType(t: Type): Boolean",
        "description": "Returns `true` if the input is the String type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AString = String\noutput application/json\n---\n{\n   a: isStringType(AString),\n   b: isStringType(String),\n   c: isStringType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "istimetype": {
    "name": "isTimeType",
    "overloads": [
      {
        "module": "types",
        "signature": "isTimeType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Time type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ATime = Time\noutput application/json\n---\n{\n   a: isTimeType(ATime),\n   b: isTimeType(Time),\n   c: isTimeType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "istimezonetype": {
    "name": "isTimeZoneType",
    "overloads": [
      {
        "module": "types",
        "signature": "isTimeZoneType(t: Type): Boolean",
        "description": "Returns `true` if the input is the TimeZone type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype ATimeZone = TimeZone\noutput application/json\n---\n{\n   a: isTimeZoneType(ATimeZone),\n   b: isTimeZoneType(TimeZone),\n   c: isTimeZoneType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "istypetype": {
    "name": "isTypeType",
    "overloads": [
      {
        "module": "types",
        "signature": "isTypeType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Type type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = Type\noutput application/json\n---\n{\n   a: isTypeType(AType),\n   b: isTypeType(Type),\n   c: isTypeType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "isuniontype": {
    "name": "isUnionType",
    "overloads": [
      {
        "module": "types",
        "signature": "isUnionType(t: Type): Boolean",
        "description": "Returns `true` if the input type is the Union type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = String | Number\noutput application/json\n---\n{\n   a: isUnionType(AType),\n   b: isUnionType(Boolean),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false\n}"
          }
        ]
      }
    ]
  },
  "isuppercase": {
    "name": "isUpperCase",
    "overloads": [
      {
        "module": "strings",
        "signature": "isUpperCase(text: String): Boolean",
        "description": "Checks if the `text` contains only uppercase characters.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport isUpperCase from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": isUpperCase(null),\n  \"b\": isUpperCase(\"\"),\n  \"c\": isUpperCase(\"  \"),\n  \"d\": isUpperCase(\"ABC\"),\n  \"e\": isUpperCase(\"aBC\"),\n  \"f\": isUpperCase(\"A C\"),\n  \"g\": isUpperCase(\"A1C\"),\n  \"h\": isUpperCase(\"A/C\")\n}",
            "output": "{\n  \"a\": false,\n  \"b\": false,\n  \"c\": false,\n  \"d\": true,\n  \"e\": false,\n  \"f\": false,\n  \"g\": false,\n  \"h\": false\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "isUpperCase(text: Null): Boolean",
        "description": "Helper function that enables `isUpperCase` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "isuritype": {
    "name": "isUriType",
    "overloads": [
      {
        "module": "types",
        "signature": "isUriType(t: Type): Boolean",
        "description": "Returns `true` if the input is the Uri type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AUri = Uri\noutput application/json\n---\n{\n   a: isUriType(AUri),\n   b: isUriType(Uri),\n   c: isUriType(String),\n}",
            "output": "{\n  \"a\": true,\n  \"b\": true,\n  \"c\": false\n}"
          }
        ]
      }
    ]
  },
  "iswhitespace": {
    "name": "isWhitespace",
    "overloads": [
      {
        "module": "strings",
        "signature": "isWhitespace(text: String): Boolean",
        "description": "Checks if the `text` contains only whitespace.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport isWhitespace from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": isWhitespace(null),\n  \"b\": isWhitespace(\"\"),\n  \"c\": isWhitespace(\"  \"),\n  \"d\": isWhitespace(\"abc\"),\n  \"e\": isWhitespace(\"ab2c\"),\n  \"f\": isWhitespace(\"ab-c\")\n}",
            "output": "{\n  \"a\": false,\n  \"b\": true,\n  \"c\": true,\n  \"d\": false,\n  \"e\": false,\n  \"f\": false\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "isWhitespace(text: Null): Boolean",
        "description": "Helper function that enables `isWhitespace` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "join": {
    "name": "join",
    "overloads": [
      {
        "module": "arrays",
        "signature": "join<L <: Object, R <: Object>(left: Array<L>, right: Array<R>, leftCriteria: (leftValue: L) -> String, rightCriteria: (rightValue: R) -> String): Array<Pair<L, R>>",
        "description": "Joins two arrays of objects by a given ID criteria.\n\n\n`join` returns an array all the `left` items, merged by ID with any\nright items that exist.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\nvar users = [{id: \"1\", name:\"Mariano\"},{id: \"2\", name:\"Leandro\"},{id: \"3\", name:\"Julian\"},{id: \"5\", name:\"Julian\"}]\nvar products = [{ownerId: \"1\", name:\"DataWeave\"},{ownerId: \"1\", name:\"BAT\"}, {ownerId: \"3\", name:\"DataSense\"}, {ownerId: \"4\", name:\"SmartConnectors\"}]\noutput application/json\n---\njoin(users, products, (user) -> user.id, (product) -> product.ownerId)",
            "output": "[\n  {\n    \"l\": {\n      \"id\": \"1\",\n      \"name\": \"Mariano\"\n    },\n    \"r\": {\n      \"ownerId\": \"1\",\n      \"name\": \"DataWeave\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"1\",\n      \"name\": \"Mariano\"\n    },\n    \"r\": {\n      \"ownerId\": \"1\",\n      \"name\": \"BAT\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"3\",\n      \"name\": \"Julian\"\n    },\n    \"r\": {\n      \"ownerId\": \"3\",\n      \"name\": \"DataSense\"\n    }\n  }\n]"
          }
        ]
      }
    ]
  },
  "joinby": {
    "name": "joinBy",
    "overloads": [
      {
        "module": "core",
        "signature": "joinBy(@StreamCapable elements: Array<StringCoerceable>, separator: String): String",
        "description": "Merges an array into a single string value and uses the provided string\nas a separator between each item in the list.\n\n\nNote that `joinBy` performs the opposite task of `splitBy`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"hyphenate\" : [\"a\",\"b\",\"c\"] joinBy \"-\" }",
            "output": "{ \"hyphenate\": \"a-b-c\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "joinBy(n: Null, separator: Any): Null",
        "description": "Helper function that enables `joinBy` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "keyset": {
    "name": "keySet",
    "overloads": [
      {
        "module": "objects",
        "signature": "keySet<K, V>(obj: { (K)?: V }): Array<K>",
        "description": "Returns an array of key names from an object.\n\n_This function is *Deprecated*. Use xref:dw-core-functions-keysof.adoc[dw::Core::keysOf], instead._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Objects\noutput application/json\n---\n{ \"keySet\" : keySet({ \"a\" : true, \"b\" : 1}) }",
            "output": "{ \"keySet\" : [\"a\",\"b\"] }"
          },
          {
            "source": "%dw 2.0\nimport * from dw::core::Objects\nvar myVar = read('<users xmlns=\"http://test.com\">\n                     <user name=\"Mariano\" lastName=\"Achaval\"/>\n                     <user name=\"Stacey\" lastName=\"Duke\"/>\n                  </users>', 'application/xml')\noutput application/json\n---\n{ keySetExample: flatten([keySet(myVar.users) map $.#,\n                          keySet(myVar.users) map $.@])\n}\n++\n{ nameSet: flatten([nameSet(myVar.users) map $.#,\n                    nameSet(myVar.users) map $.@])\n}",
            "output": "{\n  \"keySet\": [\n    \"http://test.com\",\n    \"http://test.com\",\n    {\n      \"name\": \"Mariano\",\n      \"lastName\": \"Achaval\"\n    },\n    {\n      \"name\": \"Stacey\",\n      \"lastName\": \"Duke\"\n    }\n  ],\n  \"nameSet\": [\n    null,\n    null,\n    null,\n    null\n  ]\n}"
          }
        ]
      }
    ]
  },
  "keysof": {
    "name": "keysOf",
    "overloads": [
      {
        "module": "core",
        "signature": "keysOf<K, V>(obj: { (K)?: V }): Array<K>",
        "description": "Returns an array of keys from key-value pairs within the input object.\n\n\nThe returned keys belong to the Key type. To return each key as a string, you can use `namesOf`, instead.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"keysOf\" : keysOf({ \"a\" : true, \"b\" : 1}) }",
            "output": "{ \"keysOf\" : [\"a\",\"b\"] }"
          },
          {
            "source": "%dw 2.0\nvar myVar = read('<users xmlns=\"http://test.com\">\n                     <user name=\"Mariano\" lastName=\"Achaval\"/>\n                     <user name=\"Stacey\" lastName=\"Duke\"/>\n                  </users>', 'application/xml')\noutput application/json\n---\n{ keysOfExample: flatten([keysOf(myVar.users) map $.#,\n                          keysOf(myVar.users) map $.@])\n}\n++\n{ namesOfExample: flatten([namesOf(myVar.users) map $.#,\n                    namesOf(myVar.users) map $.@])\n}",
            "output": "{\n  \"keysOfExample\": [\n    \"http://test.com\",\n    \"http://test.com\",\n    {\n      \"name\": \"Mariano\",\n      \"lastName\": \"Achaval\"\n    },\n    {\n      \"name\": \"Stacey\",\n      \"lastName\": \"Duke\"\n    }\n  ],\n  \"namesOfExample\": [\n    null,\n    null,\n    null,\n    null\n  ]\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "keysOf(obj: Null): Null",
        "description": "Helper function that enables `keysOf` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "kindof": {
    "name": "kindOf",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "kindOf(path: Path): FileKind | Null",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the file type. \"File\" or \"Folder\" or null if it doesn't exits",
        "examples": []
      }
    ]
  },
  "last": {
    "name": "last",
    "overloads": [
      {
        "module": "strings",
        "signature": "last(text: String, amount: Number): String",
        "description": "Returns characters from the end of string to a\nspecified number of characters, for example, the last\ntwo characters of a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport last from dw::core::Strings\noutput application/json\n---\n\"hello world!\" last 6",
            "output": "\"world!\""
          }
        ]
      },
      {
        "module": "strings",
        "signature": "last(text: Null, amount: Any): Null",
        "description": "Helper function that enables `last` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "lastindexof": {
    "name": "lastIndexOf",
    "overloads": [
      {
        "module": "core",
        "signature": "lastIndexOf(array: Array, value: Any): Number",
        "description": "Returns the index of the _last_ occurrence of the specified element in a given\narray or `-1` if the array does not contain the element.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  present: [\"a\",\"b\",\"c\",\"d\"] lastIndexOf \"c\",\n  notPresent: [\"x\",\"w\",\"x\"] lastIndexOf \"c\",\n  presentMoreThanOnce: [\"a\",\"b\",\"c\",\"c\"] lastIndexOf \"c\",\n}",
            "output": "{\n  \"present\": 2,\n  \"notPresent\": -1,\n  \"presentMoreThanOnce\": 3\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "lastIndexOf(array: String, value: String): Number",
        "description": "Takes a string as input and returns the index of the _last_ occurrence of\na given search string within the input. The function returns `-1` if the\nsearch string is not present in the input.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  present: \"abcd\" lastIndexOf \"c\",\n  notPresent: \"xyz\" lastIndexOf \"c\",\n  presentMoreThanOnce: \"abcdc\" lastIndexOf \"c\",\n}",
            "output": "{\n  \"present\": 2,\n  \"notPresent\": -1,\n  \"presentMoreThanOnce\": 4\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "lastIndexOf(array: Null, value: Any): Number",
        "description": "Helper function that enables `lastIndexOf` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "leftjoin": {
    "name": "leftJoin",
    "overloads": [
      {
        "module": "arrays",
        "signature": "leftJoin<L <: Object, R <: Object>(left: Array<L>, right: Array<R>, leftCriteria: (leftValue: L) -> String, rightCriteria: (rightValue: R) -> String): Array<{ l: L, r?: R }>",
        "description": "Joins two arrays of objects by a given ID criteria.\n\n\n`leftJoin` returns an array all the `left` items, merged by ID with any right\nitems that meet the joining criteria.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\nvar users = [{id: \"1\", name:\"Mariano\"},{id: \"2\", name:\"Leandro\"},{id: \"3\", name:\"Julian\"},{id: \"5\", name:\"Julian\"}]\nvar products = [{ownerId: \"1\", name:\"DataWeave\"},{ownerId: \"1\", name:\"BAT\"}, {ownerId: \"3\", name:\"DataSense\"}, {ownerId: \"4\", name:\"SmartConnectors\"}]\noutput application/json\n---\nleftJoin(users, products, (user) -> user.id, (product) -> product.ownerId)",
            "output": "[\n  {\n    \"l\": {\n      \"id\": \"1\",\n      \"name\": \"Mariano\"\n    },\n    \"r\": {\n      \"ownerId\": \"1\",\n      \"name\": \"DataWeave\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"1\",\n      \"name\": \"Mariano\"\n    },\n    \"r\": {\n      \"ownerId\": \"1\",\n      \"name\": \"BAT\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"2\",\n      \"name\": \"Leandro\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"3\",\n      \"name\": \"Julian\"\n    },\n    \"r\": {\n      \"ownerId\": \"3\",\n      \"name\": \"DataSense\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"5\",\n      \"name\": \"Julian\"\n    }\n  }\n]"
          }
        ]
      }
    ]
  },
  "leftpad": {
    "name": "leftPad",
    "overloads": [
      {
        "module": "strings",
        "signature": "leftPad(text: String, size: Number, padText: String = \" \"): String",
        "description": "The specified `text` is _left_-padded to the `size` using the `padText`.\nBy default `padText` is `\" \"`.\n\n\nReturns left-padded `String` or original `String` if no padding is necessary.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n   \"a\": leftPad(null, 3),\n   \"b\": leftPad(\"\", 3),\n   \"c\": leftPad(\"bat\", 5),\n   \"d\": leftPad(\"bat\", 3),\n   \"e\": leftPad(\"bat\", -1)\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"   \",\n  \"c\": \"  bat\",\n  \"d\": \"bat\",\n  \"e\": \"bat\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "leftPad(text: Null, size: Any, padText: Any = \" \"): Null",
        "description": "Helper function that enables `leftPad` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "levenshteindistance": {
    "name": "levenshteinDistance",
    "overloads": [
      {
        "module": "strings",
        "signature": "levenshteinDistance(a: String, b: String): Number",
        "description": "Returns the Levenshtein distance (or edit distance) between two strings.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport levenshteinDistance from dw::core::Strings\noutput application/json\n---\n\"kitten\" levenshteinDistance \"sitting\"",
            "output": "3"
          }
        ]
      }
    ]
  },
  "lines": {
    "name": "lines",
    "overloads": [
      {
        "module": "strings",
        "signature": "lines(text: String): Array<String>",
        "description": "Returns an array of lines from a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport lines from dw::core::Strings\noutput application/json\n---\nlines(\"hello world\\n\\nhere   data-weave\")",
            "output": "[\"hello world\", \"\", \"here   data-weave\"]"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "lines(text: Null): Null",
        "description": "Helper function that enables `lines` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "literalvalueof": {
    "name": "literalValueOf",
    "overloads": [
      {
        "module": "types",
        "signature": "literalValueOf(t: Type): String | Number | Boolean",
        "description": "Returns the value of an input belongs to the Literal type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = \"Mariano\"\noutput application/json\n---\n{\n   a: literalValueOf(AType)\n}",
            "output": "{\n  \"a\": \"Mariano\"\n}"
          }
        ]
      }
    ]
  },
  "localdatetime": {
    "name": "localDateTime",
    "overloads": [
      {
        "module": "dates",
        "signature": "localDateTime(parts: LocalDateTimeFactory): LocalDateTime",
        "description": "Creates a `LocalDateTime` value from values specified for `year`, `month`, `day`,\n`hour`, `minutes`, and `seconds` fields.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n    newLocalDateTime: localDateTime({year: 2012, month: 10, day: 11, hour: 12, minutes: 30, seconds: 40})\n}",
            "output": "{\n   \"newLocalDateTime\": \"2012-10-11T12:30:40\"\n}"
          }
        ]
      }
    ]
  },
  "localtime": {
    "name": "localTime",
    "overloads": [
      {
        "module": "dates",
        "signature": "localTime(parts: LocalTimeFactory): LocalTime",
        "description": "Creates a `LocalTime` value from values specified for `hour`, `minutes`, and\n`seconds` fields.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  newLocalTime: localTime({ hour: 12, minutes: 30, seconds: 40})\n}",
            "output": "{\n   \"newLocalTime\": \"12:30:40\"\n}"
          }
        ]
      }
    ]
  },
  "location": {
    "name": "location",
    "overloads": [
      {
        "module": "runtime",
        "signature": "location(value: Any): Location",
        "description": "Returns the location of a given value, or `null` if the\nlocation can't be traced back to a DataWeave file.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport location from dw::Runtime\noutput application/json\n---\nlocation(sqrt)",
            "output": "{\n  \"uri\": \"/dw/Core.dwl\",\n  \"nameIdentifier\": \"dw::Core\",\n  \"startLine\": 5797,\n  \"startColumn\": 36,\n  \"endLine\": 5797,\n  \"endColumn\": 77\n}"
          }
        ]
      }
    ]
  },
  "locationstring": {
    "name": "locationString",
    "overloads": [
      {
        "module": "runtime",
        "signature": "locationString(value: Any): String",
        "description": "Returns the location string of a given value.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\nvar a = 123\noutput application/json\n---\nlocationString(a)",
            "output": "\"var a = 123\""
          }
        ]
      }
    ]
  },
  "log": {
    "name": "log",
    "overloads": [
      {
        "module": "core",
        "signature": "log<T>(prefix: String = \"\", value: T): T",
        "description": "Without changing the value of the input, `log` returns the input as a system\nlog. So this makes it very simple to debug your code, because any expression or subexpression can be wrapped\nwith *log* and the result will be printed out without modifying the result of the expression.\nThe output is going to be printed in application/dw format.\n\n\nThe prefix parameter is optional and allows to easily find the log output.\n\n\nUse this function to help with debugging DataWeave scripts. A Mule app\noutputs the results through the `DefaultLoggingService`, which you can see\nin the Studio console.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nlog(\"WARNING\", \"Houston, we have a problem\")",
            "output": "\"WARNING - Houston, we have a problem\""
          },
          {
            "source": "%dw 2.0\noutput application/json\n\nvar myUser = {user: {friend: {name: \"Shoki\"}, id: 1, name: \"Tomo\"}, accountId: \"leansh\" }\n---\nlog(\"User\", myUser.user).friend.name",
            "output": "User - {\n  friend: {\n    name: \"Shoki\"\n  },\n  id: 1,\n  name: \"Tomo\"\n}"
          }
        ]
      }
    ]
  },
  "log10": {
    "name": "log10",
    "overloads": [
      {
        "module": "math",
        "signature": "log10(a: Number): Number | NaN",
        "description": "Returns the logarithm base 10 of a number.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"log1010\": log10(10),\n  \"log1013\": log10(0.13),\n  \"log10-20\": log10(-20)\n}",
            "output": "{\n   \"log1010\": 1.0,\n   \"log1013\": -0.8860566476931632,\n   \"log10-20\": null\n}"
          }
        ]
      }
    ]
  },
  "logdebug": {
    "name": "logDebug",
    "overloads": [
      {
        "module": "core",
        "signature": "logDebug<T>(prefix: String = \"\", value: T): T",
        "description": "Helper function that logs messages at `Debug` level.\n\n_Introduced in DataWeave version 2.10.0._",
        "examples": []
      }
    ]
  },
  "logerror": {
    "name": "logError",
    "overloads": [
      {
        "module": "core",
        "signature": "logError<T>(prefix: String = \"\", value: T): T",
        "description": "Helper function that logs messages at `Error` level.\n\n_Introduced in DataWeave version 2.10.0._",
        "examples": []
      }
    ]
  },
  "loginfo": {
    "name": "logInfo",
    "overloads": [
      {
        "module": "core",
        "signature": "logInfo<T>(prefix: String = \"\", value: T): T",
        "description": "Helper function that logs messages at `Info` level.\n\n_Introduced in DataWeave version 2.10.0._",
        "examples": []
      }
    ]
  },
  "logn": {
    "name": "logn",
    "overloads": [
      {
        "module": "math",
        "signature": "logn(a: Number): Number | NaN",
        "description": "Returns the natural logarithm (base `e`) of a number.\n\n\nIf the input value is less than or equal to zero,\nthe result is `NaN` (or `null`).\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n   \"logn10\":  logn(10),\n   \"logn13\": logn(0.13),\n   \"logn-20\": logn(-20)\n}",
            "output": "{\n   \"logn10\": 2.302585092994046,\n   \"logn13\": -2.0402208285265546,\n   \"logn-20\": null\n}"
          }
        ]
      }
    ]
  },
  "logwarn": {
    "name": "logWarn",
    "overloads": [
      {
        "module": "core",
        "signature": "logWarn<T>(prefix: String = \"\", value: T): T",
        "description": "Helper function that logs messages at `Warn` level.\n\n_Introduced in DataWeave version 2.10.0._",
        "examples": []
      }
    ]
  },
  "logwith": {
    "name": "logWith",
    "overloads": [
      {
        "module": "core",
        "signature": "logWith<T>(level: LogLevel, prefix: String, value: T): T",
        "description": "Without changing the value of the input, `logWith` returns the input as a system log at the specified level.\nThis makes it simple to debug your code, because any expression or subexpression can be wrapped\nwith *log* and the result is printed out without modifying the result of the expression.\nThe output is printed in application/dw format.\n\n\nThe prefix parameter is optional and allows finding the log output easily.\n\nUse the `LogLevel` to categorize log events by severity and control the verbosity of the logs.\n\nUse this function to help with debugging DataWeave scripts. A Mule app\noutputs the results through the `DefaultLoggingService`, which you can see\nin the Studio console.\n\n_Introduced in DataWeave version 2.10.0._",
        "examples": []
      }
    ]
  },
  "lookup": {
    "name": "lookup",
    "overloads": [
      {
        "module": "mule",
        "signature": "lookup(flowName: String, payload: Any, timeoutMillis: Number = 2000)",
        "description": "This function enables you to execute a flow within a Mule app and\nretrieve the resulting payload.\n\n\nIt works in Mule apps that are running on Mule Runtime version 4.1.4 and\nlater.\n\nSimilar to the Flow Reference component (recommended), the `lookup` function\nenables you to execute another flow within your app and to retrieve the\nresulting payload. It takes the flow's name and an input payload as\nparameters. For example, `lookup(\"anotherFlow\", payload)` executes a flow\nnamed `anotherFlow`.\n\nThe function executes the specified flow using the current attributes,\nvariables, and any error, but it only passes in the payload without any\nattributes or variables. Similarly, the called flow will only return\nits payload.\n\nNote that the `lookup` function doesn't support calling subflows.\n\n[WARNING]\n====\nAlways keep in mind that a functional language like DataWeave expects the\ninvocation of the `lookup` function to _not_ have side effects. So, the\ninternal workings of the DataWeave engine might cause a `lookup` function\nto be invoked in parallel with other `lookup` functions, or not to be invoked\nat all.\n\nMuleSoft recommends that you invoke flows with the Flow Ref (`flow-ref`)\ncomponent, using the `target` attribute to put the result of the flow in a\n`var` and then referencing that `var` from within the DataWeave script.\n====\n\n_This function is *Deprecated*. Use https://docs.mulesoft.com/dataweave/latest/dataweave-functions[DataWeave functions], instead._",
        "examples": [
          {
            "source": "<flow name=\"flow1\">\n  <http:listener doc:name=\"Listener\" config-ref=\"HTTP_Listener_config\"\n    path=\"/source\"/>\n  <ee:transform doc:name=\"Transform Message\" >\n    <ee:message >\n      <ee:set-payload ><![CDATA[%dw 2.0\noutput application/json\n---\nMule::lookup('flow2', {test:'hello '})]]></ee:set-payload>\n    </ee:message>\n  </ee:transform>\n</flow>\n<flow name=\"flow2\" >\n  <set-payload value='#[payload.test ++ \"world\"]' doc:name=\"Set Payload\" />\n  <logger level=\"INFO\" doc:name=\"Logger\" message='#[payload]'/>\n</flow>",
            "output": ""
          }
        ]
      }
    ]
  },
  "lower": {
    "name": "lower",
    "overloads": [
      {
        "module": "core",
        "signature": "lower(text: String): String",
        "description": "Returns the provided string in lowercase characters.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"name\" : lower(\"MULESOFT\") }",
            "output": "{ \"name\": \"mulesoft\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "lower(value: Null): Null",
        "description": "Helper function that enables `lower` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "ls": {
    "name": "ls",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "ls(folder: Path): Array<Path>",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the list child file path",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n  ls(\"/tmp\")",
            "output": "[\"/tmp/foo.txt\",\"/tmp/dw-input-buffer-0.tmp\",\"/tmp/dw-output-buffer-0.tmp\"]"
          }
        ]
      },
      {
        "module": "filesystem",
        "signature": "ls(folder: Path, filterExpr: Regex): Array<Path>",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturn the list of child elements of the specified path. That matches the specified regex pattern",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n  ls(\"/tmp\", /dw/)",
            "output": "[\"/tmp/dw-input-buffer-0.tmp\",\"/tmp/dw-output-buffer-0.tmp\"]"
          }
        ]
      }
    ]
  },
  "map": {
    "name": "map",
    "overloads": [
      {
        "module": "core",
        "signature": "map<T, R>(@StreamCapable items: Array<T>, mapper: (item: T, index: Number) -> R): Array<R>",
        "description": "Iterates over items in an array and outputs the results into a new array.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[\"jose\", \"pedro\", \"mateo\"] map (value, index) -> { (index) : value}",
            "output": "[ { \"0\": \"jose\" }, { \"1\": \"pedro\" }, { \"2\": \"mateo\" } ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n['a', 'b', 'c'] map ((value, index) -> (index + 1) ++ '_' ++ value)",
            "output": "[ \"1_a\", \"2_b\", \"3_c\" ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "map(@StreamCapable value: Null, mapper: (item: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `map` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "mapleafvalues": {
    "name": "mapLeafValues",
    "overloads": [
      {
        "module": "tree",
        "signature": "mapLeafValues(value: Any, callback: (value: Any, path: Path) -> Any): Any",
        "description": "Maps the terminal (leaf) nodes in the tree.\n\n\nLeafs nodes cannot have an object or an array as a value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\noutput application/json\n---\n {\n     user: [{\n         name: \"mariano\",\n         lastName: \"achaval\"\n     }],\n     group: \"data-weave\"\n } mapLeafValues (value, path) -> upper(value)",
            "output": "{\n   \"user\": [\n     {\n       \"name\": \"MARIANO\",\n       \"lastName\": \"ACHAVAL\"\n     }\n   ],\n   \"group\": \"DATA-WEAVE\"\n }"
          },
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Tree\n---\n{\n    name: \"Mariano\",\n    test: [1,2,3]\n} mapLeafValues ((value, path) -> if(isObjectType(path))\n                                        \"***\"\n                                  else if(isArrayType(path))\n                                        \"In an array\"\n                                  else \"Is an attribute\")",
            "output": "{\n  \"name\": \"***\",\n  \"test\": [\n    \"In an array\",\n    \"In an array\",\n    \"In an array\"\n  ]\n}"
          }
        ]
      }
    ]
  },
  "mapobject": {
    "name": "mapObject",
    "overloads": [
      {
        "module": "core",
        "signature": "mapObject<K, V>(@StreamCapable object: { (K)?: V }, mapper: (value: V, key: K, index: Number) -> Object): Object",
        "description": "Iterates over an object using a mapper that acts on keys, values, or\nindices of that object.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\"a\":\"b\",\"c\":\"d\"} mapObject (value,key,index) -> { (index) : { (value):key} }",
            "output": "{ \"0\": { \"b\": \"a\" }, \"1\": { \"d\": \"c\" } }"
          },
          {
            "source": "%dw 2.0\noutput application/xml\n---\n{\n    prices: payload.prices mapObject (value, key) -> {\n        (key): (value + 5) as Number {format: \"##.00\"}\n    }\n}",
            "output": "<?xml version='1.0' encoding='UTF-8'?>\n<prices>\n  <basic>14.99</basic>\n  <premium>58.00</premium>\n  <vip>403.99</vip>\n</prices>"
          }
        ]
      },
      {
        "module": "core",
        "signature": "mapObject(value: Null, mapper: (value: Nothing, key: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `mapObject` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "mapstring": {
    "name": "mapString",
    "overloads": [
      {
        "module": "strings",
        "signature": "mapString(@StreamCapable text: String, mapper: (character: String, index: Number) -> String): String",
        "description": "Applies an expression to every character of a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{ balance: (\"\\$234\" mapString if (isNumeric($)) \"~\" else $) }",
            "output": "{\n  \"balance\": \"$~~~\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "mapString(@StreamCapable text: Null, mapper: (character: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `mapString` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "mask": {
    "name": "mask",
    "overloads": [
      {
        "module": "values",
        "signature": "mask(value: Null, fieldName: String | Number | PathElement): (newValueProvider: (oldValue: Any, path: Path) -> Any) -> Null",
        "description": "Helper function that enables `mask` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": []
      },
      {
        "module": "values",
        "signature": "mask(value: Any, selector: PathElement): (newValueProvider: (oldValue: Any, path: Path) -> Any) -> Any",
        "description": "This `mask` function replaces all _simple_ elements that match the specified\ncriteria.\n\n\nSimple elements do not have child elements and cannot be objects or arrays.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Values\n---\n[{name: \"Peter Parker\", password: \"spiderman\"}, {name: \"Bruce Wayne\", password: \"batman\"}] mask field(\"password\") with \"*****\"",
            "output": "[\n   {\n     \"name\": \"Peter Parker\",\n     \"password\": \"*****\"\n   },\n   {\n     \"name\": \"Bruce Wayne\",\n     \"password\": \"*****\"\n   }\n ]"
          }
        ]
      },
      {
        "module": "values",
        "signature": "mask(value: Any, fieldName: String): (newValueProvider: (oldValue: Any, path: Path) -> Any) -> Any",
        "description": "This `mask` function selects a field by its name.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Values\n---\n[{name: \"Peter Parker\", password: \"spiderman\"}, {name: \"Bruce Wayne\", password: \"batman\"}] mask \"password\" with \"*****\"",
            "output": "[\n   {\n     \"name\": \"Peter Parker\",\n     \"password\": \"*****\"\n   },\n   {\n     \"name\": \"Bruce Wayne\",\n     \"password\": \"*****\"\n   }\n ]"
          }
        ]
      },
      {
        "module": "values",
        "signature": "mask(value: Any, i: Number): (newValueProvider: (oldValue: Any, path: Path) -> Any) -> Any",
        "description": "This `mask` function selects an element from array by its index.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::util::Values\n---\n[[123, true], [456, true]] mask 1 with false",
            "output": "[\n   [\n     123,\n     false\n   ],\n   [\n     456,\n     false\n   ]\n ]"
          }
        ]
      }
    ]
  },
  "match": {
    "name": "match",
    "overloads": [
      {
        "module": "core",
        "signature": "match(text: String, matcher: Regex): Array<String>",
        "description": "Uses a Java regular expression (regex) to match a string and then separates it into\ncapture groups. Returns the results in an array.\n\n\nNote that you can use `match` for pattern matching expressions that include\nhttps://docs.mulesoft.com/dataweave/latest/dataweave-pattern-matching[case\nstatements].",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"me@mulesoft.com\" match(/([a-z]*)@([a-z]*)\\.com/)",
            "output": "[\n  \"me@mulesoft.com\",\n  \"me\",\n  \"mulesoft\"\n]"
          },
          {
            "source": "%dw 2.0\nvar a = '192.88.99.0/24'\nvar b = '192.168.0.0/16'\nvar c = '192.175.48.0/24'\noutput application/json\n---\n[ a, b, c ] flatMap ( $ match(/.*[$4]/) )",
            "output": "[  \"192.88.99.0/24\", \"192.175.48.0/24\" ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "match(text: Null, matcher: Any): Null",
        "description": "Helper function that enables `match` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "matches": {
    "name": "matches",
    "overloads": [
      {
        "module": "core",
        "signature": "matches(text: String, matcher: Regex): Boolean",
        "description": "Checks if an expression matches the entire input string.\n\n\nFor use cases where you need to output or conditionally process the matched\nvalue, see\nhttps://docs.mulesoft.com/dataweave/latest/dataweave-pattern-matching[Pattern Matching in DataWeave].",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ (\"admin123\" matches /a.*\\d+/), (\"admin123\" matches /^b.+/) ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "matches(text: Null, matcher: Any): false",
        "description": "Helper function that enables `matches` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "max": {
    "name": "max",
    "overloads": [
      {
        "module": "core",
        "signature": "max<T <: Comparable>(@StreamCapable values: Array<T>): T | Null",
        "description": "Returns the highest `Comparable` value in an array.\n\n\nThe items must be of the same type, or the function throws an error. The\nfunction returns `null` if the array is empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ a: max([1, 1000]), b: max([1, 2, 3]), c: max([1.5, 2.5, 3.5]) }",
            "output": "{ \"a\": 1000, \"b\": 3, \"c\": 3.5 }"
          }
        ]
      }
    ]
  },
  "maxby": {
    "name": "maxBy",
    "overloads": [
      {
        "module": "core",
        "signature": "maxBy<T>(@StreamCapable array: Array<T>, criteria: (item: T) -> Comparable): T | Null",
        "description": "Iterates over an array and returns the highest value of\n`Comparable` elements from it.\n\n\nThe items must be of the same type. `maxBy` throws an error if they are not,\nand the function returns `null` if the array is empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput  application/json\n---\n[ { \"a\" : 1 }, { \"a\" : 3 }, { \"a\" : 2 } ] maxBy ((item) -> item.a)",
            "output": "{ \"a\" : 3 }"
          },
          {
            "source": "%dw 2.0\nvar myDateTime1 = |2017-10-01T22:57:59-03:00|\nvar myDateTime2 = |2018-10-01T23:57:59-03:00|\noutput application/json\n---\n{\n  myMaxBy: {\n    byDateTime: [ myDateTime1, myDateTime2 ] maxBy ((item) -> item),\n    byDate: [ myDateTime1 as Date, myDateTime2 as Date ] maxBy ((item) -> item),\n    byTime: [ myDateTime1 as Time, myDateTime2 as Time ] maxBy ((item) -> item),\n    emptyArray: [] maxBy ((item) -> item)\n  }\n}",
            "output": "{\n  \"myMaxBy\": {\n    \"byDateTime\": \"2018-10-01T23:57:59-03:00\",\n    \"byDate\": \"2018-10-01\",\n    \"byTime\": \"23:57:59-03:00\",\n    \"emptyArray\": null\n  }\n}"
          }
        ]
      }
    ]
  },
  "md5": {
    "name": "MD5",
    "overloads": [
      {
        "module": "crypto",
        "signature": "MD5(content: Binary): String",
        "description": "Computes the MD5 hash and transforms the binary result into a\nhexadecimal lower case string.",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::Crypto\noutput application/json\n---\n{ \"md5\" : Crypto::MD5(\"asd\" as Binary) }",
            "output": "{ \"md5\": \"7815696ecbf1c96e6894b779456d330e\" }"
          }
        ]
      }
    ]
  },
  "mergewith": {
    "name": "mergeWith",
    "overloads": [
      {
        "module": "objects",
        "signature": "mergeWith<T <: Object, V <: Object>(source: T, target: V): ?",
        "description": "Appends any key-value pairs from a source object to a target object.\n\n\nIf source and target objects have the same key, the function appends\nthat source object to the target and removes that target object from the output.",
        "examples": [
          {
            "source": "%dw 2.0\nimport mergeWith from dw::core::Objects\noutput application/json\n---\n{ \"mergeWith\" : { \"a\" : true, \"b\" : 1} mergeWith { \"a\" : false, \"c\" : \"Test\"} }",
            "output": "\"mergeWith\": {\n    \"b\": 1,\n    \"a\": false,\n    \"c\": \"Test\"\n}"
          }
        ]
      },
      {
        "module": "objects",
        "signature": "mergeWith<T <: Object>(a: Null, b: T): T",
        "description": "Helper function that enables `mergeWith` to work with a `null` value.",
        "examples": []
      },
      {
        "module": "objects",
        "signature": "mergeWith<T <: Object>(a: T, b: Null): T",
        "description": "Helper function that enables `mergeWith` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "metadataof": {
    "name": "metadataOf",
    "overloads": [
      {
        "module": "types",
        "signature": "metadataOf(t: Type): Object",
        "description": "Returns metadata that is attached to the given type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = String {format: \"YYYY-MM-dd\"}\noutput application/json\n---\n{\n   a: metadataOf(AType)\n}",
            "output": "{\n  \"a\": {\"format\": \"YYYY-MM-dd\"}\n}"
          }
        ]
      }
    ]
  },
  "mimetypeof": {
    "name": "mimeTypeOf",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "mimeTypeOf(path: Path): String | Null",
        "description": "`import * from dw::io::file::FileSystem`\n\nTries to guess the mimeType of the given Path",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ndw::io::file::FileSystem::mimeTypeOf(\"/tmp/test.json\")",
            "output": "\"application/json\""
          }
        ]
      }
    ]
  },
  "min": {
    "name": "min",
    "overloads": [
      {
        "module": "core",
        "signature": "min<T <: Comparable>(@StreamCapable values: Array<T>): T | Null",
        "description": "Returns the lowest `Comparable` value in an array.\n\n\nThe items must be of the same type or `min` throws an error. The function\nreturns `null` if the array is empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ a: min([1, 1000]), b: min([1, 2, 3]), c: min([1.5, 2.5, 3.5]) }",
            "output": "{ \"a\": 1, \"b\": 1, \"c\": 1.5 }"
          }
        ]
      }
    ]
  },
  "minby": {
    "name": "minBy",
    "overloads": [
      {
        "module": "core",
        "signature": "minBy<T>(@StreamCapable array: Array<T>, criteria: (item: T) -> Comparable): T | Null",
        "description": "Iterates over an array to return the lowest value of\ncomparable elements from it.\n\n\nThe items need to be of the same type. `minBy` returns an error if they are\nnot, and it returns null when the array is empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput  application/json\n---\n[ { \"a\" : 1 }, { \"a\" : 2 }, { \"a\" : 3 } ] minBy (item) -> item.a",
            "output": "{ \"a\" : 1 }"
          },
          {
            "source": "%dw 2.0\nvar myDateTime1 = \"2017-10-01T22:57:59-03:00\"\nvar myDateTime2 = \"2018-10-01T23:57:59-03:00\"\noutput application/json\n---\n{\n  myMinBy: {\n    byDateTime: [ myDateTime1, myDateTime2 ] minBy ((item) -> item),\n    byDate: [ myDateTime1 as Date, myDateTime2 as Date ] minBy ((item) -> item),\n    byTime: [ myDateTime1 as Time, myDateTime2 as Time ] minBy ((item) -> item),\n    aBoolean: [ true, false, (0 > 1), (1 > 0) ] minBy $,\n    emptyArray: [] minBy ((item) -> item)\n  }\n}",
            "output": "{\n  \"myMinBy\": {\n    \"byDateTime\": \"2017-10-01T22:57:59-03:00\",\n    \"byDate\": \"2017-10-01\",\n    \"byTime\": \"22:57:59-03:00\",\n    \"aBoolean\": false,\n    \"emptyArray\": null\n  }\n}"
          }
        ]
      }
    ]
  },
  "minutes": {
    "name": "minutes",
    "overloads": [
      {
        "module": "periods",
        "signature": "minutes(nMinutes: Number): Period",
        "description": "Creates a Period value from the provided number of minutes.\n\n\nThe function applies the `duration` function to the input value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n   nextMinute: |2020-10-05T20:22:34.385Z| + minutes(1),\n   previousMinute: |2020-10-05T20:22:34.385Z| - minutes(1),\n   decimalInputPeriod: minutes(4.555),\n   wholeNumberInputPeriod: minutes(4),\n   addNegativeValue: minutes(-1) + minutes(2)\n}",
            "output": "{\n   \"nextMinute\": \"2020-10-05T20:23:34.385Z\",\n   \"previousMinute\": \"2020-10-05T20:21:34.385Z\",\n   \"decimalInputPeriod\": \"PT4M33.3S\",\n   \"wholeNumberInputPeriod\": \"PT4M\",\n   \"addNegativeValue\": 60\n}"
          }
        ]
      }
    ]
  },
  "mkdir": {
    "name": "mkdir",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "mkdir(path: Path): Path | Null",
        "description": "`import * from dw::io::file::FileSystem`\n\nCreates the a folder in the given path. And returns the path.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nmkdir(\"/tmp/a\")",
            "output": "\"/tmp/a\""
          }
        ]
      }
    ]
  },
  "mod": {
    "name": "mod",
    "overloads": [
      {
        "module": "core",
        "signature": "mod(dividend: Number, divisor: Number): Number",
        "description": "Returns the modulo (the remainder after dividing the `dividend`\nby the `divisor`).",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ (3 mod 2), (4 mod 2), (2.2 mod 2) ]",
            "output": "[ 1, 0, 0.2]"
          }
        ]
      }
    ]
  },
  "months": {
    "name": "months",
    "overloads": [
      {
        "module": "periods",
        "signature": "months(nMonths: Number): Period",
        "description": "Creates a Period value from the provided number of months.\n\n\nThe function applies the `period` function to the input value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n  nextMonth: |2020-10-05T20:22:34.385Z| + months(1),\n  fourMonthPeriod : months(4),\n  addNegativeValue: months(-1) + months(2)\n}",
            "output": "{\n  \"nextMonth\": \"2020-11-05T20:22:34.385Z\",\n  \"fourMonthPeriod\": \"P4M\",\n  \"addNegativeValue\": 1\n}"
          }
        ]
      }
    ]
  },
  "must": {
    "name": "must",
    "overloads": [
      {
        "module": "asserts",
        "signature": "must<T>(value: T, matchExpressions: Array<(value:T) -> Matcher<T> | MatcherResult | Boolean>): MatcherResult",
        "description": "`import * from dw::test::Asserts`\n\nThis function allows to assert a value with with a list of Matcher or Expressions",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\npayload must [\n    beObject(),\n    $.foo is Null\n]",
            "output": ""
          }
        ]
      },
      {
        "module": "asserts",
        "signature": "must<T>(value: T, matcher: (value: T) -> Matcher<T> | Boolean): MatcherResult",
        "description": "`import * from dw::test::Asserts`\n\nThis function allows to assert a value with a Matcher of Expressions",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\npayload must beObject()",
            "output": ""
          }
        ]
      }
    ]
  },
  "nameof": {
    "name": "nameOf",
    "overloads": [
      {
        "module": "types",
        "signature": "nameOf(t: Type): String",
        "description": "Returns the name of the input type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::core::Types\ntype AArray = Array<String> {n: 1}\ntype AArray2 = Array<String>\n---\n {\n     a: nameOf(AArray),\n     b: nameOf(AArray2),\n     c: nameOf(String)\n }",
            "output": "{\n   \"a\": \"AArray\",\n   \"b\": \"AArray2\",\n   \"c\": \"String\"\n }"
          }
        ]
      }
    ]
  },
  "nameset": {
    "name": "nameSet",
    "overloads": [
      {
        "module": "objects",
        "signature": "nameSet(obj: Object): Array<String>",
        "description": "Returns an array of keys from an object.\n\n_This function is *Deprecated*. Use xref:dw-core-functions-namesof.adoc[dw::Core::namesOf], instead._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Objects\noutput application/json\n---\n{ \"nameSet\" : nameSet({ \"a\" : true, \"b\" : 1}) }",
            "output": "{ \"nameSet\" : [\"a\",\"b\"] }"
          }
        ]
      }
    ]
  },
  "namesof": {
    "name": "namesOf",
    "overloads": [
      {
        "module": "core",
        "signature": "namesOf(obj: Object): Array<String>",
        "description": "Returns an array of strings with the names of all the keys within the given object.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"namesOf\" : namesOf({ \"a\" : true, \"b\" : 1}) }",
            "output": "{ \"namesOf\" : [\"a\",\"b\"] }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "namesOf(obj: Null): Null",
        "description": "Helper function that enables `namesOf` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "native": {
    "name": "native",
    "overloads": [
      {
        "module": "core",
        "signature": "native(String): Nothing",
        "description": "Internal method used to indicate that a function implementation is not\nwritten in DataWeave but in Scala.",
        "examples": []
      }
    ]
  },
  "nodeexists": {
    "name": "nodeExists",
    "overloads": [
      {
        "module": "tree",
        "signature": "nodeExists(value: Any, callback: (value: Any, path: Path) -> Boolean): Boolean",
        "description": "Returns `true` if any node in a given tree validates against\nthe specified criteria.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Tree\nvar myObject =  {\n     user: [{\n         name: \"mariano\",\n         lastName: \"achaval\",\n         friends: [\n             {\n                 name: \"julian\"\n             },\n             {\n                 name: \"tom\"\n             }\n         ]\n     },\n     {\n         name: \"leandro\",\n         lastName: \"shokida\",\n         friends: [\n             {\n                 name: \"peter\"\n             },\n             {\n                 name: \"robert\"\n             }\n         ]\n\n     }\n     ]\n }\noutput application/json\n---\n{\n    mariano : myObject nodeExists ((value, path) -> path[-1].selector == \"name\" and value == \"mariano\"),\n    julian : myObject nodeExists ((value, path) -> path[-1].selector == \"name\" and value == \"julian\"),\n    tom : myObject nodeExists ($$[-1].selector == \"name\" and $ == \"tom\"),\n    leandro : myObject nodeExists ($$[-1].selector == \"name\" and $ ==  \"leandro\"),\n    peter : myObject nodeExists ($$[-1].selector == \"name\" and $ == \"peter\"),\n    wrongField: myObject nodeExists ($$[-1].selector == \"wrongField\"),\n    teo: myObject nodeExists ($$[-1].selector == \"name\" and $ == \"teo\")\n}",
            "output": "{\n  \"mariano\": true,\n  \"julian\": true,\n  \"tom\": true,\n  \"leandro\": true,\n  \"peter\": true,\n  \"wrongField\": false,\n  \"teo\": false\n}"
          }
        ]
      }
    ]
  },
  "notbe": {
    "name": "notBe",
    "overloads": [
      {
        "module": "asserts",
        "signature": "notBe<T>(matcher: Matcher<T>): Matcher<T>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the value doesn't satisfy the given matcher",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n1 must notBe(equalTo(2))",
            "output": ""
          }
        ]
      }
    ]
  },
  "notbenull": {
    "name": "notBeNull",
    "overloads": [
      {
        "module": "asserts",
        "signature": "notBeNull(): Matcher",
        "description": "`import * from dw::test::Asserts`\n\nValidates that a given value isn't of type Null",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"A Text\" must notBeNull()",
            "output": ""
          }
        ]
      }
    ]
  },
  "now": {
    "name": "now",
    "overloads": [
      {
        "module": "core",
        "signature": "now(): DateTime",
        "description": "Returns a `DateTime` value for the current date and time. DataWeave delegates to Java `ZonedDateTime.now()`, so the precision of the returned value depends on the underlying JVM and operating system.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n   nowCalled: now(),\n   nowCalledSpecificTimeZone: now() >> \"America/New_York\"\n}",
            "output": "{\n  \"nowCalled\": \"2019-08-26T13:32:10.64-07:00\",\n  \"nowCalledSpecificTimeZone\": \"2019-08-26T16:32:10.643-04:00\"\n}"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  now: now(),\n  epochTime : now() as Number,\n  nanoseconds: now().nanoseconds,\n  milliseconds: now().milliseconds,\n  seconds: now().seconds,\n  minutes: now().minutes,\n  hour: now().hour,\n  day: now().day,\n  month: now().month,\n  year: now().year,\n  quarter: now().quarter,\n  dayOfWeek: now().dayOfWeek,\n  dayOfYear: now().dayOfYear,\n  offsetSeconds: now().offsetSeconds,\n  formattedDate: now() as String {format: \"y-MM-dd\"},\n  formattedTime: now() as String {format: \"hh:m:s\"}\n}",
            "output": "{\n  \"now\": \"2019-06-18T16:55:46.678-07:00\",\n  \"epochTime\": 1560902146,\n  \"nanoseconds\": 678000000,\n  \"milliseconds\": 678,\n  \"seconds\": 46,\n  \"minutes\": 55,\n  \"hour\": 16,\n  \"day\": 18,\n  \"month\": 6,\n  \"year\": 2019,\n  \"quarter\": 2,\n  \"dayOfWeek\": 2,\n  \"dayOfYear\": 169,\n  \"offsetSeconds\": -25200,\n  \"formattedDate\": \"2019-06-18\",\n  \"formattedTime\": \"04:55:46\"\n}"
          }
        ]
      }
    ]
  },
  "objectfields": {
    "name": "objectFields",
    "overloads": [
      {
        "module": "types",
        "signature": "objectFields(t: Type): Array<Field>",
        "description": "Returns the array of fields from the given Object type.\nThis function fails if the type is not an Object type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "import * from dw::core::Types\nns ns0 http://acme.com\ntype ADictionary = {_ : String}\ntype ASchema = {ns0#name @(ns0#foo: String): {}}\ntype AUser = {name @(foo?: String,l: Number)?: String, lastName*: Number}\n---\n{\n    a: objectFields(ADictionary),\n    b: objectFields(ASchema),\n    c: objectFields(Object),\n    d: objectFields(AUser)\n}",
            "output": "{\n  \"a\": [\n    {\n      \"key\": {\n        \"name\": {\n          \"localName\": \"_\",\n          \"namespace\": null\n        },\n        \"attributes\": [\n\n        ]\n      },\n      \"required\": true,\n      \"repeated\": false,\n      \"value\": \"String\"\n    }\n  ],\n  \"b\": [\n    {\n      \"key\": {\n        \"name\": {\n          \"localName\": \"name\",\n          \"namespace\": \"http://acme.com\"\n        },\n        \"attributes\": [\n          {\n            \"name\": {\n              \"localName\": \"foo\",\n              \"namespace\": \"http://acme.com\"\n            },\n            \"value\": \"String\",\n            \"required\": true\n          }\n        ]\n      },\n      \"required\": true,\n      \"repeated\": false,\n      \"value\": \"Object\"\n    }\n  ],\n  \"c\": [\n\n  ],\n  \"d\": [\n    {\n      \"key\": {\n        \"name\": {\n          \"localName\": \"name\",\n          \"namespace\": null\n        },\n        \"attributes\": [\n          {\n            \"name\": {\n              \"localName\": \"foo\",\n              \"namespace\": null\n            },\n            \"value\": \"String\",\n            \"required\": false\n          },\n          {\n            \"name\": {\n              \"localName\": \"l\",\n              \"namespace\": null\n            },\n            \"value\": \"Number\",\n            \"required\": true\n          }\n        ]\n      },\n      \"required\": false,\n      \"repeated\": false,\n      \"value\": \"String\"\n    },\n    {\n      \"key\": {\n        \"name\": {\n          \"localName\": \"lastName\",\n          \"namespace\": null\n        },\n        \"attributes\": [\n\n        ]\n      },\n      \"required\": true,\n      \"repeated\": true,\n      \"value\": \"Number\"\n    }\n  ]\n}"
          }
        ]
      }
    ]
  },
  "onnull": {
    "name": "onNull",
    "overloads": [
      {
        "module": "core",
        "signature": "onNull<R>(previous: Null, callback: () -> R): R",
        "description": "Executes a callback function if the preceding expression returns a `null`\nvalue and then replaces the `null` value with the result of the callback.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n     \"onNull\": []\n             reduce ((item, accumulator) -> item ++ accumulator)\n             then ((result) -> sizeOf(result))\n             onNull \"Empty Text\"\n }",
            "output": "{\n  \"onNull\": \"Empty Text\"\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "onNull<T>(previous: T, callback: () -> Any): T",
        "description": "Helper function that enables `onNull` to work with a _non-null_ value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "orderby": {
    "name": "orderBy",
    "overloads": [
      {
        "module": "core",
        "signature": "orderBy<K, V, R, O <: { (K)?: V }>(object: O, criteria: (value: V, key: K) -> R): O",
        "description": "Reorders the elements of an input using criteria that acts on selected\nelements of that input.\n\n\nThis version of `orderBy` takes an object as input. Other versions act on an\ninput array or handle a `null` value.\n\nNote that you can reference the index with the anonymous parameter\n`&#36;&#36;` and the value with `&#36;`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[{ letter: \"e\" }, { letter: \"d\" }] orderBy($.letter)",
            "output": "[\n  {\n    \"letter\": \"d\"\n  },\n  {\n    \"letter\": \"e\"\n  }\n]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\norderDescending: ([3,8,1] orderBy $)[-1 to 0]",
            "output": "{ \"orderDescending\": [8,3,1] }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "orderBy<T, R>(array: Array<T>, criteria: (item: T, index: Number) -> R): Array<T>",
        "description": "Sorts an array using the specified criteria.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[3,2,3] orderBy $",
            "output": "[ 2, 3, 3 ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n[{name: \"Santiago\", age: 42},{name: \"Leandro\", age: 29}, {name: \"Mariano\", age: 35}] orderBy (person) -> person.age",
            "output": "[\n  {\n    name: \"Leandro\",\n    age: 29\n  },\n  {\n    name: \"Mariano\",\n    age: 35\n  },\n  {\n    name: \"Santiago\",\n    age: 42\n  }\n]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "orderBy(value: Null, criteria: (item: Nothing, index: Nothing) -> Null): Null",
        "description": "Helper function that enables `orderBy` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "ordinalize": {
    "name": "ordinalize",
    "overloads": [
      {
        "module": "strings",
        "signature": "ordinalize(num: Number): String",
        "description": "Returns a number as an ordinal, such as `1st` or `2nd`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\" : ordinalize(1),\n  \"b\": ordinalize(2),\n  \"c\": ordinalize(5),\n  \"d\": ordinalize(103)\n}",
            "output": "{\n   \"a\": \"1st\",\n   \"b\": \"2nd\",\n   \"c\": \"5th\",\n   \"d\": \"103rd\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "ordinalize(num: Null): Null",
        "description": "Helper function that enables `ordinalize` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "orelse": {
    "name": "orElse",
    "overloads": [
      {
        "module": "runtime",
        "signature": "orElse<T, E, R>(previous: Result<T, E>, orElse: () -> R): T | R",
        "description": "Returns the result of the `orElse` argument if the `previous` argument to\n`try` fails. Otherwise, the function returns the value of the `previous`\nargument.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\nvar user = {}\nvar otherUser = {name: \"DW\"}\noutput application/json\n---\n{\n    a: try(() -> user.name!) orElse \"No User Name\",\n    b: try(() -> otherUser.name) orElse \"No User Name\"\n}",
            "output": "{\n  \"a\": \"No User Name\",\n  \"b\": \"DW\"\n}"
          }
        ]
      }
    ]
  },
  "orelsetry": {
    "name": "orElseTry",
    "overloads": [
      {
        "module": "runtime",
        "signature": "orElseTry<T, R>(previous: TryResult<T>, orElse: () -> R): TryResult<T | R>",
        "description": "Function to use with `try` to chain multiple `try` requests.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\nvar user = {}\nvar otherUser = {}\noutput application/json\n---\n{\n    a: try(() -> user.name!) orElseTry otherUser.name!,\n    b: try(() -> user.name!) orElseTry \"No User Name\"\n}",
            "output": "{\n  \"a\": {\n    \"success\": false,\n    \"error\": {\n      \"kind\": \"KeyNotFoundException\",\n      \"message\": \"There is no key named 'name'\",\n      \"location\": \"\\n9|     a: try(() -> user.name!) orElseTry otherUser.name!,\\n                                          ^^^^^^^^^^^^^^\",\n      \"stack\": [\n        \"main (org::mule::weave::v2::engine::transform:9:40)\"\n      ]\n    }\n  },\n  \"b\": {\n    \"success\": true,\n    \"result\": \"No User Name\"\n  }\n}"
          }
        ]
      }
    ]
  },
  "outerjoin": {
    "name": "outerJoin",
    "overloads": [
      {
        "module": "arrays",
        "signature": "outerJoin<L <: Object, R <: Object>(left: Array<L>, right: Array<R>, leftCriteria: (leftValue: L) -> String, rightCriteria: (rightValue: R) -> String): Array<{ l?: L, r?: R }>",
        "description": "Joins two array of objects by a given `ID` criteria.\n\n\n`outerJoin` returns an array with all the `left` items, merged by ID\nwith the `right` items in cases where any exist, and it returns `right`\nitems that are not present in the `left`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\nvar users = [{id: \"1\", name:\"Mariano\"},{id: \"2\", name:\"Leandro\"},{id: \"3\", name:\"Julian\"},{id: \"5\", name:\"Julian\"}]\nvar products = [{ownerId: \"1\", name:\"DataWeave\"},{ownerId: \"1\", name:\"BAT\"}, {ownerId: \"3\", name:\"DataSense\"}, {ownerId: \"4\", name:\"SmartConnectors\"}]\noutput application/json\n---\nouterJoin(users, products, (user) -> user.id, (product) -> product.ownerId)",
            "output": "[\n  {\n    \"l\": {\n      \"id\": \"1\",\n      \"name\": \"Mariano\"\n    },\n    \"r\": {\n      \"ownerId\": \"1\",\n      \"name\": \"DataWeave\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"1\",\n      \"name\": \"Mariano\"\n    },\n    \"r\": {\n      \"ownerId\": \"1\",\n      \"name\": \"BAT\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"2\",\n      \"name\": \"Leandro\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"3\",\n      \"name\": \"Julian\"\n    },\n    \"r\": {\n      \"ownerId\": \"3\",\n      \"name\": \"DataSense\"\n    }\n  },\n  {\n    \"l\": {\n      \"id\": \"5\",\n      \"name\": \"Julian\"\n    }\n  },\n  {\n    \"r\": {\n      \"ownerId\": \"4\",\n      \"name\": \"SmartConnectors\"\n    }\n  }\n]"
          }
        ]
      }
    ]
  },
  "outputfrom": {
    "name": "outputFrom",
    "overloads": [
      {
        "module": "tests",
        "signature": "outputFrom(dir: String)",
        "description": "`import * from dw::test::Tests`\n\nReturns the result of reading the expected output",
        "examples": []
      }
    ]
  },
  "p": {
    "name": "p",
    "overloads": [
      {
        "module": "mule",
        "signature": "p(propertyName: String): String",
        "description": "This function returns a string that identifies the value of one of these\ninput properties: Mule property placeholders, System properties, or\nEnvironment variables.\n\n\nFor more on this topic, see\nhttps://docs.mulesoft.com/mule-runtime/latest/configuring-properties[Configure Properties].",
        "examples": [
          {
            "source": "<flow name=\"simple\">\n <logger level=\"INFO\" doc:name=\"Logger\"\n   message=\"#[Mule::p('http.port')]\"/>\n</flow>",
            "output": ""
          }
        ]
      }
    ]
  },
  "pack": {
    "name": "pack",
    "overloads": [
      {
        "module": "protobuf",
        "signature": "pack(msg: Any,  messageType: String, descriptorUrl: String): { type_url : String, value : Binary }",
        "description": "`import * from protobuf::Any`\n\nThe `pack` function serializes an object and returns it as a Protobuf Any message.\nIt needs the `messageType` and the `descriptorUrl` in order to properly pack the message,\nwhich can be of `Any` value.",
        "examples": [
          {
            "source": "syntax = \"proto3\";\n\npackage engine.anyPacking;\n\nimport \"google/protobuf/any.proto\";\n\nmessage Payload {\n  bool flag = 1;\n  google.protobuf.Any load = 2;\n}\n\nmessage Range {\n  int32 from = 1;\n  int32 to = 2;\n}",
            "output": "output application/x-protobuf messageType='engine.anyPacking.Payload',descriptorUrl=\"example.dsc\"\nimport unpack from protobuf::Any\n\n---\n{\n  flag: true,\n  load: pack({from: 1, to: 3}, 'engine.anyPacking.Range', \"descriptors/test.dsc\")\n}"
          }
        ]
      }
    ]
  },
  "parentof": {
    "name": "parentOf",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "parentOf(path: Path): String | Null",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the path to the parent folder of a given file.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport parentOf from dw::io::file::FileSystem\n---\nparentOf(\"tmp/someDir/someFile.txt\")",
            "output": "\"tmp/someDir\""
          }
        ]
      }
    ]
  },
  "parseuri": {
    "name": "parseURI",
    "overloads": [
      {
        "module": "url",
        "signature": "parseURI(uri: String): URI",
        "description": "Parses a URL and returns a `URI` object.\n\n\nThe `isValid: Boolean` property in the output `URI` object indicates whether\nthe parsing process succeeded. Every field in this object is optional, and\na field will appear in the output only if it was present in the URL input.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::URL\noutput application/json\n---\n{\n  'composition': parseURI('https://en.wikipedia.org/wiki/Uniform_Resource_Identifier#footer')\n}",
            "output": "{\n  \"composition\": {\n    \"isValid\": true,\n    \"raw\": \"https://en.wikipedia.org/wiki/Uniform_Resource_Identifier#footer\",\n    \"host\": \"en.wikipedia.org\",\n    \"authority\": \"en.wikipedia.org\",\n    \"fragment\": \"footer\",\n    \"path\": \"/wiki/Uniform_Resource_Identifier\",\n    \"scheme\": \"https\",\n    \"isAbsolute\": true,\n    \"isOpaque\": false\n  }\n}"
          }
        ]
      }
    ]
  },
  "partition": {
    "name": "partition",
    "overloads": [
      {
        "module": "arrays",
        "signature": "partition<T>(array: Array<T>, condition: (item: T) -> Boolean): { success: Array<T>, failure: Array<T> }",
        "description": "Separates the array into the elements that satisfy the condition from those\nthat do not.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar arr = [0,1,2,3,4,5]\n---\narr partition (item) -> isEven(item)",
            "output": "{\n  \"success\": [\n    0,\n    2,\n    4\n  ],\n  \"failure\": [\n    1,\n    3,\n    5\n  ]\n}"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "partition(array: Null, condition: (item: Nothing) -> Any): Null",
        "description": "Helper function that enables `partition` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "path": {
    "name": "path",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "path(basePath: Path, part: String): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nCreates a valid path with the specified parts",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\npath(\"/tmp/a\",\"b\")",
            "output": "\"/tmp/a/b\""
          }
        ]
      },
      {
        "module": "filesystem",
        "signature": "path(basePath: Path, part: String, part2: String): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nCreates a valid Path with the specified parts",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\npath(\"/tmp\", \"a\",\"b\")",
            "output": "\"/tmp/a/b\""
          }
        ]
      },
      {
        "module": "filesystem",
        "signature": "path(basePath: Path, part: String, part2: String, part3: String): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nCreates a valid Path with the specified parts",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\npath(\"/tmp\", \"a\",\"b\",\"c\")",
            "output": "\"/tmp/a/b/c\""
          }
        ]
      },
      {
        "module": "filesystem",
        "signature": "path(basePath: Path, parts: Array<String>): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nCreates a valid Path with the specified parts",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\npath(\"/tmp\", [\"a\",\"b\",\"c\"])",
            "output": "\"/tmp/a/b/c\""
          }
        ]
      }
    ]
  },
  "period": {
    "name": "period",
    "overloads": [
      {
        "module": "periods",
        "signature": "period(period: { years?: Number, months?: Number, days?: Number }): Period",
        "description": "Creates a Period value as a date-based number of years, months,\nand days in the ISO-8601 calendar system.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport * from dw::core::Periods\n---\n{\n   dayBeforeDateTime: |2020-10-05T20:22:34.385Z| - period({days:1}),\n   dayAfterDate: |2020-10-05| + period({days:1}),\n   yearMonthDayAfterDate: |2020-10-05| + period({years:1, months:1, days:1}),\n   emptyPeriod: period({}),\n   constructPeriod: period({years:4, months:11, days:28}),\n   selectMonthsFromPeriod: period({years:4, months:11, days:28}).months\n}",
            "output": "{\n    \"dayBeforeDateTime\": \"2020-10-04T20:22:34.385Z\",\n    \"dayAfterDate\": \"2020-10-06\",\n    \"yearMonthDayAfterDate\": \"2021-11-06\",\n    \"emptyPeriod\": \"P0D\",\n    \"constructPeriod\": \"P4Y11M28D\",\n    \"selectMonthsFromPeriod\": 11\n}"
          }
        ]
      }
    ]
  },
  "pluck": {
    "name": "pluck",
    "overloads": [
      {
        "module": "core",
        "signature": "pluck<K, V, R>(@StreamCapable object: { (K)?: V }, mapper: (value: V, key: K, index: Number) -> R): Array<R>",
        "description": "Useful for mapping an object into an array, `pluck` iterates over an object\nand returns an array of keys, values, or indices from the object.\n\n\nIt is an alternative to `mapObject`, which is similar but returns\nan object, instead of an array.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\"a\":\"b\",\"c\":\"d\"} pluck (value,key,index) -> { (index) : { (value):key} }",
            "output": "[ { \"0\": { \"b\": \"a\" } }, { \"1\": { \"d\": \"c\" } } ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\nvar readXml = read(\"<prices>\n    <basic>9.99</basic>\n    <premium>53.00</premium>\n    <vip>398.99</vip>\n    </prices>\", \"application/xml\")\n---\n\"result\" : {\n  \"keys\" : readXml.prices pluck($$),\n  \"values\" : readXml.prices pluck($) as Number,\n  \"indices\" : readXml.prices pluck($$$)\n}",
            "output": "{\n   \"result\": {\n     \"keys\": [ \"basic\", \"premium\", \"vip\" ],\n     \"values\": [ 9.99, 53, 398.99 ],\n     \"indices\": [ 0, 1, 2 ]\n   }\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "pluck(value: Null, mapper: (value: Nothing, key: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `pluck` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "pluralize": {
    "name": "pluralize",
    "overloads": [
      {
        "module": "strings",
        "signature": "pluralize(text: String): String",
        "description": "Pluralizes a singular string.\n\n\nIf the input is already plural (for example, \"boxes\"), the output will match\nthe input.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n { \"pluralize\" : pluralize(\"box\") }",
            "output": "{ \"pluralize\" : \"boxes\" }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "pluralize(text: Null): Null",
        "description": "Helper function that enables `pluralize` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "pow": {
    "name": "pow",
    "overloads": [
      {
        "module": "core",
        "signature": "pow(base: Number, power: Number): Number",
        "description": "Raises the value of a `base` number to the specified `power`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ (2 pow 3), (3 pow 2), (7 pow 3) ]",
            "output": "[ 8, 9, 343 ]"
          }
        ]
      }
    ]
  },
  "prependifmissing": {
    "name": "prependIfMissing",
    "overloads": [
      {
        "module": "strings",
        "signature": "prependIfMissing(text: String, prefix: String): String",
        "description": "Prepends the `prefix` to the beginning of the string if the `text` does not\nalready start with that prefix.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport prependIfMissing from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": prependIfMissing(null, \"\"),\n  \"b\": prependIfMissing(\"abc\", \"\"),\n  \"c\": prependIfMissing(\"\", \"xyz\"),\n  \"d\": prependIfMissing(\"abc\", \"xyz\"),\n  \"e\": prependIfMissing(\"xyzabc\", \"xyz\")\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"abc\",\n  \"c\": \"xyz\",\n  \"d\": \"xyzabc\",\n  \"e\": \"xyzabc\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "prependIfMissing(text: Null, prefix: String): Null",
        "description": "Helper function that enables `prependIfMissing` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "prop": {
    "name": "prop",
    "overloads": [
      {
        "module": "runtime",
        "signature": "prop(propertyName: String): String | Null",
        "description": "Returns the value of the property with the specified name or `null` if the\nproperty is not defined.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\noutput application/dw\n---\n{ \"props\" : prop(\"user.timezone\") }",
            "output": "{ props: \"America/Los_Angeles\" as String {class: \"java.lang.String\"} }"
          }
        ]
      }
    ]
  },
  "props": {
    "name": "props",
    "overloads": [
      {
        "module": "runtime",
        "signature": "props(): Dictionary<String>",
        "description": "Returns all the properties configured for the DataWeave runtime, which executes the language.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\noutput application/dw\n---\n{ \"props\" : props() }",
            "output": "{\n props: {\n   \"java.vendor\": \"Oracle Corporation\" as String {class: \"java.lang.String\"},\n   \"sun.java.launcher\": \"SUN_STANDARD\" as String {class: \"java.lang.String\"},\n   \"sun.management.compiler\": \"HotSpot 64-Bit Tiered Compilers\" as String ..., *    \"os.name\": \"Mac OS X\" as String {class: \"java.lang.String\"},\n   \"sun.boot.class.path\": \"/Library/Java/JavaVirtualMachines/ ...,\n   \"org.glassfish.grizzly.nio.transport.TCPNIOTransport...\": \"1048576\" ...,\n   \"java.vm.specification.vendor\": \"Oracle Corporation\" as String ...,\n   \"java.runtime.version\": \"1.8.0_111-b14\" as String {class: \"java.lang.String\"},\n   \"wrapper.native_library\": \"wrapper\" as String {class: \"java.lang.String\"},\n   \"wrapper.key\": \"XlIl4YartmfEU3oKu7o81kNQbwhveXi-\" as String ...,\n   \"user.name\": \"me\" as String {class: \"java.lang.String\"},\n   \"mvel2.disable.jit\": \"TRUE\" as String {class: \"java.lang.String\"},\n   \"user.language\": \"en\" as String {class: \"java.lang.String\"} ...,\n   \"sun.boot.library.path\": \"/Library/Java/JavaVirtualMachines ...\n   \"xpath.provider\": \"com.mulesoft.licm.DefaultXPathProvider\" ...,\n   \"wrapper.backend\": \"pipe\" as String {class: \"java.lang.String\"},\n   \"java.version\": \"1.8.0_111\" as String {class: \"java.lang.String\"},\n   \"user.timezone\": \"America/Los_Angeles\" as String {class: \"java.lang.String\"},\n   \"java.net.preferIPv4Stack\": \"TRUE\" as String {class: \"java.lang.String\"},\n   \"sun.arch.data.model\": \"64\" as String {class: \"java.lang.String\"},\n   \"java.endorsed.dirs\": \"/Library/Java/JavaVirtualMachines/...,\n   \"sun.cpu.isalist\": \"\" as String {class: \"java.lang.String\"},\n   \"sun.jnu.encoding\": \"UTF-8\" as String {class: \"java.lang.String\"},\n   \"mule.testingMode\": \"\" as String {class: \"java.lang.String\"},\n   \"file.encoding.pkg\": \"sun.io\" as String {class: \"java.lang.String\"},\n   \"file.separator\": \"/\" as String {class: \"java.lang.String\"},\n   \"java.specification.name\": \"Java Platform API Specification\" ...,\n   \"java.class.version\": \"52.0\" as String {class: \"java.lang.String\"},\n   \"jetty.git.hash\": \"82b8fb23f757335bb3329d540ce37a2a2615f0a8\" ...,\n   \"user.country\": \"US\" as String {class: \"java.lang.String\"},\n   \"mule.agent.configuration.folder\": \"/Applications/AnypointStudio.app/ ...,\n   \"log4j.configurationFactory\": \"org.apache.logging.log4j.core...\",\n   \"java.home\": \"/Library/Java/JavaVirtualMachines/...,\n   \"java.vm.info\": \"mixed mode\" as String {class: \"java.lang.String\"},\n   \"wrapper.version\": \"3.5.34-st\" as String {class: \"java.lang.String\"},\n   \"os.version\": \"10.13.4\" as String {class: \"java.lang.String\"},\n   \"org.eclipse.jetty.LEVEL\": \"WARN\" as String {class: \"java.lang.String\"},\n   \"path.separator\": \":\" as String {class: \"java.lang.String\"},\n   \"java.vm.version\": \"25.111-b14\" as String {class: \"java.lang.String\"},\n   \"wrapper.pid\": \"5212\" as String {class: \"java.lang.String\"},\n   \"java.util.prefs.PreferencesFactory\": \"com.mulesoft.licm...\"},\n   \"wrapper.java.pid\": \"5213\" as String {class: \"java.lang.String\"},\n   \"mule.home\": \"/Applications/AnypointStudio.app/...,\n   \"java.awt.printerjob\": \"sun.lwawt.macosx.CPrinterJob\" ...,\n   \"sun.io.unicode.encoding\": \"UnicodeBig\" as String {class: \"java.lang.String\"},\n   \"awt.toolkit\": \"sun.lwawt.macosx.LWCToolkit\" ...,\n   \"org.glassfish.grizzly.nio.transport...\": \"1048576\" ...,\n   \"user.home\": \"/Users/me\" as String {class: \"java.lang.String\"},\n   \"java.specification.vendor\": \"Oracle Corporation\" ...,\n   \"java.library.path\": \"/Applications/AnypointStudio.app/...,\n   \"java.vendor.url\": \"http://java.oracle.com/\" as String ...,\n   \"java.vm.vendor\": \"Oracle Corporation\" as String {class: \"java.lang.String\"},\n   gopherProxySet: \"false\" as String {class: \"java.lang.String\"},\n   \"wrapper.jvmid\": \"1\" as String {class: \"java.lang.String\"},\n   \"java.runtime.name\": \"Java(TM) SE Runtime Environment\" ...,\n   \"mule.encoding\": \"UTF-8\" as String {class: \"java.lang.String\"},\n   \"sun.java.command\": \"org.mule.runtime.module.reboot....\",\n   \"java.class.path\": \"%MULE_LIB%:/Applications/AnypointStudio.app...\",\n   \"log4j2.loggerContextFactory\": \"org.mule.runtime.module.launcher...,\n   \"java.vm.specification.name\": \"Java Virtual Machine Specification\" ,\n   \"java.vm.specification.version\": \"1.8\" as String {class: \"java.lang.String\"},\n   \"sun.cpu.endian\": \"little\" as String {class: \"java.lang.String\"},\n   \"sun.os.patch.level\": \"unknown\" as String {class: \"java.lang.String\"},\n   \"com.ning.http.client.AsyncHttpClientConfig.useProxyProperties\": \"true\" ...,\n   \"wrapper.cpu.timeout\": \"10\" as String {class: \"java.lang.String\"},\n   \"java.io.tmpdir\": \"/var/folders/42/dd73l3rx7qz0n625hr29kty80000gn/T/\" ...,\n   \"anypoint.platform.analytics_base_uri\": ...,\n   \"java.vendor.url.bug\": \"http://bugreport.sun.com/bugreport/\" ...,\n   \"os.arch\": \"x86_64\" as String {class: \"java.lang.String\"},\n   \"java.awt.graphicsenv\": \"sun.awt.CGraphicsEnvironment\" ...,\n   \"mule.base\": \"/Applications/AnypointStudio.app...\",\n   \"java.ext.dirs\": \"/Users/staceyduke/Library/Java/Extensions: ...\"},\n   \"user.dir\": \"/Applications/AnypointStudio.app/...\"},\n   \"line.separator\": \"\\n\" as String {class: \"java.lang.String\"},\n   \"java.vm.name\": \"Java HotSpot(TM) 64-Bit Server VM\" ...,\n   \"org.quartz.scheduler.skipUpdateCheck\": \"true\" ...,\n   \"file.encoding\": \"UTF-8\" as String {class: \"java.lang.String\"},\n   \"mule.forceConsoleLog\": \"\" as String {class: \"java.lang.String\"},\n   \"java.specification.version\": \"1.8\" as String {class: \"java.lang.String\"},\n   \"wrapper.arch\": \"universal\" as String {class: \"java.lang.String\"}\n } as Object {class: \"java.util.Properties\"}"
          }
        ]
      }
    ]
  },
  "random": {
    "name": "random",
    "overloads": [
      {
        "module": "core",
        "signature": "random(): Number",
        "description": "Returns a pseudo-random number greater than or equal to `0.0` and less than `1.0`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ price: random() * 1000 }",
            "output": "{ \"price\": 65.02770292248383 }"
          }
        ]
      }
    ]
  },
  "randomint": {
    "name": "randomInt",
    "overloads": [
      {
        "module": "core",
        "signature": "randomInt(upperBound: Number): Number",
        "description": "Returns a pseudo-random whole number from `0` to the specified number\n(exclusive).",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ price: randomInt(1000) }",
            "output": "{ \"price\": 442.0 }"
          }
        ]
      }
    ]
  },
  "read": {
    "name": "read",
    "overloads": [
      {
        "module": "core",
        "signature": "read(stringToParse: String | Binary, contentType: String = \"application/dw\", readerProperties: Object = {}): Any",
        "description": "Reads a string or binary and returns parsed content.\n\n\nThis function can be useful if the reader cannot determine the content type\nby default.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/xml\n---\nread('{ \"hello\" : \"world\" }','application/json')",
            "output": "<?xml version='1.0' encoding='UTF-8'?><hello>world</hello>"
          },
          {
            "source": "%dw 2.0\nvar myVar = \"Some, Body\"\noutput application/json\n---\nread(myVar,\"application/csv\",{header:false})[0]",
            "output": "{ \"column_0\": \"Some\", \"column_1\": \" Body\" }"
          }
        ]
      }
    ]
  },
  "readlineswith": {
    "name": "readLinesWith",
    "overloads": [
      {
        "module": "binaries",
        "signature": "readLinesWith(content: Binary, charset: String): Array<String>",
        "description": "Splits the specified binary content into lines and returns the results in an\narray.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Binaries\nvar content = read(\"Line 1\\nLine 2\\nLine 3\\nLine 4\\nLine 5\\n\", \"application/octet-stream\")\noutput application/json\n---\n{\n   lines : (content readLinesWith \"UTF-8\"),\n   showType: typeOf(content)\n}",
            "output": "{\n   \"lines\": [ \"Line 1\", \"Line 2\", \"Line 3\", \"Line 4\", \"Line 5\" ],\n   \"showType\": \"Binary\"\n}"
          }
        ]
      }
    ]
  },
  "readurl": {
    "name": "readUrl",
    "overloads": [
      {
        "module": "core",
        "signature": "readUrl(url: String, contentType: String = \"application/dw\", readerProperties: Object = {}): Any",
        "description": "Reads a URL, including a classpath-based URL, and returns parsed content.\nThis function works similar to the `read` function.\n\n\nThe classpath-based URL uses the `classpath:` protocol prefix, for example:\n`classpath://myfolder/myFile.txt` where `myFolder` is located under\n`src/main/resources` in a Mule project. Other than the URL, `readURL` accepts\nthe same arguments as `read`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nreadUrl(\"https://jsonplaceholder.typicode.com/posts/1\", \"application/json\")",
            "output": "{ \"userId\": 1, \"id\": 1, \"title\": \"sunt aut ...\", \"body\": \"quia et ...\" }"
          },
          {
            "source": "%dw 2.0\nvar myJsonSnippet = readUrl(\"classpath://myJsonSnippet.json\", \"application/json\")\noutput application/csv\n---\n(myJsonSnippet.results map(item) -> item.profile)",
            "output": "firstName,lastName,email\njohn,doe,johndoe@demo.com\njane,doe,janedoe@demo.com"
          }
        ]
      }
    ]
  },
  "reduce": {
    "name": "reduce",
    "overloads": [
      {
        "module": "core",
        "signature": "reduce<T>(@StreamCapable items: Array<T>, callback: (item: T, accumulator: T) -> T): T | Null",
        "description": "Applies a reduction expression to the elements in an array.\n\n\nFor each element of the input array, in order, `reduce` applies the reduction\nlambda expression (function), then replaces the accumulator with the new\nresult. The lambda expression can use both the current input array element\nand the current accumulator value.\n\nNote that if the array is empty and no default value is set on the\naccumulator parameter, a null value is returned.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[2, 3] reduce ($ + $$)",
            "output": "5"
          },
          {
            "source": "%dw 2.0\nvar myNums = [1,2,3,4]\nvar myEmptyList = []\noutput application/json\n---\n{\n   \"sum\" : myNums reduce ($$ + $),\n   \"concat\" : myNums reduce ($$ ++ $),\n   \"emptyList\" : myEmptyList reduce ($$ ++ $)\n}",
            "output": "{ \"sum\": 10, \"concat\": \"1234\", \"emptyList\": null }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "reduce<T, A>(@StreamCapable items: Array<T>, callback: (item: T, accumulator: A) -> A): A",
        "description": "",
        "examples": []
      },
      {
        "module": "core",
        "signature": "reduce(@StreamCapable text: String, callback: (item: String, accumulator: String) -> String): String",
        "description": "Applies a reduction expression to the characters in a string.\n\n\nFor each character of the input string, in order, `reduce` applies the reduction\nlambda expression (function), then replaces the accumulator with the new\nresult. The lambda expression can use both the current character\nand the current accumulator value.\n\nNote that if the string is empty and no default value is set on the\naccumulator parameter, an empty string is returned.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"hello world\" reduce (item, acc = \"\") -> item ++ acc",
            "output": "\"dlrow olleh\""
          }
        ]
      },
      {
        "module": "core",
        "signature": "reduce<A>(@StreamCapable text: String, callback: (item: String, accumulator: A) -> A): A",
        "description": "",
        "examples": []
      },
      {
        "module": "core",
        "signature": "reduce<T, A>(@StreamCapable items: Null, callback: (item: T, accumulator: A) -> A): Null",
        "description": "Helper function that enables `reduce` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "remove": {
    "name": "remove",
    "overloads": [
      {
        "module": "strings",
        "signature": "remove(text: String, toRemove: String): String",
        "description": "Removes all occurrences of a specified pattern from a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport remove from dw::core::Strings\noutput application/json\n---\n\"lazyness purity state higher-order stateful\" remove \"state\"",
            "output": "\"lazyness purity  higher-order ful\""
          }
        ]
      },
      {
        "module": "strings",
        "signature": "remove(text: Null, toRemove: Any): Null",
        "description": "Helper function that enables `remove` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "repeat": {
    "name": "repeat",
    "overloads": [
      {
        "module": "strings",
        "signature": "repeat(text: String, times: Number): String",
        "description": "Repeats a `text` the number of specified `times`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": repeat(\"e\", 0),\n  \"b\": repeat(\"e\", 3),\n  \"c\": repeat(\"e\", -2)\n}",
            "output": "{\n  \"a\": \"\",\n  \"b\": \"eee\",\n  \"c\": \"\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "repeat(text: Null, times: Any): Null",
        "description": "Helper function that enables `repeat` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "replace": {
    "name": "replace",
    "overloads": [
      {
        "module": "core",
        "signature": "replace(text: String, matcher: Regex): ((Array<String>, Number) -> String) -> String",
        "description": "Performs string replacement.\n\n\nThis version  of `replace` accepts a Java regular expression for matching\npart of a string. It requires the use of the `with` helper function to\nspecify a replacement string for the matching part of the input string.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[\"123-456-7890\" replace /.*-/ with(\"\"), \"abc123def\" replace /[b13e]/ with(\"-\")]",
            "output": "[ 7890, \"a-c-2-d-f\" ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ \"my123\" replace /(\\d+)/ with(\"ID\"), replace(\"myOther123\", /(\\d+)/) with(\"ID\") ]",
            "output": "[ \"myID\", \"myOtherID\" ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "replace(text: String, matcher: String): ((Array<String>, Number) -> String) -> String",
        "description": "Performs string replacement.\n\n\nThis version of `replace` accepts a string that matches part of a specified\nstring. It requires the use of the `with` helper function to pass in a\nreplacement string for the matching part of the input string.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"replace\": \"admin123\" replace \"123\" with(\"ID\") }",
            "output": "{ \"replace\": \"adminID\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "replace(text: Null, matcher: Any): ((Nothing, Nothing) -> Any) -> Null",
        "description": "Helper function that enables `replace` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "replaceall": {
    "name": "replaceAll",
    "overloads": [
      {
        "module": "strings",
        "signature": "replaceAll(text: String, target: String, replacement: String): String",
        "description": "Replaces all substrings that match a literal search string with\na specified replacement string.\n\n\nReplacement proceeds from the beginning of the string to the end.\nFor example, the result of replacing `\"aa\"` with `\"b\"` in the\nstring` `\"aaa\"` is `\"ba\"`, rather than `\"ab\"`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "import * from dw::core::Strings\noutput application/json\n---\n{\n    a: replaceAll(\"Mariano\", \"a\" , \"A\"),\n    b: replaceAll(\"AAAA\", \"AAA\" , \"B\"),\n    c: replaceAll(null, \"aria\" , \"A\"),\n    d: replaceAll(\"Mariano\", \"j\" , \"Test\"),\n}",
            "output": "{\n   \"a\": \"MAriAno\",\n   \"b\": \"BA\",\n   \"c\": null,\n   \"d\": \"Mariano\"\n }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "replaceAll(text: Null, oldValue: String, newValue: String): Null",
        "description": "Helper function that enables `replaceAll` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "reverse": {
    "name": "reverse",
    "overloads": [
      {
        "module": "strings",
        "signature": "reverse(text: String): String",
        "description": "Reverses sequence of characters in a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n {\n     a: reverse(\"Mariano\"),\n     b: reverse(null),\n     c: reverse(\"\")\n }",
            "output": "{\n  \"a\": \"onairaM\",\n  \"b\": null,\n  \"c\": \"\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "reverse(text: Null): Null",
        "description": "Helper function that enables `reverse` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "rightpad": {
    "name": "rightPad",
    "overloads": [
      {
        "module": "strings",
        "signature": "rightPad(text: String, size: Number, padChar: String = \" \"): String",
        "description": "The specified `text` is _right_-padded to the `size` using the `padText`.\nBy default `padText` is `\" \"`.\n\n\nReturns right padded `String` or original `String` if no padding is necessary.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": rightPad(null, 3),\n  \"b\": rightPad(\"\", 3),\n  \"c\": rightPad(\"bat\", 5),\n  \"d\": rightPad(\"bat\", 3),\n  \"e\": rightPad(\"bat\", -1)\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"   \",\n  \"c\": \"bat  \",\n  \"d\": \"bat\",\n  \"e\": \"bat\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "rightPad(text: Null, size: Any, padText: Any = \" \"): Null",
        "description": "Helper function that enables `rightPad` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "rm": {
    "name": "rm",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "rm(path: Path):Boolean",
        "description": "`import * from dw::io::file::FileSystem`\n\nRemoves the file at the given location. Returns true if the file or folder was removed.\n\nIf the path is a file it will delete everything recursively.",
        "examples": [
          {
            "source": "%dw 2.0\nimport rm from dw::io::file::FileSystem\noutput application/json\n---\nrm(\"/home/dw/toRemove\")",
            "output": "true"
          }
        ]
      }
    ]
  },
  "round": {
    "name": "round",
    "overloads": [
      {
        "module": "core",
        "signature": "round(number: Number): Number",
        "description": "Rounds a number up or down to the nearest whole number.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ round(1.2), round(4.6), round(3.5) ]",
            "output": "[ 1, 5, 4 ]"
          }
        ]
      }
    ]
  },
  "run": {
    "name": "run",
    "overloads": [
      {
        "module": "runtime",
        "signature": "run(fileToExecute: String, fs: Dictionary<String>, readerInputs: Dictionary<ReaderInput> = {}, inputValues: Dictionary<Any> = {}, configuration: RuntimeExecutionConfiguration = {}): RunResult",
        "description": "Runs the input script under the provided context and executes\nthe script in the current runtime.\n\n_Experimental:_ This function is an experimental feature that is subject to change or removal from future versions of DataWeave.",
        "examples": [
          {
            "source": "import * from dw::Runtime\nvar jsonValue = {\n  value: '{\"name\": \"Mariano\"}' as Binary {encoding: \"UTF-8\"},\n  encoding: \"UTF-8\",\n  properties: {},\n  mimeType: \"application/json\"\n}\n\nvar jsonValue2 = {\n  value: '{\"name\": \"Mariano\", \"lastName\": \"achaval\"}' as Binary {encoding: \"UTF-8\"},\n  encoding: \"UTF-8\",\n  properties: {},\n  mimeType: \"application/json\"\n}\n\nvar invalidJsonValue = {\n  value: '{\"name\": \"Mariano' as Binary {encoding: \"UTF-8\"},\n  encoding: \"UTF-8\",\n  properties: {},\n  mimeType: \"application/json\"\n}\n\nvar Utils = \"fun sum(a,b) = a +b\"\n---\n{\n  \"execute_ok\" : run(\"main.dwl\", {\"main.dwl\": \"{a: 1}\"}, {\"payload\": jsonValue }),\n  \"logs\" : do {\n    var execResult = run(\"main.dwl\", {\"main.dwl\": \"{a: log(1)}\"}, {\"payload\": jsonValue })\n    ---\n    {\n        m: execResult.logs.message,\n        l: execResult.logs.level\n    }\n  },\n  \"grant\" : run(\"main.dwl\", {\"main.dwl\": \"{a: readUrl(`http://google.com`)}\"}, {\"payload\": jsonValue }, { securityManager: (grant, args) -> false }),\n  \"library\" : run(\"main.dwl\", {\"main.dwl\": \"Utils::sum(1,2)\", \"/Utils.dwl\": Utils }, {\"payload\": jsonValue }),\n  \"timeout\" : run(\"main.dwl\", {\"main.dwl\": \"(1 to 1000000000000) map \\$ + 1\" }, {\"payload\": jsonValue }, {timeOut: 2}).success,\n  \"execFail\" : run(\"main.dwl\", {\"main.dwl\": \"dw::Runtime::fail('My Bad')\" }, {\"payload\": jsonValue }),\n  \"parseFail\" : run(\"main.dwl\", {\"main.dwl\": \"(1 + \" }, {\"payload\": jsonValue }),\n  \"writerFail\" : run(\"main.dwl\", {\"main.dwl\": \"output application/xml --- 2\" }, {\"payload\": jsonValue }),\n  \"readerFail\" : run(\"main.dwl\", {\"main.dwl\": \"output application/xml --- payload\" }, {\"payload\": invalidJsonValue }),\n  \"defaultOutput\" : run(\"main.dwl\", {\"main.dwl\": \"payload\" }, {\"payload\": jsonValue2}, {outputMimeType: \"application/csv\", writerProperties: {\"separator\": \"|\"}}),\n}",
            "output": "{\n  \"execute_ok\": {\n    \"success\": true,\n    \"value\": \"{\\n  a: 1\\n}\",\n    \"mimeType\": \"application/dw\",\n    \"encoding\": \"UTF-8\",\n    \"logs\": [\n\n    ]\n  },\n  \"logs\": {\n    \"m\": [\n      \"1\"\n    ],\n    \"l\": [\n      \"INFO\"\n    ]\n  },\n  \"grant\": {\n    \"success\": false,\n    \"message\": \"The given required permissions: `Resource` are not being granted for this execution.\\nTrace:\\n  at readUrl (Unknown)\\n  at main::main (line: 1, column: 5)\",\n    \"location\": {\n      \"start\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"end\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"content\": \"Unknown location\"\n    },\n    \"stack\": [\n      \"readUrl (anonymous:0:0)\",\n      \"main (main:1:5)\"\n    ],\n    \"logs\": [\n\n    ]\n  },\n  \"library\": {\n    \"success\": true,\n    \"value\": \"3\",\n    \"mimeType\": \"application/dw\",\n    \"encoding\": \"UTF-8\",\n    \"logs\": [\n\n    ]\n  },\n  \"timeout\": false,\n  \"execFail\": {\n    \"success\": false,\n    \"message\": \"My Bad\\nTrace:\\n  at fail (Unknown)\\n  at main::main (line: 1, column: 1)\",\n    \"location\": {\n      \"start\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"end\": {\n        \"index\": 0,\n        \"line\": 0,\n        \"column\": 0\n      },\n      \"content\": \"Unknown location\"\n    },\n    \"stack\": [\n      \"fail (anonymous:0:0)\",\n      \"main (main:1:1)\"\n    ],\n    \"logs\": [\n\n    ]\n  },\n  \"parseFail\": {\n    \"success\": false,\n    \"message\": \"Invalid input \\\"1 + \\\", expected parameter or parenEnd (line 1, column 2):\\n\\n\\n1| (1 + \\n    ^^^^\\nLocation:\\nmain (line: 1, column:2)\",\n    \"location\": {\n      \"start\": {\n        \"index\": 0,\n        \"line\": 1,\n        \"column\": 2\n      },\n      \"end\": {\n        \"index\": 4,\n        \"line\": 1,\n        \"column\": 6\n      },\n      \"content\": \"\\n1| (1 + \\n    ^^^^\"\n    },\n    \"logs\": [\n\n    ]\n  },\n  \"writerFail\": {\n    \"success\": false,\n    \"message\": \"Trying to output non-whitespace characters outside main element tree (in prolog or epilog), while writing Xml at .\",\n    \"location\": {\n      \"content\": \"\"\n    },\n    \"stack\": [\n\n    ],\n    \"logs\": [\n\n    ]\n  },\n  \"readerFail\": {\n    \"success\": false,\n    \"message\": \"Unexpected end-of-input at payload@[1:18] (line:column), expected '\\\"', while reading `payload` as Json.\\n \\n1| {\\\"name\\\": \\\"Mariano\\n                    ^\",\n    \"location\": {\n      \"content\": \"\\n1| {\\\"name\\\": \\\"Mariano\\n                    ^\"\n    },\n    \"stack\": [\n\n    ],\n    \"logs\": [\n\n    ]\n  },\n  \"defaultOutput\": {\n    \"success\": true,\n    \"value\": \"name|lastName\\nMariano|achaval\\n\",\n    \"mimeType\": \"application/csv\",\n    \"encoding\": \"UTF-8\",\n    \"logs\": [\n\n    ]\n  }\n}"
          }
        ]
      }
    ]
  },
  "runurl": {
    "name": "runUrl",
    "overloads": [
      {
        "module": "runtime",
        "signature": "runUrl(url: String, readerInputs: Dictionary<ReaderInput> = {}, inputValues: Dictionary<Any> = {}, configuration: RuntimeExecutionConfiguration = {}): RunResult",
        "description": "Runs the script at the specified URL.\n\n_Experimental:_ This function is an experimental feature that is subject to change or removal from future versions of DataWeave.",
        "examples": [
          {
            "source": "import * from dw::Runtime\nvar jsonValue = {\n  value: '{\"name\": \"Mariano\"}' as Binary {encoding: \"UTF-8\"},\n  encoding: \"UTF-8\",\n  properties: {},\n  mimeType: \"application/json\"\n}\n\nvar Utils = \"fun sum(a,b) = a +b\"\n---\n{\n  \"execute_ok\" : runUrl(\"classpath://org/mule/weave/v2/engine/runtime_runUrl/example.dwl\", {\"payload\": jsonValue })\n}",
            "output": "{\n   \"execute_ok\": {\n     \"success\": true,\n     \"value\": \"\\\"Mariano\\\"\",\n     \"mimeType\": \"application/dw\",\n     \"encoding\": \"UTF-8\",\n     \"logs\": [\n\n     ]\n   }\n }"
          }
        ]
      }
    ]
  },
  "scan": {
    "name": "scan",
    "overloads": [
      {
        "module": "core",
        "signature": "scan(text: String, matcher: Regex): Array<Array<String>>",
        "description": "Returns an array with all of the matches found in an input string.\n\n\nEach match is returned as an array that contains the complete match followed\nby any capture groups in your regular expression (if present).",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nflatten(\"www.mulesoft.com\" scan(/([w]*)\\.([a-z]*)\\.([a-z]*)/))",
            "output": "[ \"www.mulesoft.com\", \"www\", \"mulesoft\", \"com\" ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"anypt@mulesoft.com,max@mulesoft.com\" scan(/([a-z]*)@([a-z]*).com/)",
            "output": "[\n  [ \"anypt@mulesoft.com\", \"anypt\", \"mulesoft\" ],\n  [ \"max@mulesoft.com\", \"max\", \"mulesoft\" ]\n]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "scan(text: Null, matcher: Any): Null",
        "description": "Helper function that enables `scan` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "seconds": {
    "name": "seconds",
    "overloads": [
      {
        "module": "periods",
        "signature": "seconds(nSecs: Number): Period",
        "description": "Creates a Period value from the provided number of seconds.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n  nextSecond: |2020-10-05T20:22:34.385Z| + seconds(1),\n  previousSecond: |2020-10-05T20:22:34.385Z| - seconds(1),\n  decimalInputPeriod: seconds(4.555),\n  wholeNumberInputPeriod: seconds(4),\n  addNegativeValue: seconds(-1) + seconds(2)\n}",
            "output": "{\n  \"nextSecond\": \"2020-10-05T20:22:35.385Z\",\n  \"previousSecond\": \"2020-10-05T20:22:33.385Z\",\n  \"decimalInputPeriod\": \"PT4.555S\",\n  \"wholeNumberInputPeriod\": \"PT4S\",\n  \"addNegativeValue\": 1\n}"
          }
        ]
      }
    ]
  },
  "separator": {
    "name": "separator",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "separator(): String",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the system-dependent default name-separator character, represented as a string for convenience.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\nimport separator from dw::io::file::FileSystem\n---\n// Will return \"/\" for Unix-based systems, and \"\\\" for Windows-based systems.\nseparator()",
            "output": "\"/\""
          }
        ]
      }
    ]
  },
  "sha1": {
    "name": "SHA1",
    "overloads": [
      {
        "module": "crypto",
        "signature": "SHA1(content: Binary): String",
        "description": "Computes the SHA1 hash and transforms the result into a hexadecimal,\nlowercase string.",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::Crypto\noutput application/json\n---\n{ \"sha1\" : Crypto::SHA1(\"dsasd\" as Binary) }",
            "output": "{ \"sha1\": \"2fa183839c954e6366c206367c9be5864e4f4a65\" }"
          }
        ]
      }
    ]
  },
  "sin": {
    "name": "sin",
    "overloads": [
      {
        "module": "math",
        "signature": "sin(angle: Number): Number",
        "description": "Returns the trigonometric sine of an angle from a given number of radians.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"sin0\": sin(0),\n  \"sin13\": sin(0.13),\n  \"sin-1\": sin(-1)\n}",
            "output": "{\n  \"sin0\": 0.0,\n  \"sin13\": 0.12963414261969486,\n  \"sin-1\": -0.8414709848078965\n}"
          }
        ]
      }
    ]
  },
  "singularize": {
    "name": "singularize",
    "overloads": [
      {
        "module": "strings",
        "signature": "singularize(text: String): String",
        "description": "Converts a plural string to its singular form.\n\n\nIf the input is already singular (for example, \"box\"), the output will match\nthe input.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{ \"singularize\" : singularize(\"boxes\") }",
            "output": "{ \"singularize\" : \"box\" }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "singularize(text: Null): Null",
        "description": "Helper function that enables `singularize` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "sizeof": {
    "name": "sizeOf",
    "overloads": [
      {
        "module": "core",
        "signature": "sizeOf(array: Array<Any>): Number",
        "description": "Returns the number of elements in an array. It returns `0` if the array\nis empty.\n\n\nThis version of `sizeOf` takes an array or an array of arrays as input.\nOther versions act on arrays of objects, strings, or binary values.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nsizeOf([ \"a\", \"b\", \"c\"])",
            "output": "3"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  \"arraySizes\": {\n     size3: sizeOf([1,2,3]),\n     size2: sizeOf([[1,2,3],[4]]),\n     size0: sizeOf([])\n   }\n}",
            "output": "{\n   \"arraySizes\": {\n     \"size3\": 3,\n     \"size2\": 2,\n     \"size0\": 0\n   }\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(object: Object): Number",
        "description": "Returns the number of key-value pairs in an object.\n\n\nThis function accepts an array of objects. Returns `0` if the input object is\nempty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nsizeOf({a: 1, b: 2})",
            "output": "2"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n   objectSizes : {\n     sizeIs2: sizeOf({a:1,b:2}),\n     sizeIs0: sizeOf({})\n   }\n}",
            "output": "{\n  \"objectSize\": {\n    \"sizeIs2\": 2,\n    \"sizeIs0\": 0\n  }\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(binary: Binary): Number",
        "description": "Returns the size of a binary payload in bytes. Returns 0 if the payload is empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n\nBinarySizeOf: sizeOf(\"'my word'\" as Binary) ++ \" \" ++ sizeOf(\"'my word'\" as Binary),\n\nStringSizeOf: sizeOf(\"'my word'\") ++ \" \" ++ sizeOf(\"'my word'\")\n\n}",
            "output": "{\n\n\"BinarySizeOf\": \"9 9\",\n\n\"StringSizeOf\": \"9 9\"\n\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(text: String): Number",
        "description": "Returns the number of characters (including white space) in an string.\n\n\nReturns `0` if the string is empty.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nsizeOf(\"abc\")",
            "output": "3"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  sizeOfSting2 : sizeOf(\"my string\"),\n  sizeOfEmptyString: sizeOf(\"\"),\n  sizeOfNumber : sizeOf(\"123\" as Number)\n}",
            "output": "{\n  \"sizeOfSting2\": 9,\n  \"sizeOfEmptyString\": 0,\n  \"sizeOfNumber\": 1\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(value: Period): Number",
        "description": "Returns the number of characters in a `Period` value.\n\n_Introduced in DataWeave version 2.6.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  a: sizeOf(|P3D|)\n}",
            "output": "{ \"a\": 3 }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(value: DateTime): Number",
        "description": "Returns the number of characters in a `DateTime` value.\n\n_Introduced in DataWeave version 2.6.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  a: sizeOf(|2025-07-13T18:06:59.314033Z|)\n}",
            "output": "{ \"a\": 27 }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(value: LocalDateTime): Number",
        "description": "Returns the number of characters in a `LocalDateTime` value.\n\n_Introduced in DataWeave version 2.6.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  a: sizeOf(|2025-07-13T18:06:59.314033|)\n}",
            "output": "{ \"a\": 26 }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(number: Number): Number",
        "description": "Returns the number of characters in a `Number` value.\n\n\nTo keep backward compatibility with 2.4, this function returns `1` for any `Number` value when the flag `com.mulesoft.dw.legacySizeOfNumber` is enabled.\n\n_Introduced in DataWeave version 2.6.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  a: sizeOf(123),\n  b: sizeOf(123.45)\n}",
            "output": "{ \"a\": 3, \"b\": 6 }"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  a: sizeOf(123)\n  b: sizeOf(123.45)\n}",
            "output": "{ \"a\": 1, \"b\": 1 }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "sizeOf(n: Null): Null",
        "description": "Helper function that enables `sizeOf` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "slice": {
    "name": "slice",
    "overloads": [
      {
        "module": "arrays",
        "signature": "slice<T>(array: Array<T>, from: Number, until: Number): Array<T>",
        "description": "Selects the interval of elements that satisfy the condition:\n`from &lt;= indexOf(array) < until`\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar arr = [0,1,2,3,4,5]\n---\nslice(arr, 1, 4)",
            "output": "[\n  1,\n  2,\n  3\n]"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "slice(array: Null, from: Any, until: Any): Null",
        "description": "Helper function that enables `slice` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "some": {
    "name": "some",
    "overloads": [
      {
        "module": "arrays",
        "signature": "some<T>(list: Array<T>, condition: (T) -> Boolean): Boolean",
        "description": "Returns `true` if at least one element in the array matches the specified condition.\n\n\nThe function stops iterating after the first element that matches the condition is found.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\n---\n{ \"results\" : [\n    \"ok\" : [\n      [1,2,3] some (($ mod 2) == 0),\n      [1,2,3] some ((nextNum) -> (nextNum mod 2) == 0),\n      [1,2,3] some (($ mod 2) == 1),\n      [1,2,3,4,5,6,7,8] some (log('should stop at 2 ==', $) == 2),\n      [1,2,3] some ($ == 1),\n      [1,1,1] some ($ == 1),\n      [1] some ($ == 1)\n    ],\n    \"err\" : [\n      [1,2,3] some ($ == 100),\n      [1] some ($ == 2)\n    ]\n  ]\n}",
            "output": "{\n   \"results\": [\n     {\n       \"ok\": [ true, true, true, true, true, true, true ]\n     },\n     {\n       \"err\": [ false, false ]\n     }\n   ]\n }"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "some(list: Null, condition: (Nothing) -> Any): Boolean",
        "description": "Helper function that enables `some` to work with a `null` value.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": []
      }
    ]
  },
  "somecharacter": {
    "name": "someCharacter",
    "overloads": [
      {
        "module": "strings",
        "signature": "someCharacter(text: String, condition: (character: String) -> Boolean): Boolean",
        "description": "Checks whether a condition is valid for at least one of the characters or blank spaces\nin a string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n\"someCharacter\" someCharacter isUpperCase($)",
            "output": "true"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "someCharacter(text: Null, condition: (character: Nothing) -> Any): false",
        "description": "Helper function that enables `someCharacter` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "someentry": {
    "name": "someEntry",
    "overloads": [
      {
        "module": "objects",
        "signature": "someEntry(obj: Object, condition: (value: Any, key: Key) -> Boolean): Boolean",
        "description": "Returns `true` if at least one entry in the object matches the specified condition.\n\n\nThe function stops iterating after the first element that matches the condition is found.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport someEntry from dw::core::Objects\noutput application/json\n---\n{\n    a: {} someEntry (value, key) -> value is String,\n    b: {a: \"\", b: \"123\"} someEntry (value, key) -> value is String,\n    c: {a: \"\", b: 123} someEntry (value, key) -> value is String,\n    d: {a: \"\", b: 123} someEntry (value, key) -> key as String == \"a\",\n    e: {a: \"\"} someEntry (value, key) -> key as String == \"b\",\n    f: null someEntry (value, key) -> key as String == \"a\"\n}",
            "output": "{\n  \"a\": false,\n  \"b\": true,\n  \"c\": true,\n  \"d\": true,\n  \"e\": false,\n  \"f\": false\n}"
          }
        ]
      },
      {
        "module": "objects",
        "signature": "someEntry(obj: Null, condition: (value: Nothing, key: Nothing) -> Boolean): Boolean",
        "description": "Helper function that enables `someEntry` to work with a `null` value.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": []
      }
    ]
  },
  "splitat": {
    "name": "splitAt",
    "overloads": [
      {
        "module": "arrays",
        "signature": "splitAt<T>(array: Array<T>, n: Number): Pair<Array<T>, Array<T>>",
        "description": "Splits an array into two at a given position.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar users = [\"Mariano\", \"Leandro\", \"Julian\"]\n---\nusers splitAt 1",
            "output": "{\n  \"l\": [\n    \"Mariano\"\n  ],\n  \"r\": [\n    \"Leandro\",\n    \"Julian\"\n  ]\n}"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "splitAt(array: Null, n: Any): Null",
        "description": "Helper function that enables `splitAt` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "splitby": {
    "name": "splitBy",
    "overloads": [
      {
        "module": "core",
        "signature": "splitBy(text: String, regex: Regex): Array<String>",
        "description": "Splits a string into a string array based on a value that matches part of that\nstring. It filters out the matching part from the returned array.\n\n\nThis version of `splitBy` accepts a Java regular expression (regex) to\nmatch the input string. The regex can match any character in the input\nstring. Note that `splitBy` performs the opposite operation of `joinBy`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"192.88.99.0/24\" splitBy(/[.\\/]/)",
            "output": "[\"192\", \"88\", \"99\", \"0\", \"24\"]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"splitters\" : {\n   \"split1\" : \"a-b-c\" splitBy(/.b./),\n   \"split2\" : \"hello world\" splitBy(/\\s/),\n   \"split3\" : \"no match\" splitBy(/^s/),\n   \"split4\" : \"no match\" splitBy(/^n../),\n   \"split5\" : \"a1b2c3d4A1B2C3D\" splitBy(/[0-9A-Z]/)\n  }\n}",
            "output": "{\n  splitters: {\n    split1: [ \"a\", \"c\" ],\n    split2: [ \"hello\", \"world\" ],\n    split3: [ \"no match\" ],\n    split4: [ \"\", \"match\" ],\n    split5: [ \"a\", \"b\", \"c\", \"d\" ]\n  }\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "splitBy(text: String, separator: String): Array<String>",
        "description": "Splits a string into a string array based on a separating string that matches\npart of the input string. It also filters out the matching string from the\nreturned array.\n\n\nThe separator can match any character in the input. Note that `splitBy` performs\nthe opposite operation of `joinBy`.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n\"192.88.99.0\" splitBy(\".\")",
            "output": "[\"192\", \"88\", \"99\", \"0\"]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"splitters\" : {\n    \"split1\" : \"a-b-c\" splitBy(\"-\"),\n    \"split2\" : \"hello world\" splitBy(\"\"),\n    \"split3\" : \"first,middle,last\" splitBy(\",\"),\n    \"split4\" : \"no split\" splitBy(\"NO\")\n   }\n}",
            "output": "{\n  splitters: {\n    split1: [ \"a\",\"b\",\"c\" ],\n    split2: [ \"h\",\"e\",\"l\",\"l\",\"o\",\"\",\"w\",\"o\",\"r\",\"l\",\"d\" ],\n    split3: [ \"first\",\"middle\",\"last\"],\n    split4: [ \"no split\"]\n  }\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "splitBy(text: Null, separator: Any)",
        "description": "Helper function that enables `splitBy` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "splitwhere": {
    "name": "splitWhere",
    "overloads": [
      {
        "module": "arrays",
        "signature": "splitWhere<T>(array: Array<T>, condition: (item: T) -> Boolean): Pair<Array<T>, Array<T>>",
        "description": "Splits an array into two at the first position where the condition is met.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar users = [\"Mariano\", \"Leandro\", \"Julian\", \"Tomo\"]\n---\nusers splitWhere (item) -> item startsWith \"Jul\"",
            "output": "{\n  \"l\": [\n    \"Mariano\",\n    \"Leandro\"\n  ],\n  \"r\": [\n    \"Julian\",\n    \"Tomo\"\n  ]\n}"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "splitWhere(array: Null, condition: (item: Nothing) -> Any): Null",
        "description": "Helper function that enables `splitWhere` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "sqrt": {
    "name": "sqrt",
    "overloads": [
      {
        "module": "core",
        "signature": "sqrt(number: Number): Number",
        "description": "Returns the square root of a number.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ sqrt(4), sqrt(25), sqrt(100) ]",
            "output": "[ 2, 5, 10 ]"
          }
        ]
      }
    ]
  },
  "startswith": {
    "name": "startsWith",
    "overloads": [
      {
        "module": "core",
        "signature": "startsWith(text: String, prefix: String): Boolean",
        "description": "Returns `true` or `false` depending on whether the input string starts with a\nmatching prefix.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ \"Mari\" startsWith(\"Mar\"), \"Mari\" startsWith(\"Em\") ]",
            "output": "[ true, false ]"
          }
        ]
      },
      {
        "module": "core",
        "signature": "startsWith(text: Null, prefix: Any): false",
        "description": "Helper function that enables `startsWith` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "startwith": {
    "name": "startWith",
    "overloads": [
      {
        "module": "asserts",
        "signature": "startWith(expected:String): Matcher<String>",
        "description": "`import * from dw::test::Asserts`\n\nValidates that the asserted String starts with the given String",
        "examples": [
          {
            "source": "%dw 2.0\nimport dw::tests::Asserts\n---\n\"A Text\" must startWith(\"A\")",
            "output": ""
          }
        ]
      }
    ]
  },
  "substring": {
    "name": "substring",
    "overloads": [
      {
        "module": "strings",
        "signature": "substring(text: String, from: Number, until: Number): String",
        "description": "Returns a substring that spans from the character at the\nspecified `from` index to the last character before the\n`until` index.\n\n\nThe characters in the substring satisfy the condition\n`from &lt;= indexOf(string) < until`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\nvar text = \"hello world!\"\n---\nsubstring(text, 1, 5)",
            "output": "\"ello\""
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substring(text: Null, from: Any, until: Any): Null",
        "description": "Helper function that enables `substring` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "substringafter": {
    "name": "substringAfter",
    "overloads": [
      {
        "module": "strings",
        "signature": "substringAfter(text: String, separator: String): String",
        "description": "Gets the substring after the first occurrence of a separator. The separator\nis not returned.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": substringAfter(null, \"'\"),\n  \"b\": substringAfter(\"\", \"-\"),\n  \"c\": substringAfter(\"abc\", \"b\"),\n  \"d\": substringAfter(\"abcba\", \"b\"),\n  \"e\": substringAfter(\"abc\", \"d\"),\n  \"f\": substringAfter(\"abc\", \"\")\n}",
            "output": "{\n\n  \"a\": null,\n  \"b\": \"\",\n  \"c\": \"c\",\n  \"d\": \"cba\",\n  \"e\": \"\",\n  \"f\": \"abc\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substringAfter(text: Null, separator: String): Null",
        "description": "Helper function that enables `substringAfter` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "substringafterlast": {
    "name": "substringAfterLast",
    "overloads": [
      {
        "module": "strings",
        "signature": "substringAfterLast(text: String, separator: String): String",
        "description": "Gets the substring after the last occurrence of a separator. The separator\nis not returned.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": substringAfterLast(null, \"'\"),\n  \"b\": substringAfterLast(\"\", \"-\"),\n  \"c\": substringAfterLast(\"abc\", \"b\"),\n  \"d\": substringAfterLast(\"abcba\", \"b\"),\n  \"e\": substringAfterLast(\"abc\", \"d\"),\n  \"f\": substringAfterLast(\"abc\", \"\")\n}",
            "output": "{\n \"a\": null,\n \"b\": \"\",\n \"c\": \"c\",\n \"d\": \"a\",\n \"e\": \"\",\n \"f\": null\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substringAfterLast(text: Null, separator: String): Null",
        "description": "Helper function that enables `substringAfterLast` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "substringbefore": {
    "name": "substringBefore",
    "overloads": [
      {
        "module": "strings",
        "signature": "substringBefore(text: String, separator: String): String",
        "description": "Gets the substring before the first occurrence of a separator. The separator\nis not returned.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": substringBefore(null, \"'\"),\n  \"b\": substringBefore(\"\", \"-\"),\n  \"c\": substringBefore(\"abc\", \"b\"),\n  \"d\": substringBefore(\"abc\", \"c\"),\n  \"e\": substringBefore(\"abc\", \"d\"),\n  \"f\": substringBefore(\"abc\", \"\")\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"\",\n  \"c\": \"a\",\n  \"d\": \"ab\",\n  \"e\": \"\",\n  \"f\": \"\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substringBefore(text: Null, separator: String): Null",
        "description": "Helper function that enables `substringBefore` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "substringbeforelast": {
    "name": "substringBeforeLast",
    "overloads": [
      {
        "module": "strings",
        "signature": "substringBeforeLast(text: String, separator: String): String",
        "description": "Gets the substring before the last occurrence of a separator. The separator\nis not returned.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": substringBeforeLast(null, \"'\"),\n  \"b\": substringBeforeLast(\"\", \"-\"),\n  \"c\": substringBeforeLast(\"abc\", \"b\"),\n  \"d\": substringBeforeLast(\"abcba\", \"b\"),\n  \"e\": substringBeforeLast(\"abc\", \"d\"),\n  \"f\": substringBeforeLast(\"abc\", \"\")\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"\",\n  \"c\": \"a\",\n  \"d\": \"abc\",\n  \"e\": \"\",\n  \"f\": \"ab\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substringBeforeLast(text: Null, separator: String): Null",
        "description": "Helper function that enables `substringBeforeLast` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "substringby": {
    "name": "substringBy",
    "overloads": [
      {
        "module": "strings",
        "signature": "substringBy(text: String, predicate: (character: String, index: Number) -> Boolean): Array<String>",
        "description": "Splits a string at each character where the `predicate` expression\nreturns `true`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport substringBy from dw::core::Strings\noutput application/json\n---\n\"hello~world=here_data-weave\" substringBy $ == \"~\" or $ == \"=\" or $ == \"_\"",
            "output": "[\"hello\", \"world\", \"here\", \"data-weave\"]"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substringBy(text: Null, predicate: (character: Nothing, index: Nothing) -> Any): Null",
        "description": "Helper function that enables `substringBy` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "substringevery": {
    "name": "substringEvery",
    "overloads": [
      {
        "module": "strings",
        "signature": "substringEvery(text: String, amount: Number): Array<String>",
        "description": "Splits a string into an array of substrings equal to a specified length.\n\n\nThe last substring can be shorter than that length. If the length\nis greater than or equal to the length of the string to split, the\nfunction returns the entire string.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport substringEvery from dw::core::Strings\noutput application/json\n---\nsubstringEvery(\"substringEvery\", 3)",
            "output": "[\"sub\", \"str\", \"ing\", \"Eve\", \"ry\"]"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "substringEvery(text: Null, amount: Any): Null",
        "description": "Helper function that enables `substringEvery` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "sum": {
    "name": "sum",
    "overloads": [
      {
        "module": "core",
        "signature": "sum(@StreamCapable values: Array<Number>): Number",
        "description": "Returns the sum of numeric values in an array.\n\n\nReturns `0` if the array is empty and produces an error when non-numeric\nvalues are in the array.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nsum([1, 2, 3])",
            "output": "6"
          }
        ]
      }
    ]
  },
  "sumby": {
    "name": "sumBy",
    "overloads": [
      {
        "module": "arrays",
        "signature": "sumBy<T>(@StreamCapable array: Array<T>, numberSelector: (T) -> Number): Number",
        "description": "Returns the sum of the values of the elements in an array.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\n---\n{\n  \"sumBy\" : [\n    [ { a: 1 }, { a: 2 }, { a: 3 } ] sumBy $.a,\n    sumBy([ { a: 1 }, { a: 2 }, { a: 3 } ], (item) -> item.a)\n  ]\n}",
            "output": "{ \"sumBy\" : [ 6, 6 ] }"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "sumBy(array: Null, numberSelector: (Nothing) -> Any): Null",
        "description": "Helper function that enables `sumBy` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "take": {
    "name": "take",
    "overloads": [
      {
        "module": "arrays",
        "signature": "take<T>(array: Array<T>, n: Number): Array<T>",
        "description": "Selects the first `n` elements. It returns an empty array when `n &lt;= 0`\nand the original array when `n > sizeOf(array)`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\nvar users = [\"Mariano\", \"Leandro\", \"Julian\"]\noutput application/json\n---\ntake(users, 2)",
            "output": "[\n  \"Mariano\",\n  \"Leandro\"\n]"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "take(array: Null, n: Any): Null",
        "description": "Helper function that enables `take` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "takewhile": {
    "name": "takeWhile",
    "overloads": [
      {
        "module": "arrays",
        "signature": "takeWhile<T>(array: Array<T>, condition: (item: T) -> Boolean): Array<T>",
        "description": "Selects elements from the array while the condition is met but\nstops the selection process when it reaches an element that\nfails to satisfy the condition.\n\n\nTo select all elements that meet the condition, use the `filter` function.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\nvar arr = [0,1,2,1]\n---\narr takeWhile $ <= 1",
            "output": "[\n  0,\n  1\n]"
          }
        ]
      },
      {
        "module": "arrays",
        "signature": "takeWhile(array: Null, condition: (item: Nothing) -> Any): Null",
        "description": "Helper function that enables `takeWhile` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      },
      {
        "module": "objects",
        "signature": "takeWhile<T>(obj: Object, condition: (value: Any, key: Key) -> Boolean): Object",
        "description": "Selects key-value pairs from the object while the condition is met.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Objects\noutput application/json\nvar obj = {\n  \"a\": 1,\n  \"b\": 2,\n  \"c\": 5,\n  \"d\": 1\n}\n---\nobj takeWhile ((value, key) ->  value < 3)",
            "output": "{\n  \"a\": 1,\n  \"b\": 2\n}"
          }
        ]
      }
    ]
  },
  "tan": {
    "name": "tan",
    "overloads": [
      {
        "module": "math",
        "signature": "tan(angle: Number): Number",
        "description": "Returns the trigonometric tangent of an angle from a given number of radians.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n   \"tan0\": tan(0),\n   \"tan13\": tan(0.13),\n   \"tan-1\": tan(-1)\n}",
            "output": "{\n   \"tan0\": 0.0,\n   \"tan13\": 0.13073731800446006,\n   \"tan-1\": -1.5574077246549023\n }"
          }
        ]
      }
    ]
  },
  "then": {
    "name": "then",
    "overloads": [
      {
        "module": "core",
        "signature": "then(value: Null, callback: (previousResult: Nothing) -> Any): Null",
        "description": "Helper function that enables `then` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      },
      {
        "module": "core",
        "signature": "then<T, R>(previous: T, callback: (result: T) -> R): R",
        "description": "This function works as a pipe that passes the value returned from the\npreceding expression to the next (a callback) only if the value returned\nby the preceding expression is not `null`.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n    \"chainResult\": [\"mariano\", \"de Achaval\"]\n            reduce ((item, accumulator) -> item ++ accumulator)\n            then ((result) -> sizeOf(result)),\n    \"referenceResult\" : [\"mariano\", \"de Achaval\"]\n                         map ((item, index) -> upper(item))\n                         then {\n                            name: $[0],\n                            lastName: $[1],\n                            length: sizeOf($)\n                        },\n    \"onNullReturnNull\": []\n                reduce ((item, accumulator) -> item ++ accumulator)\n                then ((result) -> sizeOf(result))\n}",
            "output": "{\n   \"chainResult\": 17,\n   \"referenceResult\": {\n     \"name\": \"MARIANO\",\n     \"lastName\": \"DE ACHAVAL\",\n     \"length\": 2\n   },\n   \"onNullReturnNull\": null\n }"
          }
        ]
      }
    ]
  },
  "time": {
    "name": "time",
    "overloads": [
      {
        "module": "dates",
        "signature": "time(parts: TimeFactory): Time",
        "description": "Creates a `Time` value from values specified for `hour`, `minutes`, `seconds`, and\n`timezone` fields.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\n{\n  newTime: time({ hour: 12, minutes: 30, seconds: 40 , timeZone: |-03:00| })\n}",
            "output": "{\n   \"newTime\": \"12:30:40-03:00\"\n}"
          }
        ]
      },
      {
        "module": "timer",
        "signature": "time<T>(valueToMeasure: () -> T): TimeMeasurement<T>",
        "description": "Executes the input function and returns a `TimeMeasurement` object that\ncontains the start and end time for the execution of that function, as well\nthe result of the function.",
        "examples": []
      }
    ]
  },
  "tmp": {
    "name": "tmp",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "tmp(): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the Path value of the tmp directory.",
        "examples": []
      }
    ]
  },
  "to": {
    "name": "to",
    "overloads": [
      {
        "module": "core",
        "signature": "to(from: Number, to: Number): Range",
        "description": "Returns a range with the specified boundaries.\n\n\nThe upper boundary is inclusive.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"myRange\": 1 to 10 }",
            "output": "{ \"myRange\": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }"
          },
          {
            "source": "%dw 2.0\nvar myVar = \"Hello World!\"\noutput application/json\n---\n{\n  indices2to6 : myVar[2 to 6],\n  indicesFromEnd : myVar[6 to -1],\n  reversal : myVar[11 to -0]\n}",
            "output": "{\n  \"indices2to6\": \"llo W\",\n  \"indicesFromEnd\": \"World!\",\n  \"reversal\": \"!dlroW olleH\"\n}"
          }
        ]
      }
    ]
  },
  "toarray": {
    "name": "toArray",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toArray(@StreamCapable text: String): Array<String>",
        "description": "Splits a `String` value into an `Array` of characters.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json indent=false\n---\n{\n  a: toArray(\"\"),\n  b: toArray(\"hola\")\n}",
            "output": "{\"a\": [],\"b\": [\"h\",\"o\",\"l\",\"a\"]}"
          }
        ]
      }
    ]
  },
  "tobase64": {
    "name": "toBase64",
    "overloads": [
      {
        "module": "binaries",
        "signature": "toBase64(content: Binary): String",
        "description": "Transforms a binary value into a Base64 string.",
        "examples": [
          {
            "source": "%dw 2.0\n\nimport dw::Crypto\nimport toBase64 from dw::core::Binaries\n\nvar emailChecksum = Crypto::MD5(\"achaval@gmail.com\" as Binary)\nvar image = readUrl(log(\"https://www.gravatar.com/avatar/$(emailChecksum)\"), \"application/octet-stream\")\n\noutput application/json\n---\ntoBase64(image)",
            "output": "\"/9j/4AAQSkZJRgABAQEAYABgAAD//...\""
          }
        ]
      }
    ]
  },
  "tobinary": {
    "name": "toBinary",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toBinary(str: String, encoding: String): Binary",
        "description": "Transform a `String` value into a `Binary` value\nusing the specified encoding.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  'UTF-16Ex': toBinary(\"DW\", \"UTF-16\"),\n  'utf16Ex': toBinary(\"DW\", \"utf16\"),\n  'UnicodeBigEx': toBinary(\"DW\", \"UnicodeBig\"),\n  'UTF-32Ex': toBinary(\"DW\", \"UTF-32\"),\n  'UTF_32Ex': toBinary(\"DW\", \"UTF_32\")\n}",
            "output": "{\n  \"UTF-16Ex\": \"/v8ARABX\" as Binary {base: \"64\"},\n  utf16Ex: \"/v8ARABX\" as Binary {base: \"64\"},\n  UnicodeBigEx: \"/v8ARABX\" as Binary {base: \"64\"},\n  \"UTF-32Ex\": \"AAAARAAAAFc=\" as Binary {base: \"64\"},\n  UTF_32Ex: \"AAAARAAAAFc=\" as Binary {base: \"64\"}\n}"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "toBinary(number: Number): String",
        "description": "Transforms a decimal number into a binary number.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport toBinary from dw::core::Numbers\noutput application/json\n---\n{\n    a: toBinary(-2),\n    b: toBinary(100000000000000000000000000000000000000000000000000000000000000),\n    c: toBinary(0),\n    d: toBinary(null),\n    e: toBinary(2),\n}",
            "output": "{\n  \"a\": \"-10\",\n  \"b\": \"11111000111010111010110100101011100001001110000011010101100010111101001011100000100010011000011101100101101001111101111010110010010100110010100100000000000000000000000000000000000000000000000000000000000000\",\n  \"c\": \"0\",\n  \"d\": null,\n  \"e\": \"10\"\n}"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "toBinary(number: Null): Null",
        "description": "Helper function that enables `toBinary` to work with null value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "toboolean": {
    "name": "toBoolean",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toBoolean(str: String): Boolean",
        "description": "Transform a `String` value into a `Boolean` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n  a: toBoolean(\"true\"),\n  b: toBoolean(\"false\"),\n  c: toBoolean(\"FALSE\"),\n  d: toBoolean(\"TrUe\")\n}",
            "output": "{\n  \"a\": true,\n  \"b\": false,\n  \"c\": false,\n  \"d\": true\n}"
          }
        ]
      }
    ]
  },
  "todate": {
    "name": "toDate",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toDate(str: String, formatters: Array<Formatter>): Date",
        "description": "Transforms a `String` value into a `Date` value using the first `Formatter` that\nmatches with the given value to transform.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nimport * from dw::Runtime\noutput application/dw\n---\n{\n  a: toDate(\"2023-28-03\", [{format: \"yyyy/MM/dd\"}, {format: \"yyyy-dd-MM\", locale: \"en_US\"}]),\n  b: try(() -> toDate(\"2023-28-03\", [{format: \"yyyy/MM/dd\"}])).error.message\n}",
            "output": "{\n  a: |2023-03-28| as Date {format: \"yyyy-dd-MM\", locale: \"en_US\"},\n  b: \"Could not find a valid formatter for '2023-28-03'\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toDate(str: String, format: String | Null = null, locale: String | Null = null): Date",
        "description": "Transforms a `String` value into a `Date` value\nand accepts a format and locale.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toDate(\"2015-10-01\"),\n  b: toDate(\"2003/10/01\",\"uuuu/MM/dd\")\n}",
            "output": "{\n  a: |2015-10-01|,\n  b: |2003-10-01| as Date {format: \"uuuu/MM/dd\"}\n}"
          }
        ]
      }
    ]
  },
  "todateornull": {
    "name": "toDateOrNull",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toDateOrNull(str: String, formatters: Array<Formatter>): Date | Null",
        "description": "Transforms a `String` value into a `Date` value using the first `Formatter` that matches\nwith the given value to transform.\n\n\nIf none of the `Formatter` matches with the given value, the function returns a `null` value.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toDateOrNull(\"2023-28-03\", [{format: \"yyyy/MM/dd\"}, {format: \"yyyy-dd-MM\", locale: \"en_US\"}]),\n  b: toDateOrNull(\"2023-28-03\", [{format: \"yyyy/MM/dd\"}])\n}",
            "output": "{\n  a: |2023-03-28| as Date {format: \"yyyy-dd-MM\", locale: \"en_US\"},\n  b: null\n}"
          }
        ]
      }
    ]
  },
  "todatetime": {
    "name": "toDateTime",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toDateTime(str: String, formatters: Array<Formatter>): DateTime",
        "description": "Transforms a `String` value into a `DateTime` value using the first `Formatter` that\nmatches with the given value to transform.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nimport * from dw::Runtime\noutput application/dw\n---\n{\n  a: toDateTime(\"2003-10-01 23:57:59Z\", [{format: \"uuuu/MM/dd HH:mm:ssz\"}, {format: \"uuuu-MM-dd HH:mm:ssz\"}]),\n  b: try(() -> toDateTime(\"2003-10-01 23:57:59Z\", [{format: \"uuuu/MM/dd HH:mm:ssz\"}])).error.message\n}",
            "output": "{\n  a: |2003-10-01T23:57:59Z| as DateTime {format: \"uuuu-MM-dd HH:mm:ssz\"},\n  b: \"Could not find a valid formatter for '2003-10-01 23:57:59Z'\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toDateTime(number: Number, unit: MillisOrSecs | Null = null): DateTime",
        "description": "Transforms a `Number` value into a `DateTime` value\nusing `milliseconds` or `seconds` as the unit.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n    fromEpoch: toDateTime(1443743879),\n    fromMillis: toDateTime(1443743879000, \"milliseconds\")\n}",
            "output": "{\n  fromEpoch: |2015-10-01T23:57:59Z|,\n  fromMillis: |2015-10-01T23:57:59Z| as DateTime {unit: \"milliseconds\"}\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toDateTime(str: String, format: String | Null = null, locale: String | Null = null): DateTime",
        "description": "Transforms a `String` value into a `DateTime` value\nand accepts a format and locale.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n   a: toDateTime(\"2015-10-01T23:57:59Z\"),\n   b: toDateTime(\"2003-10-01 23:57:59Z\",\"uuuu-MM-dd HH:mm:ssz\")\n}",
            "output": "{\n  a: |2015-10-01T23:57:59Z|,\n  b: |2003-10-01T23:57:59Z| as DateTime {format: \"uuuu-MM-dd HH:mm:ssz\"}\n}"
          }
        ]
      }
    ]
  },
  "todatetimeornull": {
    "name": "toDateTimeOrNull",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toDateTimeOrNull(str: String, formatters: Array<Formatter>): DateTime | Null",
        "description": "Transforms a `String` value into a `DateTime` value using the first `Formatter` that matches\nwith the given value to transform.\n\n\nIf none of the `Formatter` matches with the given value, the function returns a `null` value.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toDateTimeOrNull(\"2003-10-01 23:57:59Z\", [{format: \"uuuu/MM/dd HH:mm:ssz\"}, {format: \"uuuu-MM-dd HH:mm:ssz\"}]),\n  b: toDateTimeOrNull(\"2003-10-01 23:57:59Z\", [{format: \"uuuu/MM/dd HH:mm:ssz\"}])\n}",
            "output": "{\n  a: |2003-10-01T23:57:59Z| as DateTime {format: \"uuuu-MM-dd HH:mm:ssz\"},\n  b: null\n}"
          }
        ]
      }
    ]
  },
  "today": {
    "name": "today",
    "overloads": [
      {
        "module": "dates",
        "signature": "today(): Date",
        "description": "Returns the date for today as a `Date` type.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\ntoday()",
            "output": "\"2021-05-15\""
          }
        ]
      }
    ]
  },
  "todegrees": {
    "name": "toDegrees",
    "overloads": [
      {
        "module": "math",
        "signature": "toDegrees(angrad: Number): Number",
        "description": "Converts an angle measured in radians to an approximately\nequivalent number of degrees.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"toDegrees0.17\":  toDegrees(0.174),\n  \"toDegrees0\": toDegrees(0),\n  \"toDegrees-20\": toDegrees(-0.20)\n}",
            "output": "{\n   \"toDegrees0.17\": 9.969465635276323832571267395889251,\n   \"toDegrees0\": 0E+19,\n   \"toDegrees-20\": -11.45915590261646417536927286883822\n }"
          }
        ]
      }
    ]
  },
  "tohex": {
    "name": "toHex",
    "overloads": [
      {
        "module": "binaries",
        "signature": "toHex(content: Binary): String",
        "description": "Transforms a binary value into a hexadecimal string.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Binaries\noutput application/json\nvar myBinary = \"Mule\" as Binary\nvar testType = typeOf(myBinary)\n---\n{\n   \"binaryToHex\" : toHex(myBinary)\n}",
            "output": "{ \"binaryToHex\": \"4D756C65\" }"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "toHex(number: Number): String",
        "description": "Transforms a decimal number into a hexadecimal number.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport toHex from dw::core::Numbers\noutput application/json\n---\n{\n    a: toHex(-1),\n    b: toHex(100000000000000000000000000000000000000000000000000000000000000),\n    c: toHex(0),\n    d: toHex(null),\n    e: toHex(15),\n}",
            "output": "{\n  \"a\": \"-1\",\n  \"b\": \"3e3aeb4ae1383562f4b82261d969f7ac94ca4000000000000000\",\n  \"c\": \"0\",\n  \"d\": null,\n  \"e\": \"f\"\n}"
          }
        ]
      },
      {
        "module": "numbers",
        "signature": "toHex(number: Null): Null",
        "description": "Helper function that enables `toHex` to work with null value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "tolocaldatetime": {
    "name": "toLocalDateTime",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toLocalDateTime(str: String, formatters: Array<Formatter>): LocalDateTime",
        "description": "Transforms a `String` value into a `LocalDateTime` value using the first `Formatter` that\nmatches with the given value to transform.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nimport * from dw::Runtime\noutput application/dw\n---\n{\n  a: toLocalDateTime(\"2003-10-01 23:57:59\", [{format: \"uuuu/MM/dd HH:mm:ss\"}, {format: \"uuuu-MM-dd HH:mm:ss\"}]),\n  b: try(() -> toLocalDateTime(\"2003-10-01 23:57:59\", [{format: \"uuuu/MM/dd HH:mm:ss\"}])).error.message\n}",
            "output": "{\n  a: |2003-10-01T23:57:59| as LocalDateTime {format: \"uuuu-MM-dd HH:mm:ss\"},\n  b: \"Could not find a valid formatter for '2003-10-01 23:57:59'\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toLocalDateTime(str: String, format: String | Null = null, locale: String | Null = null): LocalDateTime",
        "description": "Transforms a `String` value into a `LocalDateTime` value\nand accepts a format and locale.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toLocalDateTime(\"2015-10-01T23:57:59\"),\n  b: toLocalDateTime(\"2003-10-01 23:57:59\",\"uuuu-MM-dd HH:mm:ss\")\n}",
            "output": "{\n  a: |2015-10-01T23:57:59|,\n  b: |2003-10-01T23:57:59| as LocalDateTime {format: \"uuuu-MM-dd HH:mm:ss\"}\n}"
          }
        ]
      }
    ]
  },
  "tolocaldatetimeornull": {
    "name": "toLocalDateTimeOrNull",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toLocalDateTimeOrNull(str: String, formatters: Array<Formatter>): LocalDateTime | Null",
        "description": "Transforms a `String` value into a `LocalDateTime` value using the first `Formatter` that matches\nwith the given value to transform.\n\n\nIf none of the `Formatter` matches with the given value, the function returns a `null` value.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toLocalDateTimeOrNull(\"2003-10-01 23:57:59\", [{format: \"uuuu/MM/dd HH:mm:ss\"}, {format: \"uuuu-MM-dd HH:mm:ss\"}]),\n  b: toLocalDateTimeOrNull(\"2003-10-01 23:57:59\", [{format: \"uuuu/MM/dd HH:mm:ss\"}])\n}",
            "output": "{\n  a: |2003-10-01T23:57:59| as LocalDateTime {format: \"uuuu-MM-dd HH:mm:ss\"},\n  b: null\n}"
          }
        ]
      }
    ]
  },
  "tolocaltime": {
    "name": "toLocalTime",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toLocalTime(str: String, formatters: Array<Formatter>): LocalTime",
        "description": "Transforms a `String` value into a `LocalTime` value using the first `Formatter` that\nmatches with the given value to transform.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nimport * from dw::Runtime\noutput application/dw\n---\n{\n  a: toLocalTime(\"23:57:59\", [{format: \"HH:mm:ss.n\"}, {format: \"HH:mm:ss\"}]),\n  b: try(() -> toLocalTime(\"23:57:59\", [{format: \"HH:mm:ss.n\"}])).error.message\n}",
            "output": "{\n  a: |23:57:59| as LocalTime {format: \"HH:mm:ss\"},\n  b: \"Could not find a valid formatter for '23:57:59'\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toLocalTime(str: String, format: String | Null = null, locale: String | Null = null): LocalTime",
        "description": "Transforms a `String` value into a `LocalTime` value\nand accepts a format and locale.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n   toLocalTimeEx: toLocalTime(\"23:57:59\"),\n   toLocalTimeEx2: toLocalTime(\"13:44:12.283\",\"HH:mm:ss.n\")\n}",
            "output": "{\n  \"toLocalTimeEx\": \"23:57:59\",\n  \"toLocalTimeEx2\": \"13:44:12.283\"\n}"
          }
        ]
      }
    ]
  },
  "tolocaltimeornull": {
    "name": "toLocalTimeOrNull",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toLocalTimeOrNull(str: String, formatters: Array<Formatter>): LocalTime | Null",
        "description": "Transforms a `String` value into a `LocalTime` value using the first `Formatter` that matches\nwith the given value to transform.\n\n\nIf none of the `Formatter` matches with the given value, the function returns a `null` value.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toLocalTimeOrNull(\"23:57:59\", [{format: \"HH:mm:ss.n\"}, {format: \"HH:mm:ss\"}]),\n  b: toLocalTimeOrNull(\"23:57:59\", [{format: \"HH:mm:ss.n\"}])\n}",
            "output": "{\n  a: |23:57:59| as LocalTime {format: \"HH:mm:ss\"},\n  b: null\n}"
          }
        ]
      }
    ]
  },
  "tomilliseconds": {
    "name": "toMilliseconds",
    "overloads": [
      {
        "module": "timer",
        "signature": "toMilliseconds(date: DateTime): Number",
        "description": "Returns the representation of a specified date-time in milliseconds.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Timer\noutput application/json\n---\n{ \"toMilliseconds\" : toMilliseconds(|2018-07-23T22:03:04.829Z|) }",
            "output": "{ \"toMilliseconds\": 1532383384829 }"
          }
        ]
      }
    ]
  },
  "tomorrow": {
    "name": "tomorrow",
    "overloads": [
      {
        "module": "dates",
        "signature": "tomorrow(): Date",
        "description": "Returns the date for tomorrow as a `Date` type.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport tomorrow from dw::core::Dates\noutput application/json\n---\ntomorrow()",
            "output": "\"2021-05-16\""
          }
        ]
      }
    ]
  },
  "tonumber": {
    "name": "toNumber",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toNumber(str: String, formatters: Array<Formatter>): Number",
        "description": "Transforms a `String` value into a `Number` value using the first `Formatter` that\nmatches with the given value to transform.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nimport * from dw::Runtime\noutput application/dw\n---\n{\n  a: toNumber(\"0.005\", [{format: \"seconds\"}, {format: \".00\"}]),\n  b: try(() -> toNumber(\"0.005\", [{format: \"seconds\"}])).error.message\n}",
            "output": "{\n  a: 0.005 as Number {format: \".00\"},\n  b: \"Could not find a valid formatter for '0.005'\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toNumber(dateTime: DateTime, unit: MillisOrSecs | Null = null): Number",
        "description": "A variant of `toNumber` that transforms a `DateTime` value\ninto a number of seconds or milliseconds, depending on the\nselected unit.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n    epoch: toNumber(|2015-10-01T23:57:59Z|),\n    millis: toNumber(|2015-10-01T23:57:59Z|, \"milliseconds\")\n}",
            "output": "{\n  \"epoch\": 1443743879,\n  \"millis\": 1443743879000\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toNumber(period: Period, unit: PeriodUnits | Null = null): Number",
        "description": "A variant of `toNumber` that transforms a `Period` value\ninto a number of hours, minutes, seconds, milliseconds\nor nanoseconds (`nanos`).\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n    toSecondsEx1: toNumber(|PT1H10M|, \"seconds\"),\n    toSecondsEx2: toNumber(|PT1M7S|, \"milliseconds\")\n}",
            "output": "{\n  \"toSecondsEx1\": 4200,\n  \"toSecondsEx2\": 67000\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toNumber(value: String | Key, format: String | Null = null, locale: String | Null = null): Number",
        "description": "A variant of `toNumber` that transforms a `String` or `Key` value into\na `Number` value and that accepts a format and locale.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nvar myKey = keysOf({\"123\" : \"myValue\"})\noutput application/json\n---\n {\n     \"default\": toNumber(\"1.0\"),\n     \"withFormat\": toNumber(\"0.005\",\".00\"),\n     \"withLocal\": toNumber(\"1,25\",\"#.##\",\"ES\"),\n     \"withExtraPlaceholders\": toNumber(\"5.55\",\"####.####\"),\n     \"keyToNumber\": toNumber(myKey[0])\n }",
            "output": "{\n  \"default\": 1.0,\n  \"withFormat\": 0.005,\n  \"withLocal\": 1.25,\n  \"withExtraPlaceholders\": 5.55,\n  \"keyToNumber\": 123\n}"
          }
        ]
      }
    ]
  },
  "tonumberornull": {
    "name": "toNumberOrNull",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toNumberOrNull(str: String, formatters: Array<Formatter>): Number | Null",
        "description": "Transforms a `String` value into a `Number` value using the first `Formatter` that matches\nwith the given value to transform.\n\n\nIf none of the `Formatter` matches with the given value, the function returns a `null` value.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toNumberOrNull(\"0.005\", [{format: \"seconds\"}, {format: \".00\"}]),\n  b: toNumberOrNull(\"0.005\", [{format: \"seconds\"}])\n}",
            "output": "{\n  a: 0.005 as Number {format: \".00\"},\n  b: null\n}"
          }
        ]
      }
    ]
  },
  "toperiod": {
    "name": "toPeriod",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toPeriod(str: String): Period",
        "description": "Transform a `String` value into a `Period` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  toPeriodEx1: toPeriod(\"P1D\"),\n  toPeriodEx2: toPeriod(\"PT1H1M\")\n}",
            "output": "{\n  toPeriodEx1: |P1D|,\n  toPeriodEx2: |PT1H1M|\n}"
          }
        ]
      }
    ]
  },
  "toradians": {
    "name": "toRadians",
    "overloads": [
      {
        "module": "math",
        "signature": "toRadians(angdeg: Number): Number",
        "description": "Converts a given number of degrees in an angle to an approximately\nequivalent number of radians.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Math\noutput application/json\n---\n{\n  \"toRadians10\":  toRadians(10),\n  \"toRadians013\": toRadians(0.13),\n  \"toRadians-20\": toRadians(-20)\n}",
            "output": "{\n   \"toRadians10\": 0.1745329251994329576922222222222222,\n   \"toRadians013\": 0.002268928027592628449998888888888889,\n   \"toRadians-20\": -0.3490658503988659153844444444444444\n }"
          }
        ]
      }
    ]
  },
  "toradixnumber": {
    "name": "toRadixNumber",
    "overloads": [
      {
        "module": "numbers",
        "signature": "toRadixNumber(number: Number, radix: Number): String",
        "description": "Transforms a decimal number into a number string in other radix.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport toRadixNumber from dw::core::Numbers\noutput application/json\n---\n{\n    a: toRadixNumber(2, 2),\n    b: toRadixNumber(255, 16)\n}",
            "output": "{\n  \"a\": \"10\",\n  \"b\": \"ff\"\n}"
          }
        ]
      }
    ]
  },
  "toregex": {
    "name": "toRegex",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toRegex(str: String): Regex",
        "description": "Transforms a `String` value into a `Regex` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  toRegexEx1: toRegex(\"a-Z\"),\n  toRegexEx2: toRegex(\"0-9+\")\n}",
            "output": "{\n  toRegexEx1: /a-Z/,\n  toRegexEx2: /0-9+/\n}"
          }
        ]
      }
    ]
  },
  "tostring": {
    "name": "toString",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toString(number: Number, format: String | Null = null, locale: String | Null = null, roundMode: RoundingMode | Null = null): String",
        "description": "A variant of `toString` that transforms a `Number` value\n(whole or decimal) into a `String` value and accepts a\nformat, locale, and rounding mode value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n    a: toString(1.0),\n    b: toString(0.005,\".00\"),\n    c: toString(0.035,\"#.##\",\"ES\"),\n    d: toString(0.005,\"#.##\",\"ES\",\"HALF_EVEN\"),\n    e: toString(0.035,\"#.00\",null,\"HALF_EVEN\"),\n    f: toString(1.1234,\"\\$.## 'in my account'\")\n}",
            "output": "{\n  \"a\": \"1\",\n  \"b\": \".01\",\n  \"c\": \"0,04\",\n  \"d\": \"0\",\n  \"e\": \".04\",\n  \"f\": \"$1.12 in my account\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toString(date: Date | DateTime | LocalDateTime | LocalTime | Time, format: String | Null = null, locale: String | Null = null): String",
        "description": "A variant of `toString` that transforms a `Date`, `DateTime`,\n`LocalTime`, `LocalDateTime`, or `Time` value into a `String` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n   aDate: toString(|2003-10-01|, \"uuuu/MM/dd\"),\n   aDateTime: toString(|2018-09-17T22:13:00-03:00|),\n   aLocalTime: toString(|23:57:59|, \"HH-mm-ss\"),\n   aLocalDateTime : toString(|2015-10-01T23:57:59|),\n   aLocalDateTimeFormatted: toString(|2003-10-01T23:57:59|, \"uuuu-MM-dd HH:mm:ss a\"),\n   aLocalDateTimeFormattedAndLocalizedSpain: toString(|2003-01-01T23:57:59|, \"eeee, dd MMMM, uuuu HH:mm:ss a\", \"ES\"),\n   aTime: typeOf(|22:10:18Z|),\n   aTimeZone: toString(|-03:00|)\n}",
            "output": "{\n  \"aDate\": \"2003/10/01\",\n  \"aDateTime\": \"2018-09-17T22:13:00-03:00\",\n  \"aLocalTime\": \"23-57-59\",\n  \"aLocalDateTime\": \"2015-10-01T23:57:59\",\n  \"aLocalDateTimeFormatted\": \"2003-10-01 23:57:59 PM\",\n  \"aLocalDateTimeFormattedAndLocalizedSpain\": \"miércoles, 01 enero, 2003 23:57:59 p. m.\",\n  \"aTime\": \"Time\",\n  \"aTimeZone\": \"-03:00\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toString(binary: Binary, encoding: String): String",
        "description": "A variant of `toString` that transforms a `Binary` value\ninto a `String` value with the specified encoding.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nvar binaryData= \"DW Test\" as Binary {encoding: \"UTF-32\"}\noutput application/json\n---\n{\n  a: toString(binaryData, \"UTF-32\"),\n}",
            "output": "{\n  \"a\": \"DW Test\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toString(data: TimeZone | Uri | Boolean | Period | Regex | Key): String",
        "description": "A variant of `toString` that transforms a `TimeZone`, `Uri`,\n`Boolean`, `Period`, `Regex`, or `Key` value into a\nstring.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n  transformTimeZone: toString(|Z|),\n  transformBoolean: toString(true),\n  transformPeriod: toString(|P1D|),\n  transformRegex: toString(/a-Z/),\n  transformPeriod: toString(|PT8M10S|),\n  transformUri: toString(\"https://docs.mulesoft.com/\" as Uri)\n}  ++\n{ transformKey : toString((keysOf({ \"aKeyToString\" : \"aValue\"})[0])) }",
            "output": "{\n  \"transformTimeZone\": \"Z\",\n  \"transformBoolean\": \"true\",\n  \"transformPeriod\": \"P1D\",\n  \"transformRegex\": \"a-Z\",\n  \"transformPeriod\": \"PT8M10S\",\n  \"transformUri\": \"https://docs.mulesoft.com/\",\n  \"transformKey\": \"aKeyToString\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toString(arr: Array<String>): String",
        "description": "A variant of `toString` that joins an `Array` of characters\ninto a single `String` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n  a: toString([]),\n  b: toString([\"h\", \"o\", \"l\", \"a\"])\n}",
            "output": "{\n  \"a\": \"\",\n  \"b\": \"hola\"\n}"
          }
        ]
      },
      {
        "module": "mime",
        "signature": "toString(mimeType: MimeType): String",
        "description": "Transforms a `MimeType` value to a string representation.\n\n_Introduced in DataWeave version 2.7.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::module::Mime\noutput application/json\n---\ntoString({'type': \"application\", subtype: \"json\", parameters: {}})",
            "output": "\"application/json\""
          },
          {
            "source": "%dw 2.0\nimport * from dw::module::Mime\noutput application/json\n---\ntoString({'type': \"multipart\", subtype: \"form-data\", parameters: {boundary: \"my-boundary\"}})",
            "output": "\"multipart/form-data;boundary=my-boundary\""
          }
        ]
      }
    ]
  },
  "totime": {
    "name": "toTime",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toTime(str: String, formatters: Array<Formatter>): Time",
        "description": "Transforms a `String` value into a `Time` value using the first `Formatter` that\nmatches with the given value to transform.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\nimport * from dw::Runtime\noutput application/dw\n---\n{\n  a: toTime(\"13:44:12.283-08:00\", [{format: \"HH:mm:ss.xxx\"}, {format: \"HH:mm:ss.nxxx\"}]),\n  b: try(() -> toTime(\"13:44:12.283-08:00\", [{format: \"HH:mm:ss.xxx\"}]).error.message\n}",
            "output": "{\n  a: |13:44:12.000000283-08:00| as Time {format: \"HH:mm:ss.nxxx\"},\n  b: \"Could not find a valid formatter for '13:44:12.283-08:00'\"\n}"
          }
        ]
      },
      {
        "module": "coercions",
        "signature": "toTime(str: String, format: String | Null = null, locale: String | Null = null): Time",
        "description": "Transforms a `String` value into a `Time` value\nand accepts a format and locale.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n   a: toTime(\"23:57:59Z\"),\n   b: toTime(\"13:44:12.283-08:00\",\"HH:mm:ss.nxxx\")\n}",
            "output": "{\n  a: |23:57:59Z|,\n  b: |13:44:12.000000283-08:00| as Time {format: \"HH:mm:ss.nxxx\"}\n}"
          }
        ]
      }
    ]
  },
  "totimeornull": {
    "name": "toTimeOrNull",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toTimeOrNull(str: String, formatters: Array<Formatter>): Time | Null",
        "description": "Transforms a `String` value into a `Time` value using the first `Formatter` that matches\nwith the given value to transform.\n\n\nIf none of the `Formatter` matches with the given value, the function returns a `null` value.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n  a: toTimeOrNull(\"13:44:12.283-08:00\", [{format: \"HH:mm:ss.xxx\"}, {format: \"HH:mm:ss.nxxx\"}]),\n  b: toTimeOrNull(\"13:44:12.283-08:00\", [{format: \"HH:mm:ss.xxx\"}])\n}",
            "output": "{\n  a: |13:44:12.000000283-08:00| as Time {format: \"HH:mm:ss.nxxx\"},\n  b: null\n}"
          }
        ]
      }
    ]
  },
  "totimezone": {
    "name": "toTimeZone",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toTimeZone(str: String): TimeZone",
        "description": "Transform a `String` value into a `TimeZone` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/dw\n---\n{\n   toTimeZoneOffset: toTimeZone(\"-03:00\"),\n   toTimeZoneAbbreviation: toTimeZone(\"Z\"),\n   toTimeZoneName: toTimeZone(\"America/Argentina/Buenos_Aires\")\n}",
            "output": "{\n  toTimeZoneOffset: |-03:00|,\n  toTimeZoneAbbreviation: |Z|,\n  toTimeZoneName: |America/Argentina/Buenos_Aires|\n}"
          }
        ]
      }
    ]
  },
  "touri": {
    "name": "toUri",
    "overloads": [
      {
        "module": "coercions",
        "signature": "toUri(str: String): Uri",
        "description": "Transforms a `String` value into a `Uri` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Coercions\noutput application/json\n---\n{\n  toUriExample: toUri(\"https://www.google.com/\")\n}",
            "output": "{\n  \"toUriExample\": \"https://www.google.com/\"\n}"
          }
        ]
      }
    ]
  },
  "tourl": {
    "name": "toUrl",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "toUrl(path: Path): String",
        "description": "`import * from dw::io::file::FileSystem`\n\nTransform the specified file path into a valid Url",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\ntoUrl( \"/tmp/Application Test\")",
            "output": "\"file:/tmp/Application%20Test\""
          }
        ]
      }
    ]
  },
  "trim": {
    "name": "trim",
    "overloads": [
      {
        "module": "core",
        "signature": "trim(text: String): String",
        "description": "Removes any blank spaces from the beginning and end of a string.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"trim\": trim(\"   my really long  text     \") }",
            "output": "{ \"trim\": \"my really long  text\" }"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  \"null\": trim(null),\n  \"empty\": trim(\"\"),\n  \"blank\": trim(\"     \"),\n  \"noBlankSpaces\": trim(\"abc\"),\n  \"withSpaces\": trim(\"    abc    \")\n}",
            "output": "{\n  \"null\": null,\n  \"empty\": \"\",\n  \"blank\": \"\",\n  \"noBlankSpaces\": \"abc\",\n  \"withSpaces\": \"abc\"\n}"
          }
        ]
      },
      {
        "module": "core",
        "signature": "trim(value: Null): Null",
        "description": "Helper function that enables `trim` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "try": {
    "name": "try",
    "overloads": [
      {
        "module": "runtime",
        "signature": "try<T>(delegate: () -> T): TryResult<T>",
        "description": "Evaluates the delegate function and returns an object with `success: true` and `result` if the delegate function succeeds, or an object with `success: false` and `error` if the delegate function throws an exception.\n\n\nThe `orElseTry` and `orElse` functions will also continue processing if the `try` function fails. See the `orElseTry` and `orElse` documentation for more complete examples of handling failing `try` function expressions.\n\n\nNote: Instead of using the `orElseTry` and `orElse` functions, based on the output of the `try` function, you can add conditional logic to execute when the result is `success: true` or `success: false`.",
        "examples": [
          {
            "source": "%dw 2.0\nimport try, fail from dw::Runtime\noutput application/json\nfun randomNumber() =\nif(random() > 0.5)\n  fail(\"This function is failing\")\n else\n  \"OK\"\n---\ntry(() -> randomNumber())",
            "output": "{\n  \"success\": false,\n  \"error\": {\n    \"kind\": \"UserException\",\n    \"message\": \"This function is failing\",\n    \"location\": \"Unknown location\",\n    \"stack\": [\n      \"fail (anonymous:0:0)\",\n      \"myFunction (anonymous:1:114)\",\n      \"main (anonymous:1:179)\"\n    ]\n  }\n}"
          }
        ]
      }
    ]
  },
  "typeof": {
    "name": "typeOf",
    "overloads": [
      {
        "module": "core",
        "signature": "typeOf<T>(value: T): Type<T>",
        "description": "Returns the primitive data type of a value, such as `String`.\n\n\nA value's type is taken from its runtime representation and is never one of\nthe arithmetic types (intersection, union, `Any`, or `Nothing`) nor a type\nalias. If present, metadata of a value is included in the result of\n`typeOf` (see https://docs.mulesoft.com/dataweave/latest/dw-types-functions-metadataof[metadataOf]).",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[ typeOf(\"A b\"), typeOf([1,2]), typeOf(34), typeOf(true), typeOf({ a : 5 }) ]",
            "output": "[ \"String\", \"Array\", \"Number\", \"Boolean\", \"Object\" ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n\nvar x: String | Number = \"clearly a string\"\nvar y: \"because\" = \"because\"\n---\n[typeOf(x), typeOf(y)]",
            "output": "[\"String\", \"String\"]"
          }
        ]
      }
    ]
  },
  "underscore": {
    "name": "underscore",
    "overloads": [
      {
        "module": "strings",
        "signature": "underscore(text: String): String",
        "description": "Replaces hyphens, spaces, and camel-casing in a string with underscores.\n\n\nIf no hyphens, spaces, and camel-casing are present, the output will match\nthe input.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n   \"a\" : underscore(\"customer\"),\n   \"b\" : underscore(\"customer-first-name\"),\n   \"c\" : underscore(\"customer NAME\"),\n   \"d\" : underscore(\"customerName\")\n}",
            "output": "{\n   \"a\": \"customer\",\n   \"b\": \"customer_first_name\",\n   \"c\": \"customer_name\",\n   \"d\": \"customer_name\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "underscore(text: Null): Null",
        "description": "Helper function that enables `underscore` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "unionitems": {
    "name": "unionItems",
    "overloads": [
      {
        "module": "types",
        "signature": "unionItems(t: Type): Array<Type>",
        "description": "Returns an array of all the types that define a given Union type.\nThis function fails if the input is not a Union type.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Types\ntype AType = String | Number\noutput application/json\n---\n{\n   a: unionItems(AType)\n}",
            "output": "{\n  \"a\": [\"String\",\"Number\"]\n}"
          }
        ]
      }
    ]
  },
  "unpack": {
    "name": "unpack",
    "overloads": [
      {
        "module": "protobuf",
        "signature": "unpack(msg: { type_url : String, value : Binary }, descriptorUrl: String): Any",
        "description": "`import * from protobuf::Any`\n\nThe `unpack` function unpacks a Protobuf Any into an actual DataWeave object.\nIn order to do this, it needs the url for the compiled descriptor where the Any `type_url`\nwill be found.",
        "examples": [
          {
            "source": "syntax = \"proto3\";\n\npackage engine.anyPacking;\n\nimport \"google/protobuf/any.proto\";\n\nmessage Payload {\n  bool flag = 1;\n  google.protobuf.Any load = 2;\n}\n\nmessage Range {\n  int32 from = 1;\n  int32 to = 2;\n}",
            "output": "input in0 application/x-protobuf messageType='engine.anyPacking.Payload',descriptorUrl=\"example.dsc\"\noutput json\nimport unpack from protobuf::Any\n\n---\nunpack(in0.load, \"example.dsc\")"
          }
        ]
      }
    ]
  },
  "unwrap": {
    "name": "unwrap",
    "overloads": [
      {
        "module": "strings",
        "signature": "unwrap(text: String, wrapper: String): String",
        "description": "Unwraps a given `text` from a `wrapper` text.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport unwrap from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": unwrap(null, \"\"),\n  \"b\": unwrap(null, '\\0'),\n  \"c\": unwrap(\"'abc'\", \"'\"),\n  \"d\": unwrap(\"AABabcBAA\", 'A'),\n  \"e\": unwrap(\"A\", '#'),\n  \"f\": unwrap(\"#A\", '#'),\n  \"g\": unwrap(\"A#\", '#')\n}",
            "output": "{\n   \"a\": null,\n   \"b\": null,\n   \"c\": \"abc\",\n   \"d\": \"ABabcBA\",\n   \"e\": \"A\",\n   \"f\": \"#A\",\n   \"g\": \"A#\"\n }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "unwrap(text: Null, wrapper: String): Null",
        "description": "Helper function that enables `unwrap` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "unzip": {
    "name": "unzip",
    "overloads": [
      {
        "module": "core",
        "signature": "unzip<T>(items: Array<Array<T>>): Array<Array<T>>",
        "description": "Performs the opposite of `zip`. It takes an array of arrays as input.\n\n\nThe function groups the values of the input sub-arrays by matching indices,\nand it outputs new sub-arrays with the values of those matching indices. No\nsub-arrays are produced for unmatching indices. For example, if one input\nsub-array contains four elements (indices 0-3) and another only contains\nthree (indices 0-2), the function will not produce a sub-array for the\nvalue at index 3.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nunzip([ [0,\"a\"], [1,\"b\"], [2,\"c\"],[ 3,\"d\"] ])",
            "output": "[ [ 0, 1, 2, 3 ], [ \"a\", \"b\", \"c\", \"d\" ] ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\nunzip([ [0,\"a\"], [1,\"a\",\"foo\"], [2], [3,\"a\"] ])",
            "output": "[0,1,2,3]"
          }
        ]
      }
    ]
  },
  "unzipto": {
    "name": "unzipTo",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "unzipTo(zipPath: Path, targetDirectory: Path): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nUnzips the specified file into the given directory",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::io::file::FileSystem\noutput application/json\n---\nfileToUnzip unzipTo path(tmp(), \"dw_io_test\" ,\"outputZip\")",
            "output": "\"/tmp/dw_io_test/outputZip\""
          }
        ]
      }
    ]
  },
  "update": {
    "name": "update",
    "overloads": [
      {
        "module": "values",
        "signature": "update(objectValue: Object, fieldName: String): UpdaterValueProvider<Object>",
        "description": "This `update` function updates a field in an object with the specified\nstring value.\n\n\nThe function returns a new object with the specified field and value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n{name: \"Mariano\"} update \"name\" with \"Data Weave\"",
            "output": "{\n  \"name\": \"Data Weave\"\n}"
          }
        ]
      },
      {
        "module": "values",
        "signature": "update(objectValue: Object, fieldName: PathElement): UpdaterValueProvider<Object>",
        "description": "This `update` function updates an object field with the specified\n `PathElement` value.\n\n\nThe function returns a new object with the specified field and value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n{name: \"Mariano\"} update field(\"name\") with \"Data Weave\"",
            "output": "{\n  \"name\": \"Data Weave\"\n}"
          }
        ]
      },
      {
        "module": "values",
        "signature": "update(arrayValue: Array, indexToUpdate: Number): UpdaterValueProvider<Array>",
        "description": "Updates an array index with the specified value.\n\n\nThis `update` function returns a new array that changes the value of\nthe specified index.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n[1,2,3] update 1 with 5",
            "output": "[\n   1,\n   5,\n   3\n ]"
          }
        ]
      },
      {
        "module": "values",
        "signature": "update(arrayValue: Array, indexToUpdate: String): UpdaterValueProvider<Array>",
        "description": "This `update` function updates all objects within the specified array with\nthe given string value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n[{role: \"a\", name: \"spiderman\"}, {role: \"b\", name: \"batman\"}] update \"role\" with \"Super Hero\"",
            "output": "[{\n   \"role\": \"Super Hero\",\n   \"name\": \"spiderman\"\n },\n {\n   \"role\": \"Super Hero\",\n   \"name\": \"batman\"\n}]"
          }
        ]
      },
      {
        "module": "values",
        "signature": "update(arrayValue: Array, indexToUpdate: PathElement): UpdaterValueProvider<Array>",
        "description": "This `update` function updates the specified index of an array with the\ngiven `PathElement` value.\n\n\nThe function returns a new array that contains given value at\nthe specified index.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n[1,2,3] update index(1) with 5",
            "output": "[\n   1,\n   5,\n   3\n ]"
          }
        ]
      },
      {
        "module": "values",
        "signature": "update(value: Array | Object | Null, path: Array<String | Number | PathElement>): UpdaterValueProvider<Array | Object | Null>",
        "description": "Updates the value at the specified path with the given value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n{user: {name: \"Mariano\"}} update [\"user\", field(\"name\")] with \"Data Weave\"",
            "output": "{\n   \"user\": {\n     \"name\": \"Data Weave\"\n   }\n }"
          },
          {
            "source": "%dw 2.0\nimport * from dw::util::Values\noutput application/xml\n---\npayload update [\"users\", \"user\", \"language\"] with (if ($ == \"English\") \"Gibberish\" else $)",
            "output": "<users>\n  <user>\n    <name>Phoebe</name>\n    <language>French</language>\n  </user>\n  <user>\n    <name>Joey</name>\n    <language>Gibberish</language>\n  </user>\n</users>"
          }
        ]
      },
      {
        "module": "values",
        "signature": "update(value: Null, toUpdate: Number | String | PathElement): UpdaterValueProvider<Null>",
        "description": "Helper function that enables `update` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": []
      }
    ]
  },
  "upper": {
    "name": "upper",
    "overloads": [
      {
        "module": "core",
        "signature": "upper(text: String): String",
        "description": "Returns the provided string in uppercase characters.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"name\" : upper(\"mulesoft\") }",
            "output": "{ \"name\": \"MULESOFT\" }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "upper(value: Null): Null",
        "description": "Helper function that enables `upper` to work with a `null` value.",
        "examples": []
      }
    ]
  },
  "uuid": {
    "name": "uuid",
    "overloads": [
      {
        "module": "core",
        "signature": "uuid(): String",
        "description": "Returns a v4 UUID using random numbers as the source.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\nuuid()",
            "output": "\"7cc64d24-f2ad-4d43-8893-fa24a0789a99\""
          }
        ]
      }
    ]
  },
  "valueset": {
    "name": "valueSet",
    "overloads": [
      {
        "module": "objects",
        "signature": "valueSet<K, V>(obj: { (K)?: V }): Array<V>",
        "description": "Returns an array of the values from key-value pairs in an object.\n\n_This function is *Deprecated*. Use xref:dw-core-functions-valuesof.adoc[dw::Core::valuesOf], instead._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Objects\noutput application/json\n---\n{ \"valueSet\" : valueSet({a: true, b: 1}) }",
            "output": "{ \"valueSet\" : [true,1] }"
          }
        ]
      }
    ]
  },
  "valuesof": {
    "name": "valuesOf",
    "overloads": [
      {
        "module": "core",
        "signature": "valuesOf<K, V>(obj: { (K)?: V }): Array<V>",
        "description": "Returns an array of the values from key-value pairs in an object.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"valuesOf\" : valuesOf({a: true, b: 1}) }",
            "output": "{ \"valuesOf\" : [true,1] }"
          }
        ]
      },
      {
        "module": "core",
        "signature": "valuesOf(obj: Null): Null",
        "description": "Helper function that enables `valuesOf` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "version": {
    "name": "version",
    "overloads": [
      {
        "module": "runtime",
        "signature": "version(): String",
        "description": "Returns the DataWeave version that is currently running.\n\n_Introduced in DataWeave version 2.5.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\noutput application/json\n---\nversion()",
            "output": "\"2.5\""
          }
        ]
      }
    ]
  },
  "wait": {
    "name": "wait",
    "overloads": [
      {
        "module": "runtime",
        "signature": "wait<T>(value: T, timeout: Number): T",
        "description": "Stops the execution for the specified timeout period (in milliseconds).\n\n\nWARNING: Stopping the execution blocks the thread, potentially\ncausing slowness, low performance and potentially freezing of the entire\nruntime. This operation is intended for limited functional testing purposes.\nDo not use this function in a production application, performance testing, or\nwith multiple applications deployed.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::Runtime\noutput application/json\n---\n{ \"user\" : 1 } wait 2000",
            "output": "{ \"user\": 1 }"
          }
        ]
      }
    ]
  },
  "wd": {
    "name": "wd",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "wd(): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nReturns the Path value of the working directory.",
        "examples": []
      }
    ]
  },
  "with": {
    "name": "with",
    "overloads": [
      {
        "module": "core",
        "signature": "with<V, U, R, X>(toBeReplaced: ((V, U) -> R) -> X, replacer: (V, U) -> R): X",
        "description": "Helper function that specifies a replacement element. This function is used with `replace`, `update` or `mask` to perform data substitutions.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ \"ssn\" : \"987-65-4321\" replace /[0-9]/ with(\"x\") }",
            "output": "{ \"ssn\": \"xxx-xx-xxxx\" }"
          }
        ]
      }
    ]
  },
  "withconfig": {
    "name": "withConfig",
    "overloads": [
      {
        "module": "tests",
        "signature": "withConfig<Ctx <: Object>(testName: String, config: TestConfig<Ctx>)",
        "description": "`import * from dw::test::Tests`\n\nGenerates configuration for a test(s) that needs setup/teardown stages. Intended for it to used in combination with\nthe `in` function.",
        "examples": [
          {
            "source": "var config = {\n  setup: () -> { contextString: \"context\", otherContext: 3 },\n  teardown: () -> {}\n}\n---\n\"It should generate context for following tests\" withConfig config in  [\n  do { $.contextString must beString() },\n  do { $.otherContext must equalTo(3) }\n]",
            "output": ""
          }
        ]
      }
    ]
  },
  "withmaxsize": {
    "name": "withMaxSize",
    "overloads": [
      {
        "module": "strings",
        "signature": "withMaxSize(text: String, maxLength: Number): String",
        "description": "Checks that the string length isn't greater than the specified `maxLength`. If the string is longer, the function returns a substring that starts at the beginning of the string and is `maxLength` characters long.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport withMaxSize from dw::core::Strings\noutput application/json\n---\n{\n   a: \"123\" withMaxSize 10,\n   b: \"123\" withMaxSize 3,\n   c: \"123\" withMaxSize 2,\n   d: \"123\" withMaxSize 0,\n   e: null withMaxSize 23,\n}",
            "output": "{\n  \"a\": \"123\",\n  \"b\": \"123\",\n  \"c\": \"12\",\n  \"d\": \"123\",\n  \"e\": null\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "withMaxSize(text: Null, maxLength: Number): Null",
        "description": "Helper function that enables `withMaxSize` to work with a `null` value.\n\n_Introduced in DataWeave version 2.3.0._",
        "examples": []
      }
    ]
  },
  "words": {
    "name": "words",
    "overloads": [
      {
        "module": "strings",
        "signature": "words(text: String): Array<String>",
        "description": "Returns an array of words from a string.\n\n\nSeparators between words include blank spaces, new lines, and tabs.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport words from dw::core::Strings\noutput application/json\n---\nwords(\"hello world\\nhere\\t\\t\\tdata-weave\")",
            "output": "[\"hello\", \"world\", \"here\", \"data-weave\"]"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "words(text: Null): Null",
        "description": "Helper function that enables `words` to work with a `null` value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": []
      }
    ]
  },
  "wrapifmissing": {
    "name": "wrapIfMissing",
    "overloads": [
      {
        "module": "strings",
        "signature": "wrapIfMissing(text: String, wrapper: String): String",
        "description": "Wraps `text` with `wrapper` if that `wrapper` is missing from the start or\nend of the given string.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n {\n   \"a\": wrapIfMissing(null, \"'\"),\n   \"b\": wrapIfMissing(\"\", \"'\"),\n   \"c\": wrapIfMissing(\"ab\", \"x\"),\n   \"d\": wrapIfMissing(\"'ab'\", \"'\"),\n   \"e\": wrapIfMissing(\"/\", '/'),\n   \"f\": wrapIfMissing(\"a/b/c\", '/'),\n   \"g\": wrapIfMissing(\"/a/b/c\", '/'),\n   \"h\": wrapIfMissing(\"a/b/c/\", '/')\n }",
            "output": "{\n   \"a\": null,\n   \"b\": \"'\",\n   \"c\": \"xabx\",\n   \"d\": \"'ab'\",\n   \"e\": \"/\",\n   \"f\": \"/a/b/c/\",\n   \"g\": \"/a/b/c/\",\n   \"h\": \"/a/b/c/\"\n }"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "wrapIfMissing(text: Null, wrapper: String): Null",
        "description": "Helper function that enables `wrapIfMissing` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "wrapwith": {
    "name": "wrapWith",
    "overloads": [
      {
        "module": "strings",
        "signature": "wrapWith(text: String, wrapper: String): String",
        "description": "Wraps the specified `text` with the given `wrapper`.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Strings\noutput application/json\n---\n{\n  \"a\": wrapWith(null, \"'\"),\n  \"b\": wrapWith(\"\", \"'\"),\n  \"c\": wrapWith(\"ab\", \"x\"),\n  \"d\": wrapWith(\"'ab'\", \"'\"),\n  \"e\": wrapWith(\"ab\", \"'\")\n}",
            "output": "{\n  \"a\": null,\n  \"b\": \"''\",\n  \"c\": \"xabx\",\n  \"d\": \"''ab''\",\n  \"e\": \"'ab'\"\n}"
          }
        ]
      },
      {
        "module": "strings",
        "signature": "wrapWith(text: Null, wrapper: Any): Null",
        "description": "Helper function that enables `wrapWith` to work with a `null` value.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": []
      }
    ]
  },
  "write": {
    "name": "write",
    "overloads": [
      {
        "module": "core",
        "signature": "write(value: Any, contentType: String = \"application/dw\", writerProperties: Object = {}): String | Binary",
        "description": "Writes a value as a string or binary in a supported format.\n\n\nReturns a String or Binary with the serialized representation of the value\nin the specified format (MIME type). This function can write to a different\nformat than the input. Note that the data must validate in that new format,\nor an error will occur. For example, `application/xml` content is not valid\nwithin an `application/json` format, but `text/plain` can be valid.\nIt returns a `String` value for all text-based data formats (such as XML, JSON , CSV)\nand a `Binary` value for all the binary formats (such as Excel, MultiPart, OctetStream).",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n{ hello : write(\"world\", \"text/plain\") }",
            "output": "{ \"hello\": \"world\" }"
          },
          {
            "source": "%dw 2.0\noutput application/xml\n---\n{ \"output\" : write(payload, \"application/csv\", {\"header\":true, \"separator\" : \"|\"}) }",
            "output": "<?xml version=\"1.0\" encoding=\"US-ASCII\"?>\n<output>Name|Email|Id|Title\nMr White|white@mulesoft.com|1234|Chief Java Prophet\nMr Orange|orange@mulesoft.com|4567|Integration Ninja\n</output>"
          }
        ]
      }
    ]
  },
  "writelineswith": {
    "name": "writeLinesWith",
    "overloads": [
      {
        "module": "binaries",
        "signature": "writeLinesWith(content: Array<String>, charset: String): Binary",
        "description": "Writes the specified lines and returns the binary content.\n\n_Introduced in DataWeave version 2.2.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Binaries\noutput application/json\n---\n{ lines: to(1, 10) map \"Line $\" writeLinesWith  \"UTF-8\" }",
            "output": "{\n  \"lines\": \"Line 1\\nLine 2\\nLine 3\\nLine 4\\nLine 5\\n\"\n}"
          }
        ]
      }
    ]
  },
  "xsitype": {
    "name": "xsiType",
    "overloads": [
      {
        "module": "core",
        "signature": "xsiType(name: String, namespace: Namespace)",
        "description": "Creates a `xsi:type` type attribute. This method returns an object, so it must be used with dynamic attributes.\n\n_Introduced in DataWeave version 2.2.2._",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/xml\nns acme http://acme.com\n---\n  {\n      user @((xsiType(\"user\", acme))): {\n          name: \"Peter\",\n          lastName: \"Parker\"\n      }\n  }",
            "output": "<?xml version='1.0' encoding='UTF-8'?>\n <user xsi:type=\"acme:user\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:acme=\"http://acme.com\">\n     <name>Peter</name>\n     <lastName>Parker</lastName>\n </user>"
          }
        ]
      }
    ]
  },
  "years": {
    "name": "years",
    "overloads": [
      {
        "module": "periods",
        "signature": "years(nYears: Number): Period",
        "description": "Creates a Period value from the provided number of years.\n\n\nThe function applies the `period` function to the input value.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n{\n  nextYear: |2020-10-05T20:22:34.385Z| + years(1),\n  fourYearPeriod: years(4),\n  addNegativeValue: years(-1) + years(2)\n}",
            "output": "{\n   \"nextYear\": \"2021-10-05T20:22:34.385Z\",\n   \"fourYearPeriod\": \"P4Y\",\n   \"addNegativeValue\": 12\n}"
          }
        ]
      }
    ]
  },
  "yesterday": {
    "name": "yesterday",
    "overloads": [
      {
        "module": "dates",
        "signature": "yesterday(): Date",
        "description": "Returns the date for yesterday as a `Date` type.\n\n_Introduced in DataWeave version 2.4.0._",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::core::Dates\noutput application/json\n---\nyesterday()",
            "output": "\"2021-05-14\""
          }
        ]
      }
    ]
  },
  "zip": {
    "name": "zip",
    "overloads": [
      {
        "module": "core",
        "signature": "zip<T, R>(left: Array<T>, right: Array<R>): Array<Array<T | R>>",
        "description": "Merges elements from two arrays into an array of arrays.\n\n\nThe first sub-array in the output array contains the first indices of the input\nsub-arrays. The second index contains the second indices of the inputs, the third\ncontains the third indices, and so on for every case where there are the same\nnumber of indices in the arrays.",
        "examples": [
          {
            "source": "%dw 2.0\noutput application/json\n---\n[0,1] zip [\"a\",\"b\"]",
            "output": "[ [0,\"a\"], [1,\"b\"] ]"
          },
          {
            "source": "%dw 2.0\noutput application/json\n---\n{\n  \"a\" : [0, 1, 2, 3] zip [\"a\", \"b\", \"c\", \"d\"],\n  \"b\" : [0, 1, 2, 3] zip [\"a\"],\n  \"c\" : [0, 1, 2, 3] zip [\"a\", \"b\"],\n  \"d\" : [0, 1, 2] zip [\"a\", \"b\", \"c\", \"d\"]\n}",
            "output": "{\n  \"a\": [\n    [0,\"a\"],\n    [1,\"b\"],\n    [2,\"c\"],\n    [3,\"d\"]\n    ],\n  \"b\": [\n    [0,\"a\"]\n  ],\n  \"c\": [\n    [0,\"a\"],\n    [1,\"b\"]\n  ],\n  \"d\": [\n    [0,\"a\"],\n    [1,\"b\"],\n    [2,\"c\"]\n  ]\n}"
          }
        ]
      }
    ]
  },
  "zipinto": {
    "name": "zipInto",
    "overloads": [
      {
        "module": "filesystem",
        "signature": "zipInto(paths: Array<Path>, zipPath: Path): Path",
        "description": "`import * from dw::io::file::FileSystem`\n\nZips the specified collection of files into the given zip path.",
        "examples": [
          {
            "source": "%dw 2.0\nimport * from dw::io::file::FileSystem\noutput application/json\n---\n[path(tmp(),\"dw_io_test\")] zipInto path(tmp(),\"outputZip.zip\")",
            "output": "\"/tmp/outputZip.zip\""
          }
        ]
      }
    ]
  }
};
