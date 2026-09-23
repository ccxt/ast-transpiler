import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { BinaryExpression, CallExpression, TypeChecker } from 'typescript';
import * as fs from "fs";
import * as path from "path";

const SyntaxKind = ts.SyntaxKind;

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': 'map[string]any{',
    'ARRAY_OPENING_TOKEN': '[]any{',
    'ARRAY_CLOSING_TOKEN': '}',
    'PROPERTY_ASSIGNMENT_TOKEN': ':',
    'VAR_TOKEN': 'object', // object
    'METHOD_TOKEN': 'func',
    'PROPERTY_ASSIGNMENT_OPEN': '',
    'PROPERTY_ASSIGNMENT_CLOSE': '',
    'SUPER_TOKEN': 'base',
    'SUPER_CALL_TOKEN': 'base',
    'FALSY_WRAPPER_OPEN': 'EvalTruthy(',
    'FALSY_WRAPPER_CLOSE': ')',
    'COMPARISON_WRAPPER_OPEN' : "IsEqual(",
    'COMPARISON_WRAPPER_CLOSE' : ")",
    'UKNOWN_PROP_WRAPPER_OPEN': 'this.call(',
    'UNKOWN_PROP_WRAPPER_CLOSE': ')',
    'UKNOWN_PROP_ASYNC_WRAPPER_OPEN': 'this.callAsync(',
    'UNKOWN_PROP_ASYNC_WRAPPER_CLOSE': ')',
    'DYNAMIC_CALL_OPEN': 'callDynamically(',
    'EQUALS_EQUALS_WRAPPER_OPEN': 'IsEqual(',
    'EQUALS_EQUALS_WRAPPER_CLOSE': ')',
    'DIFFERENT_WRAPPER_OPEN': '!IsEqual(',
    'DIFFERENT_WRAPPER_CLOSE': ')',
    'GREATER_THAN_WRAPPER_OPEN': 'IsGreaterThan(',
    'GREATER_THAN_WRAPPER_CLOSE': ')',
    'GREATER_THAN_EQUALS_WRAPPER_OPEN': 'IsGreaterThanOrEqual(',
    'GREATER_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'LESS_THAN_WRAPPER_OPEN': 'IsLessThan(',
    'LESS_THAN_WRAPPER_CLOSE': ')',
    'LESS_THAN_EQUALS_WRAPPER_OPEN': 'IsLessThanOrEqual(',
    'LESS_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'PLUS_WRAPPER_OPEN':'Add(',
    'PLUS_WRAPPER_CLOSE':')',
    'MINUS_WRAPPER_OPEN':'Subtract(',
    'MINUS_WRAPPER_CLOSE':')',
    'ARRAY_LENGTH_WRAPPER_OPEN': 'GetArrayLength(',
    'ARRAY_LENGTH_WRAPPER_CLOSE': ')',
    'DIVIDE_WRAPPER_OPEN': 'Divide(',
    'DIVIDE_WRAPPER_CLOSE': ')',
    'MULTIPLY_WRAPPER_OPEN': 'Multiply(',
    'MULTIPLY_WRAPPER_CLOSE': ')',
    'INDEXOF_WRAPPER_OPEN': 'GetIndexOf(',
    'INDEXOF_WRAPPER_CLOSE': ')',
    'MOD_WRAPPER_OPEN': 'Mod(',
    'MOD_WRAPPER_CLOSE': ')',
    'FUNCTION_TOKEN': 'func',
    'DEFAULT_RETURN_TYPE': 'any',
    'BLOCK_OPENING_TOKEN': '{',
    'DEFAULT_PARAMETER_TYPE': 'any',
    'LINE_TERMINATOR': '',
    'CONDITION_OPENING':'',
    'CONDITION_CLOSE':'',
    'AWAIT_TOKEN': '',
    'NULL_TOKEN': 'nil',
    'UNDEFINED_TOKEN': 'nil',
    'WHILE_TOKEN': 'for',
    'ELEMENT_ACCESS_WRAPPER_OPEN': 'GetValue(',
    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
};

// Go static type of the native emissions the printer itself makes (a stdlib call,
// or one of its own immediately-called literals). A local that captures one holds
// that concrete type, exactly like the helper result the emission replaced.
const GO_NATIVE_CALL_RETURN_TYPES: { [name: string]: string } = {
    'strings.Index': 'int',
};

// Go static type of the value each base helper returns. A local initialised by
// one of these already holds that concrete type inside its `any` box, so naming
// the type at the declaration site keeps the very same runtime value and only
// refines what the Go compiler knows about it.
const GO_HELPER_RETURN_TYPES: { [name: string]: string } = {
    'GetArrayLength': 'int',
    'GetLength': 'int',
    // the printInlineArrayLength emission of `.length` on a slice
    'len': 'int',
    'GetIndexOf': 'int',
    'ToString': 'string',
    // hand-written exchange_encode.go helper, a plain Go `string` on its only return path
    'this.UrlencodeNested': 'string',
    'ToLower': 'string',
    'ToUpper': 'string',
    'JsonStringify': 'string',
    'Capitalize': 'string',
    'this.Uuid': 'string',
    'this.Hmac': 'string',
    'this.Ymdhms': 'string',
    'this.Yyyymmdd': 'string',
    'this.Ymd': 'string',
    'Split': '[]string',
    'ObjectKeys': '[]string',
    'this.Extend': 'map[string]any',
    'this.DeepExtend': 'map[string]any',
    'this.Keysort': 'map[string]any',
    'this.IndexBy': 'map[string]any',
    'this.GroupBy': 'map[string]any',
    'this.Milliseconds': 'int64',
    'this.Seconds': 'int64',
    'this.Microseconds': 'int64',
    'ParseInt': 'int64',
    'MathFloor': 'float64',
    'MathCeil': 'float64',
    'MathRound': 'float64',
    'MathAbs': 'float64',
    'MathPow': 'float64',
    'ToFloat64': 'float64',
    'EvalTruthy': 'bool',
    'IsEqual': 'bool',
    'IsGreaterThan': 'bool',
    'IsLessThan': 'bool',
    'IsGreaterThanOrEqual': 'bool',
    'IsLessThanOrEqual': 'bool',
    'InOp': 'bool',
    'IsArray': 'bool',
    'IsString': 'bool',
    'IsInt': 'bool',
    'IsBool': 'bool',
    'IsNumber': 'bool',
    'IsObject': 'bool',
    'IsDictionary': 'bool',
    'StartsWith': 'bool',
    'EndsWith': 'bool',
    // the native string operations (emitted with a proven Go `string` receiver) return exactly
    // the type of the helper they replace, so a local initialised by one keeps its declared type
    'strings.Split': '[]string',
    'strings.Join': 'string',
    'strings.ToUpper': 'string',
    'strings.ToLower': 'string',
    'strings.Replace': 'string',
    'strings.ReplaceAll': 'string',
    'strings.HasPrefix': 'bool',
    'strings.HasSuffix': 'bool',
    'IsInstance': 'bool',
    'IsInteger': 'bool',
    'this.InArray': 'bool',
    'this.ValueIsDefined': 'bool',
    'Precise.StringGt': 'bool',
    'Precise.StringGe': 'bool',
    'Precise.StringLt': 'bool',
    'Precise.StringLe': 'bool',
    'Precise.StringEq': 'bool',
    'Precise.StringEquals': 'bool',
    // the base Safe* accessors return a typed pointer so that an absent value is a
    // nil pointer, distinct from a present zero value ("" / 0 / false)
    'this.SafeString': '*string',
    'this.SafeString2': '*string',
    'this.SafeStringN': '*string',
    'this.SafeStringLower': '*string',
    'this.SafeStringLower2': '*string',
    'this.SafeStringLowerN': '*string',
    'this.SafeStringUpper': '*string',
    'this.SafeStringUpper2': '*string',
    'this.SafeStringUpperN': '*string',
    'this.SafeInteger': '*int64',
    'this.SafeInteger2': '*int64',
    'this.SafeIntegerN': '*int64',
    'this.SafeIntegerProduct': '*int64',
    'this.SafeIntegerProduct2': '*int64',
    'this.SafeIntegerProductN': '*int64',
    'this.SafeTimestamp': '*int64',
    'this.SafeTimestamp2': '*int64',
    'this.SafeTimestampN': '*int64',
    'this.SafeFloat': '*float64',
    'this.SafeFloat2': '*float64',
    'this.SafeFloatN': '*float64',
    // absent flag → nil pointer, present flag → its value, mirroring the string/number accessors
    'this.SafeBool': '*bool',
    'this.SafeBool2': '*bool',
    'this.SafeBoolN': '*bool',
    // SafeDict*/SafeList* stay untyped: the Go accessors return `any` because the value
    // may be a *sync.Map, a Dict or an order-book side, none of which is a map[string]any / []any
    // Precise arithmetic returns a numeric string, or nil when an operand is
    // absent, so it carries the same *string shape as the Safe* string accessors
    'Precise.StringMul': '*string',
    'Precise.StringDiv': '*string',
    'Precise.StringSub': '*string',
    'Precise.StringAdd': '*string',
    'Precise.StringOr': '*string',
    'Precise.StringMax': '*string',
    'Precise.StringMin': '*string',
    'Precise.StringAbs': '*string',
    'Precise.StringNeg': '*string',
    'Precise.StringMod': '*string',
};

// helpers whose Go signature is `any` (GetValue, Ternary, Add, SafeValue, ...) are
// deliberately absent above: their box holds a value the printer cannot name, so
// those locals stay `any`. A Safe* entry presupposes the matching Go accessor
// returns that shape (as the hand-written base already does for Str/Int/Float).

// printed calls whose Go result is a JSON decode: map/slice/scalar or nil, never a
// typed pointer. `this.parseJson` / `this.json` are the hand-written base decoders,
// `JsonParse` / `ParseJSON` their runtime twins.
const GO_JSON_PARSE_CALLS = [ 'Json', 'JsonParse', 'ParseJson', 'ParseJSON' ];

// Hand-written CCXT fields whose Go type is a plain `bool` (go/v4/exchange.go,
// struct BaseExchange, embedded by every derived exchange). Reading one already
// yields a Go bool, so a condition on it needs no truthiness helper at all.
const GO_BOOL_FIELDS = new Set([
    'this.Verbose',
    'this.EnableRateLimit',
    'this.ReduceFees',
    'this.SubstituteCommonCurrencyCodes',
    'this.IsSandboxModeEnabled',
    // `public newUpdates: boolean` in ts/src/base/Exchange.ts; the hand-written
    // struct field is the `NewUpdates bool` read by every WS loop
    'this.NewUpdates',
]);

// Hand-written BaseExchange methods (go/v4/exchange.go) whose Go signature returns a
// plain `bool`, so `EvalTruthy(this.IsEmpty(x))` IS `this.IsEmpty(x)`. InArray,
// Precise.String* and the retagged generated methods are already in GO_HELPER_RETURN_TYPES.
const GO_BOOL_CALL_NAMES_NATIVE = [
    'this.IsEmpty',
    'this.IsJsonEncodedObject',
    'this.IsBinaryMessage',
];
// Pointer-returning accessors the ccxt build pass wraps with DerefScalar but that the
// Go type table above does not name (their printed Go signature is not in it).
const GO_DEREF_WRAPPED_CALLS = [ 'NumberToString', 'Parse8601', 'Iso8601' ];

// A printed call the printer cannot type *and* whose Go signature returns `any`
// can be compared with nil / a string / a bool literal without the helper: the
// box holds a scalar or nil, never a typed pointer.
const GO_ANY_BOX_CALLS = [
    'GetValue', 'Ternary',
    'SafeValue', 'this.SafeValue',
    'SafeDict', 'this.SafeDict',
    'SafeList', 'this.SafeList',
    'SafeNumber', 'this.SafeNumber',
];

// read-only string accessors whose printed Go result is a `*string`. Each one reads
// its arguments and returns a fresh pointer, so repeating the call in the two halves
// of a deref comparison returns the same value when every argument is a plain read.
const GO_PURE_STRING_ACCESSORS = [
    'this.SafeString', 'this.SafeString2', 'this.SafeStringN',
    'this.SafeStringLower', 'this.SafeStringLower2', 'this.SafeStringLowerN',
    'this.SafeStringUpper', 'this.SafeStringUpper2', 'this.SafeStringUpperN',
    'this.NumberToString', 'this.SafeCurrencyCode',
];

// the `*bool` twin of the table above: the accessors whose Go signature returns a
// pointer that is nil for an absent flag and carries the flag otherwise — the same
// two states `derefScalar` hands the truthiness helper.
const GO_PURE_BOOL_ACCESSORS = [
    'this.SafeBool', 'this.SafeBool2', 'this.SafeBoolN',
];

// Pointer types the Go nil test of the runtime helpers reproduces exactly: derefScalar
// unwraps them to an untyped nil, IsEqual has its own *sync.Map case. Other pointers
// (*sync.Mutex), map/slice fields and `any` fields flip meaning, so they keep the helper.
const GO_NIL_EQUIVALENT_POINTER_TYPES_Native = new Set([
    '*sync.Map', '*string', '*int64', '*float64', '*bool', '*int', '*[]string', '*[]any', '*map[string]any',
]);

// Hand-written BaseExchange fields (go/v4/exchange.go, embedded by every exchange
// class) declared with one of those pointer types, keyed by the printed Go field name;
// the Go type lives in the hand-written base, not in the TypeScript class.
const GO_NILABLE_FIELDS_Typed: { [name: string]: string } = {
    'this.Options'          : '*sync.Map',
    'this.Markets'          : '*sync.Map',
    'this.Markets_by_id'    : '*sync.Map',
    'this.MarketsById'      : '*sync.Map',
    'this.Currencies'       : '*sync.Map',
    'this.Currencies_by_id' : '*sync.Map',
    'this.CurrenciesById'   : '*sync.Map',
    'this.BaseCurrencies'   : '*sync.Map',
    'this.QuoteCurrencies'  : '*sync.Map',
    'this.Tickers'          : '*sync.Map',
    'this.Orderbooks'       : '*sync.Map',
    'this.Bidsasks'         : '*sync.Map',
    'this.Transactions'     : '*sync.Map',
};

const GO_TYPE_NAMES = [ 'string', 'int', 'int64', 'float64', 'bool', 'any' ];

// `var x any = this.SafeDict(container, key)` may declare the map type: SafeMapTyped reads the same
// member and returns the map (sync.Map converted), nil when absent or not a map. Emitted only when
// every later use READS it as a dictionary — a typed nil map is a non-nil interface otherwise.
const GO_SAFE_DICT_LOCAL_TYPE = 'map[string]any';

// the hand-written helpers a typed dict local may be handed to as their receiver: each one
// normalises the argument with derefScalar/GetValue, so a nil map reads exactly like the nil
// interface the local used to hold
const GO_SAFE_DICT_READ_HELPERS = [ 'GetValue', 'InOp', 'ObjectKeys', 'IsDictionary' ];

// `var market any = this.Market(symbol)` / `this.SafeMarket(…)`: the TS return type is the
// `MarketInterface` interface, so MapTyped returns the same dictionary and the local can be
// `map[string]any`. Emitted only while every later use READS it as a dictionary (SafeDict scan).
const GO_MARKET_LOCAL_TYPE = 'map[string]any';

// the binary operators under which a market/currency local's element read is a pure READ: the
// element is derefed by the GetValue the element-read printer keeps for these operands
// (goMarketComparisonElementRead), so `market['swap'] === true` keeps answering exactly what the
const GO_MARKET_READ_COMPARISON_OPERATORS = [
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
];

// `var x any = this.SafeList(container, key)` may carry the slice type for the same reason: the
// accessor returns `any`, so SafeListTyped reads the same member and hands back a []any with the
// same length and elements (every array kind IsArray admits is converted), nil when the member is
const GO_SAFE_LIST_LOCAL_TYPE = '[]any';


// the boundary comment ccxt's base sources (ts/src/base/Exchange.ts, PredictionExchange.ts)
// carry and build/goTranspiler.ts re-assembles the generated file around

// the Go numeric kinds. `<` `>` `<=` `>=` compile without a conversion only when
// both operands carry the same one of these
const GO_NUMERIC_KINDS = [ 'int', 'int64', 'float64' ];

const ORDERED_COMPARISON_OPERATORS: { [kind: number]: string } = {
    [ts.SyntaxKind.GreaterThanToken]: '>',
    [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
    [ts.SyntaxKind.LessThanToken]: '<',
    [ts.SyntaxKind.LessThanEqualsToken]: '<=',
};

// hand-written BaseExchange fields (go/v4/exchange.go) declared `string`: their Go
// value is never nil, so `this.<field> + s` matches Add(field, s) exactly. The Go
// struct field is what decides — a batch-A `Str` TS annotation (`version: Str`)
// still prints this field as a plain Go string.
const GO_STRING_FIELD_NAMES = [ 'Id', 'Name', 'Version', 'Url', 'Hostname', 'UserAgent' ];

// the hand-written SafeString-family methods (go/v4/exchange_safe.go) return a fresh
// non-nil pointer whenever the call passes a non-nil default: the value branch takes
// the address of the found string, the default branch the address of ToString(def).
const GO_DEFAULTED_SAFE_STRING_ARITY: { [name: string]: number } = {
    'safeString': 3, 'safeStringLower': 3, 'safeStringUpper': 3,
    'safeString2': 4, 'safeStringLower2': 4, 'safeStringUpper2': 4,
    'safeStringN': 3, 'safeStringLowerN': 3, 'safeStringUpperN': 3,
};

// the default shapes derefScalar leaves non-nil: a literal default is never the absent
// case, so the method's nil return is unreachable for a call carrying one
const GO_NON_NIL_DEFAULT_KINDS = [
    ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword,
];

// the operators that write their left operand: an assignment through any of them may
// store a nil pointer where the deref proof expected the defaulted call's result
const GO_WRITE_OPERATOR_KINDS = [
    ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.PercentEqualsToken,
];

// hand-written BaseExchange fields (go/v4/exchange.go) declared as a container: an
// element write on one of them is native code — a map index write, or `Store` for the
// thread-safe ones, which is exactly what AddElementToObject does for a *sync.Map.
const GO_FIELD_CONTAINER_TYPES_NATIVE: { [name: string]: string } = {
    'Has': 'map[string]any',
    'Api': 'map[string]any',
    'TransformedApi': 'map[string]any',
    'RequiredCredentials': 'map[string]any',
    'HttpExceptions': 'map[string]any',
    'Timeframes': 'map[string]any',
    'Features': 'map[string]any',
    'Exceptions': 'map[string]any',
    'Precision': 'map[string]any',
    'UserAgents': 'map[string]any',
    'TokenBucket': 'map[string]any',
    'CommonCurrencies': 'map[string]any',
    'ProxyDictionaries': 'map[string]any',
    'WsClients': 'map[string]any',
    'Clients': 'map[string]any',
    'Limits': 'map[string]any',
    'Fees': 'map[string]any',
    'Status': 'map[string]any',
    'Countries': 'map[string]any',
    'Options': '*sync.Map',
    'Markets': '*sync.Map',
    'Markets_by_id': '*sync.Map',
    'MarketsById': '*sync.Map',
    'Currencies': '*sync.Map',
    'Currencies_by_id': '*sync.Map',
    'CurrenciesById': '*sync.Map',
    'BaseCurrencies': '*sync.Map',
    'QuoteCurrencies': '*sync.Map',
    'Tickers': '*sync.Map',
    'Orderbooks': '*sync.Map',
    'Transactions': '*sync.Map',
};

// operator kinds the arithmetic helpers are emitted for
const GO_ARITHMETIC_KINDS = [
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.SlashToken,
    ts.SyntaxKind.PercentToken,
];

// ---------------------------------------------------------------------------------------------
// Trailing `//` comment alignment (gofmt's tabwriter cells).
//
// go/printer separates a trailing comment from the code with a hard tab (`writeCommentPrefix`),
// so the code text is the last tab-terminated cell of the line. text/tabwriter pads that cell to
// the widest cell of its column block plus `padding = 1` (gofmt runs with `minwidth = 0`,
// `padding = 1`, `padchar = ' '`), which is why adjacent statements get their comments aligned
// and a lone one gets exactly one space. A column block is the run of adjacent lines whose code
// cell sits in the same column (same indentation); formfeeds terminate all columns, and
// go/printer emits them between sections: blank and comment-only lines, a change of indentation,
// each line of a multi-line expression (`binaryExpr` breaks with `newSection = true`) and every
// statement that follows a multi-line one (`stmtList` breaks with `newSection = true`).
//
// The pass below reproduces that padding on the printed text. It is a no-op on text gofmt has
// already aligned (verified over the whole go/v4 tree) and it never reflows or re-wraps a line.
// ---------------------------------------------------------------------------------------------

// a line whose code ends like this does not end its statement: the line below it belongs to the
// same multi-line expression, and go/printer puts a formfeed before it (a new column block)
const GO_COMMENT_BREAK_END = /(?:[({[:]|[+\-*/%&|^<>=!])$/;

// (opens - closes) of ()[]{} outside strings, so `foo(` (statement continues) and `}` (statement
// ended before this line) are not mistaken for complete single-line statements
function goBracketBalance (code: string): number {
    let depth = 0;
    let i = 0;
    while (i < code.length) {
        const ch = code[i];
        if ((ch === '"') || (ch === '\'')) {
            const quote = ch;
            i += 1;
            while (i < code.length) {
                if (code[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (code[i] === quote) {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if (ch === '`') {
            i += 1;
            while ((i < code.length) && (code[i] !== '`')) {
                i += 1;
            }
            i += 1;
            continue;
        }
        if ((ch === '(') || (ch === '[') || (ch === '{')) {
            depth += 1;
        } else if ((ch === ')') || (ch === ']') || (ch === '}')) {
            depth -= 1;
        }
        i += 1;
    }
    return depth;
}

// the return type the printer's own immediately-called func literal carries
// (`func() T { … }()`), or undefined when the text is not one or T is an `any` box
function goFuncLiteralReturnType (value: string): string | undefined {
    const literal = /^func\(\) ([\w.[\]]*) \{/.exec(value);
    if ((literal === null) || !value.endsWith('}()') || (literal[1] === 'any')) {
        return undefined;
    }
    return literal[1];
}

// index of the first `//` outside strings and comments, or -1. The state is carried across lines
// because `/* */` comments and `-quoted strings can span them (a `//` inside a string literal is
// data, e.g. the `https://` of an endpoint, and must not be taken for a comment)
function goTrailingCommentIndex (line: string, state: { block: boolean, raw: boolean }): number {
    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (state.block) {
            if ((ch === '*') && (line[i + 1] === '/')) {
                state.block = false;
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }
        if (state.raw) {
            if (ch === '`') {
                state.raw = false;
            }
            i += 1;
            continue;
        }
        if (ch === '`') {
            state.raw = true;
            i += 1;
            continue;
        }
        if ((ch === '"') || (ch === '\'')) {
            const quote = ch;
            i += 1;
            while (i < line.length) {
                if (line[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (line[i] === quote) {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if ((ch === '/') && (line[i + 1] === '/')) {
            return i;
        }
        if ((ch === '/') && (line[i + 1] === '*')) {
            state.block = true;
            i += 2;
            continue;
        }
        i += 1;
    }
    return -1;
}

// tabwriter counts runes, not bytes (a multi-byte identifier is one column wide)
function goRuneWidth (text: string): number {
    let width = 0;
    for (const _rune of text) { // eslint-disable-line @typescript-eslint/no-unused-vars
        width += 1;
    }
    return width;
}

function alignGoTrailingComments (content: string): string {
    const lines = content.split ('\n');
    const entries: { index: number, indent: string, code: string, comment: string }[] = [];
    const state = { 'block': false, 'raw': false };
    for (let index = 0; index < lines.length; index++) {
        const commentIndex = goTrailingCommentIndex (lines[index], state);
        if (commentIndex < 0) {
            continue;
        }
        // the code cell: everything before the comment, without the padding already inside it
        const code = lines[index].slice (0, commentIndex).replace (/[ \t]+$/, '');
        if (!code.trim ()) {
            continue; // a comment-only line is a section break, it is never a cell
        }
        const indent = code.match (/^[ \t]*/)[0];
        entries.push ({ 'index': index, indent, code, 'comment': lines[index].slice (commentIndex) });
    }
    // group the lines that share a code column: adjacent, same indentation, and no section break
    // in between (the previous line must end its own statement, and that statement must be a
    // single-line one, or the next statement starts a new section)
    const groups: typeof entries[] = [];
    let group: typeof entries = [];
    for (const entry of entries) {
        const previous = group[group.length - 1];
        const continues = previous
            && (entry.index === previous.index + 1)
            && (entry.indent === previous.indent)
            && (goBracketBalance (previous.code) === 0)
            && !GO_COMMENT_BREAK_END.test (previous.code);
        if (continues) {
            group.push (entry);
        } else {
            if (group.length) {
                groups.push (group);
            }
            group = [ entry ];
        }
    }
    if (group.length) {
        groups.push (group);
    }
    for (const members of groups) {
        let width = 0;
        for (const member of members) {
            width = Math.max (width, goRuneWidth (member.code));
        }
        width += 1; // tabwriter padding
        for (const member of members) {
            const pad = width - goRuneWidth (member.code);
            lines[member.index] = member.code + ' '.repeat (pad) + member.comment;
        }
    }
    return lines.join ('\n');
}

// the TypeScript accessors whose Go signature this printer knows to be `*string`
// (GO_HELPER_RETURN_TYPES plus coerced SafeCurrencyCode/SafeSymbol); the textual call-site proof
// uses them for ts/src sibling files a scoped run's program does not carry.
const GO_TS_SRC_STRING_PRODUCERS = [
    /^this\s*\.\s*safeString\s*\(/,
    /^this\s*\.\s*safeString2\s*\(/,
    /^this\s*\.\s*safeString3\s*\(/,
    /^this\s*\.\s*safeStringN\s*\(/,
    /^this\s*\.\s*safeStringLower\s*\(/,
    /^this\s*\.\s*safeStringLower2\s*\(/,
    /^this\s*\.\s*safeStringUpper\s*\(/,
    /^this\s*\.\s*safeStringUpper2\s*\(/,
    /^this\s*\.\s*safeCurrencyCode\s*\(/,
    /^this\s*\.\s*safeSymbol\s*\(/,
];

// the TS accessors whose Go signature GO_HELPER_RETURN_TYPES already names
// `map[string]any`, for the same textual sibling-file proof. A map argument is also
// proven when it is an object literal (its printed Go form is exactly that map) or a
const GO_TS_SRC_MAP_PRODUCERS = [
    /^this\s*\.\s*extend\s*\(/,
    /^this\s*\.\s*deepExtend\s*\(/,
    /^this\s*\.\s*keysort\s*\(/,
    /^this\s*\.\s*indexBy\s*\(/,
    /^this\s*\.\s*groupBy\s*\(/,
];

// the argument texts of a call whose opening parenthesis sits at `open`, or undefined
// when the parentheses do not balance — an unproven call site must never pass the proof
function goBalancedCallArgs (text: string, open: number): string[] | undefined {
    const args: string[] = [];
    let depth = 0;
    let current = '';
    let quote: string | undefined;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (quote !== undefined) {
            current += ch;
            if (ch === '\\') {
                current += text[i + 1] ?? '';
                i++;
                continue;
            }
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if ((ch === '"') || (ch === "'") || (ch === '`')) {
            quote = ch;
            current += ch;
            continue;
        }
        if ((ch === '/') && (text[i + 1] === '/')) {
            while ((i < text.length) && (text[i] !== '\n')) { i++; }
            continue;
        }
        if (ch === '(') {
            depth++;
            if (depth > 1) { current += ch; }
            continue;
        }
        if (ch === ')') {
            depth--;
            if (depth === 0) {
                if (current.trim().length > 0) { args.push (current.trim ()); }
                return args;
            }
            current += ch;
            continue;
        }
        if ((ch === ',') && (depth === 1)) {
            args.push (current.trim ());
            current = '';
            continue;
        }
        current += ch;
    }
    return undefined;
}

export {
    alignGoTrailingComments,
};

// implicit endpoints pass fetch2/request/sign params through untyped (a list for batch orders)
const GO_GETARG_EXCLUDED_POSITIONS: { [name: string]: number[] } = {
    'fetch2': [ 3 ],
    'request': [ 3 ],
    'sign': [ 3 ],
};

export class GoTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    wrapThisCalls: boolean;
    wrapCallMethods: string[] = [];
    // installed by the ccxt build: GetArg alias -> Go types, and the audited consumer table
    CCXT_GO_GETARG_DECLARED_TYPES: any;
    CCXT_GO_GETARG_SAFE_CONSUMERS: any;
    // declarations whose Go local type is being resolved right now (see goLocalStaticType)
    goLocalTypeResolution = new Set<any>();
    // appended to every async (channel returning) Go method/function name and to each
    // checker-resolved call site of one; '' disables the rename
    asyncMethodSuffix = '';
    classNameMap: { [key: string]: string };
    DEFAULT_RETURN_TYPE = 'any';
    // suffix of the sibling body method an async trampoline hands its work to
    ASYNC_BODY_SUFFIX = 'Body';
    // gofmt indents every nesting level with exactly one tab; the printer emits the
    // same bytes so the generated tree needs no `gofmt` pass (campaign go-gofmt F01)
    DEFAULT_IDENTATION = "\t";
    // stdlib packages the printed source file references. A Go import must precede the first
    // declaration, so the file-level print (printSourceFileStatements) collects names here and
    // prepends `import "..."`. Nested prints keep their own list; memo of goStdlibImportIsPlaceable().

    constructor(config = {}) {
        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = false;
        this.implicitAsyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = true;
        this.wrapThisCalls = false;
        this.id = "Go";
        this.className = "undefined";
        this.classNameMap = config['classNameMap'] ?? {};
        this.initConfig();

        // user overrides
        this.applyUserOverrides(config);
        this.wrapThisCalls = config['wrapThisCalls'] ?? false;
        this.wrapCallMethods = config['wrapCallMethods'] ?? [];
        this.asyncMethodSuffix = config['asyncMethodSuffix'] ?? '';
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
            // 'this': '$this',
        };

        this.RightPropertyAccessReplacements = {
            'push': 'Add', // list method
            'indexOf': 'IndexOf', // list method
            'toUpperCase': 'ToUpper',
            'toLowerCase': 'ToLower',
            'toString': 'ToString',
        };

        this.FullPropertyAccessReplacements = {
            'JSON.parse': 'parseJson', // custom helper method
            'console.log': 'fmt.Println',
            'Number.MAX_SAFE_INTEGER': 'Int32.MaxValue',
            'Math.min': 'Math.Min',
            'Math.max': 'Math.Max',
            'Math.log': 'Math.Log',
            'Math.abs': 'Math.Abs',
            // 'Math.ceil':  'Math.Ceiling', // need cast
            // 'Math.round': 'Math.Round', // need to cast
            'Math.floor': 'Math.Floor',
            'Math.pow': 'Math.Pow',
            // 'Promise.all': 'Task.WhenAll',
        };

        this.CallExpressionReplacements = {
            // "parseInt": "parseINt",
            // "parseFloat": "float.Parse",
        };

        this.ReservedKeywordsReplacements = {
            // 'string': 'str',
            // 'params': 'parameters',
            'type': 'typeVar',
            // 'internal': 'intern',
            // 'event': 'eventVar',
            // 'fixed': 'fixedVar',
        };

        this.binaryExpressionsWrappers = {
            [ts.SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [ts.SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [ts.SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
            [ts.SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
            [ts.SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
            [ts.SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
            [ts.SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
            [ts.SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
            [ts.SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE],
        };
    }

    // getBlockOpen(identation){
    //     return this.getIden(identation)  + this.BLOCK_OPENING_TOKEN;
    // }

    printSuperCallInsideConstructor(node, identation) {
        return ""; // csharp does not need super call inside constructor
    }

    printStringLiteral(node) {
        const token = this.STRING_QUOTE_TOKEN;
        let text = node.text;
        if (text in this.StringLiteralReplacements) {
            return this.StringLiteralReplacements[text];
        }
        // skip the replaceAll passes when there is nothing to escape
        // note: single quotes must NOT be escaped — \' is an invalid escape in Go string literals
        if (/[\\"\b\f\n\r\t]/.test(text)) {
            // Preserve real backslashes
            const backslashPlaceholder = "\x00";
            text = text.replaceAll("\\", backslashPlaceholder);
            text = text.replaceAll("\b", "\\b");
            text = text.replaceAll("\f", "\\f");
            text = text.replaceAll("\n", "\\n");
            text = text.replaceAll("\r", "\\r");
            text = text.replaceAll("\t", "\\t");
            text = text.replaceAll(backslashPlaceholder, "\\\\");
            text = text.replaceAll("\"", "\\\"");
        }
        return token + text + token;
    }

    transformFunctionNameIfNeeded(name): string {
        return this.capitalize(name);
    }


    // The cells of one struct field in the shape gofmt's fieldList() prints them: a named
    // field is `Name Type [Tag]` (the name cell — and, when the field carries a tag, the type
    // cell too — is a tab-terminated column cell) and an embedded field is a single cell.
    // printStruct() lays those cells out; printPropertyDeclaration() joins them with spaces.
    getStructFieldCells(node) {
        const name = this.capitalize(this.printNode(node.name, 0));
        let type = 'any';
        if (node.type === undefined) {
            type = 'any';
        } else if (node.type.kind === SyntaxKind.StringKeyword) {
            type = 'string';
        } else if (node.type.kind === SyntaxKind.NumberKeyword) {
            type = 'int';
        } else if (node.type.kind === SyntaxKind.BooleanKeyword || (ts as any).isBooleanLiteral(node)) {
            type = 'bool';
        } else if (node.type.kind === SyntaxKind.ArrayType) {
            type = '[]any';
        }
        const cells = [ name, type ];
        if (node.initializer) {
            // we have to save the value and initialize it later
            let initializer = this.printNode(node.initializer, 0);
            // quick fix
            initializer = initializer.replaceAll('"', '');
            cells.push(`\`default:"${initializer}"\``);
        }
        return cells;
    }

    printPropertyDeclaration(node, identation) {
        return this.getIden(identation) + this.getStructFieldCells(node).join(' ') + this.LINE_TERMINATOR;
    }

    printStruct(node, indentation) {

        const rows: string[][] = [];
        // check if we have heritage
        if (node?.heritageClauses?.length > 0) {
            const heritage = node.heritageClauses[0];
            const heritageType = heritage.types[0];
            let heritageEscapedText = heritageType.expression.escapedText;
            if (this.classNameMap[heritageEscapedText]) {
                heritageEscapedText = this.classNameMap[heritageEscapedText];
            }
            // an embedded field has no type cell: it is a single, unterminated cell
            rows.push([ heritageEscapedText ]);
        }

        const propDeclarations = node.members.filter(member => member.kind === SyntaxKind.PropertyDeclaration);
        propDeclarations.forEach(member => rows.push(this.getStructFieldCells(member)));

        // gofmt lays the fields out with text/tabwriter (go/printer's fieldList): a column
        // block is a run of consecutive fields whose cell in that column is tab-terminated,
        // and every cell of the block is padded with spaces to the widest cell of the block
        // plus one. An embedded field (a single cell) and a field without a tag (its type is
        // the trailing cell) end the block of every column they have no cell in, which is
        // what keeps `Exchange` from widening the `exchangeTyped *ExchangeTyped` column.
        const lines = rows.map((cells, row) => {
            let line = cells[0];
            for (let column = 0; column < cells.length - 1; column++) {
                let width = 0;
                for (let previous = row; previous >= 0 && rows[previous].length > column + 1; previous--) {
                    width = Math.max(width, rows[previous][column].length);
                }
                for (let next = row + 1; next < rows.length && rows[next].length > column + 1; next++) {
                    width = Math.max(width, rows[next][column].length);
                }
                line += ' '.repeat(width + 1 - cells[column].length) + cells[column + 1];
            }
            return this.getIden(indentation + 1) + line;
        });

        // a struct with no fields is `type X struct {\n}`: no stray blank line before the brace
        const body = lines.length ? '\n' + lines.join('\n') + '\n' : '\n';
        return `type ${this.className} struct {${body}}`;
    }

    printNewStructMethod(node){
        return `
func New${this.capitalize(this.className)}() *${(this.className)} {
\tp := &${this.className}{}
\tsetDefaults(p)
\treturn p
}\n`;
        // TO remove `return copies lock value: github.com/ccxt/ccxt/go/v4.bitvavoWs contains github.com/ccxt/ccxt/go/v4.bitvavo contains github.com/ccxt/ccxt/go/v4.Exchange contains sync.Mutex`
        // change the return value to
        //
        //         return `
        // func New${this.capitalize(className)}() *${(className)} {
        //    p := ${className}{}
        //    setDefaults(&p)
        //    return &p
        // }\n`;
        //

    }

    printClass(node, identation) {
        this.className = node.name.escapedText;
        if (this.classNameMap[this.className]) {
            this.className = this.classNameMap[this.className];
        }

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewStructMethod(node);

        const methods = node.members.filter(member => member.kind === SyntaxKind.MethodDeclaration);
        const classMethods = this.joinTopLevelDecls(methods.map(method => this.printMethodDeclaration(method, identation)));
        // const classDefinition = this.printClassDefinition(node, identation);

        // const classBody = this.printClassBody(node, identation);

        // const classClosing = this.getBlockClose(identation);

        // return classDefinition + classBody + classClosing;
        return struct + "\n" + newMethod  + "\n" + classMethods;
    }

    /**
     * gofmt's declaration-list rule (go/printer nodes.go `declList`): a top-level
     * declaration that carries a doc comment is separated from the previous declaration
     * by exactly one blank line (`min = 2` linebreaks), while a declaration without one
     * keeps the source's own separation (the printer emits members adjacent to the
     * closing brace above them). `printClass` used to join every member with a bare
     * "\n", so a method whose leading `/** ... *` + `/` comment follows the previous
     * method's closing brace came out as `}\n/**` and gofmt re-inserted the blank line.
     */
    joinTopLevelDecls (decls: string[]): string {
        return decls.map((decl, index) => {
            if (index === 0 || !this.startsWithComment(decl)) {
                return (index === 0 ? "" : "\n") + decl;
            }
            return "\n\n" + decl;
        }).join("");
    }

    /**
     * True when the emitted declaration text opens with its doc comment - the comment
     * group gofmt attaches to the declaration (`getDoc(d) != nil` in go/printer).
     */
    startsWithComment (decl: string): boolean {
        return this.isComment(decl.split("\n")[0]);
    }

    /**
     * Indent every non-blank line of `lines` by `identation` levels. gofmt trims trailing
     * whitespace, so an indented *blank* line (only the indentation of a blank source
     * line) must stay empty instead of becoming whitespace-only text.
     */
    indentLines (lines: string[], identation: number): string[] {
        return lines.map((line) => line.trim().length === 0 ? "" : this.getIden(identation) + line);
    }

    printPropertyAccessModifiers (node) {
        return "";
    }

    printSpreadElement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        return this.getIden(identation) + expression + this.SPREAD_TOKEN;
    }

    printMethodDeclaration(node, identation) {

        let methodDef = this.printMethodDefinition(node, identation);

        const isAsync = this.isAsyncFunction(node);

        const funcBody = this.printFunctionBody(node, identation, isAsync);

        if (!isAsync) {
            methodDef += funcBody;
            return methodDef;
        }

        // Trampoline + body pair, see printAsyncTrampolineBlock.
        const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
        const bodyName = this.getAsyncBodyName(node, goName);
        const trampoline = methodDef + this.printAsyncTrampolineBlock(node, identation, `${this.THIS_TOKEN}.${bodyName}`);
        const bodyDef = `${this.getIden(identation)}func (${this.THIS_TOKEN} *${this.className}) ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;

        return trampoline + "\n" + bodyDef + funcBody;
    }

    printFunctionDeclaration(node, identation) {
        if (ts.isArrowFunction(node)) {
            const parameters = node.parameters.map(param => this.printParameter(param)).join(", ");
            const body = this.printNode(node.body);
            return `(${parameters}) => ${body}`;
        }
        const isAsync = this.isAsyncFunction(node);
        const functionDef = this.printFunctionDefinition(node, identation);
        const funcBody = this.printFunctionBody(node, identation, isAsync);

        // printFunctionDefinition already carries the leading comment
        if (!isAsync) {
            return functionDef + funcBody;
        }

        // module-scope `async function` has no receiver: the body is a package-level
        // sibling function with the same trampoline contract
        const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
        const bodyName = this.getAsyncBodyName(node, goName);
        const trampoline = functionDef + this.printAsyncTrampolineBlock(node, identation, bodyName);
        const bodyDef = `${this.getIden(identation)}func ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;

        return trampoline + "\n" + bodyDef + funcBody;
    }

    /**
     * Name of the sibling *body* method/function an async core hands its work to.
     *
     * `FetchTicker` -> `fetchTickerBody`. Deliberately UNEXPORTED: the body is an
     * implementation detail of the trampoline, so it must not show up on the generated
     * interfaces (ICoreExchange) nor on the typed `*_wrapper.go` facades, and it stays
     * invisible to the reflection based `callInternal`/`callDynamically` dispatch.
     *
     * If that name is already taken by a real declaration (a hand written
     * `fetchTickerBody`), a numeric suffix is appended instead of silently clobbering it.
     */
    getAsyncBodyName(node, goName: string): string {
        const taken = new Set<string>();
        const remember = (raw) => {
            if (!raw) {
                return;
            }
            const name = String(raw);
            taken.add(name);
            try {
                taken.add(this.transformMethodNameIfNeeded(name));
            } catch {
                // a malformed name must never break emission
            }
        };
        try {
            const parent = node?.parent;
            if (parent && ts.isClassDeclaration(parent)) {
                parent.members.forEach((member: any) => remember(member?.name?.escapedText));
            } else if (parent && ts.isSourceFile(parent)) {
                parent.statements.forEach((statement: any) => {
                    if (ts.isFunctionDeclaration(statement)) {
                        remember(statement?.name?.escapedText);
                    }
                });
            }
        } catch {
            // a malformed/synthesised node must never break emission
        }
        const base = goName.charAt(0).toLowerCase() + goName.slice(1) + this.ASYNC_BODY_SUFFIX;
        let name = base;
        let suffix = 0;
        while (taken.has(name)) {
            suffix++;
            name = `${base}${suffix}`;
        }
        return name;
    }

    /**
     * Parameter list of the body: the channel it must fill, then the original parameters
     * verbatim (including the `optionalArgs ...any` tail), so the trampoline can forward
     * its own arguments unchanged.
     */
    printAsyncBodyParameters(node): string {
        const params = this.printMethodParameters(node);
        const channelParam = `ch chan ${this.DEFAULT_RETURN_TYPE}`;
        return params ? `${channelParam}, ${params}` : channelParam;
    }

    /**
     * Arguments the trampoline forwards to its body, matching printMethodParameters:
     * the declared parameters in order, plus the variadic `optionalArgs...` tail when
     * the function has any defaulted parameter.
     */
    printAsyncTrampolineArgs(node): string {
        const args = [];
        let hasOptionalParameter = false;
        (node?.parameters ?? []).forEach((param) => {
            if (param.initializer) {
                hasOptionalParameter = true;
                return;
            }
            args.push(this.printNode(param.name, 0));
        });
        if (hasOptionalParameter) {
            args.push('optionalArgs...');
        }
        return args.join(", ");
    }

    /**
     * The trampoline: an async core hands back a *hot handle*.
     *
     *     func (this *Exchange) FetchTicker(symbol any) <-chan any {
     *         ch := make(chan any, 1)
     *         go this.fetchTickerBody(ch, symbol)
     *         return ch
     *     }
     *
     *   - `ch` is buffered (cap 1): the body's single `ch <- value` never blocks, so a
     *     result nobody ever receives still lets the goroutine finish and run
     *     `defer close(ch)` (no leak for abandoned calls).
     *   - the body runs on its own goroutine, so the call expression returns immediately
     *     with work already in flight. That is what makes
     *     `const a = this.fetchA (); const b = this.fetchB (); await Promise.all([a,b])`
     *     overlap, exactly like the C#/Java ports, with no call-site wrapper.
     *   - the result stays UNNAMED (`<-chan any`): `return ch` is the trampoline's only
     *     statement and it always runs, because the recover (`defer ReturnPanicError(ch)`)
     *     lives on the body, not here.
     */
    printAsyncTrampolineBlock(node, identation, callee: string): string {
        const args = this.printAsyncTrampolineArgs(node);
        const argList = args ? `, ${args}` : "";
        return [
            // F04: the signature above ends WITHOUT a trailing space, so the block opener
            // carries the one space before `{` (same contract as getBlockOpen)
            " {",
            `${this.getIden(identation + 1)}ch := make(chan ${this.DEFAULT_RETURN_TYPE}, 1)`,
            `${this.getIden(identation + 1)}go ${callee}(ch${argList})`,
            `${this.getIden(identation + 1)}return ch`,
            `${this.getIden(identation)}}`,
        ].join("\n");
    }

    /**
     * Go name of an async (channel returning) declaration: `fetchTicker` -> `FetchTickerAsync`.
     * Empty `asyncMethodSuffix` (the default) keeps the plain name, so the suffix is opt-in.
     */
    printAsyncDeclarationName(node, goName: string): string {
        if (!this.asyncMethodSuffix || !this.isAsyncFunction(node)) {
            return goName;
        }
        return goName + this.asyncMethodSuffix;
    }

    /**
     * Resolve the declaration a call/property access refers to and append `asyncMethodSuffix`
     * when it is an async function. Uses the checker, so `this.x()`, `super.x()`, `obj.x()` and
     * bare `x()` all agree with the declaration site. Unresolvable or non-function symbols
     * (properties, `any` receivers, JS builtins) keep the plain name.
     */
    applyAsyncSuffixToCallee(nameNode, goName: string): string {
        if (!this.asyncMethodSuffix || !nameNode) {
            return goName;
        }
        let decls;
        try {
            let symbol = this.getChecker().getSymbolAtLocation(nameNode);
            if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
                symbol = this.getChecker().getAliasedSymbol(symbol);
            }
            decls = symbol?.declarations;
        } catch {
            return goName;
        }
        if (!decls || decls.length === 0) {
            return goName;
        }
        // only declarations with a body count: interface/abstract signatures (e.g. implicit API
        // endpoints declared as `foo(params?: {}): Promise<T>;`) are emitted elsewhere, unsuffixed
        const isAsyncDecl = decls.some((d) => (ts.isMethodDeclaration(d) || ts.isFunctionDeclaration(d))
            && d.body !== undefined && this.isAsyncFunction(d));
        return isAsyncDecl ? goName + this.asyncMethodSuffix : goName;
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(name));

        const returnType = this.printFunctionType(node).trim();

        const parsedArgs = this.printMethodParameters(node);

        // F04: `func`, the receiver, the name and the return type are separated by exactly one
        // space, and the signature carries NO trailing space — the block opener (`getBlockOpen`,
        // or `printAsyncTrampolineBlock` below) contributes the single space before `{`.
        // gofmt rejects both `func  (this *X)` and `) any  {`.
        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
        const structReceiver = `(${this.THIS_TOKEN} *${this.className})`;
        const returnSignature = returnType ? " " + returnType : "";
        const methodDef = this.getIden(identation) + methodToken + structReceiver + " " + name + "(" + parsedArgs + ")" + returnSignature;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }


    printFunctionDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(name));

        const returnType = this.printFunctionType(node).trim();

        const parsedArgs = this.printMethodParameters(node);

        // F04: single spaces only, no trailing space before the block (see printMethodDefinition)
        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
        const returnSignature = returnType ? " " + returnType : "";
        const methodDef = this.getIden(identation) + methodToken + name + "(" + parsedArgs + ")" + returnSignature;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printMethodParameters(node) {
        const params = node.parameters.map(param => this.printParameter(param));
        const hasOptionalParameter = params.some(p => p === 'optional');
        if (!hasOptionalParameter) {
            return params.join(", ");
        }
        const paramsWithOptional = params.filter(param => param !== 'optional');
        paramsWithOptional.push('optionalArgs ...any');
        return paramsWithOptional.join(", ");
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        const type = this.printParameterType(node);

        if (defaultValue) {
            if (initializer) {
                return 'optional'; // will be handled later
            }
            // not supported we have to find an alternative for go like defining multiple methods with different parameters
            // if (initializer) {
            //     const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
            //     const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
            //     return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            // }
            return name + ' ' + type;
        }
        return name + ' ' + type;
    }

    printParameterType(node) {
        // B-02: an internal method's parameter that the call-site proof types prints
        // its native Go type; every other parameter keeps the `any` box
        const nativeType = this.goNativeParameterType(node);
        if (nativeType !== undefined) {
            return nativeType;
        }
        const typeText = this.getType(node);
        // // if (typeText === this.BOOLEAN_KEYWORD) {
        // //     return typeText;
        // // }

        //tmp default to interface
        return 'any';

        if (typeText === this.STRING_KEYWORD) {
            return 'string';
        }
        if (typeText === this.NUMBER_KEYWORD) {
            return 'float64';
        }

        if (typeText === this.BOOLEAN_KEYWORD) {
            return 'bool';
        }

        return this.DEFAULT_PARAMETER_TYPE;

        if (typeText === undefined || typeText === this.STRING_KEYWORD) {
            // throw new FunctionReturnTypeError("Parameter type is not supported or undefined");
            this.warn(node, node.getText(), "Parameter type not found, will default to: " + this.DEFAULT_PARAMETER_TYPE);
            return this.DEFAULT_PARAMETER_TYPE;
        }
        return typeText;

    }

    printFunctionType(node){
        const typeText = this.getFunctionType(node);
        if (typeText === 'void') {
            // // If the function is async (returns a Promise in TS) but declared void, emit a typed channel
            // if (this.isAsyncFunction(node)) {
            //     // Ensure element type is present; some edge cases yield '<-chan' only
            //     const elementType = this.DEFAULT_RETURN_TYPE || 'any';
            //     return `<-chan ${elementType}`;
            // }
            return "";
        }
        if (typeText === undefined || (typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD)) {
            // throw new FunctionReturnTypeError("Function return type is not supported");
            let res = "";
            if (this.isAsyncFunction(node)) {
                res = `<-chan ${this.DEFAULT_RETURN_TYPE}`;
            } else {
                res = this.DEFAULT_RETURN_TYPE;
            }
            this.warn(node, node.name.getText(), "Function return type not found, will default to: " + res);
            return res;
        }
        if (typeText === this.PROMISE_TYPE_KEYWORD) {
            return `<-chan any`;
        }

        // move any trailing array brackets "[]" to directly precede the element type
        if (typeText && typeText.endsWith('[]')) {
            const core = typeText.substring(0, typeText.length - 2); // drop []
            const lastBracketPos = core.lastIndexOf(']');
            if (lastBracketPos !== -1) {
                // insert [] right after the last ']'
                return core.substring(0, lastBracketPos + 1) + '[]' + core.substring(lastBracketPos + 1);
            }
        }
        return typeText;
    }

    // true when the printed expression is a single call `Callee(...)` covering the
    // whole string, so its Go type is the callee's return type and nothing else
    isWholePrintedCall(value: string, open: number): boolean {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = open; i < value.length; i++) {
            const c = value[i];
            if (inString) {
                if (escaped) { escaped = false; }
                else if (c === '\\') { escaped = true; }
                else if (c === '"') { inString = false; }
                continue;
            }
            if (c === '"') { inString = true; continue; }
            if (c === '(') { depth++; continue; }
            if (c === ')') {
                depth--;
                if (depth === 0) { return i === value.length - 1; }
            }
        }
        return false;
    }

    // the concrete Go type the initializer already produces, or undefined when the
    // printer cannot name it (GetValue, Ternary, Add, ... return any)
    goTypeOfInitializer(initializer, printedValue: string): string | undefined {
        // a `.slice(a, b)` this printer inlines to a Go subscript (or its guarded func
        // literal) still holds a string, so its local keeps the type the helper gave it
        if (this.goIsNativeSliceCall(initializer)) {
            return 'string';
        }
        switch (initializer?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'bool';
        case ts.SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case ts.SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case ts.SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!EvalTruthy(x)`
            return (initializer.operator === ts.SyntaxKind.ExclamationToken) ? 'bool' : undefined;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goTypeOfInitializer(initializer.expression, printedValue);
        case ts.SyntaxKind.BinaryExpression: {
            // `a || b` prints `EvalTruthy(a) || EvalTruthy(b)`, a Go bool
            const op = initializer.operatorToken.kind;
            if ((op === ts.SyntaxKind.BarBarToken) || (op === ts.SyntaxKind.AmpersandAmpersandToken)) {
                return 'bool';
            }
            // `a === b` prints either `IsEqual(a, b)` or an inlined `(a == b)`;
            // `a < b` prints either `IsLessThan(a, b)` or an inlined `(a < b)`.
            // All of them are Go bools.
            if ((op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken)
                || (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken)
                || (ORDERED_COMPARISON_OPERATORS[op] !== undefined)) {
                return 'bool';
            }
            break;
        }
        case ts.SyntaxKind.CallExpression: {
            // `x.toString()` that printToStringCall inlined to the receiver's own text: the
            // declaration then holds that receiver's value, i.e. the same Go string. Every
            // other receiver keeps the helper call, whose own return type is classified below.
            const property = initializer.expression;
            if ((property?.kind === ts.SyntaxKind.PropertyAccessExpression)
                && (property.name?.escapedText === 'toString')
                && (initializer.arguments?.length === 0)
                && (this.goOperandStaticType(property.expression, printedValue) === 'string')) {
                return 'string';
            }
            break;
        }
        }
        let value = printedValue.trim();
        // `const x = (a === b)` prints the wrapping parentheses of the source
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        const open = value.indexOf('(');
        // the printer's own emissions are immediately-called func literals: the native
        // `key in obj` returns a Go bool (no EvalTruthy round-trip), and a ternary whose
        // arms print as one scalar returns that scalar — both name the value natively
        const literalType = goFuncLiteralReturnType(value);
        if ((literalType !== undefined) && (GO_TYPE_NAMES.indexOf(literalType) >= 0)) {
            return literalType;
        }
        // the nil-guarded `indexOf` literal holds the same Go int GetIndexOf returned
        if (value.startsWith('func() int {') && value.endsWith('}()')) {
            return 'int';
        }
        if (open <= 0 || !this.isWholePrintedCall(value, open)) {
            return undefined;
        }
        const callee = value.substring(0, open);
        if (!/^[A-Za-z_][\w.]*$/.test(callee)) {
            return undefined;
        }
        return GO_NATIVE_CALL_RETURN_TYPES[callee] ?? GO_HELPER_RETURN_TYPES[callee];
    }

    // strips the wrapping parentheses the source (or an operand) printed around a
    // whole expression, so the inner text can be classified
    goUnwrapPrintedParens(printedText: string): string {
        let value = (printedText ?? '').trim();
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        return value;
    }

    // the concrete Go type of a `var x T = <init>` local, undefined for `any`
    goLocalStaticType(node): string | undefined {
        const declaration: any = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        if (declaration.parent?.parent?.kind !== ts.SyntaxKind.FirstStatement) {
            return undefined; // declared with `:=`, where the printer annotates nothing
        }
        if (this.goLocalTypeResolution.has(declaration)) {
            return undefined; // the safety scan below prints an expression using this same local
        }
        this.goLocalTypeResolution.add(declaration);
        try {
            return this.getGoLocalType(declaration, this.printNode(declaration.initializer, 0));
        } finally {
            this.goLocalTypeResolution.delete(declaration);
        }
    }

    // `x := <init>` takes the Go type of the printed initializer, and a `for` initializer carries no
    // annotation, so only decidable literal shapes are named: untyped integer constant is `int`,
    // floating-point is `float64`. Integers not fitting `int` and other initializers keep the helper.
    goInferredLocalStaticType(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        const declarationList = declaration.parent;
        if (declarationList?.kind !== ts.SyntaxKind.VariableDeclarationList
            || declarationList.parent?.kind === ts.SyntaxKind.FirstStatement) {
            return undefined; // the `var x <T> = …` form the printer writes a type on
        }
        const kind = this.goNumericLiteralKind(declaration.initializer);
        if ((kind === 'int') && !this.goLiteralFitsKind(declaration.initializer, 'int')) {
            return undefined;
        }
        return kind;
    }

    // `this.<field>` read of a hand-written BaseExchange string field
    goStringFieldStaticType(node, printedText: string): string | undefined {
        const match = /^this\.([A-Za-z_]\w*)$/.exec(this.goUnwrapPrintedParens(printedText));
        if (match === null || GO_STRING_FIELD_NAMES.indexOf(match[1]) < 0) {
            return undefined;
        }
        // the struct field is a plain Go `string`: a string cannot be nil, so Add's
        // nil branch is unreachable and every read is the same non-nil string
        return 'string';
    }

    // a parameter the printer's own signature printer types with a concrete Go scalar:
    // the emitted Go parameter holds that type at every use, so the operator rule can
    // consume it (the typed-param families re-type `Str`/`Int`/`Num` params this way)
    goDeclaredParamStaticType(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.Parameter) {
            return undefined;
        }
        let type;
        try {
            type = this.printParameterType(declaration);
        } catch (e) {
            return undefined;
        }
        if ((typeof type !== 'string') || (type === 'any') || (GO_TYPE_NAMES.indexOf(type) < 0)) {
            return undefined;
        }
        return this.goTypeNameIsShadowed(this.goEnclosingFunction(declaration), type) ? undefined : type;
    }

    // a `*string` local prints a nilable Go pointer; it may only be dereferenced
    // where the checker narrowed it to a non-nilable string (a guard that always
    // exits, an `if (x !== undefined)` block). TypeScript `undefined` == Go nil here.
    goNilProvenStringDeref(node): boolean {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (this.goDeclaredTypeOfIdentifier(node) !== '*string') {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const type = checker.getTypeAtLocation(node);
        return (type.flags & ts.TypeFlags.StringLike) !== 0;
    }

    // a `*string` local every write of which is a SafeString-family call with a literal
    // default: that Go method can only return a fresh non-nil pointer, so the local may
    // be deref'd even where the checker offers no narrowing. One write of any other
    goDefaultedSafeStringLocal(node): boolean {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        } catch (e) {
            return false;
        }
        if ((declaration?.kind !== ts.SyntaxKind.VariableDeclaration) || (declaration.name?.kind !== ts.SyntaxKind.Identifier)) {
            return false;
        }
        if (this.goDeclaredTypeOfIdentifier(node) !== '*string') {
            return false;
        }
        if (!this.goDefaultedSafeStringCall(declaration.initializer)) {
            return false;
        }
        const scope = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        const name = declaration.name.escapedText;
        let everyWriteDefaulted = true;
        const visit = (n) => {
            if (!everyWriteDefaulted) {
                return;
            }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name) && (n !== declaration.name)) {
                const parent: any = n.parent;
                if ((parent?.kind === ts.SyntaxKind.BinaryExpression) && (parent.left === n)
                    && (GO_WRITE_OPERATOR_KINDS.indexOf(parent.operatorToken?.kind) >= 0)) {
                    everyWriteDefaulted = (parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
                        && this.goDefaultedSafeStringCall(parent.right);
                    return;
                }
                if ((parent?.kind === ts.SyntaxKind.PrefixUnaryExpression) || (parent?.kind === ts.SyntaxKind.PostfixUnaryExpression)) {
                    everyWriteDefaulted = false;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return everyWriteDefaulted;
    }

    // a call to one of the hand-written SafeString-family methods that passes enough
    // arguments for the default and whose default is a literal (never the absent case)
    goDefaultedSafeStringCall(node): boolean {
        const call: any = node;
        if (call?.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = call.expression;
        if ((callee?.kind !== ts.SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== ts.SyntaxKind.ThisKeyword)) {
            return false;
        }
        const arity = GO_DEFAULTED_SAFE_STRING_ARITY[callee.name?.escapedText];
        if ((arity === undefined) || ((call.arguments?.length ?? 0) < arity)) {
            return false;
        }
        const last: any = call.arguments[call.arguments.length - 1];
        return GO_NON_NIL_DEFAULT_KINDS.indexOf(last?.kind) >= 0;
    }

    // a `*string` leaf the concat may deref: the checker narrowed it to a non-nilable
    // string at that use, a local whose every write is a defaulted SafeString-family
    // call, or such a call inline
    goDerefableStringOperand(node): boolean {
        if (this.goNilProvenStringDeref(node)) {
            return true;
        }
        if (node?.kind === ts.SyntaxKind.Identifier) {
            return this.goDefaultedSafeStringLocal(node);
        }
        return this.goDefaultedSafeStringCall(node);
    }

    // the printed text of a `+` operand the concat rule may use: the printer's own
    // text for a proven string, or the deref goNativeBinaryText adds for a derefable
    // `*string` leaf. undefined keeps the helper call.
    goStringConcatOperandType(node, printedText: string): string | undefined {
        if (this.goDerefableStringOperand(node)) {
            return 'string';
        }
        return (this.goOperandStaticType(node, printedText) === 'string') ? 'string' : undefined;
    }

    // `Add(Add(a, "lit"), b)` and every other `+` chain whose leaves are all non-nil
    // Go strings: the runtime Add only ever takes its string branch for those, so the
    // chain prints as the Go operator (`a + "lit" + b`). Anything else keeps the call.
    goNativeStringConcat(node, leftText: string, rightText: string): { goType: string, text: string } | undefined {
        if (this.goStringConcatOperandType(node.left, leftText) === undefined
            || this.goStringConcatOperandType(node.right, rightText) === undefined) {
            return undefined;
        }
        return { 'goType': 'string', 'text': this.goNativeBinaryText(node, '+', leftText, rightText) };
    }

    // Go static type of an operand's printed form: 'string', 'int', 'int64',
    // 'float64', or 'const-int' / 'const-float' (an untyped literal). undefined when
    // the printer cannot name it — a nilable/`any` operand keeps the helper call.
    goOperandStaticType(node, printedText: string): string | undefined {
        switch (node?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.NumericLiteral:
            return /^[0-9]+$/.test(node.text) ? 'const-int' : this.goConstFloatStaticType(node);
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goOperandStaticType(node.expression, this.goUnwrapPrintedParens(printedText));
        case ts.SyntaxKind.BinaryExpression:
            return this.goNativeArithmetic(node)?.goType;
        case ts.SyntaxKind.Identifier:
            return this.goLocalStaticType(node) ?? this.goInferredLocalStaticType(node) ?? this.goDeclaredParamStaticType(node);
        case ts.SyntaxKind.PropertyAccessExpression:
            // `a.length` / `s.replace(...)` print as helper calls, `this.Id` as a field
            return this.goStringFieldStaticType(node, printedText) ?? this.goStringCallStaticType(node, printedText);
        }
        return this.goStringCallStaticType(node, printedText);
    }

    // the Go type the printed expression already produces; '*string' / '*int64'
    // helpers box a nilable pointer, so those keep the helper call as well
    goStringCallStaticType(node, printedText: string): string | undefined {
        // the operator needs the printed expression's *static* Go type. A helper whose
        // Go signature returns `any` (GetValue, Ternary, ...) prints an interface box even
        // when a classifier can name the value inside it — that value only becomes
        // typed through an assertion at a declaration, never inline as an operand.
        if (GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0) {
            return undefined;
        }
        const goType = this.goTypeOfInitializer(node, printedText);
        return ('string' === goType || 'int' === goType || 'int64' === goType || 'float64' === goType) ? goType : undefined;
    }

    // an untyped Go floating-point constant: the helper boxes it as float64 and the
    // compiler converts the operand to float64 the same way
    goConstFloatStaticType(node): string | undefined {
        const text = node?.text;
        if ((typeof text !== 'string') || !/^[0-9][.eE]/.test(text)) {
            return undefined;
        }
        return Number.isFinite(Number(text.replaceAll('_', ''))) ? 'const-float' : undefined;
    }

    isNonZeroIntegerLiteral(node): boolean {
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.isNonZeroIntegerLiteral(node.expression);
        }
        return node?.kind === ts.SyntaxKind.NumericLiteral && /^[1-9][0-9]*$/.test(node.text);
    }

    isNonZeroFloatLiteral(node): boolean {
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.isNonZeroFloatLiteral(node.expression);
        }
        return (this.goConstFloatStaticType(node) !== undefined) && (Number(node.text.replaceAll('_', '')) !== 0);
    }

    // the exact value of a constant-only integer expression, undefined otherwise. Go folds `a * b`
    // over literals in arbitrary precision, so it must fit `int` and stay exact for the helper's
    // float64 path — the bound the caller checks.
    goConstantIntValue(node): number | undefined {
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.goConstantIntValue(node.expression);
        }
        if (node?.kind === ts.SyntaxKind.NumericLiteral) {
            return /^[0-9]+$/.test(node.text) ? Number(node.text) : undefined;
        }
        if (node?.kind !== ts.SyntaxKind.BinaryExpression || this.goConstantIntValue(node.left) === undefined || this.goConstantIntValue(node.right) === undefined) {
            return undefined;
        }
        const left = this.goConstantIntValue(node.left);
        const right = this.goConstantIntValue(node.right);
        switch (node.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken: return left + right;
        case ts.SyntaxKind.MinusToken: return left - right;
        case ts.SyntaxKind.AsteriskToken: return left * right;
        case ts.SyntaxKind.SlashToken: return (right === 0) ? undefined : Math.trunc(left / right);
        case ts.SyntaxKind.PercentToken: return (right === 0) ? undefined : left % right;
        }
        return undefined;
    }

    // an arithmetic expression that is the whole initializer of a printed `var x T = ...`: the
    // declared-local table owns that position (naming int64 when its int-kind proof holds, with the
    // forced unbox), so the operator rule leaves the call to it.
    goInsideTypedDeclarationInitializer(node): boolean {
        let current = node;
        while (current !== undefined) {
            const parent = current.parent;
            if (parent?.kind === ts.SyntaxKind.ParenthesizedExpression && (parent.expression === current)) {
                current = parent;
                continue;
            }
            if (parent?.kind === ts.SyntaxKind.BinaryExpression && ((parent.left === current) || (parent.right === current))
                && (GO_ARITHMETIC_KINDS.indexOf(parent.operatorToken.kind) >= 0)) {
                current = parent;
                continue;
            }
            break;
        }
        const declaration = current?.parent;
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.initializer !== current) {
            return false;
        }
        // the printer annotates `var x T = ...` only; `x := ...` carries the
        // initializer's own type instead
        return declaration.parent?.parent?.kind === ts.SyntaxKind.FirstStatement;
    }

    // The bare Go operator must yield what the runtime helper returns (go/v4/exchange_helpers.go):
    // Add keeps int/int64, while Subtract/Multiply/Divide/Mod take an exact int64 path or a float64
    // path, so only the rows below are equivalent.
    goNativeNumericResultType(op, leftType: string, rightType: string, node): string | undefined {
        const isIntKind = (kind: string) => (kind === 'int') || (kind === 'int64') || (kind === 'const-int');
        const isFloatKind = (kind: string) => (kind === 'float64') || (kind === 'const-float');
        const leftNode = node.left;
        const rightNode = node.right;
        if (isFloatKind(leftType) !== isFloatKind(rightType)) {
            return undefined; // Go has no operator that mixes an int and a float64 operand
        }
        if (isFloatKind(leftType) && isFloatKind(rightType)) {
            // the helper's float path is float64 arithmetic; its integral result boxes
            // as int64, the same normalization Subtract/Multiply/Divide already accept.
            // A constant operand must stay exactly representable: Go folds a constant
            if (op === ts.SyntaxKind.PercentToken) {
                return undefined; // Mod is math.Mod, no Go operator matches it
            }
            if (((leftType === 'const-float') && (rightType === 'const-float'))) {
                return undefined; // only a value the compiler folds exactly would match
            }
            if ((op === ts.SyntaxKind.SlashToken) && !this.isNonZeroFloatLiteral(rightNode)) {
                return undefined; // Divide returns nil on a zero divisor, / gives Inf
            }
            return 'float64';
        }
        if (!isIntKind(leftType) || !isIntKind(rightType)) {
            return undefined; // string / nilable / `any` operand: the helper's nil paths stay
        }
        if ((leftType === 'int64' && rightType === 'int') || (leftType === 'int' && rightType === 'int64')) {
            return undefined; // neither operand is untyped, Go refuses to mix the kinds
        }
        if ((leftType === 'const-int') && (rightType === 'const-int')) {
            // a constant-only expression is folded in arbitrary precision by the Go
            // compiler: require a value both kinds hold exactly, so no `constant
            // overflows int` and the helper's float64 path is exact as well
            const value = this.goConstantIntValue(node);
            if ((value === undefined) || (Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
                return undefined;
            }
        }
        const operands = ((leftType === 'int64') || (rightType === 'int64')) ? 'int64' : 'int';
        if (op === ts.SyntaxKind.PlusToken) {
            // Add keeps its own int/int64 rows: its box carries the operand kind
            return operands;
        }
        if ((operands === 'int') && this.goInsideTypedDeclarationInitializer(node)) {
            // the declared-local table names this position int64 when its int-kind
            // proof holds, and the `int` an operator would yield is not that type
            return undefined;
        }
        if (op === ts.SyntaxKind.PercentToken) {
            // Mod is math.Mod over float64: exact for integral operands, but a zero
            // divisor boxes NaN where % panics, so only a literal divisor is decidable
            return this.isNonZeroIntegerLiteral(rightNode) ? operands : undefined;
        }
        if ((op === ts.SyntaxKind.SlashToken) && !this.isNonZeroIntegerLiteral(rightNode)) {
            return undefined; // Divide returns nil on a zero divisor, the operator panics
        }
        // int64 in, int64 out: Subtract goes through ParseInt, Multiply/Divide/Mod use reflect Int()
        return operands;
    }

    // an operand that is itself a bare operator expression needs parens under a
    // tighter parent operator; a whole helper call is already delimited
    goNativeOperandText(node, printedText: string): string {
        const text = printedText.trim();
        if (node?.kind !== ts.SyntaxKind.BinaryExpression || text.startsWith('(')) {
            return text;
        }
        const open = text.indexOf('(');
        if (open > 0 && this.isWholePrintedCall(text, open)) {
            return text;
        }
        // `a + b` on strings is the only shape that can never sit under a tighter
        // operator, so it is the only one left unwrapped
        return (this.goOperandStaticType(node, text) === 'string') ? text : '(' + text + ')';
    }

    // `Add(a, b)` & co. become the Go operator when both printed operands already
    // hold a concrete Go type the helper would return unchanged; undefined keeps the
    // helper call (nil branches, `any` boxes, strings passed to Subtract, ...).
    goNativeArithmetic(node, leftText = undefined, rightText = undefined): { goType: string, text: string } | undefined {
        const op = node.operatorToken.kind;
        if (GO_ARITHMETIC_KINDS.indexOf(op) < 0) {
            return undefined;
        }
        leftText = leftText ?? this.printNode(node.left, 0);
        rightText = rightText ?? this.printNode(node.right, 0);
        if (op === ts.SyntaxKind.PlusToken) {
            const concat = this.goNativeStringConcat(node, leftText, rightText);
            if (concat !== undefined) {
                return concat;
            }
        }
        const leftType = this.goOperandStaticType(node.left, leftText);
        const rightType = this.goOperandStaticType(node.right, rightText);
        if (leftType === undefined || rightType === undefined) {
            return undefined;
        }
        if (leftType === 'string' || rightType === 'string') {
            if (leftType !== 'string' || rightType !== 'string' || op !== ts.SyntaxKind.PlusToken) {
                return undefined; // the other four helpers return nil for strings
            }
            return { 'goType': 'string', 'text': this.goNativeBinaryText(node, '+', leftText, rightText) };
        }
        const goType = this.goNativeNumericResultType(op, leftType, rightType, node);
        if (goType === undefined) {
            return undefined;
        }
        return { goType, 'text': this.goNativeBinaryText(node, this.SupportedKindNames[op], leftText, rightText) };
    }

    // the operator line gofmt prints for a natively emitted arithmetic expression: the
    // blanks follow go/printer's cutoff at the current depth, and a binary operand is
    // re-printed at the expression's own depth (a same-precedence left operand, or the
    // parentheses the printer wraps it in, which undo the one level the operand adds)
    goNativeBinaryText(node, symbol: string, leftText: string, rightText: string): string {
        const operandText = (operand, printed: string) => {
            const isBinary = operand?.kind === ts.SyntaxKind.BinaryExpression;
            const text = isBinary ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(operand, 0)) : printed;
            // a derefable `*string` leaf is the only operand that prints in a different
            // shape than the printer produced: the operator needs its pointee
            const leaf = this.goDerefableStringOperand(operand) ? ('*' + text.trim()) : text;
            return this.goNativeOperandText(operand, leaf);
        };
        const left = operandText(node.left, leftText);
        const right = operandText(node.right, rightText);
        const separator = this.goBinarySeparator(symbol, right, node.left, node.right);
        return left + separator + symbol + separator + right;
    }

    // `x += y` prints `x = Add(x, y)`; the compound operator is equivalent while
    // both sides hold a concrete Go type that can never make the helper return nil
    goNativeCompoundAssignment(op, leftNode, leftText: string, rightNode, rightText: string): string | undefined {
        const leftType = this.goOperandStaticType(leftNode, leftText);
        const rightType = this.goOperandStaticType(rightNode, rightText);
        if (leftType === undefined || rightType === undefined) {
            return undefined;
        }
        const isAdd = op === ts.SyntaxKind.PlusEqualsToken;
        const isSubtract = op === ts.SyntaxKind.MinusEqualsToken;
        if (!isAdd && !isSubtract) {
            return undefined;
        }
        if (leftType === 'string' && isAdd && rightType === 'string') {
            return `${leftText.trim()} += ${rightText.trim()}`;
        }
        if (leftType !== 'int64') {
            return undefined;
        }
        if (isAdd && (rightType === 'int64' || rightType === 'const-int')) {
            return `${leftText.trim()} += ${rightText.trim()}`;
        }
        if (isSubtract && (rightType === 'int64' || rightType === 'const-int')) {
            return `${leftText.trim()} -= ${rightText.trim()}`;
        }
        return undefined;
    }

    goEnclosingFunction(node) {
        let current = node?.parent;
        while (current) {
            switch (current.kind) {
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
            case ts.SyntaxKind.Constructor:
            case ts.SyntaxKind.SourceFile:
                return current;
            }
            current = current.parent;
        }
        return undefined;
    }

    // a transpiled parameter or local can literally be named `string`, which would
    // turn `var x string = ...` into a reference to that value instead of the type
    goTypeNameIsShadowed(scope, goType: string): boolean {
        const names = goType.match(/[A-Za-z_]\w*/g) ?? [];
        const relevant = names.filter((n) => GO_TYPE_NAMES.indexOf(n) >= 0);
        if (relevant.length === 0 || scope === undefined) {
            return false;
        }
        return this.hasNodeWhere(scope, (n: any) => {
            const isBinding = (n.kind === ts.SyntaxKind.Parameter) || (n.kind === ts.SyntaxKind.VariableDeclaration);
            if (isBinding && (n.name?.kind === ts.SyntaxKind.Identifier)) {
                if (relevant.indexOf(n.name.escapedText as string) >= 0) { return true; }
            }
            return false;
        });
    }

    // the shape `x.push(v)` that both the native emission and the declaration's safety
    // scan accept: the printed `x = append(x, v)` is a statement, so a value position or
    // a multi-argument/spread call still needs the helper
    goIsNativeAppendShape(receiverNode, pushNode): boolean {
        if (receiverNode?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (pushNode?.parent?.kind !== ts.SyntaxKind.ExpressionStatement) {
            return false;
        }
        if ((pushNode.questionDotToken !== undefined) || (pushNode.expression?.questionDotToken !== undefined)) {
            return false;
        }
        const access = pushNode.expression;
        if ((access?.kind !== ts.SyntaxKind.PropertyAccessExpression) || (access.expression !== receiverNode)
            || (access.name?.escapedText !== 'push')) {
            return false;
        }
        const args = pushNode.arguments;
        return (args?.length === 1) && (args[0].kind !== ts.SyntaxKind.SpreadElement);
    }

    // `x.push(v)` on a local declared `[]any` prints `x = append(x, v)`; undefined keeps
    // AppendToArray(&x, v). An `any` box keeps the helper: `&x` is a *any there, while a declared
    // []any local would pass a *[]any the helper's parameter does not accept.
    goNativeAppendReceiver(pushNode): string | undefined {
        const receiver = pushNode?.expression?.expression;
        if (!this.goIsNativeAppendShape(receiver, pushNode)) {
            return undefined;
        }
        if (this.goDeclaredTypeOfIdentifier(receiver) !== '[]any') {
            return undefined;
        }
        return this.printNode(receiver, 0);
    }

    // reject the refinement when something downstream needs the local to stay `any`:
    // `x.push(v)` prints `AppendToArray(&x, v)` (a *T is not a *any) and a later
    // assignment of a value with another concrete type would stop compiling
    goLocalIsSafeToType(scope, declaration, varName: string, goType: string): boolean {
        if (scope === undefined) {
            return false;
        }
        const safe = !this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === varName) && (n !== declaration.name)) {
                const parent = n.parent;
                if (parent?.kind === ts.SyntaxKind.PropertyAccessExpression && parent.expression === n
                && parent.name?.escapedText === 'push') {
                // a []any local appends natively, so its receiver may be typed; every
                // other push shape keeps the helper and with it the box
                    if ((goType !== '[]any') || !this.goIsNativeAppendShape(n, parent.parent)) {
                        return true;
                    }
                }
                if (parent?.kind === ts.SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if ((parent?.kind === ts.SyntaxKind.PostfixUnaryExpression) || (parent?.kind === ts.SyntaxKind.PrefixUnaryExpression)) {
                    const op = parent.operator;
                    if ((op === ts.SyntaxKind.PlusPlusToken) || (op === ts.SyntaxKind.MinusMinusToken)) {
                        return true;
                    }
                }
                if (parent?.kind === ts.SyntaxKind.SpreadElement) {
                    return true;
                }
                if (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression
                && parent.parent?.kind === ts.SyntaxKind.BinaryExpression
                && parent.parent.left === parent
                && parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    return true;
                }
                if (parent?.kind === ts.SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === ts.SyntaxKind.EqualsToken) {
                        if (this.goTypeOfInitializer(parent.right, this.printNode(parent.right, 0)) !== goType) {
                            return true;
                        }
                    } else if ((op >= ts.SyntaxKind.FirstCompoundAssignment) && (op <= ts.SyntaxKind.LastCompoundAssignment)) {
                        return true;
                    }
                }
            }
            return false;
        });
        return safe;
    }

    // the container/key argument nodes of a whole `this.SafeDict(container, key)` call, or undefined
    // for another shape. A third argument is droppable only when it is the empty map literal
    // (`safeDict(x, k, {})`), which no whitelisted read could observe.
    goSafeDictLocalArgs(initializer) {
        if (initializer?.kind !== ts.SyntaxKind.CallExpression) {
            return undefined;
        }
        const callee: any = initializer.expression;
        if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression || callee.name?.escapedText !== 'safeDict') {
            return undefined;
        }
        if (callee.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const args = initializer.arguments;
        if (args.length === 3) {
            const fallback = args[2];
            if (fallback?.kind !== ts.SyntaxKind.ObjectLiteralExpression || fallback.properties.length !== 0) {
                return undefined;
            }
        } else if (args.length !== 2) {
            return undefined;
        }
        return { container: args[0], key: args[1] };
    }

    // one later use of a dict local: it must read the value as a dictionary, never hand the
    // box out. Only the receiver position of the deref-aware read helpers, the `this.Safe*`
    // accessors and a plain `x[k]` element read qualify.
    goSafeDictUseReadsTheMap(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case ts.SyntaxKind.ElementAccessExpression: {
            if (parent.expression !== node) {
                return false; // x as an index key
            }
            const grandparent: any = parent.parent;
            if (grandparent?.kind === ts.SyntaxKind.BinaryExpression && grandparent.left === parent) {
                return false; // `x[k] = v` / `x[k] += v` writes into the map
            }
            if ((grandparent?.kind === ts.SyntaxKind.PostfixUnaryExpression) || (grandparent?.kind === ts.SyntaxKind.PrefixUnaryExpression)) {
                return false; // `x[k]++` / `&x[k]`
            }
            if (grandparent?.kind === ts.SyntaxKind.DeleteExpression) {
                return false;
            }
            return true;
        }
        case ts.SyntaxKind.BinaryExpression: {
            // `key in x` prints `InOp(x, key)`: the helper reads the map and answers false for
            // an absent (nil) map, exactly like the nil interface it used to hold
            return (parent.operatorToken?.kind === ts.SyntaxKind.InKeyword) && (parent.right === node);
        }
        case ts.SyntaxKind.CallExpression: {
            if (parent.expression === node) {
                return false; // the local called as a function
            }
            if (parent.arguments.indexOf(node) !== 0) {
                return false; // value position: the box escapes
            }
            const callee = this.goPrintedCallee(this.printNode(parent, 0));
            if (callee === undefined) {
                return false;
            }
            if (GO_SAFE_DICT_READ_HELPERS.indexOf(callee) >= 0) {
                return true;
            }
            return /^(?:this\.)?Safe[A-Z]/.test(callee) || (callee === 'this.IsDictionary');
        }
        default:
            return false;
        }
    }

    // `var x any = this.SafeDict(container, key)` -> `var x map[string]any = SafeMapTyped(...)`:
    // same member read, and every later use reads the local; with the absent case a nil map,
    // GetValue/InOp/ObjectKeys/IsDictionary and Safe* normalise a nil receiver. Else keep the box.
    goSafeDictLocalUnboxCache = new Map<any, string | undefined>();

    goSafeDictLocalUnbox(declaration): string | undefined {
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.name?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        // the printer annotates `var x T = …` only for a declaration statement; a for-init or
        // any other shape prints `:=`, where the annotation would not appear
        if (declaration.parent?.parent?.kind !== ts.SyntaxKind.FirstStatement) {
            return undefined;
        }
        if (this.goSafeDictLocalUnboxCache.has(declaration)) {
            return this.goSafeDictLocalUnboxCache.get(declaration);
        }
        this.goSafeDictLocalUnboxCache.set(declaration, undefined); // in-progress guard
        let result: string | undefined;
        try {
            result = this.goSafeDictLocalUnboxUncached(declaration);
        } finally {
            this.goSafeDictLocalUnboxCache.set(declaration, result);
        }
        return result;
    }

    // every read of `declaration`'s name inside its function must keep the boxed value's meaning for
    // the local to take a named Go type: a rebinding mixes two values, and a use `readsTheValue`
    // rejects re-boxes the local. `skipUse` drops nodes that are not references at all.
    goDeclaredLocalTypeIfSafe(declaration, goType: string, readsTheValue: (n: any) => boolean, skipUse?: (n: any) => boolean): string | undefined {
        const sourceName = declaration.name.escapedText as string;
        const scope: any = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return undefined;
        }
        const unsafe = this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind === ts.SyntaxKind.VariableDeclaration || n.kind === ts.SyntaxKind.Parameter)
                && (n !== declaration) && (n.name?.kind === ts.SyntaxKind.Identifier) && (n.name.escapedText === sourceName)) {
                return true; // a shadowing binding would mix two values under one name
            }
            if ((n.kind !== ts.SyntaxKind.Identifier) || (n.escapedText !== sourceName) || (n === declaration.name)) {
                return false;
            }
            return (skipUse !== undefined && skipUse(n)) ? false : !readsTheValue(n);
        });
        if (unsafe || this.goTypeNameIsShadowed(scope, goType)) {
            return undefined;
        }
        return goType;
    }

    goSafeDictLocalUnboxUncached(declaration): string | undefined {
        if (this.goSafeDictLocalArgs(declaration.initializer) === undefined) {
            return undefined;
        }
        return this.goDeclaredLocalTypeIfSafe(declaration, GO_SAFE_DICT_LOCAL_TYPE, (n) => this.goSafeDictUseReadsTheMap(n));
    }

    // the initializer a typed dict local is declared with: the accessor call is replaced by the
    // typed reader, which reads the same member (and converts a sync.Map) but names the result
    goSafeDictUnboxValue(declaration, identation: number): string | undefined {
        if (this.goSafeDictLocalUnbox(declaration) !== GO_SAFE_DICT_LOCAL_TYPE) {
            return undefined;
        }
        const args: any = this.goSafeDictLocalArgs(declaration.initializer);
        const container = this.printNode(args.container, identation);
        const key = this.printNode(args.key, 0);
        return `SafeMapTyped(${container}, ${key})`;
    }

    // the TypeScript return type proves the boxed value is the market dictionary: the checker reports
    // the `MarketInterface` interface for `this.Market(...)` / `this.SafeMarket(...)` (the `Market`
    // alias is the same interface unioned with undefined). Read from the checker, never a printed name.
    goMarketCallReturnsDict(initializer): boolean {
        if (initializer?.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = initializer.expression;
        if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression) {
            return false;
        }
        const name = callee.name?.escapedText;
        if (name === undefined) {
            return false;
        }
        const receiver: any = callee.expression;
        const onThis = receiver?.kind === ts.SyntaxKind.ThisKeyword;
        const onDerived = (receiver?.kind === ts.SyntaxKind.PropertyAccessExpression)
            && (receiver.expression?.kind === ts.SyntaxKind.ThisKeyword)
            && (receiver.name?.escapedText === 'DerivedExchange');
        if (!onThis && !onDerived) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const type = checker.getTypeAtLocation(initializer);
        if (type === undefined) {
            return false;
        }
        const isMarketInterface = (t) => {
            const names = [ t?.symbol?.getName?.() ?? t?.symbol?.escapedName, t?.aliasSymbol?.getName?.() ];
            return (names.indexOf('MarketInterface') >= 0) || (names.indexOf('CurrencyInterface') >= 0);
        };
        if (isMarketInterface(type)) {
            return true;
        }
        if ((typeof type.isUnion === 'function') && type.isUnion()) {
            return type.types.some((t) => isMarketInterface(t));
        }
        return false;
    }

    // `var market any = this.Market(symbol)` -> `var market map[string]any = MapTyped(...)`.
    // The box holds the dictionary the checker proved and every later use reads it (SafeDict's scan),
    // so this is a pure refinement. A value position, nil test or map write keeps the box.
    goMarketLocalUnboxCache = new Map<any, string | undefined>();

    goMarketLocalUnbox(declaration): string | undefined {
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.name?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        // only a declaration statement prints `var x T = …`; a for-init or the await form prints
        // `:=`, where the annotation (and this conversion) would not appear
        if (declaration.parent?.parent?.kind !== ts.SyntaxKind.FirstStatement) {
            return undefined;
        }
        if (this.goMarketLocalUnboxCache.has(declaration)) {
            return this.goMarketLocalUnboxCache.get(declaration);
        }
        this.goMarketLocalUnboxCache.set(declaration, undefined); // in-progress guard
        let result: string | undefined;
        try {
            result = this.goMarketLocalUnboxUncached(declaration);
        } finally {
            this.goMarketLocalUnboxCache.set(declaration, result);
        }
        return result;
    }

    // true when this identifier resolves to the declaration being typed (a property name or a
    // binding of the same name in another scope is not a use of the local). Without checker
    // information the name match stands.
    goIdentifierRefersToDeclaration(node, declaration): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return true;
        }
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol === undefined) {
            return true;
        }
        const valueDeclaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        return (valueDeclaration === undefined) || (valueDeclaration === declaration);
    }

    // one later use of the market local: the dictionary read shapes SafeDict proves (element read,
    // `in`, read-helper argument), plus — only when the accessor throws rather than answers absent —
    // a plain argument position, since Go re-boxes the map into the callee's `any` as the box did.
    goMarketUseReadsTheValue(node, throwingAccessor: boolean): boolean {
        if (this.goSafeDictUseReadsTheMap(node)) {
            return true;
        }
        const parent: any = node.parent;
        if ((parent?.kind === ts.SyntaxKind.ElementAccessExpression) && (parent.expression === node)) {
            let operand: any = parent;
            let above: any = parent.parent;
            while (above?.kind === ts.SyntaxKind.ParenthesizedExpression) {
                operand = above;
                above = above.parent;
            }
            if ((above?.kind === ts.SyntaxKind.BinaryExpression)
                && ((above.left === operand) || (above.right === operand))
                && (GO_MARKET_READ_COMPARISON_OPERATORS.indexOf(above.operatorToken?.kind) >= 0)) {
                return true;
            }
        }
        if (!throwingAccessor) {
            return false;
        }
        return (parent?.kind === ts.SyntaxKind.CallExpression)
            && (parent.expression !== node) && (parent.arguments.indexOf(node) >= 0);
    }

    goMarketLocalUnboxUncached(declaration): string | undefined {
        if (!this.goMarketCallReturnsDict(declaration.initializer)) {
            return undefined;
        }
        // the throwing accessors (`this.market`, `this.currency`) panic instead of answering absent, so
        // the boxed result is always a dictionary and passing the local re-boxes the same map into the
        // callee's `any`. The Safe* accessors may answer their own optional argument: read shapes only.
        const accessorName = declaration.initializer.expression?.name?.escapedText;
        const throwingAccessor = (accessorName === 'market') || (accessorName === 'currency');
        // `this.market(…)` carries the same name as the local: a property/method name is not
        // a reference, and neither is a different binding of the same name
        return this.goDeclaredLocalTypeIfSafe(declaration, GO_MARKET_LOCAL_TYPE,
            (n) => this.goMarketUseReadsTheValue(n, throwingAccessor),
            (n) => ((n.parent?.kind === ts.SyntaxKind.PropertyAccessExpression) && (n.parent.name === n))
                || !this.goIdentifierRefersToDeclaration(n, declaration));
    }

    // the initializer a typed market local is declared with: the same call, its boxed result
    // converted to the map the checker proved (nil when the call answered a non-map)
    goMarketUnboxValue(declaration, parsedValue: string): string | undefined {
        if (this.goMarketLocalUnbox(declaration) !== GO_MARKET_LOCAL_TYPE) {
            return undefined;
        }
        return `MapTyped(${parsedValue.trimStart()})`;
    }

    // the variable declaration an identifier binds to, through the checker (undefined for every
    // other shape) — the market rule resolves its own locals this way, never by printed name
    goDeclarationOfIdentifier(node): any {
        try {
            const symbol = this.getChecker().getSymbolAtLocation(node);
            const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
            if (declaration?.kind === ts.SyntaxKind.VariableDeclaration) {
                return declaration;
            }
        } catch (e) {
            return undefined;
        }
        return undefined;
    }

    // a compared element of a market/currency local keeps the GetValue helper: its deref is what
    // the boxed local's read used to apply, and a parseMarket may have stored a `*bool`/`*string`
    // under the key. Only the operands the use scan admits this way are affected; every other
    goMarketComparisonElementRead(node): boolean {
        const base: any = node?.expression;
        if (base?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const declaration = this.goDeclarationOfIdentifier(base);
        if ((declaration === undefined) || (this.goMarketLocalUnbox(declaration) !== GO_MARKET_LOCAL_TYPE)) {
            return false;
        }
        let operand: any = node;
        let above: any = node.parent;
        while (above?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            operand = above;
            above = above.parent;
        }
        return (above?.kind === ts.SyntaxKind.BinaryExpression)
            && ((above.left === operand) || (above.right === operand))
            && (GO_MARKET_READ_COMPARISON_OPERATORS.indexOf(above.operatorToken?.kind) >= 0);
    }

    // the container/key argument nodes of a whole `this.SafeList(container, key)` call, or
    // undefined when the initializer is another shape. A third argument is only droppable when
    // it is the empty array literal the TS call sites pass (`safeList(x, k, [])`): the typed
    goSafeListLocalArgs(initializer) {
        if (initializer?.kind !== ts.SyntaxKind.CallExpression) {
            return undefined;
        }
        const callee: any = initializer.expression;
        if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression || callee.name?.escapedText !== 'safeList') {
            return undefined;
        }
        if (callee.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const args = initializer.arguments;
        if (args.length === 3) {
            const fallback = args[2];
            if (fallback?.kind !== ts.SyntaxKind.ArrayLiteralExpression || fallback.elements.length !== 0) {
                return undefined;
            }
        } else if (args.length !== 2) {
            return undefined;
        }
        return { container: args[0], key: args[1] };
    }

    // one later use of a list local: it must read the value as a list, never hand the box out.
    // A length read, an element read and the statement-shaped push all answer for a []any what
    // the accessors answered for the box; every other use keeps the box.
    goSafeListUseReadsTheList(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case ts.SyntaxKind.PropertyAccessExpression: {
            if (parent.expression !== node) {
                return false; // the local as the receiver of a further member
            }
            if (parent.name?.escapedText === 'length') {
                return true; // prints GetArrayLength(x)
            }
            // `x.push(v)` prints `x = append(x, v)` only in the statement shape; every other
            // push keeps AppendToArray(&x, …), whose *any parameter a []any local cannot take
            return (parent.name?.escapedText === 'push') && this.goIsNativeAppendShape(node, parent.parent);
        }
        case ts.SyntaxKind.ElementAccessExpression: {
            if (parent.expression !== node) {
                return false; // the local as the index
            }
            return !this.isGoElementAccessAssignmentTarget(parent); // `x[k] = v` writes through the box
        }
        case ts.SyntaxKind.CallExpression: {
            if (parent.expression === node) {
                return false; // the local called as a function
            }
            if (parent.arguments.indexOf(node) !== 0) {
                return false; // value position: the box escapes
            }
            const callee = this.goPrintedCallee(this.printNode(parent, 0));
            // both accessors read a []any receiver with the very answer they gave the box
            return (callee === 'GetValue') || (callee === 'GetArrayLength');
        }
        default:
            return false;
        }
    }

    // `var x any = this.SafeList(container, key)` -> `var x []any = SafeListTyped(container, key)`.
    // SafeListTyped reads the same member and every later use reads it as a list: a nil slice counts
    // 0 and indexes to nil, matching the box's absent case. Anything else keeps the box.
    goSafeListLocalUnboxCache = new Map<any, string | undefined>();

    goSafeListLocalUnbox(declaration): string | undefined {
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.name?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        // the printer annotates `var x T = …` only for a declaration statement; a for-init or
        // any other shape prints `:=`, where the annotation would not appear
        if (declaration.parent?.parent?.kind !== ts.SyntaxKind.FirstStatement) {
            return undefined;
        }
        if (this.goSafeListLocalUnboxCache.has(declaration)) {
            return this.goSafeListLocalUnboxCache.get(declaration);
        }
        this.goSafeListLocalUnboxCache.set(declaration, undefined); // in-progress guard
        let result: string | undefined;
        try {
            result = this.goSafeListLocalUnboxUncached(declaration);
        } finally {
            this.goSafeListLocalUnboxCache.set(declaration, result);
        }
        return result;
    }

    goSafeListLocalUnboxUncached(declaration): string | undefined {
        if (this.goSafeListLocalArgs(declaration.initializer) === undefined) {
            return undefined;
        }
        return this.goDeclaredLocalTypeIfSafe(declaration, GO_SAFE_LIST_LOCAL_TYPE, (n) => this.goSafeListUseReadsTheList(n));
    }

    // the initializer a typed list local is declared with: the accessor call is replaced by the
    // typed reader, which reads the same member but names the result
    goSafeListUnboxValue(declaration, identation: number): string | undefined {
        if (this.goSafeListLocalUnbox(declaration) !== GO_SAFE_LIST_LOCAL_TYPE) {
            return undefined;
        }
        const args: any = this.goSafeListLocalArgs(declaration.initializer);
        const container = this.printNode(args.container, identation);
        const key = this.printNode(args.key, 0);
        return `SafeListTyped(${container}, ${key})`;
    }

    getGoLocalType(declaration, parsedValue: string): string {
        const goType = this.goTypeOfInitializer(declaration.initializer, parsedValue);
        if (goType === undefined) {
            return this.goSafeDictLocalUnbox(declaration) ?? this.goSafeListLocalUnbox(declaration) ?? this.goMarketLocalUnbox(declaration) ?? 'any';
        }
        // the scan matches AST identifiers, so it needs the source name, not the
        // printed one (`type` is renamed to `typeVar` on the way out)
        const sourceName = declaration.name?.escapedText;
        if (sourceName === undefined) {
            return 'any';
        }
        const scope = this.goEnclosingFunction(declaration);
        if (this.goTypeNameIsShadowed(scope, goType) || !this.goLocalIsSafeToType(scope, declaration, sourceName, goType)) {
            return 'any';
        }
        return goType;
    }

    // Typed async receive: an extension that knows the core's channel element type replaces
    // `x := (<-this.FooAsync(..))` + `PanicOnError(x)` with a typed declaration that runs PanicOnError
    // first (same frame and message). The default returns undefined and changes nothing.
    goAwaitReceiveUnbox(awaitNode, printedInitializer: string): { goType: string, wrap: (recv: string) => string } | undefined {
        return undefined;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        // const varToken = this.VAR_TOKEN ? this.VAR_TOKEN + " ": "";
        // const name = declaration.name.escapedText;

        if (declaration?.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            // gofmt drops every redundant statement terminator: Go statements are
            // newline-separated, so the joins below must not emit ';'
            let arrayBindingStatement =  `${this.getIden(identation)}${syntheticName} := ${this.printNode(declaration.initializer, 0)}\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const statement = this.getIden(identation) + `${e} := GetValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        if (declaration?.initializer?.kind=== ts.SyntaxKind.AwaitExpression) {
            const parsedName = this.printNode(declaration.name, 0);
            // the awaited call can carry a multi-line literal argument: printing it at the
            // declaration's own level keeps that literal one level deeper
            const parsedInitializer = this.printNode(declaration.initializer, identation);
            const awaitUnbox = this.goAwaitReceiveUnbox(declaration.initializer, parsedInitializer);
            if (awaitUnbox !== undefined) {
                // the conversion runs PanicOnError first (inside the bracket), so the panic
                // path keeps the same caller, message and stack as the boxed pair below
                return `
${this.getIden(identation)}var ${parsedName} ${awaitUnbox.goType} = ${awaitUnbox.wrap(parsedInitializer)}`;
            }
            return `
${this.getIden(identation)}${parsedName} := ${parsedInitializer}
${this.getIden(identation)}PanicOnError(${parsedName})`;

        }

        const isNew = declaration.initializer && (declaration.initializer.kind === ts.SyntaxKind.NewExpression);

        const parsedValue = (declaration.initializer) ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;

        if (parsedValue === this.UNDEFINED_TOKEN) {
            return this.getIden(identation) + "var " + this.printNode(declaration.name) + " any = " + parsedValue;
        }

        if (node?.parent?.kind === ts.SyntaxKind.FirstStatement) {
            if (isNew) {
                return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue;
            }
            const varName = this.printNode(declaration.name);
            const declaredType = this.getGoLocalType(declaration, parsedValue);
            // a typed dict/list local is declared with the typed reader rather than the `any`
            // accessor, so the declaration compiles against the map/slice type
            const unboxValue = this.goMarketUnboxValue(declaration, parsedValue)
                ?? ((declaredType === GO_SAFE_DICT_LOCAL_TYPE)
                    ? this.goSafeDictUnboxValue(declaration, identation)
                    : ((declaredType === GO_SAFE_LIST_LOCAL_TYPE) ? this.goSafeListUnboxValue(declaration, identation) : undefined));
            const declaredValue = (unboxValue !== undefined) ? unboxValue : parsedValue.trimStart();
            // an initializer printed at the declaration's own level (parenthesized expression,
            // helper call) carries that indentation; gofmt puts one space after `=`
            const stm = this.getIden(identation) + "var " + varName + " " + declaredType + " = " + declaredValue;
            if (parsedValue.startsWith("<-this.callInternal(")) {
                return `
${stm}
${this.getIden(identation)}PanicOnError(${varName})`;
            }
            return stm;
        }

        return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue.trim();
    }

    // printObjectLiteralExpression(node, identation) {
    //     const objectCreation = 'make(map[string]any) {';
    //     let formattedObjectBody = '{}';
    //     if (node.properties?.length > 0) {
    //         const objectBody = this.printObjectLiteralBody(node, identation);
    //         formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
    //     }
    //     // return  this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
    //     return objectCreation + formattedObjectBody;
    // }

    // printObjectLiteralBody(node, identation) {
    //     let objectName = node.parent?.name?.escapedText;
    //     if (objectName === undefined) {
    //         objectName = "object";
    //     }
    //     const body =  node.properties.map((p) => `${this.getIden(identation)}${objectName}["${node.properties[0].name.text}"] = ${p.initializer.text}` ).join("\n");
    //     return body;
    // }

    // F09 — gofmt aligns the key/value columns inside multi-line composite literals.
    //
    // go/printer's exprList prints a single-line `key: value` entry as `key:` + vtab, so
    // every consecutive single-line entry of a literal body lands in one text/tabwriter
    // column block: the value starts after the widest key cell of that block (`"key":`,
    // the key plus its colon) and one space of padding. An entry whose value spans lines
    // carries no vtab cell, so it ends the block on both sides, exactly like a blank line
    // does. exprList also writes a formfeed — turned into a plain newline by the trimmer,
    // so it never shows up in the output — before an entry that opens a new alignment
    // section: that happens when the entry or its predecessor does not fit on a single
    // line, and when the key size ratio against the geometric mean of the previous key
    // sizes of the section reaches r = 2.5 (or drops to 1/r) while at least one of the
    // two keys is larger than smallSize = 40 bytes; keys of at most 40 bytes always keep
    // the section aligned. A trailing comment is one more tabwriter cell, so comments
    // line up after the widest `value,` cell of the run of consecutive commented entries.
    printObjectLiteralBody(node, identation) {
        // composite literal elements are printed at depth 1 again (go/printer exprList(..., 1, ...));
        // a literal nested in an entry's value is laid out relative to that entry
        const previousLevel = this.goStatementLevel;
        this.goStatementLevel = identation + 1;
        try {
            const entries = node.properties.map((p) => this.goWithExprDepth(1, () => this.printNode(p, identation + 1)));
            return this.alignGoCompositeEntries(entries).join("\n");
        } finally {
            this.goStatementLevel = previousLevel;
        }
    }

    // Applies the gofmt column alignment to already-printed `key: value` entries (the
    // entries must not carry the separating comma). Reused by the hand-written composite
    // literals in ccxt's build/goTranspiler.ts, which do not go through this printer.
    alignGoCompositeEntries(entries) {
        const parsedEntries = entries.map((entry) => this.parseGoCompositeEntry(entry));
        const paddings = this.getGoCompositePaddings(parsedEntries);
        return entries.map((entry, index) => this.renderGoCompositeEntry(entry, parsedEntries[index], paddings[index]));
    }

    // `        "key": value, // comment` -> the pieces gofmt's tabwriter aligns.
    // Returns undefined for anything that is not a plain `key: value` entry (a spread, a
    // method, a computed key): the caller then leaves that entry alone and ends the block.
    parseGoCompositeEntry(entry) {
        const newlineIndex = entry.indexOf("\n");
        const firstLine = newlineIndex === -1 ? entry : entry.slice(0, newlineIndex);
        const keyMatch = /^([ \t]*)("(?:[^"\\]|\\.)*"): /.exec(firstLine);
        if (keyMatch === null) {
            return undefined;
        }
        const singleLine = newlineIndex === -1;
        // for a multi-line entry only the trailing comment of its last line matters here
        const tail = singleLine ? entry.slice(keyMatch[0].length) : entry.slice(entry.lastIndexOf("\n") + 1);
        const commentIndex = this.findGoTrailingCommentStart(tail);
        return {
            'indent': keyMatch[1],
            'key': keyMatch[2],
            // nodeSize() measures the printed key; a value that spans lines gets size 0
            'size': singleLine ? this.getGoByteLength(keyMatch[2]) : 0,
            'singleLine': singleLine,
            'value': singleLine ? (commentIndex === -1 ? tail : tail.slice(0, commentIndex)).trimEnd() : undefined,
            'comment': commentIndex === -1 ? undefined : tail.slice(commentIndex).trimEnd(),
        };
    }

    // Index of the trailing comment of a printed line, or -1. `//` or `/*` inside a string
    // or a rune literal (e.g. a "https://…" value) is not a comment.
    findGoTrailingCommentStart(line) {
        let quote;
        for (let index = 0; index < line.length; ++index) {
            const character = line[index];
            if (quote !== undefined) {
                if (character === "\\" && quote !== "`") {
                    index += 1;
                } else if (character === quote) {
                    quote = undefined;
                }
                continue;
            }
            if (character === "\"" || character === "`" || character === "'") {
                quote = character;
            } else if (character === "/" && (line[index + 1] === "/" || line[index + 1] === "*")) {
                return index;
            }
        }
        return -1;
    }

    // {key, comment} space counts per entry, i.e. the padding gofmt's tabwriter inserts.
    // Only entries that are part of a block get a padding; every other entry is rendered
    // as printed (gofmt leaves single-line and multi-line sections untouched).
    getGoCompositePaddings(parsedEntries) {
        // the sectioning below mirrors go/printer's exprList
        const smallSize = 40;
        const ratio = 2.5;
        const paddings = parsedEntries.map(() => undefined);
        let block = [];
        let previousSize = 0;
        let size = 0;
        let lnSum = 0;
        let count = 0;
        const flushBlock = () => {
            if (block.length === 0) {
                return;
            }
            let keyWidth = 1; // widest key cell of the block + one space of padding
            for (const index of block) {
                keyWidth = Math.max(keyWidth, this.getGoRuneLength(parsedEntries[index].key) + 2);
            }
            for (const index of block) {
                paddings[index] = { 'key': keyWidth - this.getGoRuneLength(parsedEntries[index].key) - 1, 'comment': 1 };
            }
            // the comment column only spans the runs of consecutive commented entries
            let run = [];
            const flushRun = () => {
                if (run.length === 0) {
                    return;
                }
                let runWidth = 1; // widest `value,` cell of the run + one space of padding
                for (const index of run) {
                    runWidth = Math.max(runWidth, this.getGoRuneLength(parsedEntries[index].value) + 2);
                }
                for (const index of run) {
                    paddings[index].comment = runWidth - this.getGoRuneLength(parsedEntries[index].value) - 1;
                }
                run = [];
            };
            for (const index of block) {
                if (parsedEntries[index].comment !== undefined) {
                    run.push(index);
                } else {
                    flushRun();
                }
            }
            flushRun();
            block = [];
        };
        for (let index = 0; index < parsedEntries.length; ++index) {
            const entry = parsedEntries[index];
            previousSize = size;
            size = entry !== undefined ? entry.size : 0;
            let sectionBreak = true; // exprList's useFF
            if (previousSize > 0 && size > 0) {
                if (count === 0 || (previousSize <= smallSize && size <= smallSize)) {
                    sectionBreak = false;
                } else {
                    const geomean = Math.exp(lnSum / count);
                    const sizeRatio = size / geomean;
                    sectionBreak = ratio * sizeRatio <= 1 || ratio <= sizeRatio;
                }
            }
            const alignable = entry !== undefined && entry.singleLine;
            if (index > 0 && sectionBreak) {
                // exprList resets the geometric mean accumulation whenever it starts a
                // new section (a formfeed break is two line breaks, nbreaks > 1), so the
                // ratio below is measured against the current section only
                lnSum = 0;
                count = 0;
            }
            if (!alignable || sectionBreak) {
                flushBlock();
            }
            if (alignable) {
                block.push(index);
            }
            if (size > 0) {
                lnSum += Math.log(size);
                count += 1;
            }
        }
        flushBlock();
        return paddings;
    }

    renderGoCompositeEntry(entry, parsed, padding) {
        if (parsed === undefined || !parsed.singleLine || padding === undefined) {
            return this.appendGoTrailingComma(entry);
        }
        const comment = parsed.comment === undefined ? "" : " ".repeat(padding.comment) + parsed.comment;
        return parsed.indent + parsed.key + ":" + " ".repeat(padding.key) + parsed.value + "," + comment;
    }

    // gofmt prints the comma of an entry before its trailing comment (`value, // comment`),
    // the entry text carries the comment last, so move the comma in front of it
    appendGoTrailingComma(entry) {
        const newlineIndex = entry.lastIndexOf("\n");
        const lastLine = newlineIndex === -1 ? entry : entry.slice(newlineIndex + 1);
        const commentIndex = this.findGoTrailingCommentStart(lastLine);
        if (commentIndex === -1) {
            return entry + ",";
        }
        const offset = entry.length - lastLine.length + commentIndex;
        return entry.slice(0, offset).trimEnd() + ", " + entry.slice(offset).trimEnd();
    }

    // text/tabwriter sizes cells in runes, go/printer's nodeSize counts bytes
    getGoRuneLength(text) {
        return [...text].length;
    }

    getGoByteLength(text) {
        let length = 0;
        for (const character of text) {
            const codePoint = character.codePointAt(0);
            length += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
        }
        return length;
    }

    printConstructorDeclaration (node, identation) {
        const classNode = node.parent;
        const className = this.printNode(classNode.name, 0);
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);

        // find super call inside constructor and extract params
        let superCallParams = '';
        let hasSuperCall = false;
        node.body?.statements.forEach(statement => {
            if (ts.isExpressionStatement(statement)) {
                const expression = statement.expression;
                if (ts.isCallExpression(expression)) {
                    const expressionText = expression.expression.getText().trim();
                    if (expressionText === 'super') {
                        hasSuperCall = true;
                        superCallParams = expression.arguments.map((a) => {
                            return this.printNode(a, identation).trim();
                        }).join(", ");
                    }
                }
            }
        });

        if (hasSuperCall) {
            return this.getIden(identation) + className +
                `(${args}) : ${this.SUPER_CALL_TOKEN}(${superCallParams})` +
                constructorBody;
        }

        return this.getIden(identation) +
                className +
                "(" + args + ")" +
                constructorBody;
    }

    printThisElementAccesssIfNeeded(node, identation) {
        // convert this[method] into this.call(method) or this.callAsync(method)
        // const isAsync = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
        const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        // if the call is async or not, so we need to assume it is async
        // example Promise.all([this.unknownPropAsync()])
        const elementAccess = node.expression;
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            if (elementAccess?.expression?.kind === ts.SyntaxKind.ThisKeyword) {
                let parsedArg = node.arguments?.length > 0 ? this.printNode(node.arguments[0], identation).trimStart() : "";
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                const wrapperOpen = isAsync ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
                const wrapperClose = isAsync ? this.UNKOWN_PROP_ASYNC_WRAPPER_CLOSE : this.UNKOWN_PROP_WRAPPER_CLOSE;
                parsedArg = parsedArg ? ", " + parsedArg : "";
                return wrapperOpen + propName + parsedArg + wrapperClose;
            }
        }
        return;
    }

    printDynamicCall(node, identation) {
        // const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        const elementAccess = node.expression;
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            // the emitted call also carries the property name as its first
            // argument, so a call with arguments is a call with more than one
            // argument and prints them one level deeper
            const argumentDepth = this.goExprDepth + ((node.arguments?.length > 0) ? 1 : 0);
            const parsedArg = node.arguments?.length > 0 ? node.arguments.map(n => this.goWithExprDepth(argumentDepth, () => this.printNode(n, identation).trimStart())).join(", ") : "";
            // const target = this.printNode(elementAccess.expression, 0);
            const propName = this.goWithExprDepth(argumentDepth, () => this.printNode(elementAccess.argumentExpression, 0));
            const argsArray = `${parsedArg}`;
            const open = this.DYNAMIC_CALL_OPEN;
            const statement = `${open}${propName}, ${argsArray})`;
            // statement = isAsync ? `((Task<object>)${statement})` : statement;
            return statement;
        }
        return undefined;
    }


    printElementAccessExpressionExceptionIfAny(node) {
        // Fix malformed Split(...) element access where the index arg is mistakenly placed
        // inside the Split call. We force the correct pattern: GetValue(Split(str, sep), idx)
        const tsKind = ts.SyntaxKind;
        if (node.expression.kind === tsKind.CallExpression) {
            const callExp = node.expression;
            const calleeText = callExp.expression.getText();
            if (calleeText.endsWith('.split') || calleeText.toLowerCase().includes('split')) {
                // print Split call normally (should already close with ))
                let splitCall = this.printNode(callExp, 0).trim();
                if (!splitCall.endsWith(')')) {
                    splitCall += ')';
                }
                const idxArg = this.printNode(node.argumentExpression, 0);
                return `GetValue(${splitCall}, ${idxArg})`;
            }
        }
        // default: no exception
        return undefined;
    }

    printWrappedUnknownThisProperty(node, identation = 0) {
        const type = this.getChecker().getResolvedSignature(node);
        if (type?.declaration === undefined) {
            // the emitted call carries the property name as its first argument; arguments
            // print at the call's level so a multi-line literal keeps its nesting
            const argumentDepth = this.goExprDepth + ((node.arguments?.length > 0) ? 1 : 0);
            let parsedArguments = node.arguments?.map((a) => this.goWithExprDepth(argumentDepth, () => this.printNode(a, identation).trimStart())).join(", ");
            parsedArguments = parsedArguments ? parsedArguments : "";
            const propName = node.expression?.name.escapedText;
            // const isAsyncDecl = true;
            // const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
            // const isAsyncDecl = false;
            // const open = isAsyncDecl ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
            // const close = this.UNKOWN_PROP_WRAPPER_CLOSE;
            // return `${open}"${propName}"${parsedArguments}${close}`;
            const argsArray = `${parsedArguments}`;
            const open = this.DYNAMIC_CALL_OPEN;
            const statement = `${open}"${propName}", ${argsArray})`;
            return statement;
        }
        return undefined;
    }

    transformMethodNameIfNeeded(name: string): string {
        const res = this.unCamelCaseIfNeeded(name);
        return this.capitalize(res);
    }

    transformCallExpressionName(name: string, nameNode = undefined) {
        return this.applyAsyncSuffixToCallee(nameNode, this.capitalize(name));
    }

    transformPropertyAccessExpressionName(name: string, nameNode = undefined) {
        return this.applyAsyncSuffixToCallee(nameNode, this.capitalize(name));
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const args = node.arguments;

            if (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
                const methodName = this.printNode(node.expression.name, 0);
                if (this.wrapThisCalls || (this.wrapCallMethods.includes(methodName))) {
                    let argsParsed = "";
                    if (args.length > 0) {
                        argsParsed = args.map((a) => this.printNode(a, 0)).join(", ");
                        return `<-this.callInternal("${methodName}", ${argsParsed})`;
                    }
                    return `<-this.callInternal("${methodName}")`;
                }
            }

            const expressionText = node.expression.getText().trim();
            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                switch (expressionText) {
                // case "JSON.parse":
                //     return `json_decode(${parsedArg}, $as_associative_array = true)`;
                case "Math.abs":
                    return `mathAbs(${parsedArg})`;
                }
            } else if (args.length === 2)
            {
                const parsedArg1 = this.printNode(args[0], 0);
                const parsedArg2 = this.printNode(args[1], 0);
                switch (expressionText) {
                case "Math.min":
                    return `mathMin(${parsedArg1}, ${parsedArg2})`;
                case "Math.max":
                    return `mathMax(${parsedArg1}, ${parsedArg2})`;
                case "Math.pow":
                    return `MathPow(${parsedArg1}, ${parsedArg2})`;
                }
            }
            const leftSide = node.expression?.expression;
            const leftSideText = leftSide ? this.printNode(leftSide, 0) : undefined;

            // wrap unknown property this.X calls
            if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) { // double check this
                const res = this.printWrappedUnknownThisProperty(node, identation);
                if (res) {
                    return res;
                }
            }
        }

        // // replace this[method]() calls
        // const thisElementAccess = this.printThisElementAccesssIfNeeded(node, identation);
        // if (thisElementAccess) {
        //     return thisElementAccess;
        // }

        // handle dynamic calls, this[method](A) or exchange[b] (c) using reflection
        if (node.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
            return this.printDynamicCall(node, identation);
        }


        return undefined;
    }

    handleTypeOfInsideBinaryExpression(node, identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        switch (right) {
        case "string":
            return notOperator + `IsString(${target})`;
        case "number":
            return notOperator + `IsNumber(${target})`;
        case "boolean":
            return notOperator + `IsBool(${target})`;
        case "object":
            return notOperator + `IsObject(${target})`;
        case "function":
            return notOperator + `IsFunction(${target})`;
        }

        return undefined;

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;

        const op = node.operatorToken.kind;

        // ---------------------------------------------------------------
        // Array destructuring assignment:  [a, b] = foo()
        // Transforms into:
        // __tmpX := foo()
        // a = GetValue(__tmpX, 0)
        // b = GetValue(__tmpX, 1)
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            // const elems = (left.elements as any[]);
            // const returnRandName = "retRes" + this.getLineBasedSuffix(node);
            // const rhs   = this.printNode(right, 0);

            // // build extraction lines
            // const assignments = elems.map((el, idx) => {
            //     const leftName = this.printNode(el, 0);
            //     return `${leftName} = GetValue(${returnRandName}, ${idx})`;
            // }).join(`\n${this.getIden(identation)}`);

            // return `${returnRandName} := ${rhs}\n${this.getIden(identation)}${assignments}`;
            //
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)}\n`;

            parsedArrayBindingElements.forEach((e, index) => {

                const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access assignments:  a[b] = v
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }

            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs      = keys.map(k => this.printNode(k, 0));

            // the container of a nested `m["a"]["b"] = v` write is a plain read of the
            // receiver: a declared map indexes natively and only the `any` steps above
            // it keep the helper (Go refuses to index an `any`)
            const acc = this.goElementWriteChain(baseExpr, containerStr, keys, keyStrs);

            const lastKey = keyStrs[keyStrs.length - 1];
            // the value is printed at the statement's own level so a multi-line object
            // literal (bare, or nested inside a call argument) lands one level deeper with
            // its closing brace at the statement level; the leading indentation is dropped
            const rhs     = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();

            // a single key over a receiver the printer typed itself is plain Go
            // indexing; a nested chain goes through GetValue, which is `any`
            // a native `m[k] = v` is a plain assignment, whose value go/printer prints at
            // the statement's own depth rather than inside the helper's argument list
            const nativeRhs = (right.kind === ts.SyntaxKind.BinaryExpression)
                ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(right, identation)).trimStart()
                : rhs;
            const native = (keyStrs.length === 1)
                ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, nativeRhs)
                : undefined;
            if (native !== undefined) {
                return native;
            }

            return `AddElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access compound assignments:  a[b] += v
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.PlusEqualsToken &&
            left.kind === ts.SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }

            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs      = keys.map(k => this.printNode(k, 0));

            // Build the GetValue(GetValue( ... )) chain for all but the last key; the
            // first step is the same read of a declared map the `=` branch types
            const acc = this.goElementWriteChain(baseExpr, containerStr, keys, keyStrs);

            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);

            // For +=, we need to get the current value, add to it, then set it back
            const currentValue = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${lastKey}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            const native = (keyStrs.length === 1)
                ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, `Add(${containerStr}[${lastKey}], ${rhs})`, true)
                : undefined;
            if (native !== undefined) {
                return native;
            }
            const result = `AddElementToObject(${acc}, ${lastKey}, Add(${currentValue}, ${rhs}))`;
            return result;
        }

        if (left.kind === ts.SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        if (op === ts.SyntaxKind.InKeyword) {
            const dictText = this.printNode(right, 0);
            const keyText = this.printNode(left, 0);
            const inlined = this.printInlineInOp(right, left, dictText, keyText);
            if (inlined !== undefined) {
                return inlined;
            }
            return `InOp(${dictText}, ${keyText})`;
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            // both operands end up in the two-argument helper call below (or in the
            // `Add(x, y)` on the right of the compound assignment), i.e. one level
            // deeper than the expression itself
            const operandDepth = this.goExprDepth + 1;
            const leftText = this.goWithExprDepth(operandDepth, () => this.printNode(left, 0));
            const rightText = this.goWithExprDepth(operandDepth, () => this.printNode(right, 0));

            const nativeAssignment = this.goNativeCompoundAssignment(op, left, leftText, right, rightText);
            if (nativeAssignment !== undefined) {
                return nativeAssignment;
            }

            if (op === ts.SyntaxKind.PlusEqualsToken) {
                return `${leftText} = Add(${leftText}, ${rightText})`;
            }

            if (op === ts.SyntaxKind.MinusEqualsToken) {
                return `${leftText} = Subtract(${leftText}, ${rightText})`;
            }

            const isEquality = (op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken);
            const isDifference = (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken);
            if (isEquality || isDifference) {
                const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
                if (inlined !== undefined) {
                    return inlined;
                }
            }

            if (ORDERED_COMPARISON_OPERATORS[op] !== undefined) {
                const inlined = this.printInlineOrderedComparison(left, right, leftText, rightText, op);
                if (inlined !== undefined) {
                    return inlined;
                }
            }

            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
            const nativeArithmetic = this.goNativeArithmetic(node, leftText, rightText);
            if (nativeArithmetic !== undefined) {
                return nativeArithmetic.text;
            }
            return `${open}${leftText}, ${rightText}${close}`;
        }

        // x = y
        // cast y to x type when y is unknown
        // if (op === ts.SyntaxKind.EqualsToken) {
        //     const leftType = this.getChecker().getTypeAtLocation(left);
        //     const rightType = this.getChecker().getTypeAtLocation(right);

        //     if (this.isAnyType(rightType.flags) && !this.isAnyType(leftType.flags)) {
        //         // const parsedType = this.getTypeFromRawType(leftType);
        //         return `${leftText} = ${rightText}`;
        //     }
        // }

        return undefined;
    }

    // the scalar family the TypeScript type of an operand belongs to: 'string',
    // 'int', 'float', 'bool', 'nil' for the undefined/null literals, or undefined
    // when the type is any/unknown/a union of several families
    goScalarFamily(node): string | undefined {
        // TypeScript narrows `x !== undefined && x === 'v'` to `string`, but the Go
        // local is still the `any` box the declaration printed; when that box holds
        // a *T helper result, `==` against a string is never true in Go
        if (node?.kind === ts.SyntaxKind.Identifier && this.goDeclaredTypeOfIdentifier(node) === undefined) {
            let decl;
            const checker: any = this.checkerOrUndefined();
            if (checker === undefined) {
                decl = undefined;
            }
            decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
            if (this.goAnyLocalHoldsPointer(decl)) {
                return undefined;
            }
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(node);
        return this.goScalarFamilyOfType(type);
    }

    // the scalar family the TypeScript type of an operand belongs to, where a
    // `string | undefined` union still counts as 'string': the Go box holds that
    // scalar or nil, and both `x == nil` and `x == "lit"` are then the same
    // predicate as the helper. Numbers are excluded by the caller.
    goScalarFamilyWithNil(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(node);
        return this.goScalarFamilyOfType(type, true);
    }

    // true when this operand is a *parameter* boxed as `any` whose TypeScript type is an array or
    // object (`Strings`, `Market`, `NullableDict`, `object[]`, `object`): a Go map/slice, never a
    // pointer, so a nil test needs no helper. Locals may box a nil `*sync.Map`, which is not `== nil`.
    goObjectBoxParameter(node): boolean {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        if (checker.getSymbolAtLocation(node)?.valueDeclaration?.kind !== ts.SyntaxKind.Parameter) {
            return false;
        }
        return this.goTypeIsNilComparableObject(checker.getTypeAtLocation(node));
    }

    // an object type whose Go value is a map/slice, or a union of such a type with
    // undefined/null. `any`, functions and class instances are excluded: their Go
    // value may be an identity-bearing pointer
    goTypeIsNilComparableObject(type): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.flags & ts.TypeFlags.Union) {
            let seen = false;
            for (const member of type.types) {
                if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) {
                    continue;
                }
                if (!this.goTypeIsNilComparableObject(member)) {
                    return false;
                }
                seen = true;
            }
            return seen;
        }
        if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive))) {
            return false;
        }
        if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
            return false;
        }
        const declaration = type.symbol?.valueDeclaration ?? type.symbol?.declarations?.[0];
        return declaration?.kind !== ts.SyntaxKind.ClassDeclaration;
    }

    // the callee name of a printed call, e.g. `this.SafeDict(x, 0, {})` → `this.SafeDict`
    goPrintedCallee(printedValue: string): string | undefined {
        let value = printedValue.trim();
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        const open = value.indexOf('(');
        if (open <= 0 || !this.isWholePrintedCall(value, open)) {
            return undefined;
        }
        const callee = value.substring(0, open);
        return /^[A-Za-z_][\w.]*$/.test(callee) ? callee : undefined;
    }

    // true when this expression prints to an interface (`any`) box: a parameter, a
    // local the printer left `any`, or one of the helpers whose Go signature returns
    // `any`. A *T / scalar local or call is not a box and keeps its own rule.
    goIsAnyBoxExpression(node, printedText: string): boolean {
        if (node?.kind === ts.SyntaxKind.Identifier) {
            const checker: any = this.checkerOrUndefined();
            if (checker === undefined) {
                return false;
            }
            const symbol = checker.getSymbolAtLocation(node);
            const decl = symbol?.valueDeclaration;
            const isBinding = (decl?.kind === ts.SyntaxKind.Parameter)
                || (decl?.kind === ts.SyntaxKind.VariableDeclaration);
            if (!isBinding) {
                return false;
            }
            // the printer names a Go type for this local/`:=` initializer, so the
            // value is not behind an interface
            if (this.goDeclaredTypeOfIdentifier(node) !== undefined) {
                return false;
            }
            // an `any` local initialised from a *T helper (`var x any = this.SafeString(…)`)
            // boxes the pointer itself: a nil *string inside `any` is not `== nil` in Go,
            // so only the deref-aware helper compares it correctly
            return !this.goAnyLocalHoldsPointer(decl);
        }
        if (node?.kind === ts.SyntaxKind.CallExpression) {
            if (this.goTypeOfInitializer(node, printedText) !== undefined) {
                return false; // a *T or a scalar the printer can name
            }
            return GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0;
        }
        return false;
    }

    // an element read prints either a native map[string]any index or the
    // GetValue(container, key) helper call — an `any` box in both cases
    goBoxedElementRead(node, printedText: string): boolean {
        while (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (node?.kind !== ts.SyntaxKind.ElementAccessExpression) {
            return false;
        }
        if (GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0) {
            return true; // GetValue(container, key)
        }
        let base = node.expression;
        while (ts.isElementAccessExpression(base)) {
            base = base.expression;
        }
        // the printed base is unknown here: `goIndexableTypeOf` answers on the
        // declared table alone for every shape but a call, which stays a box anyway
        return this.goIndexableTypeOf(base, '') === 'map[string]any';
    }

    // true when an `any`-typed local can hold a *T helper result: its initializer or a
    // later `x = …` write is a `this.safeX(…)` call whose Go signature returns a pointer
    goAnyLocalHoldsPointerCache = new Map<any, boolean>();
    goAnyLocalHoldsPointer(decl): boolean {
        if (decl?.kind !== ts.SyntaxKind.VariableDeclaration || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (this.goAnyLocalHoldsPointerCache.has(decl)) {
            return this.goAnyLocalHoldsPointerCache.get(decl);
        }
        // the callee is read from the AST, never printed: printing an operand would
        // re-enter the equality classifier that asks this question
        const isPointerInit = (expr): boolean => {
            while (expr?.kind === ts.SyntaxKind.ParenthesizedExpression) {
                expr = expr.expression;
            }
            if (expr?.kind !== ts.SyntaxKind.CallExpression) {
                return false;
            }
            const callee = expr.expression;
            if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
                return false;
            }
            const name = callee.name?.escapedText;
            if (typeof name !== 'string' || name.length === 0) {
                return false;
            }
            const goType = GO_HELPER_RETURN_TYPES['this.' + name.charAt(0).toUpperCase() + name.substring(1)];
            return (typeof goType === 'string') && goType.startsWith('*');
        };
        let holds = isPointerInit(decl.initializer);
        if (!holds) {
            const name = decl.name.escapedText;
            const scope = this.goEnclosingFunction(decl);
            const visit = (n) => {
                if (holds) { return; }
                if (n.kind === ts.SyntaxKind.BinaryExpression && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
                    && n.left?.kind === ts.SyntaxKind.Identifier && n.left.escapedText === name && isPointerInit(n.right)) {
                    holds = true;
                    return;
                }
                ts.forEachChild(n, visit);
            };
            if (scope !== undefined) {
                ts.forEachChild(scope, visit);
            }
        }
        this.goAnyLocalHoldsPointerCache.set(decl, holds);
        return holds;
    }

    // the callee name of a call, read from the AST and capitalised the way the
    // printer names Go functions (`this.parseJson` -> `this.ParseJson`). Printing the
    // callee would re-enter the equality classifier that asks this question.
    goAstCalleeName(call): string | undefined {
        const callee = call?.expression;
        if (callee?.kind === ts.SyntaxKind.Identifier) {
            const name = callee.escapedText;
            return (typeof name === 'string' && name.length > 0) ? name.charAt(0).toUpperCase() + name.substring(1) : undefined;
        }
        if (callee?.kind === ts.SyntaxKind.PropertyAccessExpression && callee.expression?.kind === ts.SyntaxKind.ThisKeyword) {
            const name = callee.name?.escapedText;
            return (typeof name === 'string' && name.length > 0) ? 'this.' + name.charAt(0).toUpperCase() + name.substring(1) : undefined;
        }
        return undefined;
    }

    // true when every declaration of the awaited callee is a bodyless method signature:
    // TS never implements it, the endpoint generator does, and the Go body is the
    // `<-chan any` wrapper over callEndpointAsync (decoded JSON / "panic: " / nil)
    goAwaitedCallIsImplicitEndpoint(expression): boolean {
        let call = expression;
        while (call?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            call = call.expression;
        }
        if (call?.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        const callee = call.expression;
        if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
            return false;
        }
        const nameNode = callee.name;
        if (nameNode?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(nameNode);
        const declarations = symbol?.declarations;
        if (!declarations || declarations.length === 0) {
            return false;
        }
        return declarations.every((d) => (d.kind === ts.SyntaxKind.MethodSignature)
            && (d.body === undefined)
            && (d.parent?.kind === ts.SyntaxKind.InterfaceDeclaration));
    }

    // true when the printed value of this expression is never a *T whose nil
    // derefScalar folds to nil (nor a *sync.Map): null/undefined, an object/array
    // literal, an endpoint await or a JSON decode. Everything else stays unproven.
    goIsNonPointerValueSource(expr): boolean {
        while (expr?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            expr = expr.expression;
        }
        if (expr === undefined) {
            return true; // `var x any` never written holds nil
        }
        switch (expr.kind) {
        case ts.SyntaxKind.NullKeyword:
            return true;
        case ts.SyntaxKind.Identifier:
            return expr.escapedText === 'undefined';
        case ts.SyntaxKind.ObjectLiteralExpression:
        case ts.SyntaxKind.ArrayLiteralExpression:
            return true;
        case ts.SyntaxKind.AwaitExpression:
            return this.goAwaitedCallIsImplicitEndpoint(expr.expression);
        case ts.SyntaxKind.CallExpression: {
            const name = this.goAstCalleeName(expr);
            if (name === undefined) {
                return false;
            }
            return GO_JSON_PARSE_CALLS.indexOf(name.replace(/^this\./, '')) >= 0;
        }
        }
        return false;
    }

    // true when every value written into an `any` local is a non-pointer source: the
    // box holds a container, a scalar or nil, so IsEqual(x, nil) is exactly `x == nil`.
    // A write of any other shape in the enclosing function (D2 scan) keeps the helper
    goAnyLocalHoldsNonPointerCache = new Map<any, boolean>();
    goAnyLocalHoldsNonPointer(decl): boolean {
        if (decl?.kind !== ts.SyntaxKind.VariableDeclaration || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (this.goAnyLocalHoldsNonPointerCache.has(decl)) {
            return this.goAnyLocalHoldsNonPointerCache.get(decl);
        }
        let holds = !this.goAnyLocalHoldsPointer(decl) && this.goIsNonPointerValueSource(decl.initializer);
        if (holds) {
            const name = decl.name.escapedText;
            const scope = this.goEnclosingFunction(decl);
            if (scope === undefined) {
                holds = false;
            } else {
                const visit = (n) => {
                    if (!holds) { return; }
                    // `[ a, b ] = …` writes a and b through GetValue(<tuple>, i), so its
                    // source is the right-hand side as well
                    if (n.kind === ts.SyntaxKind.BinaryExpression && n.operatorToken?.kind === ts.SyntaxKind.EqualsToken
                        && this.goAssignmentWritesName(n.left, name)
                        && !this.goIsNonPointerValueSource(n.right)) {
                        holds = false;
                        return;
                    }
                    ts.forEachChild(n, visit);
                };
                ts.forEachChild(scope, visit);
            }
        }
        this.goAnyLocalHoldsNonPointerCache.set(decl, holds);
        return holds;
    }

    // true when this assignment target binds the named local: a plain identifier, or a
    // destructuring element (`[ a, b ] = …` prints GetValue(<tuple>, i) writes)
    goAssignmentWritesName(left, name): boolean {
        if (left?.kind === ts.SyntaxKind.Identifier) {
            return left.escapedText === name;
        }
        if (left?.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            return left.elements.some((e) => (e?.kind === ts.SyntaxKind.Identifier) && (e.escapedText === name));
        }
        return false;
    }

    // the variable declaration an identifier resolves to, when it is one
    goAnyBoxLocalDeclaration(node): any {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        return symbol?.valueDeclaration;
    }

    // true when this identifier is a parameter bound by `x := GetArg(optionalArgs, i, default)`:
    // GetArg runs derefScalar and folds a typed nil pointer (and nil []string/[]any) into the untyped
    // default, so the box holds a plain scalar or an untyped nil, never a nil *T.
    goGetArgBoundParameter(node): boolean {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration;
        // a parameter without a default keeps the caller's value as-is in a plain `any`
        // parameter, where a *int64 handed over by another method stays a pointer
        if (decl?.kind !== ts.SyntaxKind.Parameter || decl.initializer === undefined) {
            return false;
        }
        // only a method/function body binds its defaulted parameters with GetArg: an arrow
        // function's printed parameters carry no default binding at all
        const owner = decl.parent?.kind;
        if (owner !== ts.SyntaxKind.MethodDeclaration && owner !== ts.SyntaxKind.FunctionDeclaration
            && owner !== ts.SyntaxKind.Constructor) {
            return false;
        }
        return !this.goParameterLaterWritesPointerBox(decl);
    }

    // D2 for a GetArg-bound parameter: a later `x = …` write whose printed value is a typed
    // pointer puts a nil *T back in the box, where IsEqual(x, nil) is true but `x == nil` is not
    goParameterLaterWritesPointerBox(decl): boolean {
        const name = (decl?.name?.kind === ts.SyntaxKind.Identifier) ? decl.name.escapedText : undefined;
        if (typeof name !== 'string') {
            return true; // a binding pattern: the write scan cannot follow it
        }
        const scope = this.goEnclosingFunction(decl);
        if (scope === undefined) {
            return true;
        }
        let pointerWrite = false;
        const visit = (n) => {
            if (pointerWrite) {
                return;
            }
            if (n.kind === ts.SyntaxKind.BinaryExpression && n.operatorToken?.kind === ts.SyntaxKind.EqualsToken
                && this.goAssignmentWritesName(n.left, name) && this.goWritePrintsPointerBox(n.right)) {
                pointerWrite = true;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return pointerWrite;
    }

    // true when the printed value of an assignment's right-hand side is a typed pointer: a
    // `this.safeX(…)`/`this.Parse8601(…)` accessor (GO_HELPER_RETURN_TYPES), an identifier the
    // printer declared `*T`, or a hand-written *sync.Map field. Read from the AST, never printed.
    goWritePrintsPointerBox(expr): boolean {
        while (expr?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            expr = expr.expression;
        }
        if (expr === undefined) {
            return false;
        }
        if (expr.kind === ts.SyntaxKind.CallExpression) {
            const name = this.goAstCalleeName(expr);
            if (typeof name === 'string') {
                const goType = GO_HELPER_RETURN_TYPES[name];
                if ((typeof goType === 'string') && goType.startsWith('*')) {
                    return true;
                }
                // the accessors the ccxt build pass wraps with DerefScalar but the Go type
                // table does not name (`this.NumberToString`, `this.Parse8601`, `this.Iso8601`)
                // return a pointer too, so their write stays unproven
                return GO_DEREF_WRAPPED_CALLS.indexOf(name.replace(/^this\./, '')) >= 0;
            }
            return false;
        }
        if (expr.kind === ts.SyntaxKind.Identifier) {
            const declared = this.goDeclaredTypeOfIdentifier(expr);
            return (typeof declared === 'string') && declared.startsWith('*');
        }
        if (expr.kind === ts.SyntaxKind.PropertyAccessExpression && expr.expression?.kind === ts.SyntaxKind.ThisKeyword) {
            const fieldType = GO_NILABLE_FIELDS_Typed['this.' + expr.name?.escapedText];
            return (typeof fieldType === 'string') && GO_NIL_EQUIVALENT_POINTER_TYPES_Native.has(fieldType);
        }
        return false;
    }

    goScalarFamilyOfType(type, allowNil = false): string | undefined {
        if (type === undefined) {
            return undefined;
        }
        // Str/Int/Num/Bool are nullable aliases of `string | undefined` & friends;
        // their Go representation is still `any`, so they never inline — unless the
        // caller is asking about the value the `any` box holds (allowNil)
        const alias = type.aliasSymbol?.escapedName;
        if (!allowNil) {
            switch (alias) {
            case 'Str':
            case 'Int':
            case 'Num':
            case 'Bool':
                return undefined;
            }
        }
        const flags = type.flags;
        if (flags & ts.TypeFlags.Union) {
            const families = new Set<string>();
            for (const member of type.types) {
                const family = this.goScalarFamilyOfType(member, allowNil);
                if (family === undefined) {
                    return undefined;
                }
                // `string | undefined` is `any` in Go, never a bare Go string:
                // one nullable member disqualifies the whole union
                if (family === 'nil') {
                    if (allowNil) {
                        continue; // the box holds nil for that member
                    }
                    return undefined;
                }
                families.add(family);
            }
            if (families.size !== 1) {
                return undefined; // `boolean` is `true | false`, so size === 1
            }
            return families.values().next().value;
        }
        if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
            return 'string';
        }
        if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
            return 'number';
        }
        if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
            return 'bool';
        }
        if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) {
            return 'nil';
        }
        return undefined;
    }

    // B-02: a parameter of a nullable ccxt alias (`Str`) prints as the native Go type (`*string`) only
    // when the method is internal (not async/override, no inherited member), every call site passes
    // that type (checker here, textual for siblings), and the body never writes another type (D2).
    goNativeParameterTypeCache = new Map<any, string | undefined>();
    goSameFileCallCache = new Map<any, Map<string, Array<any>>>();
    goTsSrcTreeCache = new Map<string, any>();

    goNativeParameterType(param): string | undefined {
        if (param?.kind !== ts.SyntaxKind.Parameter) {
            return undefined;
        }
        if (this.goNativeParameterTypeCache.has(param)) {
            return this.goNativeParameterTypeCache.get(param);
        }
        // the call-site proof prints argument expressions, which can land back here
        this.goNativeParameterTypeCache.set(param, undefined);
        const result = this.goNativeParameterTypeOf(param);
        this.goNativeParameterTypeCache.set(param, result);
        return result;
    }

    goNativeParameterTypeOf(param): string | undefined {
        if ((param.initializer !== undefined) || (param.dotDotDotToken !== undefined)) {
            return undefined; // optional/variadic parameters keep the optionalArgs ABI
        }
        if (param.name?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const fn: any = param.parent;
        if ((fn?.kind !== ts.SyntaxKind.MethodDeclaration) || (fn.body === undefined) || (fn.name?.kind !== ts.SyntaxKind.Identifier)) {
            return undefined;
        }
        const parseParam = fn.name.escapedText.startsWith('parse');
        // D-03: a pro handler's frame parameter (`handleX (client: Client, message: Dict)`)
        // is the second family whose call-site proof can name a Go type
        const handlerParam = !parseParam && this.goIsProHandlerMethod(fn);
        if (!parseParam && !handlerParam) {
            return undefined; // internal parseX helpers and pro handlers only: the unified API is public surface
        }
        if (this.isAsyncFunction(fn) || this.goMethodKeepsBaseSignature(fn)) {
            return undefined;
        }
        const index = fn.parameters.indexOf(param);
        for (const goType of this.goNativeParameterTypeCandidates(param, handlerParam)) {
            if (this.goParameterCallSitesPassType(fn, index, goType)
                && this.goLocalIsSafeToType(fn.body, param, param.name.escapedText, goType)
                && this.goParameterKeepsNilCompareNative(fn.body, param, goType)) {
                return goType;
            }
        }
        return undefined;
    }

    // The boxed object parameter prints `x === undefined` as a native `x == nil`
    // (goObjectBoxParameter); a parameter the printer typed as a Go map/slice would fall
    // through to IsEqual(x, nil) instead. Both predicates answer false for every value a
    goParameterKeepsNilCompareNative(body, param, goType: string): boolean {
        if (goType === '*string') {
            return true;
        }
        const name = param.name.escapedText;
        let keeps = true;
        const visit = (n) => {
            if (!keeps) {
                return;
            }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name)) {
                let symbol;
                try {
                    symbol = this.getChecker().getSymbolAtLocation(n);
                } catch (e) {
                    symbol = undefined;
                }
                const binary: any = n.parent;
                if ((symbol?.valueDeclaration === param) && (binary?.kind === ts.SyntaxKind.BinaryExpression)
                    && ((binary.left === n) || (binary.right === n))) {
                    const op = binary.operatorToken?.kind;
                    if ((op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken)
                        || (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
                        const other: any = (binary.left === n) ? binary.right : binary.left;
                        if ((other?.kind === ts.SyntaxKind.NullKeyword)
                            || ((other?.kind === ts.SyntaxKind.Identifier) && (other.escapedText === 'undefined'))) {
                            keeps = false;
                            return;
                        }
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(body, visit);
        return keeps;
    }

    // ---- D-03: pro handler frame parameters ------------------------------------
    // A `handle*` method of a pro exchange class receives the raw frame from the WS
    // client. When the checker types that parameter as `Dict`, and every call site
    goIsProHandlerMethod(fn): boolean {
        // the main-thread transpile registers the file relative to the repo root
        // (ts/src/pro/<x>.ts) while the batch registers it absolute, so accept both
        const fileName = String(fn.getSourceFile().fileName ?? '');
        if (!(/(^|[\\/])ts[\\/]src[\\/]pro[\\/]/.test(fileName))) {
            return false;
        }
        const name = fn.name.escapedText;
        return (name.length > 6) && name.startsWith('handle') && (name[6] === name[6].toUpperCase());
    }

    // `Dict` is the checker's structural `{[key: string]: any}`: a string index
    // signature is the proof. Class instances (OrderBook, ArrayCache*, Client, Future),
    // named-member interfaces (Market, Order, Ticker) and arrays carry none of them, so
    goParameterTypeIsDict(type): boolean {
        try {
            return (typeof type.getStringIndexType === 'function') && (type.getStringIndexType() !== undefined);
        } catch (e) {
            return false;
        }
    }

    // the Go types the declared TypeScript type can carry. `Dict`/`Market`/`Currency`
    // and the other dict-shaped object types print as the `map[string]any` the Go side
    // builds them from, `List` (= any[]) as its `[]any`; pro `handle*` frames (isHandler)
    goNativeParameterTypeCandidates(param, isHandler = false): string[] {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return [];
        }
        const type = checker.getTypeAtLocation(param);
        if (type === undefined) {
            return [];
        }
        let parts = ((typeof type.isUnion === 'function') && type.isUnion()) ? type.types.slice() : [type];
        parts = parts.filter(p => !(p.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
        if (parts.length !== 1) {
            return [];
        }
        const inner: any = parts[0];
        if (inner.flags & ts.TypeFlags.String) {
            return isHandler ? [] : ['*string'];
        }
        if (isHandler && this.goParameterTypeIsDict(inner)) {
            return ['map[string]any'];
        }
        if (!(inner.flags & ts.TypeFlags.Object)) {
            return [];
        }
        if (checker.isArrayType(inner)) {
            // List / any[]: the element must itself be `any`, or the Go slice would need
            // the narrower element type (`string[]` is a []string the printer does not build)
            const element = checker.getIndexTypeOfType(inner, ts.IndexKind.Number);
            if ((element !== undefined) && (element.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))) {
                return ['[]any'];
            }
            return [];
        }
        // Dict / Market / Currency / a structure interface: a plain Go dictionary, never a
        // class instance or a function (goTypeIsNilComparableObject is the printer's own
        // test for exactly those types, used for the boxed nil test above)
        if (this.goTypeIsNilComparableObject(inner)) {
            return ['map[string]any'];
        }
        return [];
    }

    // true when the method overrides (or shadows) a member of the class it extends, or carries an
    // explicit `override`: those print the base signature so the generated base classes and
    // IDerivedExchange keep compiling. The abstract base (ts/src/base/**) is never retyped.
    goMethodKeepsBaseSignature(fn): boolean {
        if ((fn.modifiers ?? []).some(m => m.kind === ts.SyntaxKind.OverrideKeyword)) {
            return true;
        }
        if (/(^|\/)ts\/src\/base\//.test(fn.getSourceFile().fileName)) {
            return true;
        }
        const name = fn.name.escapedText;
        let cls = fn.parent;
        while ((cls !== undefined) && (cls.kind !== ts.SyntaxKind.ClassDeclaration) && (cls.kind !== ts.SyntaxKind.ClassExpression)) {
            cls = cls.parent;
        }
        if (cls === undefined) {
            return true;
        }
        const clauses = cls.heritageClauses ?? [];
        if (!clauses.some(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)) {
            return true; // a root class: the abstract base of the generated tree
        }
        for (const clause of clauses) {
            if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
                continue;
            }
            for (const expr of (clause.types ?? [])) {
                let baseType;
                const checker: any = this.checkerOrUndefined();
                if (checker === undefined) {
                    baseType = undefined;
                }
                baseType = checker.getTypeAtLocation(expr);
                if (baseType?.getProperty?.(name) !== undefined) {
                    return true;
                }
            }
        }
        return false;
    }

    // every call site of `fn` in the whole tree must pass exactly `goType` at `index`
    goParameterCallSitesPassType(fn, index: number, goType: string): boolean {
        const name = fn.name.escapedText;
        for (const call of this.goSameFileCallsOf(fn, name)) {
            const arg = call.arguments?.[index];
            if ((arg === undefined) || (arg.kind === ts.SyntaxKind.SpreadElement)) {
                return false;
            }
            if (this.goPrintedArgType(arg) !== goType) {
                return false;
            }
        }
        const tree = this.goTsSrcTree(fn.getSourceFile());
        if (tree !== undefined) {
            const myClass = this.goEnclosingClassName(fn);
            const myFile = tree.relativeOf.get(fn.getSourceFile().fileName);
            for (const site of (tree.callIndex.get(name) ?? [])) {
                if (site.file === myFile) {
                    continue; // proven above off the checker
                }
                if (!this.goTsSrcFileDerivesFrom(tree, site.file, myClass)) {
                    continue; // a same-named method of another exchange
                }
                const arg = site.args[index];
                if ((arg === undefined) || !this.goTextArgMatchesType(arg, goType, site.file, tree)) {
                    return false;
                }
            }
        }
        return true;
    }

    goEnclosingClassName(fn): string | undefined {
        let cls = fn.parent;
        while ((cls !== undefined) && (cls.kind !== ts.SyntaxKind.ClassDeclaration) && (cls.kind !== ts.SyntaxKind.ClassExpression)) {
            cls = cls.parent;
        }
        return (cls?.name?.kind === ts.SyntaxKind.Identifier) ? cls.name.escapedText : undefined;
    }

    // the printed Go type of a call-site argument, or undefined when the printer
    // cannot name it (then the call site does not prove anything)
    goPrintedArgType(arg): string | undefined {
        if (arg.kind === ts.SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(arg);
        }
        return this.goTypeOfInitializer(arg, this.printNode(arg, 0));
    }

    // every `this.<name>(...)` of this file whose resolved signature is `fn`
    goSameFileCallsOf(fn, name: string): Array<any> {
        const file = fn.getSourceFile();
        let index = this.goSameFileCallCache.get(file);
        if (index === undefined) {
            index = new Map<string, Array<any>>();
            const visit = (node) => {
                if (node.kind === ts.SyntaxKind.CallExpression) {
                    const callee: any = node.expression;
                    const calleeName = (callee?.kind === ts.SyntaxKind.PropertyAccessExpression) ? callee.name?.escapedText : undefined;
                    if (typeof calleeName === 'string') {
                        const list = index.get(calleeName) ?? [];
                        list.push(node);
                        index.set(calleeName, list);
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(file);
            this.goSameFileCallCache.set(file, index);
        }
        const checker = this.getChecker();
        const result = [];
        for (const call of (index.get(name) ?? [])) {
            let declaration;
            try {
                declaration = checker.getResolvedSignature(call)?.declaration;
            } catch (e) {
                declaration = undefined;
            }
            if (declaration === fn) {
                result.push(call);
            }
        }
        return result;
    }

    // Lazily read the ts/src tree this file belongs to: the call sites of every
    // `this.x(...)`, each file's text and its class -> base map. A scoped run's
    // program holds one exchange, so the sibling files are only provable textually.
    goTsSrcTree(file): any {
        const fileName: string = file.fileName;
        const marker = '/ts/src/';
        const at = fileName.lastIndexOf(marker);
        if (at < 0) {
            return undefined; // in-memory source (tests): no sibling files to prove
        }
        const root = fileName.substring(0, at + marker.length - 1);
        if (!this.goTsSrcTreeCache.has(root)) {
            this.goTsSrcTreeCache.set(root, this.goTsSrcTreeBuild(root));
        }
        return this.goTsSrcTreeCache.get(root);
    }

    goTsSrcTreeBuild(root: string) {
        const callIndex = new Map<string, Array<any>>();
        const fileText = new Map<string, string>();
        const classBases = new Map<string, string>();
        const relativeOf = new Map<string, string>();
        const walk = (dir: string, rel: string) => {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch (e) {
                return;
            }
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules') {
                        walk(path.join(dir, entry.name), rel + entry.name + '/');
                    }
                    continue;
                }
                if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) {
                    continue;
                }
                const relPath = rel + entry.name;
                let text;
                try {
                    text = fs.readFileSync(path.join(dir, entry.name), 'utf8');
                } catch (e) {
                    continue;
                }
                fileText.set(relPath, text);
                relativeOf.set(path.join(dir, entry.name), relPath);
                const classRe = /\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$]*)/g;
                let match;
                while ((match = classRe.exec(text)) !== null) {
                    classBases.set(match[1], match[2]);
                }
                const callRe = /this\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
                while ((match = callRe.exec(text)) !== null) {
                    const args = goBalancedCallArgs(text, callRe.lastIndex - 1);
                    if (args === undefined) {
                        continue;
                    }
                    const list = callIndex.get(match[1]) ?? [];
                    list.push({ file: relPath, args });
                    callIndex.set(match[1], list);
                }
            }
        };
        walk(root, '');
        return { callIndex, fileText, classBases, relativeOf };
    }

    goTsSrcFileDerivesFrom(tree, file: string, className: string | undefined): boolean {
        if (className === undefined) {
            return true; // unknown owner: keep the reference inside the proof
        }
        const text = tree.fileText.get(file);
        if (text === undefined) {
            return true;
        }
        const classRe = /\bclass\s+([A-Za-z_$][\w$]*)/g;
        let match;
        while ((match = classRe.exec(text)) !== null) {
            let current: string | undefined = match[1];
            for (let hops = 0; (hops < 12) && (current !== undefined); hops++) {
                if (current === className) {
                    return true;
                }
                current = tree.classBases.get(current);
            }
        }
        return false;
    }

    // the textual call-site proof. `*string` is the only pointer-shaped native type
    // with siblings the printer can name from text; a map/slice parameter is proven for
    // the argument shapes whose printed Go form IS that type: the object/array literals
    goTextArgMatchesType(argText: string, goType: string, file: string, tree): boolean {
        let text = (argText ?? '').trim();
        while (text.startsWith('(') && text.endsWith(')')) {
            text = text.substring(1, text.length - 1).trim();
        }
        const isStringProducer = (candidate: string) => GO_TS_SRC_STRING_PRODUCERS.some(rx => rx.test(candidate));
        const localDeclaredFrom = (name: string, accept: (init: string) => boolean) => {
            const fileText = tree.fileText.get(file) ?? '';
            const declRe = new RegExp('(?:const|let|var)\\s+' + name + '\\s*(?::[^=]*)?=\\s*([^;\\n]+)');
            const match = declRe.exec(fileText);
            return (match !== null) && accept(match[1].trim());
        };
        if (goType === '*string') {
            if (isStringProducer(text)) {
                return true;
            }
            const identifier = /^([A-Za-z_$][\w$]*)$/.exec(text);
            if (identifier !== null) {
                return localDeclaredFrom(identifier[1], isStringProducer);
            }
        }
        if ((goType === 'map[string]any') || (goType === '[]any')) {
            // Only the argument shapes whose printed Go form IS this map/slice: the
            // matching literal and the printer's own map producers. An identifier is
            // deliberately not proven here: this proof reads one file's text, so it
            const isMap = goType === 'map[string]any';
            const literal = isMap ? '{' : '[';
            const producers = isMap ? GO_TS_SRC_MAP_PRODUCERS : [];
            return text.startsWith(literal) || producers.some(rx => rx.test(text));
        }
        return false;
    }

    // the Go type this identifier is actually *declared* with, or undefined when it
    // stays `any`. It goes through getGoLocalType, not goTypeOfInitializer, so a
    // declaration the reject filters demoted back to `any` is reported as `any` here
    // too — otherwise we would emit `*x` against an `any` box.
    // A parameter resolves to its declared Go type only when goNativeParameterType
    // proved it (see the B-02 block above); everything else stays `any`.
    //
    // getGoLocalType re-prints every reassignment's right-hand side, and printing a
    // ternary re-enters printCondition, which lands back here: `x = (x === 'a') ? …`
    // would recurse forever. The in-progress set breaks that cycle by answering
    // `any` for the declaration currently being classified, and the cache keeps the
    // per-occurrence cost at one scope scan per declaration.
    goDeclaredTypeCache = new Map<any, string | undefined>();
    goDeclaredTypeInProgress = new Set<any>();

    goDeclaredTypeOfIdentifier(node): string | undefined {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration;
        if (decl === undefined) {
            return undefined;
        }
        if (decl.kind === ts.SyntaxKind.Parameter) {
            // B-02: a parameter the call-site proof typed prints its native Go type
            return this.goNativeParameterType(decl);
        }
        if (decl.kind !== ts.SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        if (decl.initializer === undefined || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        if (this.goDeclaredTypeCache.has(decl)) {
            return this.goDeclaredTypeCache.get(decl);
        }
        if (this.goDeclaredTypeInProgress.has(decl)) {
            return undefined;
        }
        this.goDeclaredTypeInProgress.add(decl);
        let goType;
        try {
            goType = this.getGoLocalType(decl, this.printNode(decl.initializer, 0));
        } finally {
            this.goDeclaredTypeInProgress.delete(decl);
        }
        const result = (goType === 'any') ? undefined : goType;
        this.goDeclaredTypeCache.set(decl, result);
        return result;
    }

    // true when this identifier's Go type is a pointer we can deref (*string / *int64 / …)
    goIsPointerIdentifier(node): boolean {
        const goType = this.goDeclaredTypeOfIdentifier(node);
        return (typeof goType === 'string') && goType.startsWith('*');
    }

    // the Go pointer type an *expression* evaluates to, or undefined. Covers both a
    // local declared `var x *string = …` and a direct `this.SafeString(...)` call,
    // whose Go signature returns a pointer even though TypeScript says `string`.
    goPointerTypeOfExpression(node, printedText: string): string | undefined {
        const declared = this.goDeclaredTypeOfIdentifier(node);
        if ((typeof declared === 'string') && declared.startsWith('*')) {
            return declared;
        }
        // a hand-written BaseExchange field, e.g. `this.Markets`: its Go type is the one
        // go/v4/exchange.go declares, and the helpers turn a nil one into a nil
        if (node?.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const fieldType = GO_NILABLE_FIELDS_Typed[printedText];
            if ((typeof fieldType === 'string') && GO_NIL_EQUIVALENT_POINTER_TYPES_Native.has(fieldType)) {
                return fieldType;
            }
        }
        if (node?.kind === ts.SyntaxKind.CallExpression) {
            const goType = this.goTypeOfInitializer(node, printedText);
            if ((typeof goType === 'string') && goType.startsWith('*')) {
                return goType;
            }
        }
        return undefined;
    }

    // the concrete Go type a `x[k] = v` receiver is declared with, when the printer
    // can name it: a local it typed itself, or a whole call whose Go return type it
    // knows. Everything else is an `any` box, and indexing an `any` in Go needs a
    // type assertion, so those keep the runtime helper.
    goElementAssignmentContainerType(node, printedText: string): string | undefined {
        const declared = this.goDeclaredTypeOfIdentifier(node);
        if ((declared === 'map[string]any') || (declared === '[]any')) {
            return declared;
        }
        if (node?.kind === ts.SyntaxKind.CallExpression) {
            const known = this.goTypeOfInitializer(node, printedText);
            if ((known === 'map[string]any') || (known === '[]any')) {
                return known;
            }
        }
        return undefined;
    }

    // the Go container type of a hand-written `this.<field>` receiver, undefined for every other
    // shape. Generated structs embed BaseExchange, so `this.<field>` is the only property access the
    // field table types — a local or parameter of the same name is a different declaration.
    goFieldContainerTypeNative(node): string | undefined {
        if ((node?.kind !== ts.SyntaxKind.PropertyAccessExpression) || (node.expression?.kind !== ts.SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = node.name?.escapedText;
        if (typeof name !== 'string') {
            return undefined;
        }
        return GO_FIELD_CONTAINER_TYPES_NATIVE[this.transformPropertyAccessExpressionName(name, node.name)];
    }

    // the printed key is a Go string when the printer knows it: a string literal, or
    // an identifier declared `string`. Params, GetValue(...) and string concatenation
    // all print as `any`, which Go refuses as a map key.
    goIsStringKeyExpression(node): boolean {
        if ((node.kind === ts.SyntaxKind.StringLiteral) || (node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral)) {
            return true;
        }
        return this.goDeclaredTypeOfIdentifier(node) === 'string';
    }

    // `[]any` receivers only inline when the index is a literal the slice's own
    // literal initializer covers and nothing rebinds the local: the helper silently
    // ignores an out-of-range index, while Go panics on the assignment.
    goSliceIndexProvablyInRange(node, indexNode): boolean {
        if ((node?.kind !== ts.SyntaxKind.Identifier) || (indexNode?.kind !== ts.SyntaxKind.NumericLiteral)) {
            return false;
        }
        const index = Number(indexNode.text);
        if (!Number.isInteger(index) || (index < 0)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration;
        if (decl === undefined || decl.kind !== ts.SyntaxKind.VariableDeclaration || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const initializer = decl.initializer;
        if (initializer?.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
            return false;
        }
        if (initializer.elements.length <= index) {
            return false;
        }
        return !this.goLocalIsRebound(this.goEnclosingFunction(decl), decl.name);
    }

    // true when the local is rebound anywhere in its function; an element write
    // (`x[k] = v`) leaves the local itself bound, so only the slice header is at stake
    goLocalIsRebound(scope, nameNode): boolean {
        if (scope === undefined) {
            return true;
        }
        const name = nameNode.escapedText;
        let rebound = false;
        const visit = (n) => {
            if (rebound) {
                return;
            }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name) && (n !== nameNode)) {
                if (this.goRebindingTargetOf(n) !== undefined) {
                    rebound = true;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(scope);
        return rebound;
    }

    // walks up from the identifier to the assignment it targets: `x = …` / `x += …` /
    // `[x, y] = …` / `for (x of …)` rebind the local, `x[k] = v` does not
    goRebindingTargetOf(identifier) {
        let node: any = identifier;
        let parent = node.parent;
        while (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            node = parent;
            parent = parent.parent;
        }
        if ((parent?.kind === ts.SyntaxKind.ForOfStatement) && (parent.initializer === node)) {
            return parent;
        }
        if ((parent?.kind === ts.SyntaxKind.BinaryExpression) && (parent.left === node)) {
            const op = parent.operatorToken.kind;
            if ((op === ts.SyntaxKind.EqualsToken) || ((op >= ts.SyntaxKind.FirstCompoundAssignment) && (op <= ts.SyntaxKind.LastCompoundAssignment))) {
                return parent;
            }
        }
        return undefined;
    }

    // native `container[key] = value` when the receiver's Go type is proved by the
    // printer, otherwise undefined and the caller keeps the runtime helper
    printNativeElementAssignment(containerNode, containerStr: string, keyNode, keyStr: string, valueStr: string, compound = false): string | undefined {
        const containerType = this.goElementAssignmentContainerType(containerNode, containerStr);
        const fieldType = this.goFieldContainerTypeNative(containerNode);
        if (fieldType !== undefined) {
            if (!this.goIsStringKeyExpression(keyNode)) {
                return undefined;
            }
            if (fieldType === '*sync.Map') {
                // a `+=` reads the element back through `container[key]`, which a
                // sync.Map has no operator for: that shape keeps the runtime helper
                return compound ? undefined : `${containerStr}.Store(${keyStr}, ${valueStr})`;
            }
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        if (containerType === 'map[string]any') {
            if (!this.goIsStringKeyExpression(keyNode)) {
                return undefined;
            }
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        if (containerType === '[]any') {
            if (!this.goSliceIndexProvablyInRange(containerNode, keyNode)) {
                return undefined;
            }
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        return undefined;
    }

    // the concrete Go type an *expression* is printed as: a local's declared type,
    // the return type of a runtime helper call, or a literal. undefined when the value
    // stays inside an `any` box — a native Go operation on an `any` box would not
    // compile, so every rule below falls back to its helper in that case.
    goPrintedTypeOfExpression(node, printedText: string): string | undefined {
        const inner = (node?.kind === ts.SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        if (inner?.kind === ts.SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(inner);
        }
        return this.goTypeOfInitializer(inner, printedText);
    }

    // `x.length` on a value the printer declares as a slice is `len(x)`: Go's len is
    // 0 for a nil slice, exactly like GetArrayLength's `[]T` cases. On a map or an
    // `any` box GetArrayLength answers 0, so only a `[]`-typed value may inline —
    // and only for the slice types the helper itself counts (a []byte would answer 0).
    sliceLengthTypes = [ '[]any', '[]string', '[]int64', '[]float64', '[]bool', '[]int', '[][]any', '[]map[string]any' ];

    // hand-written BaseExchange fields (go/v4/exchange.go) whose Go type is one of the
    // slice types above: the struct value is never a nil pointer and len(field) is the
    // very value the helper's type switch returns for it.
    GO_NATIVE_LENGTH_FIELDS = [ 'Symbols' ];

    printInlineArrayLength(expression, printedText: string, lengthNode?): string | undefined {
        if (printedText.includes('\n')) {
            return undefined;
        }
        const goType = this.goPrintedTypeOfExpression(expression, printedText);
        if ((typeof goType === 'string') && this.sliceLengthTypes.indexOf(goType) >= 0) {
            return `len(${printedText})`;
        }
        if (this.goLengthFeedsArithmeticClassifier(lengthNode)) {
            return undefined;
        }
        // a Go `string` counts its bytes in both helpers (GetLength's reflect.String
        // case, GetArrayLength's `case string`), and neither helper's nil/`any` branch
        // is reachable for it; a *string / any box keeps the helper it prints today
        if (goType === 'string') {
            return `len(${printedText})`;
        }
        if (this.goNativeLengthFieldType(printedText) !== undefined) {
            return `len(${printedText})`;
        }
        return undefined;
    }

    // the hand-written struct type of a `this.<field>` read, for fields declared as a slice the
    // length helpers count. Any other type (map / *sync.Map / interface{}) keeps the helper:
    // GetArrayLength answers 0 for those, while len would answer the real count.
    goNativeLengthFieldType(printedText: string): string | undefined {
        const match = /^this\.([A-Za-z_]\w*)$/.exec(this.goUnwrapPrintedParens(printedText));
        if (match === null || this.GO_NATIVE_LENGTH_FIELDS.indexOf(match[1]) < 0) {
            return undefined;
        }
        return '[]string';
    }

    // true when the `.length` sits inside a `-`, `*`, `/` or `%` chain. The ccxt-side classifier
    // (build/go-local-types.js, CCXT_GO_INT_OPERAND_CALLEES) names `GetArrayLength(`/`GetLength(` an
    // `int` operand, so inlining `len` would declassify the chain's int64 local and `.(int64)` unbox.
    goLengthFeedsArithmeticClassifier(lengthNode): boolean {
        let current = lengthNode?.parent;
        for (let i = 0; (i < 16) && (current !== undefined); i++) {
            if (current.kind === ts.SyntaxKind.BinaryExpression) {
                const op = current.operatorToken?.kind;
                if ((op === ts.SyntaxKind.MinusToken) || (op === ts.SyntaxKind.AsteriskToken)
                    || (op === ts.SyntaxKind.SlashToken) || (op === ts.SyntaxKind.PercentToken)) {
                    return true;
                }
            }
            switch (current.kind) {
            case ts.SyntaxKind.ExpressionStatement:
            case ts.SyntaxKind.VariableStatement:
            case ts.SyntaxKind.ReturnStatement:
            case ts.SyntaxKind.IfStatement:
            case ts.SyntaxKind.Block:
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.WhileStatement:
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.ArrowFunction:
                return false;
            }
            current = current.parent;
        }
        return false;
    }

    // Go has no ternary operator. The func literal returns the same branch value the
    // helper would and prints the condition the same way; it evaluates only the branch
    // TypeScript would take, while Ternary receives both already evaluated. Both arms
    // printing as one and the same Go scalar names it (`func() string`), so the literal
    // carries the value itself instead of an `any` box.
    printInlineTernary(condition: string, whenTrue: string, whenFalse: string, resultType: string = undefined): string | undefined {
        if (condition.includes('\n')) {
            return undefined;
        }
        // go/printer never keeps a func literal whose body holds an `if` on one line, and
        // controlClause() strips the parentheses around the `if` condition; the body sits one
        // level below the statement the literal belongs to, `}()` at the statement's level
        const level = this.goStatementLevel;
        const body = this.getIden(level + 1);
        const branch = this.getIden(level + 2);
        return `func() ${resultType ?? 'any'} {\n${body}if ${this.goStripControlClauseParens(condition)} {\n${branch}return ${whenTrue}\n${body}}\n${body}return ${whenFalse}\n${this.getIden(level)}}()`;
    }

    // the Go scalar an arm already prints a VALUE of, or undefined while the arm is an `any` box.
    // Only the printed text counts: a literal, a local declared with that type, or a call whose Go
    // signature returns it. A classifier-named box (`Subtract(...)`) cannot be carried by `return`.
    goTernaryArmType(node, printedText: string): string | undefined {
        const text = this.goUnwrapPrintedParens(printedText);
        const inner = (node?.kind === ts.SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        switch (inner?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'bool';
        case ts.SyntaxKind.NumericLiteral:
            // an integer literal is an untyped constant of Go default type `int`; a
            // fraction/exponent makes it a float64 constant
            if (/^[0-9]+$/.test(inner.text)) {
                return 'int';
            }
            return (/^[0-9]*\.[0-9]+([eE][+-]?[0-9]+)?$/.test(inner.text) || /^[0-9]+[eE][+-]?[0-9]+$/.test(inner.text)) ? 'float64' : undefined;
        case ts.SyntaxKind.Identifier:
            return this.goLocalStaticType(inner); // declared `var x T = …` (never `:=`)
        }
        // a nested ternary prints the printer's own typed literal, whose return type is
        // the arm's type as well
        const literalType = goFuncLiteralReturnType(text);
        if (literalType !== undefined) {
            return literalType;
        }
        const open = text.indexOf('(');
        if (open <= 0 || !this.isWholePrintedCall(text, open)) {
            return undefined;
        }
        const goType = GO_HELPER_RETURN_TYPES[text.substring(0, open)];
        return ((goType === undefined) || goType.startsWith('*')) ? undefined : goType;
    }

    // the one Go scalar both arms print as, or undefined when the literal keeps the `any`
    // box: only GO_TYPE_NAMES are nameable, and a pointer/`any` arm (or two different
    // types) is not a type the literal could return
    goTernaryResultType(whenTrueNode, whenTrue: string, whenFalseNode, whenFalse: string): string | undefined {
        const whenTrueType = this.goTernaryArmType(whenTrueNode, whenTrue);
        if ((typeof whenTrueType !== 'string') || (whenTrueType === 'any') || (GO_TYPE_NAMES.indexOf(whenTrueType) < 0)) {
            return undefined;
        }
        return (this.goTernaryArmType(whenFalseNode, whenFalse) === whenTrueType) ? whenTrueType : undefined;
    }

    // stripParens() applied to a printed condition text (see goControlClauseParens)
    goStripControlClauseParens(text: string): string {
        for (;;) {
            const inner = this.goEnclosedExpression(text);
            if (inner === undefined) {
                return text;
            }
            text = inner;
        }
    }

    // a multi-line branch (a nested ternary, a composite literal) is laid out relative to
    // the `return` statement that holds it: inside the `if` for whenTrue (two levels below
    // the statement), the literal's body for whenFalse (one level)
    goPrintTernaryBranch(node, levels: number) {
        const previousLevel = this.goStatementLevel;
        this.goStatementLevel = previousLevel + levels;
        try {
            return this.goWithExprDepth(1, () => this.printNode(node, 0));
        } finally {
            this.goStatementLevel = previousLevel;
        }
    }

    // `key in obj` on a Go map[string]any with a Go string key: the two-value read is a statement,
    // hence the func literal; present-but-nil is ok=true like InOp. A `*string` key derefs, nil
    // answering false. InOp also covers nil/number keys and sync.Map/orderbook receivers: else keep it.
    printInlineInOp(dictNode, keyNode, dictText: string, keyText: string): string | undefined {
        if (dictText.includes('\n') || keyText.includes('\n')) {
            return undefined;
        }
        if (this.goPrintedTypeOfExpression(dictNode, dictText) !== 'map[string]any') {
            return undefined;
        }
        if (this.goPrintedTypeOfExpression(keyNode, keyText) !== 'string') {
            // InOp runs derefScalar over both operands: a `*string` key is the pointed-to
            // string, and a nil pointer is a nil key, i.e. false. Only an identifier may be
            // repeated by the guard — any other expression would be evaluated twice.
            if ((keyNode?.kind !== ts.SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(keyNode) !== '*string')) {
                return undefined;
            }
            const level = this.goStatementLevel;
            const body = this.getIden(level + 1);
            return `func() bool {\n${body}if ${keyText} == nil {\n${this.getIden(level + 2)}return false\n${body}}\n${body}_, ok := ${dictText}[*${keyText}]\n${body}return ok\n${this.getIden(level)}}()`;
        }
        // funcBody() keeps the literal on one line while `func() bool` (11 columns) plus
        // the two statements and their `; ` separator fit in 100 columns
        const read = `_, ok := ${dictText}[${keyText}]`;
        if (11 + read.length + 2 + 'return ok'.length <= 100) {
            return `func() bool { ${read}; return ok }()`;
        }
        const level = this.goStatementLevel;
        return `func() bool {\n${this.getIden(level + 1)}${read}\n${this.getIden(level + 1)}return ok\n${this.getIden(level)}}()`;
    }

    // comparison helpers that normalize int/int64/float64 against each other, so a
    // literal operand's Go default type (int) behaves like the int64 OpNeg produces
    comparisonHelpers = [ 'IsEqual', 'IsGreaterThan', 'IsLessThan', 'IsGreaterThanOrEqual', 'IsLessThanOrEqual' ];

    // OpNeg boxes `-val.Int()` / `-val.Float()`, i.e. an int64 or a float64, and nil
    // for anything else. `-x` reproduces that exactly only for an operand that already
    // prints as float64/int64; a Go `int` (or an integer literal) boxes as int instead.
    printInlineOpNeg(node, printedText: string): string | undefined {
        if (printedText.includes('\n')) {
            return undefined;
        }
        const goType = this.goPrintedTypeOfExpression(node.operand, printedText);
        if ((goType === 'float64') || (goType === 'int64')) {
            return `-${printedText}`;
        }
        // a fractional/exponent literal is already a Go float64 constant; an integer
        // literal is only interchangeable where the consumer normalizes the number
        if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(printedText.trim())) {
            if (printedText.includes('.') || /[eE]/.test(printedText)) {
                return `-${printedText}`;
            }
            const parent = node.parent;
            if (parent?.kind === ts.SyntaxKind.CallExpression) {
                const callee = this.printNode(parent.expression, 0);
                if (this.comparisonHelpers.indexOf(callee) >= 0) {
                    return `-${printedText}`;
                }
            }
            // `a > -1` prints as IsGreaterThan(a, …); the relational wrappers all
            // normalise int/int64/float64 the same way the equality helpers do
            if (parent?.kind === ts.SyntaxKind.BinaryExpression) {
                const op = parent.operatorToken.kind;
                if ((op === ts.SyntaxKind.GreaterThanToken) || (op === ts.SyntaxKind.GreaterThanEqualsToken)
                    || (op === ts.SyntaxKind.LessThanToken) || (op === ts.SyntaxKind.LessThanEqualsToken)) {
                    return `-${printedText}`;
                }
            }
        }
        return undefined;
    }

    // JS truthiness of an operand whose Go type the printer knows, expressed with
    // plain Go instead of boxing the value into `EvalTruthy(any)`. Each arm mirrors the
    // matching `EvalTruthy` case exactly, including nil (a nil *T and a nil map are
    // both falsy) — so this is the same predicate, minus the interface round-trip.
    printInlineTruthy(node): string | undefined {
        // every pointer/slice arm below repeats the operand, so only an identifier
        // qualifies; inlining a call would evaluate it twice
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const goType = this.goDeclaredTypeOfIdentifier(node);
        if (goType === undefined) {
            return undefined;
        }
        const text = this.printNode(node, 0);
        switch (goType) {
        case 'bool':
            return text;
        case 'string':
            return `(${text} != "")`;
        case 'int':
        case 'int64':
        case 'float64':
            return `(${text} != 0)`;
        case '*bool':
            return `(${text} != nil && *${text})`;
        case '*string':
            return `(${text} != nil && *${text} != "")`;
        case '*int':
        case '*int64':
        case '*float64':
            return `(${text} != nil && *${text} != 0)`;
        case '[]string':
        case '[]any':
        case 'map[string]any':
            return `(len(${text}) > 0)`;
        }
        return undefined;
    }

    // an `any` box the checker proves can only hold a bool or nil — a `boolean`
    // local whose Go declaration stayed `any` (a later write the printer cannot
    // type, e.g. a tuple read) — is what `EvalTruthy` reduces to: nil and `false`
    printInlineBoolBoxTruthy(node): string | undefined {
        if (this.goScalarFamilyWithNil(node) !== 'bool') {
            return undefined;
        }
        let declaration;
        try {
            declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        } catch (e) {
            return undefined;
        }
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration && !this.goGetArgBoundParameter(node)) {
            return undefined; // a plain parameter keeps the caller's box untouched
        }
        const text = this.printNode(node, 0);
        if (!this.goIsAnyBoxExpression(node, text)) {
            return undefined;
        }
        return `(${text} == true)`;
    }

    // `EvalTruthy(this.SafeBool(…))`: the accessor's Go signature returns a `*bool`,
    // nil for an absent flag and the flag otherwise — exactly the two states
    // `derefScalar` hands the helper — so the predicate is `x != nil && *x`.
    printInlineBoolPointerTruthy(node, printedText: string): string | undefined {
        if (node?.kind !== ts.SyntaxKind.CallExpression) {
            return undefined;
        }
        if (GO_PURE_BOOL_ACCESSORS.indexOf(this.goPrintedCallee(printedText) as string) < 0) {
            return undefined;
        }
        // the pointer is dereferenced twice, so every argument has to be a plain read
        if (!node.arguments.every((argument) => this.goIsRepeatSafePointerArgument(argument))) {
            return undefined;
        }
        return `(${printedText} != nil && *${printedText})`;
    }

    // an argument the two halves of a pointer deref may read twice: a plain
    // identifier/literal read, or a `this.<field>` read of the exchange instance
    goIsRepeatSafePointerArgument(node): boolean {
        while (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (this.goIsReadOnlyCallArgument(node)) {
            return true;
        }
        return (node?.kind === ts.SyntaxKind.PropertyAccessExpression)
            && (node.expression?.kind === ts.SyntaxKind.ThisKeyword)
            && (node.name?.kind === ts.SyntaxKind.Identifier);
    }

    // the native Go text for a condition operand the printer can type, or undefined
    // when the operand has to go through the truthiness helper. `(x)` is decided on
    // its operand and keeps the source parentheses, so the surrounding operator still
    // parses exactly the same way.
    goNativeCondition(node): string | undefined {
        if (node?.kind === ts.SyntaxKind.Identifier) {
            return this.printInlineTruthy(node) ?? this.printInlineBoolBoxTruthy(node);
        }
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            const inner = this.goNativeCondition(node.expression);
            if (inner === undefined) {
                return undefined;
            }
            return (inner.startsWith('(') && this.isWholePrintedCall(inner, 0)) ? inner : `(${inner})`;
        }
        // an expression that already prints a Go `bool` needs no EvalTruthy round-trip:
        // `a || b`, `!x`, `a === b` and the Is*/Precise.String* predicates are all
        // bool-typed, so `EvalTruthy(<bool>)` is the identity function on them
        const printed = this.printNode(node, 0);
        const pointerTruthy = this.printInlineBoolPointerTruthy(node, printed);
        if (pointerTruthy !== undefined) {
            return pointerTruthy;
        }
        if (this.goTypeOfInitializer(node, printed) === 'bool') {
            return printed;
        }
        // a predicate the printer folds to a constant — IsArray on a proven slice or map —
        // prints a Go bool that the probe above cannot name
        if ((node?.kind === ts.SyntaxKind.CallExpression) && ((printed === 'true') || (printed === 'false'))) {
            return printed;
        }
        if (GO_BOOL_FIELDS.has(printed)) {
            return printed;
        }
        // a hand-written bool-returning base method already prints a Go bool
        const callee = this.goPrintedCallee(printed);
        return (callee !== undefined && GO_BOOL_CALL_NAMES_NATIVE.indexOf(callee) >= 0) ? printed : undefined;
    }


    // gofmt prints the condition of every `if`/`for`/`switch` through
    // go/printer/nodes.go controlClause() -> stripParens(): the single outermost,
    // fully enclosing parentheses pair is dropped, and the rule applies again to the
    // enclosed expression while that one is parenthesized as well
    // (`if (x == 1) {` -> `if x == 1 {`, `if ((x == 1)) {` -> `if x == 1 {`).
    // Parentheses survive when the enclosed expression holds an unparenthesized
    // composite literal whose type is a type name, because `if T{} == x {` does not
    // parse. The printer emits text instead of an ast.Expr, so stripParens runs over
    // the printed condition text here.
    goControlClauseParens(node, expression: string): string {
        if (!this.goIsControlClauseCondition(node)) {
            return expression;
        }
        let text = expression;
        for (;;) {
            const inner = this.goEnclosedExpression(text);
            if (inner === undefined) {
                return text;
            }
            text = inner;
        }
    }

    // the expression inside the outermost parentheses pair of `text`, or undefined
    // when `text` is not one fully enclosing pair or gofmt keeps that pair
    goEnclosedExpression(text: string): string | undefined {
        const trimmed = text.trim();
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
            return undefined;
        }
        // `(a) && (b)` opens and closes with a parenthesis, but not the same pair
        if (this.goSkipBalanced(trimmed, 0, '(', ')') !== trimmed.length) {
            return undefined;
        }
        const inner = trimmed.substring(1, trimmed.length - 1).trim();
        if (this.goHasTypeNameCompositeLiteral(inner)) {
            return undefined; // stripParens keeps parentheses protecting a literal
        }
        return inner;
    }

    // the expression a Go `if`/`for`/`switch` statement tests, the only positions
    // gofmt's controlClause() rewrites
    goIsControlClauseCondition(node): boolean {
        const parent = node?.parent;
        switch (parent?.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.SwitchStatement:
            return parent.expression === node;
        case ts.SyntaxKind.ForStatement:
            return parent.condition === node;
        }
        return false;
    }

    // stripParens' ast.Inspect stops at nested parentheses, which protect whatever
    // they enclose, and reports a composite literal whenever its type is a type name
    goHasTypeNameCompositeLiteral(text: string): boolean {
        let index = 0;
        while (index < text.length) {
            const char = text[index];
            if ((char === '"') || (char === '`') || (char === '\'')) {
                index = this.goSkipQuoted(text, index);
                continue;
            }
            if (char === '(') {
                const next = this.goSkipBalanced(text, index, '(', ')');
                if (next < 0) {
                    return false; // unbalanced text cannot be inspected any further
                }
                index = next;
                continue;
            }
            if (char === '{') {
                if (this.goCompositeLitHasTypeName(text, index)) {
                    return true;
                }
                const next = this.goSkipBalanced(text, index, '{', '}');
                if (next < 0) {
                    return false;
                }
                index = next;
                continue;
            }
            index += 1;
        }
        return false;
    }

    // `{` opens a composite literal whose type is a type name when the text in front
    // of it is an ident or a selector chain of idents; `map[string]any{` and `[]any{`
    // are type literals and do not count (isTypeName in go/printer/nodes.go)
    goCompositeLitHasTypeName(text: string, braceIndex: number): boolean {
        let start = braceIndex;
        while (start > 0 && /[A-Za-z0-9_.[\]]/.test(text[start - 1])) {
            start -= 1;
        }
        const typeText = text.substring(start, braceIndex).trim();
        if (['map', 'struct', 'interface', 'func', 'chan'].indexOf(typeText) >= 0) {
            return false;
        }
        return /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(typeText);
    }

    // the index right after the bracket closing the one at `start`, or -1 when the
    // brackets are unbalanced (the printer sees statement fragments, not whole files)
    goSkipBalanced(text: string, start: number, open: string, close: string): number {
        let depth = 0;
        let index = start;
        while (index < text.length) {
            const char = text[index];
            if ((char === '"') || (char === '`') || (char === '\'')) {
                index = this.goSkipQuoted(text, index);
                continue;
            }
            if (char === open) {
                depth += 1;
            } else if (char === close) {
                depth -= 1;
                if (depth === 0) {
                    return index + 1;
                }
            }
            index += 1;
        }
        return -1;
    }

    // the index right after the string, rune or raw string literal opening at `start`
    goSkipQuoted(text: string, start: number): number {
        const quote = text[start];
        let index = start + 1;
        while (index < text.length) {
            const char = text[index];
            if ((char === '\\') && (quote !== '`')) {
                index += 2;
                continue;
            }
            if (char === quote) {
                return index + 1;
            }
            index += 1;
        }
        return text.length;
    }

    // gofmt keeps a comment group that the source separates from the following
    // declaration by a blank line as a free-standing comment; joined to it, it becomes
    // the declaration's doc comment and its indented lines are re-laid out as a code
    // block. The blank line is preserved so the emitted text keeps the source's shape.
    printLeadingComments(node, identation) {
        const printed = super.printLeadingComments(node, identation);
        if (printed.length === 0) {
            return printed;
        }
        const fullText = this.getSrc().getFullText();
        const ranges = ts.getLeadingCommentRanges(fullText, node.pos) ?? [];
        const last = ranges[ranges.length - 1];
        if (last === undefined) {
            return printed;
        }
        const gap = fullText.slice(last.end, node.getStart());
        const detached = (gap.match(/\n/g) ?? []).length > 1;
        return detached ? printed + "\n" : printed;
    }

    // level of the statement being printed: a multi-line composite literal is laid out
    // relative to it (go/printer), whatever level the expression printers hand down
    goStatementLevel = 0;

    // stdlib packages this file's native emissions call; printSourceFileStatements turns them
    // into the import declarations the emitted Go needs (an occurrence outside a file print,
    // e.g. the intellisense body, only marks a set that the next file print replaces)
    goFileStdlibImports = new Set<string>();

    // gofmt separates a top-level declaration that carries a comment from the previous
    // declaration by a blank line (go/printer declList: min = 2 when the decl has a doc
    // comment); the file members are joined with a bare newline otherwise
    printSourceFileStatements(node, identation): string {
        const outerImports = this.goFileStdlibImports;
        const fileImports = new Set<string>();
        this.goFileStdlibImports = fileImports;
        let body = '';
        try {
            const printed = node.statements.map((m) => this.printNode(m, identation + 1)).filter((st) => st.length > 0);
            body = printed.map((st, index) => (index > 0 && /^\s*(\/\/|\/\*)/.test(st)) ? "\n" + st : st).join("\n") + "\n".repeat(this.NUM_LINES_END_FILE);
        } finally {
            this.goFileStdlibImports = outerImports;
        }
        if (fileImports.size === 0) {
            return body;
        }
        // a native emission needs its stdlib package, and an import declaration must precede
        // every other declaration: the file assembly puts this text right behind the generated
        // header, so the imports lead it (gofmt keeps an import clause before the first decl)
        return [...fileImports].sort().map((path) => `import "${path}"`).join("\n") + "\n\n" + body;
    }

    printNode(node, identation = 0): string {
        if (node !== undefined && ts.isSourceFile(node)) {
            this.className = "undefined";
            return this.printSourceFileStatements(node, identation);
        }
        const isStatement = node !== undefined && ts.isStatement(node) && node.kind !== ts.SyntaxKind.Block;
        const previousLevel = this.goStatementLevel;
        if (isStatement) {
            this.goStatementLevel = identation;
        }
        try {
            const printed = super.printNode(node, identation);
            // the if/for/switch conditions go through here (printCondition resolves the
            // bool and the falsy/truthy paths before printing the node's text)
            return this.goControlClauseParens(node, printed);
        } finally {
            this.goStatementLevel = previousLevel;
        }
    }

    // composite literal body one level deeper than the statement, closing brace at the
    // statement's level; the leading indentation belongs to the enclosing printer
    printObjectLiteralExpression(node, identation) {
        const level = this.goStatementLevel;
        const objectBody = this.printObjectLiteralBody(node, level);
        const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(level) : objectBody;
        return this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
    }

    printCondition(node, identation) {
        // `!x` is handled by printPrefixUnaryExpression, which calls back into this
        // method with the operand; let the base class keep that recursion intact
        const native = this.goNativeCondition(node);
        if (native !== undefined) {
            // goNativeCondition prints the operand itself, so the control-clause
            // parens of printNode do not see the parentheses it wraps it in
            return `${this.getIden(identation)}${this.goControlClauseParens(node, native)}`;
        }
        // a native `key in obj` prints as a `func() bool` call, which the type probe
        // above cannot name; it is a Go bool all the same
        const inNode = (node?.kind === ts.SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        if (inNode?.kind === ts.SyntaxKind.BinaryExpression && inNode.operatorToken.kind === ts.SyntaxKind.InKeyword) {
            const inlined = this.printInlineInOp(inNode.right, inNode.left, this.printNode(inNode.right, 0), this.printNode(inNode.left, 0));
            if (inlined !== undefined) {
                const text = (inNode === node) ? inlined : `(${inlined})`;
                return `${this.getIden(identation)}${this.goControlClauseParens(node, text)}`;
            }
        }
        return super.printCondition(node, identation);
    }

    // === / !== inlined to plain Go operators when both sides are concrete Go
    // values or real pointers. Everything else — in particular anything that is
    // still `any` in Go — falls through to the existing IsEqual helper.
    // `(a == b || *a == *b)` is rejected: a nil *T panics on the second clause.
    // Go has no implicit numeric conversion: `*limit == length` does not compile
    // when limit is *int64 and length is int, even though TypeScript calls both
    // `number`. Dereferencing is therefore only safe against an untyped constant
    // (a literal, which adapts to the pointee) or an operand of the very same Go
    // type. Anything else — including any `any` operand — keeps IsEqual.
    goDerefComparableWith(ptrNode, ptrText: string, otherNode): boolean {
        const pointee = this.goPointerTypeOfExpression(ptrNode, ptrText)?.substring(1);
        if (pointee === undefined) {
            return false;
        }
        switch (otherNode?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return pointee === 'string';
        case ts.SyntaxKind.NumericLiteral:
            return (pointee === 'int') || (pointee === 'int64') || (pointee === 'float64');
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return pointee === 'bool';
        }
        const otherType = this.goDeclaredTypeOfIdentifier(otherNode);
        return otherType === pointee;
    }

    // a node the printer prints as a Go string constant: both literal forms are
    // emitted with the printer's string quote token, so the comparison is a plain
    // Go string comparison
    goIsStringLiteralNode(node): boolean {
        if (node === undefined) {
            return false;
        }
        return (node.kind === ts.SyntaxKind.StringLiteral) || (node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral);
    }

    // the deref arms print their operand twice, so it must read the same value both times: an
    // identifier is a plain read, and a string accessor call whose arguments are all
    // identifiers/literals re-reads them (no statement runs between the two evaluations).
    goDerefRepeatableOperand(node, printedText: string): boolean {
        if (node?.kind === ts.SyntaxKind.Identifier) {
            return true;
        }
        if (node?.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        if (GO_PURE_STRING_ACCESSORS.indexOf(this.goPrintedCallee(printedText) as string) < 0) {
            return false;
        }
        return node.arguments.every((argument) => this.goIsReadOnlyCallArgument(argument));
    }

    // an argument whose evaluation is a plain read: a value the printer already
    // holds, never a call that could observe or cause a change
    goIsReadOnlyCallArgument(node): boolean {
        while (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        switch (node?.kind) {
        case ts.SyntaxKind.Identifier:
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        case ts.SyntaxKind.NumericLiteral:
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
        case ts.SyntaxKind.NullKeyword:
            return true;
        }
        return false;
    }

    // true when the Go value of this operand is a bare `string`: a local declared `string`, or a
    // parameter the signature printer emits as `string`. A Go string holds neither nil nor a pointer,
    // so `x == "lit"` is exactly IsEqual(x, "lit") — the pointer arms never see this type.
    goIsBareStringOperand(node): boolean {
        if (this.goDeclaredTypeOfIdentifier(node) === 'string') {
            return true;
        }
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.Parameter) {
            return false;
        }
        return this.printParameterType(declaration) === 'string';
    }

    printInlineEquality(left, right, leftText: string, rightText: string, isEq: boolean): string | undefined {
        const lPtr = this.goPointerTypeOfExpression(left, leftText) !== undefined;
        const rPtr = this.goPointerTypeOfExpression(right, rightText) !== undefined;
        // the branches below that deref repeat the operand, so they may only be used
        // on an identifier or on one of the read-only string accessors (whose
        // arguments are plain reads); a call that does anything else stays IsEqual
        const lRepeatable = this.goDerefRepeatableOperand(left, leftText);
        const rRepeatable = this.goDerefRepeatableOperand(right, rightText);
        const lFam = this.goScalarFamily(left);
        const rFam = this.goScalarFamily(right);
        if (lFam === 'nil' && rPtr) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        if (rFam === 'nil' && lPtr) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (lPtr && rPtr) {
            const lPointee = this.goPointerTypeOfExpression(left, leftText);
            if (!lRepeatable || !rRepeatable
                || lPointee !== this.goPointerTypeOfExpression(right, rightText)) {
                return undefined; // IsEqual + derefScalar evaluates each side once
            }
            if (isEq) {
                return `(${leftText} == ${rightText} || (${leftText} != nil && ${rightText} != nil && *${leftText} == *${rightText}))`;
            }
            return `(${leftText} != ${rightText} && (${leftText} == nil || ${rightText} == nil || *${leftText} != *${rightText}))`;
        }
        if (lPtr && rFam !== undefined && rFam !== 'nil') {
            if (!lRepeatable || !this.goDerefComparableWith(left, leftText, right)) {
                return undefined;
            }
            return isEq
                ? `(${leftText} != nil && *${leftText} == ${rightText})`
                : `(${leftText} == nil || *${leftText} != ${rightText})`;
        }
        if (rPtr && lFam !== undefined && lFam !== 'nil') {
            if (!rRepeatable || !this.goDerefComparableWith(right, rightText, left)) {
                return undefined;
            }
            return isEq
                ? `(${rightText} != nil && *${rightText} == ${leftText})`
                : `(${rightText} == nil || *${rightText} != ${leftText})`;
        }
        // two definitely-present scalars of the same family: `==` is valid Go and
        // needs no helper. Nullable aliases (Str/Int/Num/Bool) are `any` in Go and
        // returned undefined by goScalarFamily, so they keep IsEqual.
        if (!lPtr && !rPtr && lFam !== undefined && rFam !== undefined
            && lFam !== 'nil' && rFam !== 'nil' && lFam === rFam) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // the declared-local table names `string` for this identifier (or the signature printer emits the
        // parameter as `string`): a `var x string` cannot hold a pointer or nil, so a string-literal
        // comparison equals the helper. A local ever written another type is reported `any` and boxed.
        if (!lPtr && !rPtr) {
            if (this.goIsBareStringOperand(left) && this.goIsStringLiteralNode(right)) {
                return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
            }
            if (this.goIsBareStringOperand(right) && this.goIsStringLiteralNode(left)) {
                return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
            }
        }
        // an operand the printer boxes into `any` whose TypeScript type proves the box
        // holds a scalar or nil: `x === undefined` and `x === 'lit'` are then the same
        // predicate as the helper, without the interface round-trip. Numbers stay on
        // IsEqual: an `any` box may hold int, int64 or float64, and Go compares those
        // by exact width.
        const lNilFam = this.goScalarFamilyWithNil(left);
        const rNilFam = this.goScalarFamilyWithNil(right);
        const lBox = !lPtr && this.goIsAnyBoxExpression(left, leftText);
        const rBox = !rPtr && this.goIsAnyBoxExpression(right, rightText);
        if (lBox && (rFam === 'nil') && (lNilFam !== undefined) && (lNilFam !== 'number')) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (rBox && (lFam === 'nil') && (rNilFam !== undefined) && (rNilFam !== 'number')) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        // a parameter whose TypeScript type is an array or object (`Strings`, `Market`, `NullableDict`,
        // `object[]`): the Go box holds a map/slice or an untyped nil, not a pointer — GetArg unwraps the
        // typed nil pointers the wrappers pass, so `x == nil` is exactly IsEqual(x, nil)
        const lObjParam = (lNilFam === undefined) && lBox && this.goObjectBoxParameter(left);
        const rObjParam = (rNilFam === undefined) && rBox && this.goObjectBoxParameter(right);
        if (lObjParam && (rFam === 'nil')) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (rObjParam && (lFam === 'nil')) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        // an `any` local the printer cannot type whose every write is a non-pointer
        // source (endpoint await / JSON decode / literal / nil): its box is never a
        // nil *T, so the interface test is the same predicate as the helper
        if (lBox && (rFam === 'nil') && this.goAnyLocalHoldsNonPointer(this.goAnyBoxLocalDeclaration(left))) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (rBox && (lFam === 'nil') && this.goAnyLocalHoldsNonPointer(this.goAnyBoxLocalDeclaration(right))) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        // a parameter with a TypeScript default is bound by `x := GetArg(optionalArgs, i, default)`, which
        // folds a typed nil pointer (and nil []string/[]any) into the untyped default: never a nil *T.
        // Nullable Int/Num aliases are excluded above only because exact-width comparison needs `number`.
        if ((lNilFam === 'number') && (rFam === 'nil') && this.goGetArgBoundParameter(left)) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if ((rNilFam === 'number') && (lFam === 'nil') && this.goGetArgBoundParameter(right)) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        // a string or bool literal: only a value of that very type is equal in both
        // predicates, so no numeric or nil member can be compared away
        const isLiteral = (node): boolean => {
            switch (node?.kind) {
            case ts.SyntaxKind.StringLiteral:
            case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            case ts.SyntaxKind.TrueKeyword:
            case ts.SyntaxKind.FalseKeyword:
                return true;
            }
            return false;
        };
        const literalMatchesBox = (boxFam: string | undefined, litNode, litFam: string | undefined): boolean =>
            ((litFam === 'string') || (litFam === 'bool')) && isLiteral(litNode)
            && ((boxFam === litFam) || (boxFam === undefined));
        if (lBox && literalMatchesBox(lNilFam, right, rFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        if (rBox && literalMatchesBox(rNilFam, left, lFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // IsEqual(GetValue(market, "spot"), true): the checker proves the read holds
        // a bool or nil (Market.spot), and every other dynamic type is unequal to a
        // Go bool, nil included — the same predicate as the helper
        const isBoolLiteral = (node): boolean =>
            (node?.kind === ts.SyntaxKind.TrueKeyword) || (node?.kind === ts.SyntaxKind.FalseKeyword);
        if (!lPtr && isBoolLiteral(right) && (this.goScalarFamilyWithNil(left) === 'bool')
            && this.goBoxedElementRead(left, leftText)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        if (!rPtr && isBoolLiteral(left) && (this.goScalarFamilyWithNil(right) === 'bool')
            && this.goBoxedElementRead(right, rightText)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // two boxes of one non-numeric family: both hold that scalar or nil
        if (lBox && rBox && (lNilFam !== undefined) && (lNilFam !== 'number') && (lNilFam === rNilFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        return undefined;
    }

    // the Go numeric kind an operand's static type is, or undefined when it stays
    // `any` (unknown helper result, union, pointer box): only a concrete kind can
    // join a comparison the Go compiler accepts
    goOperandNumericKind(node, printedText: string): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === ts.SyntaxKind.Identifier) {
            const declared = this.goDeclaredTypeOfIdentifier(node);
            if (declared !== undefined) {
                return (GO_NUMERIC_KINDS.indexOf(declared) >= 0) ? declared : undefined;
            }
            return this.goLiteralTypedLocalKind(node);
        }
        if (node.kind === ts.SyntaxKind.NumericLiteral) {
            return this.goNumericLiteralKind(node);
        }
        if (this.goIsSignedNumericLiteral(node)) {
            return this.goNumericLiteralKind(node);
        }
        if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.goOperandNumericKind(node.expression, this.printNode(node.expression, 0));
        }
        const goType = this.goTypeOfInitializer(node, printedText);
        return (goType !== undefined && GO_NUMERIC_KINDS.indexOf(goType) >= 0) ? goType : undefined;
    }

    // a local bound by `:=` takes its Go type from the initializer: an untyped
    // integer constant is `int`, a floating-point one is `float64`. A variable
    // statement prints `var x <type> = …` instead, where the printer already
    // decided the type, so only the `:=` form may be trusted here.
    goLiteralTypedLocalKind(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        const declarationList = declaration.parent;
        if (declarationList?.kind !== ts.SyntaxKind.VariableDeclarationList
            || declarationList.parent?.kind === ts.SyntaxKind.FirstStatement) {
            return undefined;
        }
        return this.goNumericLiteralKind(declaration.initializer);
    }

    // an untyped Go constant: the integer forms adopt any numeric kind, the
    // floating-point ones only fit float64. A signed literal is the same constant:
    // the printer writes `-1` as text, never through OpNeg's box.
    goNumericLiteralKind(node): string | undefined {
        if (this.goIsSignedNumericLiteral(node)) {
            return this.goNumericLiteralKind(node.operand);
        }
        const text = node?.text;
        if (text === undefined) {
            return undefined;
        }
        if (/^[0-9][0-9_]*$/.test(text) || /^0[xXoObB][0-9a-fA-F_]+$/.test(text)) {
            return 'int';
        }
        if (/^[0-9][.eE]/.test(text)) {
            return 'float64';
        }
        return undefined;
    }

    // `-1` / `+1.5` as written: a sign on a numeric literal, the only prefix-unary
    // shape that reaches a comparison as a constant rather than as OpNeg(...)
    goIsSignedNumericLiteral(node): boolean {
        if (node?.kind !== ts.SyntaxKind.PrefixUnaryExpression) {
            return false;
        }
        if ((node.operator !== ts.SyntaxKind.MinusToken) && (node.operator !== ts.SyntaxKind.PlusToken)) {
            return false;
        }
        return node.operand?.kind === ts.SyntaxKind.NumericLiteral;
    }

    // a numeric constant operand: an integer/float literal, with an optional sign
    goIsNumericConstant(node): boolean {
        return (node?.kind === ts.SyntaxKind.NumericLiteral) || this.goIsSignedNumericLiteral(node);
    }

    // the constant's value with its sign; NaN for anything but a numeric constant
    goNumericConstantValue(node): number {
        if (this.goIsSignedNumericLiteral(node)) {
            const value = Number(node.operand.text.replaceAll('_', ''));
            return (node.operator === ts.SyntaxKind.MinusToken) ? -value : value;
        }
        if (node?.kind !== ts.SyntaxKind.NumericLiteral) {
            return Number.NaN;
        }
        return Number(node.text.replaceAll('_', ''));
    }

    // a constant only joins a comparison when its value is representable in the
    // other operand's kind: `0.5` is not an int, and neither is 1e400 (infinity)
    goLiteralFitsKind(node, kind: string): boolean {
        const value = this.goNumericConstantValue(node);
        if (!Number.isFinite(value)) {
            return false;
        }
        if (kind === 'float64') {
            return true;
        }
        return Number.isInteger(value) && (Math.abs(value) <= 2147483647);
    }

    // the kind both operands are compared in, or undefined when Go would need a
    // conversion (two different concrete kinds) or the constant does not fit
    goComparisonKind(left, leftKind: string, right, rightKind: string): string | undefined {
        if (leftKind === rightKind) {
            return leftKind;
        }
        if (this.goIsNumericConstant(left) && !this.goIsNumericConstant(right)) {
            return this.goLiteralFitsKind(left, rightKind) ? rightKind : undefined;
        }
        if (this.goIsNumericConstant(right) && !this.goIsNumericConstant(left)) {
            return this.goLiteralFitsKind(right, leftKind) ? leftKind : undefined;
        }
        return undefined;
    }

    // `<` `>` `<=` `>=` between two operands the checker proves to be numbers of the
    // same Go kind is exactly the comparison the helper performs, minus the interface
    // round-trip, so the call carries no information. A `*int64` / `*float64` operand
    // joins them with its deref written out, and the helper's nil predicate with it.
    // Everything else — `any` boxes, mixed kinds, strings — keeps the helper. float64
    // keeps IsLessThan/IsLessThanOrEqual: the helper answers true whenever an operand
    // is NaN while Go (and JS) answer false, and only those two operators differ.
    printInlineOrderedComparison(left, right, leftText: string, rightText: string, op): string | undefined {
        const operator = ORDERED_COMPARISON_OPERATORS[op];
        if (operator === undefined) {
            return undefined;
        }
        const leftPointee = this.goOrderedComparisonPointerKind(left);
        const rightPointee = this.goOrderedComparisonPointerKind(right);
        if ((leftPointee !== undefined) || (rightPointee !== undefined)) {
            return this.printPointerOrderedComparison(left, right, leftText, rightText, operator, leftPointee, rightPointee);
        }
        const leftKind = this.goOperandNumericKind(left, leftText);
        const rightKind = this.goOperandNumericKind(right, rightText);
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        // both operands may additionally be checker-typed numbers; that check is
        // implied by the concrete Go kind above and buys nothing
        const kind = this.goComparisonKind(left, leftKind, right, rightKind);
        if (kind === undefined) {
            return undefined;
        }
        if ((kind === 'float64') && ((operator === '<') || (operator === '<='))) {
            return undefined;
        }
        return `(${leftText} ${operator} ${rightText})`;
    }

    // the pointee kind of a `*int64` / `*float64` **identifier** operand. Only a local
    // the printer itself declared as that pointer qualifies: a call would be repeated by
    // the nil test, and an `any` box holds a value the printer cannot name.
    goOrderedComparisonPointerKind(node): string | undefined {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const declared = this.goDeclaredTypeOfIdentifier(node);
        if ((declared !== '*int64') && (declared !== '*float64')) {
            return undefined;
        }
        return declared.substring(1);
    }

    // an ordered comparison with a `*int64` / `*float64` operand on at least one side. The helper
    // derefs both sides and answers its own predicate when one is nil, so the native form spells that
    // out; an enclosing `x !== undefined` guard (printed as `x != nil`) removes it for that side.
    printPointerOrderedComparison(left, right, leftText: string, rightText: string, operator: string, leftPointee: string | undefined, rightPointee: string | undefined): string | undefined {
        const leftKind = (leftPointee === undefined) ? this.goOperandNumericKind(left, leftText) : leftPointee;
        const rightKind = (rightPointee === undefined) ? this.goOperandNumericKind(right, rightText) : rightPointee;
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        const kind = this.goComparisonKind(left, leftKind, right, rightKind);
        if (kind === undefined) {
            return undefined;
        }
        // NaN is a float64 to the helper too: `<` / `<=` answer true for it while Go
        // answers false, so those two operators keep the call exactly as phase-1 does
        if ((kind === 'float64') && ((operator === '<') || (operator === '<='))) {
            return undefined;
        }
        const leftNil = (leftPointee !== undefined) && !this.goHasEnclosingNilGuard(left);
        const rightNil = (rightPointee !== undefined) && !this.goHasEnclosingNilGuard(right);
        // a nil test short-circuits the operand on the other side, so that side has to
        // be free of calls for the helper's single evaluation to stay unobservable
        if (leftNil && (rightPointee === undefined) && !this.goIsPureComparisonOperand(right)) {
            return undefined;
        }
        if (rightNil && (leftPointee === undefined) && !this.goIsPureComparisonOperand(left)) {
            return undefined;
        }
        const lv = (leftPointee === undefined) ? leftText : `*${leftText}`;
        const rv = (rightPointee === undefined) ? rightText : `*${rightText}`;
        if (!leftNil && !rightNil) {
            return `(${lv} ${operator} ${rv})`;
        }
        // every arm below answers what the helper answers when a side is nil:
        // `a != nil && b == nil` for `>`/`>=`, `a == nil && b != nil` for `<`/`<=`
        if (leftNil && !rightNil) {
            if (operator === '>') {
                return `(${leftText} != nil && ${lv} > ${rv})`;
            }
            if (operator === '>=') {
                return `(${leftText} != nil && ${lv} >= ${rv})`;
            }
            const sign = (operator === '<') ? '<' : '<=';
            return `(${leftText} == nil || ${lv} ${sign} ${rv})`;
        }
        if (!leftNil && rightNil) {
            if (operator === '>') {
                return `(${rightText} == nil || ${lv} > ${rv})`;
            }
            if (operator === '>=') {
                return `(${rightText} == nil || ${lv} >= ${rv})`;
            }
            const sign = (operator === '<') ? '<' : '<=';
            return `(${rightText} != nil && ${lv} ${sign} ${rv})`;
        }
        if (operator === '>') {
            return `(${leftText} != nil && (${rightText} == nil || ${lv} > ${rv}))`;
        }
        if (operator === '>=') {
            return `(${rightText} == nil || (${leftText} != nil && ${lv} >= ${rv}))`;
        }
        if (operator === '<') {
            return `(${rightText} != nil && (${leftText} == nil || ${lv} < ${rv}))`;
        }
        return `(${leftText} == nil || (${rightText} != nil && ${lv} <= ${rv}))`;
    }

    // `x !== undefined` / `x != null` on that identifier: the printer writes the Go
    // `x != nil` test for it, so an enclosing one proves the pointer present
    goIsNonNilTestOf(node, ident): boolean {
        if (node?.kind !== ts.SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = node.operatorToken?.kind;
        if ((op !== ts.SyntaxKind.ExclamationEqualsToken) && (op !== ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
            return false;
        }
        return (this.goIsSameSymbol(node.left, ident) && this.goIsNilLiteral(node.right))
            || (this.goIsSameSymbol(node.right, ident) && this.goIsNilLiteral(node.left));
    }

    // a null/undefined literal, or any expression the checker types as one
    goIsNilLiteral(node): boolean {
        if ((node?.kind === ts.SyntaxKind.NullKeyword) || (node?.kind === ts.SyntaxKind.UndefinedKeyword)) {
            return true;
        }
        return (node?.kind === ts.SyntaxKind.Identifier) && (this.goScalarFamily(node) === 'nil');
    }

    goIsSameSymbol(a, b): boolean {
        if ((a?.kind !== ts.SyntaxKind.Identifier) || (b?.kind !== ts.SyntaxKind.Identifier)) {
            return false;
        }
        try {
            const checker = this.getChecker();
            const leftSymbol = checker.getSymbolAtLocation(a);
            return (leftSymbol !== undefined) && (leftSymbol === checker.getSymbolAtLocation(b));
        } catch (e) {
            return false;
        }
    }

    // true when the enclosing control flow already proves the identifier non-nil at this node: an
    // earlier conjunct of an `&&` chain, or the condition of a wrapping if/loop/ternary containing the
    // node. A local rebound anywhere in its function never counts — the guard may be dead by then.
    goHasEnclosingNilGuard(ident): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const declaration = checker.getSymbolAtLocation(ident)?.valueDeclaration;
        if (this.goLocalIsRebound(this.goEnclosingFunction(declaration ?? ident), ident)) {
            return false;
        }
        let child = ident;
        let parent = ident?.parent;
        while (parent !== undefined) {
            const kind = parent.kind;
            if ((kind === ts.SyntaxKind.ParenthesizedExpression) || (kind === ts.SyntaxKind.VariableStatement)
                || (kind === ts.SyntaxKind.ExpressionStatement) || (kind === ts.SyntaxKind.Block)
                || (kind === ts.SyntaxKind.ReturnStatement) || (kind === ts.SyntaxKind.ElementAccessExpression)
                || (kind === ts.SyntaxKind.CallExpression) || (kind === ts.SyntaxKind.PropertyAccessExpression)
                || (kind === ts.SyntaxKind.ObjectLiteralExpression) || (kind === ts.SyntaxKind.PropertyAssignment)
                || (kind === ts.SyntaxKind.ArrayLiteralExpression) || (kind === ts.SyntaxKind.AwaitExpression)
                || (kind === ts.SyntaxKind.CaseClause) || (kind === ts.SyntaxKind.SwitchStatement)
                || (kind === ts.SyntaxKind.DoStatement) || (kind === ts.SyntaxKind.LabeledStatement)) {
                // the guard still dominates everything below such a wrapper
                child = parent;
                parent = parent.parent;
                continue;
            }
            if (kind === ts.SyntaxKind.BinaryExpression) {
                const op = parent.operatorToken?.kind;
                if ((op === ts.SyntaxKind.AmpersandAmpersandToken) && (child === parent.right)
                    && this.goConditionProvesNonNil(parent.left, ident)) {
                    return true;
                }
                // `a || b` and a left conjunct are evaluated before the guard, so they
                // prove nothing; the guard of an enclosing construct still applies
                child = parent;
                parent = parent.parent;
                continue;
            }
            if (kind === ts.SyntaxKind.IfStatement) {
                if ((child === parent.thenStatement) && this.goConditionProvesNonNil(parent.expression, ident)) {
                    return true;
                }
                child = parent;
                parent = parent.parent;
                continue;
            }
            if (kind === ts.SyntaxKind.WhileStatement) {
                if ((child === parent.statement) && this.goConditionProvesNonNil(parent.expression, ident)) {
                    return true;
                }
                child = parent;
                parent = parent.parent;
                continue;
            }
            if (kind === ts.SyntaxKind.ForStatement) {
                if ((child === parent.statement) && this.goConditionProvesNonNil(parent.condition, ident)) {
                    return true;
                }
                child = parent;
                parent = parent.parent;
                continue;
            }
            if (kind === ts.SyntaxKind.ConditionalExpression) {
                if ((child === parent.whenTrue) && this.goConditionProvesNonNil(parent.condition, ident)) {
                    return true;
                }
                child = parent;
                parent = parent.parent;
                continue;
            }
            // functions, classes and everything else the scan does not model: the
            // guard cannot be carried across
            return false;
        }
        return false;
    }

    // the whole condition, or any conjunct of its `&&` chain, is the non-nil test
    goConditionProvesNonNil(condition, ident): boolean {
        const inner = this.goUnwrapParenthesizedNode(condition);
        if (inner === undefined) {
            return false;
        }
        if (this.goIsNonNilTestOf(inner, ident)) {
            return true;
        }
        if (inner.kind !== ts.SyntaxKind.BinaryExpression) {
            return false;
        }
        if (inner.operatorToken?.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
            return false;
        }
        return this.goConditionProvesNonNil(inner.left, ident) || this.goConditionProvesNonNil(inner.right, ident);
    }

    goUnwrapParenthesizedNode(node) {
        let current = node;
        while (current?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            current = current.expression;
        }
        return current;
    }

    // an operand a short-circuit may skip without any observable difference: no calls,
    // no assignments, nothing the helper would have evaluated exactly once
    goIsPureComparisonOperand(node): boolean {
        switch (node?.kind) {
        case ts.SyntaxKind.Identifier:
        case ts.SyntaxKind.NumericLiteral:
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        case ts.SyntaxKind.PropertyAccessExpression:
            return true;
        case ts.SyntaxKind.PrefixUnaryExpression:
            return (node.operator === ts.SyntaxKind.MinusToken) && this.goIsPureComparisonOperand(node.operand);
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goIsPureComparisonOperand(node.expression);
        }
        return false;
    }

    // Go's printer never wraps an already parenthesised expression: gofmt prints a
    // ParenExpr whose child is itself a ParenExpr without its own parentheses
    // (`((x))` prints as `(x)`), because the text it is handed is re-parsed that way.
    // Our output is re-parsed exactly like that, so a source parenthesis around an
    // expression that already prints parenthesised -- an inlined comparison, a nested
    // parenthesised expression, an EvalTruthy(...) arm -- must emit the single pair
    // gofmt keeps instead of doubling it.
    printParenthesizedExpression(node, identation) {
        const expression = node.expression;
        if (expression?.kind === ts.SyntaxKind.AsExpression) {
            // transform (this as any) into this, () and as any are not necessary
            return this.getIden(identation) + this.printNode(expression, 0);
        }
        if (expression?.kind === ts.SyntaxKind.ArrowFunction) {
            // ignore arrowFunctions inside parenthesis
            return "";
        }
        // parentheses undo one level of depth (go/printer reduceDepth())
        const printed = this.goWithExprDepth(this.goExprDepth - 1, () => this.printNode(expression, 0));
        if (this.goIsParenthesizedExpression(printed)) {
            return this.getIden(identation) + printed;
        }
        return this.getIden(identation) + this.LEFT_PARENTHESIS + printed + this.RIGHT_PARENTHESIS;
    }

    // true when the printed text is exactly one parenthesised expression: its first
    // `(` closes on the last non-space character. Literals and comments are skipped
    // so a parenthesis inside them cannot unbalance the scan.
    goIsParenthesizedExpression(printed: string): boolean {
        const text = printed.trimStart();
        if (text[0] !== '(') {
            return false;
        }
        let depth = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if ((c === '/') && (text[i + 1] === '/')) {
                // a trailing line comment belongs to the statement, not to the expression
                return false;
            }
            if ((c === '/') && (text[i + 1] === '*')) {
                const end = text.indexOf('*/', i + 2);
                if (end < 0) {
                    return false;
                }
                i = end + 1;
                continue;
            }
            if ((c === '"') || (c === '\'') || (c === '`')) {
                i = this.goSkipGoLiteral(text, i);
                if (i < 0) {
                    return false;
                }
                continue;
            }
            if (c === '(') {
                depth += 1;
            } else if (c === ')') {
                depth -= 1;
                if (depth === 0) {
                    return text.substring(i + 1).trim().length === 0;
                }
            }
        }
        return false;
    }

    // index of the quote closing the Go string/rune literal that starts at `start`, -1 when unterminated
    goSkipGoLiteral(text: string, start: number): number {
        const quote = text[start];
        for (let i = start + 1; i < text.length; i++) {
            const c = text[i];
            if (c === '\\') {
                i += 1;
                continue;
            }
            if (c === quote) {
                return i;
            }
        }
        return -1;
    }

    // castVariableAssignmentIfNeeded(left, right, identation) {
    //     const leftType = this.getChecker().getTypeAtLocation(left);
    //     const rightType = this.getChecker().getTypeAtLocation(right);

    //     const leftText = this.printNode(left, 0);
    //     const rightText = this.printNode(right, 0);

    //     if (this.isAnyType(rightType.flags) && !this.isAnyType(leftType.flags)) {
    //         const parsedType = this.getTypeFromRawType(leftType);
    //         return `${this.getIden(identation)}${leftText} = (${parsedType})${rightText}`;
    //     }
    //     return undefined;
    // }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        switch(rightSide) {
        case 'length':
                const type = (this.getChecker() as TypeChecker).getTypeAtLocation(expression); // eslint-disable-line
            // this.warnIfAnyType(node, type.flags, leftSide, "length");
            // rawExpression = this.isStringType(type.flags) ? `(string${leftSide}).Length` : `(${leftSide}.Cast<object>().ToList()).Count`;
            rawExpression = this.printInlineArrayLength(expression, leftSide, node) ?? (this.isStringType(type.flags) ? `GetLength(${leftSide})` : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`); // `(${leftSide}.Cast<object>()).ToList().Count`
            break;
        case 'push':
            rawExpression = `((IList<object>)${leftSide}).Add`;
            break;
            // case 'push':
            //     rawExpression = `(List<object>${leftSide}).Add`s
            //     break;
        }
        return rawExpression;
    }

    printCustomDefaultValueIfNeeded(node) {
        return undefined;
    }

    // The Go type of a GetArg-bound optional local (from the printed default, or the declared type
    // for a nil default), or undefined to keep `any`; the retype needs goLocalIsSafeToType,
    // goParameterKeepsNilCompareNative and goGetArgConsumersAreSafe to agree.
    goGetArgLocalType(body, param, printedDefault: string): string | undefined {
        const method: any = param?.parent;
        const excluded = GO_GETARG_EXCLUDED_POSITIONS[method?.name?.escapedText];
        if ((excluded !== undefined) && excluded.includes(method.parameters.indexOf(param))) {
            return undefined;
        }
        // an explicit `any` annotation admits values of other shapes than the default (api lists)
        if (param?.type?.kind === ts.SyntaxKind.AnyKeyword) {
            return undefined;
        }
        const shape = (printedDefault ?? '').trim();
        const byDefault = this.goGetArgTypeOfShape(shape);
        if (byDefault !== undefined) {
            return this.goGetArgLocalIsSafe(body, param, byDefault) ? byDefault : undefined;
        }
        if ((shape !== 'nil') && (shape !== 'undefined')) {
            return undefined;
        }
        for (const goType of this.goGetArgDeclaredTypeCandidates(param)) {
            if (this.goGetArgLocalIsSafe(body, param, goType, true)) {
                return goType;
            }
        }
        return undefined;
    }

    // the Go type the printed default names, or undefined when it names none
    goGetArgTypeOfShape(shape: string): string | undefined {
        if (/^map\[string\]any\{/.test(shape)) {
            return 'map[string]any';
        }
        if (/^\[map\[string\]any\]\{/.test(shape)) {
            return '[]map[string]any';
        }
        if (/^\[\]string\{/.test(shape)) {
            return '[]string';
        }
        if (/^\[\]any\{/.test(shape)) {
            return '[]any';
        }
        if (/^"/.test(shape)) {
            return 'string';
        }
        if ((shape === 'true') || (shape === 'false')) {
            return 'bool';
        }
        if (/^-?[0-9]/.test(shape) || /^math\./.test(shape)) {
            return 'int64';
        }
        return undefined;
    }

    // Go type candidates for a nil-defaulted parameter, in try order: the annotation text
    // (`Int` vs `Num` exist only there), then goNativeParameterTypeCandidates.
    goGetArgDeclaredTypeCandidates(param): string[] {
        const out: string[] = [];
        const declared = (param?.type !== undefined) ? String(param.type.getText()).replace(/\s+/g, ' ') : undefined;
        const alias: any = this.CCXT_GO_GETARG_DECLARED_TYPES ?? {};
        if ((declared !== undefined) && (alias[declared] !== undefined)) {
            out.push(alias[declared]);
        } else if ((declared !== undefined) && this.goGetArgPrimitiveType(declared) !== undefined) {
            out.push('*' + this.goGetArgPrimitiveType(declared));
        }
        for (const goType of this.goNativeParameterTypeCandidates(param)) {
            if (out.indexOf(goType) < 0) {
                out.push(goType);
            }
        }
        return out;
    }

    goGetArgPrimitiveType(declared: string): string | undefined {
        if ((declared === 'Int') || (declared === 'Integer') || (declared === 'int')) {
            return 'int64';
        }
        if ((declared === 'Num') || (declared === 'number') || (declared === 'Float')) {
            return 'float64';
        }
        if ((declared === 'Bool') || (declared === 'boolean')) {
            return 'bool';
        }
        if ((declared === 'Str') || (declared === 'string') || (declared === 'String')) {
            return 'string';
        }
        return undefined;
    }

    // the twin of a declared Go type (go/v4/exchange_helpers.go); undefined when the twin is
    // missing, in which case the parameter keeps the `any` box (an `any` return must never be
    // assigned to a typed local)
    goGetArgTwinName(goType: string): string | undefined {
        switch (goType) {
        case 'map[string]any': return 'GetArgMap';
        case '[]map[string]any': return 'GetArgMapSlice';
        case '[]string': return 'GetArgStringSlice';
        case '[]any': return 'GetArgAnySlice';
        case 'string': return 'GetArgString';
        case 'bool': return 'GetArgBool';
        case 'int64': return 'GetArgInt64';
        case 'float64': return 'GetArgFloat64';
        case '*string': return 'GetArgStringPtr';
        case '*int64': return 'GetArgInt64Ptr';
        case '*float64': return 'GetArgFloat64Ptr';
        case '*bool': return 'GetArgBoolPtr';
        }
        return undefined;
    }

    goGetArgIsValueType(goType: string): boolean {
        return (goType === 'string') || (goType === 'bool') || (goType === 'int64') || (goType === 'float64');
    }

    goGetArgLocalIsSafe(body, param, goType: string, nilable = false): boolean {
        const name = param.name.escapedText;
        if (this.goGetArgTwinName(goType) === undefined) {
            return false;                       // no twin for this type: keep the `any` box
        }
        if (!this.goLocalIsSafeToType(body, param, name, goType)) {
            return false;
        }
        if (this.goGetArgIsValueType(goType)) {
            // `x == nil` does not compile for a Go string/bool/int64/float64: keep the box
            return this.goParameterKeepsNilCompareNative(body, param, goType);
        }
        return this.goGetArgConsumersAreSafe(body, param, goType, nilable);
    }

    // Every later use must read the typed local as it read the `any` box: pointers only reach
    // audited deref consumers (fail-closed); containers are the same map/list, and nil-sensitive
    // consumers are tabled as `container` (goGetArgPassesIntoContainerDefault covers call chains).
    goGetArgConsumersAreSafe(body, param, goType: string, nilable: boolean): boolean {
        const name = param.name.escapedText;
        const table: any = this.CCXT_GO_GETARG_SAFE_CONSUMERS ?? {};
        const pointer = goType.startsWith('*');
        let safe = true;
        const verdictOf = (callee: string, argIndex: number): string => {
            const entry = table[callee];
            if (entry === undefined) {
                // a nil-defaulted container may be handed back through `any` as a non-nil typed nil
                return (pointer || nilable) ? 'unknown' : 'deref';
            }
            if (typeof entry === 'string') {
                return entry;
            }
            return entry[String(argIndex)] ?? entry['*'] ?? (pointer ? 'unknown' : 'deref');
        };
        const visit = (n: any): void => {
            if (!safe) {
                return;
            }
            if ((n?.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name)) {
                let symbol;
                try {
                    symbol = this.getChecker().getSymbolAtLocation(n);
                } catch (e) {
                    symbol = undefined;
                }
                if (symbol?.valueDeclaration === param) {
                    const parent: any = n.parent;
                    if (parent?.kind === ts.SyntaxKind.BinaryExpression) {
                        const other: any = (parent.left === n) ? parent.right : parent.left;
                        const isNullTest = (other?.kind === ts.SyntaxKind.NullKeyword)
                            || ((other?.kind === ts.SyntaxKind.Identifier) && (other.escapedText === 'undefined'));
                        if (isNullTest) {
                            // `x == nil` / `x != nil`: native for a pointer and for a container
                            // (a nil map compares equal to nil exactly like the untyped nil box
                            // did when the value came in untyped); a value type never gets here.
                            safe = true;
                            return;
                        }
                    }
                    if (parent?.kind === ts.SyntaxKind.CallExpression) {
                        const args: any[] = parent.arguments ?? [];
                        const argIndex = args.indexOf(n);
                        const callee: any = parent.expression;
                        const calleeName = (callee?.name !== undefined) ? callee.name.escapedText
                            : ((callee?.escapedText !== undefined) ? callee.escapedText : undefined);
                        if (calleeName === undefined) {
                            safe = !pointer && !nilable;
                            return;
                        }
                        const verdict = verdictOf(calleeName, argIndex);
                        if (verdict === 'unsafe') {
                            safe = false;
                            return;
                        }
                        if ((verdict === 'container') && nilable) {
                            safe = false;
                            return;
                        }
                        if ((calleeName === 'IsEqual') && nilable) {
                            // IsEqual(x, nil) tests the *box*: an untyped nil answered true, a nil
                            // map is not equal to nil
                            const other: any = (argIndex === 0) ? args[1] : args[0];
                            const otherIsNil = (other === undefined) || (other?.kind === ts.SyntaxKind.NullKeyword)
                                || ((other?.kind === ts.SyntaxKind.Identifier) && (other.escapedText === 'undefined'));
                            if (otherIsNil) {
                                safe = false;
                                return;
                            }
                        }
                        if (verdict === 'unknown') {
                            safe = false;
                            return;
                        }
                        if (nilable && !pointer && this.goGetArgPassesIntoContainerDefault(callee, argIndex)) {
                            safe = false;
                            return;
                        }
                        safe = true;
                        return;
                    }
                    if (parent?.kind === ts.SyntaxKind.ExpressionStatement) {
                        safe = true;                 // `_ = x` and other inert statements
                        return;
                    }
                    // a bare read hands the local on as `any`: a pointer or a nil-defaulted container would
                    // no longer compare equal to nil there, so both keep the box
                    safe = !pointer && !nilable;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(body, visit);
        return safe;
    }

    // the callee's own GetArg with a container default returns def for an untyped nil box but the
    // nil map for a nil map box (nil slices collapse to def), so only map shapes differ
    goGetArgPassesIntoContainerDefault(callee: any, argIndex: number): boolean {
        if (argIndex < 0) {
            return false;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(callee);
        } catch (e) {
            symbol = undefined;
        }
        const decl: any = symbol?.valueDeclaration;
        const params: any[] = decl?.parameters ?? [];
        const param: any = params[argIndex];
        const initializer: any = param?.initializer;
        if (initializer === undefined) {
            return false;
        }
        return initializer.kind === ts.SyntaxKind.ObjectLiteralExpression;
    }

    printFunctionBody(node, identation, wrapInChannel = false) {

        // check if there is any default parameter to initialize
        let functionBody: string;
        const funcParams = node.parameters;
        const initParams = [];
        if (funcParams.length > 0) {
            const body = node.body.statements;
            const first = body.length > 0 ? body[0] : [];
            const remaining = body.length > 0 ? body.slice(1): [];
            let firstStatement = this.printNode(first, identation + 1);

            const remainingString = remaining.map((statement) => this.printNode(statement, identation + 1)).join("\n");
            let offSetIndex = 0;
            funcParams.forEach((param, i) => {
                const initializer = param.initializer;
                if (initializer) {
                    const index = i + offSetIndex;
                    // index = index < 0 ? 0 : i - 1;
                    const paramName = this.printNode(param.name, 0);
                    const printedDefault = this.printNode(initializer, 0);
                    // a default that names a Go type exactly binds through its typed twin; others keep GetArg (ABI unchanged)
                    const goType = this.goGetArgLocalType(node.body, param, printedDefault);
                    const twinName = (goType !== undefined) ? this.goGetArgTwinName(goType) : undefined;
                    if ((goType !== undefined) && (twinName !== undefined)) {
                        initParams.push(`var ${paramName} ${goType} = ${twinName}(optionalArgs, ${index}, ${printedDefault})`);
                    } else {
                        initParams.push(`${paramName} := GetArg(optionalArgs, ${index}, ${printedDefault})`);
                    }
                    initParams.push(`_ = ${paramName}`);
                } else {
                    offSetIndex--;
                }
            });

            if (initParams.length > 0) {
                const defaultInitializers = initParams.map( l => this.getIden(identation+1) + l ).join("\n") + "\n";
                const bodyParts = firstStatement.split("\n");
                const commentPart = bodyParts.filter(line => this.isComment(line));
                const isComment = commentPart.length > 0;
                if (isComment) {
                    // the statement's leading comment must keep the ' * ' continuation-alignment
                    // of printLeadingComments: gofmt re-indents a /* */ block to
                    // `<indent> * text` (printer.stripCommonPrefix + the tab indent), so a bare
                    // trim() here would emit `* text` under the '/**'.
                    const commentPartString = commentPart.map((c) => {
                        const line = c.trim();
                        return this.getIden(identation+1) + (line.startsWith("*") ? " " + line : line);
                    }).join("\n");
                    const firstStmNoComment = bodyParts.filter(line => !this.isComment(line)).join("\n");
                    firstStatement = commentPartString + "\n" + defaultInitializers + firstStmNoComment;
                } else {
                    firstStatement = defaultInitializers + firstStatement;
                }
            }
            const blockOpen = this.getBlockOpen(identation);
            const blockClose = this.getBlockClose(identation);
            firstStatement = remainingString.length > 0 ? firstStatement + "\n" : firstStatement;
            if (!wrapInChannel) {
                functionBody = blockOpen + firstStatement + remainingString + blockClose;
            } else {
                functionBody = firstStatement + remainingString;
            }
        } else {
            if (!wrapInChannel) {
                functionBody = super.printFunctionBody(node, identation);
            } else {
                functionBody = node.body.statements.map(statement => {
                    // if (statement.kind === ts.SyntaxKind.ReturnStatement) {
                    //     if (statement?.expression) {
                    //         return this.getIden(identation) + "ch <-" + this.printNode(statement.expression) + '\n' + this.getIden(identation) + "return " + this.printNode(statement.expression);
                    //     }
                    // }
                    return this.printNode(statement, identation + 1);
                }).join("\n");

            }
        }
        if (wrapInChannel) {
            // return statement might be inside ifs or other complex statements so we still have to replace them manually :(
            // functionBody = functionBody.replace(/(\s*)return\s+([^\n]+\n?)/g, '$1ch <- $2$1');
            const functionBodySplit = functionBody.split("\n");
            // the body half of the trampoline pair is a flat function body: the statements
            // are already printed at their own level (the `defer` lines below sit at the
            // same level), so no extra indentation level is added here
            const bodyWithIndentationExtraAndNoReturn = functionBodySplit.join("\n");
            let shouldAddLastReturn = true;

            // const bodySplit = bodyWithIndentationExtraAndNoReturn.split("\n");
            const bodySplit = functionBodySplit;
            const lastLine = bodySplit[bodySplit.length - 1];
            if (lastLine.trim().startsWith("return") || lastLine.trim().startsWith("panic")) {
                shouldAddLastReturn = false;
            }

            // Check if the function body ends with a conditional that has returns in all branches
            if (node.body && this.blockEndsWithConditionalReturn(node.body.statements)) {
                shouldAddLastReturn = false;
            }

            const lastReturn = shouldAddLastReturn ? this.getIden(identation+1) + "return nil" : "";

            // This is the *body* half of the trampoline pair (see printAsyncTrampolineBlock):
            //
            //     func (this *Exchange) fetchTickerBody(ch chan any, symbol any) any {
            //         defer close(ch)
            //         defer ReturnPanicError(ch)
            //         ch <- ...
            //         return nil
            //     }
            //
            // It is a plain flat function: the trampoline already `go`es it, so there is no
            // `go func() any {...}()` envelope here, and no channel allocation either — the
            // trampoline owns `ch` and hands it in. The recover lives HERE, on the goroutine
            // that can actually panic, which is why the trampoline's result can stay unnamed.
            const lines = [
                "{",
                `${this.getIden(identation + 1)}defer close(ch)`,
                `${this.getIden(identation + 1)}defer ReturnPanicError(ch)`,
                bodyWithIndentationExtraAndNoReturn,
            ];
            if (lastReturn) {
                lines.push(lastReturn);
            }
            lines.push(`${this.getIden(identation)}}`);
            functionBody = lines.join("\n");

            // to do fix this later
            // we can't pass nil to the channel when we just want to
            // return from the try catch, otherwise the channel will close with nil
            // instead of the proper result
            functionBody = functionBody.replaceAll(/(^\s*)ch\s<-\snil\s+return\snil(\s*\})/gm, "$1return nil$2");

        }

        return functionBody;
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        if (expression.startsWith("<-")) {
            return expression;
        }
        return `(<-${expression})`;
    }

    printInstanceOfExpression(node: BinaryExpression, identation: number): string {
        const left = this.printNode (node.left);
        const right = this.printNode (node.right);
        return this.getIden(identation) + `IsInstance(${left}, ${right})`;
    }

    getRandomNameSuffix() {
        return Math.floor(Math.random() * 1000000).toString();
    }

    getLineBasedSuffix(node): string {
        const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        return `${line}${character}`;
    }

    printExpressionStatement(node, identation) {

        if (node?.expression?.kind === ts.SyntaxKind.AsExpression) {
            node = node.expression;
        }
        if (node.expression.kind !== ts.SyntaxKind.AwaitExpression) {
            return this.stripWhitespaceOnlyLines (super.printExpressionStatement(node, identation));
        }

        const exprStm = this.printNode(node.expression, identation);

        // const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        // console.log(`line: ${line}, character: ${character}`);
        const returnRandName = "retRes" + this.getLineBasedSuffix(node);

        // const expStatement =this.getIden(identation) + exprStm + this.LINE_TERMINATOR;

        // the awaited call's value is discarded here (`await this.loadMarkets();`), so the
        // extension may still name it: `var retResNNN T = MapTyped(PanicOnError(<-...))`
        const stmtUnbox = this.goAwaitReceiveUnbox(node.expression, exprStm);
        const expStatement = (stmtUnbox !== undefined)
            ? `
${this.getIden(identation)}var ${returnRandName} ${stmtUnbox.goType} = ${stmtUnbox.wrap(exprStm)}`
            : `
${this.getIden(identation)}${returnRandName} := ${exprStm}
${this.getIden(identation)}PanicOnError(${returnRandName})`;
        return this.printNodeCommentsIfAny(node, identation, expStatement);
    }

    isInsideAsyncFunction(returnStatementNode) {
        let currentNode = returnStatementNode;

        while (currentNode) {
            // Check if the current node is a function or method
            if (ts.isFunctionDeclaration(currentNode) ||
              ts.isFunctionExpression(currentNode) ||
              ts.isArrowFunction(currentNode) ||
              ts.isMethodDeclaration(currentNode)) {
                return this.isAsyncFunction(currentNode);
            }
            // Move up the tree to the parent node
            currentNode = currentNode.parent;
        }

        // Return false if no async function or method is found
        return false;
    }

    /**
     * Statement that terminates an async (channel returning) function body.
     *
     * The body is the trampoline's sibling method (`go this.fetchTickerBody(ch, ...)`),
     * and the synthetic try/catch closures nest inside it: in both cases `return` leaves
     * a function whose result is a plain `any`, never the channel. The trampoline itself
     * owns the single `return ch`, emitted by printFunctionBody.
     */
    getAsyncReturnStatement(node): string {
        return "return nil";
    }

    printReturnStatement(node, identation) {

        const isAsyncFunction = this.isInsideAsyncFunction(node);
        // if (node?.expression?.kind !== ts.SyntaxKind.AwaitExpression) {
        //     return super.printReturnStatement(node, identation);
        // }
        if (!isAsyncFunction) {
            return super.printReturnStatement(node, identation);
        }

        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        const exp =  node.expression;
        let rightPart = exp ? (' ' + this.printNode(exp, identation)) : '';
        rightPart = rightPart.trim();

        // `return nil` only exits the synthetic try/catch closure; at the function's own
        // level the async core has to hand the (named) result channel back instead.
        const returnStatement = this.getAsyncReturnStatement(node);

        if (node?.expression?.kind === ts.SyntaxKind.AsExpression) {
            node = node.expression;
        }

        if (node?.expression?.kind === ts.SyntaxKind.AwaitExpression) {
            // const returnRandName = "retRes" + this.getRandomNameSuffix();
            const returnRandName = "retRes" + this.getLineBasedSuffix(node.expression);
            // the template's `:= ` already supplies the separator; keep the printed expression
            // flush so the receive reads `retResNNN := (<-this.X())` (gofmt spacing)
            const printedExpr = rightPart;
            rightPart = rightPart ? rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
            // return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
            // printLeadingComments returns the comment lines with their own indentation and a
            // trailing newline, so the comment is emitted as its own line(s) and the `ch <-`
            // line carries the indentation the comment would otherwise have swallowed.
            const retUnbox = this.goAwaitReceiveUnbox(node.expression, printedExpr);
            if (retUnbox !== undefined) {
                return `
${this.getIden(identation)}var ${returnRandName} ${retUnbox.goType} = ${retUnbox.wrap(printedExpr)}
${leadingComment}${this.getIden(identation)}ch <- ${returnRandName}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
            }
            return `
${this.getIden(identation)}${returnRandName} := ${rightPart}
${this.getIden(identation)}PanicOnError(${returnRandName})
${leadingComment}${this.getIden(identation)}ch <- ${returnRandName}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
            // ${this.getIden(identation)}return ${returnRandName}`;
        }

        if (rightPart.length === 0) {
            return `\n${this.getIden(identation)}${returnStatement}`;
        }

        return `
${leadingComment}${this.getIden(identation)}ch <- ${rightPart}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
        // ${this.getIden(identation)}return ${rightPart}`;
        // ${this.getIden(identation)}return ${rightPart}`;
    }


    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === ts.SyntaxKind.AnyKeyword) {
            // return `(()${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.StringKeyword) {
            // return `((string)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.ArrayType) {
            // if (type.elementType.kind === ts.SyntaxKind.AnyKeyword) {
            //     return `(IList<object>)(${this.printNode(node.expression, identation)})`;
            // }
            // if (type.elementType.kind === ts.SyntaxKind.StringKeyword) {
            //     return `(IList<string>)(${this.printNode(node.expression, identation)})`;
            // }
        }

        return this.printNode(node.expression, identation);
    }

    printArrayLiteralExpression(node, identation = 0) {

        let arrayOpen = this.ARRAY_OPENING_TOKEN;
        const elems = node.elements;

        // elements that span lines (object literals, calls carrying one) need the
        // statement's own level so their bodies land one level deeper
        // …but an element is inline after `{`, so any leading indent a printer prepends is trimmed
        // go/printer prints composite literal elements at depth 1 (exprList(..., 1, ...))
        const elements = node.elements.map((e) => this.goWithExprDepth(1, () => this.printNode(e, identation)).trim()).join(", ");

        // take into consideration list of promises
        if (elems.length > 0) {
            const first = elems[0];
            if (first.kind === ts.SyntaxKind.CallExpression) {
                // const type = this.getChecker().getTypeAtLocation(first);
                const type = this.getFunctionType(first);
                // const parsedType = this.getTypeFromRawType(type);
                // parsedType === "Task" ||
                // to do check this later
                if (type === undefined || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
                    // if (type === undefined) {
                    arrayOpen = "[]any{";
                    // }
                    //  else {
                    //     arrayOpen = "new List<Task<object>> {";
                    // }
                } else {
                    // type = 'object';
                    // check this out later
                    // if (type === 'Task<List<object>>') {
                    //     type = 'Task<object>';
                    // }
                    // if (type === 'string'){
                    //     type = 'object';
                    // }
                    // type =
                    arrayOpen = `[]any{`;
                }
            }
        }

        return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
    }

    printArgsForCallExpression(node, identation) {
        const args = node.arguments;
        let parsedArgs  = "";
        if (false && this.requiresCallExpressionCast && !this.isBuiltInFunctionCall(node?.expression)) { //eslint-disable-line
            const parsedTypes = this.getTypesFromCallExpressionParameters(node);
            const tmpArgs = [];
            args.forEach((arg, index) => {
                const parsedType = parsedTypes[index];
                let cast = "";
                if (parsedType !== "object" && parsedType !== "float" && parsedType !== "int") {
                    cast = parsedType ? `(${parsedType})` : '';
                }
                tmpArgs.push(cast + this.printNode(arg, identation).trim());
            });
            parsedArgs = tmpArgs.join(",");
            return parsedArgs;
        }
        // go/printer prints the arguments of a call with more than one argument
        // one level deeper than the call itself (nodes.go, CallExpr)
        if (node.arguments && node.arguments.length > 1) {
            return this.goWithExprDepth(this.goExprDepth + 1, () => super.printArgsForCallExpression(node, identation));
        }
        return super.printArgsForCallExpression(node, identation);
    }

    // check this out later

    // IsArray(v) answers true exactly for the slice types its runtime type switch lists
    // and false for every other box, a nil box included. On an operand whose Go type the
    // printer can name the predicate is that constant.
    isArraySliceTypes = [ '[]any', '[][]any', '[]map[string]any', '[]string', '[]bool',
        '[]int', '[]int8', '[]int16', '[]int32', '[]int64', '[]float32', '[]float64',
        '[]uint', '[]uint8', '[]uint16', '[]uint32', '[]uint64' ];

    // the other Go types the printer can name: a map, a string, a bool, a number, or a
    // pointer to a scalar — none of them is a slice the switch matches
    isArrayNonSliceTypes = [ 'map[string]any', 'string', 'bool', 'int', 'int64', 'float64',
        '*string', '*int64', '*float64', '*bool', '*int' ];

    // true when the identifier keeps a reference besides this one: the constant fold
    // drops the call's reference to the operand, and Go rejects a local that ends up
    // unused, so an operand without another use keeps the helper
    goIdentifierUsedElsewhere(nameNode): boolean {
        const scope = this.goEnclosingFunction(nameNode);
        if (scope === undefined) {
            return false;
        }
        const name = nameNode.escapedText;
        let used = false;
        const visit = (n) => {
            if (used) {
                return;
            }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name) && (n !== nameNode)) {
                const parent = n.parent;
                const isDeclarationName = (parent?.kind === ts.SyntaxKind.VariableDeclaration) && (parent.name === n);
                const isPropertyName = (parent?.kind === ts.SyntaxKind.PropertyAccessExpression) && (parent.name === n);
                if (!isDeclarationName && !isPropertyName) {
                    used = true;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return used;
    }

    // the local is printed `any` yet every value that reaches it is a []any: it starts
    // from a slice initializer and no later statement rebinds it (a push only appends
    // to the same slice), so the box holds a []any at every use
    goLocalHoldsOnlyArrays(nameNode): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(nameNode);
        const declaration: any = symbol?.valueDeclaration;
        if ((declaration?.kind !== ts.SyntaxKind.VariableDeclaration) || (declaration.initializer === undefined)) {
            return false;
        }
        if (this.goTypeOfInitializer(declaration.initializer, this.printNode(declaration.initializer, 0)) !== '[]any') {
            return false;
        }
        const scope = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        const name = declaration.name.escapedText;
        let safe = true;
        const visit = (n) => {
            if (!safe) {
                return;
            }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name) && (n !== declaration.name) && (n !== nameNode)) {
                const parent = n.parent;
                if (parent?.kind === ts.SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if (this.goRebindingTargetOf(n) !== undefined) {
                    safe = false; // a rebinding write can box another type
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
    }

    // native IsArray: a constant for an operand whose Go type the printer proves, and
    // the two-value assertion on an `any` box that only ever holds a []any
    printNativeIsArray(node, parsedArg: string | undefined): string | undefined {
        if ((typeof parsedArg !== 'string') || parsedArg.includes('\n')) {
            return undefined;
        }
        const argNode = node.arguments?.[0];
        if (argNode?.kind !== ts.SyntaxKind.Identifier) {
            return undefined; // a call operand may have effects and has no declared type
        }
        const goType = this.goPrintedTypeOfExpression(argNode, parsedArg);
        if (goType !== undefined) {
            const isSlice = this.isArraySliceTypes.indexOf(goType) >= 0;
            if (isSlice || (this.isArrayNonSliceTypes.indexOf(goType) >= 0)) {
                return this.goIdentifierUsedElsewhere(argNode) ? (isSlice ? 'true' : 'false') : undefined;
            }
            return undefined;
        }
        if (!this.goLocalHoldsOnlyArrays(argNode)) {
            return undefined;
        }
        // the box only ever holds a []any, so the assertion answers what the type switch
        // would and keeps the operand referenced
        const read = `_, ok := ${parsedArg}.([]any)`;
        if (11 + read.length + 2 + 'return ok'.length <= 100) {
            return `func() bool { ${read}; return ok }()`;
        }
        const level = this.goStatementLevel;
        return `func() bool {\n${this.getIden(level + 1)}${read}\n${this.getIden(level + 1)}return ok\n${this.getIden(level)}}()`;
    }

    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return this.printNativeIsArray(node, parsedArg) ?? `IsArray(${parsedArg})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `ObjectKeys(${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `ObjectValues(${parsedArg})`;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `JsonParse(${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `JsonStringify(${parsedArg})`; // make this customizable
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promiseAll(${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `MathFloor(${parsedArg})`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `MathRound(${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `MathCeil(${parsedArg})`;
    }

    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any) {
        return `IsInt(${parsedArg})`;
    }

    // the base printer prints a method-call argument at the statement's depth; the
    // emitted Go call has two or more arguments, which go/printer lays out one level
    // deeper (a native `a + b` argument then drops its blanks)
    goPrintCallArgument(argument, printedText: string | undefined): string | undefined {
        if (argument?.kind !== ts.SyntaxKind.BinaryExpression || printedText === undefined) {
            return printedText;
        }
        return this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(argument, 0)).trimStart();
    }

    printArrayPushCall(node: CallExpression, identation: number, name: string | undefined = undefined, parsedArg: string | undefined = undefined) {
        let returnValue = '';
        let returnRandName = name;
        parsedArg = this.goPrintCallArgument(node.arguments?.[0], parsedArg);
        // a `[]any` local is the slice itself, so it appends natively
        const nativeReceiver = this.goNativeAppendReceiver(node);
        if (nativeReceiver !== undefined) {
            return `${nativeReceiver} = append(${nativeReceiver}, ${parsedArg})`;
        }
        // a map/slice index or a GetValue box is not addressable: copy it into a local first
        if (name?.startsWith('GetValue') || /[\])]$/.test(name ?? '')) {
            returnRandName = "retRes" + this.getLineBasedSuffix(node);
            returnValue = `${returnRandName} := ${name}\n${this.getIden(identation)}`;
        }
        return  `${returnValue}AppendToArray(&${returnRandName}, ${parsedArg})`;
        // works with:
        //  func AppendToArray(slicePtr *any, element any)
        //  func AppendToArrayValue(slice any, element any) any
        //  func AppendToArraySafe(slice any, element any) any
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Contains(${name}, ${parsedArg})`;
    }

    // the Go type an `indexOf` operand is printed as, or undefined for anything Go cannot
    // hand to strings.Index: an `any` box (a parameter, a GetValue/Ternary result), a
    // number, a slice. The receiver and the needle both have to be Go strings
    goIndexOfOperandType(node, printedText: string): string | undefined {
        if (this.goIsAnyBoxExpression(node, printedText)) {
            return undefined;
        }
        if (node?.kind === ts.SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(node);
        }
        if (GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0) {
            return undefined;
        }
        return this.goStringCallStaticType(node, printedText) ?? this.goStringFieldStaticType(node, printedText);
    }

    // The ccxt writers assemble four outputs from a *slice* of the printer output (base-class files
    // after their TRANSPILED marker, ws cache tests after their first separator), which would cut off
    // the leading file-level import; they keep the helper until their writer adds the import itself.
    goFileKeepsFileLevelImports(): boolean {
        const fileName = this.getSrc()?.fileName ?? '';
        return !/(?:base\/Exchange(?:\.nooverloads\.\d+)?|base\/PredictionExchange|base\/test\.orderBook|base\/test\.cache)\.ts$/.test(fileName);
    }

    // `GetIndexOf(s, t)` is `strings.Index(s, t)` for a receiver declared `string` once `t` is a
    // string too (`target.(string)` succeeds; -1 is both not-found answers); a `*string` receiver
    // answers -1 when nil, reproduced by the nil guard. Slices and `any` boxes keep the helper.
    goNativeIndexOf(node, name, parsedArg): string | undefined {
        if ((typeof name !== 'string') || (typeof parsedArg !== 'string')) {
            return undefined;
        }
        if (name.includes('\n') || parsedArg.includes('\n')) {
            return undefined;
        }
        if (!this.goFileKeepsFileLevelImports()) {
            return undefined;
        }
        const receiver = node?.expression?.expression;
        const target = node?.arguments?.[0];
        if (this.goIndexOfOperandType(target, parsedArg) !== 'string') {
            return undefined; // a nilable/number needle answers -1 in the helper
        }
        const receiverType = this.goIndexOfOperandType(receiver, name);
        if (receiverType === 'string') {
            this.goFileStdlibImports.add('strings');
            return `strings.Index(${name}, ${parsedArg})`;
        }
        // the literal repeats the identifier, so the receiver is still read exactly once
        if ((receiverType === '*string') && (receiver?.kind === ts.SyntaxKind.Identifier)) {
            this.goFileStdlibImports.add('strings');
            const level = this.goStatementLevel;
            const body = this.getIden(level + 1);
            const inner = this.getIden(level + 2);
            return `func() int {\n${body}if ${name} == nil {\n${inner}return -1\n${body}}\n${body}return strings.Index(*${name}, ${parsedArg})\n${this.getIden(level)}}()`;
        }
        return undefined;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.goNativeIndexOf(node, name, parsedArg);
        if (native !== undefined) {
            return native;
        }
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    // A native string operation needs every operand to be a printed Go `string` — the helper takes
    // `any` and re-derives the same string, so a proven operand cannot change the result. A regex
    // literal is never a Go string (a pattern, not the helper's ToString value) and keeps the helper.
    goNativeStringOperands(operands: any[], texts: string[], expected: string[]): boolean {
        for (let i = 0; i < expected.length; i++) {
            const operand = operands[i];
            if (operand === undefined || operand.kind === ts.SyntaxKind.RegularExpressionLiteral) {
                return false;
            }
            if (this.goOperandStaticType(operand, texts[i]) !== expected[i]) {
                return false;
            }
        }
        return true;
    }

    // the emission entry point: undefined when the file's stdlib import could not be placed
    // (see goStdlibImportIsPlaceable), else the native call text, with the file-level import
    // recorded for printSourceFileStatements
    goNativeStringCall(nativeCall: string): string | undefined {
        if (!this.goStdlibImportIsPlaceable()) {
            return undefined;
        }
        this.goFileStdlibImports.add('strings');
        return nativeCall;
    }

    // The native string calls need `import "strings"` before the file's first declaration. Every ccxt
    // consumer splices the body at file head, except build/goTranspiler.ts#transpileBaseMethods and
    // #transpilePredictionBaseMethods; those keep the helper until getGoImports(file) declares it.
    goStdlibImportIsPlaceable(): boolean {
        return this.goFileKeepsFileLevelImports();
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.startsWith (p)` -> strings.HasPrefix
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['string', 'string'])) {
            const native = this.goNativeStringCall(`strings.HasPrefix(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `StartsWith(${name}, ${parsedArg})`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.endsWith (p)` -> strings.HasSuffix
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['string', 'string'])) {
            const native = this.goNativeStringCall(`strings.HasSuffix(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `EndsWith(${name}, ${parsedArg})`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `Trim(${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        // `a.join (sep)` -> strings.Join: only a declared `[]string` receiver can skip the
        // per-element ToString the helper applies to a []any
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['[]string', 'string'])) {
            const native = this.goNativeStringCall(`strings.Join(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Join(${name}, ${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.split (sep)` -> strings.Split, which keeps JS's empty trailing element
        // ("a," -> ["a", ""]) exactly like the helper's own strings.Split call
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['string', 'string'])) {
            const native = this.goNativeStringCall(`strings.Split(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Split(${name}, ${parsedArg})`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    // ToString is the identity on a Go string (exchange_helpers.go: derefScalar and `case string`
    // return it unchanged), so a receiver declared `string` prints as itself. An `any` box, a
    // *string (derefScalar answers nil), an int64 or a float64 keeps the helper's runtime formatting.
    printToStringCall(node, identation, name = undefined) {
        if ((name !== undefined) && (name.indexOf('\n') < 0)) {
            const receiver = (node?.expression?.kind === ts.SyntaxKind.PropertyAccessExpression)
                ? node.expression.expression
                : undefined;
            if ((receiver !== undefined) && (this.goOperandStaticType(receiver, name) === 'string')) {
                return name;
            }
        }
        return `ToString(${name})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Concat(${name}, ${parsedArg})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        // `s.toUpperCase ()` -> strings.ToUpper
        if (this.goNativeStringOperands([node.expression?.expression], [name], ['string'])) {
            const native = this.goNativeStringCall(`strings.ToUpper(${name})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `ToUpper(${name})`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        // `s.toLowerCase ()` -> strings.ToLower
        if (this.goNativeStringOperands([node.expression?.expression], [name], ['string'])) {
            const native = this.goNativeStringCall(`strings.ToLower(${name})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `ToLower(${name})`;
    }

    printShiftCall(node, identation, name = undefined) {
        return `Shift(${name})`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `Reverse(${name})`;
    }

    printPopCall(node, identation, name = undefined) {
        return `Pop(${name}))`;
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    // `x.slice(a)` / `x.slice(a, b)` prints `Slice(x, a, b)`, a JS slice on a string: a
    // negative bound counts from the end, a start-only call clamps its start to 0 and an
    // end past len is clamped to len, where Go's native slicing panics
    goSliceLiteralBound(node): number | undefined {
        if (node?.kind === ts.SyntaxKind.NumericLiteral) {
            const text = node.text;
            if (!/^\d+$/.test(text)) {
                return undefined;
            }
            const value = Number(text);
            return (value > 2147483647) ? undefined : value;
        }
        if ((node?.kind === ts.SyntaxKind.PrefixUnaryExpression) && (node.operator === ts.SyntaxKind.MinusToken)) {
            const operand = this.goSliceLiteralBound(node.operand);
            return (operand === undefined) ? undefined : -operand;
        }
        return undefined;
    }

    // the subscript for a string value, with the helper's own index arithmetic
    goSliceSubscript(value: string, start: number, hasEnd: boolean, end: number | undefined): string {
        const length = `len(${value})`;
        let startText;
        if (start >= 0) {
            startText = `${start}`;
        } else if (hasEnd) {
            startText = `${length} - ${-start}`;
        } else {
            startText = `max(${length} - ${-start}, 0)`;
        }
        if (!hasEnd) {
            return `${value}[${startText}:]`;
        }
        const endText = (end >= 0) ? `min(${end}, ${length})` : `${length} - ${-end}`;
        return `${value}[${startText}:${endText}]`;
    }

    // receiver of an inlinable `.slice(...)`: `string` prints a plain subscript and
    // `*string` a nil-guarded one, while anything else (an `any` box) keeps the helper.
    // A TS cast (`(id as string).slice(...)`) prints nothing, so it is transparent here.
    goSliceReceiverType(node): string | undefined {
        let receiverNode = node?.expression?.expression;
        while ((receiverNode?.kind === ts.SyntaxKind.AsExpression) || (receiverNode?.kind === ts.SyntaxKind.NonNullExpression)
            || (receiverNode?.kind === ts.SyntaxKind.ParenthesizedExpression)) {
            receiverNode = receiverNode.expression;
        }
        if (receiverNode?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const goType = this.goPrintedTypeOfExpression(receiverNode, '');
        return ((goType === 'string') || (goType === '*string')) ? goType : undefined;
    }

    // the integer-literal bounds of a `.slice(a, b)` call; undefined when a bound is an
    // expression, whose Go value is not provably a non-negative int the subscript could take
    goSliceLiteralBounds(node): { start: number, hasEnd: boolean, end: number } | undefined {
        const args = node?.arguments ?? [];
        const start = this.goSliceLiteralBound(args[0]);
        if (start === undefined) {
            return undefined;
        }
        const hasEnd = args.length > 1;
        const end = hasEnd ? this.goSliceLiteralBound(args[1]) : undefined;
        if (hasEnd && (end === undefined)) {
            return undefined;
        }
        return { start, hasEnd, end };
    }

    // true when this `.slice(a, b)` call prints native Go slicing of a string value
    goIsNativeSliceCall(node): boolean {
        if (node?.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = node.expression;
        if ((callee?.kind !== ts.SyntaxKind.PropertyAccessExpression) || (callee.name?.escapedText !== 'slice')) {
            return false;
        }
        if (this.goSliceReceiverType(node) === undefined) {
            return false;
        }
        return this.goSliceLiteralBounds(node) !== undefined;
    }

    // `x.slice(a, b)` -> `x[a:b]` when the receiver is a local the printer declares
    // `string` (or `*string`, which keeps the helper's nil -> "" branch as a guard) and
    // both bounds are integer literals. Any other bound or receiver keeps the helper.
    printInlineSlice(node, receiverText: string): string | undefined {
        if ((receiverText ?? '').includes('\n')) {
            return undefined;
        }
        const goType = this.goSliceReceiverType(node);
        if (goType === undefined) {
            return undefined;
        }
        const bounds = this.goSliceLiteralBounds(node);
        if (bounds === undefined) {
            return undefined;
        }
        const { start, hasEnd, end } = bounds;
        if (goType === 'string') {
            return this.goSliceSubscript(receiverText, start, hasEnd, end);
        }
        const level = this.goStatementLevel;
        const body = this.getIden(level + 1);
        const branch = this.getIden(level + 2);
        const subscript = this.goSliceSubscript('str', start, hasEnd, end);
        return `func() string {\n${body}if ${receiverText} == nil {\n${branch}return ""\n${body}}\n${body}str := *${receiverText}\n${body}return ${subscript}\n${this.getIden(level)}}()`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        parsedArg = this.goPrintCallArgument(node.arguments?.[0], parsedArg);
        parsedArg2 = this.goPrintCallArgument(node.arguments?.[1], parsedArg2);
        const nativeSlice = this.printInlineSlice(node, name);
        if (nativeSlice !== undefined) {
            return nativeSlice;
        }
        if (parsedArg2 === undefined){
            parsedArg2 = 'nil';
        }
        return `Slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // JS `replace` with a *string* pattern replaces the first occurrence only, which the
        // boxed helper (ReplaceAll for every argument) cannot express: with all three operands
        // proven strings, emit the count-1 form and the JS semantics exactly.
        if (parsedArg !== undefined && parsedArg2 !== undefined
            && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0], node.arguments?.[1]], [name, parsedArg, parsedArg2], ['string', 'string', 'string'])) {
            const native = this.goNativeStringCall(`strings.Replace(${name}, ${parsedArg}, ${parsedArg2}, 1)`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // `s.replaceAll (a, b)` replaces every occurrence, like the helper
        if (parsedArg !== undefined && parsedArg2 !== undefined
            && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0], node.arguments?.[1]], [name, parsedArg, parsedArg2], ['string', 'string', 'string'])) {
            const native = this.goNativeStringCall(`strings.ReplaceAll(${name}, ${parsedArg}, ${parsedArg2})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `PadEnd(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `PadStart(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printDateNowCall(node, identation) {
        return "DateNow()";
    }

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        // const type = (this.getChecker() as TypeChecker).getTypeAtLocation(node.expression); // eslint-disable-line
        // this.warnIfAnyType(node, type.flags, leftSide, "length");
        return `GetLength(${leftSide})`;
    }

    // printPostFixUnaryExpression(node, identation) {
    //     const {operand, operator} = node;
    //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
    //         return super.printPostFixUnaryExpression(node, identation);
    //     }
    //     const leftSide = this.printNode(operand, 0);
    //     const op = this.PostFixOperators[operator]; // todo: handle --
    //     if (op === '--') {
    //         return `postFixDecrement(ref ${leftSide})`;
    //     }
    //     return `postFixIncrement(ref ${leftSide})`;
    // }

    // printPrefixUnaryExpression(node, identation) {
    //     const {operand, operator} = node;
    //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
    //         return super.printPrefixUnaryExpression(node, identation);
    //     }
    //     if (operator === ts.SyntaxKind.ExclamationToken) {
    //         // not branch check falsy/turthy values if needed;
    //         return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    //     }
    //     const leftSide = this.printNode(operand, 0);
    //     if (operator === ts.SyntaxKind.PlusToken) {
    //         return `prefixUnaryPlus(ref ${leftSide})`;
    //     } else {
    //         return `prefixUnaryNeg(ref ${leftSide})`;
    //     }
    // }

    printConditionalExpression(node, identation) {
        const condition = this.goWithExprDepth(1, () => this.printCondition(node.condition, 0));
        if (!condition.includes('\n')) {
            const whenTrue = this.goPrintTernaryBranch(node.whenTrue, 2);
            const whenFalse = this.goPrintTernaryBranch(node.whenFalse, 1);
            const inlined = this.printInlineTernary(condition, whenTrue, whenFalse, this.goTernaryResultType(node.whenTrue, whenTrue, node.whenFalse, whenFalse));
            if (inlined !== undefined) {
                return inlined;
            }
        }
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);
        return `Ternary(${condition}, ${whenTrue}, ${whenFalse})`;
    }

    printDeleteExpression(node, identation) {
        const object = this.printNode (node.expression.expression, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        return `Remove(${object}, ${key})`;
    }

    printThrowStatement(node, identation) {
        // const expression = this.printNode(node.expression, 0);
        // return this.getIden(node) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            return this.getIden(identation) + 'panic(' + this.printNode(node.expression, 0) + ')' + this.LINE_TERMINATOR;
        }
        if (node.expression.kind === ts.SyntaxKind.NewExpression) {
            const expression = node.expression;
            // handle throw new Error (Message)
            // and throw new x[a] (message)
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map(n => this.printNode(n, 0)).join(",") ?? '';
            const newExpression =  this.printNode(expression.expression, 0);
            if (expression.expression.kind === ts.SyntaxKind.Identifier) {
                // handle throw new X
                const id = expression.expression;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.InterfaceDeclaration ||  l.kind === ts.SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        // return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${id.escapedText} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
                    } else {
                        // Go has no statement terminator: the two statements go on
                        // their own lines (gofmt splits `a; b` exactly like this)
                        return this.getIden(identation) + `throwDynamicException(${id.escapedText}, ${parsedArg})\n${this.getIden(identation)}return nil`;
                    }
                }
                return this.getIden(identation) + `panic(${id.escapedText}(${parsedArg}))${this.LINE_TERMINATOR}`;
            } else if (expression.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg})`;
            }
            return super.printThrowStatement(node, identation);
        }
        // const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
        // const newExpression = node.expression?.expression?.escapedText;
        // // newExpression = newExpression ? newExpression : this.printNode(node.expression.expression, 0); // new Exception or new exact[string] check this out
        // // const args = node.expression?.arguments.map(n => this.printNode(n, 0)).join(",");
        // // const throwExpression = ` ${newToken}${newExpression}${this.LEFT_PARENTHESIS}((string)${args})${this.RIGHT_PARENTHESIS}`;
        // return this.getIden(identation) + this.THROW_TOKEN + throwExpression + this.LINE_TERMINATOR;
    }

    // -----------------------------------------------------------------------
    // gofmt-compatible spacing of the binary expressions this printer emits
    // -----------------------------------------------------------------------
    // go/printer (nodes.go) prints a binary expression with blanks around the
    // operator unless the expression sits deeper than the top level of a
    // statement: binaryExpr() asks cutoff() - which inspects the operator tree
    // through walkBinary() - and drops *both* blanks when the operator
    // precedence is below that cutoff. Level 4/5 operators (`+ - * / % & | ^
    // << >>`) therefore print as `a + b` at the top level but as `a+b`, `a[i+1]`
    // one level down; comparisons and `&&`/`||` (level 3 and below) always keep
    // their blanks.
    //
    // goExprDepth mirrors the depth go/printer tracks over the Go AST it is
    // about to emit: 1 at the start of every statement, +1 for an argument list
    // with more than one argument, +1 for an index expression, +1 for the right
    // operand of a binary expression, -1 inside parentheses (never below 1), and
    // back to 1 for composite literal elements.
    goExprDepth = 1;

    goWithExprDepth<T>(depth: number, callback: () => T): T {
        const previous = this.goExprDepth;
        this.goExprDepth = depth < 1 ? 1 : depth;
        try {
            return callback();
        } finally {
            this.goExprDepth = previous;
        }
    }

    // go/token precedence of the operators this printer can print natively
    // (5 `* / % << >> & &^`, 4 `+ - | ^`, 3 comparisons, 2 `&&`, 1 `||`)
    goOperatorPrecedence(operator: string): number {
        switch (operator) {
        case '*': case '/': case '%': case '<<': case '>>': case '&': case '&^':
            return 5;
        case '+': case '-': case '|': case '^':
            return 4;
        case '==': case '!=': case '<': case '<=': case '>': case '>=':
            return 3;
        case '&&':
            return 2;
        case '||':
            return 1;
        }
        return 0;
    }

    // the operator string a node is printed as when it stays a Go binary
    // expression, or undefined when the node becomes a helper call or is not
    // binary at all - a primary expression, which walkBinary() never looks into
    goNativeBinaryOperator(node): string | undefined {
        if (!node || !ts.isBinaryExpression(node)) {
            return undefined;
        }
        const kind = node.operatorToken.kind;
        if (kind === ts.SyntaxKind.EqualsToken || kind === ts.SyntaxKind.PlusEqualsToken ||
            kind === ts.SyntaxKind.MinusEqualsToken || kind === ts.SyntaxKind.InKeyword ||
            kind === ts.SyntaxKind.InstanceOfKeyword || kind in this.binaryExpressionsWrappers) {
            return undefined;
        }
        const operator = this.SupportedKindNames[kind];
        return this.goOperatorPrecedence(operator) > 0 ? operator : undefined;
    }

    // walkBinary(): has4 / has5 / maxProblem of the operator tree that is about
    // to be printed. Operands that stay binary expressions are walked, every
    // other operand is a primary expression and stops the walk - the same
    // boundary go/printer draws for parens and calls.
    goWalkBinary(operator: string, left, right, rightText: string) {
        const precedence = this.goOperatorPrecedence(operator);
        let has4 = precedence === 4;
        let has5 = precedence === 5;
        let maxProblem = 0;
        const leftOperator = this.goNativeBinaryOperator(left);
        if (leftOperator !== undefined && this.goOperatorPrecedence(leftOperator) >= precedence) {
            const info = this.goWalkBinary(leftOperator, left.left, left.right, '');
            has4 = has4 || info.has4;
            has5 = has5 || info.has5;
            maxProblem = Math.max(maxProblem, info.maxProblem);
        }
        const rightOperator = this.goNativeBinaryOperator(right);
        if (rightOperator !== undefined && this.goOperatorPrecedence(rightOperator) > precedence) {
            const info = this.goWalkBinary(rightOperator, right.left, right.right, '');
            has4 = has4 || info.has4;
            has5 = has5 || info.has5;
            maxProblem = Math.max(maxProblem, info.maxProblem);
        } else if (rightOperator === undefined) {
            // `/*`, `&&`, `&^` and the `+ +` / `- -` pairs must keep a blank so
            // that the two tokens cannot glue into a different operator
            const pair = operator + rightText.replace(/^[ \t]+/, '').slice(0, 1);
            if (pair === '/*' || pair === '&&' || pair === '&^') {
                maxProblem = 5;
            } else if (pair === '++' || pair === '--') {
                maxProblem = Math.max(maxProblem, 4);
            }
        }
        return { has4, has5, maxProblem };
    }

    // the separator gofmt puts around a natively printed operator: `' '` keeps
    // the blanks, `''` drops them (go/printer cutoff())
    goBinarySeparator(operator: string, rightText: string, left, right): string {
        const precedence = this.goOperatorPrecedence(operator);
        if (precedence < 4) {
            // level 3 and below always keep both blanks
            return ' ';
        }
        const { has4, has5, maxProblem } = this.goWalkBinary(operator, left, right, rightText);
        let cutoff;
        if (maxProblem > 0) {
            cutoff = maxProblem + 1;
        } else if (has4 && has5) {
            cutoff = this.goExprDepth === 1 ? 5 : 4;
        } else {
            cutoff = this.goExprDepth === 1 ? 6 : 4;
        }
        return precedence < cutoff ? ' ' : '';
    }

    printBinaryExpression(node, identation) {

        const {left, right, operatorToken} = node;

        const customBinaryExp = this.printCustomBinaryExpressionIfAny(node, identation);
        if (customBinaryExp) {
            return customBinaryExp;
        }

        if (operatorToken.kind == ts.SyntaxKind.InstanceOfKeyword) {
            return this.printInstanceOfExpression(node, identation);
        }

        if (operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            // handle test['a'] = 1;
            const elementAccess = left;
            const rightSide = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, 0));
            if (left.kind === ts.SyntaxKind.ElementAccessExpression) {
                const leftSide = this.printNode(elementAccess.expression, 0);
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                const value = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();
                const native = this.printNativeElementAssignment(elementAccess.expression, leftSide, elementAccess.argumentExpression, propName, value);
                if (native !== undefined) {
                    return native;
                }
                return `AddElementToObject(${leftSide}, ${propName}, ${value})`;
            }

            if (right?.kind === ts.SyntaxKind.AwaitExpression || rightSide.startsWith('<-this.callInternal')) {
                const leftParsed = this.printNode(left, 0);
                // the awaited call can carry a multi-line object literal argument: printing it
                // at the statement's own level keeps that literal one level deeper
                const awaited = (right?.kind === ts.SyntaxKind.AwaitExpression)
                    ? this.printNode(right, identation)
                    : rightSide;
                return `
${this.getIden(identation)}${leftParsed} = ${awaited}
${this.getIden(identation)}PanicOnError(${leftParsed})`;
            }
        }

        const op = operatorToken.kind;
        // handle: [x,d] = this.method()
        if (op === ts.SyntaxKind.EqualsToken && left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)}\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const leftElement = arrayBindingPatternElements[index];
                const leftType = this.getChecker().getTypeAtLocation(leftElement);
                const parsedType = this.getTypeFromRawType(leftType);

                const castExp = parsedType ? `(${parsedType})` : "";

                // const statement = this.getIden(identation) + `${e} = (${castExp}((List<object>)${syntheticName}))[${index}]`;
                const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        let operator = this.SupportedKindNames[operatorToken.kind];


        let leftVar = undefined;
        let rightVar = undefined;

        // c# wrapper
        if (operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
            if (this.COMPARISON_WRAPPER_OPEN) {
                leftVar = this.printNode(left, 0);
                rightVar = this.printNode(right, identation);
                return `${this.COMPARISON_WRAPPER_OPEN}${leftVar}, ${rightVar}${this.COMPARISON_WRAPPER_CLOSE}`;
            }
        }

        // check if boolean operators || and && because of the falsy values
        if (operatorToken.kind === ts.SyntaxKind.BarBarToken || operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            leftVar = this.printCondition(left, 0);
            rightVar = this.printCondition(right, identation);
            if (operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                // `x !== undefined && x === 'v'` inlines to `(x != nil) && (x != nil && *x == "v")`.
                // The right operand already guards nil, so the left test is provably
                // implied — `go vet` reports it as a redundant and. Dropping it keeps
                // the exact same value (Go && is short-circuiting, both sides pure).
                const collapsed = this.goDropRedundantNilGuard(leftVar.trim(), rightVar.trim());
                if (collapsed !== undefined) {
                    return collapsed;
                }
            }
        }  else {
            // go/printer prints the left operand of a binary expression at the
            // depth of the parent plus diffPrec() - 0 only when it is a binary
            // expression of the very same precedence - and the right operand one
            // level deeper. An operator that is not binary in Go (the assignment
            // `=`, or a compound assignment) prints both sides at their own level.
            const precedence = this.goOperatorPrecedence(operator);
            if (precedence > 0) {
                const leftOperator = this.goNativeBinaryOperator(left);
                const samePrecedence = leftOperator !== undefined && this.goOperatorPrecedence(leftOperator) === precedence;
                const leftDepth = samePrecedence ? this.goExprDepth : this.goExprDepth + 1;
                leftVar = this.goWithExprDepth(leftDepth, () => this.printNode(left, 0));
                rightVar = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation));
            } else {
                leftVar = this.printNode(left, 0);
                rightVar = this.printNode(right, identation);
            }
        }

        const customOperator = this.getCustomOperatorIfAny(left, right, operatorToken);

        operator = customOperator ? customOperator : operator;

        const separator = this.goBinarySeparator(operator, rightVar.trim(), left, right);

        return leftVar + separator + operator + separator + rightVar.trim();
    }

    // `(x != nil) && (x != nil && …)` -> `(x != nil && …)`. Only fires when the
    // right operand opens with the very same nil guard the left operand *is*, so
    // the left is implied and dropping it cannot change the result.
    goDropRedundantNilGuard(leftVar: string, rightVar: string): string | undefined {
        const guard = /^\(([A-Za-z_]\w*) != nil\)$/.exec(leftVar);
        if (guard === null) {
            return undefined;
        }
        if (rightVar.startsWith(`(${guard[1]} != nil && `)) {
            return rightVar;
        }
        return undefined;
    }

    printTryStatement(node, identation: number) {
        // const tryBody = this.printNode(node.tryBlock, 0);

        let tryBody = node.tryBlock.statements.map((s) => {
            return this.printNode(s, identation + 1);
        }).join("\n");
        tryBody = tryBody.replaceAll(/(\s*)break\s*$/gm, "$1panic(\"break\")"); // to do do thing regex-based

        // const catchBody = this.printNode(node.catchClause.block, 0);
        const catchBody = node.catchClause.block.statements.map((s) => this.printNode(s, identation + 1)).join("\n");

        const catchLines = catchBody.split("\n").map(l => l.trim()).filter(Boolean);
        const catchLastLine = catchLines.length ? catchLines[catchLines.length - 1] : "";
        const catchBodyEndsWithReturn = catchLastLine.startsWith("return")
            || catchLastLine.startsWith("panic")
            || catchLastLine.startsWith("throw new")
            || this.blockEndsWithConditionalReturn(node.catchClause.block.statements);

        const tryLines = tryBody.split("\n").map(l => l.trim()).filter(Boolean);
        const tryLastLine = tryLines.length ? tryLines[tryLines.length - 1] : "";
        const tryBodyEndsWithReturn = tryLastLine.startsWith("return")
            || tryLastLine.startsWith("panic")
            || tryLastLine.startsWith("throw new")
            || this.blockEndsWithConditionalReturn(node.tryBlock.statements);

        const returNil = "return nil";
        const isVoid   = this.isInsideVoidFunction(node);

        const nodeEndsWithReturn = tryBodyEndsWithReturn && catchBodyEndsWithReturn && !isVoid;
        const errorName = node.catchClause.variableDeclaration.name.escapedText;
        const classPrefix = this.className !== 'undefined' ? `(this *${this.className})` : "()";
        const thisWord = this.className !== 'undefined' ? "this" : "";
        // the printer indents statements with getIden(); the bodies embedded below are
        // re-placed at their own explicit level so the template only carries the levels
        // *inside* the block (the enclosing getIden(identation) lands on every line)
        const catchBodyBlock = this.indentBlock (catchBody, "					");
        const tryBodyBlock = this.indentBlock (tryBody, "		");
        const catchBlock =`
{
	${nodeEndsWithReturn ? 'ret__ := ' : ''}func${classPrefix} (ret_ any) {
		defer func() {
			if ${errorName} := recover(); ${errorName} != nil {
				if ${errorName} == "break" {
					return
				}
				ret_ = func${classPrefix} any {
					// catch block:
${catchBodyBlock}
					${catchBodyEndsWithReturn ? "" : returNil}
				}(${thisWord})
			}
		}()
		// try block:
${tryBodyBlock}
		${tryBodyEndsWithReturn ? "" : returNil}
	}(${thisWord})
	${nodeEndsWithReturn
        ? `if ret__ != nil {
		return ret__
	}
	return nil`
        : ''}
}`;
        // add identation to every line; a line that is left blank (the conditional
        // entries above emit nothing, and the block opens on a fresh line) stays
        // empty because gofmt trims trailing whitespace
        const indentedBlock = catchBlock.split("\n")
            .map((line) => line.trim().length ? this.getIden(identation) + line : "")
            .join("\n");
        // const catchCondOpen = this.CONDITION_OPENING ? this.CONDITION_OPENING : " ";

        return indentedBlock;
    }

    /**
     * Strip the printer's own leading indentation from every line of a printed
     * statement block so the caller can re-place it at an explicit level. Only the
     * common prefix goes away: relative nesting (one tab per level) is preserved.
     */
    dedentBlock (block: string) {
        const lines = block.split("\n");
        const indents = lines
            .filter((line) => line.trim().length > 0)
            .map((line) => (line.match(/^[\t ]*/) as RegExpMatchArray)[0].length);
        const common = indents.length ? Math.min(...indents) : 0;
        return lines.map((line) => line.slice(common)).join("\n");
    }

    /**
     * Re-place a printed statement block at `level` (a run of tabs): the block's own
     * leading indentation is dropped and every non-blank line is prefixed with `level`,
     * so relative nesting (one tab per level) survives the move.
     */
    indentBlock (block: string, level: string) {
        return this.dedentBlock (block)
            .split("\n")
            .map((line) => line.trim().length ? level + line : "")
            .join("\n");
    }

    /**
     * gofmt writes blank lines with no whitespace at all. A multi-line statement template
     * opens on a fresh line, so the inherited `getIden(identation) + <statement>` prefix
     * lands on a line that carries nothing else: drop that prefix instead of leaving a
     * whitespace-only line behind. Only blank lines are touched, never printed content.
     */
    stripWhitespaceOnlyLines (block: string) {
        return block.split("\n").map((line) => line.trim().length ? line : "").join("\n");
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operator === ts.SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        if (operator === ts.SyntaxKind.MinusToken) {
            const printed = this.printNode(node.operand, 0);
            const inlined = this.printInlineOpNeg(node, printed);
            if (inlined !== undefined) {
                return this.getIden(identation) + inlined;
            }
            return this.getIden(identation) + `OpNeg(${printed})`;
        }
        return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
        expression = expression ? expression : this.printNode(node.expression); // new Exception or new exact[string] check this out
        if (node.arguments.length === 0) {
            return `New${this.capitalize(expression)}()`;
        }
        // an argument printer may prepend the statement indent (parenthesised casts do);
        // inside the call the argument is inline, so trim it like printArgsForCallExpression
        const args = node.arguments.map(n => this.printNode(n, identation).trim()).join(", ");
        if (expression.endsWith('Error')) {
            return expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
        }
        return 'New' + this.capitalize(expression) + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }

    /**
     * Override the default element-access printer with a version that walks the
     * entire `x[y][z]` chain and builds a properly nested sequence of helper
     * calls.  This removes the root cause of the unbalanced-parenthesis bug
     * without any post-processing or regex hacks.
     */
    // The Go static type of `printed` when the printer can name it as a native Go
    // map or slice, undefined while the value stays boxed in `any` (GetValue,
    // Ternary, a parameter, an untyped struct field). Only initializer shapes the
    // printer itself types — object/array literals, helper calls whose Go return
    // type it knows (GO_HELPER_RETURN_TYPES + the ccxt extension), and locals whose
    // declaration got that same concrete type — are reported.
    goIndexableTypeOf(node, printed: string): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        switch (node.kind) {
        // a type assertion prints as its operand (printAsExpression hands the operand
        // back), so the operand's Go type still governs the read: `(this.fees as Dict)['x']`
        // is the element access on `this.fees`, whose Go type decides the index
        case ts.SyntaxKind.ParenthesizedExpression:
        case ts.SyntaxKind.AsExpression:
            return this.goIndexableTypeOf(node.expression, printed);
        case ts.SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case ts.SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case ts.SyntaxKind.CallExpression:
            return this.goTypeOfInitializer(node, printed);
        case ts.SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node);
        }
        return undefined;
    }

    // the leftover chain after the first (native) step, still helper-wrapped:
    // `m["a"]["b"]["c"]` prints `GetValue(GetValue(m["a"], "b"), "c")`
    goElementAccessChain(containerStr: string, keyStrs: string[]) {
        let acc = containerStr;
        for (let i = 1; i < keyStrs.length; i++) {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        }
        return acc;
    }

    // the container of a nested `m["a"]["b"] = v` write, for all but the last key: its first step is a
    // plain read, so a receiver typed as a map indexes natively and only `any` steps keep the helper.
    // A missing key or nil map reads nil in both forms; a non-map container is a no-op either way.
    goElementWriteChain(baseExpr, containerStr: string, keyNodes, keyStrs: string[]): string {
        let acc = containerStr;
        let first = 0;
        if ((keyStrs.length > 1) && (this.goIndexableTypeOf(baseExpr, containerStr) === 'map[string]any')
            && this.goKeyIsString(keyNodes[0], keyStrs[0])) {
            acc = `${containerStr}[${keyStrs[0]}]`;
            first = 1;
        }
        for (let i = first; i < keyStrs.length - 1; i++) {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        }
        return acc;
    }

    // true when the printed key is a Go string, so `m[key]` reads the map with the
    // same key GetValue resolves for a string operand (GetValue parses a non-string
    // key, which on map[string]any just yields nil)
    goKeyIsString(node, printed: string) {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case ts.SyntaxKind.ParenthesizedExpression:
        case ts.SyntaxKind.AsExpression:
            return this.goKeyIsString(node.expression, printed);
        case ts.SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node) === 'string';
        case ts.SyntaxKind.CallExpression:
            return this.goTypeOfInitializer(node, printed) === 'string';
        }
        return false;
    }

    // true when the printed key is a Safe*-boxed string: an identifier declared `*string`,
    // i.e. a nilable Go pointer. The native read needs GetValue's `*` deref and its nil
    // answer, neither of which an index expression expresses.
    goIsDerefStringKeyExpression(node): boolean {
        return (node?.kind === ts.SyntaxKind.Identifier) && (this.goDeclaredTypeOfIdentifier(node) === '*string');
    }

    // the nil-guarded native read of a declared map with a `*string` key, reproducing GetValue's key
    // deref: a nil key reads nil, otherwise the map index (missing key is the `any` nil). gofmt keeps
    // a func literal holding an `if` on its own lines, so the guard sits at the statement's level.
    printNilGuardedMapIndex(containerStr: string, keyStr: string): string {
        const level = this.goStatementLevel;
        const body = this.getIden(level + 1);
        return `func() any {\n${body}if ${keyStr} == nil {\n${this.getIden(level + 2)}return nil\n${body}}\n${body}return ${containerStr}[*${keyStr}]\n${this.getIden(level)}}()`;
    }

    // true for `this.<field>` — the one property-access shape whose Go type the
    // printer itself cannot name (the fields live in the hand-written Go structs)
    isGoThisPropertyAccessExpression(node) {
        return (node?.kind === ts.SyntaxKind.PropertyAccessExpression)
            && (node.expression?.kind === ts.SyntaxKind.ThisKeyword);
    }

    // true when the element access is the target of an assignment: the binary
    // expression printer owns that shape (AddElementToObject / rewritten GetValue
    // chains), a native `x[k]` index there would drop the write
    isGoElementAccessAssignmentTarget(node) {
        const parent = node.parent;
        return (parent?.kind === ts.SyntaxKind.BinaryExpression) && (parent.left === node)
            && ((parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) || (parent.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken));
    }

    // the key of a native list read: its printed Go type must be `int` for the guard's two
    // comparisons to compile, and the key expression is printed twice (the bounds test and the
    // index), so a call operand — evaluated twice — is rejected. Every other key keeps GetValue.
    goIntIndexExpression(node): boolean {
        switch (node?.kind) {
        case ts.SyntaxKind.NumericLiteral: {
            const text = `${node.text ?? ''}`;
            return /^\d+$/.test(text);
        }
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goIntIndexExpression(node.expression);
        case ts.SyntaxKind.PrefixUnaryExpression:
            return (node.operator === ts.SyntaxKind.MinusToken) && this.goIntIndexExpression(node.operand);
        case ts.SyntaxKind.Identifier:
            return this.goIntOperandIdentifier(node);
        case ts.SyntaxKind.BinaryExpression: {
            const op = node.operatorToken?.kind;
            if ((op === ts.SyntaxKind.PlusToken) || (op === ts.SyntaxKind.MinusToken)
                || (op === ts.SyntaxKind.AsteriskToken) || (op === ts.SyntaxKind.SlashToken)
                || (op === ts.SyntaxKind.PercentToken)) {
                return this.goIntIndexExpression(node.left) && this.goIntIndexExpression(node.right);
            }
            return false;
        }
        }
        return false;
    }

    // true for an identifier the printer emits as a Go int: a local it declared `int`, and a
    // `for (let i = 0; …)` counter, which prints `for i := 0` and is inferred as `int`
    goIntOperandIdentifier(node): boolean {
        if (this.goDeclaredTypeOfIdentifier(node) === 'int') {
            return true;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration;
        if ((declaration?.kind !== ts.SyntaxKind.VariableDeclaration) || (declaration.initializer === undefined)) {
            return false;
        }
        const list: any = declaration.parent;
        const loop: any = list?.parent;
        if ((list?.kind !== ts.SyntaxKind.VariableDeclarationList) || (list.declarations?.length !== 1)
            || (loop?.kind !== ts.SyntaxKind.ForStatement) || (loop.initializer !== list)) {
            return false;
        }
        const text = `${declaration.initializer.text ?? ''}`;
        return (declaration.initializer.kind === ts.SyntaxKind.NumericLiteral) && /^\d+$/.test(text);
    }

    // true when this identifier is a local the printer declared []any because it was unboxed
    // from a `this.SafeList` accessor. Only that family carried the first guarded element read;
    // the declared-type arm below is the D-06 widening.
    goSafeListUnboxIdentifier(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration;
        return (declaration?.kind === ts.SyntaxKind.VariableDeclaration)
            && (this.goSafeListLocalUnbox(declaration) === GO_SAFE_LIST_LOCAL_TYPE);
    }

    // true when the identifier's printed Go declaration is a `[]any` slice: the SafeList family
    // above, or any other local/param the declared-type table proved a slice (a slice literal,
    // a `[]any`-returning accessor, a slice param the typed-param family registers). All of them
    goDeclaredListIdentifier(node): boolean {
        return (this.goDeclaredTypeOfIdentifier(node) === GO_SAFE_LIST_LOCAL_TYPE)
            || this.goSafeListUnboxIdentifier(node);
    }

    // `x[k]` on a local the printer declared []any is a slice index: GetValue answered nil for an
    // absent index (negative or out of range) and derefs a pointer element, so the native read is
    // the same index behind that guard. Only a key printed as an `int` carries it; every other
    goNativeListElementRead(node, containerStr: string, keyNode, keyStr: string): string | undefined {
        if (containerStr.includes('\n') || keyStr.includes('\n')) {
            return undefined;
        }
        if (this.isGoElementAccessAssignmentTarget(node) || !this.goIntIndexExpression(keyNode)) {
            return undefined;
        }
        const level = this.goStatementLevel;
        const body = this.getIden(level + 1);
        return `func() any {\n${body}if ${keyStr} >= 0 && ${keyStr} < len(${containerStr}) {\n${this.getIden(level + 2)}return DerefScalar(${containerStr}[${keyStr}])\n${body}}\n${body}return nil\n${this.getIden(level)}}()`;
    }

    printElementAccessExpression(node, identation) {
        // Maintain original special-case handling first.
        const special = this.printElementAccessExpressionExceptionIfAny(node);
        if (special) {
            return special;
        }

        // Always process element access expressions the same way
        // The binary expression handler will override this for assignments

        // For right-side access, build the full nested chain
        const keys: any[] = [];
        let baseExpr = null;
        let current = node as any;
        // Walk down while the *expression* is another ElementAccessExpression.
        while (ts.isElementAccessExpression(current)) {
            keys.unshift(current.argumentExpression); // prepend
            const expr = current.expression;
            if (!ts.isElementAccessExpression(expr)) {
                // Reached the base container.
                baseExpr = expr;
                break;
            }
            current = expr;
        }

        // go/printer prints the base of an index expression at depth 1 and the
        // index itself one level deeper; GetValue(base, key) is a two-argument
        // call, so both operands sit one level below the current expression
        const indexDepth = this.goExprDepth + 1;
        const containerStr = this.goWithExprDepth(indexDepth, () => this.printNode(baseExpr, 0));
        const keyStrs = keys.map(k => this.goWithExprDepth(indexDepth, () => this.printNode(k, 0)));

        // GetValue(m, "k") is a read of a Go map[string]any already: a missing key
        // and a nil element both come back as the `any` nil, so the native index
        // yields the identical value without the helper call
        if (this.goIndexableTypeOf(baseExpr, containerStr) === 'map[string]any') {
            if (this.goKeyIsString(keys[0], keyStrs[0]) && !this.isGoElementAccessAssignmentTarget(node)
                && !this.goMarketComparisonElementRead(node)) {
                return this.goElementAccessChain(`${containerStr}[${keyStrs[0]}]`, keyStrs);
            }
            // a Safe*-boxed string key holds a nilable `*string`, so the read needs the
            // helper's nil answer and deref around the same map index. A multi-line
            // receiver cannot carry the guard's own indentation, so it keeps the helper.
            if (this.goIsDerefStringKeyExpression(keys[0]) && !containerStr.includes('\n')
                && !this.isGoElementAccessAssignmentTarget(node)) {
                return this.goElementAccessChain(this.printNilGuardedMapIndex(containerStr, keyStrs[0]), keyStrs);
            }
        }

        // Now build nested helpers.
        let acc = containerStr;
        keyStrs.forEach(k => {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${k}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        });

        // a local the printer declared []any — either unboxed from a `this.SafeList` accessor or
        // named []any by the declared-type table — is a slice, so an element read with a key it
        // prints as an int is the guarded native index (see goNativeListElementRead)
        if ((baseExpr?.kind === ts.SyntaxKind.Identifier) && this.goDeclaredListIdentifier(baseExpr)) {
            const nativeRead = this.goNativeListElementRead(node, containerStr, keys[0], keyStrs[0]);
            if (nativeRead !== undefined) {
                return this.goElementAccessChain(nativeRead, keyStrs);
            }
        }

        return acc;
    }

    isInsideVoidFunction(node: ts.Node): boolean {
        for (let cur = node.parent; cur; cur = cur.parent) {
            if (ts.isFunctionLike(cur)) {
                return cur.type === undefined || cur.type.kind === ts.SyntaxKind.VoidKeyword;
            }
        }
        return true;          // default-to-void if uncertain
    }

    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: ts.Statement): boolean {
        if (ts.isBlock(statement)) {
            // A sequence of statements returns on all control paths if the last statement returns on all control paths
            if (statement.statements.length === 0) {
                return false;
            }
            return this.hasReturnInBlock(statement.statements[statement.statements.length - 1]);
        } else if (ts.isReturnStatement(statement)) {
            return true;
        } else if (ts.isThrowStatement(statement)) {
            return true;
        } else if (ts.isIfStatement(statement)) {
            // An if statement returns on all control paths if both the "if" and "else" branches return on all control paths
            const ifHasReturn = this.hasReturnInBlock(statement.thenStatement);
            if (statement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(statement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
            return false; // No else statement, so execution can continue
        } else if (ts.isTryStatement(statement)) {
            // A try statement returns on all control paths if both try and catch blocks return on all control paths
            const tryHasReturn = this.hasReturnInBlock(statement.tryBlock);
            const catchHasReturn = this.hasReturnInBlock(statement.catchClause.block);
            return tryHasReturn && catchHasReturn;
        }
        return false;
    }

    /**
     * Check if the last statement in a block is a conditional with returns in all branches
     */
    blockEndsWithConditionalReturn(statements: ts.NodeArray<ts.Statement>): boolean {
        if (statements.length === 0) {
            return false;
        }

        const lastStatement = statements[statements.length - 1];
        if (ts.isIfStatement(lastStatement)) {
            // Check if this if statement has returns in all branches (only if it has an else)
            const ifHasReturn = this.hasReturnInBlock(lastStatement.thenStatement);
            if (lastStatement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(lastStatement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
        }
        if (ts.isTryStatement(lastStatement)) {
            // Check if this try statement has returns in both try and catch blocks
            const tryHasReturn = this.hasReturnInBlock(lastStatement.tryBlock);
            const catchHasReturn = this.hasReturnInBlock(lastStatement.catchClause.block);
            return tryHasReturn && catchHasReturn;
        }
        return false;
    }


}


// get class decl node
// Use the ts.getAllSuperTypeNodes function to get the base classes for the MyClass
// const baseClasses = ts.getAllSuperTypeNodes(classDeclaration);

// // Create a type checker
// const typeChecker = ts.createTypeChecker(sourceFile.context.program, sourceFile.context.checker);

// // Get the type of the base class
// const baseClassType = typeChecker.getTypeAtLocation(baseClasses[0]);

// // Get the class declaration for the base class
// const baseClassDeclaration = baseClassType.symbol.valueDeclaration;

// console.log(baseClassDeclaration);

