import { BaseTranspiler } from "./baseTranspiler.js";
import * as fs from "fs";
import * as path from "path";
import { SyntaxKind, getLeadingCommentRanges } from 'typescript/unstable/ast';
import { NodeFlags } from 'typescript/unstable/ast';  // RF-go-7
import { isArrowFunction, isBinaryExpression, isBlock, isBooleanLiteral, isCallExpression, isClassDeclaration as isClassDeclarationNode, isElementAccessExpression, isExpressionStatement, isFunctionDeclaration, isFunctionExpression, isIfStatement, isMethodDeclaration, isReturnStatement, isSourceFile, isStatement as isStatementNode, isThrowStatement, isTryStatement } from 'typescript/unstable/ast/is';
import { Checker, IndexKind, SymbolFlags, TypeFlags } from 'typescript/unstable/sync';
import type { BinaryExpression, CallExpression, Node, NodeArray, Statement } from 'typescript/unstable/ast';
import { getAllSuperTypeNodes, isFunctionLike } from './tsUtils.js';


const GO_ITERATION_STATEMENT_KINDS = new Set<number>([SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement, SyntaxKind.DoStatement, SyntaxKind.WhileStatement]);

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
    // the `.toString()` native arms and the bracket-join form all return a Go string, so a
    // local that captures one stays the string its helper result was (hx10w10 GP24)
    'strconv.Itoa': 'string',
    'strconv.FormatInt': 'string',
    'strconv.FormatBool': 'string',
    'strings.Join': 'string',
};

// `this.<name>`, `this.<name>2` and `this.<name>N` of each accessor family, all typed `goType`
function goSafeAccessorTypes (names: string[], goType: string): { [name: string]: string } {
    return Object.fromEntries(names.flatMap((name) => [ '', '2', 'N' ].map((suffix) => [ 'this.' + name + suffix, goType ])));
}

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
    // FM-GO4-1: `Nonce() int64` / `IncrementingNonce() int64` are the hand-written signatures of
    // go/v4/exchange_interface.go (ICoreExchange 284/285, IDerivedExchange 439); goNonceReturnType prints
    // every generated Nonce () override to match, so a local fed by either holds an int64
    'this.Nonce': 'int64',
    'this.IncrementingNonce': 'int64',
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
    'strconv.FormatInt': 'string',
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
    ...goSafeAccessorTypes([ 'SafeString', 'SafeStringLower', 'SafeStringUpper' ], '*string'),
    ...goSafeAccessorTypes([ 'SafeInteger', 'SafeIntegerProduct', 'SafeTimestamp' ], '*int64'),
    ...goSafeAccessorTypes([ 'SafeFloat' ], '*float64'),
    // absent flag → nil pointer, present flag → its value, mirroring the string/number accessors
    ...goSafeAccessorTypes([ 'SafeBool' ], '*bool'),
    // SafeDict*/SafeList* stay untyped: the Go accessors return `any` because the value
    // may be a *sync.Map, a Dict or an order-book side, none of which is a map[string]any / []any
    // Precise arithmetic returns a numeric string, or nil when an operand is
    // absent, so it carries the same *string shape as the Safe* string accessors
    ...Object.fromEntries([ 'Mul', 'Div', 'Sub', 'Add', 'Or', 'Max', 'Min', 'Abs', 'Neg', 'Mod' ].map((op) => [ 'Precise.String' + op, '*string' ])),
};

// helpers whose Go signature is `any` (GetValue, Ternary, Add, SafeValue, ...) are
// deliberately absent above: their box holds a value the printer cannot name, so
// those locals stay `any`. A Safe* entry presupposes the matching Go accessor
// returns that shape (as the hand-written base already does for Str/Int/Float).

// Hand-written runtime calls whose every parameter is `any` and which normalise
// their arguments with derefScalar: handing one a `*T` reads exactly like the box.
const GO_NIL_INIT_ANY_ARG_CALLEES = new Set([
    'this.SafeString', 'this.SafeString2', 'this.SafeStringN', 'this.SafeStringLower', 'this.SafeStringLower2',
    'this.SafeStringUpper', 'this.SafeStringUpper2', 'this.SafeInteger', 'this.SafeIntegerProduct',
    'this.SafeFloat', 'this.SafeNumber', 'this.SafeBool', 'this.SafeTimestamp', 'this.SafeSymbol',
    'this.SafeCurrencyCode', 'this.SafeMarket', 'this.SafeDict', 'this.SafeList', 'this.SafeValue',
    'this.Iso8601', 'this.Parse8601', 'this.ParseNumber', 'this.NumberToString', 'this.Omit',
    'this.Market', 'this.PriceToPrecision',
    'GetValue', 'SafeValue', 'ToString', 'EvalTruthy', 'IsEqual', 'IsString', 'IsNumber', 'IsBool',
    'Precise.StringAdd', 'Precise.StringSub', 'Precise.StringMul', 'Precise.StringDiv', 'Precise.StringAbs',
    'Precise.StringEq', 'Precise.StringGt', 'Precise.StringLt', 'Precise.StringGe', 'Precise.StringLe',
]);

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

// hand-written BaseExchange fields (go/v4/exchange.go) declared `*sync.Map`
const GO_SYNC_MAP_FIELDS = [
    'Options', 'Markets', 'Markets_by_id', 'MarketsById', 'Currencies', 'Currencies_by_id', 'CurrenciesById',
    'BaseCurrencies', 'QuoteCurrencies', 'Tickers', 'Orderbooks', 'Transactions',
];

// Hand-written BaseExchange fields (go/v4/exchange.go, embedded by every exchange
// class) declared with one of those pointer types, keyed by the printed Go field name;
// the Go type lives in the hand-written base, not in the TypeScript class.
const GO_NILABLE_FIELDS_Typed: { [name: string]: string } = Object.fromEntries(
    [ ...GO_SYNC_MAP_FIELDS, 'Bidsasks' ].map((name) => [ 'this.' + name, '*sync.Map' ]));

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

// the market producers whose TS return type names no Go type (see goMarketProducerReturnType)
const GO_MARKET_PRODUCER_METHODS = [ 'parseMarket', 'getMarketFromSymbols', 'getMarketFromClientAndMessage' ];

// venues whose ws frames decode to a JSON array or to bare text: their handleMessage frame keeps
// the `any` box even when the annotation says Dict, so the Go dispatch only types object frames
const GO_ANY_FRAMED_VENUES = new Set([ 'bitfinex', 'toobit', 'coincheck', 'phemex', 'sxbet', 'gemini' ]);

// base accessors/builders whose generated Go result is already the market dictionary
const GO_MARKET_MAP_CALLS = [ 'Market', 'SafeMarket', 'SafeMarketStructure', 'Extend', 'DeepExtend', 'MapTyped', 'MarketTyped' ];

// Base producers declared as an OVERLOAD PAIR (two signatures + the implementation). At a venue
// call site the body proof cannot resolve the body-carrying declaration of an overloaded name, so
// every caller boxed the row and wrapped it in MapTyped; the base-file print proves the body and
// exchange_generated.go declares the result `map[string]any`, so the call is that dictionary.
const GO_MARKET_MAP_BASE_CALLS = [ 'getMarketFromSymbols',
    // BaseExchange methods whose Go signature is `map[string]any` on the base, on every venue override
    // and on IDerivedExchange (go/v4 exchange_generated.go + exchange_interface.go; the ccxt build retypes
    // the overrides). The Go result is the map itself, so the box a local held was always that map - a
    // typed nil when the callee answers absent, never an untyped nil: see goMarketUseHandsTheMapOn.
    'parseBalance', 'parseWsTrade', 'parseWsOrder', 'describe' ];

// the binary operators under which a market/currency local's element read is a pure READ: the
// element is derefed by the GetValue the element-read printer keeps for these operands
// (goMarketComparisonElementRead), so `market['swap'] === true` keeps answering exactly what the
const GO_MARKET_READ_COMPARISON_OPERATORS = [
    SyntaxKind.EqualsEqualsToken,
    SyntaxKind.ExclamationEqualsToken,
    SyntaxKind.EqualsEqualsEqualsToken,
    SyntaxKind.ExclamationEqualsEqualsToken,
    SyntaxKind.LessThanToken,
    SyntaxKind.GreaterThanToken,
    SyntaxKind.LessThanEqualsToken,
    SyntaxKind.GreaterThanEqualsToken,
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
];

// `var x any = this.SafeList(container, key)` may carry the slice type for the same reason: the
// accessor returns `any`, so SafeListTyped reads the same member and hands back a []any with the
// same length and elements (every array kind IsArray admits is converted), nil when the member is
const GO_SAFE_LIST_LOCAL_TYPE = '[]any';

// a local whose TS type is `string[]`: the printer opens the literal as []string, and every
// element/len read is the native Go slice op on Go strings
const GO_STRING_LIST_LOCAL_TYPE = '[]string';

// the boundary comment ccxt's base sources (ts/src/base/Exchange.ts, PredictionExchange.ts)
// carry and build/goTranspiler.ts re-assembles the generated file around

// the Go numeric kinds. `<` `>` `<=` `>=` compile without a conversion only when
// both operands carry the same one of these
const GO_NUMERIC_KINDS = [ 'int', 'int64', 'float64' ];

const ORDERED_COMPARISON_OPERATORS: { [kind: number]: string } = {
    [SyntaxKind.GreaterThanToken]: '>',
    [SyntaxKind.GreaterThanEqualsToken]: '>=',
    [SyntaxKind.LessThanToken]: '<',
    [SyntaxKind.LessThanEqualsToken]: '<=',
};

// hand-written BaseExchange fields (go/v4/exchange.go) declared `string`: their Go
// value is never nil, so `this.<field> + s` matches Add(field, s) exactly. The Go
// struct field is what decides — a batch-A `Str` TS annotation (`version: Str`)
// still prints this field as a plain Go string. The credential fields are the same
// kind: gb09 declared them `string` (an absent key is "" not a nil box).
const GO_STRING_FIELD_NAMES = [ 'Id', 'Name', 'Version', 'Url', 'Hostname', 'UserAgent',
    'ApiKey', 'Secret', 'Uid', 'Password', 'AccountId', 'PrivateKey', 'WalletAddress' ];

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
    SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.NumericLiteral, SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword,
];

// the String methods the printer answers natively on a proven Go string (strings.* / len)
const GO_STRING_METHOD_NAMES = [ 'split', 'replace', 'replaceAll', 'startsWith', 'endsWith', 'toUpperCase', 'toLowerCase',
    'indexOf', 'length', 'trim', 'padStart', 'padEnd', 'toString' ];

// the operators that write their left operand: an assignment through any of them may
// store a nil pointer where the deref proof expected the defaulted call's result
const GO_WRITE_OPERATOR_KINDS = [
    SyntaxKind.EqualsToken, SyntaxKind.PlusEqualsToken, SyntaxKind.MinusEqualsToken,
    SyntaxKind.AsteriskEqualsToken, SyntaxKind.SlashEqualsToken, SyntaxKind.PercentEqualsToken,
];

// hand-written BaseExchange fields (go/v4/exchange.go) declared as a container: an
// element write on one of them is native code — a map index write, or `Store` for the
// thread-safe ones, which is exactly what AddElementToObject does for a *sync.Map.
const GO_FIELD_CONTAINER_TYPES_NATIVE: { [name: string]: string } = Object.fromEntries([
    ...[
        'Options', 'Has', 'Api', 'TransformedApi', 'RequiredCredentials', 'HttpExceptions', 'Timeframes', 'Features',
        'Exceptions', 'Precision', 'UserAgents', 'TokenBucket', 'CommonCurrencies', 'ProxyDictionaries',
        'WsClients', 'Clients', 'Limits', 'Fees', 'Status', 'Countries',
    ].map((name) => [ name, 'map[string]any' ]),
    ...GO_SYNC_MAP_FIELDS.filter((name) => name !== 'Options').map((name) => [ name, '*sync.Map' ]),
]);

// RF-go-3 (hx10w2 G09): `Options` is declared `map[string]any` in go/v4/exchange.go: one owner, no sync.Map. Every store
// into it derefs a typed pointer, so the field only ever holds plain values and a native index reads exactly what
// GetValue answered. Other map fields mix writers and keep the helper read.
const GO_PLAIN_VALUED_MAP_FIELDS = [ 'Options' ];

// BaseExchange option dicts: `map[string]any` fields built non-nil by exchange_options.go
const GO_OPTION_DICT_FIELDS = [ 'Options', 'Has', 'Features', 'Fees', 'Limits' ];

// operator kinds the arithmetic helpers are emitted for
const GO_ARITHMETIC_KINDS = [
    SyntaxKind.PlusToken,
    SyntaxKind.MinusToken,
    SyntaxKind.AsteriskToken,
    SyntaxKind.SlashToken,
    SyntaxKind.PercentToken,
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

// the index just past the `"`/`'` literal opening at `start` (backslash escapes skipped)
function goSkipQuoted (text: string, start: number): number {
    let i = start + 1;
    while (i < text.length) {
        if (text[i] === '\\') {
            i += 2;
            continue;
        }
        if (text[i] === text[start]) {
            return i + 1;
        }
        i += 1;
    }
    return i;
}

// (opens - closes) of ()[]{} outside strings, so `foo(` (statement continues) and `}` (statement
// ended before this line) are not mistaken for complete single-line statements
function goBracketBalance (code: string): number {
    let depth = 0;
    let i = 0;
    while (i < code.length) {
        const ch = code[i];
        if ((ch === '"') || (ch === '\'')) {
            i = goSkipQuoted (code, i);
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
            i = goSkipQuoted (line, i);
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
    return [ ...text ].length;
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

// `/^this\s*\.\s*<name>\s*\(/` for each name: a call of that method on `this`
function goThisCallPatterns (names: string[]): RegExp[] {
    return names.map((name) => new RegExp('^this\\s*\\.\\s*' + name + '\\s*\\('));
}

// the TypeScript accessors whose Go signature this printer knows to be `*string`
// (GO_HELPER_RETURN_TYPES plus coerced SafeCurrencyCode/SafeSymbol); the textual call-site proof
// uses them for ts/src sibling files a scoped run's program does not carry.
const GO_TS_SRC_STRING_PRODUCERS = goThisCallPatterns([
    'safeString', 'safeString2', 'safeString3', 'safeStringN', 'safeStringLower', 'safeStringLower2',
    'safeStringUpper', 'safeStringUpper2', 'safeCurrencyCode', 'safeSymbol',
]);

// hx10w9 GP13: a slice element proves a Go string only from a quoted literal, a `: string`
// parameter the printer types, or a defaulted parameter with a string-literal initializer. The
// `safe*` readers answer a `*string` and `this.symbol(x)` answers an `any` box in Go, so neither
// can enter a `[]string` literal without a deref/conversion this rule does not print.
const GO_TS_SRC_SLICE_STRING_PRODUCERS: RegExp[] = [
    /^(?:'[^'\\]*'|"[^"\\]*"|`[^`\\]*`)$/,
];

// the TS accessors whose Go signature GO_HELPER_RETURN_TYPES already names
// `map[string]any`, for the same textual sibling-file proof. A map argument is also
// proven when it is an object literal (its printed Go form is exactly that map) or a
const GO_TS_SRC_MAP_PRODUCERS = goThisCallPatterns([ 'extend', 'deepExtend', 'keysort', 'indexBy', 'groupBy' ]);

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

// hx10w9 GP13: the same split for a call whose arguments hold array literals. goBalancedCallArgs
// only tracks parentheses, so `[ [ a, b ] ]` reads as two arguments; this one counts every
// bracket, which is what a slice-argument proof needs.
function goBalancedSliceArgs (text: string, open: number): string[] | undefined {
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
        if ((ch === '(') || (ch === '[') || (ch === '{')) {
            depth++;
            if (depth > 1) { current += ch; }
            continue;
        }
        if ((ch === ')') || (ch === ']') || (ch === '}')) {
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

// implicit endpoints pass api (['v1', 'private']) and params (a list for batch orders) untyped;
// exchange overrides of sign/fetch2/request usually omit the base `api: any` annotation
const GO_GETARG_EXCLUDED_POSITIONS: { [name: string]: number[] } = {
    'fetch2': [ 1, 3 ],
    'request': [ 1, 3 ],
    'sign': [ 1, 3 ],
};

// base helpers typed `any[]` that hand back, at this index, the params map they were given
// (unchanged, omitted or extended: always a map[string]any in Go)
const GO_PARAMS_TUPLE_HELPERS: { [name: string]: number } = {
    'handleUntilOption': 1,
    'handleNetworkCodeAndParams': 1,
    'handleWithdrawTagAndParams': 1,
    'handleTriggerAndParams': 1,
    'handleTriggerDirectionAndParams': 1,
    'handlePostOnly': 1,
    'handleTriggerPricesAndParams': 3,
};

// destructures the Go build layer already rewrites natively: the pair-result helpers print
// `a, b := call` (their Go twin returns two values) and the payload helpers index the holder
// directly. A typed slot here would defeat both, so those keep the printed form.
const GO_TUPLE_NATIVE_BINDING_PRODUCERS = [
    'HandleMarketTypeAndParams', 'HandleSubTypeAndParams', 'HandleOptionStringAndParams',
    'HandleUntilOption', 'HandleMarginModeAndParams', 'HandleOptionBoolAndParams',
    'HandleOptionBoolAndParams2', 'HandleOptionIntegerAndParams', 'HandleOptionIntegerAndParams2',
    'HandleOptionStringAndParams2', 'HandleOptionAndParams', 'HandleOptionAndParams2',
    'HandleOptionBoolAndParamsNullable', 'HandleOptionBoolAndParams2Nullable',
    'HandleOptionIntegerAndParamsNullable', 'HandleOptionIntegerAndParams2Nullable',
    'HandleNetworkCodeAndParams', 'HandleWithdrawTagAndParams', 'HandlePostOnly',
    'HandleParamString', 'HandleParamString2', 'HandleParamInteger', 'HandleParamInteger2',
    'HandleParamBool', 'HandleParamBool2',
];

// receivers that read a nil map exactly like an untyped nil (derefScalar + a missed lookup);
// IsDictionary and IsEqual answer differently for a nil map, so they are not listed
const GO_GETARG_NIL_MAP_READERS = [
    'GetValue', 'InOp', 'ObjectKeys', 'SafeValue', 'SafeValue2', 'SafeDict', 'SafeList',
    'SafeString', 'SafeString2', 'SafeStringN', 'SafeStringUpper', 'SafeStringLower',
    'SafeInteger', 'SafeInteger2', 'SafeNumber', 'SafeNumber2', 'SafeFloat', 'SafeBool', 'SafeTimestamp',
];

export class GoTranspiler extends BaseTranspiler {

    // scopes are scanned many times per local; walking remote TS7 nodes is costly, so the
    // preorder descendant list is built once per scope (same visit order and early stop)
    goScopeDescendants = new WeakMap<object, any[]>();
    goDescendantsOf(scope): any[] {
        let list = this.goScopeDescendants.get(scope);
        if (list === undefined) {
            list = [];
            const out = list;
            const visit = (n: any) => {
                out.push(n);
                n.forEachChild(visit);
            };
            scope.forEachChild(visit);
            this.goScopeDescendants.set(scope, list);
        }
        return list;
    }

    hasNodeWhere(scope: Node | undefined, predicate: (n: any) => boolean): boolean {
        if (scope === undefined) {
            return false;
        }
        return this.goDescendantsOf(scope).some(predicate);
    }

    binaryExpressionsWrappers;
    wrapThisCalls: boolean;
    wrapCallMethods: string[] = [];
    // inherited method name -> indexes of required params that print `string` on the base and every
    // override (the caller audits all declarations); other callers convert through StringArg
    unifiedStringParams: { [method: string]: number[] } = {};
    // hx10w9 GP13: the slice mirror of the table above — inherited method name -> parameter
    // index -> Go slice type (`[]string`/`[][]string`). Same audit: the base and every override
    // print that slice, and every call site passes a literal the printer opens as that slice.
    unifiedSliceParams: { [method: string]: { [index: number]: string } } = {};
    // hx11 w8: inherited method name -> indexes of required `boolean` params that print `bool` on the
    // base and every override (dynamic callers convert through BoolArg)
    unifiedBoolParams: { [method: string]: number[] } = {};
    // hx11 RF-go-7: `<class>.<method>` -> indexes of required `string` params of an exchange-local method that
    // no file in ts/src calls (the call-site proof is vacuous, so the table names the methods whose Go
    // signature may print `string`)
    uncalledStringParams: { [method: string]: number[] } = {};
    // hx11 RF-go-7: base methods whose tuple result slot 0 is the Go `*string` (TS declares `string`)
    stringPointerTupleCalls: string[] = [];
    // hx11 RF-go-7: exchange-local methods (by name pattern) whose sibling-file call sites may pass a unified-string
    // parameter of their enclosing method straight through
    siblingStringPassthroughPattern: RegExp | undefined = undefined;
    // hx11 rfm-X4 OG03: a base-class field whose owner is another goroutine (the ws client registry:
    // the dispatch loop). User-path code reads it through `snapshot` and drops entries through
    // `remove`; owner-side methods (`ownerSideMethods`, TS method-name patterns) keep the field.
    // Absent config = no rewrite. JSON-serializable: the config crosses the worker boundary.
    goOwnedField: { field: string; declaredIn: string; snapshot: string; remove: string; ownerSide: RegExp[] } | undefined;
    // RFM-G4 G09: Go field names the PredictionExchange struct declares `map[string]any` (the ccxt build derives
    // them from its struct field table); a `this.<f>` of one of them is a typed map, not the BaseExchange `any`
    predictionMapFields: Set<string> = new Set<string>();
    // ===== RF-go-6-F (config) =====
    // per tuple producer the Go type of each slot (`HandleOptionIntegerAndParams` -> [ '*int64' ]); a ccxt runtime fact
    goTupleSlotTypes: { [producer: string]: string[] } = {};
    // producer -> index of its default-value argument: an integer-literal default selects the value form,
    // which returns a Go pair instead of the `[]any` holder
    goTupleValueDefaultArg: { [producer: string]: number } = {};
    // array literals the current print opens as a Go slice (set by the call-argument rule)
    goSliceLiteralTypes: Map<any, string> = new Map<any, string>();
    // installed by the ccxt build: GetArg alias -> Go types, and the audited consumer table
    CCXT_GO_GETARG_DECLARED_TYPES: any;
    CCXT_GO_GETARG_SAFE_CONSUMERS: any;
    goGetArgTypeCache: WeakMap<any, string | undefined>;
    goGetArgTypeComputing: Set<any>;
    // declarations whose Go local type is being resolved right now (see goLocalStaticType)
    goLocalTypeResolution = new Set<any>();
    // goSelfConcatIsString's answer per non-self leaf node
    goSelfConcatLeafCache = new WeakMap<any, boolean>();
    goLocalStaticTypeCache = new WeakMap<object, string | undefined>();
    // binary-expression texts and goNativeArithmetic types, keyed by node + print context, alive only
    // while the outermost binary print/typing runs: operand typing re-prints every nested operator
    goBinaryMemo: Map<object, Map<string, any>> | undefined;
    // appended to every async (channel returning) Go method/function name and to each
    // checker-resolved call site of one; '' disables the rename
    asyncMethodSuffix = '';
    // declaring-file patterns whose async methods keep the plain name at call sites (generated
    // endpoint bodies the target language implements itself, e.g. ccxt's ts/src/abstract/)
    asyncSuffixExemptPaths: RegExp[] = [];
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
        this.asyncSuffixExemptPaths = (config['asyncSuffixExemptPaths'] ?? []).map((p) => new RegExp(p));
        this.unifiedStringParams = config['unifiedStringParams'] ?? {};
        this.unifiedSliceParams = config['unifiedSliceParams'] ?? {};
        this.unifiedBoolParams = config['unifiedBoolParams'] ?? {};
        this.uncalledStringParams = config['uncalledStringParams'] ?? {};
        this.stringPointerTupleCalls = config['stringPointerTupleCalls'] ?? [];
        this.predictionMapFields = new Set<string>(config['predictionMapFields'] ?? []);  // RFM-G4 G09
        this.siblingStringPassthroughPattern = (typeof config['siblingStringPassthroughPattern'] === 'string') ? new RegExp(config['siblingStringPassthroughPattern']) : undefined;
        // consumer tables for the stdlib import placement (goStdlibImportIsPlaceable): the source paths
        // whose writer declares its own imports, and the comment markers of the spans a writer cuts out
        this.goBaseFileStdlibImportSeamPaths = config['baseFileStdlibImportSeamPaths'] !== undefined ? new RegExp(config['baseFileStdlibImportSeamPaths']) : undefined;
        this.goExcisedSpanMarkers = config['excisedSpanMarkers'];
        this.nativeStoreFields = config['nativeStoreFields'];  // RF-go-6-B
        this.goOrderBook = config['orderBook'];  // RF-go-6-D
        const owned = config['ownedField'];
        this.goOwnedField = (owned === undefined) ? undefined : {
            field: owned['field'], declaredIn: owned['declaredIn'], snapshot: owned['snapshot'], remove: owned['remove'],
            ownerSide: (owned['ownerSideMethods'] ?? []).map((p: string) => new RegExp(p)),
        };
        this.generatedListCallees = new Set<string>(config['generatedListCallees'] ?? []); // RF-go-6-C
        this.goTupleSlotTypes = config['goTupleSlotTypes'] ?? {};
        this.goTupleValueDefaultArg = config['goTupleValueDefaultArg'] ?? {};
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
            [SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
            [SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
            [SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
            [SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
            [SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
            [SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
            [SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
            [SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
            [SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE],
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
        } else if (node.type.kind === SyntaxKind.BooleanKeyword || isBooleanLiteral(node)) {
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
            let heritageEscapedText = heritageType.expression.text;
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
        this.className = node.name.text;
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
            if (index === 0) {
                return decl;
            }
            return (this.startsWithComment(decl) ? "\n\n" : "\n") + decl;
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
        const methodDef = this.printMethodDefinition(node, identation);
        const isAsync = this.isAsyncFunction(node);
        const funcBody = this.printFunctionBody(node, identation, isAsync);
        if (!isAsync) {
            return methodDef + funcBody;
        }
        return this.printAsyncDeclarationPair(node, identation, methodDef, funcBody, true);
    }

    // Trampoline + body pair, see printAsyncTrampolineBlock. A module-scope `async function`
    // has no receiver: its body is a package-level sibling with the same trampoline contract.
    printAsyncDeclarationPair(node, identation, def: string, funcBody: string, isMethod: boolean): string {
        const goName = this.transformMethodNameIfNeeded(node.name.text);
        const bodyName = this.getAsyncBodyName(node, goName);
        const callee = isMethod ? `${this.THIS_TOKEN}.${bodyName}` : bodyName;
        const trampoline = def + this.printAsyncTrampolineBlock(node, identation, callee);
        const receiver = isMethod ? `(${this.THIS_TOKEN} *${this.className}) ` : "";
        const bodyDef = `${this.getIden(identation)}func ${receiver}${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;
        return trampoline + "\n" + bodyDef + funcBody;
    }

    printFunctionDeclaration(node, identation) {
        if (isArrowFunction(node)) {
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
        return this.printAsyncDeclarationPair(node, identation, functionDef, funcBody, false);
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
            if (parent && isClassDeclarationNode(parent)) {
                parent.members.forEach((member: any) => remember(member?.name?.text));
            } else if (parent && isSourceFile(parent)) {
                parent.statements.forEach((statement: any) => {
                    if (isFunctionDeclaration(statement)) {
                        remember(statement?.name?.text);
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
            if (symbol && (symbol.flags & SymbolFlags.Alias)) {
                symbol = this.getChecker().getAliasedSymbol(symbol);
            }
            decls = symbol?.declarations?.map((d) => d.resolve());
        } catch {
            return goName;
        }
        if (!decls || decls.length === 0) {
            return goName;
        }
        // only declarations with a body count: interface/abstract signatures (e.g. implicit API
        // endpoints declared as `foo(params?: {}): Promise<T>;`) are emitted elsewhere, unsuffixed
        const isAsyncDecl = decls.some((d) => (isMethodDeclaration(d) || isFunctionDeclaration(d))
            && d.body !== undefined && this.isAsyncFunction(d) && !this.isAsyncSuffixExempt(d));
        return isAsyncDecl ? goName + this.asyncMethodSuffix : goName;
    }

    isAsyncSuffixExempt(decl): boolean {
        if (this.asyncSuffixExemptPaths.length === 0) {
            return false;
        }
        const fileName = String(decl.getSourceFile()?.fileName ?? '').replace(/\\/g, '/');
        return this.asyncSuffixExemptPaths.some((re) => re.test(fileName));
    }

    printMethodDefinition(node, identation) {
        return this.printGoSignature(node, identation, `(${this.THIS_TOKEN} *${this.className}) `);
    }

    printFunctionDefinition(node, identation) {
        return this.printGoSignature(node, identation, "");
    }

    // F04: `func`, the receiver, the name and the return type are separated by exactly one
    // space, and the signature carries NO trailing space — the block opener (`getBlockOpen`,
    // or `printAsyncTrampolineBlock`) contributes the single space before `{`.
    printGoSignature(node, identation, receiver: string): string {
        const name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(node.name.text));
        // G03: a market producer whose every path answers a dictionary prints that map
        const returnType = (this.goMarketProducerReturnType(node) ?? this.goNonceReturnType(node) ?? this.printFunctionType(node)).trim();
        const parsedArgs = this.printMethodParameters(node);
        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
        const returnSignature = returnType ? " " + returnType : "";
        const methodDef = this.getIden(identation) + methodToken + receiver + name + "(" + parsedArgs + ")" + returnSignature;
        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printMethodParameters(node) {
        const params = node.parameters.map(param => this.printParameter(param));
        const required = params.filter(param => param !== 'optional');
        if (required.length < params.length) {
            required.push('optionalArgs ...any');
        }
        return required.join(", ");
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        const type = this.printParameterType(node);

        if (defaultValue && initializer) {
            return 'optional'; // printMethodParameters folds these into `optionalArgs ...any`
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
        return 'any';
    }

    printFunctionType(node){
        const typeText = this.getFunctionType(node);
        if (typeText === 'void') {
            return "";
        }
        if (typeText === undefined || (typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD)) {
            const res = this.isAsyncFunction(node) ? `<-chan ${this.DEFAULT_RETURN_TYPE}` : this.DEFAULT_RETURN_TYPE;
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
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return 'bool';
        case SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!EvalTruthy(x)`
            return (initializer.operator === SyntaxKind.ExclamationToken) ? 'bool' : undefined;
        case SyntaxKind.ParenthesizedExpression:
            return this.goTypeOfInitializer(initializer.expression, printedValue);
        case SyntaxKind.AsExpression: { // RF-go-6-C: `x as T[]` prints as its operand, so a slice operand keeps its slice type
            const inner = this.goTypeOfInitializer(initializer.expression, printedValue);
            if ((typeof inner === 'string') && inner.startsWith('[]')) {
                return inner;
            }
            break; // every other cast keeps the printed-call classification below
        }
        case SyntaxKind.ElementAccessExpression: // RF-go-6-C
        {
            const element = this.goLoopBoundedStringElementType(initializer, printedValue);
            if (element !== undefined) {
                return element;
            }
            break;
        }
        case SyntaxKind.Identifier:
            // `x := y` holds exactly what y holds, so it carries y's printed Go type: the
            // alias is declared with that type and reads through it natively [hx10w7 G10]
            return this.goDeclaredTypeOfIdentifier(initializer);
        case SyntaxKind.BinaryExpression: {
            // `a || b` prints `EvalTruthy(a) || EvalTruthy(b)`, a Go bool
            const op = initializer.operatorToken.kind;
            if ((op === SyntaxKind.BarBarToken) || (op === SyntaxKind.AmpersandAmpersandToken)) {
                return 'bool';
            }
            // `a === b` prints either `IsEqual(a, b)` or an inlined `(a == b)`;
            // `a < b` prints either `IsLessThan(a, b)` or an inlined `(a < b)`.
            // All of them are Go bools.
            if ((op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken)
                || (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken)
                || (ORDERED_COMPARISON_OPERATORS[op] !== undefined)) {
                return 'bool';
            }
            // a `+` chain goNativeStringConcat prints as the Go operator is a Go string
            if ((op === SyntaxKind.PlusToken) && (this.goNativeArithmetic(initializer)?.goType === 'string')) {
                return 'string';
            }
            break;
        }
        case SyntaxKind.CallExpression: {
            // `x.toString()` that printToStringCall inlined to the receiver's own text: the
            // declaration then holds that receiver's value, i.e. the same Go string. Every
            // other receiver keeps the helper call, whose own return type is classified below.
            const property = initializer.expression;
            if ((property?.kind === SyntaxKind.PropertyAccessExpression)
                && (property.name?.text === 'toString')
                && (initializer.arguments?.length === 0)
                && ((this.goOperandStaticType(property.expression, printedValue) === 'string')
                    || this.goDerefableStringOperand(property.expression))) {
                return 'string';
            }
            break;
        }
        }
        // `const x = (a === b)` prints the wrapping parentheses of the source
        const value = this.goUnwrapPrintedParens(printedValue);
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
        return GO_NATIVE_CALL_RETURN_TYPES[callee] ?? GO_HELPER_RETURN_TYPES[callee] ?? this.goHostListCalleeType(callee, initializer); // RF-go-6-C
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
        const declaration: any = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        if (declaration.parent?.parent?.kind !== SyntaxKind.FirstStatement) {
            return undefined; // declared with `:=`, where the printer annotates nothing
        }
        if (this.goLocalTypeResolution.has(declaration)) {
            return undefined; // the safety scan below prints an expression using this same local
        }
        // only a top-level answer is stable: nested ones see the recursion guard above
        const topLevel = this.goLocalTypeResolution.size === 0;
        if (topLevel && this.goLocalStaticTypeCache.has(declaration)) {
            return this.goLocalStaticTypeCache.get(declaration);
        }
        this.goLocalTypeResolution.add(declaration);
        try {
            const goType = this.getGoLocalType(declaration, this.printNode(declaration.initializer, 0));
            if (topLevel) {
                this.goLocalStaticTypeCache.set(declaration, goType);
            }
            return goType;
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
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        const declarationList = declaration.parent;
        if (declarationList?.kind !== SyntaxKind.VariableDeclarationList
            || declarationList.parent?.kind === SyntaxKind.FirstStatement) {
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
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (declaration?.kind !== SyntaxKind.Parameter) {
            return undefined;
        }
        // a defaulted parameter bound through `GetArgString` & co. is that Go scalar
        const bound = this.goGetArgParameterType(declaration);
        if ((bound !== undefined) && (GO_TYPE_NAMES.indexOf(bound) >= 0) && ['string', 'int64', 'float64'].includes(bound)) {
            return bound;
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
        if (node?.kind !== SyntaxKind.Identifier) {
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
        return (type.flags & TypeFlags.StringLike) !== 0;
    }

    // a `*string` local every write of which is a SafeString-family call with a literal
    // default: that Go method can only return a fresh non-nil pointer, so the local may
    // be deref'd even where the checker offers no narrowing. One write of any other
    goDefaultedSafeStringLocal(node): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        } catch (e) {
            return false;
        }
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.name?.kind !== SyntaxKind.Identifier)) {
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
        const name = declaration.name.text;
        let everyWriteDefaulted = true;
        const visit = (n) => {
            if (!everyWriteDefaulted) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name)) {
                const parent: any = n.parent;
                if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n)
                    && (GO_WRITE_OPERATOR_KINDS.indexOf(parent.operatorToken?.kind) >= 0)) {
                    everyWriteDefaulted = (parent.operatorToken.kind === SyntaxKind.EqualsToken)
                        && this.goDefaultedSafeStringCall(parent.right);
                    return;
                }
                if ((parent?.kind === SyntaxKind.PrefixUnaryExpression) || (parent?.kind === SyntaxKind.PostfixUnaryExpression)) {
                    everyWriteDefaulted = false;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return everyWriteDefaulted;
    }

    // a call to one of the hand-written SafeString-family methods that passes enough
    // arguments for the default and whose default is a literal (never the absent case)
    goDefaultedSafeStringCall(node): boolean {
        const call: any = node;
        if (call?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = call.expression;
        if ((callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const arity = GO_DEFAULTED_SAFE_STRING_ARITY[callee.name?.text];
        if ((arity === undefined) || ((call.arguments?.length ?? 0) < arity)) {
            return false;
        }
        const last: any = call.arguments[call.arguments.length - 1];
        return GO_NON_NIL_DEFAULT_KINDS.indexOf(last?.kind) >= 0;
    }

    // `(x as string)` where `x` is a nilable Go `*string`: the TS accessors type safeString as
    // `string | undefined`, so the assertion is the author's non-null promise — an undefined
    // receiver would throw at this very call. The pointee may be read without a nil guard.
    goAssertedStringDeref(node): boolean {
        let asserted = node;
        while (asserted?.kind === SyntaxKind.ParenthesizedExpression) {
            asserted = asserted.expression;
        }
        if ((asserted?.kind !== SyntaxKind.AsExpression) || (asserted.type === undefined)) {
            return false;
        }
        const typeNode: any = asserted.type;
        const assertsString = (typeNode?.kind === SyntaxKind.StringKeyword)
            || ((typeNode?.kind === SyntaxKind.TypeReference) && (typeNode.typeName?.text === 'string'));
        if (!assertsString) {
            return false;
        }
        let target = asserted.expression;
        while (target?.kind === SyntaxKind.ParenthesizedExpression) {
            target = target.expression;
        }
        return (target?.kind === SyntaxKind.Identifier) && (this.goDeclaredTypeOfIdentifier(target) === '*string');
    }

    // a `*string` leaf the concat may deref: the checker narrowed it to a non-nilable
    // string at that use, a local whose every write is a defaulted SafeString-family
    // call, or such a call inline
    goDerefableStringOperand(node): boolean {
        if (this.goNilProvenStringDeref(node)) {
            return true;
        }
        if (this.goAssertedStringDeref(node)) {
            return true;
        }
        if (node?.kind === SyntaxKind.Identifier) {
            return this.goDefaultedSafeStringLocal(node);
        }
        return this.goDefaultedSafeStringCall(node);
    }

    // the printed text of a `+` operand the concat rule may use: the printer's own
    // text for a proven string, or the deref goNativeBinaryText adds for a derefable
    // `*string` leaf. undefined keeps the helper call.
    goStringConcatOperandType(node, printedText: string): string | undefined {
        if (this.goConcatDerefableStringOperand(node)) {
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
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case SyntaxKind.NumericLiteral:
            return /^[0-9]+$/.test(node.text) ? 'const-int' : this.goConstFloatStaticType(node);
        case SyntaxKind.ParenthesizedExpression:
            return this.goOperandStaticType(node.expression, this.goUnwrapPrintedParens(printedText));
        case SyntaxKind.AsExpression:
            // an assertion prints nothing: the asserted expression's Go type governs the operand
            return this.goOperandStaticType(this.goUnwrapPrintedAssertions(node.expression), printedText);
        case SyntaxKind.BinaryExpression:
            return this.goConstantProductKind(node) ?? this.goNativeArithmeticType(node);
        case SyntaxKind.Identifier:
            return this.goLocalStaticType(node) ?? this.goInferredLocalStaticType(node) ?? this.goDeclaredParamStaticType(node);
        case SyntaxKind.PropertyAccessExpression:
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
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
            return this.isNonZeroIntegerLiteral(node.expression);
        }
        return node?.kind === SyntaxKind.NumericLiteral && /^[1-9][0-9]*$/.test(node.text);
    }

    isNonZeroFloatLiteral(node): boolean {
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
            return this.isNonZeroFloatLiteral(node.expression);
        }
        return (this.goConstFloatStaticType(node) !== undefined) && (Number(node.text.replaceAll('_', '')) !== 0);
    }

    // the exact value of a constant-only integer expression, undefined otherwise. Go folds `a * b`
    // over literals in arbitrary precision, so it must fit `int` and stay exact for the helper's
    // float64 path — the bound the caller checks.
    goConstantIntValue(node): number | undefined {
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
            return this.goConstantIntValue(node.expression);
        }
        if (node?.kind === SyntaxKind.NumericLiteral) {
            return /^[0-9]+$/.test(node.text) ? Number(node.text) : undefined;
        }
        if (node?.kind !== SyntaxKind.BinaryExpression) {
            return undefined;
        }
        const left = this.goConstantIntValue(node.left);
        const right = (left === undefined) ? undefined : this.goConstantIntValue(node.right);
        if (right === undefined) {
            return undefined;
        }
        switch (node.operatorToken.kind) {
        case SyntaxKind.PlusToken: return left + right;
        case SyntaxKind.MinusToken: return left - right;
        case SyntaxKind.AsteriskToken: return left * right;
        case SyntaxKind.SlashToken: return (right === 0) ? undefined : Math.trunc(left / right);
        case SyntaxKind.PercentToken: return (right === 0) ? undefined : left % right;
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
            if (parent?.kind === SyntaxKind.ParenthesizedExpression && (parent.expression === current)) {
                current = parent;
                continue;
            }
            if (parent?.kind === SyntaxKind.BinaryExpression && ((parent.left === current) || (parent.right === current))
                && (GO_ARITHMETIC_KINDS.indexOf(parent.operatorToken.kind) >= 0)) {
                current = parent;
                continue;
            }
            break;
        }
        const declaration = current?.parent;
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.initializer !== current) {
            return false;
        }
        // the printer annotates `var x T = ...` only; `x := ...` carries the
        // initializer's own type instead
        return declaration.parent?.parent?.kind === SyntaxKind.FirstStatement;
    }

    // The bare Go operator must yield what the runtime helper returns (go/v4/exchange_helpers.go):
    // Add keeps int/int64, while Subtract/Multiply/Divide/Mod take an exact int64 path or a float64
    // path, so only the rows below are equivalent.
    goNativeNumericResultType(op, leftType: string, rightType: string, node): string | undefined {
        const isIntKind = (kind: string) => (kind === 'int') || (kind === 'int64') || (kind === 'const-int');
        const isFloatKind = (kind: string) => (kind === 'float64') || (kind === 'const-float');
        const leftNode = node.left;
        const rightNode = node.right;
        const constKinds = ['const-int', 'const-float'];
        if ((op === SyntaxKind.AsteriskToken) && constKinds.includes(leftType) && constKinds.includes(rightType)) {
            // literal products fold as exact Go constants (may differ from the float64 helper in the last bit)
            return this.goNativeConstantProductType(node, leftType, rightType);
        }
        if (isFloatKind(leftType) !== isFloatKind(rightType)) {
            return undefined; // Go has no operator that mixes an int and a float64 operand
        }
        if (isFloatKind(leftType) && isFloatKind(rightType)) {
            // the helper's float path is float64 arithmetic; its integral result boxes
            // as int64, the same normalization Subtract/Multiply/Divide already accept.
            // A constant operand must stay exactly representable: Go folds a constant
            if (op === SyntaxKind.PercentToken) {
                return undefined; // Mod is math.Mod, no Go operator matches it
            }
            if (((leftType === 'const-float') && (rightType === 'const-float'))) {
                return undefined; // only a value the compiler folds exactly would match
            }
            if ((op === SyntaxKind.SlashToken) && !this.isNonZeroFloatLiteral(rightNode)) {
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
        if (op === SyntaxKind.PlusToken) {
            // Add keeps its own int/int64 rows: its box carries the operand kind
            return operands;
        }
        if ((op === SyntaxKind.SlashToken) && this.isNonZeroIntegerLiteral(rightNode)) {
            return 'float64'; // JS division: goNativeArithmetic converts the operands to float64
        }
        if ((operands === 'int') && this.goInsideTypedDeclarationInitializer(node)) {
            // the declared-local table names this position int64 when its int-kind
            // proof holds, and the `int` an operator would yield is not that type
            return undefined;
        }
        if (op === SyntaxKind.PercentToken) {
            // Mod is math.Mod over float64: exact for integral operands, but a zero
            // divisor boxes NaN where % panics, so only a literal divisor is decidable
            return this.isNonZeroIntegerLiteral(rightNode) ? operands : undefined;
        }
        if ((op === SyntaxKind.SlashToken) && !this.isNonZeroIntegerLiteral(rightNode)) {
            return undefined; // Divide returns nil on a zero divisor, the operator panics
        }
        // int64 in, int64 out: Subtract goes through ParseInt, Multiply/Mod use reflect Int()
        return operands;
    }

    // a literal-only `*` chain is itself an untyped Go constant, so an enclosing product folds too
    goConstantProductKind(node): string | undefined {
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
            return this.goConstantProductKind(node.expression);
        }
        if (node?.kind === SyntaxKind.NumericLiteral) {
            return /^[0-9]+$/.test(node.text) ? 'const-int' : this.goConstFloatStaticType(node);
        }
        if ((node?.kind !== SyntaxKind.BinaryExpression) || (node.operatorToken.kind !== SyntaxKind.AsteriskToken)) {
            return undefined;
        }
        const left = this.goConstantProductKind(node.left);
        const right = (left === undefined) ? undefined : this.goConstantProductKind(node.right);
        if ((right === undefined) || (this.goNativeConstantProductType(node, left, right) === undefined)) {
            return undefined;
        }
        return ((left === 'const-float') || (right === 'const-float')) ? 'const-float' : 'const-int';
    }

    // `2 * 1.67` is an untyped float constant (float64); an integer chain stays an untyped int
    // constant, which a typed `var x int64 = ...` declaration converts, so it is named int64 there.
    goNativeConstantProductType(node, leftType: string, rightType: string): string | undefined {
        if ((leftType === 'const-float') || (rightType === 'const-float')) {
            return 'float64';
        }
        const value = this.goConstantIntValue(node);
        if ((value === undefined) || (Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
            return undefined;
        }
        return this.goInsideTypedDeclarationInitializer(node) ? 'int64' : 'int';
    }

    // an operand that is itself a bare operator expression needs parens under a
    // tighter parent operator; a whole helper call is already delimited
    goNativeOperandText(node, printedText: string): string {
        const text = printedText.trim();
        if (node?.kind !== SyntaxKind.BinaryExpression || text.startsWith('(')) {
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

    // goNativeArithmetic's Go type for an operand (memoized within the enclosing binary print)
    goNativeArithmeticType(node): string | undefined {
        const key = `type|${this.goBinaryContextKey()}`;
        return this.goBinaryMemoized(node, key, () => this.goNativeArithmetic(node)?.goType);
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
        if (op === SyntaxKind.PlusToken) {
            const concat = this.goNativeStringConcat(node, leftText, rightText);
            if (concat !== undefined) {
                return concat;
            }
            const pointerAddition = this.goNonNilPointerAdditionText(node, leftText, rightText);
            if (pointerAddition !== undefined) {
                return { 'goType': 'int64', 'text': pointerAddition };
            }
        }
        const pointerSubtraction = this.goNonNilPointerSubtractionText(node, leftText, rightText);
        if (pointerSubtraction !== undefined) {
            return { 'goType': 'int64', 'text': pointerSubtraction };
        }
        const pointerProduct = this.goNonNilPointerProductText(node, leftText, rightText);
        if (pointerProduct !== undefined) {
            return { 'goType': 'int64', 'text': pointerProduct };
        }
        const pointerDivision = this.goNonNilPointerDivisionText(node, leftText, rightText);
        if (pointerDivision !== undefined) {
            return { 'goType': 'float64', 'text': pointerDivision };
        }
        const leftType = this.goOperandStaticType(node.left, leftText);
        const rightType = this.goOperandStaticType(node.right, rightText);
        if (leftType === undefined || rightType === undefined) {
            return undefined;
        }
        if (leftType === 'string' || rightType === 'string') {
            if (leftType !== 'string' || rightType !== 'string' || op !== SyntaxKind.PlusToken) {
                return undefined; // the other four helpers return nil for strings
            }
            return { 'goType': 'string', 'text': this.goNativeBinaryText(node, '+', leftText, rightText) };
        }
        const widened = this.goNativeIntWideningArithmetic(node, leftType, rightType, leftText, rightText);
        if (widened !== undefined) {
            return widened;
        }
        const goType = this.goNativeNumericResultType(op, leftType, rightType, node);
        if (goType === undefined) {
            return undefined;
        }
        const isIntKind = (kind: string) => (kind === 'int') || (kind === 'int64') || (kind === 'const-int');
        if ((op === SyntaxKind.SlashToken) && isIntKind(leftType) && isIntKind(rightType)) {
            return { goType, 'text': this.goFloatDivisionText(node, leftType, rightType, leftText, rightText) };
        }
        return { goType, 'text': this.goNativeBinaryText(node, this.SupportedKindNames[op], leftText, rightText) };
    }

    // `a - b` where each side is a non-nil `*int64` (dereferenced), an int64 value or an int literal and at
    // least one side is a pointer: Subtract's integral result is the same int64 box
    goNonNilPointerSubtractionText(node, leftText: string, rightText: string): string | undefined {
        if (node.operatorToken.kind !== SyntaxKind.MinusToken) {
            return undefined;
        }
        const left = this.goInt64Operand(node.left, leftText);
        const right = (left === undefined) ? undefined : this.goInt64Operand(node.right, rightText);
        if ((right === undefined) || (!left.pointer && !right.pointer)) {
            return undefined;
        }
        return left.text + ' - ' + right.text;
    }

    goInt64Operand(node, printedText: string): { pointer: boolean, text: string } | undefined {
        const text = this.goUnwrapPrintedParens(printedText.trim());
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
            return this.goInt64Operand(node.expression, text);
        }
        if (node?.kind === SyntaxKind.NumericLiteral) {
            return (/^[0-9]+$/.test(node.text) && (Number(node.text) <= Number.MAX_SAFE_INTEGER)) ? { 'pointer': false, text } : undefined;
        }
        if (node?.kind === SyntaxKind.Identifier) {
            if ((this.goDeclaredTypeOfIdentifier(node) === '*int64') && this.goPointerNumberIsNonNil(node)) {
                return { 'pointer': true, 'text': '*' + text };
            }
            return (this.goOperandStaticType(node, text) === 'int64') ? { 'pointer': false, text } : undefined;
        }
        if (this.goDefaultedSafeIntegerCall(node)) {
            return { 'pointer': true, 'text': '*' + text };
        }
        if ((node?.kind === SyntaxKind.CallExpression) && (this.goOperandStaticType(node, text) === 'int64')) {
            return { 'pointer': false, text };
        }
        return undefined;
    }

    // `a + b` over the same int-kind operands as the subtraction: Add's int64 row returns the
    // same int64 sum, so a non-nil `*int64` leaf plus an int64 value or int literal is native
    goNonNilPointerAdditionText(node, leftText: string, rightText: string): string | undefined {
        const left = this.goInt64Operand(node.left, leftText);
        const right = (left === undefined) ? undefined : this.goInt64Operand(node.right, rightText);
        if ((right === undefined) || (!left.pointer && !right.pointer)) {
            return undefined;
        }
        return left.text + ' + ' + right.text;
    }

    // `a * b` over the same operands as the subtraction (or a nested int64 product): Multiply's
    // Int-kind branch returns the same wrapping int64 product
    goNonNilPointerProductText(node, leftText: string, rightText: string): string | undefined {
        if (node.operatorToken.kind !== SyntaxKind.AsteriskToken) {
            return undefined;
        }
        const left = this.goInt64ProductOperand(node.left, leftText);
        const right = (left === undefined) ? undefined : this.goInt64ProductOperand(node.right, rightText);
        if ((right === undefined) || (!left.pointer && !right.pointer)) {
            return undefined;
        }
        return left.text + ' * ' + right.text;
    }

    goInt64ProductOperand(node, printedText: string): { pointer: boolean, text: string } | undefined {
        let inner = node;
        while (inner?.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        if ((inner?.kind === SyntaxKind.BinaryExpression) && (this.goNativeArithmeticType(inner) === 'int64')) {
            const text = printedText.trim();
            return { 'pointer': false, 'text': text.startsWith('(') ? text : '(' + text + ')' };
        }
        return this.goInt64Operand(node, printedText);
    }

    // this.safeInteger{,2,N} with an integer literal default: the Go method returns &default on every nil path
    goDefaultedSafeIntegerCall(node): boolean {
        if ((node?.kind !== SyntaxKind.CallExpression) || (node.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (node.expression.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const arity = { 'safeInteger': 3, 'safeInteger2': 4, 'safeIntegerN': 3 }[node.expression.name?.text];
        const last = node.arguments?.[arity - 1];
        return (arity !== undefined) && (node.arguments.length === arity) && (last?.kind === SyntaxKind.NumericLiteral)
            && /^[0-9]+$/.test(last.text);
    }

    // `x / N` on a non-nil `*int64` with a nonzero integer literal N, passed whole to Math.floor/ceil/round
    // or parseToInt: those read Divide's int64-when-integral box and the float64 quotient alike
    // (`*float64` keeps the helper: -0 and ±Inf box differently)
    goNonNilPointerDivisionText(node, leftText: string, rightText: string): string | undefined {
        if ((node.operatorToken.kind !== SyntaxKind.SlashToken) || !this.isNonZeroIntegerLiteral(node.right)) {
            return undefined;
        }
        const left = node.left;
        const declared = this.goDeclaredTypeOfIdentifier(left);
        if (declared !== '*int64') {
            return undefined;
        }
        if (!this.goPointerNumberIsNonNil(left) || !this.goDivisionConsumerIgnoresBox(node)) {
            return undefined;
        }
        return 'float64(*' + leftText.trim() + ') / ' + this.goUnwrapPrintedParens(rightText.trim());
    }

    // the checker narrowed the identifier to a plain number here, or an enclosing guard tests it
    goPointerNumberIsNonNil(ident): boolean {
        if (this.goHasEnclosingNilGuard(ident)) {
            return true;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const type = checker.getTypeAtLocation(ident);
        return (type !== undefined) && ((type.flags & TypeFlags.NumberLike) !== 0);
    }

    // the division (through parens) is the only argument of this.parseToInt or Math.floor/ceil/round
    goDivisionConsumerIgnoresBox(node): boolean {
        let child = node;
        let parent = node.parent;
        while (parent?.kind === SyntaxKind.ParenthesizedExpression) {
            child = parent;
            parent = parent.parent;
        }
        if ((parent?.kind !== SyntaxKind.CallExpression) || (parent.arguments?.length !== 1) || (parent.arguments[0] !== child)) {
            return false;
        }
        const callee = parent.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression) {
            return false;
        }
        const owner = callee.expression;
        const name = callee.name?.text;
        if (owner?.kind === SyntaxKind.ThisKeyword) {
            return name === 'parseToInt';
        }
        return (owner?.kind === SyntaxKind.Identifier) && (owner.text === 'Math') && ['floor', 'ceil', 'round'].includes(name);
    }

    // int / int is a float64 division as in JS: typed operands convert, and with two constants
    // the left one does (an untyped constant operand then converts implicitly)
    goFloatDivisionText(node, leftType: string, rightType: string, leftText: string, rightText: string): string {
        const castLeft = (leftType !== 'const-int') || (rightType === 'const-int');
        const castRight = rightType !== 'const-int';
        const cast = (printed: string) => 'float64(' + this.goUnwrapPrintedParens(printed.trim()) + ')';
        const left = castLeft ? cast(leftText) : this.goNativeOperandText(node.left, leftText);
        const right = castRight ? cast(rightText) : this.goNativeOperandText(node.right, rightText);
        return left + ' / ' + right;
    }

    // the operator line gofmt prints for a natively emitted arithmetic expression: the
    // blanks follow go/printer's cutoff at the current depth, and a binary operand is
    // re-printed at the expression's own depth (a same-precedence left operand, or the
    // parentheses the printer wraps it in, which undo the one level the operand adds)
    goNativeBinaryText(node, symbol: string, leftText: string, rightText: string): string {
        const operandText = (operand, printed: string) => {
            const isBinary = operand?.kind === SyntaxKind.BinaryExpression;
            const text = isBinary ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(operand, 0)) : printed;
            // a derefable `*string` leaf is the only operand that prints in a different
            // shape than the printer produced: the operator needs its pointee
            const leaf = this.goConcatDerefableStringOperand(operand) ? ('*' + text.trim()) : text;
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
        const isAdd = op === SyntaxKind.PlusEqualsToken;
        const isSubtract = op === SyntaxKind.MinusEqualsToken;
        if (!isAdd && !isSubtract) {
            return undefined;
        }
        const stringAdd = leftType === 'string' && isAdd && rightType === 'string';
        const int64Op = leftType === 'int64' && (rightType === 'int64' || rightType === 'const-int');
        if (!stringAdd && !int64Op) {
            return undefined;
        }
        return `${leftText.trim()} ${isAdd ? '+=' : '-='} ${rightText.trim()}`;
    }

    goEnclosingFunction(node) {
        let current = node?.parent;
        while (current) {
            switch (current.kind) {
            case SyntaxKind.MethodDeclaration:
            case SyntaxKind.FunctionDeclaration:
            case SyntaxKind.FunctionExpression:
            case SyntaxKind.ArrowFunction:
            case SyntaxKind.Constructor:
            case SyntaxKind.SourceFile:
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
            const isBinding = (n.kind === SyntaxKind.Parameter) || (n.kind === SyntaxKind.VariableDeclaration);
            if (isBinding && (n.name?.kind === SyntaxKind.Identifier)) {
                if (relevant.indexOf(n.name.text as string) >= 0) { return true; }
            }
            return false;
        });
    }

    // the shape `x.push(v)` that both the native emission and the declaration's safety
    // scan accept: the printed `x = append(x, v)` is a statement, so a value position or
    // a multi-argument/spread call still needs the helper
    goIsNativeAppendShape(receiverNode, pushNode): boolean {
        if (receiverNode?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        if (pushNode?.parent?.kind !== SyntaxKind.ExpressionStatement) {
            return false;
        }
        if ((pushNode.questionDotToken !== undefined) || (pushNode.expression?.questionDotToken !== undefined)) {
            return false;
        }
        const access = pushNode.expression;
        if ((access?.kind !== SyntaxKind.PropertyAccessExpression) || (access.expression !== receiverNode)
            || (access.name?.text !== 'push')) {
            return false;
        }
        const args = pushNode.arguments;
        return (args?.length === 1) && (args[0].kind !== SyntaxKind.SpreadElement);
    }

    // `x.push(v)` on a local declared `[]any` prints `x = append(x, v)`; undefined keeps
    // AppendToArray(&x, v). An `any` box keeps the helper: `&x` is a *any there, while a declared
    // []any local would pass a *[]any the helper's parameter does not accept.
    goNativeAppendReceiver(pushNode): string | undefined {
        const receiver = pushNode?.expression?.expression;
        if (!this.goIsNativeAppendShape(receiver, pushNode)) {
            return undefined;
        }
        const declared = this.goResolvedLocalGoType(receiver);
        if (declared === GO_STRING_LIST_LOCAL_TYPE) {
            return this.goStringListAppendsAString(pushNode) ? this.printNode(receiver, 0) : undefined;
        }
        if (declared !== '[]any') {
            return undefined;
        }
        return this.printNode(receiver, 0);
    }

    // the Go type of an identifier: the memoised verdict, or a fresh resolution when the cache
    // holds the `any` a nested query answered before the declaration printed
    goResolvedLocalGoType(receiver): string | undefined {
        const declared = this.goDeclaredTypeOfIdentifier(receiver);
        if (declared !== undefined) {
            return declared;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(receiver)?.valueDeclaration?.resolve();
        if ((decl?.kind !== SyntaxKind.VariableDeclaration) || this.goDeclaredTypeInProgress.has(decl)) {
            return undefined;
        }
        this.goDeclaredTypeInProgress.add(decl);
        try {
            const printed = (decl.initializer === undefined) ? this.UNDEFINED_TOKEN : this.printNode(decl.initializer, 0);
            return this.getGoLocalType(decl, printed);
        } finally {
            this.goDeclaredTypeInProgress.delete(decl);
        }
    }

    // `x.push(v)` on a local the printer declares []string appends natively when v already
    // prints as a Go string: `x = append(x, v)` keeps the element type and the helper's order
    goStringListAppendsAString(pushNode): boolean {
        const receiver = pushNode?.expression?.expression;
        if (!this.goIsNativeAppendShape(receiver, pushNode)) {
            return false;
        }
        return this.goStringValueNodeIsProven(pushNode.arguments[0]);
    }

    // the pushed value is a Go string without printing it: a literal, a local declared `string`,
    // or an element read of a []string slice. Printing here would resolve other locals' types
    // from inside a declaration's own safety scan and poison their caches.
    goStringValueNodeIsProven(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case SyntaxKind.ParenthesizedExpression:
            return this.goStringValueNodeIsProven(node.expression);
        case SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node) === 'string';
        case SyntaxKind.ElementAccessExpression: {
            const base = node.expression;
            if (base?.kind !== SyntaxKind.Identifier) {
                return false;
            }
            const declared = this.goDeclaredTypeOfIdentifier(base);
            return declared === GO_STRING_LIST_LOCAL_TYPE;
        }
        }
        return false;
    }

    // reject the refinement when something downstream needs the local to stay `any`:
    // `x.push(v)` prints `AppendToArray(&x, v)` (a *T is not a *any) and a later
    // assignment of a value with another concrete type would stop compiling
    goLocalIsSafeToType(scope, declaration, varName: string, goType: string, stringWriteProven = false): boolean {
        if (scope === undefined) {
            return false;
        }
        const safe = !this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind === SyntaxKind.Identifier) && (n.text === varName) && (n !== declaration.name)) {
                if (this.goOtherBindingOfLoopBoundedElement(n, declaration)) { // RF-go-6-C
                    return false;
                }
                const parent = n.parent;
                if (parent?.kind === SyntaxKind.PropertyAccessExpression && parent.expression === n
                && parent.name?.text === 'push') {
                // a []any local appends natively, so its receiver may be typed; every
                // other push shape keeps the helper and with it the box
                    if (goType === GO_STRING_LIST_LOCAL_TYPE) {
                        if (!this.goStringListAppendsAString(parent.parent)) {
                            return true;
                        }
                    } else if ((goType !== '[]any') || !this.goIsNativeAppendShape(n, parent.parent)) {
                        return true;
                    }
                }
                if (parent?.kind === SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if ((parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.PrefixUnaryExpression)) {
                    const op = parent.operator;
                    if ((op === SyntaxKind.PlusPlusToken) || (op === SyntaxKind.MinusMinusToken)) {
                        return true;
                    }
                }
                if (parent?.kind === SyntaxKind.SpreadElement) {
                    return true;
                }
                if (parent?.kind === SyntaxKind.ArrayLiteralExpression
                && parent.parent?.kind === SyntaxKind.BinaryExpression
                && parent.parent.left === parent
                && parent.parent.operatorToken.kind === SyntaxKind.EqualsToken
                && !((goType === 'map[string]any') && this.goGetArgTupleWriteIsDict(declaration, parent.parent.right, parent.elements.indexOf(n)))) {
                    return true;
                }
                if (parent?.kind === SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === SyntaxKind.EqualsToken) {
                        if ((goType === 'string') && this.goSelfConcatWriteIsString(parent.right, varName)) {
                            return false;
                        }
                        // the nil-init string scan already proved every write prints a Go string
                        if (stringWriteProven && (goType === 'string')) {
                            return false;
                        }
                        if ((this.goTypeOfInitializer(parent.right, this.printNode(parent.right, 0)) !== goType)
                            && !((declaration.kind === SyntaxKind.VariableDeclaration) && this.goPointerWriteConversion(parent.right, goType) !== undefined)) {
                            return true;
                        }
                    } else if ((op === SyntaxKind.PlusEqualsToken) && (goType === 'string')
                        && ((this.goOperandStaticType(parent.right, this.printNode(parent.right, 0)) === 'string')
                            || stringWriteProven)) {
                        return false;
                    } else if ((op >= SyntaxKind.FirstCompoundAssignment) && (op <= SyntaxKind.LastCompoundAssignment)) {
                        return true;
                    }
                }
            }
            return false;
        });
        return safe;
    }

    // `x = <+ chain>` that reads x itself: only a whole chain prints native (a bare
    // derefable leaf would be assigned as the *string it is)
    goSelfConcatWriteIsString(node, varName: string): boolean {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if ((node?.kind !== SyntaxKind.BinaryExpression) || (node.operatorToken.kind !== SyntaxKind.PlusToken)) {
            return false;
        }
        const readsSelf = this.hasNodeWhere(node, (n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === varName));
        return readsSelf && this.goSelfConcatIsString(node, varName);
    }

    // a `+` chain written back into a `string` local (`x = x + "&" + y`, `x += y`): every leaf is
    // the local itself (a Go string by the typing being proven) or a proven non-nil Go string,
    // so the chain prints native and the local only ever holds a string
    goSelfConcatIsString(node, varName: string): boolean {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if ((node?.kind === SyntaxKind.Identifier) && (node.text === varName)) {
            return true;
        }
        if ((node?.kind === SyntaxKind.BinaryExpression) && (node.operatorToken.kind === SyntaxKind.PlusToken)) {
            return this.goSelfConcatIsString(node.left, varName) && this.goSelfConcatIsString(node.right, varName);
        }
        if (this.hasNodeWhere(node, (n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === varName))) {
            return false;
        }
        const cache = this.goSelfConcatLeafCache;
        if (cache.has(node)) {
            return cache.get(node);
        }
        // an answer computed while another local is being resolved may be the guard's `any`
        const settled = (this.goLocalTypeResolution.size === 0);
        const result = this.goStringConcatOperandType(node, this.printNode(node, 0)) === 'string';
        if (settled) {
            cache.set(node, result);
        }
        return result;
    }

    // How a write of another shape reaches a pointer-typed local: 'nil' (undefined/null prints nil),
    // 'wrap' (a Go string becomes SafeStringPtr(v), never nil), or undefined (not convertible).
    // Shared by goLocalIsSafeToType (admission) and goPointerWriteText (emission).
    goPointerWriteConversion(right, goType: string): 'nil' | 'wrap' | undefined {
        while (right?.kind === SyntaxKind.ParenthesizedExpression) {
            right = right.expression;
        }
        if (!['*string', '*int64', '*float64'].includes(goType) || right === undefined) {
            return undefined;
        }
        if ((right.kind === SyntaxKind.NullKeyword) || (right.kind === SyntaxKind.UndefinedKeyword)
            || ((right.kind === SyntaxKind.Identifier) && (right.text === 'undefined'))) {
            return 'nil';
        }
        if ((goType === '*string') && (this.goTypeOfInitializer(right, this.printNode(right, 0)) === 'string')) {
            return 'wrap';
        }
        return undefined;
    }

    // `x = "limit"` on a *string local prints `x = SafeStringPtr("limit")`; undefined otherwise
    goPointerWriteText(node, identation): string | undefined {
        const { left, right } = node;
        if (left?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(left)?.valueDeclaration?.resolve();
        if (decl?.kind !== SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        const goType = this.goDeclaredTypeOfIdentifier(left);
        if ((goType === 'string') && this.goLiteralDefaultStringWrite(left, right)) {
            return `${this.printNode(left, 0)} = *${this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trim()}`;
        }
        if ((goType === undefined) || (this.goPointerWriteConversion(right, goType) !== 'wrap')) {
            return undefined;
        }
        const value = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trim();
        return this.goStringPointerStore(node, value, identation) ?? `${this.printNode(left, 0)} = SafeStringPtr(${value})`;
    }

    // `x = <this.m(..)>` on a *string local where the call already returns a Go string: not boxed, the
    // result is kept in a typed local and the pointer takes its address (statement-level assignments
    // only; `value` is the printed call). undefined: the caller prints its SafeStringPtr box.
    goStringPointerStore(node, value: string, identation): string | undefined {
        const local = (node.parent?.kind === SyntaxKind.ExpressionStatement) ? this.goStringCallLocalName(node.right) : undefined;
        if (local === undefined) {
            return undefined;
        }
        return `${local} := ${value.trim()}\n${this.getIden(identation)}${this.printNode(node.left, 0)} = &${local}`;
    }

    // the Go func a node prints into: arrow / function expressions inside a method print as closures
    // of that method's func, so the outermost enclosing function owns the name space
    goOutermostFunction(node): any {
        let outer: any = this.goEnclosingFunction(node);
        while ((outer !== undefined) && (outer.kind !== SyntaxKind.SourceFile)) {
            const next: any = this.goEnclosingFunction(outer);
            if ((next === undefined) || (next.kind === SyntaxKind.SourceFile)) {
                break;
            }
            outer = next;
        }
        return outer;
    }

    // `this.<name>(..)` whose checker type is exactly TS `string` (not `string | undefined`) and whose
    // printed Go call returns a Go `string` (goTypeOfInitializer): the value needs no SafeStringPtr box
    goStringReturningThisCall(call): boolean {
        const callee = call?.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (callee?.kind !== SyntaxKind.PropertyAccessExpression)
            || (callee.expression?.kind !== SyntaxKind.ThisKeyword) || (callee.name?.text === undefined)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const type: any = checker?.getTypeAtLocation(call);
        if ((type === undefined) || ((type.flags & TypeFlags.String) === 0)) {
            return false;
        }
        return this.goTypeOfInitializer(call, this.printNode(call, 0)) === 'string';
    }

    goStringCallLocals = new WeakMap<object, Map<string, { clash: boolean, names: Map<any, string> }>>();

    // the typed local that keeps a string-returning `this.<name>(..)` call (`jsonText`, `jsonText2`, ...):
    // `<name>Text`, numbered in the order the Go func's statements print (= source order). The name is
    // stable per call node, so a re-print of the same statement gets the same local. undefined keeps the
    // SafeStringPtr box: not such a call, or a source identifier already spelled like the family.
    goStringCallLocalName(call): string | undefined {
        if (!this.goStringReturningThisCall(call)) {
            return undefined;
        }
        const scope: any = this.goOutermostFunction(call);
        if (scope === undefined) {
            return undefined;
        }
        const base = call.expression.name.text + 'Text';
        let families = this.goStringCallLocals.get(scope);
        if (families === undefined) {
            families = new Map();
            this.goStringCallLocals.set(scope, families);
        }
        let family = families.get(base);
        if (family === undefined) {
            const spelled = new RegExp('^' + base + '\\d*$');
            family = {
                clash: this.hasNodeWhere(scope, (n: any) => (n.kind === SyntaxKind.Identifier) && spelled.test(n.text)),
                names: new Map(),
            };
            families.set(base, family);
        }
        if (family.clash) {
            return undefined;
        }
        let name = family.names.get(call);
        if (name === undefined) {
            name = (family.names.size === 0) ? base : base + (family.names.size + 1);
            family.names.set(call, name);
        }
        return name;
    }

    // the container/key argument nodes of a whole `this.SafeDict(container, key)` call, or undefined
    // for another shape. A third argument is droppable only when it is the empty map literal
    // (`safeDict(x, k, {})`), which no whitelisted read could observe.
    goSafeDictLocalArgs(initializer) {
        return this.goSafeAccessorLocalArgs(initializer, 'safeDict', SyntaxKind.ObjectLiteralExpression, 'properties');
    }

    // shared by the dict/list rules: `this.<accessor>(container, key[, <empty literal of fallbackKind>])`
    goSafeAccessorLocalArgs(initializer, accessor: string, fallbackKind: SyntaxKind, fallbackItems: string) {
        if (initializer?.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        const callee: any = initializer.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.name?.text !== accessor) {
            return undefined;
        }
        if (callee.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const args = initializer.arguments;
        if (args.length === 3) {
            const fallback = args[2];
            if (fallback?.kind !== fallbackKind || fallback[fallbackItems].length !== 0) {
                return undefined;
            }
        } else if (args.length !== 2) {
            return undefined;
        }
        return { container: args[0], key: args[1] };
    }

    // `x` compared with null/undefined: the printer writes the Go `x == nil` test, which a nil
    // map/slice and the absent box answer the same, so the comparison only reads the container
    goIsNilComparisonOperand(node, parent): boolean {
        const op = parent?.operatorToken?.kind;
        if ((op !== SyntaxKind.EqualsEqualsToken) && (op !== SyntaxKind.ExclamationEqualsToken)
            && (op !== SyntaxKind.EqualsEqualsEqualsToken) && (op !== SyntaxKind.ExclamationEqualsEqualsToken)) {
            return false;
        }
        const other: any = (parent.left === node) ? parent.right : ((parent.right === node) ? parent.left : undefined);
        return (other !== undefined) && ((other.kind === SyntaxKind.NullKeyword) || (other.kind === SyntaxKind.UndefinedKeyword)
            || ((other.kind === SyntaxKind.Identifier) && (other.text === 'undefined')));
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
        case SyntaxKind.ElementAccessExpression: {
            if (parent.expression !== node) {
                return false; // x as an index key
            }
            const grandparent: any = parent.parent;
            if (grandparent?.kind === SyntaxKind.BinaryExpression && grandparent.left === parent) {
                return false; // `x[k] = v` / `x[k] += v` writes into the map
            }
            if ((grandparent?.kind === SyntaxKind.PostfixUnaryExpression) || (grandparent?.kind === SyntaxKind.PrefixUnaryExpression)) {
                return false; // `x[k]++` / `&x[k]`
            }
            if (grandparent?.kind === SyntaxKind.DeleteExpression) {
                return false;
            }
            return true;
        }
        case SyntaxKind.BinaryExpression: {
            // `key in x` prints `InOp(x, key)`: the helper reads the map and answers false for
            // an absent (nil) map, exactly like the nil interface it used to hold
            return (parent.operatorToken?.kind === SyntaxKind.InKeyword) && (parent.right === node);
        }
        case SyntaxKind.CallExpression: {
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

    // memoised, re-entrancy-guarded typing of a `var x T = …` declaration statement; a for-init
    // or any other shape prints `:=`, where the annotation would not appear
    goCachedLocalUnbox(cache: Map<any, string | undefined>, declaration, compute: () => string | undefined): string | undefined {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (declaration.parent?.parent?.kind !== SyntaxKind.FirstStatement) {
            return undefined;
        }
        if (cache.has(declaration)) {
            return cache.get(declaration);
        }
        cache.set(declaration, undefined); // in-progress guard
        let result: string | undefined;
        try {
            result = compute();
        } finally {
            cache.set(declaration, result);
        }
        return result;
    }

    goSafeDictLocalUnbox(declaration): string | undefined {
        return this.goCachedLocalUnbox(this.goSafeDictLocalUnboxCache, declaration, () => this.goSafeDictLocalUnboxUncached(declaration));
    }

    // every read of `declaration`'s name inside its function must keep the boxed value's meaning for
    // the local to take a named Go type: a rebinding mixes two values, and a use `readsTheValue`
    // rejects re-boxes the local. `skipUse` drops nodes that are not references at all.
    goDeclaredLocalTypeIfSafe(declaration, goType: string, readsTheValue: (n: any) => boolean, skipUse?: (n: any) => boolean): string | undefined {
        const sourceName = declaration.name.text as string;
        const scope: any = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return undefined;
        }
        const unsafe = this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind === SyntaxKind.VariableDeclaration || n.kind === SyntaxKind.Parameter)
                && (n !== declaration) && (n.name?.kind === SyntaxKind.Identifier) && (n.name.text === sourceName)) {
                return true; // a shadowing binding would mix two values under one name
            }
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== sourceName) || (n === declaration.name)) {
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
        return this.goSafeDictLocalUnboxStandard(declaration) ?? (this.goL3DictLocalBacksHoist(declaration) ? GO_SAFE_DICT_LOCAL_TYPE : undefined);
    }

    goSafeDictLocalUnboxStandard(declaration): string | undefined {
        if (this.goSafeDictLocalArgs(declaration.initializer) === undefined) {
            return undefined;
        }
        // a local typed only because of its nil test keeps the box when it also backs an `in`:
        // that read prints a pasted comma-ok closure for a typed map, i.e. two blob sites
        const scope: any = this.goEnclosingFunction(declaration);
        const sourceName = declaration.name?.text;
        const backsInOp = (scope !== undefined) && (sourceName !== undefined) && this.hasNodeWhere(scope, (n: any) =>
            (n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken?.kind === SyntaxKind.InKeyword)
            && (n.right?.kind === SyntaxKind.Identifier) && (n.right.text === sourceName));
        return this.goDeclaredLocalTypeIfSafe(declaration, GO_SAFE_DICT_LOCAL_TYPE,
            (n) => this.goSafeDictUseReadsTheMap(n) || (!backsInOp && this.goIsNilComparisonOperand(n, n.parent)));
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
        if (this.goSafeDictLocalUnboxStandard(declaration) === undefined) {
            // FM-A9F L3: the literal default stays, the local is a map that is written into later
            return `this.SafeDictMap(${container}, ${key}, map[string]any{})`;
        }
        return `SafeMapTyped(${container}, ${key})`;
    }

    // `name` (TS spelling) is a base method whose generated Go result is `map[string]any`
    goBaseMapCalleeName(name: string): boolean {
        return GO_MARKET_MAP_BASE_CALLS.indexOf(name) >= 0;
    }

    // the source file sits under ts/src/prediction (its base class is exchange_prediction.go)
    goNodeIsInPredictionTree(node): boolean {
        const fileName = String(node?.getSourceFile?.()?.fileName ?? '');
        return /(^|[\\/])ts[\\/]src[\\/](prediction[\\/]|base[\\/]PredictionExchange\.ts$)/.test(fileName);
    }

    // `this.markets` / `this.currencies` (and the `_by_id` twins): the hand-written book getters of
    // go/v4/exchange_markets_book.go print `this.Markets()` and answer a `map[string]any` (nil before
    // the first load). Same box argument as the base callees above.
    goBookAccessorRead(initializer): boolean {
        if ((initializer?.kind !== SyntaxKind.PropertyAccessExpression) || (initializer.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const name = String(initializer.name?.text ?? '');
        if (this.GO_NATIVE_MAP_ACCESSORS.indexOf(name.charAt(0).toUpperCase() + name.slice(1)) < 0) {
            return false;
        }
        // the field is the base Exchange's own (ts/src/base/Exchange.ts), not a same-named member
        try {
            const symbol = this.getChecker().getSymbolAtLocation(initializer.name);
            return (symbol?.declarations ?? []).some((d) => /(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads\.\d+)?\.ts$/.test(String(d.resolve?.()?.getSourceFile?.()?.fileName ?? '')));
        } catch (e) {
            return false;
        }
    }

    // `node` is a local the base-map-result rule typed (see goBaseMapResultLocal)
    goIsBaseMapResultLocal(node): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const declaration = this.goDeclarationOfIdentifier(node);
        // a local the dict-producer rule already typed keeps the writes that rule printed
        return (declaration !== undefined) && this.goBaseMapResultLocal(declaration.initializer)
            && (this.goSafeDictLocalUnbox(declaration) === undefined)
            && (this.goMarketLocalUnbox(declaration) === GO_MARKET_LOCAL_TYPE);
    }

    // the callee of a market local is a base map method / book accessor whose Go result is the map
    // itself (so the use arms of goMarketUseHandsTheMapOn apply); the prediction tree keeps its box
    goBaseMapResultLocal(initializer): boolean {
        if (this.goNodeIsInPredictionTree(initializer)) {
            return false;
        }
        if (this.goBookAccessorRead(initializer)) {
            return true;
        }
        const name = initializer?.expression?.name?.text;
        return (initializer?.kind === SyntaxKind.CallExpression) && (typeof name === 'string')
            && ((GO_MARKET_MAP_BASE_CALLS.indexOf(name) >= 0) || (GO_MARKET_PRODUCER_METHODS.indexOf(name) >= 0));
    }

    // ===== RF-go-6-A =====
    // Two type-keyed rules for Go map locals (moved out of ccxt build/hx11-m43-safedict-local.ts and
    // build/hx10w10-GP26.ts, which rewrote the printed text):
    //  (1) a local whose TS type is Dict, initialised from `this.safeDict(c, k[, <never-nil default>])` /
    //      `safeDict2`, is a Go `map[string]any` read with the typed twin `SafeDictMap` / `SafeDict2Map`
    //      (same member, absent or non-map answers a nil map). A never-nil default ({} or another such
    //      call) admits every use that compiled against the `any` box; a call with no default may answer
    //      nil, so it types the local only when its uses are nil tests, a Safe* receiver, or sit inside an
    //      `x !== undefined` block.
    //  (2) an element read `m[k]` on a receiver whose Go type is `map[string]any` (a declared local or a
    //      GetArgMap-bound Dict parameter), with a Go string key, is the native index when no write into
    //      the map can store a pointer (the one thing GetValue's deref would change).
    rf6aSafeDictMapLocalCache = new Map<any, string | undefined>();

    // `this.safeDict (c, k[, d])` / `this.safeDict2 (c, k1, k2[, d])`: the call node, its family and default
    rf6aSafeDictCall(initializer): { call: any, family: 'SafeDict' | 'SafeDict2', keys: number, fallback: any } | undefined {
        let node: any = initializer;
        while ((node?.kind === SyntaxKind.ParenthesizedExpression) || (node?.kind === SyntaxKind.AsExpression) || (node?.kind === SyntaxKind.NonNullExpression)) {
            node = node.expression;
        }
        if ((node?.kind !== SyntaxKind.CallExpression) || (node.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (node.expression.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = node.expression.name?.text;
        if ((name !== 'safeDict') && (name !== 'safeDict2')) {
            return undefined;
        }
        const keys = (name === 'safeDict2') ? 2 : 1;
        if ((node.arguments.length !== keys + 1) && (node.arguments.length !== keys + 2)) {
            return undefined;
        }
        return { call: node, family: (keys === 2) ? 'SafeDict2' : 'SafeDict', keys, fallback: node.arguments[keys + 1] };
    }

    rf6aContainsThis(node): boolean {
        return this.hasNodeWhere(node, (n: any) => n.kind === SyntaxKind.ThisKeyword) || (node.kind === SyntaxKind.ThisKeyword);
    }

    // a ws/cache object: a class instance, or an order book / cache / client / future type
    rf6aIsStructTyped(node): boolean {
        let type: any;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return true;
        }
        const parts: any[] = (type?.isUnionType?.()) ? type.getTypes() : [ type ];
        return parts.some((t: any) => (t?.getSymbol?.() !== undefined)
            && (((t.getSymbol().flags & SymbolFlags.Class) !== 0) || /OrderBook|ArrayCache|Client|Future/.test(this.getChecker().typeToString(t))));
    }

    // the container of a typed safeDict read holds decoded data: this.options / balance (/ fees with a default)
    // are Dict fields, any other `this` member is not; a ws container must not be a cache or client object
    rf6aPlainContainer(container, ws: boolean, noDefault: boolean): boolean {
        if (this.rf6aContainsThis(container)) {
            const fields = noDefault ? [ 'options', 'balance' ] : [ 'options', 'balance', 'fees' ];
            if ((container.kind !== SyntaxKind.PropertyAccessExpression) || (container.expression?.kind !== SyntaxKind.ThisKeyword)
                || !fields.includes(container.name?.text)) {
                return false;
            }
        }
        if (!ws || (this.rf6aContainsThis(container) && (container.kind === SyntaxKind.PropertyAccessExpression))) {
            return true; // a REST receiver, or an admitted Dict field of `this`
        }
        if ((container.kind === SyntaxKind.PropertyAccessExpression) && (container.name?.text === 'hashmap') && (container.expression?.kind === SyntaxKind.Identifier)) {
            return true; // the ArrayCache hashmap is a map of maps
        }
        return !this.rf6aIsStructTyped(container) && !this.hasNodeWhere(container, (n: any) => this.rf6aIsStructTyped(n));
    }

    // the call answers the decoded map or a never-nil literal: `{}` or another such call
    rf6aNeverNilDict(call, ws: boolean): boolean {
        const found = this.rf6aSafeDictCall(call);
        if ((found === undefined) || (found.fallback === undefined)) {
            return false;
        }
        const fallback = this.goUnwrapParenthesizedNode(found.fallback);
        const literal = ((fallback.kind === SyntaxKind.ObjectLiteralExpression) && (fallback.properties.length === 0)) || this.rf6aNeverNilDict(fallback, ws);
        return literal && this.rf6aPlainContainer(found.call.arguments[0], ws, false);
    }

    rf6aSourceKind(node): 'rest' | 'ws' | 'skip' {
        const fileName = String(node?.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (!fileName.includes('ts/src/') || /ts\/src\/(?:prediction|base|test)\//.test(fileName) || fileName.includes('/examples/')) {
            return 'skip';
        }
        return fileName.includes('ts/src/pro/') ? 'ws' : 'rest';
    }

    rf6aTopFunction(node): any {
        let top: any;
        for (let cur = node?.parent; cur !== undefined; cur = cur.parent) {
            if ((cur.kind === SyntaxKind.MethodDeclaration) || (cur.kind === SyntaxKind.FunctionDeclaration) || (cur.kind === SyntaxKind.Constructor)) {
                top = cur;
            }
        }
        return top;
    }

    // `x !== undefined` / `x != null` conjunct of an if condition: the then-branch sees a non-nil x
    rf6aGuardsNonNil(condition, name: string): boolean {
        const inner = this.goUnwrapParenthesizedNode(condition);
        if (inner?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = inner.operatorToken?.kind;
        if (op === SyntaxKind.AmpersandAmpersandToken) {
            return this.rf6aGuardsNonNil(inner.left, name) || this.rf6aGuardsNonNil(inner.right, name);
        }
        if ((op !== SyntaxKind.ExclamationEqualsToken) && (op !== SyntaxKind.ExclamationEqualsEqualsToken)) {
            return false;
        }
        const isNil = (n: any) => (n?.kind === SyntaxKind.NullKeyword) || ((n?.kind === SyntaxKind.Identifier) && (n.text === 'undefined'));
        const isName = (n: any) => (n?.kind === SyntaxKind.Identifier) && (n.text === name);
        return (isName(inner.left) && isNil(inner.right)) || (isNil(inner.left) && isName(inner.right));
    }

    rf6aInsideNonNilBlock(use, name: string): boolean {
        for (let child: any = use, cur: any = use.parent; cur !== undefined; child = cur, cur = cur.parent) {
            if ((cur.kind === SyntaxKind.IfStatement) && (cur.thenStatement === child) && this.rf6aGuardsNonNil(cur.expression, name)) {
                return true;
            }
            if ((cur.kind === SyntaxKind.ConditionalExpression) && (cur.whenTrue === child) && this.rf6aGuardsNonNil(cur.condition, name)) {
                return true;
            }
        }
        return false;
    }

    // one reference of a typed dict local: false when it needs the `any` box. The use is read through its
    // wrappers (`(x as Dict)`, `x!`), which print as x itself.
    rf6aUseKeepsMap(ref, rebinds: Set<any>, noDefault: boolean, ws: boolean, name: string): boolean {
        let node: any = ref;
        while ((node.parent !== undefined) && (((node.parent.kind === SyntaxKind.ParenthesizedExpression) || (node.parent.kind === SyntaxKind.AsExpression)
            || (node.parent.kind === SyntaxKind.NonNullExpression)) && (node.parent.expression === node))) {
            node = node.parent;
        }
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        const isNil = (n: any) => (n?.kind === SyntaxKind.NullKeyword) || ((n?.kind === SyntaxKind.Identifier) && (n.text === 'undefined'));
        let nilTest = false;
        switch (parent.kind) {
        case SyntaxKind.BinaryExpression: {
            const op = parent.operatorToken.kind;
            if ((op >= SyntaxKind.FirstAssignment) && (op <= SyntaxKind.LastAssignment) && (parent.left === node)) {
                return rebinds.has(parent); // a rebinding, unless it is again a never-nil safeDict read
            }
            if ((op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken)
                || (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken)) {
                const other = (parent.left === node) ? parent.right : parent.left;
                if (!isNil(other)) {
                    return false;
                }
                nilTest = true;
            } else if (op === SyntaxKind.InKeyword) {
                return !noDefault || this.rf6aInsideNonNilBlock(node, name);
            }
            break;
        }
        case SyntaxKind.ArrayLiteralExpression:
            if ((parent.parent?.kind === SyntaxKind.BinaryExpression) && (parent.parent.left === parent)) {
                return false; // destructuring write
            }
            break;
        case SyntaxKind.PropertyAccessExpression:
            if ((parent.expression === node) && (parent.name?.text !== 'length')) {
                return false; // a member of the box (`.length` prints GetArrayLength(x): 0 for a map and for the nil box)
            }
            break;
        case SyntaxKind.PrefixUnaryExpression:
        case SyntaxKind.PostfixUnaryExpression:
            if ((parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken)) {
                return false;
            }
            break;
        case SyntaxKind.TypeOfExpression:
        case SyntaxKind.SpreadElement:
            return false;
        case SyntaxKind.CaseClause:
        case SyntaxKind.SwitchStatement:
            return false;
        case SyntaxKind.CallExpression: {
            if (parent.expression === node) {
                return false;
            }
            const callee: any = parent.expression;
            const arrayIsArray = (callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.expression?.kind === SyntaxKind.Identifier)
                && (callee.expression.text === 'Array') && (callee.name?.text === 'isArray');
            if (arrayIsArray) {
                return false; // the box folds Array.isArray; a map would print IsArray
            }
            break;
        }
        }
        if (!noDefault) {
            return true;
        }
        // a call with no default may answer a nil map: only nil tests and plain reads may see it
        if (this.rf6aInsideNonNilBlock(node, name)) {
            return true;
        }
        if (nilTest) {
            return true; // `x == nil` answers the same for a nil map and for the nil box
        }
        if ((parent.kind === SyntaxKind.CallExpression) && (parent.arguments[0] === node)) {
            const callee: any = parent.expression;
            return (callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.expression?.kind === SyntaxKind.ThisKeyword)
                && /^safe[A-Z]/.test(callee.name?.text ?? '');
        }
        return ws && (parent.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === node) && !this.isGoElementAccessAssignmentTarget(parent);
    }

    rf6aSafeDictMapLocal(declaration): string | undefined {
        return this.goCachedLocalUnbox(this.rf6aSafeDictMapLocalCache, declaration, () => this.rf6aSafeDictMapLocalUncached(declaration));
    }

    rf6aSafeDictMapLocalUncached(declaration): string | undefined {
        const kind = this.rf6aSourceKind(declaration);
        const found = this.rf6aSafeDictCall(declaration.initializer);
        if ((kind === 'skip') || (found === undefined) || (this.goSafeDictLocalUnbox(declaration) !== undefined)) {
            return undefined;
        }
        const ws = kind === 'ws';
        const noDefault = found.fallback === undefined;
        if (!(noDefault || this.rf6aNeverNilDict(found.call, ws)) || !this.rf6aPlainContainer(found.call.arguments[0], ws, noDefault)) {
            return undefined;
        }
        const scope: any = this.rf6aTopFunction(declaration);
        const name = declaration.name.text as string;
        if ((scope === undefined) || this.goTypeNameIsShadowed(scope, GO_SAFE_DICT_LOCAL_TYPE)) {
            return undefined;
        }
        // one declaration of the name in the whole Go function
        const bindings = this.goDescendantsOf(scope).filter((n: any) => ((n.kind === SyntaxKind.VariableDeclaration) || (n.kind === SyntaxKind.Parameter)
            || (n.kind === SyntaxKind.BindingElement)) && (n.name?.kind === SyntaxKind.Identifier) && (n.name.text === name));
        if (bindings.length !== 1) {
            return undefined;
        }
        const rebinds = new Set<any>();
        const refs = this.goDescendantsOf(scope).filter((n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name)
            && !((n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n))
            && !((n.parent?.kind === SyntaxKind.PropertyAssignment) && (n.parent.name === n)));
        for (const ref of refs) {
            const write: any = ref.parent;
            if ((write?.kind === SyntaxKind.BinaryExpression) && (write.left === ref) && (write.operatorToken.kind === SyntaxKind.EqualsToken)) {
                const again = noDefault ? undefined : this.rf6aSafeDictCall(write.right);
                if ((again !== undefined) && (again.family === found.family) && this.rf6aNeverNilDict(again.call, ws)
                    && !this.hasNodeWhere(again.call, (n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === name)
                        && !((n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n)))) {
                    rebinds.add(write); // every write is again a never-nil safeDict: one map type
                }
            }
        }
        for (const ref of refs) {
            if (!this.rf6aUseKeepsMap(ref, rebinds, noDefault, ws, name)) {
                return undefined;
            }
        }
        this.rf6aRebindWrites.set(declaration, rebinds);
        return GO_SAFE_DICT_LOCAL_TYPE;
    }

    rf6aRebindWrites = new Map<any, Set<any>>();

    // the typed twin of the declaration's initializer: `this.SafeDictMap(c, k[, d])`
    rf6aSafeDictMapValue(declaration, identation: number): string | undefined {
        if (this.rf6aSafeDictMapLocal(declaration) !== GO_SAFE_DICT_LOCAL_TYPE) {
            return undefined;
        }
        const found: any = this.rf6aSafeDictCall(declaration.initializer);
        return `this.${found.family}Map(${this.printArgsForCallExpression(found.call, identation)})`;
    }

    // `x = this.safeDict (c, k, <never-nil default>)` on a typed dict local keeps the same map type
    rf6aSafeDictRebind(node, identation: number): string | undefined {
        if ((node.operatorToken?.kind !== SyntaxKind.EqualsToken) || (node.left?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        const declaration = this.goDeclarationOfIdentifier(node.left);
        if ((declaration === undefined) || (this.rf6aSafeDictMapLocal(declaration) !== GO_SAFE_DICT_LOCAL_TYPE)
            || !(this.rf6aRebindWrites.get(declaration)?.has(node))) {
            return undefined;
        }
        const found: any = this.rf6aSafeDictCall(node.right);
        return `${this.printNode(node.left, 0)} = this.${found.family}Map(${this.printArgsForCallExpression(found.call, identation)})`;
    }

    // the Go string a key prints as: a literal, a `string` local, or a GetArgString-bound parameter
    rf6aKeyIsString(key, printed: string): boolean {
        if (this.goKeyIsString(key, printed)) {
            return true;
        }
        if (key?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        let decl: any;
        try {
            decl = this.checkerOrUndefined()?.getSymbolAtLocation(key)?.valueDeclaration?.resolve();
        } catch (e) {
            return false;
        }
        return (decl?.kind === SyntaxKind.Parameter) && (this.goGetArgParameterType(decl) === 'string');
    }

    // a value the runtime helpers store as-is: never a Go pointer
    rf6aIsPointerFreeValue(value): boolean {
        const inner = this.goUnwrapParenthesizedNode(value);
        switch (inner?.kind) {
        case SyntaxKind.NullKeyword:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.ArrayLiteralExpression:
            return true;
        case SyntaxKind.PrefixUnaryExpression:
            return (inner.operator === SyntaxKind.MinusToken) && (inner.operand?.kind === SyntaxKind.NumericLiteral);
        case SyntaxKind.Identifier:
            return inner.text === 'undefined';
        }
        return false;
    }

    // no write into the map named `name` in its function can store a pointer: the map is never rebound,
    // never deleted from, and every element write stores a pointer-free value
    rf6aMapWritesArePointerFree(scope, name: string): boolean {
        return !this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name) || ((n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n))) {
                return false;
            }
            let node: any = n;
            const parent: any = n.parent;
            if (parent === undefined) {
                return false;
            }
            if ((parent.kind === SyntaxKind.BinaryExpression) && (parent.left === node) && (parent.operatorToken.kind >= SyntaxKind.FirstAssignment)
                && (parent.operatorToken.kind <= SyntaxKind.LastAssignment)) {
                return true; // rebinding
            }
            if ((parent.kind === SyntaxKind.ArrayLiteralExpression) && (parent.parent?.kind === SyntaxKind.BinaryExpression) && (parent.parent.left === parent)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.ForOfStatement) || (parent.kind === SyntaxKind.ForInStatement)) {
                return parent.initializer === node;
            }
            if ((parent.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === node)) {
                const above: any = parent.parent;
                if (above?.kind === SyntaxKind.DeleteExpression) {
                    return true;
                }
                if ((above?.kind === SyntaxKind.BinaryExpression) && (above.left === parent) && (above.operatorToken.kind >= SyntaxKind.FirstAssignment)
                    && (above.operatorToken.kind <= SyntaxKind.LastAssignment)) {
                    return (above.operatorToken.kind !== SyntaxKind.EqualsToken) || !this.rf6aIsPointerFreeValue(above.right);
                }
            }
            return false;
        });
    }

    // `m[k]` where GetValue(m, k) would deref a stored pointer: false unless m's Go type is map[string]any, the key
    // is a Go string, the element is not natively compared, and no write into m stores a pointer
    rf6aNativeMapRead(access, baseExpr, keyNode, keyStr: string): boolean {
        if ((baseExpr?.kind !== SyntaxKind.Identifier) || this.isGoElementAccessAssignmentTarget(access)
            || !this.rf6aKeyIsString(keyNode, keyStr)) {
            return false;
        }
        let decl: any;
        try {
            decl = this.checkerOrUndefined()?.getSymbolAtLocation(baseExpr)?.valueDeclaration?.resolve();
        } catch (e) {
            return false;
        }
        const isMap = (decl?.kind === SyntaxKind.Parameter) ? (this.goGetArgParameterType(decl) === 'map[string]any')
            : ((decl?.kind === SyntaxKind.VariableDeclaration) && (this.goResolvedLocalGoType(baseExpr) === 'map[string]any'));
        const scope: any = (decl === undefined) ? undefined : this.rf6aTopFunction(decl);
        if (!isMap || (scope === undefined) || !this.rf6aMapWritesArePointerFree(scope, baseExpr.text)) {
            return false;
        }
        // a compared element keeps the helper: a `*bool`/`*string` element would make the native `==` false
        let operand: any = access;
        while (operand.parent?.kind === SyntaxKind.ParenthesizedExpression) {
            operand = operand.parent;
        }
        const cmp: any = operand.parent;
        return !((cmp?.kind === SyntaxKind.BinaryExpression) && ((cmp.left === operand) || (cmp.right === operand))
            && [ SyntaxKind.EqualsEqualsToken, SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken ].includes(cmp.operatorToken.kind));
    }
    // ===== end RF-go-6-A =====

    // the TypeScript return type proves the boxed value is the market dictionary: the checker reports
    // the `MarketInterface` interface for `this.Market(...)` / `this.SafeMarket(...)` (the `Market`
    // alias is the same interface unioned with undefined). Read from the checker, never a printed name.
    goMarketCallReturnsDict(initializer): boolean {
        if (initializer?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = initializer.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression) {
            return false;
        }
        const name = callee.name?.text;
        if (name === undefined) {
            return false;
        }
        const receiver: any = callee.expression;
        const onThis = receiver?.kind === SyntaxKind.ThisKeyword;
        const onDerived = (receiver?.kind === SyntaxKind.PropertyAccessExpression)
            && (receiver.expression?.kind === SyntaxKind.ThisKeyword)
            && (receiver.name?.text === 'DerivedExchange');
        if (!onThis && !onDerived) {
            return false;
        }
        // a base accessor whose generated Go result is the map itself needs no checker type: the
        // prediction tree keeps its box (its base is another file)
        if (this.goBaseMapCalleeName(name) && !this.goNodeIsInPredictionTree(initializer)) {
            return true;
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
            const names = [ t?.getSymbol()?.name, t?.getAliasSymbol()?.name ];
            return (names.indexOf('MarketInterface') >= 0) || (names.indexOf('CurrencyInterface') >= 0);
        };
        if (isMarketInterface(type)) {
            return true;
        }
        if ((typeof type.isUnionType === 'function') && type.isUnionType()) {
            return type.getTypes().some((t) => isMarketInterface(t));
        }
        return false;
    }

    // The `Market`-returning producers print `any` because their TS type names no Go type, so callers
    // box the row and read it back through GetValue. A producer whose every path answers a dictionary
    // prints `map[string]any`, and its caller's local is declared with it (reads go native).

    // the producers retyped by this rule, by TS source name
    goMarketProducerMethods = GO_MARKET_PRODUCER_METHODS;

    // the base accessors/builders whose generated Go result is already that dictionary (the base
    // signatures live in go/v4, so a body shape cannot prove them here)
    goMarketMapCalls = GO_MARKET_MAP_CALLS;

    goMethodReturnsMapCache = new Map<any, boolean>();

    // every `return` the body itself reaches: the returns of a nested function literal are that
    // literal's, and say nothing about this signature
    goFunctionLevelReturns(body): any[] {
        const returns: any[] = [];
        const walk = (n: any) => {
            if (n === undefined) {
                return;
            }
            if (n.kind === SyntaxKind.ReturnStatement) {
                returns.push(n);
                return;
            }
            if ((n.kind === SyntaxKind.FunctionExpression) || (n.kind === SyntaxKind.ArrowFunction)
                || (n.kind === SyntaxKind.FunctionDeclaration) || (n.kind === SyntaxKind.MethodDeclaration)) {
                return;
            }
            n.forEachChild(walk);
        };
        body?.forEachChild(walk);
        return returns;
    }

    // true when every path of the method body answers a dictionary. Memoised; a recursive method
    // (or a cycle of them) proves nothing and keeps its `any` signature.
    goMethodBodyReturnsMap(method): boolean {
        const body: any = method?.body;
        if ((body === undefined) || (method?.kind !== SyntaxKind.MethodDeclaration)) {
            return false;
        }
        if (this.goMethodReturnsMapCache.has(method)) {
            return this.goMethodReturnsMapCache.get(method);
        }
        this.goMethodReturnsMapCache.set(method, false);
        let ok = true;
        const returns = this.goFunctionLevelReturns(body);
        for (let i = 0; (i < returns.length) && ok; i++) {
            ok = this.goMarketReturnIsMap(returns[i].expression);
        }
        this.goMethodReturnsMapCache.set(method, ok);
        return ok;
    }

    // an absent value, a map literal, or a call/local whose generated Go value is a map
    goMarketReturnIsMap(expr): boolean {
        if (expr === undefined) {
            return false;
        }
        switch (expr.kind) {
        case SyntaxKind.NullKeyword:
        case SyntaxKind.ObjectLiteralExpression:
            return true;
        // `return { … } as Market`: the cast is not a value, the literal behind it is
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.AsExpression:
        case SyntaxKind.TypeAssertionExpression:
        case SyntaxKind.NonNullExpression:
            return this.goMarketReturnIsMap(expr.expression);
        case SyntaxKind.Identifier:
            return (expr.text === 'undefined') ? true : this.goMarketLocalInitializerIsMap(expr);
        case SyntaxKind.CallExpression:
            return this.goMarketCallIsMap(expr);
        }
        return false;
    }

    goMarketCallIsMap(call): boolean {
        const callee: any = call?.expression;
        const name = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text
            : ((callee?.kind === SyntaxKind.Identifier) ? callee.text : undefined);
        if (name === undefined) {
            return false;
        }
        // the table names the printed Go callee; the TS source spells the same method lower camel
        const printed = name.charAt(0).toUpperCase() + name.slice(1);
        if ((GO_MARKET_MAP_CALLS.indexOf(name) >= 0) || (GO_MARKET_MAP_CALLS.indexOf(printed) >= 0)) {
            return true;
        }
        const declaration = this.goMethodDeclarationOfCallee(callee);
        return (declaration !== undefined) && this.goMethodBodyReturnsMap(declaration);
    }

    // the call's *printed Go* result is a map (a base accessor, or a producer this printer retypes);
    // a method proved only by its body shape has no signature here and keeps its converter
    goMarketCalleePrintsMap(call): boolean {
        const callee: any = call?.expression;
        const name = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text
            : ((callee?.kind === SyntaxKind.Identifier) ? callee.text : undefined);
        if (name === undefined) {
            return false;
        }
        const printed = name.charAt(0).toUpperCase() + name.slice(1);
        if ((GO_MARKET_MAP_CALLS.indexOf(name) >= 0) || (GO_MARKET_MAP_CALLS.indexOf(printed) >= 0)) {
            return true;
        }
        if ((GO_MARKET_MAP_BASE_CALLS.indexOf(name) >= 0) || (GO_MARKET_MAP_BASE_CALLS.indexOf(printed) >= 0)) {
            return true;
        }
        if (GO_MARKET_PRODUCER_METHODS.indexOf(name) < 0) {
            return false;
        }
        const declaration = this.goMethodDeclarationOfCallee(callee);
        return (declaration !== undefined) && this.goMethodBodyReturnsMap(declaration);
    }

    goMethodDeclarationOfCallee(callee): any {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            // an in-memory program has no checker: resolve the callee by name in its own class
            return this.goMethodDeclarationByName(callee);
        }
        try {
            const node: any = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name : callee;
            const symbol = checker.getSymbolAtLocation(node);
            // an overloaded method declares its signatures before the body: only the one with a
            // body proves a return shape
            const candidates: any[] = [];
            const value: any = symbol?.valueDeclaration?.resolve?.() ?? symbol?.valueDeclaration;
            if (value !== undefined) {
                candidates.push(value);
            }
            for (const d of (symbol?.declarations ?? [])) {
                candidates.push(d.resolve?.(d) ?? d);
            }
            const methods = candidates.filter((d) => d?.kind === SyntaxKind.MethodDeclaration);
            const withBody = methods.find((d) => d.body !== undefined);
            return withBody ?? methods[0] ?? this.goMethodDeclarationByName(callee);
        } catch (e) {
            // a checker from another compiler instance cannot read this node: fall back to the name
            return this.goMethodDeclarationByName(callee);
        }
    }

    // the method declaration a callee's NAME binds to in its own class (no checker needed)
    goMethodDeclarationByName(callee): any {
        const name = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text
            : ((callee?.kind === SyntaxKind.Identifier) ? callee.text : undefined);
        if (name === undefined) {
            return undefined;
        }
        let scope: any = callee?.parent;
        while ((scope !== undefined) && (scope.kind !== SyntaxKind.ClassDeclaration)
            && (scope.kind !== SyntaxKind.SourceFile) && (scope.kind !== SyntaxKind.ObjectLiteralExpression)) {
            scope = scope.parent;
        }
        const members: any[] = scope?.members ?? [];
        const hits = members.filter((m) => (m?.kind === SyntaxKind.MethodDeclaration) && (m.name.text === name));
        return hits.find((m) => m.body !== undefined) ?? hits[0];
    }

    // `return market` where the local was declared from a map-producing call: the local rule types
    // that declaration with the same map, so the function hands on what it holds
    goMarketLocalInitializerIsMap(identifier, knownDeclaration?): boolean {
        // the caller that already holds the declaration passes it: a string program has no checker
        const declaration = knownDeclaration ?? this.goDeclarationOfIdentifier(identifier);
        const initializer: any = declaration?.initializer;
        if (initializer === undefined) {
            return false;
        }
        if (initializer.kind === SyntaxKind.ObjectLiteralExpression) {
            return true;
        }
        return (initializer.kind === SyntaxKind.CallExpression) && this.goMarketCalleePrintsMap(initializer);
    }

    // ---- FM-GO4-1: Nonce () is int64 end to end (was ccxt build/hx11w8-nonce-int64.ts) ----------------
    // `BaseExchange.nonce` and every override print `int64` (go/v4/exchange_interface.go pins one
    // signature for the whole tree). A method is the nonce family when the checker walks its class chain
    // up to the class `BaseExchange` declaring `nonce` (no parameters, not async); it prints int64 when
    // EVERY return of its own body is provably an int64 operand: a clock call, an int literal, an int64
    // local, a defaulted/narrowed `*int64` difference (goNativeArithmetic), or `this.sum(a, b)` of two such
    // operands (printed `a + b`, see goNonceSumText). Anything else throws: the interface cannot take
    // `any` for one venue.
    goNonceReturnCache = new WeakMap<object, string | undefined>();

    goNonceReturnType(node): string | undefined {
        if ((node?.kind !== SyntaxKind.MethodDeclaration) || (node.name?.text !== 'nonce') || (node.parameters?.length !== 0)) {
            return undefined;
        }
        if (this.goNonceReturnCache.has(node)) {
            return this.goNonceReturnCache.get(node);
        }
        let result: string | undefined = undefined;
        if (this.goIsBaseNonceMethod(node)) {
            const returns = this.goDescendantsOf(node.body).filter((n: any) => (n.kind === SyntaxKind.ReturnStatement) && (this.goEnclosingFunction(n) === node));
            const bad = (returns.length === 0) ? node : returns.find((r: any) => (r.expression === undefined) || !this.goNonceReturnIsInt64(r.expression));
            if (bad !== undefined) {
                throw new Error(`goNonceReturnType: ${this.goEnclosingClassName(node)}.nonce returns unproven \`${bad.getText?.() ?? ''}\`; the interface pins int64`);
            }
            result = 'int64';
        }
        this.goNonceReturnCache.set(node, result);
        return result;
    }

    // the class chain of `fn` (a method named nonce, no params, not async) ends in `BaseExchange.nonce`
    goIsBaseNonceMethod(fn): boolean {
        const checker: any = this.checkerOrUndefined();
        if ((checker === undefined) || (fn.body === undefined) || this.isAsyncFunction(fn)) {
            return false;
        }
        let current: any = fn;
        for (let depth = 0; depth < 12; depth++) {
            const cls: any = this.goEnclosingClass(current);
            if (cls === undefined) {
                return false;
            }
            const clause: any = (cls.heritageClauses ?? []).find((c: any) => c.token === SyntaxKind.ExtendsKeyword);
            if (clause === undefined) {
                return (cls.name?.text === 'BaseExchange');
            }
            const baseType = checker.getTypeAtLocation(clause.types?.[0]);
            const symbol = baseType?.getProperty?.('nonce');
            const declaration: any = symbol?.valueDeclaration?.resolve?.() ?? symbol?.declarations?.map((d: any) => d.resolve())?.[0];
            if ((declaration === undefined) || (declaration.kind !== SyntaxKind.MethodDeclaration)) {
                return false;
            }
            current = declaration;
        }
        return false;
    }

    // one `return` expression of a nonce method prints as a Go int64 (or an untyped int constant)
    goNonceReturnIsInt64(expression): boolean {
        let inner: any = expression;
        while (inner?.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        if (this.goInt64SumOperands(inner) !== undefined) {
            return true;
        }
        const type = this.goOperandStaticType(inner, this.printNode(inner, 0));
        return (type === 'int64') || (type === 'const-int');
    }

    // `this.sum(a, b)` (BaseExchange.sum) whose operands both print as int64: [a, b], else undefined
    goInt64SumOperands(call): any[] | undefined {
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (call.expression.expression?.kind !== SyntaxKind.ThisKeyword) || (call.expression.name?.text !== 'sum')
            || (call.arguments?.length !== 2)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        const symbol = checker?.getSymbolAtLocation(call.expression.name);
        const declaration: any = symbol?.valueDeclaration?.resolve?.() ?? symbol?.declarations?.map((d: any) => d.resolve())?.[0];
        // BaseExchange declares `sum = sum;` (the generic helper) as a property, not a method
        if (((declaration?.kind !== SyntaxKind.MethodDeclaration) && (declaration?.kind !== SyntaxKind.PropertyDeclaration))
            || (this.goEnclosingClassName(declaration) !== 'BaseExchange')) {
            return undefined;
        }
        const operands = [ call.arguments[0], call.arguments[1] ];
        const proven = operands.every((operand: any) => {
            if (operand.kind === SyntaxKind.SpreadElement) {
                return false;
            }
            const type = this.goOperandStaticType(operand, this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(operand, 0)));
            return (type === 'int64') || (type === 'const-int');
        });
        return proven ? operands : undefined;
    }

    // `return this.sum(a, b)` of a nonce method: the int64 sum Add returns for two int64 operands
    goNonceSumText(node): string | undefined {
        if (node?.parent?.kind !== SyntaxKind.ReturnStatement) {
            return undefined;
        }
        const operands = this.goInt64SumOperands(node);
        if (operands === undefined) {
            return undefined;
        }
        const fn: any = this.goEnclosingFunction(node);
        if ((fn?.kind !== SyntaxKind.MethodDeclaration) || (fn.name?.text !== 'nonce') || (this.goNonceReturnType(fn) !== 'int64')) {
            return undefined;
        }
        const text = operands.map((operand: any, index: number) => {
            const printed = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(operand, 0)).trim();
            const operator = this.goNativeBinaryOperator(operand);
            const precedence = (operator === undefined) ? 6 : this.goOperatorPrecedence(operator);
            return ((precedence < 4) || ((index === 1) && (precedence === 4)))
                && (operand.kind !== SyntaxKind.ParenthesizedExpression) ? '(' + printed + ')' : printed;
        });
        return text[0] + ' + ' + text[1];
    }

    // the printed return type of a market producer, or undefined to keep the checker's answer
    goMarketProducerReturnType(node): string | undefined {
        if (node?.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        if (GO_MARKET_PRODUCER_METHODS.indexOf(node.name?.text) < 0) {
            return undefined;
        }
        if (this.isAsyncFunction(node)) {
            return undefined;
        }
        return this.goMethodBodyReturnsMap(node) ? GO_MARKET_LOCAL_TYPE : undefined;
    }

    // `var market any = this.Market(symbol)` -> `var market map[string]any = MapTyped(...)`.
    // The box holds the dictionary the checker proved and every later use reads it (SafeDict's scan),
    // so this is a pure refinement. A value position, nil test or map write keeps the box.
    goMarketLocalUnboxCache = new Map<any, string | undefined>();

    goMarketLocalUnbox(declaration): string | undefined {
        return this.goCachedLocalUnbox(this.goMarketLocalUnboxCache, declaration, () => this.goMarketLocalUnboxUncached(declaration));
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
        const valueDeclaration = symbol.valueDeclaration?.resolve() ?? symbol.declarations?.map((d) => d.resolve())?.[0];
        return (valueDeclaration === undefined) || (valueDeclaration === declaration);
    }

    // one later use of the market local: the dictionary read shapes SafeDict proves (element read,
    // `in`, read-helper argument), plus — only when the accessor throws rather than answers absent —
    // a plain argument position, since Go re-boxes the map into the callee's `any` as the box did.
    goMarketUseReadsTheValue(node, throwingAccessor: boolean, keepsMap = false, handsOn = false): boolean {
        if (this.goSafeDictUseReadsTheMap(node)) {
            return true;
        }
        const parent: any = node.parent;
        if ((parent?.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === node) && this.goIsComparedOperand(parent)) {
            return true;
        }
        if (keepsMap && this.goMarketUseKeepsMap(node, handsOn)) {
            return true;
        }
        if (!throwingAccessor) {
            return false;
        }
        return (parent?.kind === SyntaxKind.CallExpression)
            && (parent.expression !== node) && (parent.arguments.indexOf(node) >= 0);
    }

    // a use that answers what the boxed local answered even for a nil box: IsEqual derefScalars a
    // typed nil map to an untyped nil, PanicOnError only inspects an error, a GetArg-bound slot folds
    // a nil map to its default, and a map-returning body hands the map on.
    goMarketUseKeepsMap(node, handsOn = false): boolean {
        const parent: any = node.parent;
        if (handsOn && this.goMarketUseHandsTheMapOn(node, parent)) {
            return true;
        }
        if (parent?.kind === SyntaxKind.ReturnStatement) {
            if (parent.expression !== node) {
                return false;
            }
            return this.goMethodBodyReturnsMap(this.goEnclosingFunction(node));
        }
        // `market === undefined`: nil == nil for a nil map, and IsEqual derefScalars both operands
        if (parent?.kind === SyntaxKind.BinaryExpression) {
            const operand = (parent.left === node) ? parent.right : ((parent.right === node) ? parent.left : undefined);
            if (operand === undefined) {
                return false;
            }
            const kind = parent.operatorToken?.kind;
            const equality = (kind === SyntaxKind.EqualsEqualsToken) || (kind === SyntaxKind.ExclamationEqualsToken)
                || (kind === SyntaxKind.EqualsEqualsEqualsToken) || (kind === SyntaxKind.ExclamationEqualsEqualsToken);
            return equality && this.goIsNilLiteral(operand);
        }
        if (parent?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const argIndex: number = parent.arguments.indexOf(node);
        if ((argIndex < 0) || (parent.expression === node)) {
            return false;
        }
        const callee: any = parent.expression;
        const name = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text
            : ((callee?.kind === SyntaxKind.Identifier) ? callee.text : undefined);
        if ((name === 'PanicOnError') || (name === 'panicOnError')) {
            return true;
        }
        if (name === 'IsEqual' || name === 'isEqual') {
            const other: any = (argIndex === 0) ? parent.arguments[1] : parent.arguments[0];
            return this.goIsNilLiteral(other);
        }
        return this.goGetArgPositionIsDefaulted(callee, argIndex);
    }

    // The callee's Go result is the map itself, so the `any` the local used to hold was already that
    // map (a nil one stays a typed nil in the box): every use that only hands the value on - a branch
    // value, a container element, a copy, an element write (a nil map panics in the helper and in the
    // native store alike) or a call argument - sees the same dynamic value through the narrower static
    // type. Rebinding, member access, spread and `Array.isArray` keep the box. Prediction keeps its box.
    goMarketUseHandsTheMapOn(node, parent): boolean {
        switch (parent?.kind) {
        case SyntaxKind.ConditionalExpression:
            return (parent.whenTrue === node) || (parent.whenFalse === node);
        case SyntaxKind.PropertyAssignment:
            return parent.initializer === node;
        case SyntaxKind.ShorthandPropertyAssignment:
            return parent.name === node;
        case SyntaxKind.ArrayLiteralExpression:
            return true;
        case SyntaxKind.ParenthesizedExpression:
            return this.goMarketUseHandsTheMapOn(parent, parent.parent);
        case SyntaxKind.BinaryExpression:
            return (parent.operatorToken?.kind === SyntaxKind.EqualsToken) && (parent.right === node);
        case SyntaxKind.ElementAccessExpression: {
            const above: any = parent.parent;
            return (parent.expression === node) && (above?.kind === SyntaxKind.BinaryExpression)
                && (above.left === parent) && (above.operatorToken?.kind === SyntaxKind.EqualsToken);
        }
        case SyntaxKind.CallExpression: {
            if ((parent.expression === node) || (parent.arguments.indexOf(node) < 0)) {
                return false;
            }
            const callee: any = parent.expression;
            return !((callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.name?.text === 'isArray'));
        }
        }
        return false;
    }

    goMarketLocalUnboxUncached(declaration): string | undefined {
        const bookRead = this.goBookAccessorRead(declaration.initializer) && !this.goNodeIsInPredictionTree(declaration.initializer);
        if (!bookRead && !this.goMarketCallReturnsDict(declaration.initializer)) {
            return undefined;
        }
        // the throwing accessors (`this.market`, `this.currency`) panic instead of answering absent, so
        // the boxed result is always a dictionary and passing the local re-boxes the same map into the
        // callee's `any`. The Safe* accessors may answer their own optional argument: read shapes only.
        const accessorName = declaration.initializer.expression?.name?.text;
        const throwingAccessor = !bookRead && ((accessorName === 'market') || (accessorName === 'currency'));
        // the extra use shapes below only apply when the callee's own Go result is the map: a local
        // that still needs the converter keeps the shipped read-only scan (no new converter calls)
        const keepsMap = bookRead || this.goMarketCalleePrintsMap(declaration.initializer);
        const handsOn = keepsMap && this.goBaseMapResultLocal(declaration.initializer);
        // `this.market(…)` carries the same name as the local: a property/method name is not
        // a reference, and neither is a different binding of the same name
        return this.goDeclaredLocalTypeIfSafe(declaration, GO_MARKET_LOCAL_TYPE,
            (n) => this.goMarketUseReadsTheValue(n, throwingAccessor, keepsMap, handsOn),
            (n) => ((n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n))
                || !this.goIdentifierRefersToDeclaration(n, declaration));
    }

    // the initializer a typed market local is declared with: the same call, its boxed result
    // converted to the map the checker proved (nil when the call answered a non-map)
    goMarketUnboxValue(declaration, parsedValue: string): string | undefined {
        if (this.goMarketLocalUnbox(declaration) !== GO_MARKET_LOCAL_TYPE) {
            return undefined;
        }
        // a callee whose generated Go result already IS the dictionary (the base accessors, and the
        // producers this rule retypes) is assigned as it stands: no converter call at the site
        if (this.goMarketLocalInitializerIsMap(declaration.name, declaration) || this.goBookAccessorRead(declaration.initializer)) {
            return parsedValue.trimStart();
        }
        return `MapTyped(${parsedValue.trimStart()})`;
    }

    // the variable declaration an identifier binds to, through the checker (undefined for every
    // other shape) — the market rule resolves its own locals this way, never by printed name
    goDeclarationOfIdentifier(node): any {
        try {
            const symbol = this.getChecker().getSymbolAtLocation(node);
            const declaration = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.map((d) => d.resolve())?.[0];
            if (declaration?.kind === SyntaxKind.VariableDeclaration) {
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
        if (base?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const declaration = this.goDeclarationOfIdentifier(base);
        if ((declaration === undefined) || (this.goMarketLocalUnbox(declaration) !== GO_MARKET_LOCAL_TYPE)) {
            return false;
        }
        return this.goIsComparedOperand(node);
    }

    // `node`, through any parentheses, is an operand of a GO_MARKET_READ_COMPARISON_OPERATORS comparison
    goIsComparedOperand(node): boolean {
        let operand: any = node;
        let above: any = node.parent;
        while (above?.kind === SyntaxKind.ParenthesizedExpression) {
            operand = above;
            above = above.parent;
        }
        return (above?.kind === SyntaxKind.BinaryExpression)
            && ((above.left === operand) || (above.right === operand))
            && (GO_MARKET_READ_COMPARISON_OPERATORS.indexOf(above.operatorToken?.kind) >= 0);
    }

    // the container/key argument nodes of a whole `this.SafeList(container, key)` call, or
    // undefined when the initializer is another shape. A third argument is only droppable when
    // it is the empty array literal the TS call sites pass (`safeList(x, k, [])`): the typed
    goSafeListLocalArgs(initializer) {
        return this.goSafeAccessorLocalArgs(initializer, 'safeList', SyntaxKind.ArrayLiteralExpression, 'elements');
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
        case SyntaxKind.PropertyAccessExpression: {
            if (parent.expression !== node) {
                return false; // the local as the receiver of a further member
            }
            if (parent.name?.text === 'length') {
                return true; // prints GetArrayLength(x)
            }
            // `x.push(v)` prints `x = append(x, v)` only in the statement shape; every other
            // push keeps AppendToArray(&x, …), whose *any parameter a []any local cannot take
            return (parent.name?.text === 'push') && this.goIsNativeAppendShape(node, parent.parent);
        }
        case SyntaxKind.ElementAccessExpression: {
            if (parent.expression !== node) {
                return false; // the local as the index
            }
            return !this.isGoElementAccessAssignmentTarget(parent); // `x[k] = v` writes through the box
        }
        case SyntaxKind.CallExpression: {
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
        return this.goCachedLocalUnbox(this.goSafeListLocalUnboxCache, declaration, () => this.goSafeListLocalUnboxUncached(declaration));
    }

    goSafeListLocalUnboxUncached(declaration): string | undefined {
        if (this.goSafeListLocalArgs(declaration.initializer) === undefined) {
            return undefined;
        }
        const readsTheList = this.goDeclaredLocalTypeIfSafe(declaration, GO_SAFE_LIST_LOCAL_TYPE, (n) => this.goSafeListUseReadsTheList(n));
        if (readsTheList !== undefined) {
            return readsTheList;
        }
        // the other uses the box already answered as a list: a nil test, a copy into another
        // `any`/[]any local, or a helper whose parameters are all `any`. None of them prints an
        // element read, so the typed local adds no bounds-guarded read and no other call.
        // A read with a default answers nil where the box held that default, so only the length
        // read and the all-`any` helpers may stay: a nil test or a copy would answer differently.
        const defaulted = (declaration.initializer?.arguments?.length !== 2);
        return this.goDeclaredLocalTypeIfSafe(declaration, GO_SAFE_LIST_LOCAL_TYPE, (n) => this.goListLocalSinkReadsAsList(n, !defaulted));
    }

    // hand-written helpers whose Go parameters are all `any`: a []any argument is the very value
    // the box held, and the call prints the same helper it printed before
    GO_LIST_SINK_CALLEES = [
        'SafeValue', 'SafeValue2', 'SafeString', 'SafeString2', 'SafeStringN', 'SafeStringLower',
        'SafeStringUpper', 'SafeInteger', 'SafeInteger2', 'SafeIntegerN', 'SafeNumber', 'SafeBool',
        'SafeFloat', 'SafeFloat2', 'SafeTimestamp', 'SafeDict', 'SafeDict2', 'SafeList', 'SafeList2',
        'SafeCurrencyCode', 'SafeMapTyped', 'SafeDictTyped', 'SafeListTyped', 'SafeList2Typed',
        'ArrayTyped', 'ListTyped',
    ];

    // one use of a list local that hands it on whole: the length read, the nil test, a copy into
    // another `any`/[]any local, or an all-`any` helper. An element read is deliberately absent:
    // on a typed slice it prints a bounds check the boxed read did not have.
    goListLocalSinkReadsAsList(node, nilTestSafe: boolean): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.PropertyAccessExpression) {
            return (parent.expression === node) && (parent.name?.text === 'length');
        }
        if (parent.kind === SyntaxKind.BinaryExpression) {
            const op = parent.operatorToken?.kind;
            if (op === SyntaxKind.EqualsToken) {
                return nilTestSafe && (parent.right === node) && this.goListLocalCopyTargetIsList(parent.left);
            }
            if ((op === SyntaxKind.EqualsEqualsEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken)
                || (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.ExclamationEqualsToken)) {
                return nilTestSafe && this.goIsNilLiteral((parent.left === node) ? parent.right : parent.left);
            }
            return false;
        }
        if ((parent.kind !== SyntaxKind.CallExpression) || (parent.expression === node)) {
            return false;
        }
        if (parent.arguments.indexOf(node) < 0) {
            return false;
        }
        const callee = this.goPrintedCallee(this.printNode(parent, 0));
        if (callee === undefined) {
            return false;
        }
        return this.GO_LIST_SINK_CALLEES.indexOf(callee.replace(/^ccxt\./, '').replace(/^this\./, '')) >= 0;
    }

    // the local a list value is copied into takes it whole only when it is an `any` local (the box
    // holds the very same []any) or another list local; a typed map/scalar target keeps the box
    goListLocalCopyTargetIsList(left): boolean {
        if (left?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const declared = this.goDeclaredTypeOfIdentifier(left);
        return (declared === undefined) || (declared === GO_SAFE_LIST_LOCAL_TYPE);
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

    // ---- container locals from the checker type (Dict / List / string[]) ---------------
    // The TS type of a declaration names the Go container the printer already builds for
    // that value: a Dict-shaped object is the map the Go side keeps rows in, a List is the
    // []any box, and a `string[]` is a []string (never the []any the literal used to open).
    // A local is typed only when its initializer and every write already produce that
    // container (or convert through MapTyped/ListTyped) and every read reads it as one.

    // the Go container a TS type names, or undefined when the type is anything else
    goContainerTypeOfTsType(type): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if ((type === undefined) || (checker === undefined)) {
            return undefined;
        }
        let parts = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes().slice() : [type];
        parts = parts.filter((p) => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        if (parts.length !== 1) {
            return undefined;
        }
        const inner: any = parts[0];
        if ((inner.flags & TypeFlags.Object) === 0) {
            return undefined;
        }
        if ((typeof checker.isArrayType === 'function') && checker.isArrayType(inner)) {
            const element = checker.getIndexTypeOfType(inner, IndexKind.Number);
            if (element === undefined) {
                return undefined;
            }
            if (element.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
                // a []any element read is the guarded DerefScalar literal, i.e. the same helper
                // work under another name: leave those locals boxed
                return undefined;
            }
            const elementParts = ((typeof element.isUnionType === 'function') && element.isUnionType()) ? element.getTypes().slice() : [element];
            const real = elementParts.filter((p) => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
            if ((real.length > 0) && real.every((p) => (p.flags & (TypeFlags.String | TypeFlags.StringLiteral)) !== 0)) {
                return GO_STRING_LIST_LOCAL_TYPE;
            }
            return undefined;
        }
        // a pure dictionary: a string index signature and no named member of its own (a
        // Market/Order interface carries named fields, and its rows are not plain maps)
        if (!this.goParameterTypeIsDict(inner)) {
            return undefined;
        }
        let properties = [];
        try {
            properties = inner.getProperties() ?? [];
        } catch (e) {
            properties = [];
        }
        return (properties.length === 0) ? GO_SAFE_DICT_LOCAL_TYPE : undefined;
    }

    // the container Go type the declaration's own TS type names
    goContainerCandidateType(declaration): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if ((checker === undefined) || (declaration?.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        let type;
        try {
            type = checker.getTypeAtLocation(declaration.name);
        } catch (e) {
            return undefined;
        }
        return this.goContainerTypeOfTsType(type);
    }

    // how the initializer reaches the candidate container: already that type, or (map/list)
    // through the typed readers; undefined keeps the box
    goContainerInitializerConversion(initializer, goType: string): 'direct' | undefined {
        if ((initializer === undefined) || (initializer.kind === SyntaxKind.NullKeyword) || (initializer.kind === SyntaxKind.UndefinedKeyword)
            || ((initializer.kind === SyntaxKind.Identifier) && (initializer.text === 'undefined'))) {
            return 'direct'; // `var x T = nil`: a nil map/slice is the absent value the box held
        }
        if (goType === GO_STRING_LIST_LOCAL_TYPE) {
            // the printer opens the literal as []string only when every element is a Go string
            return ((initializer.kind === SyntaxKind.ArrayLiteralExpression) && this.goStringListLiteralIsProven(initializer))
                ? 'direct' : undefined;
        }
        if (initializer.kind === SyntaxKind.ConditionalExpression) {
            return undefined; // the ternary prints its own immediately-called literal
        }
        if (initializer.kind === SyntaxKind.Identifier) {
            return (this.goDeclaredTypeOfIdentifier(initializer) === goType) ? 'direct' : undefined;
        }
        // any other expression (a call, an await, a member read) keeps the box: the host's
        // post-print pass types the producers it knows, and a conversion here would add a
        // second call where that pass already names the type
        return undefined;
    }

    // every element of the literal prints as a Go string, so `[]string{…}` holds them all
    goStringListLiteralIsProven(node): boolean {
        return (node?.elements ?? []).every((element) => {
            if ((element.kind === SyntaxKind.SpreadElement) || (element.kind === SyntaxKind.OmittedExpression)) {
                return false;
            }
            const printed = this.printNode(element, 0);
            return this.goOperandStaticType(element, printed) === 'string';
        });
    }

    // one later use of a container local: a read through the container, or a write of a value
    // that reaches it (directly or through the typed reader)
    // the node prints as a plain Go `string` (a nilable `*string` accessor does not)
    goPrintsAsPlainString(node): boolean {
        return this.goOperandStaticType(node, this.printNode(node, 0)) === 'string';
    }

    goContainerUseReadsAs(node, goType: string): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.BinaryExpression && parent.left === node) {
            return (parent.operatorToken?.kind === SyntaxKind.EqualsToken)
                && (this.goContainerWriteConversion(parent.right, goType) !== undefined);
        }
        if (goType === GO_SAFE_DICT_LOCAL_TYPE) {
            if ((parent.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken?.kind === SyntaxKind.InKeyword)) {
                // `key in x` on a typed map prints the native membership test; a `*string` key
                // would instead emit the printer's nil-guarded literal, so that key keeps the box
                return (parent.right === node) && this.goPrintsAsPlainString(parent.left);
            }
            // `x[k] = v` on a typed map prints the native element assignment (the helper's
            // own nil-map panic is the native one); every other write shape keeps the box
            const access: any = node.parent;
            if ((access?.kind === SyntaxKind.ElementAccessExpression) && (access.expression === node)) {
                const above: any = access.parent;
                if ((above?.kind === SyntaxKind.BinaryExpression) && (above.left === access)
                    && (above.operatorToken?.kind === SyntaxKind.EqualsToken)) {
                    return true;
                }
            }
            return this.goSafeDictUseReadsTheMap(node);
        }
        if (goType === GO_SAFE_LIST_LOCAL_TYPE) {
            return this.goSafeListUseReadsTheList(node);
        }
        return this.goStringListUseReadsAs(node);
    }

    // a `[]string` local reads as a list of strings: its length, an element, a membership
    // test, and a push of a value that already prints as a Go string (append keeps the type)
    goStringListUseReadsAs(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if ((parent.kind === SyntaxKind.PropertyAccessExpression) && (parent.name === node)) {
            return true; // a member name, not a reference
        }
        if (parent.kind === SyntaxKind.PropertyAccessExpression) {
            if (parent.expression !== node) {
                return false;
            }
            if (parent.name?.text === 'length') {
                return true;
            }
            return (parent.name?.text === 'push') && this.goStringListAppendsAString(parent.parent);
        }
        if (parent.kind === SyntaxKind.ElementAccessExpression) {
            if (parent.expression !== node) {
                return false; // the local as the index
            }
            return !this.isGoElementAccessAssignmentTarget(parent);
        }
        if (parent.kind === SyntaxKind.BinaryExpression) {
            return (parent.operatorToken?.kind === SyntaxKind.InKeyword) && (parent.right === node);
        }
        return false;
    }

    // a write only keeps a container local typed when the value already IS that container:
    // a conversion through MapTyped/ListTyped would be another helper call, not a native op
    goContainerWriteConversion(right, goType: string): 'direct' | undefined {
        if ((right === undefined) || (right.kind === SyntaxKind.AwaitExpression)) {
            return undefined; // the await arm prints the receive and its PanicOnError pair
        }
        if ((right.kind === SyntaxKind.NullKeyword) || (right.kind === SyntaxKind.UndefinedKeyword)
            || ((right.kind === SyntaxKind.Identifier) && (right.text === 'undefined'))) {
            return 'direct'; // `= nil` is the absent value a nil map/slice holds
        }
        const printed = this.printNode(right, 0);
        if (printed.startsWith('<-this.callInternal(')) {
            return undefined;
        }
        return (this.goTypeOfInitializer(right, printed) === goType) ? 'direct' : undefined;
    }

    goContainerLocalCache = new Map<any, string | undefined>();

    goContainerLocalType(declaration): string | undefined {
        return this.goCachedLocalUnbox(this.goContainerLocalCache, declaration, () => this.goContainerLocalTypeUncached(declaration));
    }

    goContainerLocalTypeUncached(declaration): string | undefined {
        // the accessor families already name their own result more precisely (SafeMapTyped /
        // SafeListTyped read the member in one call); leave those declarations to them
        if ((this.goSafeDictLocalUnbox(declaration) !== undefined)
            || (this.goSafeListLocalUnbox(declaration) !== undefined)
            || (this.goMarketLocalUnbox(declaration) !== undefined)) {
            return undefined;
        }
        const candidate = this.goContainerCandidateType(declaration);
        if (candidate === undefined) {
            return undefined;
        }
        // the scan below prints the local's own expressions; a nested declared-type query must
        // not memoise the in-flight answer
        this.goDeclaredTypeInProgress.add(declaration);
        try {
            if (this.goContainerInitializerConversion(declaration.initializer, candidate) === undefined) {
                return undefined;
            }
            return this.goDeclaredLocalTypeIfSafe(declaration, candidate, (n) => this.goContainerUseReadsAs(n, candidate));
        } finally {
            this.goDeclaredTypeInProgress.delete(declaration);
        }
    }

    // the array literal a `string[]` local is declared with, opened as a []string
    goStringListLiteralNode: any = undefined;

    // GP07: a local declared nil (`let x: Str = undefined`, `let x = undefined`) whose body only
    // stores one nullable scalar prints that scalar's pointer, so `x === undefined` is the native
    // `x == nil` instead of IsEqual. The pointer is the type every write already names; a read
    // the pointer cannot answer (argument, return, concat, index) keeps the local `any`.
    goNilInitPointerTypes = new Set([ '*string', '*int64', '*float64', '*bool' ]);
    goNilInitLocalTypeCache = new Map<any, string | undefined>();
    goNilInitLocalTypeInProgress = new Set<any>();

    // the declaration shapes that print `= nil`: no initializer, undefined, null
    goNilInitInitializer(initializer): boolean {
        if (initializer === undefined) {
            return true;
        }
        const node = this.goUnwrapParenthesizedNode(initializer);
        if (node?.kind === SyntaxKind.NullKeyword) {
            return true;
        }
        return (node?.kind === SyntaxKind.Identifier) && (node.text === 'undefined');
    }

    goNilInitLocalType(declaration): string | undefined {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (!this.goNilInitInitializer(declaration.initializer)) {
            return undefined;
        }
        if (this.goNilInitLocalTypeCache.has(declaration)) {
            return this.goNilInitLocalTypeCache.get(declaration);
        }
        if (this.goNilInitLocalTypeInProgress.has(declaration)) {
            return undefined;
        }
        this.goNilInitLocalTypeInProgress.add(declaration);
        let result;
        try {
            result = this.goNilInitLocalTypeScan(declaration) ?? this.goNilInitStringLocalType(declaration) ?? this.goNilInitListLocalType(declaration);
        } finally {
            this.goNilInitLocalTypeInProgress.delete(declaration);
        }
        this.goNilInitLocalTypeCache.set(declaration, result);
        return result;
    }

    goNilInitLocalTypeScan(declaration): string | undefined {
        const name = declaration.name.text;
        const scope = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return undefined;
        }
        const writes: any[] = [];
        let otherUse = false;
        let elementStored = false;
        const visit = (n) => {
            if (otherUse) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name)) {
                const parent = n.parent;
                if (parent?.kind === SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block re-declaring the name gets its own type
                }
                if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.right === n) && (parent.operatorToken?.kind === SyntaxKind.EqualsToken)
                    && (parent.left?.kind === SyntaxKind.ElementAccessExpression)) {
                    elementStored = true;
                }
                if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken?.kind === SyntaxKind.EqualsToken)) {
                    if (parent.left === n) {
                        writes.push(parent.right);
                        return;
                    }
                    if (this.goAssignmentWritesName(parent.left, name)) {
                        otherUse = true; // `[ x, y ] = …` writes through GetValue
                        return;
                    }
                }
                if (((parent?.kind === SyntaxKind.PrefixUnaryExpression) || (parent?.kind === SyntaxKind.PostfixUnaryExpression))
                    && ((parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken))) {
                    otherUse = true;
                    return;
                }
                if (!this.goNilInitReadIsPointerSafe(n)) {
                    otherUse = true;
                }
                return;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        if (otherUse || (writes.length === 0)) {
            return undefined;
        }
        const types = writes.map((right) => this.goTypeOfInitializer(right, this.printNode(right, 0)));
        // a ParseNumber pointer stored into a map element prints a deref closure where the boxed local was stored bare
        if (elementStored && writes.some((right) => this.printNode(right, 0).trim().startsWith('this.ParseNumber('))) {
            return undefined;
        }
        let candidate: string | undefined;
        for (const goType of types) {
            if ((typeof goType !== 'string') || !this.goNilInitPointerTypes.has(goType)) {
                continue;
            }
            if (candidate === undefined) {
                candidate = goType;
            } else if (candidate !== goType) {
                return undefined; // the body writes two different types
            }
        }
        if (candidate === undefined) {
            return undefined;
        }
        for (let i = 0; i < writes.length; i++) {
            if (types[i] === candidate) {
                continue;
            }
            // an absent value still lands in the pointer, but a literal would need a
            // wrapping call (SafeStringPtr) of its own: that is not a win, so keep the box
            if (this.goPointerWriteConversion(writes[i], candidate) === 'nil') {
                continue;
            }
            return undefined;
        }
        if (this.goTypeNameIsShadowed(scope, candidate) || !this.goLocalIsSafeToType(scope, declaration, name, candidate)) {
            return undefined;
        }
        return candidate;
    }

    // ===== RF-go-6-C =====
    // a nil-initialised local (`let x: List; x = [ a ]`, `let r: Dict | List; r = await this.listEndpoint (...)`)
    // whose every write prints a Go `[]any` is that slice: `var x []any = nil`. The nil slice reads as
    // the absent list at every consumer; a read that compares it with undefined/null observes the
    // box, so it keeps `any`.
    goNilInitListLocalType(declaration): string | undefined {
        const name = declaration?.name?.text;
        const scope = (name === undefined) ? undefined : this.goEnclosingFunction(declaration);
        if ((scope === undefined) || !this.goNilInitInitializer(declaration.initializer)) {
            return undefined;
        }
        const writes: any[] = [];
        let rejected = false;
        const isNilLike = (n: any) => (n?.kind === SyntaxKind.NullKeyword) || (n?.kind === SyntaxKind.UndefinedKeyword)
            || ((n?.kind === SyntaxKind.Identifier) && (n.text === 'undefined'));
        const visit = (n) => {
            if (rejected) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name)) {
                const parent: any = n.parent;
                if ((parent?.kind === SyntaxKind.VariableDeclaration) && (parent.name === n)) {
                    return;
                }
                if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken?.kind === SyntaxKind.EqualsToken) && (parent.left === n)) {
                    writes.push(parent.right);
                    return;
                }
                if ((parent?.kind === SyntaxKind.BinaryExpression) && this.goAssignmentWritesName(parent.left, name)) {
                    rejected = true;
                    return;
                }
                if ((parent?.kind === SyntaxKind.BinaryExpression) && ((isNilLike(parent.left) && (parent.right === n)) || (isNilLike(parent.right) && (parent.left === n)))) {
                    rejected = true; // `x === undefined` observes the box
                    return;
                }
                return;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        if (rejected || (writes.length === 0)) {
            return undefined;
        }
        for (const right of writes) {
            if (this.goTypeOfInitializer(right, this.printNode(right, 0)) !== '[]any') {
                return undefined;
            }
        }
        if (this.goTypeNameIsShadowed(scope, '[]any') || !this.goLocalIsSafeToType(scope, declaration, name, '[]any')) {
            return undefined;
        }
        return '[]any';
    }
    // ===== end RF-go-6-C =====

    // GP16: a nil-initialised local whose every write is a proven Go string is a string
    // accumulator (`let x: Str = undefined` + `x += …`). It prints `var x string`, so the
    // Add chain folds. A read that would see the nil (a nil test, a return, a call whose
    // Go parameter is not `any`) keeps the box, so no nil guard is dropped.
    goNilInitStringLocalType(declaration): string | undefined {
        const name = declaration.name?.text;
        if (name === undefined) {
            return undefined;
        }
        if (this.goNilInitStringScanCache.has(declaration)) {
            return this.goNilInitStringScanCache.get(declaration);
        }
        if (this.goNilInitStringScanInProgress.has(declaration)) {
            return undefined; // the scan prints the same local through goTypeOfInitializer
        }
        this.goNilInitStringScanInProgress.add(declaration);
        let result;
        try {
            result = this.goNilInitStringLocalTypeScan(declaration);
        } finally {
            this.goNilInitStringScanInProgress.delete(declaration);
        }
        this.goNilInitStringScanCache.set(declaration, result);
        return result;
    }
    goNilInitStringScanCache = new WeakMap<object, string | undefined>();
    goNilInitStringScanInProgress = new Set<any>();

    goNilInitStringLocalTypeScan(declaration): string | undefined {
        if (!this.goNilInitInitializer(declaration.initializer)) {
            return undefined;
        }
        const name = declaration.name.text;
        const scope = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return undefined;
        }
        const writes: any[] = [];
        const reads: any[] = [];
        let bail = false;
        const visit = (n) => {
            if (bail) {
                return;
            }
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name) || (n === declaration.name)) {
                n.forEachChild(visit);
                return;
            }
            const parent = n.parent;
            if (parent?.kind === SyntaxKind.VariableDeclaration && parent.name === n) {
                return; // a sibling block re-declaring the name gets its own type
            }
            if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n)) {
                const operator = parent.operatorToken?.kind;
                if ((operator === SyntaxKind.EqualsToken) || (operator === SyntaxKind.PlusEqualsToken)) {
                    writes.push(parent);
                    if (operator === SyntaxKind.EqualsToken) {
                        visit(parent.right);
                    }
                    return;
                }
                if (this.goNilInitReadIsStringSafe(n)) {
                    reads.push(n);
                    return;
                }
                bail = true;
                return;
            }
            if (this.goNilInitReadIsStringSafe(n)) {
                reads.push(n);
                return;
            }
            bail = true;
        };
        scope.forEachChild(visit);
        // one write is a value the nil-declared join passes already carry; only a local the
        // body writes again and again is the accumulator this rule is about
        if (bail || (writes.length < 2)) {
            return undefined;
        }
        const printedWrites: string[] = [];
        for (const write of writes) {
            const right = write.right;
            const printed = this.printNode(right, 0).trim();
            // a write the printer only reaches through a helper holds a box, not a Go string
            if ((this.goNilInitWrittenHelperCall(printed)) || (right === undefined)) {
                return undefined;
            }
            printedWrites.push(printed);
            const writeType = this.goTypeOfInitializer(right, printed);
            // a self-concat write reads the local, which the in-progress guard prints as `any`
            if ((writeType !== 'string') && !this.goSelfConcatIsString(right, name)) {
                return undefined;
            }
        }
        // every write a plain literal is the nil-declared literal join the value-join pass types
        if (printedWrites.every((text) => /^"(?:[^"\\]|\\.)*"$/.test(text))) {
            return undefined;
        }
        for (const read of reads) {
            // a read the box could still serve with nil is fine only when nil and the empty
            // string are the same value: the accumulator's own concat operand
            if (this.goNilInitReadIsConcatOperand(read)) {
                continue;
            }
            if (!this.goNilInitWriteDominates(writes, read)) {
                return undefined;
            }
        }
        if (this.goTypeNameIsShadowed(scope, 'string') || !this.goLocalIsSafeToType(scope, declaration, name, 'string', true)) {
            return undefined;
        }
        return 'string';
    }

    // gp25: `const k = this.apiKey` holds the hand-written BaseExchange field, a plain Go
    // string, so the local is that string and its Add chains fold. A nil test or any other
    // read only the box answers keeps `any` (a Go string cannot be compared to nil).
    goFieldStringLocalType(declaration): string | undefined {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (this.goFieldStringLocalTypeCache.has(declaration)) {
            return this.goFieldStringLocalTypeCache.get(declaration);
        }
        const result = this.goFieldStringLocalTypeScan(declaration);
        this.goFieldStringLocalTypeCache.set(declaration, result);
        return result;
    }
    goFieldStringLocalTypeCache = new WeakMap<object, string | undefined>();

    goFieldStringLocalTypeScan(declaration): string | undefined {
        const initializer = this.goUnwrapParenthesizedNode(declaration.initializer);
        if ((initializer?.kind !== SyntaxKind.PropertyAccessExpression) || (initializer.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        // the field's Go name is what the table holds (`apiKey` prints as `ApiKey`)
        if (GO_STRING_FIELD_NAMES.indexOf(this.goAstFieldGoName(initializer)) < 0) {
            return undefined;
        }
        const name = declaration.name.text;
        const scope = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return undefined;
        }
        let bail = false;
        const visit = (n) => {
            if (bail) {
                return;
            }
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name) || (n === declaration.name)) {
                n.forEachChild(visit);
                return;
            }
            const parent = n.parent;
            if ((parent?.kind === SyntaxKind.VariableDeclaration) && (parent.name === n)) {
                return; // a sibling block re-declaring the name gets its own type
            }
            if (((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n)
                && (parent.operatorToken?.kind === SyntaxKind.EqualsToken))) {
                // a later write must keep the field's string (an `any` producer would not compile)
                const right = this.goUnwrapParenthesizedNode(parent.right);
                if (GO_STRING_FIELD_NAMES.indexOf(this.goAstFieldGoName(right)) >= 0) {
                    return;
                }
                bail = true;
                return;
            }
            if (!this.goFieldStringLocalReadIsSafe(n)) {
                bail = true;
            }
        };
        scope.forEachChild(visit);
        // the scan already refused every write and read a `string` cannot answer, so the
        // box-wide veto (which prints) is not consulted here
        if (bail || this.goTypeNameIsShadowed(scope, 'string')) {
            return undefined;
        }
        return 'string';
    }

    // a read a Go `string` answers like the box did: a concat operand, an `any` slot, a
    // string-literal comparison or a runtime-accessor argument — never a nil test. Read from
    // the AST only: printing here would resolve other locals from inside this scan.
    goFieldStringLocalReadIsSafe(node): boolean {
        let current = node;
        let parent = current?.parent;
        while (parent?.kind === SyntaxKind.ParenthesizedExpression) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case SyntaxKind.BinaryExpression: {
            const operator = parent.operatorToken?.kind;
            if (operator === SyntaxKind.EqualsToken) {
                return (parent.right === current) && (parent.left?.kind === SyntaxKind.ElementAccessExpression);
            }
            if (operator === SyntaxKind.PlusToken) {
                return true;
            }
            if ((operator === SyntaxKind.EqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsToken)
                || (operator === SyntaxKind.EqualsEqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsEqualsToken)) {
                const other = (parent.left === current) ? parent.right : parent.left;
                return other?.kind === SyntaxKind.StringLiteral;
            }
            return false; // `&&`/`||`/ordered comparison: a Go string is not a bool or a number
        }
        case SyntaxKind.PropertyAssignment:
            return parent.initializer === current;
        case SyntaxKind.ShorthandPropertyAssignment:
            return parent.name === current;
        case SyntaxKind.CallExpression: {
            if (!parent.arguments?.some((argument) => argument === current)) {
                return false;
            }
            const callee = this.goAstCalleeName(parent);
            return (callee !== undefined) && GO_NIL_INIT_ANY_ARG_CALLEES.has(callee);
        }
        case SyntaxKind.TemplateSpan:
            return true;
        }
        return false;
    }

    // the printer's own helper emissions that box a value instead of producing a Go string
    goNilInitWrittenHelperCall(printed: string): boolean {
        const text = this.goUnwrapPrintedParens(printed ?? '');
        return /^(?:ccxt\.)?(?:Add|SafeStringPtr|DerefScalar|Ternary)\(/.test(text);
    }

    // the read is one side of a printed `+` chain: at worst the accumulator starts empty
    // instead of nil, which no guard tested
    goNilInitReadIsConcatOperand(node): boolean {
        let current = node;
        let parent = current.parent;
        while (parent?.kind === SyntaxKind.ParenthesizedExpression) {
            current = parent;
            parent = parent.parent;
        }
        return (parent?.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken?.kind === SyntaxKind.PlusToken);
    }

    goNilInitEnclosingStatement(node): any {
        let current = node;
        while (current?.parent !== undefined) {
            const parent = current.parent;
            if ((parent.kind === SyntaxKind.Block) || (parent.kind === SyntaxKind.SourceFile)
                || (this.goEnclosingFunction(current) === parent)) {
                return current;
            }
            current = parent;
        }
        return undefined;
    }

    // some write is a direct statement of a block that also holds the read, earlier in it:
    // the write runs on every path that reaches the read
    goNilInitWriteDominates(writes: any[], read): boolean {
        const statements = writes.map((write) => this.goNilInitEnclosingStatement(write));
        let statement = this.goNilInitEnclosingStatement(read);
        while (statement !== undefined) {
            const block = statement.parent;
            if (block === undefined) {
                return false;
            }
            for (const writeStatement of statements) {
                if ((writeStatement?.parent === block) && (writeStatement.end <= statement.pos)) {
                    return true;
                }
            }
            statement = this.goNilInitEnclosingStatement(block);
        }
        return false;
    }

    // a read a Go `string` answers as the box did, so the retype needs no other change
    goNilInitReadIsStringSafe(node): boolean {
        let current = node;
        let parent = current.parent;
        while (parent?.kind === SyntaxKind.ParenthesizedExpression) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case SyntaxKind.BinaryExpression: {
            const operator = parent.operatorToken?.kind;
            if (operator === SyntaxKind.EqualsToken) {
                // `request['type'] = x` stores a string in an `any` slot
                return (parent.right === current) && (parent.left?.kind === SyntaxKind.ElementAccessExpression);
            }
            if (operator === SyntaxKind.PlusToken) {
                return true;
            }
            if ((operator === SyntaxKind.EqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsToken)
                || (operator === SyntaxKind.EqualsEqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsEqualsToken)) {
                return this.goNilInitComparedToNonNil(parent, current);
            }
            return false;
        }
        // `{ 'min': x }` / `{ x }`: an object literal holds map[string]any values
        case SyntaxKind.PropertyAssignment:
            return parent.initializer === current;
        case SyntaxKind.ShorthandPropertyAssignment:
            return parent.name === current;
        // a runtime accessor takes `any`
        case SyntaxKind.CallExpression:
            if (!parent.arguments?.some((argument) => argument === current)) {
                return false;
            }
            return GO_NIL_INIT_ANY_ARG_CALLEES.has(this.printNode(parent.expression, 0).trim());
        case SyntaxKind.PrefixUnaryExpression:
            return parent.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.DoStatement:
            return parent.expression === current;
        case SyntaxKind.TemplateSpan:
            return true;
        }
        return false;
    }

    // `x == 'a'` prints a native comparison on a string; `x == nil` / `x === undefined` does not
    goNilInitComparedToNonNil(parent, current): boolean {
        const other = (parent.left === current) ? parent.right : parent.left;
        return other?.kind === SyntaxKind.StringLiteral;
    }

    // the only reads a `*T` local answers exactly like the box did: comparisons (the pointer arms
    // deref, or IsEqual does) and truthiness (`!x`, a condition), which EvalTruthy derefs too
    goNilInitReadIsPointerSafe(node): boolean {
        let current = node;
        let parent = current.parent;
        while (parent?.kind === SyntaxKind.ParenthesizedExpression) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case SyntaxKind.BinaryExpression: {
            const operator = parent.operatorToken?.kind;
            // `request['type'] = x` stores the pointer into a map value: an `any` slot
            if (operator === SyntaxKind.EqualsToken) {
                return (parent.right === current) && (parent.left?.kind === SyntaxKind.ElementAccessExpression);
            }
            return (operator === SyntaxKind.EqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsToken)
                || (operator === SyntaxKind.EqualsEqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsEqualsToken)
                || (operator === SyntaxKind.LessThanToken) || (operator === SyntaxKind.GreaterThanToken)
                || (operator === SyntaxKind.LessThanEqualsToken) || (operator === SyntaxKind.GreaterThanEqualsToken)
                || (operator === SyntaxKind.AmpersandAmpersandToken) || (operator === SyntaxKind.BarBarToken);
        }
        case SyntaxKind.PrefixUnaryExpression:
            return parent.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.DoStatement:
            return parent.expression === current;
        case SyntaxKind.ForStatement:
            return parent.condition === current;
        case SyntaxKind.ConditionalExpression:
            return parent.condition === current;
        // `this.safeString(x)`: a runtime accessor takes `any` and derefs it
        case SyntaxKind.CallExpression:
            if (!parent.arguments?.some((argument) => argument === current)) {
                return false;
            }
            return GO_NIL_INIT_ANY_ARG_CALLEES.has(this.printNode(parent.expression, 0).trim());
        // `{ 'min': x }` / `{ x }`: an object literal holds map[string]any values
        case SyntaxKind.PropertyAssignment:
            return parent.initializer === current;
        case SyntaxKind.ShorthandPropertyAssignment:
            return parent.name === current;
        }
        return false;
    }

    getGoLocalType(declaration, parsedValue: string): string {
        const goType = this.goTypeOfInitializer(declaration.initializer, parsedValue);
        if ((goType === undefined) || (goType === GO_SAFE_LIST_LOCAL_TYPE)) {
            // the initializer's own shape named nothing, or named the []any it opens every
            // literal with: the declaration's TS type may still name the container it holds
            // (Dict / string[]), with every use reading it as one
            const containerType = this.goContainerLocalType(declaration);
            if (containerType !== undefined) {
                return containerType;
            }
        }
        if (goType === undefined) {
            return this.goSafeDictLocalUnbox(declaration) ?? this.goSafeListLocalUnbox(declaration) ?? this.goMarketLocalUnbox(declaration)
                ?? this.goOrderBookLocalUnbox(declaration) ?? this.goOrderBookSideLocalType(declaration)  // RF-go-6-D
                ?? this.goFieldStringLocalType(declaration) ?? this.goNilInitLocalType(declaration) ?? 'any';
        }
        // the scan matches AST identifiers, so it needs the source name, not the
        // printed one (`type` is renamed to `typeVar` on the way out)
        const sourceName = declaration.name?.text;
        if (sourceName === undefined) {
            return 'any';
        }
        const scope = this.goEnclosingFunction(declaration);
        if (this.goAnnotatedStringLocal(declaration, goType, scope, sourceName) || this.goLiteralDefaultStringLocal(declaration, goType, scope, sourceName)) {
            return 'string';
        }
        // outside any nested resolution the verdict depends only on (declaration, goType)
        const stable = (this.goLocalTypeResolution.size <= 1) && (this.goDeclaredTypeInProgress.size === 0);
        const memoKey = goType;
        let perDecl = stable ? this.goLocalSafeVerdicts.get(declaration) : undefined;
        if (perDecl !== undefined && perDecl.has(memoKey)) {
            return perDecl.get(memoKey);
        }
        const result = (this.goTypeNameIsShadowed(scope, goType) || !this.goLocalIsSafeToType(scope, declaration, sourceName, goType)) ? 'any' : goType;
        if (stable) {
            if (perDecl === undefined) {
                perDecl = new Map<string, string>();
                this.goLocalSafeVerdicts.set(declaration, perDecl);
            }
            perDecl.set(memoKey, result);
        }
        return result;
    }
    goLocalSafeVerdicts = new WeakMap<object, Map<string, string>>();

    // `const x: string = this.safeString (o, k, dflt)` with a non-nil default: the author's
    // `string` annotation holds the call's deref (the method returns a fresh pointer).
    goAnnotatedStringLocal(declaration, goType: string, scope, name: string): boolean {
        if ((goType !== '*string') || (declaration.type?.kind !== SyntaxKind.StringKeyword)) {
            return false;
        }
        const call: any = declaration.initializer;
        if (!this.goDefaultedSafeStringCallOrTypedDefault(call)) {
            return false;
        }
        return !this.goTypeNameIsShadowed(scope, 'string') && this.goLocalIsSafeToType(scope, declaration, name, 'string')
            && !this.goAnnotatedStringLocalHasNilShapedRead(scope, declaration, name);
    }

    // `const x = this.safeString (o, k, 'lit')`: the call returns a fresh non-nil pointer, so a local
    // that is never rebound and is only read as a string consumer, a literal comparison or a concat
    // operand, and written only with a literal or such a call, is a plain Go `string`.
    goLiteralDefaultStringLocal(declaration, goType: string, scope, name: string): boolean {
        if ((goType !== '*string') || (scope === undefined) || (declaration.parent?.parent?.kind !== SyntaxKind.FirstStatement)) {
            return false;
        }
        if (this.goLiteralDefaultStringLocalCache.has(declaration)) {
            return this.goLiteralDefaultStringLocalCache.get(declaration);
        }
        const verdict = !this.goTypeNameIsShadowed(scope, 'string')
            && this.goLiteralDefaultStringCall(declaration.initializer, undefined)
            && this.goLiteralDefaultStringLocalUsesAreSafe(scope, declaration, name);
        this.goLiteralDefaultStringLocalCache.set(declaration, verdict);
        return verdict;
    }
    goLiteralDefaultStringLocalCache = new WeakMap<object, boolean>();

    // `this.safeString (o, k, 'lit')` (or the Lower/Upper twin): exactly three arguments, the last a
    // string literal (or, for a rewrite of `name`, the local itself)
    goLiteralDefaultStringCall(node, name: string | undefined): boolean {
        let call: any = node;
        while ((call?.kind === SyntaxKind.ParenthesizedExpression) || (call?.kind === SyntaxKind.AsExpression)
            || (call?.kind === SyntaxKind.NonNullExpression)) {
            call = call.expression;
        }
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.arguments?.length !== 3)
            || (call.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (call.expression.expression?.kind !== SyntaxKind.ThisKeyword)
            || ['safeString', 'safeStringLower', 'safeStringUpper'].indexOf(call.expression.name?.text) < 0) {
            return false;
        }
        const last: any = call.arguments[2];
        return (last?.kind === SyntaxKind.StringLiteral) || (last?.kind === SyntaxKind.NoSubstitutionTemplateLiteral)
            || ((name !== undefined) && (last?.kind === SyntaxKind.Identifier) && (last.text === name));
    }

    goLiteralDefaultStringLocalUsesAreSafe(scope, declaration, name: string): boolean {
        let safe = true;
        const visit = (n: any) => {
            if (!safe) {
                return;
            }
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name) || (n === declaration.name)) {
                n.forEachChild(visit);
                return;
            }
            const parent: any = n.parent;
            if (((parent?.kind === SyntaxKind.PropertyAccessExpression) && (parent.name === n))
                || ((parent?.kind === SyntaxKind.PropertyAssignment) && (parent.name === n))) {
                return; // a member name, not the local
            }
            // a second binding of the name makes the scan ambiguous
            if (((parent?.kind === SyntaxKind.VariableDeclaration) || (parent?.kind === SyntaxKind.Parameter)
                || (parent?.kind === SyntaxKind.BindingElement)) && (parent.name === n)) {
                safe = false;
                return;
            }
            if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n) && (GO_WRITE_OPERATOR_KINDS.indexOf(parent.operatorToken?.kind) >= 0)) {
                const right: any = parent.right;
                safe = (parent.operatorToken.kind === SyntaxKind.EqualsToken)
                    && ((right?.kind === SyntaxKind.StringLiteral) || this.goLiteralDefaultStringCall(right, name));
                return;
            }
            safe = this.goLiteralDefaultStringLocalReadIsSafe(n);
        };
        scope.forEachChild(visit);
        return safe;
    }

    // a read the printer answers with the same Go value whether the local is `*string` or `string`
    goLiteralDefaultStringLocalReadIsSafe(node): boolean {
        let current: any = node;
        let parent: any = current.parent;
        while ((parent?.kind === SyntaxKind.ParenthesizedExpression) || (parent?.kind === SyntaxKind.AsExpression)
            || (parent?.kind === SyntaxKind.NonNullExpression)) {
            current = parent;
            parent = parent.parent;
        }
        // the default slot of the local's own `x = this.safeString (o, k, x)` write
        if ((parent?.kind === SyntaxKind.CallExpression) && (parent.arguments?.[2] === current)
            && this.goLiteralDefaultStringCall(parent, node.text)) {
            const write: any = parent.parent;
            return (write?.kind === SyntaxKind.BinaryExpression) && (write.right === parent)
                && (write.operatorToken?.kind === SyntaxKind.EqualsToken) && (write.left?.text === node.text);
        }
        switch (parent?.kind) {
        case SyntaxKind.BinaryExpression: {
            const operator = parent.operatorToken?.kind;
            if (operator === SyntaxKind.PlusToken) {
                return true;
            }
            if (operator === SyntaxKind.InKeyword) {
                return parent.left === current;
            }
            if ((operator === SyntaxKind.EqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsToken)
                || (operator === SyntaxKind.EqualsEqualsEqualsToken) || (operator === SyntaxKind.ExclamationEqualsEqualsToken)) {
                const other: any = (parent.left === current) ? parent.right : parent.left;
                return (other?.kind === SyntaxKind.StringLiteral) || (other?.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
            }
            return false;
        }
        case SyntaxKind.PropertyAccessExpression:
            return (parent.expression === current) && (GO_STRING_METHOD_NAMES.indexOf(parent.name?.text) >= 0);
        case SyntaxKind.ElementAccessExpression:
            return parent.argumentExpression === current;
        case SyntaxKind.CallExpression:
            return this.goLiteralDefaultStringCallArgument(parent, current);
        }
        return false;
    }

    // an argument the callee takes as a Go `string` (its printed parameter), or a runtime accessor that
    // derefs its `any` arguments: the string passes where the pointer did
    goLiteralDefaultStringCallArgument(call, argument): boolean {
        const index = call.arguments?.indexOf(argument) ?? -1;
        if (index < 0) {
            return false;
        }
        const name = this.goAstCalleeName(call);
        if ((name !== undefined) && GO_NIL_INIT_ANY_ARG_CALLEES.has(name) && !(name.startsWith('this.Safe') && (index === call.arguments.length - 1) && (call.arguments.length > 2))) {
            return true;
        }
        // read from the declaration only: printing the callee's parameters from inside this scan would
        // resolve this very local while its type is still open
        try {
            const declaration: any = this.getChecker().getResolvedSignature(call)?.declaration?.resolve();
            const parameter: any = declaration?.parameters?.[index];
            return (parameter?.kind === SyntaxKind.Parameter) && (parameter.type?.kind === SyntaxKind.StringKeyword)
                && (parameter.initializer === undefined) && (parameter.questionToken === undefined) && (parameter.dotDotDotToken === undefined);
        } catch (e) {
            return false;
        }
    }

    // `x = this.safeString (o, k, x)` on a local the rule above typed `string`: the call's deref
    goLiteralDefaultStringWrite(left, right): boolean {
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(left)?.valueDeclaration?.resolve();
        return (decl?.kind === SyntaxKind.VariableDeclaration) && this.goLiteralDefaultStringLocalCache.get(decl) === true
            && this.goLiteralDefaultStringCall(right, left.text);
    }

    // a read a Go string cannot serve natively: a nil comparison (boxes into IsEqual) or a copy
    // into another variable (a pointer-typed target would lose its type)
    goAnnotatedStringLocalHasNilShapedRead(scope, declaration, name: string): boolean {
        const isNilLike = (n: any) => (n?.kind === SyntaxKind.NullKeyword) || (n?.kind === SyntaxKind.UndefinedKeyword)
            || ((n?.kind === SyntaxKind.Identifier) && (n.text === 'undefined'));
        return this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name) || (n === declaration.name)) {
                return false;
            }
            const parent: any = n.parent;
            if (parent?.kind !== SyntaxKind.BinaryExpression) {
                return false;
            }
            const other = (parent.left === n) ? parent.right : parent.left;
            const op = parent.operatorToken.kind;
            if ([ SyntaxKind.EqualsEqualsToken, SyntaxKind.ExclamationEqualsToken, SyntaxKind.EqualsEqualsEqualsToken,
                SyntaxKind.ExclamationEqualsEqualsToken ].indexOf(op) >= 0) {
                return isNilLike(other);
            }
            return (op === SyntaxKind.EqualsToken) && (parent.right === n);
        });
    }

    // goDefaultedSafeStringCall, also accepting a default that is an identifier of Go type `string`
    goDefaultedSafeStringCallOrTypedDefault(call): boolean {
        if (this.goDefaultedSafeStringCall(call)) {
            return true;
        }
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (call.expression.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const arity = GO_DEFAULTED_SAFE_STRING_ARITY[call.expression.name?.text];
        if ((arity === undefined) || ((call.arguments?.length ?? 0) !== arity)) {
            return false;
        }
        return this.goDeclaredTypeOfIdentifier(call.arguments[arity - 1]) === 'string';
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
        // const name = declaration.name.text;

        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            // gofmt drops every redundant statement terminator: Go statements are
            // newline-separated, so the joins below must not emit ';'
            let arrayBindingStatement =  `${this.getIden(identation)}${syntheticName} := ${this.printNode(declaration.initializer, 0)}\n`;

            arrayBindingStatement += this.goTupleSlotBindingLines (arrayBindingPatternElements, syntheticName, identation, declaration);

            return arrayBindingStatement;
        }

        if (declaration?.initializer?.kind=== SyntaxKind.AwaitExpression) {
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

        const mapRange = this.goMapRangeLocalDeclaration(node, declaration, identation);
        if (mapRange !== undefined) {
            return mapRange;
        }

        const isNew = declaration.initializer && (declaration.initializer.kind === SyntaxKind.NewExpression);

        const containerType = this.goContainerLocalType(declaration);
        const stringListLiteral = ((containerType === GO_STRING_LIST_LOCAL_TYPE)
            && (declaration.initializer?.kind === SyntaxKind.ArrayLiteralExpression)) ? declaration.initializer : undefined;
        if (stringListLiteral !== undefined) {
            this.goStringListLiteralNode = stringListLiteral;
        }
        const parsedValue = (declaration.initializer) ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;
        this.goStringListLiteralNode = undefined;

        if (parsedValue === this.UNDEFINED_TOKEN) {
            if ((containerType !== undefined) && (node?.parent?.kind === SyntaxKind.FirstStatement)) {
                return this.getIden(identation) + "var " + this.printNode(declaration.name) + " " + containerType + " = " + parsedValue;
            }
            // a nil-initialised local the body only writes as one nullable scalar holds that pointer
            const nilInitType = this.goNilInitLocalType(declaration);
            if (nilInitType === 'string') {
                // a string has no nil: the accumulator's zero value is the empty string
                return this.getIden(identation) + "var " + this.printNode(declaration.name) + " string";
            }
            if (nilInitType !== undefined) {
                return this.getIden(identation) + "var " + this.printNode(declaration.name) + " " + nilInitType + " = " + parsedValue;
            }
            return this.getIden(identation) + "var " + this.printNode(declaration.name) + " any = " + parsedValue;
        }

        if (node?.parent?.kind === SyntaxKind.FirstStatement) {
            if (isNew) {
                return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue;
            }
            const varName = this.printNode(declaration.name);
            // RF-go-6-A: the Dict local seeded from safeDict is declared here only; every other printer rule still sees the `any` box
            const rf6aMapValue = (containerType === undefined) ? this.rf6aSafeDictMapValue(declaration, identation) : undefined;
            const declaredType = (containerType !== undefined) ? containerType : ((rf6aMapValue !== undefined) ? GO_SAFE_DICT_LOCAL_TYPE : this.getGoLocalType(declaration, parsedValue));
            // a typed dict/list local is declared with the typed reader rather than the `any`
            // accessor, so the declaration compiles against the map/slice type
            const unboxValue = this.goOrderBookUnboxValue(declaration, parsedValue)  // RF-go-6-D
                ?? this.goMarketUnboxValue(declaration, parsedValue)
                ?? ((declaredType === GO_SAFE_DICT_LOCAL_TYPE)
                    ? (this.goSafeDictUnboxValue(declaration, identation) ?? rf6aMapValue)
                    : ((declaredType === GO_SAFE_LIST_LOCAL_TYPE) ? this.goSafeListUnboxValue(declaration, identation) : undefined));
            let declaredValue = (unboxValue !== undefined) ? unboxValue : parsedValue.trimStart();
            // an annotated `string` local takes the defaulted SafeString call's deref
            if ((declaredType === 'string') && (unboxValue === undefined)
                && (this.goTypeOfInitializer(declaration.initializer, parsedValue) === '*string')) {
                declaredValue = '*' + declaredValue;
            }
            const cacheKeys = this.goG09CacheKeysRange(declaration, declaredType, varName, identation);  // RFM-G4 G09
            if (cacheKeys !== undefined) {
                return cacheKeys;
            }
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
    //     let objectName = node.parent?.name?.text;
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
                    const geomean = this.goExp2ish(lnSum / count);
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
                lnSum += this.goLog2ish(size);
                count += 1;
            }
        }
        flushBlock();
        return paddings;
    }

    // go/printer's crude log2/exp2 (math.go log2ish/exp2ish): the geomean must match it bit for
    // bit, a ratio landing on exactly 2.5 decides the section break
    goLog2ish(x: number): number {
        let exponent = x === 0 ? 0 : Math.floor(Math.log2(x)) + 1;
        let fraction = x / Math.pow(2, exponent);
        if (fraction >= 1) { fraction /= 2; exponent += 1; }
        if (fraction < 0.5 && fraction !== 0) { fraction *= 2; exponent -= 1; }
        return exponent + 2 * (fraction - 1);
    }

    goExp2ish(x: number): number {
        const n = Math.floor(x);
        return (1 + x - n) * Math.pow(2, n);
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
            if (isExpressionStatement(statement)) {
                const expression = statement.expression;
                if (isCallExpression(expression)) {
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

    printDynamicCall(node, identation) {
        // const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        const elementAccess = node.expression;
        if (elementAccess?.kind === SyntaxKind.ElementAccessExpression) {
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
        const tsKind = SyntaxKind;
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
        if (type?.declaration?.resolve() === undefined) {
            // the emitted call carries the property name as its first argument; arguments
            // print at the call's level so a multi-line literal keeps its nesting
            const argumentDepth = this.goExprDepth + ((node.arguments?.length > 0) ? 1 : 0);
            let parsedArguments = node.arguments?.map((a) => this.goWithExprDepth(argumentDepth, () => this.printNode(a, identation).trimStart())).join(", ");
            parsedArguments = parsedArguments || "";
            const propName = node.expression?.name.text;
            // const isAsyncDecl = true;
            // const isAsyncDecl = node?.parent?.kind === SyntaxKind.AwaitExpression;
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
        const nonceSum = this.goNonceSumText(node);
        if (nonceSum !== undefined) {
            return nonceSum;
        }
        if (node.expression.kind === SyntaxKind.PropertyAccessExpression) {
            const args = node.arguments;

            if (node.expression.expression.kind === SyntaxKind.ThisKeyword) {
                const methodName = this.printNode(node.expression.name, 0);
                if (this.wrapThisCalls || (this.wrapCallMethods.includes(methodName))) {
                    const argsParsed = this.goUnifiedStringCallArgs(node, 0, true) ?? args.map((a) => this.printNode(a, 0)).join(", ");
                    return `<-this.callInternal("${methodName}"${(args.length > 0) ? ", " + argsParsed : ""})`;
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
        if (node.expression.kind === SyntaxKind.ElementAccessExpression) {
            return this.printDynamicCall(node, identation);
        }


        return undefined;
    }

    // `typeof x === "<name>"` checks and the Go predicate helper each maps to
    goTypeOfHelpers = new Map<string, string>([
        ['string', 'IsString'], ['number', 'IsNumber'], ['boolean', 'IsBool'], ['object', 'IsObject'], ['function', 'IsFunction'],
    ]);
    handleTypeOfInsideBinaryExpression(node, identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        const helper = this.goTypeOfHelpers.get(right);
        return (helper === undefined) ? undefined : notOperator + `${helper}(${target})`;

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;

        const op = node.operatorToken.kind;

        const rf6aRebind = this.rf6aSafeDictRebind(node, identation);
        if (rf6aRebind !== undefined) {
            return rf6aRebind;
        }

        // ---------------------------------------------------------------
        // Array destructuring assignment:  [a, b] = foo()
        // Transforms into:
        // __tmpX := foo()
        // a = GetValue(__tmpX, 0)
        // b = GetValue(__tmpX, 1)
        // ---------------------------------------------------------------
        if (op === SyntaxKind.EqualsToken &&
            left.kind === SyntaxKind.ArrayLiteralExpression) {
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

                const statement = this.getIden(identation) + (this.goGetArgBindsDictElement(arrayBindingPatternElements[index], right, index)
                    ? `${e} = MapTyped(GetValue(${syntheticName}, ${index}))`
                    : `${e} = GetValue(${syntheticName}, ${index})`);
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access assignments:  a[b] = v  and  a[b] += v
        // ---------------------------------------------------------------
        if ((op === SyntaxKind.EqualsToken || op === SyntaxKind.PlusEqualsToken) &&
            left.kind === SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!isElementAccessExpression(expr)) {
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
            if (op === SyntaxKind.PlusEqualsToken) {
                const rhs = this.printNode(right, 0);
                // For +=, we need to get the current value, add to it, then set it back
                const currentValue = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${lastKey}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
                const native = (keyStrs.length === 1)
                    ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, `Add(${containerStr}[${lastKey}], ${rhs})`, true)
                    : undefined;
                return (native !== undefined) ? native : `AddElementToObject(${acc}, ${lastKey}, Add(${currentValue}, ${rhs}))`;
            }
            // the value is printed at the statement's own level so a multi-line object
            // literal (bare, or nested inside a call argument) lands one level deeper with
            // its closing brace at the statement level; the leading indentation is dropped
            const rhs     = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();

            // a single key over a receiver the printer typed itself is plain Go
            // indexing; a nested chain goes through GetValue, which is `any`
            // a native `m[k] = v` is a plain assignment, whose value go/printer prints at
            // the statement's own depth rather than inside the helper's argument list
            const nativeRhs = (right.kind === SyntaxKind.BinaryExpression)
                ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(right, identation)).trimStart()
                : rhs;
            const native = (keyStrs.length === 1)
                ? (this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, nativeRhs, false, right)
                    ?? this.printNativeMapWriteOnProvenLocal(baseExpr, containerStr, keys[0], lastKey, nativeRhs, right, identation)
                    ?? this.printOptionDictFieldWrite(baseExpr, containerStr, keys[0], lastKey, right, identation))
                : undefined;
            return (native !== undefined) ? native : `AddElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        if (left.kind === SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        const cacheDup = this.goG09CacheDuplicateNilTest(node);  // RFM-G4 G09
        if (cacheDup !== undefined) {
            return cacheDup;
        }

        if (op === SyntaxKind.InKeyword) {
            const substituted = this.goInOpSubstitutedText(node);
            if (substituted !== undefined) {
                return substituted;
            }
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
        if (op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
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

            if (op === SyntaxKind.PlusEqualsToken) {
                return `${leftText} = Add(${leftText}, ${rightText})`;
            }

            if (op === SyntaxKind.MinusEqualsToken) {
                return `${leftText} = Subtract(${leftText}, ${rightText})`;
            }

            const isEquality = (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken);
            const isDifference = (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken);
            if (isEquality || isDifference) {
                const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
                if (inlined !== undefined) {
                    return inlined;
                }
            }

            if (ORDERED_COMPARISON_OPERATORS[op] !== undefined) {
                const inlined = this.printInlineOrderedComparison(left, right, leftText, rightText, op) ?? this.printG09WideningComparison(left, right, leftText, rightText, op);
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
        // if (op === SyntaxKind.EqualsToken) {
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
        const checker: any = this.checkerOrUndefined();
        if (node?.kind === SyntaxKind.Identifier && this.goDeclaredTypeOfIdentifier(node) === undefined
            && this.goAnyLocalHoldsPointer(checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve())) {
            return undefined;
        }
        return (checker === undefined) ? undefined : this.goScalarFamilyOfType(checker.getTypeAtLocation(node));
    }

    // the scalar family the TypeScript type of an operand belongs to, where a
    // `string | undefined` union still counts as 'string': the Go box holds that
    // scalar or nil, and both `x == nil` and `x == "lit"` are then the same
    // predicate as the helper. Numbers are excluded by the caller.
    goScalarFamilyWithNil(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        return (checker === undefined) ? undefined : this.goScalarFamilyOfType(checker.getTypeAtLocation(node), true);
    }

    // true when this operand is a *parameter* boxed as `any` whose TypeScript type is an array or
    // object (`Strings`, `Market`, `NullableDict`, `object[]`, `object`): a Go map/slice, never a
    // pointer, so a nil test needs no helper. Locals may box a nil `*sync.Map`, which is not `== nil`.
    goObjectBoxParameter(node): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        if (checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve()?.kind !== SyntaxKind.Parameter) {
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
        if (type.flags & TypeFlags.Union) {
            let seen = false;
            for (const member of type.getTypes()) {
                if (member.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) {
                    continue;
                }
                if (!this.goTypeIsNilComparableObject(member)) {
                    return false;
                }
                seen = true;
            }
            return seen;
        }
        if (!(type.flags & (TypeFlags.Object | TypeFlags.NonPrimitive))) {
            return false;
        }
        if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
            return false;
        }
        const declaration = type.getSymbol()?.valueDeclaration?.resolve() ?? type.getSymbol()?.declarations?.map((d) => d.resolve())?.[0];
        return declaration?.kind !== SyntaxKind.ClassDeclaration;
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
        if (node?.kind === SyntaxKind.Identifier) {
            const decl = this.goAnyBoxLocalDeclaration(node);
            const isBinding = (decl?.kind === SyntaxKind.Parameter)
                || (decl?.kind === SyntaxKind.VariableDeclaration);
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
        if (node?.kind === SyntaxKind.CallExpression) {
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
        node = this.goUnwrapParenthesizedNode(node);
        if (node?.kind !== SyntaxKind.ElementAccessExpression) {
            return false;
        }
        if (GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0) {
            return true; // GetValue(container, key)
        }
        let base = node.expression;
        while (isElementAccessExpression(base)) {
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
        if (decl?.kind !== SyntaxKind.VariableDeclaration || decl.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        if (this.goAnyLocalHoldsPointerCache.has(decl)) {
            return this.goAnyLocalHoldsPointerCache.get(decl);
        }
        // the callee is read from the AST, never printed: printing an operand would
        // re-enter the equality classifier that asks this question
        this.goAnyLocalHoldsPointerCache.set(decl, false);
        let settled = true;
        const isPointerInit = (expr): boolean => {
            expr = this.goUnwrapParenthesizedNode(expr);
            if (expr?.kind === SyntaxKind.ConditionalExpression) {
                return isPointerInit(expr.whenTrue) || isPointerInit(expr.whenFalse);
            }
            if (expr?.kind === SyntaxKind.Identifier) {
                // a copy of a pointer-bound GetArg parameter (or of a local holding one) boxes it
                const source: any = this.checkerOrUndefined()?.getSymbolAtLocation(expr)?.valueDeclaration?.resolve();
                if (source?.kind === SyntaxKind.Parameter) {
                    if (this.goGetArgTypeComputing?.has(source)) {
                        settled = false;
                        return true;
                    }
                    return String(this.goGetArgParameterType(source) ?? '').startsWith('*');
                }
                const inner = (source !== decl) && this.goAnyLocalHoldsPointer(source);
                settled = settled && ((source === decl) || this.goAnyLocalHoldsPointerCache.has(source));
                return inner;
            }
            const callee = (expr?.kind === SyntaxKind.CallExpression) ? expr.expression : undefined;
            if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== SyntaxKind.ThisKeyword) {
                return false;
            }
            const name = this.goAstCalleeName(expr);
            const goType = (name === undefined) ? undefined : GO_HELPER_RETURN_TYPES[name];
            return (typeof goType === 'string') && goType.startsWith('*');
        };
        let holds = isPointerInit(decl.initializer);
        if (!holds) {
            const name = decl.name.text;
            const scope = this.goEnclosingFunction(decl);
            const visit = (n) => {
                if (holds) { return; }
                if (n.kind === SyntaxKind.BinaryExpression && n.operatorToken.kind === SyntaxKind.EqualsToken
                    && n.left?.kind === SyntaxKind.Identifier && n.left.text === name && isPointerInit(n.right)) {
                    holds = true;
                    return;
                }
                n.forEachChild(visit);
            };
            if (scope !== undefined) {
                scope.forEachChild(visit);
            }
        }
        if (settled) {
            this.goAnyLocalHoldsPointerCache.set(decl, holds);
        } else {
            this.goAnyLocalHoldsPointerCache.delete(decl);
        }
        return holds;
    }

    // the callee name of a call, read from the AST and capitalised the way the
    // printer names Go functions (`this.parseJson` -> `this.ParseJson`). Printing the
    // callee would re-enter the equality classifier that asks this question.
    goAstCalleeName(call): string | undefined {
        const callee = call?.expression;
        if (callee?.kind === SyntaxKind.Identifier) {
            const name = callee.text;
            return (typeof name === 'string' && name.length > 0) ? name.charAt(0).toUpperCase() + name.substring(1) : undefined;
        }
        if (callee?.kind === SyntaxKind.PropertyAccessExpression && callee.expression?.kind === SyntaxKind.ThisKeyword) {
            const name = callee.name?.text;
            return (typeof name === 'string' && name.length > 0) ? 'this.' + name.charAt(0).toUpperCase() + name.substring(1) : undefined;
        }
        return undefined;
    }

    // the Go name a `this.<field>` read prints (`apiKey` -> `ApiKey`), read from the AST:
    // printing it here would re-enter the local-type classifier that asks this question
    goAstFieldGoName(node): string | undefined {
        if ((node?.kind !== SyntaxKind.PropertyAccessExpression) || (node.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = node.name?.text;
        return (typeof name === 'string' && name.length > 0) ? name.charAt(0).toUpperCase() + name.substring(1) : undefined;
    }

    // true when every declaration of the awaited callee is a bodyless method signature:
    // TS never implements it, the endpoint generator does, and the Go body is the
    // `<-chan any` wrapper over callEndpointAsync (decoded JSON / "panic: " / nil)
    goAwaitedCallIsImplicitEndpoint(expression): boolean {
        const call = this.goUnwrapParenthesizedNode(expression);
        if (call?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee = call.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const nameNode = callee.name;
        if (nameNode?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(nameNode);
        const declarations = symbol?.declarations?.map((d) => d.resolve());
        if (!declarations || declarations.length === 0) {
            return false;
        }
        return declarations.every((d) => (d.kind === SyntaxKind.MethodSignature)
            && (d.body === undefined)
            && (d.parent?.kind === SyntaxKind.InterfaceDeclaration));
    }

    // true when the printed value of this expression is never a *T whose nil
    // derefScalar folds to nil (nor a *sync.Map): null/undefined, an object/array
    // literal, an endpoint await or a JSON decode. Everything else stays unproven.
    goIsNonPointerValueSource(expr): boolean {
        expr = this.goUnwrapParenthesizedNode(expr);
        if (expr === undefined) {
            return true; // `var x any` never written holds nil
        }
        if (this.goG02NonPointerAccessorSource(expr)) {
            return true;
        }
        switch (expr.kind) {
        case SyntaxKind.NullKeyword:
            return true;
        case SyntaxKind.Identifier:
            return expr.text === 'undefined';
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.ArrayLiteralExpression:
            return true;
        case SyntaxKind.AwaitExpression:
            return this.goAwaitedCallIsImplicitEndpoint(expr.expression);
        case SyntaxKind.CallExpression: {
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
        if (decl?.kind !== SyntaxKind.VariableDeclaration || decl.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        if (this.goAnyLocalHoldsNonPointerCache.has(decl)) {
            return this.goAnyLocalHoldsNonPointerCache.get(decl);
        }
        let holds = !this.goAnyLocalHoldsPointer(decl) && this.goIsNonPointerValueSource(decl.initializer);
        if (holds) {
            const name = decl.name.text;
            const scope = this.goEnclosingFunction(decl);
            if (scope === undefined) {
                holds = false;
            } else {
                const visit = (n) => {
                    if (!holds) { return; }
                    // `[ a, b ] = …` writes a and b through GetValue(<tuple>, i), so its
                    // source is the right-hand side as well
                    if (n.kind === SyntaxKind.BinaryExpression && n.operatorToken?.kind === SyntaxKind.EqualsToken
                        && this.goAssignmentWritesName(n.left, name)
                        && !this.goIsNonPointerValueSource(n.right)) {
                        holds = false;
                        return;
                    }
                    n.forEachChild(visit);
                };
                scope.forEachChild(visit);
            }
        }
        this.goAnyLocalHoldsNonPointerCache.set(decl, holds);
        return holds;
    }

    // true when this assignment target binds the named local: a plain identifier, or a
    // destructuring element (`[ a, b ] = …` prints GetValue(<tuple>, i) writes)
    goAssignmentWritesName(left, name): boolean {
        if (left?.kind === SyntaxKind.Identifier) {
            return left.text === name;
        }
        if (left?.kind === SyntaxKind.ArrayLiteralExpression) {
            return left.elements.some((e) => (e?.kind === SyntaxKind.Identifier) && (e.text === name));
        }
        return false;
    }

    // the variable declaration an identifier resolves to, when it is one
    goAnyBoxLocalDeclaration(node): any {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        return symbol?.valueDeclaration?.resolve();
    }

    // true when this identifier is a parameter bound by `x := GetArg(optionalArgs, i, default)`:
    // GetArg runs derefScalar and folds a typed nil pointer (and nil []string/[]any) into the untyped
    // default, so the box holds a plain scalar or an untyped nil, never a nil *T.
    goGetArgBoundParameter(node): boolean {
        const decl = this.goAnyBoxLocalDeclaration(node);
        // a parameter without a default keeps the caller's value as-is in a plain `any`
        // parameter, where a *int64 handed over by another method stays a pointer
        if (decl?.kind !== SyntaxKind.Parameter || decl.initializer === undefined) {
            return false;
        }
        // only a method/function body binds its defaulted parameters with GetArg: an arrow
        // function's printed parameters carry no default binding at all
        const owner = decl.parent?.kind;
        if (owner !== SyntaxKind.MethodDeclaration && owner !== SyntaxKind.FunctionDeclaration
            && owner !== SyntaxKind.Constructor) {
            return false;
        }
        return !this.goParameterLaterWritesPointerBox(decl);
    }

    // D2 for a GetArg-bound parameter: a later `x = …` write whose printed value is a typed
    // pointer puts a nil *T back in the box, where IsEqual(x, nil) is true but `x == nil` is not
    goParameterLaterWritesPointerBox(decl): boolean {
        const name = (decl?.name?.kind === SyntaxKind.Identifier) ? decl.name.text : undefined;
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
            if (n.kind === SyntaxKind.BinaryExpression && n.operatorToken?.kind === SyntaxKind.EqualsToken
                && this.goAssignmentWritesName(n.left, name) && this.goWritePrintsPointerBox(n.right)) {
                pointerWrite = true;
                return;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return pointerWrite;
    }

    // true when the printed value of an assignment's right-hand side is a typed pointer: a
    // `this.safeX(…)`/`this.Parse8601(…)` accessor (GO_HELPER_RETURN_TYPES), an identifier the
    // printer declared `*T`, or a hand-written *sync.Map field. Read from the AST, never printed.
    goWritePrintsPointerBox(expr): boolean {
        expr = this.goUnwrapParenthesizedNode(expr);
        if (expr === undefined) {
            return false;
        }
        if (expr.kind === SyntaxKind.CallExpression) {
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
        if (expr.kind === SyntaxKind.Identifier) {
            const declared = this.goDeclaredTypeOfIdentifier(expr);
            return (typeof declared === 'string') && declared.startsWith('*');
        }
        if (expr.kind === SyntaxKind.PropertyAccessExpression && expr.expression?.kind === SyntaxKind.ThisKeyword) {
            const fieldType = GO_NILABLE_FIELDS_Typed['this.' + expr.name?.text];
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
        const alias = type.getAliasSymbol()?.escapedName;
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
        if (flags & TypeFlags.Union) {
            const families = new Set<string>();
            for (const member of type.getTypes()) {
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
        if (flags & (TypeFlags.String | TypeFlags.StringLiteral)) {
            return 'string';
        }
        if (flags & (TypeFlags.Number | TypeFlags.NumberLiteral)) {
            return 'number';
        }
        if (flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) {
            return 'bool';
        }
        if (flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) {
            return 'nil';
        }
        return undefined;
    }

    // B-02: a parameter of a nullable ccxt alias (`Str`) prints as the native Go type (`*string`) only
    // when the method is internal (not async/override, no inherited member), every call site passes
    // that type (checker here, textual for siblings), and the body never writes another type (D2).

    // ===== RF-go-6-D =====
    // Order-book side reads, keyed on the checker type. A value whose checker type is the ws order-book class
    // (config `orderBook.classes`) and whose Go local is retyped to the port's own book interface prints its
    // `x['asks'|'bids']` read as the interface accessor (`x.GetAsks()`). The retype is made at the DECLARATION and
    // only when no nil can reach a read: every write is a book constructor, or a cache read (`obj[key]` /
    // `this.safeValue(obj, key)` on a Dictionary of books) whose entry is proven present by a dominating guard
    // (an enclosing `key in obj`, a preceding `if (!(key in obj)) {store | exit}`, or a preceding
    // `if (x === undefined) {x = ctor | exit}` that every later read follows). A pro handler parameter of the book
    // class is retyped when every call site in the tree hands it a typed book. Without config nothing changes.
    goOrderBook: { classes: string[], constructors: string[], cacheReaders: string[], type: string, sideType: string, unbox: string, sides: { [side: string]: string } } | undefined;
    goOrderBookLocalCache = new Map<any, string | undefined>();
    goOrderBookEntryProven = new Map<any, boolean>();

    goIsOrderBookType(type): boolean {
        const cfg = this.goOrderBook;
        if ((cfg === undefined) || (type === undefined)) {
            return false;
        }
        const parts = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes() : [type];
        const kept = parts.filter((p) => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        return (kept.length === 1) && [ kept[0].getAliasSymbol?.()?.name, kept[0].getSymbol?.()?.name ].some((n) => cfg.classes.includes(n));
    }

    goNodeIsOrderBook(node): boolean {
        try {
            return this.goIsOrderBookType(this.getChecker().getTypeAtLocation(node));
        } catch (e) {
            return false;
        }
    }

    // `this.orderBook (...)` and its Counted/Indexed twins: the constructor answers a book, never nil
    goIsOrderBookProducer(node): boolean {
        const cfg = this.goOrderBook;
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        const callee: any = node?.expression;
        return (cfg !== undefined) && (node?.kind === SyntaxKind.CallExpression) && (callee?.kind === SyntaxKind.PropertyAccessExpression)
            && (callee.expression?.kind === SyntaxKind.ThisKeyword) && cfg.constructors.includes(callee.name?.text);
    }

    // the container/key of a cache read: `obj[key]` or `this.safeValue (obj, key)` on a Dictionary whose values are books
    goOrderBookCacheRead(node): { obj: any, key: any } | undefined {
        const cfg = this.goOrderBook;
        let obj: any;
        let key: any;
        if ((cfg === undefined) || (node === undefined)) {
            return undefined;
        }
        if (node.kind === SyntaxKind.ElementAccessExpression) {
            obj = node.expression;
            key = node.argumentExpression;
        } else if ((node.kind === SyntaxKind.CallExpression) && (node.expression?.kind === SyntaxKind.PropertyAccessExpression)
            && (node.expression.expression?.kind === SyntaxKind.ThisKeyword) && cfg.cacheReaders.includes(node.expression.name?.text)
            && (node.arguments?.length === 2)) {
            obj = node.arguments[0];
            key = node.arguments[1];
        } else {
            return undefined;
        }
        try {
            const values = this.getChecker().getTypeAtLocation(obj)?.getStringIndexType?.();
            return this.goIsOrderBookType(values) ? { obj, key } : undefined;
        } catch (e) {
            return undefined;
        }
    }

    goSameExpressionText(a, b): boolean {
        return (a !== undefined) && (b !== undefined) && (a.getText().replace(/\s+/g, '') === b.getText().replace(/\s+/g, ''));
    }

    // `<key> in <obj>` possibly under `&&`
    goConditionHasPresence(cond, read: { obj: any, key: any }): boolean {
        while (cond?.kind === SyntaxKind.ParenthesizedExpression) {
            cond = cond.expression;
        }
        if (cond?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        if (cond.operatorToken?.kind === SyntaxKind.InKeyword) {
            return this.goSameExpressionText(cond.left, read.key) && this.goSameExpressionText(cond.right, read.obj);
        }
        return (cond.operatorToken?.kind === SyntaxKind.AmpersandAmpersandToken)
            && (this.goConditionHasPresence(cond.left, read) || this.goConditionHasPresence(cond.right, read));
    }

    goConditionIsNegatedPresence(cond, read: { obj: any, key: any }): boolean {
        while (cond?.kind === SyntaxKind.ParenthesizedExpression) {
            cond = cond.expression;
        }
        // `this.safeValue (obj, key) === undefined`: the same absent test through the cache reader
        if ((cond?.kind === SyntaxKind.BinaryExpression) && [ SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.EqualsEqualsToken ].includes(cond.operatorToken?.kind)) {
            const absent = (cond.right?.kind === SyntaxKind.NullKeyword) || ((cond.right?.kind === SyntaxKind.Identifier) && (cond.right.text === 'undefined'));
            const cached = absent ? this.goOrderBookCacheRead(cond.left) : undefined;
            return (cached !== undefined) && this.goSameExpressionText(cached.obj, read.obj) && this.goSameExpressionText(cached.key, read.key);
        }
        return (cond?.kind === SyntaxKind.PrefixUnaryExpression) && (cond.operator === SyntaxKind.ExclamationToken)
            && this.goConditionHasPresence(cond.operand, read);
    }

    goBlockStatements(node): any[] {
        return (node?.kind === SyntaxKind.Block) ? Array.from(node.statements) : (node === undefined ? [] : [ node ]);
    }

    goStatementExits(statement): boolean {
        const kind = statement?.kind;
        return (kind === SyntaxKind.ReturnStatement) || (kind === SyntaxKind.ThrowStatement)
            || (kind === SyntaxKind.ContinueStatement) || (kind === SyntaxKind.BreakStatement);
    }

    // `<obj>[<key>] = <book>` or `<obj>[<key>] = x` at the top level of a block
    goStoresBookInCache(statements: any[], read: { obj: any, key: any }): boolean {
        return statements.some((st) => {
            if ((st.kind === SyntaxKind.IfStatement) && (st.elseStatement !== undefined)) {
                return this.goStoresBookInCache(this.goBlockStatements(st.thenStatement), read)
                    && this.goStoresBookInCache(this.goBlockStatements(st.elseStatement), read);
            }
            const e: any = (st.kind === SyntaxKind.ExpressionStatement) ? st.expression : undefined;
            return (e?.kind === SyntaxKind.BinaryExpression) && (e.operatorToken?.kind === SyntaxKind.EqualsToken)
                && (e.left?.kind === SyntaxKind.ElementAccessExpression) && this.goSameExpressionText(e.left.expression, read.obj)
                && this.goSameExpressionText(e.left.argumentExpression, read.key)
                && (this.goNodeIsOrderBook(e.right) || this.goIsOrderBookProducer(e.right));
        });
    }

    // the entry `read.obj[read.key]` holds a book at `at`: an enclosing `key in obj` guard, or an earlier sibling
    // `if (!(key in obj)) { obj[key] = <book> | exit }` of an enclosing block
    goOrderBookEntryPresent(at, read: { obj: any, key: any }): boolean {
        let child: any = at;
        for (let parent: any = at.parent; parent !== undefined; child = parent, parent = parent.parent) {
            if (isFunctionLike(parent)) {
                return false;
            }
            if ((parent.kind === SyntaxKind.IfStatement) && (parent.thenStatement === child) && this.goConditionHasPresence(parent.expression, read)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.IfStatement) && (parent.elseStatement === child) && this.goConditionIsNegatedPresence(parent.expression, read)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.Block) || (parent.kind === SyntaxKind.CaseClause) || (parent.kind === SyntaxKind.DefaultClause)) {
                for (const st of Array.from(parent.statements as any[])) {
                    if (st === child) {
                        break;
                    }
                    if ((st.kind === SyntaxKind.IfStatement) && (st.elseStatement === undefined) && this.goConditionIsNegatedPresence(st.expression, read)) {
                        const body = this.goBlockStatements(st.thenStatement);
                        if (this.goStoresBookInCache(body, read) || this.goStatementExits(body[body.length - 1])) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    // `x = <ctor>` as a whole statement
    goIsProducerAssignment(statement, name: string): boolean {
        const e: any = (statement?.kind === SyntaxKind.ExpressionStatement) ? statement.expression : undefined;
        return (e?.kind === SyntaxKind.BinaryExpression) && (e.operatorToken?.kind === SyntaxKind.EqualsToken)
            && (e.left?.kind === SyntaxKind.Identifier) && (e.left.text === name) && this.goIsOrderBookProducer(e.right);
    }

    // a producer assignment of `name` precedes `at` in an enclosing block
    goDominatedByProducerWrite(at, name: string): boolean {
        let child: any = at;
        for (let parent: any = at.parent; parent !== undefined; child = parent, parent = parent.parent) {
            if (isFunctionLike(parent)) {
                return false;
            }
            if (parent.kind === SyntaxKind.Block) {
                for (const st of Array.from(parent.statements as any[])) {
                    if (st === child) {
                        break;
                    }
                    if (this.goIsProducerAssignment(st, name)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // `if (x === undefined) { x = <ctor> | exit }` : the first such sibling after the declaration statement
    goOrderBookRepairGuard(declaration, name: string): any {
        const statement: any = declaration.parent?.parent;
        const siblings: any[] = Array.from((statement?.parent?.statements ?? []) as any[]);
        for (const st of siblings.slice(siblings.indexOf(statement) + 1)) {
            if (st.kind !== SyntaxKind.IfStatement) {
                continue;
            }
            const c: any = st.expression;
            const nilTest = (c?.kind === SyntaxKind.BinaryExpression) && [ SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.EqualsEqualsToken ].includes(c.operatorToken?.kind)
                && (c.left?.kind === SyntaxKind.Identifier) && (c.left.text === name)
                && ((c.right?.kind === SyntaxKind.NullKeyword) || ((c.right?.kind === SyntaxKind.Identifier) && (c.right.text === 'undefined')));
            const body = this.goBlockStatements(st.thenStatement);
            if (nilTest && (body.some((b) => this.goIsProducerAssignment(b, name)) || this.goStatementExits(body[body.length - 1]))) {
                return st;
            }
        }
        return undefined;
    }

    // `x['asks']`, or `x` handed whole to a call whose declared parameter is the book class
    goOrderBookRefIsRead(id): boolean {
        const parent: any = id.parent;
        if ((parent?.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === id)) {
            return this.goIsOrderBookSideAccess(parent);
        }
        // a member of the book (`x.reset (..)`, `x.cache`): the port prints these on the interface
        if ((parent?.kind === SyntaxKind.PropertyAccessExpression) && (parent.expression === id)) {
            return true;
        }
        if ((parent?.kind !== SyntaxKind.CallExpression) || !parent.arguments?.includes(id)) {
            return false;
        }
        try {
            const target: any = this.getChecker().getResolvedSignature(parent)?.declaration?.resolve();
            const param: any = target?.parameters?.[parent.arguments.indexOf(id)];
            return (param?.name !== undefined) && this.goIsProHandlerMethod(target)
                && (this.goNodeIsOrderBook(param.name) || ((this.getChecker().getTypeAtLocation(param.name).flags & TypeFlags.Any) !== 0));
        } catch (e) {
            return false;
        }
    }

    goIsOrderBookSideAccess(node): boolean {
        const cfg = this.goOrderBook;
        const key: any = node.argumentExpression;
        return (cfg !== undefined) && (node.expression?.kind === SyntaxKind.Identifier) && (key?.kind === SyntaxKind.StringLiteral)
            && Object.prototype.hasOwnProperty.call(cfg.sides, key.text) && !this.isGoElementAccessAssignmentTarget(node);
    }

    goOrderBookLocalUnbox(declaration): string | undefined {
        return this.goCachedLocalUnbox(this.goOrderBookLocalCache, declaration, () => this.goOrderBookLocalUnboxUncached(declaration));
    }

    goOrderBookLocalUnboxUncached(declaration): string | undefined {
        const cfg = this.goOrderBook;
        const name: string = declaration.name.text;
        if ((cfg === undefined) || (declaration.initializer === undefined) || (declaration.type?.kind === SyntaxKind.AnyKeyword)
            || !/(^|[\\/])ts[\\/]src[\\/](pro|prediction)[\\/]/.test(String(declaration.getSourceFile().fileName ?? ''))) {
            return undefined;
        }
        const scope: any = this.goEnclosingFunction(declaration);
        // sibling-block locals of the same name are separate Go variables: only the type name must be free
        if ((scope === undefined) || this.goTypeNameIsShadowed(scope, cfg.type)) {
            return undefined;
        }
        const refs: any[] = this.goDescendantsOf(scope).filter((n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === name)
            && (n !== declaration.name) && this.goIdentifierRefersToDeclaration(n, declaration)
            && !((n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n)));
        const isWrite = (n: any) => (n.parent?.kind === SyntaxKind.BinaryExpression) && (n.parent.left === n)
            && (n.parent.operatorToken.kind >= SyntaxKind.FirstAssignment) && (n.parent.operatorToken.kind <= SyntaxKind.LastAssignment);
        const writes = refs.filter(isWrite);
        // the retype exists for the side reads (and for the handlers that receive the book): any other local keeps its box
        if (!refs.some((n) => this.goOrderBookRefIsRead(n))) {
            return undefined;
        }
        if (refs.some((n) => (n.parent?.kind === SyntaxKind.PrefixUnaryExpression) || (n.parent?.kind === SyntaxKind.PostfixUnaryExpression)
            || (n.parent?.kind === SyntaxKind.SpreadElement)) || writes.some((w) => w.parent.operatorToken.kind !== SyntaxKind.EqualsToken)) {
            return undefined;
        }
        let needsRepair = false;
        const init = declaration.initializer;
        if (!this.goIsOrderBookProducer(init)) {
            const read = this.goOrderBookCacheRead(init);
            if (read === undefined) {
                return undefined;
            }
            needsRepair = !this.goOrderBookEntryPresent(init, read);
            this.goOrderBookEntryProven.set(declaration, !needsRepair);
        }
        for (const w of writes) {
            const rhs: any = w.parent.right;
            const cached = this.goOrderBookCacheRead(rhs);
            if (!this.goIsOrderBookProducer(rhs) && !((cached !== undefined) && this.goOrderBookEntryPresent(rhs, cached))) {
                return undefined;
            }
        }
        if (needsRepair) {
            const guard = this.goOrderBookRepairGuard(declaration, name);
            if (guard === undefined) {
                return undefined;
            }
            const nilTested = (n: any) => (n.parent?.kind === SyntaxKind.BinaryExpression) && [ SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.EqualsEqualsToken,
                SyntaxKind.ExclamationEqualsEqualsToken, SyntaxKind.ExclamationEqualsToken ].includes(n.parent.operatorToken?.kind)
                && (((n.parent.left === n) ? n.parent.right : n.parent.left)?.text === 'undefined');
            const inElse = (n: any) => (guard.elseStatement !== undefined) && (n.pos >= guard.elseStatement.pos) && (n.end <= guard.elseStatement.end);
            const early = refs.filter((n) => !isWrite(n) && !nilTested(n) && !inElse(n) && (n.end <= guard.end));
            if (early.some((n) => !this.goDominatedByProducerWrite(n, name))) {
                return undefined;
            }
        }
        return cfg.type;
    }

    // the declaration's initializer: a cache read is unboxed by the port's own typed reader
    goOrderBookUnboxValue(declaration, parsedValue: string): string | undefined {
        const cfg = this.goOrderBook;
        if ((cfg === undefined) || (this.goOrderBookLocalUnbox(declaration) !== cfg.type) || this.goIsOrderBookProducer(declaration.initializer)) {
            return undefined;
        }
        // an entry a dominating guard proved present is Go's own assertion (it cannot see a nil, and it is what proves
        // the book non-nil to the setter calls); an entry a later nil test repairs keeps the nil-tolerant unboxer
        if (this.goOrderBookEntryProven.get(declaration) === true) {
            return `${parsedValue.trimStart()}.(${cfg.type})`;
        }
        return `${cfg.unbox}(${parsedValue.trimStart()})`;
    }

    // `const asks = x['asks']`: the local holds the side the accessor answers (`ccxt.IOrderBookSide`), never rebound
    goOrderBookSideLocalType(declaration): string | undefined {
        const cfg = this.goOrderBook;
        const init: any = declaration.initializer;
        if ((cfg === undefined) || (init?.kind !== SyntaxKind.ElementAccessExpression) || (declaration.parent?.parent?.kind !== SyntaxKind.FirstStatement)
            || (init.expression?.kind !== SyntaxKind.Identifier) || (this.goOrderBookSideRead(init) === undefined)) {
            return undefined;
        }
        const scope: any = this.goEnclosingFunction(declaration);
        const name = declaration.name.text;
        const rebound = this.goDescendantsOf(scope).some((n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name)
            && this.goIdentifierRefersToDeclaration(n, declaration) && (n.parent?.kind === SyntaxKind.BinaryExpression) && (n.parent.left === n)
            && (n.parent.operatorToken.kind >= SyntaxKind.FirstAssignment) && (n.parent.operatorToken.kind <= SyntaxKind.LastAssignment));
        // one binding of the name per function: a sibling-block redeclaration keeps the box
        const bindings = this.goDescendantsOf(scope).filter((n: any) => ((n.kind === SyntaxKind.VariableDeclaration) || (n.kind === SyntaxKind.Parameter))
            && (n.name?.kind === SyntaxKind.Identifier) && (n.name.text === name));
        return (rebound || (bindings.length !== 1) || this.goTypeNameIsShadowed(scope, cfg.sideType)) ? undefined : cfg.sideType;
    }

    // `x['asks']` on an identifier printed as the book interface is the interface's accessor
    goOrderBookSideRead(node): string | undefined {
        if (!this.goIsOrderBookSideAccess(node) || (this.goDeclaredTypeOfIdentifier(node.expression) !== this.goOrderBook?.type)) {
            return undefined;
        }
        return `${this.printNode(node.expression, 0)}.${this.goOrderBook.sides[node.argumentExpression.text]}()`;
    }

    // a pro `handle*` method's book parameter prints the book interface when every call site hands it one
    goOrderBookParameterType(fn, param): string | undefined {
        const cfg = this.goOrderBook;
        if ((cfg === undefined) || !this.goIsProHandlerMethod(fn) || this.isAsyncFunction(fn) || (param.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        // declared as the book class, or as `any` with every caller handing a book (the call-site proof below)
        let declaredAny = false;
        try {
            declaredAny = (this.getChecker().getTypeAtLocation(param.name).flags & TypeFlags.Any) !== 0;
        } catch (e) {
            return undefined;
        }
        if (!declaredAny && !this.goNodeIsOrderBook(param.name)) {
            return undefined;
        }
        const index = fn.parameters.indexOf(param);
        const calls = this.goSameFileCallsOf(fn, fn.name.text);
        return ((calls.length > 0) && calls.every((call) => (call.arguments?.[index] !== undefined) && (call.arguments[index].kind !== SyntaxKind.SpreadElement)
            && (this.goPrintedArgType(call.arguments[index]) === cfg.type))
            && this.goLocalIsSafeToType(fn.body, param, param.name.text, cfg.type)) ? cfg.type : undefined;
    }
    // ===== RF-go-6-D (end) =====

    goNativeParameterTypeCache = new Map<any, string | undefined>();
    goSameFileCallCache = new Map<any, Map<string, Array<any>>>();
    goTsSrcTreeCache = new Map<string, any>();

    goNativeParameterType(param): string | undefined {
        if (param?.kind !== SyntaxKind.Parameter) {
            return undefined;
        }
        if (this.goNativeParameterTypeCache.has(param)) {
            return this.goNativeParameterTypeCache.get(param);
        }
        // the call-site proof prints argument expressions, which can land back here
        this.goNativeParameterTypeCache.set(param, undefined);
        const result = this.goNativeParameterTypeOf(param) ?? this.goUncalledStringParameterType(param);
        this.goNativeParameterTypeCache.set(param, result);
        return result;
    }

    goNativeParameterTypeOf(param): string | undefined {
        if ((param.initializer !== undefined) || (param.dotDotDotToken !== undefined)) {
            return undefined; // optional/variadic parameters keep the optionalArgs ABI
        }
        if (param.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const fn: any = param.parent;
        if ((fn?.kind !== SyntaxKind.MethodDeclaration) || (fn.body === undefined) || (fn.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        const parseParam = fn.name.text.startsWith('parse');
        // D-03: a pro handler's frame parameter (`handleX (client: Client, message: Dict)`)
        // is the second family whose call-site proof can name a Go type
        const handlerParam = !parseParam && this.goIsProHandlerMethod(fn);
        if (this.goIsUnifiedStringParameter(fn.name.text, fn.parameters.indexOf(param))) {
            // the table types the base and every override together: a body that breaks it fails the build
            if ((this.goRequiredStringParameterType(param) !== 'string')
                || !this.goLocalIsSafeToType(fn.body, param, param.name.text, 'string')
                || !this.goParameterKeepsNilCompareNative(fn.body, param, 'string')) {
                throw new Error(`unifiedStringParams: ${fn.name.text} parameter ${param.name.text} is not a required string written only as string`);
            }
            return 'string';
        }
        if (this.goIsUnifiedBoolParameter(fn.name.text, fn.parameters.indexOf(param))) {
            // the table types the base and every override together: a body that breaks it fails the build
            if ((this.goNativeParameterTypeCandidates(param)[0] !== 'bool')
                || !this.goLocalIsSafeToType(fn.body, param, param.name.text, 'bool')) {
                throw new Error(`unifiedBoolParams: ${fn.name.text} parameter ${param.name.text} is not a required boolean written only as bool`);
            }
            return 'bool';
        }
        // hx10 GP12: the ws frame. `override handleMessage (client, message: Dict)` is the one
        // inherited signature the Go dispatch can type: WsDispatch asserts the decoded object once.
        const frameType = this.goWsFrameParameterType(fn, param);
        if (frameType !== undefined) {
            return frameType;
        }
        if (this.goIsUnifiedSliceParameter(fn.name.text, fn.parameters.indexOf(param))) {
            // hx10w9 GP13: the slice table types the base and every override together, exactly like
            // the string table above. A method whose declarations or call sites disagree prints `any`
            // everywhere so the Go signature stays the one the hand-written interfaces declare.
            return this.goUnifiedSliceParameterType(fn, param);
        }
        const bookParameter = this.goOrderBookParameterType(fn, param);  // RF-go-6-D
        if (bookParameter !== undefined) {
            return bookParameter;
        }
        if (this.goMethodKeepsBaseSignature(fn)) {
            return undefined; // inherited/base methods are pinned by the base class and IDerivedExchange
        }
        const index = fn.parameters.indexOf(param);
        if (!parseParam && !handlerParam) {
            // any other exchange-local method: only a non-nullable TS `string` becomes a Go `string`
            // at least one proven caller: an uncalled method's signature is outside API only by accident
            const goType = this.goRequiredStringParameterType(param);
            if ((goType !== undefined) && this.goHasTreeCallSite(fn) && this.goParameterCallSitesPassType(fn, index, goType)
                && this.goLocalIsSafeToType(fn.body, param, param.name.text, goType)
                && this.goParameterKeepsNilCompareNative(fn.body, param, goType)) {
                return goType;
            }
            const sliceType = this.goSliceParameterType(fn, param, index);
            if (sliceType !== undefined) {
                return sliceType;
            }
            return this.g11NativeParameterType(fn, param, index) ?? this.goAsyncBooleanParameterType(fn, param, index);
        }
        if (this.isAsyncFunction(fn)) {
            return undefined;
        }
        // hx10 PG01: the parse* path used to offer only `*string`; a non-nullable `string` whose
        // callers all pass one is the plain value type the local methods already take
        const parseString = this.goRequiredStringParameterType(param);
        if ((parseString !== undefined)
            && this.goParameterCallSitesPassType(fn, index, parseString)
            && this.goLocalIsSafeToType(fn.body, param, param.name.text, parseString)
            && this.goParameterKeepsNilCompareNative(fn.body, param, parseString)) {
            return parseString;
        }
        for (const goType of this.goNativeParameterTypeCandidates(param, handlerParam)) {
            if (this.goParameterCallSitesPassType(fn, index, goType)
                && this.goLocalIsSafeToType(fn.body, param, param.name.text, goType)
                && this.goParameterKeepsNilCompareNative(fn.body, param, goType)) {
                return goType;
            }
        }
        const sliceType = handlerParam ? undefined : this.goSliceParameterType(fn, param, index);
        if (sliceType !== undefined) {
            return sliceType;
        }
        return handlerParam ? undefined : this.g11NativeParameterType(fn, param, index);
    }

    // G09: the Go slice type a parameter prints. The TS annotation names the element shape
    // (only `any` and `string` elements have a Go slice the printer builds), and every call
    // site must pass that exact slice, so the printed signature stays assignable.
    goSliceParameterType(fn, param, index: number): string | undefined {
        if (this.goMethodKeepsBaseSignature(fn)) {
            return undefined; // a base/override param is pinned by the generated base + IDerivedExchange
        }
        const annotated = this.goAnnotatedSliceParameterType(param);
        if (annotated === undefined) {
            return undefined;
        }
        // a `[]any` element is an untyped slot: the guarded native read (bounds check plus
        // DerefScalar closure) answers what base's GetValue did in one call, so leave such a
        // parameter boxed and keep base's print. A `[]string` element is already a Go string.
        if ((annotated === GO_SAFE_LIST_LOCAL_TYPE) && this.goBodyReadsElement(fn.body, param.name.text)) {
            return undefined;
        }
        return (this.goParameterCallSitesPassType(fn, index, annotated)
            && this.goLocalIsSafeToType(fn.body, param, param.name.text, annotated)
            && this.goParameterKeepsNilCompareNative(fn.body, param, annotated)) ? annotated : undefined;
    }

    // the slice type an array-annotated parameter prints, undefined for every other annotation
    goAnnotatedSliceParameterType(param): string | undefined {
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(param);
        if (type === undefined) {
            return undefined;
        }
        let parts = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes().slice() : [type];
        parts = parts.filter(p => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        if (parts.length !== 1) {
            return undefined;
        }
        const inner: any = parts[0];
        if (!(inner.flags & TypeFlags.Object) || !checker.isArrayType(inner)) {
            return undefined;
        }
        const element: any = checker.getIndexTypeOfType(inner, IndexKind.Number);
        if (element === undefined) {
            return undefined;
        }
        if (element.flags & (TypeFlags.String | TypeFlags.StringLiteral)) {
            return '[]string';
        }
        if (element.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
            return '[]any';
        }
        // an array of dicts/structures: the printer boxes every element as `any`
        return this.goTypeIsNilComparableObject(element) ? '[]any' : undefined;
    }

    // true when the body indexes this parameter: `x[i]` on a `[]any` is the guarded native
    // element read, which is a closure per read (see goNativeListElementRead)
    goBodyReadsElement(body, name: string): boolean {
        if (body === undefined) {
            return false;
        }
        let found = false;
        const visit = (n): void => {
            if (found) {
                return;
            }
            if ((n.kind === SyntaxKind.ElementAccessExpression) && (n.expression?.kind === SyntaxKind.Identifier)
                && (n.expression.text === name)) {
                found = true;
                return;
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return found;
    }

    goIsUnifiedBoolParameter(methodName: string, index: number): boolean {
        const indexes = Object.prototype.hasOwnProperty.call(this.unifiedBoolParams, methodName) ? this.unifiedBoolParams[methodName] : undefined;
        return Array.isArray(indexes) && indexes.includes(index);
    }

    goIsUnifiedStringParameter(methodName: string, index: number): boolean {
        const indexes = Object.prototype.hasOwnProperty.call(this.unifiedStringParams, methodName) ? this.unifiedStringParams[methodName] : undefined;
        return Array.isArray(indexes) && indexes.includes(index);
    }

    // ---- hx10w9 GP13: the slice mirror of the string table --------------------------------------
    // The ccxt-side table names the inherited methods whose parameter prints a Go slice. The TS
    // annotation (`string[]`/`string[][]`) is the whole proof for the element type, and the
    // argument side is proven by the literal rule below: an array literal whose elements all print
    // as Go strings opens as that slice instead of `[]any{...}`.

    goIsUnifiedSliceParameter(methodName: string, index: number): boolean {
        const entry = Object.prototype.hasOwnProperty.call(this.unifiedSliceParams, methodName) ? this.unifiedSliceParams[methodName] : undefined;
        return (entry !== undefined) && (typeof entry[index] === 'string');
    }

    goUnifiedSliceParameterType(fn, param): string | undefined {
        const entry = Object.prototype.hasOwnProperty.call(this.unifiedSliceParams, fn.name.text) ? this.unifiedSliceParams[fn.name.text] : undefined;
        if (entry === undefined) {
            return undefined;
        }
        const goType = entry[fn.parameters.indexOf(param)];
        if (goType === '[]any') {
            return this.goUnifiedAnySliceParameterType(fn, param);
        }
        const annotation = (goType === '[]string') ? 'string[]' : ((goType === '[][]string') ? 'string[][]' : undefined);
        if ((annotation === undefined) || (this.goAnnotatedParameterText(param) !== annotation)) {
            return undefined;
        }
        if (!this.goSliceTableDeclarationsMatch(fn, annotation)) {
            return undefined;
        }
        // an override answers exactly what the declaring class answered: the interface method is
        // one signature for the base and every venue
        const rootParam = this.goSliceTableRootParameter(fn, param);
        if (rootParam !== undefined) {
            if (this.goNativeParameterType(rootParam) !== goType) {
                return undefined;
            }
            return goType;
        }
        if (!this.goLocalIsSafeToType(fn.body, param, param.name.text, goType)) {
            return undefined;
        }
        if (!this.goParameterKeepsNilCompareNative(fn.body, param, goType)) {
            return undefined;
        }
        if (!this.goSliceTableCallSitesPass(fn, fn.name.text, fn.parameters.indexOf(param), goType)) {
            return undefined;
        }
        return goType;
    }

    // hx11 RF-go-7: a table slot of `[]any` types a required array-typed parameter whose elements are
    // objects (a request-row list) as the `[]any` every caller already hands over. The table types the
    // base and every override together (one interface signature): a body that breaks it fails the build.
    goUnifiedAnySliceParameterType(fn, param): string | undefined {
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(param);
        if ((type === undefined) || (param.initializer !== undefined) || (param.dotDotDotToken !== undefined)
            || (param.name?.kind !== SyntaxKind.Identifier) || (fn.body === undefined) || !checker.isArrayType(type)) {
            return undefined;
        }
        const element = checker.getIndexTypeOfType(type, IndexKind.Number);
        if ((element === undefined) || !(element.flags & TypeFlags.Object)) {
            return undefined;
        }
        if (!this.goLocalIsSafeToType(fn.body, param, param.name.text, '[]any')) {
            throw new Error(`unifiedSliceParams: ${fn.name.text} parameter ${param.name.text} is written as something other than []any`);
        }
        return '[]any';
    }

    // the parameter node a unified `[]any` slot belongs to: its element reads keep GetValue, the native
    // read would trade it for DerefScalar
    goIsUnifiedAnySliceParameterNode(decl: any): boolean {
        const fn: any = decl?.parent;
        if ((decl?.kind !== SyntaxKind.Parameter) || (fn?.name?.kind !== SyntaxKind.Identifier)) {
            return false;
        }
        const entry = Object.prototype.hasOwnProperty.call(this.unifiedSliceParams, fn.name.text) ? this.unifiedSliceParams[fn.name.text] : undefined;
        return entry?.[fn.parameters.indexOf(decl)] === '[]any';
    }

    // the parameter the class chain's own declaration of this method takes: an override prints the
    // same Go signature the base does, or the interface method would differ per venue
    goSliceTableRootParameter(fn, param) {
        const index = fn.parameters.indexOf(param);
        const cls: any = this.goEnclosingClass(fn);
        const checker: any = this.checkerOrUndefined();
        if ((cls === undefined) || (checker === undefined)) {
            return undefined;
        }
        for (const clause of (cls.heritageClauses ?? [])) {
            if (clause.token !== SyntaxKind.ExtendsKeyword) {
                continue;
            }
            for (const expr of (clause.types ?? [])) {
                let baseType;
                try {
                    baseType = checker.getTypeAtLocation(expr);
                } catch (e) {
                    continue;
                }
                const property = baseType?.getProperty?.(fn.name.text);
                for (const declaration of (property?.declarations ?? [])) {
                    const resolved: any = declaration?.resolve?.() ?? declaration;
                    if ((resolved?.kind !== SyntaxKind.MethodDeclaration) || (resolved === fn)) {
                        continue;
                    }
                    const baseParam = (resolved.parameters ?? [])[index];
                    if (baseParam !== undefined) {
                        return baseParam;
                    }
                }
            }
        }
        return undefined;
    }

    goAnnotatedParameterText(param): string | undefined {
        if (param?.type === undefined) {
            return undefined;
        }
        return String(param.type.getText()).replace(/\s+/g, '');
    }

    // every deriving file that declares the method must declare the same annotation, or the base
    // and an override would print two different Go signatures for one interface method
    goSliceTableDeclarationsMatch(fn, annotation: string): boolean {
        const tree = this.goTsSrcTree(fn.getSourceFile());
        if (tree === undefined) {
            return true;
        }
        const name = fn.name.text;
        const myFile = tree.relativeOf.get(path.resolve(fn.getSourceFile().fileName));
        const myClass = this.goEnclosingClassName(fn);
        const declarationRx = new RegExp('(?<![\\w.$])' + name + '\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*:\\s*([^,)]+)', 'g');
        let matches = true;
        tree.fileText.forEach((text: string, file: string) => {
            if ((file === myFile) || !matches || !this.goTsSrcFileDerivesFrom(tree, file, myClass)) {
                return;
            }
            declarationRx.lastIndex = 0;
            let match;
            while ((match = declarationRx.exec(text)) !== null) {
                if (match[1].replace(/\s+/g, '') !== annotation) {
                    matches = false;
                    return;
                }
            }
        });
        return matches;
    }

    // every call site of the method anywhere in ts/src must pass a literal that prints that slice
    goSliceTableCallSitesPass(fn, methodName: string, index: number, goType: string): boolean {
        if (!this.goParameterCallSitesPassType(fn, index, goType)) {
            return false;
        }
        const tree = this.goTsSrcTree(fn.getSourceFile());
        if (tree === undefined) {
            return true;
        }
        const myFile = tree.relativeOf.get(path.resolve(fn.getSourceFile().fileName));
        const myClass = this.goEnclosingClassName(fn);
        const callRx = new RegExp('\\.\\s*' + methodName + '\\s*\\(', 'g');
        let passes = true;
        tree.fileText.forEach((text: string, file: string) => {
            if ((file === myFile) || !passes || !this.goTsSrcFileDerivesFrom(tree, file, myClass)) {
                return;
            }
            callRx.lastIndex = 0;
            let match;
            while ((match = callRx.exec(text)) !== null) {
                const args = goBalancedSliceArgs(text, match.index + match[0].length - 1);
                if (args === undefined) {
                    passes = false;
                    return;
                }
                const arg = args[index];
                if (arg === undefined) {
                    continue;
                }
                if (process.env.GP13_DEBUG) { require('fs').appendFileSync(process.env.GP13_DEBUG, 'site ' + methodName + ' ' + file + ' arg=' + JSON.stringify((arg ?? '').substring(0, 50)) + ' ok=' + String(this.goTextSliceArgumentMatches(arg, goType, file, tree, match.index)) + '\n'); }
                if (!this.goTextSliceArgumentMatches(arg, goType, file, tree, match.index)) {
                    passes = false;
                    return;
                }
            }
        });
        return passes;
    }

    // the textual proof of a slice argument: an array literal whose elements the sibling file
    // itself proves print as Go strings (a quoted literal, a string producer, or a value it
    // annotates `: string`). Every other shape fails closed.
    goTextSliceArgumentMatches(argText: string, goType: string, file: string, tree, at?: number): boolean {
        let text = (argText ?? '').trim();
        while (text.startsWith('(') && text.endsWith(')')) {
            text = text.substring(1, text.length - 1).trim();
        }
        if ((text.length < 3) || !text.startsWith('[') || !text.endsWith(']')) {
            return false;
        }
        const inner = text.substring(1, text.length - 1).trim();
        if (inner === '') {
            return false;
        }
        const elements = goBalancedSliceArgs('(' + inner + ')', 0);
        if (elements === undefined) {
            return false;
        }
        if (goType === '[]string') {
            return elements.every((element) => this.goTextStringElementMatches(element, file, tree, at));
        }
        if (goType === '[][]string') {
            return elements.every((element) => this.goTextSliceArgumentMatches(element, '[]string', file, tree, at));
        }
        return false;
    }

    goTextStringElementMatches(element: string, file: string, tree, at?: number): boolean {
        let text = (element ?? '').trim();
        while (text.startsWith('(') && text.endsWith(')')) {
            text = text.substring(1, text.length - 1).trim();
        }
        if (/^(?:'[^'\\]*'|"[^"\\]*"|`[^`\\]*`)$/.test(text)) {
            return true;
        }
        if (GO_TS_SRC_SLICE_STRING_PRODUCERS.some((rx) => rx.test(text))) {
            return true;
        }
        const identifier = /^([A-Za-z_$][\w$]*)$/.exec(text);
        if (identifier === null) {
            return false;
        }
        const fileText: string = tree.fileText.get(file) ?? '';
        // the name must be a parameter of the method that makes the call, or a local bound before
        // it: a same-named string elsewhere in the file proves nothing about this argument
        const enclosing = this.goTextEnclosingMethod(fileText, at);
        const parameterIndex = (enclosing === undefined) ? -1
            : enclosing.params.findIndex((text2: string) => new RegExp('^\\s*' + identifier[1] + '\\s*(?::|=|$)').test(text2));
        if (parameterIndex >= 0) {
            const parameter = enclosing.params[parameterIndex];
            // a defaulted parameter with a string-literal initializer prints `var x string = GetArgString(..)`
            if (/=\s*(?:'[^']*'|"[^"]*")/.test(parameter)) {
                return true;
            }
            // a `: string` parameter prints a Go string only where the printer types the method's
            // parameters from the string table; every other async parameter keeps the box
            if (/^\s*[A-Za-z_$][\w$]*\s*:\s*string\s*$/.test(parameter.split('=')[0].trim())) {
                const indexes = Object.prototype.hasOwnProperty.call(this.unifiedStringParams, enclosing.name) ? this.unifiedStringParams[enclosing.name] : undefined;
                return Array.isArray(indexes) && indexes.includes(parameterIndex);
            }
            return false;
        }
        if (at === undefined) {
            return false;
        }
        const declarationRx = new RegExp('(?:const|let|var)\\s+' + identifier[1] + '\\s*(?::[^=]*)?=\\s*([^;\\n]+)', 'g');
        let declaration;
        let match;
        while ((match = declarationRx.exec(fileText)) !== null) {
            if (match.index > at) {
                break;
            }
            declaration = match;
        }
        return (declaration !== undefined) && GO_TS_SRC_SLICE_STRING_PRODUCERS.some((rx) => rx.test(declaration[1].trim()));
    }

    // the method/function the call at `at` sits in: its name and parameter texts, or undefined
    // when the text has no header above it. The slice-element proof reads a name's type from there.
    goTextEnclosingMethod(text: string, at?: number): { name: string, params: string[] } | undefined {
        if ((at === undefined) || (at <= 0)) {
            return undefined;
        }
        const before = text.substring(0, at);
        const headerRx = /(?:^|\n)\s*(?:override\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
        let last;
        let match;
        while ((match = headerRx.exec(before)) !== null) {
            last = match;
        }
        if (last === undefined) {
            return undefined;
        }
        const params = goBalancedSliceArgs(text, last.index + last[0].length - 1);
        if (params === undefined) {
            return undefined;
        }
        return { 'name': last[1], 'params': params };
    }

    // the Go slice type an array literal prints: every element a Go string makes `[]string`, every
    // element itself such a literal makes `[][]string`. A spread, an empty or a mixed literal keeps
    // the box, so the rule never widens a `[]any{...}` that the target slot did not ask for.
    goArrayLiteralSliceType(node, depth = 0): string | undefined {
        if ((node?.kind !== SyntaxKind.ArrayLiteralExpression) || (depth > 2)) {
            return undefined;
        }
        const elements = node.elements ?? [];
        if (elements.length === 0) {
            return undefined;
        }
        let element: string | undefined;
        for (const node2 of elements) {
            if (node2.kind === SyntaxKind.SpreadElement) {
                return undefined;
            }
            const type = (node2.kind === SyntaxKind.ArrayLiteralExpression)
                ? this.goArrayLiteralSliceType(node2, depth + 1)
                : (this.goSliceElementIsString(node2) ? 'string' : undefined);
            if (type === undefined) {
                return undefined;
            }
            if (element === undefined) {
                element = type;
            } else if (element !== type) {
                return undefined;
            }
        }
        if (element === 'string') {
            return '[]string';
        }
        return (element === '[]string') ? '[][]string' : undefined;
    }

    // an element prints as a Go string: a proven string operand, or a defaulted parameter whose
    // initializer is a string literal (the printer binds it with GetArgString, so the body holds
    // a Go string — the same rule the sibling-file proof applies to the text)
    goSliceElementIsString(node): boolean {
        if (this.goOperandStaticType(node, this.printNode(node, 0)) === 'string') {
            return true;
        }
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (decl?.kind !== SyntaxKind.Parameter) {
            return false;
        }
        const initializer = decl.initializer;
        return (initializer?.kind === SyntaxKind.StringLiteral) || (initializer?.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
    }

    // the type a call-site argument is proven to print at a slice parameter slot
    goSliceArgumentType(arg): string | undefined {
        if (arg?.kind === SyntaxKind.ArrayLiteralExpression) {
            return this.goArrayLiteralSliceType(arg);
        }
        const printed = this.goPrintedArgType(arg);
        return ((printed === '[]string') || (printed === '[][]string')) ? printed : undefined;
    }

    // the parameter node a call argument lands in, when the printer can resolve the declaration
    goResolvedCallParameter(node, index: number) {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let declaration;
        try {
            declaration = checker.getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return undefined;
        }
        const fn: any = declaration;
        if ((fn?.kind !== SyntaxKind.MethodDeclaration) && (fn?.kind !== SyntaxKind.FunctionDeclaration)) {
            return undefined;
        }
        return (fn.parameters ?? [])[index];
    }

    // the Go slice type a call argument prints at the given parameter slot: the table names the
    // inherited methods (whose declaration a scoped program may not hold), the resolved parameter
    // names every other method the printer itself types
    goCallSliceArgumentType(node, calleeName: string, index: number): string | undefined {
        const param = this.goResolvedCallParameter(node, index);
        if (param !== undefined) {
            const goType = this.goNativeParameterType(param);
            return (typeof goType === 'string') ? goType : undefined;
        }
        const entry = Object.prototype.hasOwnProperty.call(this.unifiedSliceParams, calleeName) ? this.unifiedSliceParams[calleeName] : undefined;
        return (entry === undefined) ? undefined : entry[index];
    }

    // hx10w9 GP13: print the array literal of a call argument as the Go slice its parameter slot
    // holds, so `[ symbol ]` at a `[]string` slot is `[]string{symbol}` and not a `[]any{...}` box.
    // Returns undefined when no argument is such a literal, leaving every other call to the printer.
    goSliceCallArgs(node, identation): string | undefined {
        const callee: any = node.expression;
        const name = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text : undefined;
        if (typeof name !== 'string') {
            return undefined;
        }
        const args = node.arguments ?? [];
        if ((args.length === 0) || args.some((a) => a.kind === SyntaxKind.SpreadElement)) {
            return undefined;
        }
        let marked = 0;
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if ((arg.kind !== SyntaxKind.ArrayLiteralExpression) || !this.goIsUnifiedSliceParameter(name, i)) {
                continue;
            }
            const goType = this.goCallSliceArgumentType(node, name, i);
            if ((goType === undefined) || (this.goArrayLiteralSliceType(arg) !== goType)) {
                continue;
            }
            this.goSliceLiteralTypes.set(arg, goType);
            marked++;
        }
        if (marked === 0) {
            return undefined;
        }
        const depth = this.goExprDepth + ((args.length > 1) ? 1 : 0);
        return args.map((a) => this.goWithExprDepth(depth, () => this.printNode(a, identation)).trim()).join(', ');
    }

    // the call arguments of a unified method whose parameter prints `string`: an argument the
    // printer cannot prove a Go string goes through StringArg, which panics on any other value
    goUnifiedStringCallArgs(node, identation, flat = false): string | undefined {
        const callee: any = node.expression;
        const name = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text : undefined;
        if ((typeof name !== 'string') || !Object.prototype.hasOwnProperty.call(this.unifiedStringParams, name)) {
            return undefined;
        }
        const args = node.arguments ?? [];
        if (args.some((a) => a.kind === SyntaxKind.SpreadElement)) {
            return undefined;
        }
        const depth = this.goExprDepth + ((args.length > 1) ? 1 : 0);
        return args.map((a, i) => {
            const printed = flat ? this.printNode(a, 0) : this.goWithExprDepth(depth, () => this.printNode(a, identation)).trim();
            if (!this.goIsUnifiedStringParameter(name, i) || (this.goPrintedArgType(a) === 'string')) {
                return printed;
            }
            return `StringArg(${printed})`;
        }).join(', ');
    }

    // `string` for a parameter whose declared TS type is string (or a string-literal union) with no
    // undefined/null member; a nullable one stays boxed here (callers pass *string or nil)
    goRequiredStringParameterType(param): string | undefined {
        const type = this.checkerOrUndefined()?.getTypeAtLocation(param);
        if (type === undefined) {
            return undefined;
        }
        const parts = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes() : [type];
        return parts.every(p => (p.flags & (TypeFlags.String | TypeFlags.StringLiteral)) !== 0) ? 'string' : undefined;
    }

    // A nil test only vetoes the retype for a Go type that cannot hold nil: a map, a []string and a
    // pointer all compare `x == nil` exactly as IsEqual(x, nil) does (derefScalar), so a nil-tested
    // parameter of those types still types. `[]any` stays vetoed: its element read prints the
    // guarded DerefScalar closure, a helper rise.
    goParameterKeepsNilCompareNative(body, param, goType: string): boolean {
        if (goType.startsWith('*') || goType.startsWith('map[') || (goType === '[]string')) {
            return true;
        }
        const name = param.name.text;
        let keeps = true;
        const visit = (n) => {
            if (!keeps) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name)) {
                let symbol;
                try {
                    symbol = this.getChecker().getSymbolAtLocation(n);
                } catch (e) {
                    symbol = undefined;
                }
                const binary: any = n.parent;
                if ((symbol?.valueDeclaration?.resolve() === param) && (binary?.kind === SyntaxKind.BinaryExpression)
                    && ((binary.left === n) || (binary.right === n))) {
                    const op = binary.operatorToken?.kind;
                    if ((op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken)
                        || (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken)) {
                        const other: any = (binary.left === n) ? binary.right : binary.left;
                        if ((other?.kind === SyntaxKind.NullKeyword)
                            || ((other?.kind === SyntaxKind.Identifier) && (other.text === 'undefined'))) {
                            keeps = false;
                            return;
                        }
                    }
                }
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return keeps;
    }

    // hx10 GP12: the ws frame parameter of `override handleMessage (client, message: Dict)`. The
    // printer types it `map[string]any` under the D-03 body proofs; the Go ws dispatch asserts the
    // decoded object once, so a text or array frame never reaches an object-framed body.
    goWsFrameParameterType(fn, param): string | undefined {
        if ((fn.name?.text !== 'handleMessage') || (fn.parameters.indexOf(param) !== 1)
            || (param.name?.kind !== SyntaxKind.Identifier) || (fn.body === undefined)) {
            return undefined;
        }
        if (!((fn.modifiers ?? []).some(m => m.kind === SyntaxKind.OverrideKeyword))) {
            return undefined; // only a venue override answers the ws dispatch
        }
        const venue = this.goEnclosingClassName(fn);
        if ((venue !== undefined) && GO_ANY_FRAMED_VENUES.has(venue.toLowerCase())) {
            return undefined; // array/text frames: one frame type cannot serve every venue
        }
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(param);
        if (type === undefined) {
            return undefined;
        }
        let parts = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes().slice() : [type];
        parts = parts.filter(p => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        if ((parts.length !== 1) || !this.goParameterTypeIsDict(parts[0])) {
            return undefined;
        }
        if (!this.goWsFrameReadsStayNative(fn.body, param)) {
            return undefined; // an `in` read outside an if condition would print a closure body
        }
        return (this.goLocalIsSafeToType(fn.body, param, param.name.text, 'map[string]any')
            && this.goParameterKeepsNilCompareNative(fn.body, param, 'map[string]any')) ? 'map[string]any' : undefined;
    }

    // true when every `key in <frame>` of the body prints native. Only an `if` condition holding
    // exactly one map read gets the init clause (hx10w5-G14); any other position prints the
    // printer's `func() bool { … }()` closure, an inlined blob, so such a body keeps the box.
    goWsFrameReadsStayNative(body, param): boolean {
        let native = true;
        const visit = (n) => {
            if (!native) {
                return;
            }
            if ((n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken?.kind === SyntaxKind.InKeyword)) {
                const dict = this.goUnwrapParenthesizedNode(n.right);
                if ((dict?.kind === SyntaxKind.Identifier) && (dict.text === param.name.text)
                    && (this.goAnyBoxLocalDeclaration(dict) === param)
                    && !this.goWsFrameInOpHasInitClause(n, param)) {
                    native = false;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return native;
    }

    // the `in` node sits in an `if` condition that holds exactly one identifier map read, so
    // printCondition prints `if _, ok := m[k]; …` and no closure
    goWsFrameInOpHasInitClause(inNode, param): boolean {
        let child: any = inNode;
        let parent: any = inNode.parent;
        while (parent !== undefined) {
            if (parent.kind === SyntaxKind.IfStatement) {
                if ((parent.expression !== child) || (parent.expression === undefined)) {
                    return false;
                }
                let reads = 0;
                const count = (n) => {
                    if ((n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken?.kind === SyntaxKind.InKeyword)
                        && (this.goUnwrapParenthesizedNode(n.right)?.kind === SyntaxKind.Identifier)) {
                        reads += 1;
                    }
                    n.forEachChild(count);
                };
                count (parent.expression);
                return reads === 1;
            }
            if ((parent.kind === SyntaxKind.ParenthesizedExpression)
                || (parent.kind === SyntaxKind.PrefixUnaryExpression)
                || (parent.kind === SyntaxKind.AsExpression)
                || (parent.kind === SyntaxKind.NonNullExpression)
                || ((parent.kind === SyntaxKind.BinaryExpression) && this.goWsFrameBooleanOperator(parent.operatorToken))) {
                child = parent;
                parent = parent.parent;
                continue;
            }
            return false;
        }
        return false;
    }

    // an operator whose print keeps the operand a Go bool inside the same condition text
    goWsFrameBooleanOperator(operator): boolean {
        const kind = operator?.kind;
        return (kind === SyntaxKind.AmpersandAmpersandToken) || (kind === SyntaxKind.BarBarToken)
            || (kind === SyntaxKind.EqualsEqualsToken) || (kind === SyntaxKind.EqualsEqualsEqualsToken)
            || (kind === SyntaxKind.ExclamationEqualsToken) || (kind === SyntaxKind.ExclamationEqualsEqualsToken);
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
        const name = fn.name.text;
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
        const type = checker?.getTypeAtLocation(param);
        if (type === undefined) {
            return [];
        }
        // a plain `boolean` is the checker's true|false union: the bit is set on the type itself
        if ((type.flags & TypeFlags.Boolean) !== 0) {
            return isHandler ? [] : ['bool'];
        }
        let parts = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes().slice() : [type];
        parts = parts.filter(p => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        // `Bool` is `boolean | undefined`: the union splits into the two boolean literals
        if ((parts.length > 0) && parts.every(p => (p.flags & (TypeFlags.BooleanLiteral)) !== 0)) {
            return isHandler ? [] : ['bool'];
        }
        if (parts.length !== 1) {
            return [];
        }
        const inner: any = parts[0];
        if (inner.flags & TypeFlags.String) {
            // hx10 GP15: a pro `handle*` method's string parameter is not its frame (a frame is
            // the Dict/text slot). A nullable pointer is only safe there when the body nil-tests
            // it: a non-nilable declaration derefs in the body, so an absent frame value would
            // panic where the boxed helper printed a nil string.
            const body = param?.parent?.body;
            const nilAware = (body !== undefined) && !this.goParameterKeepsNilCompareNative(body, param, 'string');
            return (isHandler && !nilAware) ? [] : ['*string'];
        }
        // `Int`/`Num`/`number` params: the pointer twin the GetArg bound form already uses, or
        // the plain value type its callers pass (g13's table decides by the declared annotation)
        const numeric = this.g13NumericParameterCandidates(param);
        if (numeric.length > 0) {
            return numeric;
        }
        if (isHandler && this.goParameterTypeIsDict(inner)) {
            return ['map[string]any'];
        }
        if (!(inner.flags & TypeFlags.Object)) {
            return [];
        }
        if (checker.isArrayType(inner)) {
            // List / any[]: the element must itself be `any`, or the Go slice would need
            // the narrower element type (`string[]` is a []string the printer does not build)
            const element = checker.getIndexTypeOfType(inner, IndexKind.Number);
            return ((element !== undefined) && (element.flags & (TypeFlags.Any | TypeFlags.Unknown))) ? ['[]any'] : [];
        }
        // Dict / Market / Currency / a structure interface: a plain Go dictionary, never a
        // class instance or a function (goTypeIsNilComparableObject is the printer's own
        // test for exactly those types, used for the boxed nil test above)
        return this.goTypeIsNilComparableObject(inner) ? ['map[string]any'] : [];
    }

    // true when the method overrides (or shadows) a member of the class it extends, or carries an
    // explicit `override`: those print the base signature so the generated base classes and
    // IDerivedExchange keep compiling. The abstract base (ts/src/base/**) is never retyped.
    goMethodKeepsBaseSignature(fn): boolean {
        if ((fn.modifiers ?? []).some(m => m.kind === SyntaxKind.OverrideKeyword)) {
            return true;
        }
        if (/(^|\/)ts\/src\/base\//.test(fn.getSourceFile().fileName)) {
            return true;
        }
        const name = fn.name.text;
        const cls = this.goEnclosingClass(fn);
        if (cls === undefined) {
            return true;
        }
        const extendsClauses = (cls.heritageClauses ?? []).filter(clause => clause.token === SyntaxKind.ExtendsKeyword);
        if (extendsClauses.length === 0) {
            return true; // a root class: the abstract base of the generated tree
        }
        for (const clause of extendsClauses) {
            for (const expr of (clause.types ?? [])) {
                const checker: any = this.checkerOrUndefined();
                const baseType = checker.getTypeAtLocation(expr);
                if (baseType?.getProperty?.(name) !== undefined) {
                    return true;
                }
            }
        }
        return false;
    }

    goHasTreeCallSite(fn): boolean {
        const name = fn.name.text;
        if (this.goSameFileCallsOf(fn, name).length > 0) {
            return true;
        }
        const tree = this.goTsSrcTree(fn.getSourceFile());
        const myClass = this.goEnclosingClassName(fn);
        return (tree?.callIndex.get(name) ?? []).some(site => this.goTsSrcFileDerivesFrom(tree, site.file, myClass));
    }

    // every call site of `fn` in the whole tree must pass exactly `goType` at `index`
    goParameterCallSitesPassType(fn, index: number, goType: string): boolean {
        const name = fn.name.text;
        for (const call of this.goSameFileCallsOf(fn, name)) {
            const arg = call.arguments?.[index];
            if ((arg === undefined) || (arg.kind === SyntaxKind.SpreadElement)) {
                return false;
            }
            // hx10w9 GP13: at a table slot an array literal is the slice its own elements prove,
            // not the `[]any` box the default print opens. Every other parameter keeps the
            // printer's own argument type, so no existing `[]any` slot changes shape.
            const tableSlot = ((goType === '[]string') || (goType === '[][]string')) && this.goIsUnifiedSliceParameter(name, index);
            const argType = tableSlot ? this.goSliceArgumentType(arg) : this.goPrintedArgType(arg);
            if ((argType !== goType)
                && !((goType === 'string') && this.gp15NilProvenStringPtrArg(arg))) {
                return false;
            }
        }
        const tree = this.goTsSrcTree(fn.getSourceFile());
        if (tree !== undefined) {
            const myClass = this.goEnclosingClassName(fn);
            const myFile = tree.relativeOf.get(path.resolve(fn.getSourceFile().fileName));
            for (const site of (tree.callIndex.get(name) ?? [])) {
                if (site.file === myFile) {
                    continue; // proven above off the checker
                }
                if (!this.goTsSrcFileDerivesFrom(tree, site.file, myClass)) {
                    continue; // a same-named method of another exchange
                }
                let arg = site.args[index];
                // hx10w9 GP13: the tree's splitter ignores brackets, so a nested array literal
                // reads as several arguments; re-split the call for a slice slot
                if (((goType === '[]string') || (goType === '[][]string')) && (site.at !== undefined)) {
                    const callArgs = goBalancedSliceArgs(tree.fileText.get(site.file) ?? '', site.at);
                    if (callArgs !== undefined) {
                        arg = callArgs[index];
                    }
                }
                // hx11 RF-go-7: a callee the build names takes a sibling-file passthrough of a unified-string parameter
                const passthrough = (goType === 'string') && (this.siblingStringPassthroughPattern !== undefined) && this.siblingStringPassthroughPattern.test(name)
                    && (arg !== undefined) && this.goSiblingPassesUnifiedString(arg, tree.fileText.get(site.file) ?? '', site.at);
                if ((arg === undefined) || !(this.goTextArgMatchesType(arg, goType, site.file, tree, site.at) || passthrough)) {
                    return false;
                }
            }
        }
        return true;
    }

    // RF-go-3: a required `boolean` parameter of an exchange-local async method is a Go `bool` when every
    // call site provably passes one (same-file sites by syntax: a true/false literal or an unwritten
    // defaulted boolean parameter; sibling files only as a true/false literal) and the body neither
    // writes another type nor nil-tests it. No printer re-entry, so no parameter-type cache is touched.
    goAsyncBooleanParameterType(fn, param, index: number): string | undefined {
        if ((param.type?.kind !== SyntaxKind.BooleanKeyword) || !this.isAsyncFunction(fn) || fn.name.text.startsWith('parse')
            || this.goIsProHandlerMethod(fn) || !this.goHasTreeCallSite(fn)) {
            return undefined;
        }
        return (this.goCallSitesPassBooleanLiteral(fn, index) && this.goLocalIsSafeToType(fn.body, param, param.name.text, 'bool')
            && this.goParameterKeepsNilCompareNative(fn.body, param, 'bool')) ? 'bool' : undefined;
    }

    goCallSitesPassBooleanLiteral(fn, index: number): boolean {
        const checker: any = this.checkerOrUndefined();
        const name = fn.name.text;
        for (const call of this.goSameFileCallsOf(fn, name)) {
            const arg = call.arguments?.[index];
            if ((arg === undefined) || !this.goArgumentIsSyntacticBool(arg, checker)) {
                return false;
            }
        }
        const tree = this.goTsSrcTree(fn.getSourceFile());
        if (tree === undefined) {
            return true;
        }
        const myClass = this.goEnclosingClassName(fn);
        const myFile = tree.relativeOf.get(path.resolve(fn.getSourceFile().fileName));
        for (const site of (tree.callIndex.get(name) ?? [])) {
            if ((site.file === myFile) || !this.goTsSrcFileDerivesFrom(tree, site.file, myClass)) {
                continue;
            }
            if (!/^\(*\s*(?:true|false)\s*\)*$/.test(site.args[index] ?? '')) {
                return false;
            }
        }
        return true;
    }

    // a Go bool by syntax alone: a true/false literal, or a defaulted boolean parameter that is never reassigned
    goArgumentIsSyntacticBool(arg, checker): boolean {
        if ((arg.kind === SyntaxKind.TrueKeyword) || (arg.kind === SyntaxKind.FalseKeyword)) {
            return true;
        }
        if (arg.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const decl: any = checker?.getSymbolAtLocation(arg)?.valueDeclaration?.resolve();
        if ((decl?.kind !== SyntaxKind.Parameter) || (decl.type?.kind !== SyntaxKind.BooleanKeyword)
            || ((decl.initializer?.kind !== SyntaxKind.TrueKeyword) && (decl.initializer?.kind !== SyntaxKind.FalseKeyword))) {
            return false;
        }
        let written = false;
        const visit = (n: any) => {
            const p: any = n.parent;
            if ((n.kind === SyntaxKind.Identifier) && (n.text === decl.name.text) && (p?.kind === SyntaxKind.BinaryExpression) && (p.left === n)
                && (p.operatorToken.kind >= SyntaxKind.FirstAssignment) && (p.operatorToken.kind <= SyntaxKind.LastAssignment)) {
                written = true;
            }
            n.forEachChild(visit);
        };
        decl.parent.body?.forEachChild(visit);
        return !written;
    }

    goEnclosingClass(fn) {
        let cls = fn.parent;
        while ((cls !== undefined) && (cls.kind !== SyntaxKind.ClassDeclaration) && (cls.kind !== SyntaxKind.ClassExpression)) {
            cls = cls.parent;
        }
        return cls;
    }

    goEnclosingClassName(fn): string | undefined {
        const cls = this.goEnclosingClass(fn);
        return (cls?.name?.kind === SyntaxKind.Identifier) ? cls.name.text : undefined;
    }

    goIsPrivateKeyField(arg): boolean {
        return (arg?.kind === SyntaxKind.PropertyAccessExpression) && (arg.expression?.kind === SyntaxKind.ThisKeyword)
            && (arg.name?.text === 'privateKey');
    }

    // the printed Go type of a call-site argument, or undefined when the printer
    // cannot name it (then the call site does not prove anything)
    goPrintedArgType(arg): string | undefined {
        if (arg.kind === SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(arg) ?? this.goBoundIdentifierType(arg);
        }
        if (this.goIsClientUrl(arg)) {
            return 'string'; // Client.url prints the string GetUrl()
        }
        if (this.goIsPrivateKeyField(arg)) {
            return 'string'; // go/v4/exchange.go declares PrivateKey `string`
        }
        return this.goTypeOfInitializer(arg, this.printNode(arg, 0));
    }

    // hx11 RF-go-7: `<param>.url` of a `<param>: Client` parameter
    goIsClientUrl(arg): boolean {
        if ((arg?.kind !== SyntaxKind.PropertyAccessExpression) || (arg.name?.text !== 'url') || (arg.expression?.kind !== SyntaxKind.Identifier)) {
            return false;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(arg.expression)?.valueDeclaration?.resolve?.();
        return (decl?.kind === SyntaxKind.Parameter) && (decl.type?.getText() === 'Client');
    }

    // hx11 RF-go-7: the Go type an identifier is bound to when its declaration is not a typed local: a defaulted
    // `x: string = 'lit'` parameter is bound by GetArgString (a Go string at every consumer), and slot 0 of
    // `const [ x, y ] = this.<stringPointerTupleCall> (...)` is the *string tuple result
    goBoundIdentifierType(arg): string | undefined {
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(arg)?.valueDeclaration?.resolve?.();
        if (decl?.kind === SyntaxKind.Parameter) {
            return (this.goGetArgParameterType(decl) === 'string') ? 'string' : undefined;
        }
        const isSlot0 = (decl?.kind === SyntaxKind.BindingElement) && (decl.parent?.kind === SyntaxKind.ArrayBindingPattern) && (decl.parent.elements[0] === decl);
        const holder = isSlot0 ? decl.parent.parent : undefined;
        const init = holder?.initializer;
        const constant = ((holder?.parent?.flags ?? 0) & NodeFlags.Const) !== 0;
        return (constant && (init?.kind === SyntaxKind.CallExpression) && this.stringPointerTupleCalls.includes(init.expression?.name?.text)) ? '*string' : undefined;
    }

    // hx11 RF-go-7: a required `string` parameter of a table-listed exchange-local method that no ts/src file calls
    goUncalledStringParameterType(param): string | undefined {
        const fn: any = param?.parent;
        if ((fn?.kind !== SyntaxKind.MethodDeclaration) || (fn.name?.kind !== SyntaxKind.Identifier) || (param.initializer !== undefined)
            || (param.dotDotDotToken !== undefined) || (param.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        const key = `${this.goEnclosingClassName(fn)}.${fn.name.text}`;
        const indexes = Object.prototype.hasOwnProperty.call(this.uncalledStringParams, key) ? this.uncalledStringParams[key] : undefined;
        if (!Array.isArray(indexes) || !indexes.includes(fn.parameters.indexOf(param)) || (this.goRequiredStringParameterType(param) !== 'string')
            || this.goHasTreeCallSite(fn) || (this.goTsSrcTree(fn.getSourceFile())?.callIndex.get(fn.name.text) ?? []).length > 0) {
            return undefined;
        }
        return (this.goLocalIsSafeToType(fn.body, param, param.name.text, 'string')
            && this.goParameterKeepsNilCompareNative(fn.body, param, 'string')) ? 'string' : undefined;
    }

    // hx11 RF-go-7: a sibling-file call site that hands over a parameter of its enclosing method straight through is a
    // Go `string` when that method's slot is in the unified string table (the base, every override and the
    // interface print `string` there) and the method never reassigns the parameter
    goSiblingPassesUnifiedString(argText: string, fileText: string, at: number | undefined): boolean {
        const name = /^([A-Za-z_$][\w$]*)$/.exec((argText ?? '').trim())?.[1];
        if ((name === undefined) || (at === undefined)) {
            return false;
        }
        const head = fileText.substring(0, at);
        const signature = /\n {4}(?:(?:override|async|public|private|protected) )*([A-Za-z_$][\w$]*) \(([^\n]*)\)(?:: [^\n{]*)? \{/g;
        let last: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = signature.exec(head)) !== null) {
            last = m;
        }
        if (last === null) {
            return false;
        }
        const indexes = Object.prototype.hasOwnProperty.call(this.unifiedStringParams, last[1]) ? this.unifiedStringParams[last[1]] : undefined;
        if (indexes === undefined) {
            return false;
        }
        const params: string[] = [];
        let depth = 0;
        let cur = '';
        for (const c of last[2]) {
            if ('([{<'.includes(c)) { depth++; } else if (')]}>'.includes(c)) { depth--; }
            if ((c === ',') && (depth === 0)) { params.push(cur.trim()); cur = ''; } else { cur += c; }
        }
        params.push(cur.trim());
        const escaped = name.replace(/\$/g, '\\$');
        const index = params.findIndex((p) => new RegExp('^' + escaped + ':').test(p));
        if ((index < 0) || !indexes.includes(index) || /=/.test(params[index]) || /[?]/.test(params[index].split(':')[0])) {
            return false;
        }
        const body = head.substring(last.index + last[0].length);
        return !new RegExp('(?<![\\w.$])' + escaped + '\\s*(?:[-+*/]?=(?!=)|\\+\\+|--)').test(body);
    }

    // hx10 GP15: a `*string` argument the source itself proves non-nil at the call site — a
    // dominating nil guard, or a Safe* accessor handed a literal default. A cast (`x as string`,
    // `x!`) is not a proof of the absent state, so it reads through to the value underneath.
    gp15NilProvenStringPtrArg(arg): boolean {
        if (this.goPrintedArgType(arg) !== '*string') {
            return false;
        }
        const node = this.goUnwrapPrintedAssertions(arg);
        if (node?.kind === SyntaxKind.Identifier) {
            return this.goHasEnclosingNilGuard(node) || this.gp15HasExitingNilGuard(node) || this.goNilProvenStringDeref(node);
        }
        if (node?.kind === SyntaxKind.CallExpression) {
            return this.gp15SafeStringLiteralDefaultCall(node);
        }
        return false;
    }

    // `this.safeString<FamilyN?>(dict, key, '<literal>')`: the accessor answers a pointer to the
    // default on the absent path, so the pointee exists whatever the dictionary holds
    gp15SafeStringLiteralDefaultCall(call): boolean {
        const callee: any = call?.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression) {
            return false;
        }
        const name = String(callee.name?.text ?? '');
        if (!/^safeString(?:Lower|Upper)?(?:[2N])?$/.test(name)) {
            return false;
        }
        const args = call.arguments ?? [];
        if ((args.length < 3) || args.some((a) => a.kind === SyntaxKind.SpreadElement)) {
            return false;
        }
        const last: any = args[args.length - 1];
        return (last?.kind === SyntaxKind.StringLiteral) || (last?.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
    }

    // `if (x === undefined) { return/throw/continue/break }` earlier in the same statement list:
    // the flow past that point cannot hold a nil, so a pointer read there is the string
    gp15HasExitingNilGuard(ident): boolean {
        const name = String(ident?.text ?? '');
        const scope = this.goEnclosingFunction(ident);
        if ((name === '') || (scope === undefined) || this.goLocalIsRebound(scope, ident)) {
            return false;
        }
        let child: any = ident;
        let parent: any = ident.parent;
        while ((parent !== undefined) && !isFunctionLike(parent)) {
            if (parent.kind === SyntaxKind.Block) {
                const statements: any[] = parent.statements ?? [];
                const at = statements.indexOf(child);
                if (at < 0) {
                    return false;
                }
                for (let i = at - 1; i >= 0; i--) {
                    if (this.gp15StatementExitsOnNil(statements[i], ident)) {
                        return true;
                    }
                }
            }
            child = parent;
            parent = parent.parent;
        }
        return false;
    }

    gp15StatementExitsOnNil(statement, ident): boolean {
        if ((statement?.kind !== SyntaxKind.IfStatement) || (statement.elseStatement !== undefined)) {
            return false;
        }
        const condition: any = this.goUnwrapParenthesizedNode(statement.expression);
        if (!this.gp15IsNilTestOf(condition, ident)) {
            return false;
        }
        const then: any = statement.thenStatement;
        const body: any[] = (then?.kind === SyntaxKind.Block) ? (then.statements ?? []) : [ then ];
        const last: any = body[body.length - 1];
        return [ SyntaxKind.ReturnStatement, SyntaxKind.ThrowStatement, SyntaxKind.ContinueStatement,
            SyntaxKind.BreakStatement ].includes(last?.kind);
    }

    // the mirror of goIsNonNilTestOf: `x == null`, `x === undefined`, `!x`
    gp15IsNilTestOf(node, ident): boolean {
        if (node?.kind === SyntaxKind.PrefixUnaryExpression) {
            return (node.operator === SyntaxKind.ExclamationToken) && (node.operand?.kind === SyntaxKind.Identifier)
                && this.goIdentifierRefersTo(node.operand, ident);
        }
        if (node?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = node.operatorToken?.kind;
        if ((op !== SyntaxKind.EqualsEqualsToken) && (op !== SyntaxKind.EqualsEqualsEqualsToken)) {
            return false;
        }
        const isNil = (side: any) => (side?.kind === SyntaxKind.NullKeyword)
            || ((side?.kind === SyntaxKind.Identifier) && (side.text === 'undefined'));
        const isName = (side: any) => (side?.kind === SyntaxKind.Identifier) && this.goIdentifierRefersTo(side, ident);
        return (isName(node.left) && isNil(node.right)) || (isNil(node.left) && isName(node.right));
    }

    // both identifiers resolve to the same declaration (a shadowed name is a different value)
    goIdentifierRefersTo(node, other): boolean {
        try {
            const checker: any = this.getChecker();
            const a = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve?.();
            const b = checker.getSymbolAtLocation(other)?.valueDeclaration?.resolve?.();
            return (a !== undefined) && (a === b);
        } catch (e) {
            return false;
        }
    }

    // every `this.<name>(...)` of this file whose resolved signature is `fn`
    goSameFileCallsOf(fn, name: string): Array<any> {
        const file = fn.getSourceFile();
        let index = this.goSameFileCallCache.get(file);
        if (index === undefined) {
            index = new Map<string, Array<any>>();
            const visit = (node) => {
                if (node.kind === SyntaxKind.CallExpression) {
                    const callee: any = node.expression;
                    const calleeName = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text : undefined;
                    if (typeof calleeName === 'string') {
                        const list = index.get(calleeName) ?? [];
                        list.push(node);
                        index.set(calleeName, list);
                    }
                }
                node.forEachChild(visit);
            };
            visit(file);
            this.goSameFileCallCache.set(file, index);
        }
        const checker = this.getChecker();
        const result = [];
        for (const call of (index.get(name) ?? [])) {
            let declaration;
            try {
                declaration = checker.getResolvedSignature(call)?.declaration?.resolve();
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
        // drivers pass relative names (`ts/src/x.ts`): resolve so the marker and relativeOf match
        const fileName: string = path.resolve(file.fileName);
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
                    list.push({ file: relPath, args, at: callRe.lastIndex - 1 });
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
    goTextArgMatchesType(argText: string, goType: string, file: string, tree, at?: number): boolean {
        let text = (argText ?? '').trim();
        while (text.startsWith('(') && text.endsWith(')')) {
            text = text.substring(1, text.length - 1).trim();
        }
        // hx10w9 GP13: a slice slot is proven by the literal rule alone (the sibling file's own
        // element proofs), never by the `[]any` text the default print would give it
        if ((goType === '[]string') || (goType === '[][]string')) {
            return this.goTextSliceArgumentMatches(text, goType, file, tree, at);
        }
        const isStringProducer = (candidate: string) => GO_TS_SRC_STRING_PRODUCERS.some(rx => rx.test(candidate));
        const localDeclaredFrom = (name: string, accept: (init: string) => boolean) => {
            const fileText = tree.fileText.get(file) ?? '';
            const declRe = new RegExp('(?:const|let|var)\\s+' + name + '\\s*(?::[^=]*)?=\\s*([^;\\n]+)');
            const match = declRe.exec(fileText);
            return (match !== null) && accept(match[1].trim());
        };
        if (goType === 'string') {
            return /^(?:'[^'\\]*'|"[^"\\]*"|this\.privateKey)$/.test(text); // a sibling file proves a plain literal or the string field
        }
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
            // matching literal and the printer's own map producers. hx10 G02: an identifier
            // is proven by the declaration that binds it at that sibling call site
            const isMap = goType === 'map[string]any';
            const literal = isMap ? '{' : '[';
            const producers = isMap ? GO_TS_SRC_MAP_PRODUCERS : [];
            if (text.startsWith(literal) || producers.some(rx => rx.test(text))) {
                return true;
            }
            const identifier = /^([A-Za-z_$][\w$]*)$/.exec(text);
            if (!isMap || (identifier === null) || (at === undefined)) {
                return false;
            }
            // hx10 G02: the row argument must be the map the sibling file declares it as
            const siblingText = tree.fileText.get(file) ?? '';
            const declRe = new RegExp('(?:const|let|var)\\s+' + identifier[1] + '\\s*(?::[^=]*)?=\\s*([^;\\n]+)', 'g');
            let decl;
            let declMatch;
            while ((declMatch = declRe.exec(siblingText)) !== null) {
                if (declMatch.index > at) {
                    break;
                }
                decl = declMatch;
            }
            if ((decl === undefined) || !/^this\s*\.\s*market\s*\(/.test(decl[1].trim())) {
                return false;
            }
            const tail = siblingText.substring(decl.index + decl[0].length, at);
            // the call site must sit in the same method body: a 4-space closing brace
            // between them means the declaration belongs to another method
            if (/^    \}/m.test(tail)) {
                return false;
            }
            return !new RegExp('(?<![\\w.$])' + identifier[1] + '\\s*=(?!=)').test(tail);
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
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (decl === undefined) {
            return undefined;
        }
        if (decl.kind === SyntaxKind.Parameter) {
            // a defaulted parameter bound through a pointer GetArg twin is that pointer at every consumer
            const bound = this.goGetArgParameterType(decl);
            if ((bound !== undefined) && bound.startsWith('*')) {
                return bound;
            }
            // B-02: a parameter the call-site proof typed prints its native Go type
            return this.goNativeParameterType(decl);
        }
        if (decl.kind === SyntaxKind.BindingElement) {
            return this.goRf6fTupleSlotPointerType(decl); // RF-go-6-F
        }
        if (decl.kind !== SyntaxKind.VariableDeclaration || decl.name?.kind !== SyntaxKind.Identifier) {
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
            // a `let x: Dict;` declaration has no initializer and prints `= nil`
            const printed = (decl.initializer === undefined) ? this.UNDEFINED_TOKEN : this.printNode(decl.initializer, 0);
            goType = this.getGoLocalType(decl, printed);
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
        if (node?.kind === SyntaxKind.PropertyAccessExpression) {
            const fieldType = GO_NILABLE_FIELDS_Typed[printedText];
            if ((typeof fieldType === 'string') && GO_NIL_EQUIVALENT_POINTER_TYPES_Native.has(fieldType)) {
                return fieldType;
            }
        }
        if (node?.kind === SyntaxKind.CallExpression) {
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
        if (node?.kind === SyntaxKind.CallExpression) {
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
        if ((node?.kind !== SyntaxKind.PropertyAccessExpression) || (node.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = node.name?.text;
        if (typeof name !== 'string') {
            return undefined;
        }
        return GO_FIELD_CONTAINER_TYPES_NATIVE[this.transformPropertyAccessExpressionName(name, node.name)];
    }

    // the printed key is a Go string when the printer knows it: a string literal, or
    // an identifier declared `string`. Params, GetValue(...) and string concatenation
    // all print as `any`, which Go refuses as a map key.
    // the stored value can be a typed pointer: a pointer-printing expression, or an `any` local that can hold one
    goValueMayHoldPointer(valueNode): boolean {
        const inner = this.goUnwrapParenthesizedNode(valueNode);
        if (this.goWritePrintsPointerBox(inner)) {
            return true;
        }
        return (inner?.kind === SyntaxKind.Identifier) && (this.goDeclaredTypeOfIdentifier(inner) === 'any')
            && this.goAnyLocalHoldsPointer(this.goDeclarationOfIdentifier(inner));
    }

    goIsPlainValuedMapField(node): boolean {
        return (this.goFieldContainerTypeNative(node) === 'map[string]any')
            && GO_PLAIN_VALUED_MAP_FIELDS.includes(this.transformPropertyAccessExpressionName(node.name.text, node.name));
    }

    // ---- RFM-G4 G09 (hx10w3 G09 folded): PredictionExchange caches are typed maps ----------------------------
    // go/v4/exchange_prediction.go declares Outcomes / Outcomes_by_id / Events / Events_by_slug `map[string]any`
    // (the struct field table in build/goTranspiler.ts, handed over as `predictionMapFields`), so a `this.<f>` the
    // checker resolves to the PredictionExchange property of one of those names is a typed map, never the `any`
    // box a BaseExchange field is. The rules below read that type; none looks at printed text.
    goG09CacheField(node): boolean {
        if ((node?.kind !== SyntaxKind.PropertyAccessExpression) || (node.expression?.kind !== SyntaxKind.ThisKeyword)
            || (typeof node.name?.text !== 'string')) {
            return false;
        }
        if (!this.predictionMapFields.has(this.transformPropertyAccessExpressionName(node.name.text, node.name))) {
            return false;
        }
        let declaration: any;
        try {
            declaration = this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        } catch (e) {
            return false;
        }
        return (declaration?.kind === SyntaxKind.PropertyDeclaration) && (declaration.parent?.kind === SyntaxKind.ClassDeclaration)
            && ((declaration.parent.name?.escapedText ?? declaration.parent.name?.text) === 'PredictionExchange');
    }

    // `this.f === undefined|null` / `!==`: the field's nil test is the map header (a nil map is the absent cache)
    goG09CacheNilCompare(left, right, leftText: string, rightText: string, isEq: boolean, lFam, rFam): string | undefined {
        const field = ((rFam === 'nil') && this.goG09CacheField(left) && !leftText.includes('\n')) ? leftText
            : (((lFam === 'nil') && this.goG09CacheField(right) && !rightText.includes('\n')) ? rightText : undefined);
        if (field === undefined) {
            return undefined;
        }
        const text = `${field} ${isEq ? '==' : '!='} nil`;
        // `==`/`!=` bind tighter than `&&`/`||`: an operand of one needs no parentheses of its own
        const parent: any = (left?.parent ?? right?.parent)?.parent;   // the `==` node's own parent
        const bare = (parent?.kind === SyntaxKind.BinaryExpression)
            && ((parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken) || (parent.operatorToken.kind === SyntaxKind.BarBarToken));
        return bare ? text : `(${text})`;
    }

    // a key the map index takes as is: a Go string (literal / `string` local / string-returning call), or an element
    // of a `[]string` local read at a counter its own `for (let i = 0; i < xs.length; i++)` bounds to that slice
    goG09CacheKeyText(keyNode, keyStr: string): string | undefined {
        if (this.goKeyIsString(keyNode, keyStr)) {
            return keyStr;
        }
        if ((keyNode?.kind !== SyntaxKind.ElementAccessExpression) || (keyNode.expression?.kind !== SyntaxKind.Identifier)
            || (keyNode.argumentExpression?.kind !== SyntaxKind.Identifier)
            || (this.goDeclaredTypeOfIdentifier(keyNode.expression) !== '[]string')
            || !this.goG09IndexBoundedBy(keyNode.argumentExpression, keyNode.expression, keyNode)) {
            return undefined;
        }
        return `${this.printNode(keyNode.expression, 0)}[${this.printNode(keyNode.argumentExpression, 0)}]`;
    }

    // `index` is the counter of the enclosing `for (let i = 0; i < list.length; i++)` that contains `use`; nothing in the
    // loop rebinds it or the list, and the list is only ever read (its length cannot shrink below the bound)
    goG09IndexBoundedBy(index, list, use): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const indexSymbol = checker.getSymbolAtLocation(index);
        const listSymbol = checker.getSymbolAtLocation(list);
        const indexDecl: any = indexSymbol?.valueDeclaration?.resolve();
        const loop: any = indexDecl?.parent?.parent;
        if ((indexDecl?.kind !== SyntaxKind.VariableDeclaration) || (indexDecl.initializer?.kind !== SyntaxKind.NumericLiteral)
            || (indexDecl.initializer.text !== '0') || (loop?.kind !== SyntaxKind.ForStatement) || (loop.initializer !== indexDecl.parent)) {
            return false;
        }
        const condition: any = this.goUnwrapParenthesizedNode(loop.condition);
        const bound: any = condition?.right;
        if ((condition?.kind !== SyntaxKind.BinaryExpression) || (condition.operatorToken?.kind !== SyntaxKind.LessThanToken)
            || (condition.left?.kind !== SyntaxKind.Identifier) || (checker.getSymbolAtLocation(condition.left) !== indexSymbol)
            || (bound?.kind !== SyntaxKind.PropertyAccessExpression) || (bound.name?.text !== 'length')
            || (bound.expression?.kind !== SyntaxKind.Identifier) || (checker.getSymbolAtLocation(bound.expression) !== listSymbol)) {
            return false;
        }
        const step: any = loop.incrementor;
        if (!(((step?.kind === SyntaxKind.PostfixUnaryExpression) || (step?.kind === SyntaxKind.PrefixUnaryExpression))
            && (step.operator === SyntaxKind.PlusPlusToken) && (step.operand?.kind === SyntaxKind.Identifier)
            && (checker.getSymbolAtLocation(step.operand) === indexSymbol))) {
            return false;
        }
        for (let at: any = use; at !== undefined; at = at.parent) {   // the read sits in the loop body
            if (at === loop.statement) {
                break;
            }
            if ((at === loop) || isFunctionLike(at) || (at.parent === undefined)) {
                return false;
            }
        }
        let ok = true;
        const visit = (n: any): void => {
            if (!ok) {
                return;
            }
            if (n.kind === SyntaxKind.Identifier) {
                const sym = checker.getSymbolAtLocation(n);
                const parent: any = n.parent;
                if ((sym === indexSymbol) && (n !== step.operand) && (n !== condition.left) && (n !== indexDecl.name)) {
                    const writes = ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n)
                        && (parent.operatorToken.kind >= SyntaxKind.FirstAssignment) && (parent.operatorToken.kind <= SyntaxKind.LastAssignment))
                        || (((parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.PrefixUnaryExpression))
                            && ((parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken)))
                        || ((parent?.kind === SyntaxKind.ArrayLiteralExpression) || (parent?.kind === SyntaxKind.ForOfStatement) || (parent?.kind === SyntaxKind.ForInStatement));
                    ok = !writes;
                }
                if ((sym === listSymbol) && (n !== bound.expression)) {
                    const access = (parent?.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === n)
                        && !this.isGoElementAccessAssignmentTarget(parent);
                    const length = (parent?.kind === SyntaxKind.PropertyAccessExpression) && (parent.expression === n) && (parent.name?.text === 'length');
                    ok = access || length;
                }
            }
            n.forEachChild(visit);
        };
        visit(loop.statement);
        return ok && !this.goLocalIsRebound(this.goEnclosingFunction(loop), listSymbol?.valueDeclaration?.resolve()?.name ?? list);
    }

    // `const ks = Object.keys (this.f)` over a cache: ObjectKeys builds a nil slice for a nil map and an exact-capacity
    // slice otherwise, which is the nil-guarded range below (the loop variable name must be free in the function)
    goG09CacheKeysRange(declaration, declaredType: string, varName: string, identation): string | undefined {
        const init: any = this.goUnwrapParenthesizedNode(declaration.initializer);
        const callee: any = init?.expression;
        if ((declaredType !== '[]string') || (init?.kind !== SyntaxKind.CallExpression) || (init.arguments?.length !== 1)
            || (callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.name?.text !== 'keys')
            || (callee.expression?.kind !== SyntaxKind.Identifier) || (callee.expression.text !== 'Object')
            || !this.goG09CacheField(init.arguments[0])) {
            return undefined;
        }
        const scope = this.goEnclosingFunction(declaration);
        let taken = (scope === undefined);
        const visit = (n: any): void => {
            if (!taken && (n.kind === SyntaxKind.Identifier) && (n.text === 'objectKey')) {
                taken = true;
            }
            if (!taken) {
                n.forEachChild(visit);
            }
        };
        if (scope !== undefined) {
            scope.forEachChild(visit);
        }
        const field = this.printNode(init.arguments[0], 0);
        if (taken || field.includes('\n')) {
            return undefined;
        }
        const iden = this.getIden(identation);
        return [
            `${iden}var ${varName} []string = nil`,
            `${iden}if ${field} != nil {`,
            `${iden}\t${varName} = make([]string, 0, len(${field}))`,
            `${iden}\tfor objectKey := range ${field} {`,
            `${iden}\t\t${varName} = append(${varName}, objectKey)`,
            `${iden}\t}`,
            `${iden}}`,
        ].join('\n');
    }

    // `a && b` / `a || b` whose two operands are the same cache field's nil test (`this.f !== undefined && this.f !== null`):
    // one test, as Go vet rejects the doubled operand
    goG09CacheDuplicateNilTest(node): string | undefined {
        const op = node.operatorToken.kind;
        if ((op !== SyntaxKind.AmpersandAmpersandToken) && (op !== SyntaxKind.BarBarToken)) {
            return undefined;
        }
        const test = (n: any): { field: any, eq: boolean } | undefined => {
            const t: any = this.goUnwrapParenthesizedNode(n);
            if (t?.kind !== SyntaxKind.BinaryExpression) {
                return undefined;
            }
            const k = t.operatorToken.kind;
            const eq = (k === SyntaxKind.EqualsEqualsEqualsToken) || (k === SyntaxKind.EqualsEqualsToken);
            const ne = (k === SyntaxKind.ExclamationEqualsEqualsToken) || (k === SyntaxKind.ExclamationEqualsToken);
            if (!eq && !ne) {
                return undefined;
            }
            if (this.goG09CacheField(t.left) && this.goIsNilLiteral(t.right)) {
                return { field: t.left, eq };
            }
            return (this.goG09CacheField(t.right) && this.goIsNilLiteral(t.left)) ? { field: t.right, eq } : undefined;
        };
        const l = test(node.left);
        const r = test(node.right);
        if ((l === undefined) || (r === undefined) || (l.eq !== r.eq) || (l.field.name.text !== r.field.name.text)
            || (l.eq !== (op === SyntaxKind.BarBarToken))) {
            return undefined;
        }
        const field = this.printNode(l.field, 0);
        return field.includes('\n') ? undefined : `${field} ${l.eq ? '==' : '!='} nil`;
    }

    // an element of the `[]string` key list a cache range produced (`const keys = Object.keys (this.f)`), read as a call
    // argument at the counter of the `for (let i = 0; i < keys.length; i++)` that bounds it: the plain Go index
    goG09CacheKeysElementRead(node, baseExpr, containerStr: string, keyNodes, keyStrs: string[]): string | undefined {
        const key = keyNodes[0];
        if ((keyNodes.length !== 1) || (baseExpr?.kind !== SyntaxKind.Identifier) || (key?.kind !== SyntaxKind.Identifier)
            || (node.parent?.kind !== SyntaxKind.CallExpression) || !node.parent.arguments.includes(node)
            || this.isGoElementAccessAssignmentTarget(node)) {
            return undefined;
        }
        const declaration: any = this.goDeclarationOfIdentifier(baseExpr);
        const init: any = this.goUnwrapParenthesizedNode(declaration?.initializer);
        const callee: any = init?.expression;
        if ((init?.kind !== SyntaxKind.CallExpression) || (init.arguments?.length !== 1) || (callee?.kind !== SyntaxKind.PropertyAccessExpression)
            || (callee.name?.text !== 'keys') || (callee.expression?.text !== 'Object') || !this.goG09CacheField(init.arguments[0])
            || (this.goDeclaredTypeOfIdentifier(baseExpr) !== '[]string') || !this.goG09IndexBoundedBy(key, baseExpr, node)) {
            return undefined;
        }
        return `${containerStr}[${keyStrs[0]}]`;
    }

    // `this.f[key]` over a cache: the map index answers what GetValue answered (absent key and nil map both nil)
    // because the cache only ever holds the plain dictionaries its writers store
    goG09CacheRead(node, baseExpr, containerStr: string, keyNodes, keyStrs: string[]): string | undefined {
        if (!this.goG09CacheField(baseExpr) || containerStr.includes('\n') || this.isGoElementAccessAssignmentTarget(node)
            || this.goMarketComparisonElementRead(node)) {
            return undefined;
        }
        const first = this.goG09CacheKeyText(keyNodes[0], keyStrs[0]);
        return (first === undefined) ? undefined : this.goElementAccessChain(`${containerStr}[${first}]`, [ first ].concat(keyStrs.slice(1)));
    }

    // `this.f[key] = value`: AddElementToObject skips a nil key and a nil map and stores derefScalar(value). The native
    // store keeps the key guard (a `*string` key under its own `!== undefined` test), a nil map is excluded by the
    // function's own `if (this.f === undefined) this.f = {}` that precedes the write, and the value is a local that
    // never holds a pointer box (derefScalar is then the identity)
    goG09CacheWrite(containerNode, containerStr: string, keyNode, keyStr: string, valueStr: string, compound: boolean, valueNode): string | undefined {
        if (compound || (valueNode === undefined) || valueStr.includes('\n') || containerStr.includes('\n') || !this.goG09CacheField(containerNode)) {
            return undefined;
        }
        const value = this.goUnwrapParenthesizedNode(valueNode);
        const plainValue = (value?.kind === SyntaxKind.ObjectLiteralExpression)
            || ((value?.kind === SyntaxKind.Identifier) && (this.goDeclarationOfIdentifier(value) !== undefined)
                && !this.goValueMayHoldPointer(value) && !String(this.goDeclaredTypeOfIdentifier(value) ?? '').startsWith('*'));
        if (!plainValue || !this.goG09CacheInitializedBefore(containerNode)) {
            return undefined;
        }
        if (this.goIsStringKeyExpression(keyNode)) {
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        return this.goIsNilGuardedStringPointerKey(keyNode) ? `${containerStr}[*${keyStr}] = ${valueStr}` : undefined;
    }

    // an `if (this.f === undefined) { this.f = {}; }` (or a bare `this.f = {}`) among the statements before the write
    // in an enclosing block of the same function, with no non-literal store to the field in between
    goG09CacheInitializedBefore(access): boolean {
        const field = access.name.text;
        const isField = (n: any): boolean => (n?.kind === SyntaxKind.PropertyAccessExpression) && (n.expression?.kind === SyntaxKind.ThisKeyword)
            && (n.name?.text === field);
        const isLiteralStore = (n: any): boolean => {
            const e: any = (n?.kind === SyntaxKind.ExpressionStatement) ? n.expression : undefined;
            return (e?.kind === SyntaxKind.BinaryExpression) && (e.operatorToken.kind === SyntaxKind.EqualsToken) && isField(e.left)
                && (e.right?.kind === SyntaxKind.ObjectLiteralExpression);
        };
        const isUndefinedTest = (c: any): boolean => {
            const t: any = this.goUnwrapParenthesizedNode(c);
            if ((t?.kind !== SyntaxKind.BinaryExpression) || ![ SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.EqualsEqualsToken ].includes(t.operatorToken.kind)) {
                return false;
            }
            return (isField(t.left) && this.goIsNilLiteral(t.right)) || (isField(t.right) && this.goIsNilLiteral(t.left));
        };
        const initializes = (st: any): boolean => {
            if (isLiteralStore(st)) {
                return true;
            }
            if ((st?.kind !== SyntaxKind.IfStatement) || (st.elseStatement !== undefined) || !isUndefinedTest(st.expression)) {
                return false;
            }
            const then: any = st.thenStatement;
            return (then?.kind === SyntaxKind.Block) ? then.statements.some((s: any) => isLiteralStore(s)) : isLiteralStore(then);
        };
        const storesOther = (st: any): boolean => {
            let found = false;
            const visit = (n: any): void => {
                if (found) {
                    return;
                }
                if ((n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken.kind >= SyntaxKind.FirstAssignment)
                    && (n.operatorToken.kind <= SyntaxKind.LastAssignment) && isField(n.left) && (n.right?.kind !== SyntaxKind.ObjectLiteralExpression)) {
                    found = true;
                    return;
                }
                n.forEachChild(visit);
            };
            visit(st);
            return found;
        };
        let child: any = access;
        for (let parent: any = access.parent; parent !== undefined; child = parent, parent = parent.parent) {
            if (isFunctionLike(parent) || (parent.kind === SyntaxKind.SourceFile)) {
                return false;
            }
            const statements: any = ((parent.kind === SyntaxKind.Block) || (parent.kind === SyntaxKind.CaseClause) || (parent.kind === SyntaxKind.DefaultClause))
                ? parent.statements : undefined;
            if (statements === undefined) {
                continue;
            }
            const at = statements.indexOf(child);
            for (let j = at - 1; j >= 0; j--) {
                if (initializes(statements[j])) {
                    return !statements.slice(j + 1, at + 1).some((s: any) => storesOther(s));
                }
                if (storesOther(statements[j])) {
                    return false;
                }
            }
        }
        return false;
    }
    // ---- end RFM-G4 G09 ----------------------------------------------------------------------------------------

    goIsStringKeyExpression(node): boolean {
        if ((node.kind === SyntaxKind.StringLiteral) || (node.kind === SyntaxKind.NoSubstitutionTemplateLiteral)) {
            return true;
        }
        return this.goDeclaredTypeOfIdentifier(node) === 'string';
    }

    // `[]any` receivers only inline when the index is a literal the slice's own
    // literal initializer covers and nothing rebinds the local: the helper silently
    // ignores an out-of-range index, while Go panics on the assignment.
    goSliceIndexProvablyInRange(node, indexNode): boolean {
        if ((node?.kind !== SyntaxKind.Identifier) || (indexNode?.kind !== SyntaxKind.NumericLiteral)) {
            return false;
        }
        const index = Number(indexNode.text);
        if (!Number.isInteger(index) || (index < 0)) {
            return false;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (decl === undefined || decl.kind !== SyntaxKind.VariableDeclaration || decl.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const initializer = decl.initializer;
        if ((initializer?.kind !== SyntaxKind.ArrayLiteralExpression) || (initializer.elements.length <= index)) {
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
        const name = nameNode.text;
        let rebound = false;
        const visit = (n) => {
            if (rebound) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== nameNode)) {
                if (this.goRebindingTargetOf(n) !== undefined) {
                    rebound = true;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        visit(scope);
        return rebound;
    }

    // walks up from the identifier to the assignment it targets: `x = …` / `x += …` /
    // `[x, y] = …` / `for (x of …)` rebind the local, `x[k] = v` does not
    goRebindingTargetOf(identifier) {
        let node: any = identifier;
        let parent = node.parent;
        while (parent?.kind === SyntaxKind.ArrayLiteralExpression) {
            node = parent;
            parent = parent.parent;
        }
        if ((parent?.kind === SyntaxKind.ForOfStatement) && (parent.initializer === node)) {
            return parent;
        }
        if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === node)) {
            const op = parent.operatorToken.kind;
            if ((op === SyntaxKind.EqualsToken) || ((op >= SyntaxKind.FirstCompoundAssignment) && (op <= SyntaxKind.LastCompoundAssignment))) {
                return parent;
            }
        }
        return undefined;
    }

    // native `container[key] = value` when the receiver's Go type is proved by the
    // printer, otherwise undefined and the caller keeps the runtime helper
    printNativeElementAssignment(containerNode, containerStr: string, keyNode, keyStr: string, valueStr: string, compound = false, valueNode?): string | undefined {
        // a local typed because its base callee already answers the map: the helper this write printed
        // derefs a pointer value (a *int64 from Parse8601, a *bool read back out of a parsed row), a
        // native store would keep the pointer, so only a value the printer proves is not one is native
        if (this.goIsBaseMapResultLocal(containerNode) && !this.goMapWriteValueIsNotPointer(valueNode)) {
            return undefined;
        }
        const cacheWrite = this.goG09CacheWrite(containerNode, containerStr, keyNode, keyStr, valueStr, compound, valueNode);  // RFM-G4 G09
        if (cacheWrite !== undefined) {
            return cacheWrite;
        }
        valueStr = this.goRf6fSlotStoreText(valueNode, valueStr); // RF-go-6-F
        const containerType = this.goElementAssignmentContainerType(containerNode, containerStr);
        const fieldType = this.goFieldContainerTypeNative(containerNode);
        if ((fieldType !== undefined) || (containerType === 'map[string]any')) {
            if (!this.goIsStringKeyExpression(keyNode)) {
                return this.printNativeGuardedPointerKeyAssignment(containerNode, containerStr, containerType, fieldType, keyNode, keyStr, valueStr, compound, valueNode);
            }
            if (fieldType === '*sync.Map') {
                // a `+=` reads the element back through `container[key]`, which a
                // sync.Map has no operator for: that shape keeps the runtime helper
                return compound ? undefined : `${containerStr}.Store(${keyStr}, ${valueStr})`;
            }
            if (this.goIsPlainValuedMapField(containerNode) && !compound && (valueNode !== undefined) && this.goValueMayHoldPointer(valueNode)) {
                return `${containerStr}[${keyStr}] = DerefScalar(${valueStr})`;
            }
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        if ((containerType === '[]any') && this.goSliceIndexProvablyInRange(containerNode, keyNode)) {
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        return undefined;
    }

    // `m[*k] = v` for a fresh unshared map local, a nil-guarded *string key and a
    // non-pointer value: exactly the helper's map branch minus its lock and derefs
    printNativeGuardedPointerKeyAssignment(containerNode, containerStr: string, containerType, fieldType, keyNode, keyStr: string, valueStr: string, compound: boolean, valueNode): string | undefined {
        if (compound || (fieldType !== undefined) || (containerType !== 'map[string]any') || (valueNode === undefined)) {
            return undefined;
        }
        if (this.goIsNilGuardedStringPointerKey(keyNode) && this.goIsFreshUnsharedMapLocal(containerNode, containerNode) && this.goIsNonPointerValue(valueNode)) {
            return `${containerStr}[*${keyStr}] = ${valueStr}`;
        }
        return undefined;
    }

    // a `Dict` parameter with a `{}` default is the GetArgMap local the printer declares
    // `map[string]any` — map literal fallback, so the local is a map on every line — and a
    // write through it is a plain store once nothing rebinds the name
    goGetArgMapParameterIsMapLocal(node): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        let decl: any;
        try {
            decl = this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        } catch (e) {
            decl = undefined;
        }
        if ((decl?.kind !== SyntaxKind.Parameter) || (this.goGetArgParameterType(decl) !== 'map[string]any')) {
            return false;
        }
        const scope = this.goEnclosingFunction(decl);
        return (scope !== undefined) && !this.goLocalIsRebound(scope, decl.name);
    }

    // `m[k] = v` on the GetArgMap local, and `if k != nil { m[*k] = v }` for a nullable
    // `*string` key on a map the printer proved: the helper's map branch skips a nil key and
    // derefs a pointer value, so both shapes keep their guard and refuse a pointer value
    printNativeMapWriteOnProvenLocal(containerNode, containerStr: string, keyNode, keyStr: string, valueStr: string, valueNode?, identation = 0): string | undefined {
        const rfStore = this.rfGo6bStoreAssignment(containerNode, containerStr, keyNode, keyStr, valueStr, valueNode, identation);  // RF-go-6-B
        if (rfStore !== undefined) {
            return rfStore;
        }
        if (valueStr.includes('\n')) {
            return undefined;
        }
        const getArgMap = this.goGetArgMapParameterIsMapLocal(containerNode);
        const provenMap = getArgMap || (this.goElementAssignmentContainerType(containerNode, containerStr) === 'map[string]any');
        if (!provenMap) {
            return undefined;
        }
        if (this.goIsStringKeyExpression(keyNode)) {
            return getArgMap ? `${containerStr}[${keyStr}] = ${valueStr}` : undefined;
        }
        if ((keyNode?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(keyNode) !== '*string')
            || !(getArgMap || this.goIsFreshUnsharedMapLocal(containerNode, containerNode)) || !this.goMapWriteValueIsNotPointer(valueNode)) {
            return undefined;
        }
        const iden = this.getIden(identation);
        return `if ${keyStr} != nil {\n${iden}\t${containerStr}[*${keyStr}] = ${valueStr}\n${iden}}`;
    }

    // `this.<option dict>[k] = v` with a string-typed or nil-guarded *string key: the helper's map store
    // behind the nil checks it applies; a pointer value is stored dereferenced, any other `any` keeps it
    printOptionDictFieldWrite(containerNode, containerStr: string, keyNode, keyStr: string, valueNode, identation: number): string | undefined {
        const name = (containerNode?.kind === SyntaxKind.PropertyAccessExpression) && (containerNode.expression?.kind === SyntaxKind.ThisKeyword)
            ? this.transformPropertyAccessExpressionName(containerNode.name.text, containerNode.name) : undefined;
        if ((name === undefined) || !GO_OPTION_DICT_FIELDS.includes(name) || (valueNode === undefined)) {
            return undefined;
        }
        let keyType = this.goDeclaredTypeOfIdentifier(keyNode);
        if ((keyType === undefined) && (keyNode?.kind === SyntaxKind.Identifier)) {
            const declaration: any = this.checkerOrUndefined()?.getSymbolAtLocation(keyNode)?.valueDeclaration?.resolve();
            keyType = this.goGetArgParameterType(declaration);
        }
        if ((keyType !== 'string') && (keyType !== '*string')) {
            return undefined;
        }
        const inner = this.goUnwrapParenthesizedNode(valueNode);
        let storeValue: (text: string) => string;
        if (this.goMapWriteValueIsNotPointer(valueNode)) {
            storeValue = (text) => text;
        } else if ((inner?.kind === SyntaxKind.Identifier) && this.goWritePrintsPointerBox(inner)) {
            storeValue = (text) => `DerefScalar(${text})`;
        } else {
            return undefined;
        }
        const value = storeValue(this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(valueNode, identation + 1)).trimStart());
        const pointerKey = keyType === '*string';
        const guard = pointerKey ? `${containerStr} != nil && ${keyStr} != nil` : `${containerStr} != nil`;
        const iden = this.getIden(identation);
        return `if ${guard} {\n${iden}\t${containerStr}[${pointerKey ? '*' : ''}${keyStr}] = ${value}\n${iden}}`;
    }

    // the helper stores derefScalar(value): a numeric literal is already the value it stores
    goMapWriteValueIsNotPointer(valueNode): boolean {
        const inner = this.goUnwrapParenthesizedNode(valueNode);
        if ((inner?.kind === SyntaxKind.NumericLiteral) || (inner?.kind === SyntaxKind.BigIntLiteral)) {
            return true;
        }
        return this.goIsNonPointerValue(valueNode);
    }

    // ===== RF-go-6-B =====
    // Element write on a hand-written BaseExchange map field (`this.balance[k] = v`): the field's Go type
    // is `map[string]any` (table passed by the embedder through parser.nativeStoreFields, keyed by the TS
    // property name), so the store is the native `this.Balance[k] = v` when
    //   (1) every write of the field in the source file leaves a fresh non-nil map (object literal, a
    //       tabled fresh-map producer, or the field handed back through a tabled self-returning call),
    //   (2) the writing method runs on the exchange's message loop: a sync method that is not a tabled
    //       user-path method and neither spawns/delays nor calls an async method without waiting,
    //   (3) the key is a Go string (literal / `string` local) or a `*string` local (nil-guarded: `[*k]`;
    //       otherwise behind a born-expanded `if k != nil {` guard, the helper's nil-key no-op),
    //   (4) the value is not a pointer or `any` box: the helper stores derefScalar(value).
    // Anything else keeps AddElementToObject.
    nativeStoreFields: { [tsName: string]: any } | undefined = undefined;
    rfGo6bNeverNilCache = new Map<any, Map<string, boolean>>();

    rfGo6bStoreField(containerNode): any {
        if ((containerNode?.kind !== SyntaxKind.PropertyAccessExpression) || (containerNode.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const table = this.nativeStoreFields;
        const name = containerNode.name?.text;
        if ((table === undefined) || (typeof name !== 'string') || !Object.prototype.hasOwnProperty.call(table, name)) {
            return undefined;
        }
        return (table[name]?.type === 'map[string]any') ? table[name] : undefined;
    }

    rfGo6bThisCallName(call): string | undefined {
        const callee = this.goUnwrapParenthesizedNode(call)?.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        return callee.name?.text;
    }

    rfGo6bFieldNeverNil(sourceFile, name: string, field): boolean {
        let perFile = this.rfGo6bNeverNilCache.get(sourceFile);
        if (perFile === undefined) {
            perFile = new Map<string, boolean>();
            this.rfGo6bNeverNilCache.set(sourceFile, perFile);
        }
        if (perFile.has(name)) {
            return perFile.get(name) as boolean;
        }
        let ok = true;
        const visit = (n) => {
            if (!ok) {
                return;
            }
            if ((n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken?.kind === SyntaxKind.EqualsToken)
                && (n.left?.kind === SyntaxKind.PropertyAccessExpression) && (n.left.expression?.kind === SyntaxKind.ThisKeyword) && (n.left.name?.text === name)) {
                const right = this.goUnwrapParenthesizedNode(n.right);
                const callName = this.rfGo6bThisCallName(right);
                const selfWrite = (callName !== undefined) && (field.selfCalls ?? []).includes(callName) && (right.arguments.length === 1)
                    && (right.arguments[0]?.kind === SyntaxKind.PropertyAccessExpression) && (right.arguments[0].expression?.kind === SyntaxKind.ThisKeyword)
                    && (right.arguments[0].name?.text === name);
                ok = (right?.kind === SyntaxKind.ObjectLiteralExpression) || ((callName !== undefined) && (field.freshMapCalls ?? []).includes(callName)) || selfWrite;
            }
            n.forEachChild(visit);
        };
        visit(sourceFile);
        perFile.set(name, ok);
        return ok;
    }

    rfGo6bRunsOnMessageLoop(containerNode, field): boolean {
        const fn = this.goEnclosingFunction(containerNode);
        if ((fn?.kind !== SyntaxKind.MethodDeclaration) || (fn.body === undefined) || this.isAsyncFunction(fn)) {
            return false;
        }
        if (new RegExp(field.userPathMethods ?? '(?!)').test(`${fn.name?.text ?? ''}`)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        let free = checker !== undefined;
        const visit = (n) => {
            if (!free) {
                return;
            }
            if (n.kind === SyntaxKind.CallExpression) {
                if (['spawn', 'delay'].includes(this.rfGo6bThisCallName(n) ?? '')) {
                    free = false;
                    return;
                }
                const declaration = checker.getResolvedSignature(n)?.declaration?.resolve?.();
                if ((declaration !== undefined) && this.hasAsyncModifier(declaration)) {
                    free = false;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        visit(fn.body);
        return free;
    }

    rfGo6bValueIsPlain(valueNode, field): boolean {
        if (this.goMapWriteValueIsNotPointer(valueNode)) {
            return true;
        }
        const inner = this.goUnwrapParenthesizedNode(valueNode);
        if (inner?.kind === SyntaxKind.Identifier) {
            // a never-rebound local read from an empty-default container accessor (the decoded container or
            // that default, never a pointer); any other local needs a printed non-pointer Go type (above)
            const declaration: any = this.checkerOrUndefined()?.getSymbolAtLocation(inner)?.valueDeclaration?.resolve();
            const initializer = this.goUnwrapParenthesizedNode(declaration?.initializer);
            return (declaration?.kind === SyntaxKind.VariableDeclaration) && (declaration.name?.kind === SyntaxKind.Identifier)
                && (initializer?.kind === SyntaxKind.CallExpression) && this.rfGo6bEmptyDefaultCall(initializer, field)
                && !this.goLocalIsRebound(this.goEnclosingFunction(declaration), declaration.name);
        }
        const callName = this.rfGo6bThisCallName(inner);
        if (callName === undefined) {
            return false;
        }
        if ((field.plainCalls ?? []).includes(callName)) {
            return true;
        }
        return this.rfGo6bEmptyDefaultCall(inner, field);
    }

    // `this.safeDict (x, k, {})` / `this.safeList (x, k, [])`: the decoded container or its literal empty default
    rfGo6bEmptyDefaultCall(call, field): boolean {
        const callName = this.rfGo6bThisCallName(call);
        const last = call.arguments[call.arguments.length - 1];
        const emptyLiteral = ((last?.kind === SyntaxKind.ObjectLiteralExpression) && (last.properties.length === 0))
            || ((last?.kind === SyntaxKind.ArrayLiteralExpression) && (last.elements.length === 0));
        return (callName !== undefined) && (field.emptyDefaultCalls ?? []).includes(callName) && (call.arguments.length >= 3) && emptyLiteral;
    }

    rfGo6bStoreAssignment(containerNode, containerStr: string, keyNode, keyStr: string, valueStr: string, valueNode, identation = 0): string | undefined {
        const field = this.rfGo6bStoreField(containerNode);
        if ((field === undefined) || (valueNode === undefined) || valueStr.includes('\n')) {
            return undefined;
        }
        if (!this.rfGo6bFieldNeverNil(containerNode.getSourceFile(), containerNode.name.text, field)
            || !this.rfGo6bRunsOnMessageLoop(containerNode, field) || !this.rfGo6bValueIsPlain(valueNode, field)) {
            return undefined;
        }
        if (this.goIsStringKeyExpression(keyNode)) {
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        if ((keyNode?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(keyNode) !== '*string')) {
            return undefined;
        }
        const declaration = this.checkerOrUndefined()?.getSymbolAtLocation(keyNode)?.valueDeclaration?.resolve();
        if ((declaration === undefined) || this.goLocalIsRebound(this.goEnclosingFunction(declaration), keyNode)) {
            return undefined;
        }
        if (this.goHasEnclosingNilGuard(keyNode)) {
            return `${containerStr}[*${keyStr}] = ${valueStr}`;
        }
        const iden = this.getIden(identation);
        return `if ${keyStr} != nil {\n${iden}\t${containerStr}[*${keyStr}] = ${valueStr}\n${iden}}`;
    }
    // ===== end RF-go-6-B =====

    // a `*string` local the enclosing control flow proves non-nil: the helper's deref
    // yields the same string key (a nil key would have made it a no-op)
    goIsNilGuardedStringPointerKey(keyNode): boolean {
        return (keyNode?.kind === SyntaxKind.Identifier) && (this.goDeclaredTypeOfIdentifier(keyNode) === '*string')
            && this.goHasEnclosingNilGuard(keyNode);
    }

    // hx10w8-GP03: a `*string` key of an `x in m` read that a nil test proves non-nil BEFORE the
    // read runs. InOp derefs its key (nil answers false) and a Go map read of a nil pointer panics,
    // so the comma-ok needs that proof; a `&&` conjunct of the read's own condition does not count
    // when the read moves into an if init clause, which Go evaluates first.
    goInOpPointerKeyProvenNonNil(statement, ident): boolean {
        if ((ident?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(ident) !== '*string')) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if ((checker === undefined) || (statement === undefined)) {
            return false;
        }
        const declaration = checker.getSymbolAtLocation(ident)?.valueDeclaration?.resolve();
        if (this.goLocalIsRebound(this.goEnclosingFunction(declaration ?? ident), ident)) {
            return false; // a rebound pointer's guard may be stale at the read
        }
        let child = statement;
        let parent = statement.parent;
        while (parent !== undefined) {
            const kind = parent.kind;
            if (kind === SyntaxKind.Block) {
                // an earlier statement that leaves the block on a nil test guards everything after it
                if (this.goBlockExitsOnNilTest(parent, child, ident)) {
                    return true;
                }
            }
            const guard = this.goNilGuardFields[kind];
            if ((guard !== undefined) && (child === parent[guard[0]]) && this.goConditionProvesNonNil(parent[guard[1]], ident)) {
                return true;
            }
            if ((guard === undefined) && (kind !== SyntaxKind.Block) && (kind !== SyntaxKind.LabeledStatement)) {
                return false; // the walk cannot carry a guard across anything else
            }
            child = parent;
            parent = parent.parent;
        }
        return false;
    }

    // `if (k === undefined) { return }` earlier in the block: every path that reaches `statement`
    // has k non-nil
    goBlockExitsOnNilTest(block, statement, ident): boolean {
        const statements = block?.statements;
        if (statements === undefined) {
            return false;
        }
        const index = statements.indexOf(statement);
        if (index < 0) {
            return false;
        }
        for (let i = 0; i < index; i++) {
            const sibling: any = statements[i];
            if ((sibling.kind !== SyntaxKind.IfStatement) || (sibling.elseStatement !== undefined)) {
                continue;
            }
            const test = this.goUnwrapParenthesizedNode(sibling.expression);
            if (this.goIsNilTestOf(test, ident) && this.goStatementAlwaysExits(sibling.thenStatement)) {
                return true;
            }
        }
        return false;
    }

    // `k === null/undefined` (the helper's false branch is the nil key)
    goIsNilTestOf(node, ident): boolean {
        if (node?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = node.operatorToken?.kind;
        if ((op !== SyntaxKind.EqualsEqualsToken) && (op !== SyntaxKind.EqualsEqualsEqualsToken)) {
            return false;
        }
        return (this.goIsSameSymbol(node.left, ident) && this.goIsNilLiteral(node.right))
            || (this.goIsSameSymbol(node.right, ident) && this.goIsNilLiteral(node.left));
    }

    // the statement's own control flow always leaves the enclosing function or loop
    goStatementAlwaysExits(statement): boolean {
        if (statement === undefined) {
            return false;
        }
        if (statement.kind === SyntaxKind.Block) {
            const statements = statement.statements;
            return (statements !== undefined) && (statements.length > 0) && this.goStatementAlwaysExits(statements[statements.length - 1]);
        }
        switch (statement.kind) {
        case SyntaxKind.ReturnStatement:
        case SyntaxKind.ThrowStatement:
        case SyntaxKind.ContinueStatement:
        case SyntaxKind.BreakStatement:
            return true;
        }
        return false;
    }

    // a local bound once to an object literal, never read by a nested function and not handed
    // out (anything but `m[k]`) before this write: no other goroutine can hold the map yet
    goIsFreshUnsharedMapLocal(node, writeSite): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const decl: any = this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if ((decl?.kind !== SyntaxKind.VariableDeclaration) || (decl.name?.kind !== SyntaxKind.Identifier)
            || (decl.initializer?.kind !== SyntaxKind.ObjectLiteralExpression)) {
            return false;
        }
        const scope = this.goEnclosingFunction(decl);
        if ((scope === undefined) || (scope.kind === SyntaxKind.SourceFile) || this.goLocalIsRebound(scope, decl.name)) {
            return false;
        }
        const symbol = this.checkerOrUndefined()?.getSymbolAtLocation(decl.name);
        let captured = false;
        const visit = (n, nested: boolean) => {
            if (captured) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n !== decl.name) && (n.text === decl.name.text)
                && (this.checkerOrUndefined()?.getSymbolAtLocation(n) === symbol)) {
                const receiver = (n.parent?.kind === SyntaxKind.ElementAccessExpression) && (n.parent.expression === n);
                if (nested || (!receiver && this.goUseMayPrecede(n, writeSite, scope))) {
                    captured = true;
                }
                return;
            }
            const inner = nested || isFunctionLike(n);
            n.forEachChild((c) => visit(c, inner));
        };
        scope.forEachChild((c) => visit(c, false));
        return !captured;
    }

    // the use runs before the write: earlier in the text, or both inside one loop body
    goUseMayPrecede(use, writeSite, scope): boolean {
        if (use.pos < writeSite.pos) {
            return true;
        }
        for (let n = writeSite.parent; (n !== undefined) && (n !== scope); n = n.parent) {
            if (GO_ITERATION_STATEMENT_KINDS.has(n.kind) && (use.pos >= n.pos) && (use.end <= n.end)) {
                return true;
            }
        }
        return false;
    }

    // the value's printed Go type is concrete and not a pointer, so the helper's derefScalar
    // leaves it unchanged; an `any` box or a pointer keeps the helper
    goIsNonPointerValue(valueNode): boolean {
        const inner = this.goUnwrapParenthesizedNode(valueNode);
        switch (inner?.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.ArrayLiteralExpression:
            return true;
        }
        if (inner === undefined) {
            return false;
        }
        const goType = this.goPrintedTypeOfExpression(inner, this.printNode(inner, 0));
        return (typeof goType === 'string') && (goType !== 'any') && !goType.startsWith('*');
    }

    // the concrete Go type an *expression* is printed as: a local's declared type,
    // the return type of a runtime helper call, or a literal. undefined when the value
    // stays inside an `any` box — a native Go operation on an `any` box would not
    // compile, so every rule below falls back to its helper in that case.
    goPrintedTypeOfExpression(node, printedText: string): string | undefined {
        const inner = (node?.kind === SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        if (inner?.kind === SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(inner);
        }
        return this.goTypeOfInitializer(inner, printedText);
    }

    // the type the declaration line itself prints, for the locals whose verdict comes from an
    // unbox or container rule rather than from the initializer the type cache re-reads
    goPrintedLocalDeclarationType(node): string | undefined {
        const declaration = this.goDeclarationOfIdentifier(node);
        if (declaration === undefined) {
            return undefined;
        }
        return this.goSafeDictLocalUnbox(declaration) ?? this.goSafeListLocalUnbox(declaration)
            ?? this.goMarketLocalUnbox(declaration) ?? this.goContainerLocalType(declaration);
    }

    // `x.length` on a value the printer declares as a slice is `len(x)`: Go's len is
    // 0 for a nil slice, exactly like GetArrayLength's `[]T` cases. On a map or an
    // `any` box GetArrayLength answers 0, so only a `[]`-typed value may inline —
    // and only for the slice types the helper itself counts (a []byte would answer 0).
    sliceLengthTypes = [ '[]any', '[]string', '[]int64', '[]float64', '[]bool', '[]int', '[][]any', '[][]string', '[]map[string]any' ];

    // hand-written BaseExchange fields (go/v4/exchange.go) whose Go type is one of the
    // slice types above: the struct value is never a nil pointer and len(field) is the
    // very value the helper's type switch returns for it.
    GO_NATIVE_LENGTH_FIELDS = [ 'Symbols' ];

    printInlineArrayLength(expression, printedText: string, lengthNode?): string | undefined {
        if (printedText.includes('\n')) {
            return undefined;
        }
        const goType = this.goPrintedTypeOfExpression(expression, printedText) ?? this.goPrintedLocalDeclarationType(expression);
        if ((typeof goType === 'string') && this.sliceLengthTypes.indexOf(goType) >= 0) {
            return `len(${printedText})`;
        }
        if (this.goLengthFeedsArithmeticClassifier(lengthNode)) {
            return undefined;
        }
        // a Go `string` counts its bytes in both helpers (GetLength's reflect.String
        // case, GetArrayLength's `case string`), and neither helper's nil/`any` branch
        // is reachable for it; a *string / any box keeps the helper it prints today
        if ((goType === 'string') || (this.goNativeLengthFieldType(printedText) !== undefined)) {
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
            if (current.kind === SyntaxKind.BinaryExpression) {
                const op = current.operatorToken?.kind;
                if ((op === SyntaxKind.MinusToken) || (op === SyntaxKind.AsteriskToken)
                    || (op === SyntaxKind.SlashToken) || (op === SyntaxKind.PercentToken)) {
                    return true;
                }
            }
            switch (current.kind) {
            case SyntaxKind.ExpressionStatement:
            case SyntaxKind.VariableStatement:
            case SyntaxKind.ReturnStatement:
            case SyntaxKind.IfStatement:
            case SyntaxKind.Block:
            case SyntaxKind.ForStatement:
            case SyntaxKind.WhileStatement:
            case SyntaxKind.MethodDeclaration:
            case SyntaxKind.FunctionDeclaration:
            case SyntaxKind.ArrowFunction:
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
        const inner = (node?.kind === SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        switch (inner?.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return 'bool';
        case SyntaxKind.NumericLiteral:
            // an integer literal is an untyped constant of Go default type `int`; a
            // fraction/exponent makes it a float64 constant
            if (/^[0-9]+$/.test(inner.text)) {
                return 'int';
            }
            return (/^[0-9]*\.[0-9]+([eE][+-]?[0-9]+)?$/.test(inner.text) || /^[0-9]+[eE][+-]?[0-9]+$/.test(inner.text)) ? 'float64' : undefined;
        case SyntaxKind.Identifier:
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
            if ((keyNode?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(keyNode) !== '*string')) {
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

    // ---- FM-A9F L3: negated lookups hoisted out of an `||` chain; ws book entries as receivers ----
    // `if <pure terms> || !(k in m) {` with k a `*string` and m a Go map: InOp answers false for a nil key,
    // so a flag set under `k != nil` just before the `if` keeps the behaviour while the lookup is the
    // native comma-ok. Only pure terms may sit around the lookup (nothing is evaluated early).

    // `this.markets` / `this.markets_by_id` / `this.currencies` / `this.currencies_by_id`: the book getters
    goL3BookReceiver(node): boolean {
        return (node?.kind === SyntaxKind.PropertyAccessExpression) && (node.expression?.kind === SyntaxKind.ThisKeyword)
            && (typeof node.name?.text === 'string')
            && (this.GO_NATIVE_MAP_ACCESSORS.indexOf(this.transformPropertyAccessExpressionName(node.name.text, node.name)) >= 0);
    }

    // `this.ohlcvs[symbol]` with a Go `string` (or provably non-nil `*string`) index: one book of the
    // map[string]map[string]any field, as the native index text (the generic element read prints GetValue, which is `any`)
    goL3BookEntryText(node): string | undefined {
        const access: any = this.goUnwrapParenthesizedNode(node);
        const field: any = access?.expression;
        if ((access?.kind !== SyntaxKind.ElementAccessExpression) || (field?.kind !== SyntaxKind.PropertyAccessExpression)
            || (field.expression?.kind !== SyntaxKind.ThisKeyword) || (typeof field.name?.text !== 'string')) {
            return undefined;
        }
        const name = this.transformPropertyAccessExpressionName(field.name.text, field.name);
        if (this.GO_NATIVE_MAP_FIELDS[name] !== 'map[string]map[string]any') {
            return undefined;
        }
        const index: any = access.argumentExpression;
        if (index?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const indexType = this.goDeclaredTypeOfIdentifier(index);
        if (indexType === 'string') {
            return `this.${name}[${this.printNode(index, 0)}]`;
        }
        // a `*string` local every write of which is a literal-default SafeString: it is a plain Go string at the use
        return ((indexType === '*string') && this.goDefaultedSafeStringLocal(index)) ? `this.${name}[*${this.printNode(index, 0)}]` : undefined;
    }

    // `k in book` directly under a `!`: a negated book-entry lookup keeps the helper (the cache-entry proofs
    // downstream key on that guard), only the positive read is native
    goL3UnderNegation(inNode): boolean {
        let current: any = inNode?.parent;
        while (current?.kind === SyntaxKind.ParenthesizedExpression) {
            current = current.parent;
        }
        return (current?.kind === SyntaxKind.PrefixUnaryExpression) && (current.operator === SyntaxKind.ExclamationToken);
    }

    // a Go map the lookup may read: a book getter, or a local the printer declares map[string]any
    goL3MapReceiver(node): boolean {
        return this.goL3BookReceiver(node) || (this.goFieldContainerTypeNative(node) === 'map[string]any')
            || ((node?.kind === SyntaxKind.Identifier)
                && ((this.goDeclaredTypeOfIdentifier(node) === 'map[string]any') || this.goL3DefaultedDictLocal(node)));
    }

    // `const m = this.safeDict(<plain map>, key, {})`: the decoded dictionary or the never-nil literal default, so
    // the local is a `map[string]any` at every use below (the printed declaration is the typed SafeDictMap read).
    // The local is declared once, never rebound, and every use reads it as a map or hands it on as a value.
    goL3DefaultedDictLocal(node): boolean {
        const declaration: any = this.goDeclarationOfIdentifier(node);
        return (declaration !== undefined) && this.goL3DefaultedDictDeclaration(declaration);
    }

    goL3DefaultedDictDeclaration(declaration): boolean {
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.name?.kind !== SyntaxKind.Identifier)) {
            return false;
        }
        const args: any = this.goSafeDictLocalArgs(declaration.initializer);
        if ((args === undefined) || (declaration.initializer.arguments.length !== 3)) {
            return false;
        }
        const container: any = this.goUnwrapParenthesizedNode(args.container);
        if (!this.goL3PlainDictContainer(container)) {
            return false;
        }
        const scope: any = this.goEnclosingFunction(declaration);
        if ((scope === undefined) || this.goLocalIsRebound(scope, declaration.name)) {
            return false;
        }
        const name = declaration.name.text;
        let clean = true;
        const visit = (n) => {
            if (!clean) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name)) {
                clean = this.goL3DictUseKeepsMap(n);
                return;
            }
            if (((n.kind === SyntaxKind.VariableDeclaration) || (n.kind === SyntaxKind.Parameter)) && (n !== declaration)
                && (n.name?.kind === SyntaxKind.Identifier) && (n.name.text === name)) {
                clean = false; // a shadowing binding
                return;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return clean;
    }

    // the defaulted dict local is typed by the printer when a negated `k in m` read over it hoists (the hoisted
    // comma-ok indexes the local, which only compiles against the map type)
    goL3DictLocalBacksHoist(declaration): boolean {
        if (!this.goL3DefaultedDictDeclaration(declaration)) {
            return false;
        }
        const scope: any = this.goEnclosingFunction(declaration);
        const name = declaration.name.text;
        let backs = false;
        const visit = (n) => {
            if (backs) {
                return;
            }
            if ((n.kind === SyntaxKind.IfStatement) && (n.parent?.kind === SyntaxKind.Block)) {
                const shape = this.goL3HoistShape(n);
                const dict: any = shape?.dict;
                if ((dict?.kind === SyntaxKind.Identifier) && (dict.text === name) && (this.goDeclarationOfIdentifier(dict) === declaration)) {
                    backs = true;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return backs;
    }

    // the container of a defaulted dict read: a hand-written map field, or another map local the printer declared
    goL3PlainDictContainer(node): boolean {
        if (node?.kind === SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(node) === 'map[string]any';
        }
        return (this.goFieldContainerTypeNative(node) === 'map[string]any')
            && (this.goUnwrapParenthesizedNode(node)?.name?.text === 'options');
    }

    // one use of the dict local: never a type probe, an assertion, an address or a call target
    goL3DictUseKeepsMap(node): boolean {
        const parent: any = node.parent;
        switch (parent?.kind) {
        case SyntaxKind.ElementAccessExpression:
            return parent.expression === node;
        case SyntaxKind.BinaryExpression: {
            const op = parent.operatorToken?.kind;
            if (op === SyntaxKind.InKeyword) {
                return parent.right === node;
            }
            if (op === SyntaxKind.EqualsToken) {
                return parent.right === node; // `this.x[k] = m`: the value is handed on
            }
            return this.goIsNilComparisonOperand(node, parent);
        }
        case SyntaxKind.CallExpression: {
            if (parent.expression === node) {
                return false;
            }
            const callee: any = parent.expression;
            // Array.isArray / typeof-style probes read the box, not the map
            return !((callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.expression?.text === 'Array'));
        }
        case SyntaxKind.PropertyAssignment:
        case SyntaxKind.ShorthandPropertyAssignment:
            return true;
        }
        return false;
    }

    // a leaf of the pure part of the condition: a local, a literal, a book getter
    goL3PureLeaf(node): boolean {
        const inner: any = this.goUnwrapParenthesizedNode(node);
        switch (inner?.kind) {
        case SyntaxKind.Identifier:
        case SyntaxKind.NullKeyword:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        }
        return this.goL3BookReceiver(inner) || (this.goFieldContainerTypeNative(inner) === 'map[string]any');
    }

    // true when every term of the `&&` / `||` / `!` chain is pure; each `k in m` found is collected
    goL3OrHoistTerms(node, reads: any[]): boolean {
        const inner: any = this.goUnwrapParenthesizedNode(node);
        if (inner?.kind === SyntaxKind.PrefixUnaryExpression) {
            if (inner.operator !== SyntaxKind.ExclamationToken) {
                return false;
            }
            const operand: any = this.goUnwrapParenthesizedNode(inner.operand);
            if ((operand?.kind === SyntaxKind.BinaryExpression) && (operand.operatorToken?.kind === SyntaxKind.InKeyword)) {
                reads.push({ 'node': operand, 'negated': true });
                return true;
            }
            return this.goL3OrHoistTerms(operand, reads);
        }
        if (inner?.kind === SyntaxKind.BinaryExpression) {
            const op = inner.operatorToken?.kind;
            if ((op === SyntaxKind.AmpersandAmpersandToken) || (op === SyntaxKind.BarBarToken)) {
                return this.goL3OrHoistTerms(inner.left, reads) && this.goL3OrHoistTerms(inner.right, reads);
            }
            if (op === SyntaxKind.InKeyword) {
                reads.push({ 'node': inner, 'negated': false });
                return true;
            }
            if ((op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken)
                || (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken)) {
                return this.goL3PureLeaf(inner.left) && this.goL3PureLeaf(inner.right);
            }
            return false;
        }
        return this.goL3PureLeaf(inner);
    }

    // the identifier text anywhere in the function body (the flag name must be free)
    goL3NameIsUsed(scope, name: string): boolean {
        let used = false;
        const visit = (n) => {
            if (used) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name)) {
                used = true;
                return;
            }
            n.forEachChild(visit);
        };
        scope?.forEachChild(visit);
        return used;
    }

    // `(m !== undefined) && (k in m)` over a Go map with a proven `*string` key: the comma-ok read of a nil
    // map is already absent, so the receiver's nil test adds nothing to the init clause's `ok`
    goL3NilMapTermIsRedundant(condition, read): boolean {
        const whole: any = this.goUnwrapParenthesizedNode(condition);
        if ((whole?.kind !== SyntaxKind.BinaryExpression) || (whole.operatorToken?.kind !== SyntaxKind.AmpersandAmpersandToken)
            || (this.goUnwrapParenthesizedNode(whole.right) !== read.inNode) || !read.keyText.startsWith('*')) {
            return false;
        }
        const test: any = this.goUnwrapParenthesizedNode(whole.left);
        if ((test?.kind !== SyntaxKind.BinaryExpression) || ((test.operatorToken?.kind !== SyntaxKind.ExclamationEqualsToken)
            && (test.operatorToken?.kind !== SyntaxKind.ExclamationEqualsEqualsToken))) {
            return false;
        }
        const dict: any = this.goUnwrapParenthesizedNode(read.inNode.right);
        const other = this.goIsNilLiteral(test.right) ? test.left : (this.goIsNilLiteral(test.left) ? test.right : undefined);
        const field = this.goFieldContainerTypeNative(dict);
        return (other !== undefined) && (field === 'map[string]any') && (this.printNode(other, 0) === read.dictText);
    }

    // the structural shape of a hoistable condition: pure terms around one negated `k in m`, k an identifier
    goL3HoistShape(node): any {
        if (node?.parent?.kind !== SyntaxKind.Block) {
            return undefined; // an `else if` or a bare statement body has no place for the flag
        }
        const reads = [];
        if (!this.goL3OrHoistTerms(node.expression, reads) || (reads.length !== 1) || !reads[0].negated) {
            return undefined;
        }
        const read = reads[0].node;
        const key = this.goUnwrapPrintedAssertions(read.left);
        if (key?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        return { read, key, 'dict': this.goUnwrapParenthesizedNode(read.right) };
    }

    goL3OrHoistIf(node, identation): string | undefined {
        const shape = this.goL3HoistShape(node);
        if (shape === undefined) {
            return undefined;
        }
        const { read, key, dict } = shape;
        if ((this.goDeclaredTypeOfIdentifier(key) !== '*string') || !this.goL3MapReceiver(dict)) {
            return undefined;
        }
        // the shapes an existing rule prints stay with it: the if-init comma-ok and the inline closure
        if (this.goInOpIfInitClause(node.expression) !== undefined) {
            return undefined;
        }
        const dictText = this.printNode(dict, 0);
        const keyText = this.printNode(key, 0);
        // a local typed only because this hoist reads it has no closure arm of its own
        const hoistTyped = (dict?.kind === SyntaxKind.Identifier) && (this.goSafeDictLocalUnboxStandard(this.goDeclarationOfIdentifier(dict)) === undefined)
            && this.goL3DefaultedDictLocal(dict);
        if (dictText.includes('\n') || keyText.includes('\n') || (!hoistTyped && (this.printInlineInOp(dict, read.left, dictText, keyText) !== undefined))) {
            return undefined;
        }
        const flag = `${keyText}Known`;
        if (this.goL3NameIsUsed(this.goEnclosingFunction(node), flag)) {
            return undefined;
        }
        const saved = this.goInOpSubstitution;
        this.goInOpSubstitution = new Map([[read, flag]]);
        let printed;
        try {
            printed = super.printIfStatement(node, identation);
        } finally {
            this.goInOpSubstitution = saved;
        }
        if (typeof printed !== 'string') {
            return undefined;
        }
        printed = printed.split(`(${flag})`).join(flag);
        const iden = this.getIden(identation);
        const hoist = `${iden}var ${flag} bool\n${iden}if ${keyText} != nil {\n${iden}\t_, ${flag} = ${dictText}[*${keyText}]\n${iden}}\n`;
        const lead = this.printLeadingComments(node, identation);
        return printed.startsWith(lead) ? lead + hoist + printed.substring(lead.length) : undefined;
    }

    // ---- hx10w5-G14: `key in dict` in an if condition -------------------------------
    // The two-value map read is a *statement* in Go, which is why the emission above is a
    // closure. An `if` can hold it in its init clause instead — `if _, ok := m["k"]; ok {`
    // — so a condition with exactly one provable read prints that native form and no
    // closure. Everything else keeps the existing helper/closure emission.
    goInOpSubstitution = undefined; // Map<in-expression, sentinel>, set while an if-init print runs
    GO_IN_OP_SENTINEL = 'goInOpBoundOk';

    // the text a substituted `in` operand prints: its init-clause binding
    goInOpSubstitutedText(node): string | undefined {
        if (this.goInOpSubstitution === undefined) {
            return undefined;
        }
        const inner = this.goUnwrapParenthesizedNode(node);
        return (inner === undefined) ? undefined : this.goInOpSubstitution.get(inner);
    }

    // the init clause + condition text for an `if` whose condition holds one provable
    // `key in dict` read, or undefined when the shape has to keep its current emission
    goInOpIfInitClause(node): string | undefined {
        const parent = node?.parent;
        if ((parent?.kind !== SyntaxKind.IfStatement) || (parent.expression !== node)) {
            return undefined;
        }
        const read = this.goIfInOpRead(node, parent);
        if (read === undefined) {
            return undefined;
        }
        const name = this.goIfInOpBindingName(parent);
        if (name === undefined) {
            return undefined;
        }
        const saved = this.goInOpSubstitution;
        this.goInOpSubstitution = new Map([[read.inNode, this.GO_IN_OP_SENTINEL]]);
        let text;
        try {
            text = this.printNode(node, 0);
        } finally {
            this.goInOpSubstitution = saved;
        }
        if ((typeof text !== 'string') || text.includes('\n') || !text.includes(this.GO_IN_OP_SENTINEL)) {
            return undefined;
        }
        // the source parentheses around the operand stay in the printed text
        const sentinel = this.GO_IN_OP_SENTINEL;
        const paren = '(' + sentinel + ')';
        let condition = text.trim();
        for (;;) {
            const collapsed = condition.split(paren).join(sentinel);
            if (collapsed === condition) {
                break;
            }
            condition = collapsed;
        }
        condition = condition.split(sentinel).join(name);
        if (this.goL3NilMapTermIsRedundant(node, read)) {
            condition = name;
        }
        return `_, ${name} := ${read.dictText}[${read.keyText}]; ${condition}`;
    }

    // hx10w8-GP03: `(k !== undefined) && (k in m)` on a proven map. The nil test is a conjunct of
    // the same condition, and Go evaluates an init clause before it, so the comma-ok read moves
    // inside the guard as one nested statement: the body runs on exactly the same terms.
    goInOpGuardedNestedIf(node, identation): string | undefined {
        if ((node?.kind !== SyntaxKind.IfStatement) || (node.elseStatement !== undefined)
            || (node.parent?.kind === SyntaxKind.IfStatement) || (node.thenStatement?.kind !== SyntaxKind.Block)) {
            return undefined;
        }
        const condition = this.goUnwrapParenthesizedNode(node.expression);
        if ((condition?.kind !== SyntaxKind.BinaryExpression) || (condition.operatorToken?.kind !== SyntaxKind.AmpersandAmpersandToken)) {
            return undefined;
        }
        const guard = this.goUnwrapParenthesizedNode(condition.left);
        let read = this.goUnwrapParenthesizedNode(condition.right);
        let negated = false;
        if (read?.kind === SyntaxKind.PrefixUnaryExpression) {
            if (read.operator !== SyntaxKind.ExclamationToken) {
                return undefined;
            }
            read = this.goUnwrapParenthesizedNode(read.operand);
            negated = true;
        }
        if ((read?.kind !== SyntaxKind.BinaryExpression) || (read.operatorToken?.kind !== SyntaxKind.InKeyword)) {
            return undefined;
        }
        const dict = this.goUnwrapParenthesizedNode(read.right);
        const keyNode = this.goUnwrapParenthesizedNode(read.left);
        // only the deref of a proved `*string` key: a `string` key needs no guard and an `any`
        // box cannot be read as a map key at all
        if ((keyNode?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(keyNode) !== '*string')
            || !this.goIsNonNilTestOf(guard, keyNode)) {
            return undefined;
        }
        if (this.goInOpPointerKeyProvenNonNil(node, keyNode)) {
            return undefined; // the init clause already reads it: keep the shorter form
        }
        if (this.goLocalIsRebound(this.goEnclosingFunction(keyNode), keyNode)) {
            return undefined;
        }
        const bookEntry = negated ? undefined : this.goL3BookEntryText(dict);
        const dictText = bookEntry ?? this.printNode(dict, 0);
        const dictMapType = (dict?.kind === SyntaxKind.Identifier ? this.goPrintedTypeOfExpression(dict, dictText) : undefined)
            ?? this.goInOpDictMapType(dict, dictText);
        const keyText = this.printNode(keyNode, 0);
        if (dictText.includes('\n') || keyText.includes('\n')
            || ((dictMapType !== 'map[string]any') && (dictMapType !== 'map[string]map[string]any'))) {
            return undefined;
        }
        const name = this.goIfInOpBindingName(node);
        const guardText = this.goUnwrapPrintedParens(this.printNode(guard, 0)).trim();
        if ((name === undefined) || guardText.includes('\n')) {
            return undefined;
        }
        const indent = this.getIden(identation);
        const inner = `${this.getIden(identation + 1)}if _, ${name} := ${dictText}[*${keyText}]; ${negated ? '!' : ''}${name}`;
        const body = this.printBlock(node.thenStatement, identation + 1, false);
        return this.printNodeCommentsIfAny(node, identation, `${indent}if ${guardText} {\n${inner}${body}\n${indent}}`);
    }

    // the single `key in dict` read the condition can bind: a map-typed identifier
    // receiver, a hand-written base map field or a pure book accessor, and a Go-string key.
    // The hoisted operands are identifiers/literals or side-effect-free getters, so moving the
    // read into the init clause cannot evaluate anything the condition would have skipped.
    goIfInOpRead(condition, statement?): any {
        const reads = [];
        const visit = (n) => {
            if ((n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken?.kind === SyntaxKind.InKeyword)) {
                const dict = this.goUnwrapParenthesizedNode(n.right);
                const key = this.goUnwrapParenthesizedNode(n.left);
                const keyIsText = (key?.kind === SyntaxKind.StringLiteral)
                    || (key?.kind === SyntaxKind.NoSubstitutionTemplateLiteral)
                    || (key?.kind === SyntaxKind.Identifier);
                const identifier = (dict?.kind === SyntaxKind.Identifier);
                const bookEntry = this.goL3UnderNegation(n) ? undefined : this.goL3BookEntryText(dict);
                if ((identifier || (dict?.kind === SyntaxKind.PropertyAccessExpression) || (dict?.kind === SyntaxKind.CallExpression) || (bookEntry !== undefined)) && keyIsText) {
                    const dictText = bookEntry ?? this.printNode(dict, 0);
                    let keyText = this.printNode(key, 0);
                    const dictMapType = (identifier ? this.goPrintedTypeOfExpression(dict, dictText) : undefined) ?? this.goInOpDictMapType(dict, dictText);
                    // a `*string` key the enclosing control flow proved non-nil reads through the deref
                    let keyType = this.goPrintedTypeOfExpression(key, keyText);
                    if ((keyType !== 'string') && this.goInOpPointerKeyProvenNonNil(statement, key)) {
                        keyText = '*' + keyText;
                        keyType = 'string';
                    }
                    if (!dictText.includes('\n') && !keyText.includes('\n')
                        && ((dictMapType === 'map[string]any') || (dictMapType === 'map[string]map[string]any'))
                        && (keyType === 'string')) {
                        reads.push({ inNode: n, dictText, keyText });
                    }
                }
            }
            n.forEachChild(visit);
        };
        visit(condition);
        return (reads.length === 1) ? reads[0] : undefined;
    }

    // hand-written BaseExchange fields (go/v4/exchange.go) declared as a Go map: a `key in this.X`
    // read over one is the same two-value map read InOp runs under its lock. Any other field type
    // (Balance/Positions/interfaces) keeps the helper, whose nil and non-string-key branches differ.
    // Orderbooks is absent on purpose: the go book-local pass proves a stored book from the
    // `!InOp(this.Orderbooks, key)` guard, so that guard must reach it as the helper call.
    GO_NATIVE_MAP_FIELDS: { [name: string]: string } = {
        'Options': 'map[string]any',
        'Has': 'map[string]any',
        'Features': 'map[string]any',
        'Fees': 'map[string]any',
        'Limits': 'map[string]any',
        'Trades': 'map[string]any',
        'Ohlcvs': 'map[string]map[string]any',
        'Clients': 'map[string]any', // FM-A9F L3: the ws client registry
        // hx10w8-GP03: declared `map[string]any` in go/v4/exchange.go
        'Timeframes': 'map[string]any',
        'Balance': 'map[string]any',
    };

    // the market/currency book accessors hand-written in go/v4/exchange_markets_book.go: each is a
    // load of the published immutable book, so a call is a pure read of a `map[string]any`
    GO_NATIVE_MAP_ACCESSORS = [ 'Markets', 'Markets_by_id', 'Currencies', 'Currencies_by_id' ];

    // the Go map type a `key in <dict>` receiver is *declared* with, for the dict shapes the
    // init clause can hold: a `this.<field>` of a hand-written map field, or a `this.<accessor>()`
    // book getter. undefined for every other receiver, which keeps the runtime helper. The field
    // and accessor names are matched on the *printed* Go text (this.Orderbooks, this.Markets()).
    goInOpDictMapType(dictNode, dictText?: string): string | undefined {
        if ((dictText !== undefined) && (dictText === this.goL3BookEntryText(dictNode))) {
            return 'map[string]any';
        }
        if (dictNode?.kind === SyntaxKind.Identifier) {
            // a GetArgMap-bound parameter is that Go map in the line that binds it; InOp only asks
            // membership, which the two-value read answers without the helper's deref of the value
            let decl: any;
            try {
                decl = this.checkerOrUndefined()?.getSymbolAtLocation(dictNode)?.valueDeclaration?.resolve();
            } catch (e) {
                decl = undefined;
            }
            return ((decl?.kind === SyntaxKind.Parameter) && (this.goGetArgParameterType(decl) === 'map[string]any')) ? 'map[string]any' : undefined;
        }
        const text = this.goUnwrapPrintedParens(dictText ?? '');
        const field = /^this\.([A-Za-z_]\w*)$/.exec(text);
        if ((field !== null) && (dictNode?.kind === SyntaxKind.PropertyAccessExpression) && (dictNode.expression?.kind === SyntaxKind.ThisKeyword)) {
            const name = field[1];
            if (this.GO_NATIVE_MAP_ACCESSORS.indexOf(name) >= 0) {
                return 'map[string]any'; // printed as the field, the build layer turns it into the accessor call
            }
            return Object.prototype.hasOwnProperty.call(this.GO_NATIVE_MAP_FIELDS, name) ? this.GO_NATIVE_MAP_FIELDS[name] : undefined;
        }
        const accessor = /^this\.([A-Za-z_]\w*)\(\)$/.exec(text);
        if ((accessor !== null) && (dictNode?.kind === SyntaxKind.CallExpression) && ((dictNode.arguments?.length ?? 0) === 0)) {
            return (this.GO_NATIVE_MAP_ACCESSORS.indexOf(accessor[1]) >= 0) ? 'map[string]any' : undefined;
        }
        return undefined;
    }

    // `ok` unless the statement already names it: the init clause would shadow that name
    goIfInOpBindingName(statement): string | undefined {
        const taken = new Set();
        const visit = (n) => {
            if ((n.kind === SyntaxKind.Identifier) && (typeof n.text === 'string')) {
                taken.add(n.text);
            }
            n.forEachChild(visit);
        };
        statement.forEachChild(visit);
        for (const candidate of ['ok', 'ok2', 'ok3']) {
            if (!taken.has(candidate)) {
                return candidate;
            }
        }
        return undefined;
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
            if (parent?.kind === SyntaxKind.CallExpression) {
                const callee = this.printNode(parent.expression, 0);
                if (this.comparisonHelpers.indexOf(callee) >= 0) {
                    return `-${printedText}`;
                }
            }
            // `a > -1` prints as IsGreaterThan(a, …); the relational wrappers all
            // normalise int/int64/float64 the same way the equality helpers do
            if (parent?.kind === SyntaxKind.BinaryExpression) {
                const op = parent.operatorToken.kind;
                if ((op === SyntaxKind.GreaterThanToken) || (op === SyntaxKind.GreaterThanEqualsToken)
                    || (op === SyntaxKind.LessThanToken) || (op === SyntaxKind.LessThanEqualsToken)) {
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
        if (node?.kind !== SyntaxKind.Identifier) {
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
            declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        } catch (e) {
            return undefined;
        }
        if (declaration?.kind !== SyntaxKind.VariableDeclaration && !this.goGetArgBoundParameter(node)) {
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
        if (node?.kind !== SyntaxKind.CallExpression) {
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
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (this.goIsReadOnlyCallArgument(node)) {
            return true;
        }
        return (node?.kind === SyntaxKind.PropertyAccessExpression)
            && (node.expression?.kind === SyntaxKind.ThisKeyword)
            && (node.name?.kind === SyntaxKind.Identifier);
    }

    // the native Go text for a condition operand the printer can type, or undefined
    // when the operand has to go through the truthiness helper. `(x)` is decided on
    // its operand and keeps the source parentheses, so the surrounding operator still
    // parses exactly the same way.
    goNativeCondition(node): string | undefined {
        if (node?.kind === SyntaxKind.Identifier) {
            return this.printInlineTruthy(node) ?? this.printInlineBoolBoxTruthy(node);
        }
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
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
        if ((node?.kind === SyntaxKind.CallExpression) && ((printed === 'true') || (printed === 'false'))) {
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
        return this.goIsControlClauseCondition(node) ? this.goStripControlClauseParens(expression) : expression;
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
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.SwitchStatement:
            return parent.expression === node;
        case SyntaxKind.ForStatement:
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
            if ((char === '(') || (char === '{')) {
                if ((char === '{') && this.goCompositeLitHasTypeName(text, index)) {
                    return true;
                }
                const next = this.goSkipBalanced(text, index, char, (char === '(') ? ')' : '}');
                if (next < 0) {
                    return false; // unbalanced text cannot be inspected any further
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
        const ranges = getLeadingCommentRanges(fullText, node.pos) ?? [];
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

    // the innermost statement being printed (undefined outside any statement)
    goStatement: any = undefined;

    // stdlib packages this file's native emissions call; printSourceFileStatements turns them
    // into the import declarations the emitted Go needs (an occurrence outside a file print,
    // e.g. the intellisense body, only marks a set that the next file print replaces)
    goFileStdlibImports = new Set<string>();

    // the packages of the source file printed last, sorted (what printSourceFileStatements put in
    // its leading import clause): a consumer that splices the printed body into a file it assembles
    // itself declares exactly these instead of scanning the text for `pkg.Name(`
    goPrintedFileStdlibImports: string[] = [];

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
        this.goPrintedFileStdlibImports = [...fileImports].sort();
        if (fileImports.size === 0) {
            return body;
        }
        // a native emission needs its stdlib package, and an import declaration must precede
        // every other declaration: the file assembly puts this text right behind the generated
        // header, so the imports lead it (gofmt keeps an import clause before the first decl)
        return [...fileImports].sort().map((path) => `import "${path}"`).join("\n") + "\n\n" + body;
    }

    goBinaryMemoized<T>(node, key: string, compute: () => T): T {
        const outermost = this.goBinaryMemo === undefined;
        const memo = this.goBinaryMemo ??= new Map();
        try {
            let byKey = memo.get(node);
            if (byKey?.has(key)) {
                const cached = byKey.get(key);
                return cached;
            }
            const value = compute();
            if (byKey === undefined) {
                memo.set(node, byKey = new Map());
            }
            byKey.set(key, value);
            return value;
        } finally {
            if (outermost) {
                this.goBinaryMemo = undefined;
            }
        }
    }

    // the printer state a binary print reads besides the node: depth, level and the recursion guards
    goBinaryContextKey(): string {
        return `${this.goExprDepth}|${this.goStatementLevel}|${this.goLocalTypeResolution.size}|${this.goDeclaredTypeInProgress.size}`;
    }

    goPrintBinaryMemoized(node, identation: number): string {
        const key = `print|${this.goBinaryContextKey()}|${identation}`;
        return this.goBinaryMemoized(node, key, () => this.goControlClauseParens(node, super.printNode(node, identation)));
    }

    printNode(node, identation = 0): string {
        if (node !== undefined && isSourceFile(node)) {
            this.className = "undefined";
            return this.printSourceFileStatements(node, identation);
        }
        if (node?.kind === SyntaxKind.BinaryExpression && GO_ARITHMETIC_KINDS.indexOf(node.operatorToken.kind) >= 0) {
            return this.goPrintBinaryMemoized(node, identation);
        }
        const isStatement = node !== undefined && isStatementNode(node) && node.kind !== SyntaxKind.Block;
        const previousLevel = this.goStatementLevel;
        const previousStatement = this.goStatement;
        if (isStatement) {
            this.goStatementLevel = identation;
            this.goStatement = node;
        }
        try {
            const printed = super.printNode(node, identation);
            // the if/for/switch conditions go through here (printCondition resolves the
            // bool and the falsy/truthy paths before printing the node's text)
            return this.goControlClauseParens(node, printed);
        } finally {
            this.goStatementLevel = previousLevel;
            this.goStatement = previousStatement;
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

    printIfStatement(node, identation) {
        // hx10w8-GP03: a nil-guarded pointer key needs the read inside the guard
        const nested = this.goInOpGuardedNestedIf(node, identation);
        if (nested !== undefined) {
            return nested;
        }
        const hoisted = this.goL3OrHoistIf(node, identation);
        if (hoisted !== undefined) {
            return hoisted;
        }
        return super.printIfStatement(node, identation);
    }

    printCondition(node, identation) {
        // hx10w5-G14: the `in` operand an enclosing `if` bound in its init clause
        const substituted = this.goInOpSubstitutedText(node);
        if (substituted !== undefined) {
            return `${this.getIden(identation)}${substituted}`;
        }
        const initClause = this.goInOpIfInitClause(node);
        if (initClause !== undefined) {
            return `${this.getIden(identation)}${initClause}`;
        }
        // RFM-G4 G09: `(this.f !== undefined && this.f !== null)` collapses to one nil test of the cache field, which
        // needs no parentheses as an operand of `&&` / `||`
        const cacheDup = ((node?.kind === SyntaxKind.ParenthesizedExpression) && (node.expression?.kind === SyntaxKind.BinaryExpression)
            && (node.parent?.kind === SyntaxKind.BinaryExpression)
            && ((node.parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken) || (node.parent.operatorToken.kind === SyntaxKind.BarBarToken)))
            ? this.goG09CacheDuplicateNilTest(node.expression) : undefined;
        if (cacheDup !== undefined) {
            return `${this.getIden(identation)}${cacheDup}`;
        }
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
        const inNode = (node?.kind === SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        if (inNode?.kind === SyntaxKind.BinaryExpression && inNode.operatorToken.kind === SyntaxKind.InKeyword) {
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
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return pointee === 'string';
        case SyntaxKind.NumericLiteral:
            return (pointee === 'int') || (pointee === 'int64') || (pointee === 'float64');
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return pointee === 'bool';
        }
        const otherType = this.goDeclaredTypeOfIdentifier(otherNode);
        return otherType === pointee;
    }

    // a node the printer prints as a Go string constant: both literal forms are
    // emitted with the printer's string quote token, so the comparison is a plain
    // Go string comparison
    goIsStringLiteralNode(node): boolean {
        return (node?.kind === SyntaxKind.StringLiteral) || (node?.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
    }

    // the deref arms print their operand twice, so it must read the same value both times: an
    // identifier is a plain read, and a string accessor call whose arguments are all
    // identifiers/literals re-reads them (no statement runs between the two evaluations).
    goDerefRepeatableOperand(node, printedText: string): boolean {
        if (node?.kind === SyntaxKind.Identifier) {
            return true;
        }
        if (node?.kind !== SyntaxKind.CallExpression) {
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
        switch (this.goUnwrapParenthesizedNode(node)?.kind) {
        case SyntaxKind.Identifier:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NullKeyword:
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
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration?.resolve();
        if (declaration?.kind !== SyntaxKind.Parameter) {
            return false;
        }
        return this.printParameterType(declaration) === 'string';
    }

    // true when the operand prints as a declared Go map or slice (never a scalar or a pointer):
    // `x == nil` is then the native absent-value test the helper reproduced
    goDeclaredContainerOperand(node): string | undefined {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const goType = this.goDeclaredTypeOfIdentifier(node);
        if ((goType === 'map[string]any') || (goType === '[]any') || (goType === '[]string')) {
            return goType;
        }
        // RF-go-6-D: a book interface local is nil exactly when the cache / OrderBookTyped answered no book
        if ((goType !== undefined) && (goType === this.goOrderBook?.type)) {
            return goType;
        }
        return undefined;
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
        const cacheNil = this.goG09CacheNilCompare(left, right, leftText, rightText, isEq, lFam, rFam);  // RFM-G4 G09
        if (cacheNil !== undefined) {
            return cacheNil;
        }
        // a local the printer declared a Go map or slice: its absent value is a nil map/slice,
        // for which the native test answers what the box's nil did
        if (!lPtr && !rPtr && (lFam === undefined) && (rFam === 'nil') && (this.goDeclaredContainerOperand(left) !== undefined)) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (!lPtr && !rPtr && (rFam === undefined) && (lFam === 'nil') && (this.goDeclaredContainerOperand(right) !== undefined)) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
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
        // both operands print as a concrete Go numeric kind (a declared int/int64/float64, or a
        // constant that fits the other side): IsEqual converts to that same kind, never sees nil
        const numericKind = (!lPtr && !rPtr) ? this.goNativeNumericEqualityKind(left, leftText, right, rightText) : undefined;
        if (numericKind !== undefined) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // the declared-local table names `string` for this identifier (or the signature printer emits the
        // parameter as `string`): a `var x string` cannot hold a pointer or nil, so a string-literal
        // comparison equals the helper. A local ever written another type is reported `any` and boxed.
        if (!lPtr && !rPtr) {
            if ((this.goIsBareStringOperand(left) && this.goIsStringLiteralNode(right))
                || (this.goIsBareStringOperand(right) && this.goIsStringLiteralNode(left))) {
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
            case SyntaxKind.StringLiteral:
            case SyntaxKind.NoSubstitutionTemplateLiteral:
            case SyntaxKind.TrueKeyword:
            case SyntaxKind.FalseKeyword:
                return true;
            }
            return false;
        };
        const literalMatchesBox = (boxFam: string | undefined, litNode, litFam: string | undefined): boolean =>
            ((litFam === 'string') || (litFam === 'bool')) && isLiteral(litNode)
            && ((boxFam === litFam) || (boxFam === undefined));
        if ((lBox && literalMatchesBox(lNilFam, right, rFam)) || (rBox && literalMatchesBox(rNilFam, left, lFam))) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // IsEqual(GetValue(market, "spot"), true): the checker proves the read holds
        // a bool or nil (Market.spot), and every other dynamic type is unequal to a
        // Go bool, nil included — the same predicate as the helper
        const isBoolLiteral = (node): boolean =>
            (node?.kind === SyntaxKind.TrueKeyword) || (node?.kind === SyntaxKind.FalseKeyword);
        if ((!lPtr && isBoolLiteral(right) && (this.goScalarFamilyWithNil(left) === 'bool') && this.goBoxedElementRead(left, leftText))
            || (!rPtr && isBoolLiteral(left) && (this.goScalarFamilyWithNil(right) === 'bool') && this.goBoxedElementRead(right, rightText))) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // two boxes of one non-numeric family: both hold that scalar or nil
        if (lBox && rBox && (lNilFam !== undefined) && (lNilFam !== 'number') && (lNilFam === rNilFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        return undefined;
    }

    // the kind a native `==` compares two numeric operands in; undefined keeps IsEqual. Two
    // constants are left to the helper (nothing to type), as is any mix Go would refuse.
    goNativeNumericEqualityKind(left, leftText: string, right, rightText: string): string | undefined {
        if (this.goIsNumericConstant(left) && this.goIsNumericConstant(right)) {
            return undefined;
        }
        const leftKind = this.goOperandNumericKind(left, leftText);
        const rightKind = this.goOperandNumericKind(right, rightText);
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        return this.goComparisonKind(left, leftKind, right, rightKind);
    }

    // the Go numeric kind an operand's static type is, or undefined when it stays
    // `any` (unknown helper result, union, pointer box): only a concrete kind can
    // join a comparison the Go compiler accepts
    goOperandNumericKind(node, printedText: string): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === SyntaxKind.Identifier) {
            const declared = this.goDeclaredTypeOfIdentifier(node);
            if (declared !== undefined) {
                return (GO_NUMERIC_KINDS.indexOf(declared) >= 0) ? declared : undefined;
            }
            return this.goLiteralTypedLocalKind(node);
        }
        if (this.goIsNumericConstant(node)) {
            return this.goNumericLiteralKind(node);
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
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
        const declaration = symbol?.valueDeclaration?.resolve();
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        const declarationList = declaration.parent;
        if (declarationList?.kind !== SyntaxKind.VariableDeclarationList
            || declarationList.parent?.kind === SyntaxKind.FirstStatement) {
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
        if (node?.kind !== SyntaxKind.PrefixUnaryExpression) {
            return false;
        }
        if ((node.operator !== SyntaxKind.MinusToken) && (node.operator !== SyntaxKind.PlusToken)) {
            return false;
        }
        return node.operand?.kind === SyntaxKind.NumericLiteral;
    }

    // a numeric constant operand: an integer/float literal, with an optional sign
    goIsNumericConstant(node): boolean {
        return (node?.kind === SyntaxKind.NumericLiteral) || this.goIsSignedNumericLiteral(node);
    }

    // the constant's value with its sign; NaN for anything but a numeric constant
    goNumericConstantValue(node): number {
        if (this.goIsSignedNumericLiteral(node)) {
            const value = Number(node.operand.text.replaceAll('_', ''));
            return (node.operator === SyntaxKind.MinusToken) ? -value : value;
        }
        if (node?.kind !== SyntaxKind.NumericLiteral) {
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
        if (node?.kind !== SyntaxKind.Identifier) {
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
        const greater = (operator === '>') || (operator === '>=');
        if (leftNil && !rightNil) {
            return greater ? `(${leftText} != nil && ${lv} ${operator} ${rv})` : `(${leftText} == nil || ${lv} ${operator} ${rv})`;
        }
        if (!leftNil && rightNil) {
            return greater ? `(${rightText} == nil || ${lv} ${operator} ${rv})` : `(${rightText} != nil && ${lv} ${operator} ${rv})`;
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
        if (node?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = node.operatorToken?.kind;
        if ((op !== SyntaxKind.ExclamationEqualsToken) && (op !== SyntaxKind.ExclamationEqualsEqualsToken)) {
            return false;
        }
        return (this.goIsSameSymbol(node.left, ident) && this.goIsNilLiteral(node.right))
            || (this.goIsSameSymbol(node.right, ident) && this.goIsNilLiteral(node.left));
    }

    // a null/undefined literal, or any expression the checker types as one
    goIsNilLiteral(node): boolean {
        if ((node?.kind === SyntaxKind.NullKeyword) || (node?.kind === SyntaxKind.UndefinedKeyword)) {
            return true;
        }
        return (node?.kind === SyntaxKind.Identifier) && (this.goScalarFamily(node) === 'nil');
    }

    goIsSameSymbol(a, b): boolean {
        if ((a?.kind !== SyntaxKind.Identifier) || (b?.kind !== SyntaxKind.Identifier)) {
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

    // [guarded child, guarding condition] fields of the constructs a nil guard dominates
    goNilGuardFields: { [kind: number]: [string, string] } = {
        [SyntaxKind.IfStatement]: ['thenStatement', 'expression'],
        [SyntaxKind.WhileStatement]: ['statement', 'expression'],
        [SyntaxKind.ForStatement]: ['statement', 'condition'],
        [SyntaxKind.ConditionalExpression]: ['whenTrue', 'condition'],
    };

    // true when the enclosing control flow already proves the identifier non-nil at this node: an
    // earlier conjunct of an `&&` chain, or the condition of a wrapping if/loop/ternary containing the
    // node. A local rebound anywhere in its function never counts — the guard may be dead by then.
    goHasEnclosingNilGuard(ident): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const declaration = checker.getSymbolAtLocation(ident)?.valueDeclaration?.resolve();
        if (this.goLocalIsRebound(this.goEnclosingFunction(declaration ?? ident), ident)) {
            return false;
        }
        let child = ident;
        let parent = ident?.parent;
        while (parent !== undefined) {
            const kind = parent.kind;
            if ((kind === SyntaxKind.ParenthesizedExpression) || (kind === SyntaxKind.VariableStatement)
                || (kind === SyntaxKind.ExpressionStatement) || (kind === SyntaxKind.Block)
                || (kind === SyntaxKind.ReturnStatement) || (kind === SyntaxKind.ElementAccessExpression)
                || (kind === SyntaxKind.CallExpression) || (kind === SyntaxKind.PropertyAccessExpression)
                || (kind === SyntaxKind.ObjectLiteralExpression) || (kind === SyntaxKind.PropertyAssignment)
                || (kind === SyntaxKind.ArrayLiteralExpression) || (kind === SyntaxKind.AwaitExpression)
                || (kind === SyntaxKind.CaseClause) || (kind === SyntaxKind.SwitchStatement)
                || (kind === SyntaxKind.DoStatement) || (kind === SyntaxKind.LabeledStatement)) {
                // the guard still dominates everything below such a wrapper
                child = parent;
                parent = parent.parent;
                continue;
            }
            if (kind === SyntaxKind.BinaryExpression) {
                const op = parent.operatorToken?.kind;
                if ((op === SyntaxKind.AmpersandAmpersandToken) && (child === parent.right)
                    && this.goConditionProvesNonNil(parent.left, ident)) {
                    return true;
                }
                // `a || b` and a left conjunct are evaluated before the guard, so they
                // prove nothing; the guard of an enclosing construct still applies
                child = parent;
                parent = parent.parent;
                continue;
            }
            const guard = this.goNilGuardFields[kind];
            if (guard !== undefined) {
                if ((child === parent[guard[0]]) && this.goConditionProvesNonNil(parent[guard[1]], ident)) {
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
        if ((inner.kind !== SyntaxKind.BinaryExpression) || (inner.operatorToken?.kind !== SyntaxKind.AmpersandAmpersandToken)) {
            return false;
        }
        return this.goConditionProvesNonNil(inner.left, ident) || this.goConditionProvesNonNil(inner.right, ident);
    }

    goUnwrapParenthesizedNode(node) {
        let current = node;
        while (current?.kind === SyntaxKind.ParenthesizedExpression) {
            current = current.expression;
        }
        return current;
    }

    // an operand a short-circuit may skip without any observable difference: no calls,
    // no assignments, nothing the helper would have evaluated exactly once
    goIsPureComparisonOperand(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.Identifier:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.PropertyAccessExpression:
            return true;
        case SyntaxKind.PrefixUnaryExpression:
            return (node.operator === SyntaxKind.MinusToken) && this.goIsPureComparisonOperand(node.operand);
        case SyntaxKind.ParenthesizedExpression:
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
        if (expression?.kind === SyntaxKind.AsExpression) {
            // transform (this as any) into this, () and as any are not necessary
            return this.getIden(identation) + this.printNode(expression, 0);
        }
        if (expression?.kind === SyntaxKind.ArrowFunction) {
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
        const rightSide = node.name.text;

        let rawExpression = undefined;

        switch(rightSide) {
        case 'length':
                const type = (this.getChecker() as Checker).getTypeAtLocation(expression); // eslint-disable-line
            // this.warnIfAnyType(node, type.flags, leftSide, "length");
            // rawExpression = this.isStringType(type.flags) ? `(string${leftSide}).Length` : `(${leftSide}.Cast<object>().ToList()).Count`;
            rawExpression = this.printInlineArrayLength(expression, leftSide, node) ?? this.goHx4G06DerefLength(expression, leftSide, node) ?? (this.isStringType(type.flags) ? `GetLength(${leftSide})` : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`); // `(${leftSide}.Cast<object>()).ToList().Count`
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

    // The Go type of a GetArg-bound optional local (from the printed default, or the declared type
    // for a nil default), or undefined to keep `any`; the retype needs goLocalIsSafeToType,
    // goParameterKeepsNilCompareNative and goGetArgConsumersAreSafe to agree.
    goGetArgLocalType(body, param, printedDefault: string): string | undefined {
        const method: any = param?.parent;
        const excluded = GO_GETARG_EXCLUDED_POSITIONS[method?.name?.text];
        if ((excluded !== undefined) && excluded.includes(method.parameters.indexOf(param))) {
            return undefined;
        }
        // an explicit `any` annotation admits values of other shapes than the default (api lists),
        // unless it only restates an override of a base parameter the base leaves unannotated
        if ((param?.type?.kind === SyntaxKind.AnyKeyword) && !this.goGetArgBaseParamIsUnannotated(param)) {
            return undefined;
        }
        const shape = (printedDefault ?? '').trim();
        const byDefault = this.goGetArgTypeOfShape(shape);
        if (byDefault !== undefined) {
            // a declared type naming no single Go type (IndexType = number | string) admits other shapes;
            // an admitted `any` restatement binds by its default, as the base does
            if ((param?.type !== undefined) && (param.type.kind !== SyntaxKind.AnyKeyword)
                && !this.goGetArgDeclaredTypeCandidates(param).some((t) => t.replace(/^\*/, '') === byDefault)) {
                return undefined;
            }
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

    // true when the method overrides a base method whose parameter at the same position has no
    // type annotation and a default of the same syntax kind (the base binds it through its twin)
    goGetArgBaseParamIsUnannotated(param): boolean {
        const method: any = param?.parent;
        const name = method?.name?.text;
        const index = method?.parameters?.indexOf(param) ?? -1;
        const cls: any = method?.parent;
        const checker: any = this.checkerOrUndefined();
        if ((name === undefined) || (index < 0) || (checker === undefined) || (param.initializer === undefined)) {
            return false;
        }
        for (const clause of (cls?.heritageClauses ?? [])) {
            if (clause.token !== SyntaxKind.ExtendsKeyword) {
                continue;
            }
            for (const expr of (clause.types ?? [])) {
                const baseDecl: any = checker.getTypeAtLocation(expr)?.getProperty?.(name)?.valueDeclaration?.resolve();
                const baseParam: any = baseDecl?.parameters?.[index];
                if (baseParam === undefined) {
                    return false;
                }
                return (baseParam.type === undefined) && (baseParam.initializer !== undefined)
                    && (baseParam.initializer.kind === param.initializer.kind);
            }
        }
        return false;
    }

    // a use of a nil-defaulted map local that only reads it: an element read, `k in x`, or the
    // receiver of a helper that treats a nil map like an absent value (no IsDictionary/IsEqual)
    goGetArgNilMapUseOnlyReads(n): boolean {
        const parent: any = n.parent;
        if ((parent?.kind === SyntaxKind.ElementAccessExpression) || (parent?.kind === SyntaxKind.BinaryExpression)) {
            return this.goSafeDictUseReadsTheMap(n);
        }
        if ((parent?.kind !== SyntaxKind.CallExpression) || (parent.arguments.indexOf(n) !== 0)) {
            return false;
        }
        const callee = this.goPrintedCallee(this.printNode(parent, 0));
        return (callee !== undefined) && (GO_GETARG_NIL_MAP_READERS.indexOf(callee.replace(/^this\./, '')) >= 0);
    }

    // a nil []string reads like the absent box: `x.length` / GetArrayLength is 0, `x[i]` (GetValue)
    // is nil, InArray finds nothing, and a defaulted Strings position's GetArg folds it to its default
    goGetArgNilStringSliceUseOnlyReads(n): boolean {
        const parent: any = n.parent;
        if ((parent?.kind === SyntaxKind.PropertyAccessExpression) && (parent.expression === n)) {
            return (parent.name?.text === 'length') && (parent.parent?.kind !== SyntaxKind.CallExpression || parent.parent.expression !== parent)
                && !((parent.parent?.kind === SyntaxKind.BinaryExpression) && (parent.parent.left === parent));
        }
        if (parent?.kind === SyntaxKind.ElementAccessExpression) {
            return this.goSafeDictUseReadsTheMap(n);
        }
        if ((parent?.kind !== SyntaxKind.CallExpression) || (parent.expression === n)) {
            return false;
        }
        const argIndex = parent.arguments.indexOf(n);
        const callee: any = parent.expression;
        if ((callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.expression?.kind === SyntaxKind.ThisKeyword)
            && (callee.name?.text === 'inArray') && (argIndex === 1)) {
            return true;
        }
        if (!this.goGetArgPositionIsDefaulted(callee, argIndex)) {
            return false;
        }
        let decl: any;
        try {
            decl = this.getChecker().getSymbolAtLocation(callee)?.valueDeclaration?.resolve();
        } catch (e) {
            decl = undefined;
        }
        // the callee binds it as `any` or through GetArgStringSlice, never a []any twin
        const declared = String(decl?.parameters?.[argIndex]?.type?.getText() ?? '').replace(/\s+/g, ' ');
        return (declared === 'Strings') || (declared === 'string[]');
    }

    // the Go type the printed default names, or undefined when it names none
    goGetArgTypeOfShape(shape: string): string | undefined {
        const shapes: [RegExp, string][] = [[/^map\[string\]any\{/, 'map[string]any'], [/^\[map\[string\]any\]\{/, '[]map[string]any'],
            [/^\[\]string\{/, '[]string'], [/^\[\]any\{/, '[]any'], [/^"/, 'string'], [/^(?:true|false)$/, 'bool'], [/^(?:-?[0-9]|math\.)/, 'int64']];
        return shapes.find(([re]) => re.test(shape))?.[1];
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
        switch (declared) {
        case 'Int': case 'Integer': case 'int': return 'int64';
        case 'Num': case 'number': case 'Float': return 'float64';
        case 'Bool': case 'boolean': return 'bool';
        case 'Str': case 'string': case 'String': return 'string';
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
        const name = param.name.text;
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
        return this.goGetArgUsesAreSafe(body, param, param.name.text, goType, nilable, new Set());
    }

    // `(x === undefined) ? d : x` / `x !== undefined ? x : d`: the arm holding `n` only runs when
    // the same name is not nil, so the copy never boxes a typed nil
    goGetArgArmIsNilGuarded(n: any, cond: any): boolean {
        let test: any = cond.condition;
        while (test?.kind === SyntaxKind.ParenthesizedExpression) {
            test = test.expression;
        }
        if ((test?.kind !== SyntaxKind.BinaryExpression)) {
            return false;
        }
        const isNil = (e: any) => (e?.kind === SyntaxKind.NullKeyword) || ((e?.kind === SyntaxKind.Identifier) && (e.text === 'undefined'));
        const sameName = (e: any) => (e?.kind === SyntaxKind.Identifier) && (e.text === n.text);
        if (!((sameName(test.left) && isNil(test.right)) || (sameName(test.right) && isNil(test.left)))) {
            return false;
        }
        const op = test.operatorToken?.kind;
        const eq = (op === SyntaxKind.EqualsEqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsToken);
        const ne = (op === SyntaxKind.ExclamationEqualsEqualsToken) || (op === SyntaxKind.ExclamationEqualsToken);
        let arm: any = n;
        while (arm.parent !== cond) {
            arm = arm.parent;
        }
        return (eq && (arm === cond.whenFalse)) || (ne && (arm === cond.whenTrue));
    }

    // a native int64/float64 arithmetic result boxes the same number its Add/Subtract/... helper form
    // boxed, so it reads like that helper write rather than a value-family write
    goGetArgWriteIsNativeArithmetic(rhs: any): boolean {
        let e: any = rhs;
        while (e?.kind === SyntaxKind.ParenthesizedExpression) {
            e = e.expression;
        }
        const ops = [SyntaxKind.PlusToken, SyntaxKind.MinusToken, SyntaxKind.AsteriskToken, SyntaxKind.SlashToken, SyntaxKind.PercentToken];
        if ((e?.kind !== SyntaxKind.BinaryExpression) || !ops.includes(e.operatorToken?.kind)) {
            return false;
        }
        const goType = this.goNativeArithmeticType(e) ?? this.goConstantProductKind(e);
        return (goType === 'int64') || (goType === 'float64');
    }

    // the body-local `r` a copy `let r = x` / `r = x` lands in (the value, not the box, is copied)
    goGetArgCopyTarget(use: any, body: any): any {
        const parent: any = use.parent;
        let target: any;
        if ((parent?.kind === SyntaxKind.VariableDeclaration) && (parent.initializer === use)) {
            target = parent;
        } else if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.right === use)
            && (parent.operatorToken?.kind === SyntaxKind.EqualsToken) && (parent.left?.kind === SyntaxKind.Identifier)
            && (parent.parent?.kind === SyntaxKind.ExpressionStatement)) {
            try {
                target = this.getChecker().getSymbolAtLocation(parent.left)?.valueDeclaration?.resolve();
            } catch (e) {
                target = undefined;
            }
        }
        if ((target?.kind !== SyntaxKind.VariableDeclaration) || (target.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        let inBody = false;
        for (let p: any = target.parent; p !== undefined; p = p.parent) {
            inBody = inBody || (p === body);
        }
        // a value-typed write (`r = "s"`) may type the copy as the pointer's value family
        let valueWrite = false;
        const visit = (n: any): void => {
            if (valueWrite) {
                return;
            }
            if ((n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken?.kind === SyntaxKind.EqualsToken)
                && (n.left?.kind === SyntaxKind.Identifier) && (n.left.text === target.name.text)) {
                valueWrite = this.goGetArgIsValueType(String(this.goTypeOfInitializer(n.right, this.printNode(n.right, 0))))
                    && !this.goGetArgWriteIsNativeArithmetic(n.right);
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return (inBody && !valueWrite) ? target : undefined;
    }

    goGetArgUsesAreSafe(body, param, name: string, goType: string, nilable: boolean, seen: Set<any>, boxed = false): boolean {
        seen.add(param);
        const table: any = this.CCXT_GO_GETARG_SAFE_CONSUMERS ?? {};
        const pointer = goType.startsWith('*');
        let safe = true;
        const verdictOf = (callee: string, argIndex: number): string => {
            // the table is keyed by the printed Go callee (`this.market` prints `this.Market`); a
            // pointer is unwrapped by derefScalar, a nil map is not, so only pointers fold the case
            const goName = callee.charAt(0).toUpperCase() + callee.slice(1);
            const entry = table[callee] ?? (pointer ? (table[goName] ?? table[goName + 'Async']) : undefined);
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
            if ((n?.kind === SyntaxKind.Identifier) && (n.text === name)) {
                let symbol;
                try {
                    symbol = this.getChecker().getSymbolAtLocation(n);
                } catch (e) {
                    symbol = undefined;
                }
                if (symbol?.valueDeclaration?.resolve() === param) {
                    const parent: any = n.parent;
                    if (parent === param) {
                        return;                     // the parameter's own name is not a use
                    }
                    if (nilable && (goType === 'map[string]any')) {
                        // goLocalIsSafeToType already matched the type of an assigned value
                        const assigned = (parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n)
                            && (parent.operatorToken?.kind === SyntaxKind.EqualsToken);
                        if (assigned || this.goGetArgNilMapUseOnlyReads(n)) {
                            return;
                        }
                    }
                    if (nilable && (goType === '[]string') && this.goGetArgNilStringSliceUseOnlyReads(n)) {
                        return;
                    }
                    if (pointer && (parent?.kind === SyntaxKind.BinaryExpression)) {
                        // a write already type-matched by goLocalIsSafeToType, or the key of `x in d` (InOp derefs it)
                        const op = parent.operatorToken?.kind;
                        if ((parent.left === n) && ((op === SyntaxKind.EqualsToken) || (op === SyntaxKind.InKeyword))) {
                            return;
                        }
                        // `x === 'lit'`: a pointer operand prints nil-guarded native or through IsEqual (derefs)
                        const other: any = (parent.left === n) ? parent.right : parent.left;
                        const equality = [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken].includes(op);
                        if (equality && ((other?.kind === SyntaxKind.StringLiteral) || (other?.kind === SyntaxKind.NumericLiteral))) {
                            return;
                        }
                    }
                    // a copy (ternary arm, `let r = x`, `r = x`) hands the value to a body local whose
                    // own uses must pass the same rules; an `any` alias prints its nil tests via IsEqual,
                    // which derefs a nil pointer but not a nil map, so containers need a nil-guarded arm
                    let use: any = n;
                    let guarded = false;
                    while ((use.parent?.kind === SyntaxKind.ParenthesizedExpression)
                        || ((use.parent?.kind === SyntaxKind.ConditionalExpression) && (use.parent.condition !== use))) {
                        if (use.parent.kind === SyntaxKind.ConditionalExpression) {
                            guarded = guarded || this.goGetArgArmIsNilGuarded(n, use.parent);
                        }
                        use = use.parent;
                    }
                    const target = (pointer || nilable) ? this.goGetArgCopyTarget(use, body) : undefined;
                    if (target !== undefined) {
                        if ((!pointer && guarded) || seen.has(target)) {
                            return;
                        }
                        safe = this.goGetArgUsesAreSafe(body, target, target.name.text, goType, nilable, seen, true);
                        return;
                    }
                    if ((use !== n) && (pointer || nilable)) {
                        safe = pointer && this.goGetArgPointerStoredAsValue(use, param);
                        return;
                    }
                    // a non-nil container arm hands the same map/list value on (as before copies were followed)
                    if (parent?.kind === SyntaxKind.BinaryExpression) {
                        const other: any = (parent.left === n) ? parent.right : parent.left;
                        const isNullTest = (other?.kind === SyntaxKind.NullKeyword)
                            || ((other?.kind === SyntaxKind.Identifier) && (other.text === 'undefined'));
                        if (isNullTest) {
                            // an `any` alias tests the box through IsEqual: a nil map box is not nil
                            safe = pointer || !boxed;
                            return;
                            // `x == nil` / `x != nil`: native for a pointer and for a container
                            // (a nil map compares equal to nil exactly like the untyped nil box
                            // did when the value came in untyped); a value type never gets here.
                            safe = true;
                            return;
                        }
                    }
                    if (parent?.kind === SyntaxKind.CallExpression) {
                        const args: any[] = parent.arguments ?? [];
                        const argIndex = args.indexOf(n);
                        const callee: any = parent.expression;
                        let calleeName = (callee?.name !== undefined) ? callee.name.text
                            : ((callee?.text !== undefined) ? callee.text : undefined);
                        // Math.min / Math.max print as the deref-aware mathMin / mathMax
                        if ((callee?.expression?.text === 'Math') && ((calleeName === 'min') || (calleeName === 'max'))) {
                            calleeName = 'math' + calleeName.charAt(0).toUpperCase() + calleeName.slice(1);
                        }
                        if (calleeName === undefined) {
                            safe = !pointer && !nilable;
                            return;
                        }
                        const verdict = verdictOf(calleeName, argIndex);
                        if ((verdict === 'unsafe') || ((verdict === 'container') && nilable)) {
                            safe = false;
                            return;
                        }
                        if ((calleeName === 'IsEqual') && nilable) {
                            // IsEqual(x, nil) tests the *box*: an untyped nil answered true, a nil
                            // map is not equal to nil
                            const other: any = (argIndex === 0) ? args[1] : args[0];
                            const otherIsNil = (other === undefined) || (other?.kind === SyntaxKind.NullKeyword)
                                || ((other?.kind === SyntaxKind.Identifier) && (other.text === 'undefined'));
                            if (otherIsNil) {
                                safe = false;
                                return;
                            }
                        }
                        // GetArg folds a nil map box to its default, and a defaulted position binds through GetArg or its
                        // twins, which deref a pointer and fold a nil one: both read it as absent
                        if (verdict === 'unknown') {
                            safe = ((nilable && (goType === 'map[string]any')) || pointer) && this.goGetArgPositionIsDefaulted(callee, argIndex);
                            return;
                        }
                        if (nilable && !pointer && this.goGetArgPassesIntoContainerDefault(callee, argIndex)) {
                            safe = false;
                            return;
                        }
                        safe = true;
                        return;
                    }
                    if (parent?.kind === SyntaxKind.ExpressionStatement) {
                        safe = true;                 // `_ = x` and other inert statements
                        return;
                    }
                    if (pointer && this.goGetArgPointerStoredAsValue(n, param)) {
                        safe = true;
                        return;
                    }
                    if (pointer && this.goGetArgPointerInHelperArithmetic(n)) {
                        safe = true;
                        return;
                    }
                    // a bare read hands the local on as `any`: a pointer or a nil-defaulted container would
                    // no longer compare equal to nil there, so both keep the box
                    safe = !pointer && !nilable;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return safe;
    }

    // `x / 1000`, `x - 1`, `x > 0`: printed through Divide/Subtract/…/IsGreaterThan, which
    // derefScalar both operands at entry (checked on the printed text by the caller's diff)
    goGetArgPointerInHelperArithmetic(n: any): boolean {
        const parent: any = n.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const ops = [SyntaxKind.SlashToken, SyntaxKind.MinusToken, SyntaxKind.AsteriskToken, SyntaxKind.PercentToken,
            SyntaxKind.GreaterThanToken, SyntaxKind.LessThanToken, SyntaxKind.GreaterThanEqualsToken, SyntaxKind.LessThanEqualsToken];
        if (!ops.includes(parent.operatorToken?.kind)) {
            return false;
        }
        const printed = this.printNode(parent, 0).trim();
        return /^(?:\(\s*)*(?:Divide|Subtract|Multiply|Mod|IsGreaterThan|IsLessThan|IsGreaterThanOrEqual|IsLessThanOrEqual)\(/.test(printed);
    }

    // `request[k] = x` / `{ k: x }`: the pointer lands in an `any` dictionary whose readers
    // (GetValue, Urlencode, Json, IsEqual) derefScalar it; a `*Request` builder returns that
    // dictionary to its caller, so it keeps the box
    goGetArgPointerStoredAsValue(n: any, param: any): boolean {
        const parent: any = n.parent;
        const stored = ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.right === n)
                && (parent.operatorToken?.kind === SyntaxKind.EqualsToken)
                && (parent.left?.kind === SyntaxKind.ElementAccessExpression))
            || ((parent?.kind === SyntaxKind.PropertyAssignment) && (parent.initializer === n));
        let method: any = param?.parent;
        while ((method !== undefined) && !isFunctionLike(method)) {
            method = method.parent;
        }
        const methodName = String(method?.name?.text ?? '');
        return stored && !methodName.endsWith('Request');
    }

    // element `index` of a tuple-typed call result is `Dict` (`[T, Dict]`); the Go tuple holds
    // that map, so MapTyped reads the same dictionary back
    goTupleElementIsDict(right: any, index: number): boolean {
        const checker: any = this.checkerOrUndefined();
        if ((checker === undefined) || (index < 0)) {
            return false;
        }
        const expr: any = (right?.kind === SyntaxKind.AwaitExpression) ? right.expression : right;
        if (expr?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const type: any = checker.getTypeAtLocation(expr);
        if ((type === undefined) || !checker.isTupleType(type)) {
            return this.goParamsTupleHelperIndex(expr) === index;
        }
        const element: any = checker.getTypeArguments(type)?.[index];
        return (element !== undefined) && !(element.flags & (TypeFlags.Any | TypeFlags.Unknown))
            && this.goParameterTypeIsDict(element);
    }

    // the Go unwrap for one slot of a destructured tuple: the checker names the element's Go type,
    // so the slot reads as the same typed value the accessor families hand back (GetValue's own
    // deref is what MapTyped/ListTyped/SafeStringPtr/SafeBoolPtr perform on their argument).
    // undefined keeps the boxed `GetValue(holder, i)` for that slot.
    goTupleSlotUnbox(element: any): { goType: string, conv: string } | undefined {
        const checker: any = this.checkerOrUndefined();
        if ((checker === undefined) || (element?.kind !== SyntaxKind.BindingElement)
            || (element.dotDotDotToken !== undefined) || (element.initializer !== undefined)
            || (element.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        let type: any;
        try {
            type = checker.getTypeAtLocation(element.name);
        } catch (e) {
            return undefined;
        }
        if (type === undefined) {
            return undefined;
        }
        let parts: any[] = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes().slice() : [ type ];
        parts = parts.filter((part: any) => !(part.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        if (parts.length === 0) {
            return undefined;
        }
        if (parts.every((part: any) => (part.flags & TypeFlags.BooleanLiteral) !== 0)) {
            return { 'goType': '*bool', 'conv': 'SafeBoolPtr' };
        }
        // a string, or a union of string literals: every path boxes a string or nothing
        if (parts.every((part: any) => ((part.flags & TypeFlags.String) !== 0) || ((part.flags & TypeFlags.StringLiteral) !== 0))) {
            return { 'goType': '*string', 'conv': 'SafeStringPtr' };
        }
        // a container slot already reads through the holder index (the build layer's own passes),
        // so only the scalar slots are unboxed here
        return undefined;
    }

    // ===== RF-go-6-F =====
    // a destructured tuple slot whose producer's Go slot type is `*int64` (the checker types the slot
    // `number | undefined`): the local is declared `*int64` and read natively.
    // `*int64` when this binding element is slot i of a `this.<producer>(..)` tuple whose table row names
    // `*int64` there, the checker types the slot `number | undefined`, the local is declared at the top
    // of its function, never written, and every read is a nil test or sits under a dominating non-nil guard
    goRf6fTupleSlotCache = new Map<any, string | undefined>();
    goRf6fTupleSlotPointerType(element): string | undefined {
        if (this.goRf6fTupleSlotCache.has(element)) {
            return this.goRf6fTupleSlotCache.get(element);
        }
        this.goRf6fTupleSlotCache.set(element, undefined);
        const result = this.goRf6fTupleSlotPointerTypeOf(element);
        this.goRf6fTupleSlotCache.set(element, result);
        return result;
    }

    goRf6fTupleSlotPointerTypeOf(element): string | undefined {
        const checker: any = this.checkerOrUndefined();
        const pattern: any = element?.parent;
        const holder: any = pattern?.parent;
        if ((checker === undefined) || (element?.kind !== SyntaxKind.BindingElement) || (pattern?.kind !== SyntaxKind.ArrayBindingPattern)
            || (holder?.kind !== SyntaxKind.VariableDeclaration) || (holder.name !== pattern)
            || (element.dotDotDotToken !== undefined) || (element.initializer !== undefined) || (element.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        const producer = this.goTupleBindingProducerName(holder);
        const index = pattern.elements.indexOf(element);
        const slotType = (producer === undefined) ? undefined : this.goTupleSlotTypes[producer]?.[index];
        const scope: any = this.goEnclosingFunction(element);
        if ((slotType !== '*int64') || (scope === undefined) || (holder.parent?.parent?.parent !== scope.body)) {
            return undefined;
        }
        const defaultAt = this.goTupleValueDefaultArg[producer as string];
        const defaultArg: any = (defaultAt === undefined) ? undefined : holder.initializer?.arguments?.[defaultAt];
        const literal: any = (defaultArg?.kind === SyntaxKind.PrefixUnaryExpression) ? defaultArg.operand : defaultArg;
        if ((literal?.kind === SyntaxKind.NumericLiteral) || this.goTypeNameIsShadowed(scope, '*int64')) {
            return undefined;
        }
        const name = element.name.text;
        const unread = this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name) || (n === element.name)) {
                return (n !== element) && (n.kind === SyntaxKind.BindingElement || n.kind === SyntaxKind.VariableDeclaration || n.kind === SyntaxKind.Parameter)
                    && (n.name?.kind === SyntaxKind.Identifier) && (n.name.text === name); // a shadowing binding
            }
            const parent: any = this.goUnwrapParenthesizedNode(n)?.parent;
            if (((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n)
                    && (parent.operatorToken.kind >= SyntaxKind.FirstAssignment) && (parent.operatorToken.kind <= SyntaxKind.LastAssignment))
                || (parent?.kind === SyntaxKind.PrefixUnaryExpression) && (parent.operator !== SyntaxKind.ExclamationToken)
                || (parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.ArrayLiteralExpression)
                || (parent?.kind === SyntaxKind.SpreadElement)) {
                return true; // a write, or a destructuring target
            }
            const nilTest = (parent?.kind === SyntaxKind.BinaryExpression) && [SyntaxKind.EqualsEqualsToken, SyntaxKind.EqualsEqualsEqualsToken,
                SyntaxKind.ExclamationEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)
                && this.goIsNilLiteral((parent.left === n) ? parent.right : parent.left);
            // RF-go-6-F: `i < slot` is a nil-safe native read (a nil slot compares false)
            const ordered = (parent?.kind === SyntaxKind.BinaryExpression) && [SyntaxKind.LessThanToken, SyntaxKind.LessThanEqualsToken,
                SyntaxKind.GreaterThanToken, SyntaxKind.GreaterThanEqualsToken].includes(parent.operatorToken.kind);
            return !nilTest && !ordered && !this.goHasEnclosingNilGuard(n) && !this.gp15HasExitingNilGuard(n);
        });
        return unread ? undefined : '*int64';
    }

    // the helper this store replaces stores derefScalar(value): a guarded `*int64` tuple-slot local stores its value
    goRf6fSlotStoreText(valueNode, valueStr: string): string {
        const value: any = this.goUnwrapParenthesizedNode(valueNode);
        const declaration: any = (value?.kind === SyntaxKind.Identifier)
            ? this.checkerOrUndefined()?.getSymbolAtLocation(value)?.valueDeclaration?.resolve() : undefined;
        return ((declaration?.kind === SyntaxKind.BindingElement) && (this.goRf6fTupleSlotPointerType(declaration) === '*int64')
            && (this.goHasEnclosingNilGuard(value) || this.gp15HasExitingNilGuard(value))) ? '*' + valueStr : valueStr;
    }

    goRf6fTupleSlotPointerLines(name: string, holder: string, index: number, iden: string): string {
        return iden + 'var ' + name + ' *int64 = nil\n' + iden + 'if p, ok := ' + holder + '[' + index + '].(*int64); ok {\n'
            + iden + '\t' + name + ' = p\n' + iden + '}';
    }
    // ===== end RF-go-6-F =====

    // a typed slot local is only printed when every later use reads it as that type: a write, an
    // address, a switch/case subject or an element-access index all need the box
    goTupleSlotNameIsSafe(nameNode: any, declaration: any): boolean {
        const name = nameNode?.text;
        const scope = this.goEnclosingFunction(declaration);
        if ((name === undefined) || (scope === undefined)) {
            return false;
        }
        const unwrapped = (node: any): any => ((node?.kind === SyntaxKind.ParenthesizedExpression) ? unwrapped(node.expression) : node);
        return !this.hasNodeWhere(scope, (node: any) => {
            if ((node?.kind !== SyntaxKind.Identifier) || (node.text !== name)) {
                return false;
            }
            const parent: any = node.parent;
            if (parent === undefined) {
                return false;
            }
            if ((parent.kind === SyntaxKind.PropertyAccessExpression) && (parent.name === node)) {
                return false;
            }
            if ((parent.kind === SyntaxKind.BindingElement) || (parent.kind === SyntaxKind.PropertyAssignment)) {
                return false;
            }
            if ((parent.kind === SyntaxKind.VariableDeclaration) && (parent.name === node)) {
                return parent !== declaration;
            }
            if ((parent.kind === SyntaxKind.Parameter) || (parent.kind === SyntaxKind.FunctionDeclaration)
                || (parent.kind === SyntaxKind.MethodDeclaration)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.BinaryExpression) && (unwrapped(parent.left) === node)) {
                return true; // an assignment or a compound write
            }
            if ((parent.kind === SyntaxKind.PrefixUnaryExpression) || (parent.kind === SyntaxKind.PostfixUnaryExpression)) {
                return true; // ++, --, or an address-of `&x` the printer emits through a prefix form
            }
            if ((parent.kind === SyntaxKind.SwitchStatement) && (parent.expression === node)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.CaseClause) || (parent.kind === SyntaxKind.ElementAccessExpression)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.ForOfStatement) || (parent.kind === SyntaxKind.ForInStatement)) {
                return true;
            }
            return false;
        });
    }

    // slot reads of `const [ a, b ] = <tuple producer>(…)`: a proven slot becomes a typed local,
    // every other slot keeps the boxed GetValue
    // The holder of a destructured tuple is a Go slice only when this printer emits the callee in
    // this same file (a tuple return prints []any). An awaited call's element type is the channel
    // table's decision (AsyncResult[any]) and an inherited method may have a hand-written `any`
    // twin, so both keep the boxed slots.
    goTupleBindingProducerName(declaration: any): string | undefined {
        const initializer: any = (declaration?.initializer?.kind === SyntaxKind.AwaitExpression)
            ? declaration.initializer.expression
            : declaration?.initializer;
        const callee: any = (initializer?.kind === SyntaxKind.CallExpression) ? initializer.expression : undefined;
        if ((callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = String(callee.name?.text ?? '');
        return (name === '') ? undefined : (name.charAt(0).toUpperCase() + name.slice(1));
    }

    // the holder is a Go slice only when this printer emits the callee's tuple return: an awaited
    // call's element type is the channel table's decision (AsyncResult[any]) and a
    // `base/Exchange.ts` method has a hand-written `any` twin (go/v4/exchange.go)
    goTupleBindingIsSliceHolder(declaration: any): boolean {
        const initializer: any = declaration?.initializer;
        if ((initializer?.kind !== SyntaxKind.CallExpression) || (initializer.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (initializer.expression.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        let declared: any;
        try {
            declared = checker?.getSymbolAtLocation(initializer.expression.name)?.valueDeclaration?.resolve();
        } catch (e) {
            declared = undefined;
        }
        if (declared === undefined) {
            return false;
        }
        const calleeFile = String(declared.getSourceFile?.()?.fileName ?? '');
        return (calleeFile !== '') && !/(^|[\/])base[\/]Exchange\.ts$/.test(calleeFile);
    }

    goTupleSlotBindingLines(elements: any[], holder: string, identation: number, declaration: any): string {
        const iden = this.getIden(identation);
        const producer = this.goTupleBindingProducerName(declaration);
        const nativeBinding = (producer !== undefined) && GO_TUPLE_NATIVE_BINDING_PRODUCERS.includes(producer);
        const sliceHolder = !nativeBinding && this.goTupleBindingIsSliceHolder(declaration);
        return elements.map((element: any, index: number) => {
            const name = this.printNode(element.name, 0);
            const unbox = (element.name?.kind === SyntaxKind.Identifier) ? this.goTupleSlotUnbox(element) : undefined;
            if (nativeBinding && (this.goRf6fTupleSlotPointerType(element) === '*int64')) {
                return this.goRf6fTupleSlotPointerLines(name, holder, index, iden); // RF-go-6-F
            }
            if (!sliceHolder || (unbox === undefined) || !this.goTupleSlotNameIsSafe(element.name, declaration)) {
                return iden + name + ' := GetValue(' + holder + ', ' + index + ')';
            }
            return iden + 'var ' + name + ' ' + unbox.goType + ' = ' + unbox.conv + '(' + holder + '[' + index + '])';
        }).join('\n');
    }

    // `this.handleXxx(…, params, …)` of a base helper typed `any[]` whose element holds the params
    // map it was given after omit/extend; only when that element is the same map-typed local
    goParamsTupleHelperIndex(call: any): number {
        const callee: any = call?.expression;
        if ((callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return -1;
        }
        const index = GO_PARAMS_TUPLE_HELPERS[callee.name?.text];
        if (index === undefined) {
            return -1;
        }
        const target: any = call.parent?.left?.elements?.[index];
        const passesTarget = (target?.kind === SyntaxKind.Identifier)
            && (call.arguments ?? []).some((a: any) => (a.kind === SyntaxKind.Identifier) && (a.text === target.text));
        return passesTarget ? index : -1;
    }

    // the safety check of a map-typed GetArg local: a Dict tuple element written into it is printed
    // through MapTyped once the local is bound as a map (no recursion into goGetArgLocalType)
    goGetArgTupleWriteIsDict(declaration: any, right: any, index: number): boolean {
        return (declaration?.kind === SyntaxKind.Parameter) && (declaration.initializer !== undefined)
            && this.goTupleElementIsDict(right, index);
    }

    // `[x, params] = f()` writes a GetArg local bound as map[string]any: unbox the element
    goGetArgBindsDictElement(leftElement: any, right: any, index: number): boolean {
        if ((leftElement?.kind !== SyntaxKind.Identifier) || !this.goTupleElementIsDict(right, index)) {
            return false;
        }
        let decl: any;
        try {
            decl = this.checkerOrUndefined()?.getSymbolAtLocation(leftElement)?.valueDeclaration?.resolve();
        } catch (e) {
            decl = undefined;
        }
        if ((decl?.kind !== SyntaxKind.Parameter) || (decl.initializer === undefined) || (decl.parent?.body === undefined)) {
            return false;
        }
        return this.goGetArgParameterType(decl) === 'map[string]any';
    }

    // the Go type a defaulted parameter's GetArg twin binds (undefined: the `any` GetArg); the one
    // predicate shared by the binding line and every consumer's printing
    goGetArgParameterType(decl: any): string | undefined {
        if ((decl?.kind !== SyntaxKind.Parameter) || (decl.initializer === undefined) || (decl.dotDotDotToken !== undefined)
            || (decl.name?.kind !== SyntaxKind.Identifier) || (decl.parent?.body === undefined)
            || ![SyntaxKind.MethodDeclaration, SyntaxKind.FunctionDeclaration].includes(decl.parent.kind)) {
            return undefined;
        }
        this.goGetArgTypeCache ??= new WeakMap();
        if (!this.goGetArgTypeCache.has(decl)) {
            this.goGetArgTypeCache.set(decl, undefined);
            this.goGetArgTypeComputing ??= new Set();
            this.goGetArgTypeComputing.add(decl);
            let goType: string | undefined;
            try {
                goType = this.goGetArgLocalType(decl.parent.body, decl, this.printNode(decl.initializer, 0));
            } finally {
                this.goGetArgTypeComputing.delete(decl);
            }
            this.goGetArgTypeCache.set(decl, (goType !== undefined) && (this.goGetArgTwinName(goType) !== undefined) ? goType : undefined);
        }
        return this.goGetArgTypeCache.get(decl);
    }

    // argument `argIndex` of the callee binds a parameter with a TypeScript default (GetArg-bound)
    goGetArgPositionIsDefaulted(callee: any, argIndex: number): boolean {
        if (argIndex < 0) {
            return false;
        }
        let decl: any;
        try {
            decl = this.getChecker().getSymbolAtLocation(callee)?.valueDeclaration?.resolve();
        } catch (e) {
            decl = undefined;
        }
        const kinds = [SyntaxKind.MethodDeclaration, SyntaxKind.FunctionDeclaration];
        const param: any = (decl !== undefined) && kinds.includes(decl.kind) ? decl.parameters?.[argIndex] : undefined;
        return (param?.initializer !== undefined) && (param.dotDotDotToken === undefined);
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
        const decl: any = symbol?.valueDeclaration?.resolve();
        const params: any[] = decl?.parameters ?? [];
        const param: any = params[argIndex];
        const initializer: any = param?.initializer;
        if (initializer === undefined) {
            return false;
        }
        return initializer.kind === SyntaxKind.ObjectLiteralExpression;
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
                    const goType = this.goGetArgParameterType(param);
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
                functionBody = node.body.statements.map(statement => this.printNode(statement, identation + 1)).join("\n");
            }
        }
        if (wrapInChannel) {
            // return statement might be inside ifs or other complex statements so we still have to replace them manually :(
            // functionBody = functionBody.replace(/(\s*)return\s+([^\n]+\n?)/g, '$1ch <- $2$1');
            // the body half of the trampoline pair is a flat function body: the statements
            // are already printed at their own level, so no extra indentation level is added here
            const lastLine = functionBody.split("\n").pop().trim();
            // no trailing return after a return/panic or a conditional that returns in all branches
            const shouldAddLastReturn = !lastLine.startsWith("return") && !lastLine.startsWith("panic")
                && !(node.body && this.blockEndsWithConditionalReturn(node.body.statements));

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
                functionBody,
            ];
            if (shouldAddLastReturn) {
                lines.push(this.getIden(identation+1) + "return nil");
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

    getLineBasedSuffix(node): string {
        const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        return `${line}${character}`;
    }

    printExpressionStatement(node, identation) {

        if (node?.expression?.kind === SyntaxKind.AsExpression) {
            node = node.expression;
        }
        if (node.expression.kind !== SyntaxKind.AwaitExpression) {
            const printed = this.stripWhitespaceOnlyLines (super.printExpressionStatement(node, identation));
            // the urls views (UrlsApi, UrlsApiSections) are re-derived right after each write of urls
            return ((printed.length > 0) && this.goIsUrlsWrite(node)) ? `${printed}\n${this.getIden(identation)}this.RefreshUrlsViews()` : printed;
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
            // the discarded value needs no local: PanicOnError still surfaces the channel's error
            : `
${this.getIden(identation)}PanicOnError(${exprStm.trim()})`;
        return this.printNodeCommentsIfAny(node, identation, expStatement);
    }

    isInsideAsyncFunction(returnStatementNode) {
        let currentNode = returnStatementNode;

        while (currentNode) {
            // Check if the current node is a function or method
            if (isFunctionDeclaration(currentNode) ||
              isFunctionExpression(currentNode) ||
              isArrowFunction(currentNode) ||
              isMethodDeclaration(currentNode)) {
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
        // if (node?.expression?.kind !== SyntaxKind.AwaitExpression) {
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

        if (node?.expression?.kind === SyntaxKind.AsExpression) {
            node = node.expression;
        }

        if (node?.expression?.kind === SyntaxKind.AwaitExpression) {
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


    printArrayLiteralExpression(node, identation = 0) {
        // elements that span lines (object literals, calls carrying one) need the
        // statement's own level so their bodies land one level deeper
        // …but an element is inline after `{`, so any leading indent a printer prepends is trimmed
        // go/printer prints composite literal elements at depth 1 (exprList(..., 1, ...))
        // hx10w9 GP13: a literal a `[]string`/`[][]string` slot asked for opens as that slice
        const markedType = this.goSliceLiteralTypes.get(node) ?? ((node === this.goStringListLiteralNode) ? '[]string' : undefined);
        const elements = node.elements.map((e) => {
            if ((markedType === '[][]string') && (e.kind === SyntaxKind.ArrayLiteralExpression)) {
                this.goSliceLiteralTypes.set(e, '[]string');
            }
            return this.goWithExprDepth(1, () => this.printNode(e, identation)).trim();
        }).join(", ");
        // a list of calls (promises included) always opens as `[]any{`; getFunctionType is kept for its
        // checker side effect (it caches a signature on the call node)
        const first = node.elements[0];
        const arrayOpen = (markedType === '[]string')
            ? '[]string{' : ((markedType === '[][]string')
                ? '[][]string{' : (((first?.kind === SyntaxKind.CallExpression) && (this.getFunctionType(first) || true))
                    ? '[]any{' : this.ARRAY_OPENING_TOKEN));
        return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
    }

    printArgsForCallExpression(node, identation) {
        const unified = this.goUnifiedStringCallArgs(node, identation);
        if (unified !== undefined) {
            return unified;
        }
        const sliceArgs = this.goSliceCallArgs(node, identation);
        if (sliceArgs !== undefined) {
            return sliceArgs;
        }
        const gp15 = this.gp15DerefStringArgCall(node, identation);
        if (gp15 !== undefined) {
            return gp15;
        }
        // go/printer prints the arguments of a call with more than one argument
        // one level deeper than the call itself (nodes.go, CallExpr)
        if (node.arguments && node.arguments.length > 1) {
            return this.goWithExprDepth(this.goExprDepth + 1, () => super.printArgsForCallExpression(node, identation));
        }
        return super.printArgsForCallExpression(node, identation);
    }

    // the printed parameter a call's argument lands in, or undefined when the printer cannot
    // name it: an overload has no body, a variadic tail prints into `optionalArgs`
    gp15CallParamAt(call, index: number) {
        let declaration;
        try {
            declaration = this.getChecker()?.getResolvedSignature(call)?.declaration?.resolve?.();
        } catch (e) {
            return undefined;
        }
        if ((declaration?.body === undefined) || (declaration.kind !== SyntaxKind.MethodDeclaration)) {
            return undefined;
        }
        const param = declaration.parameters?.[index];
        if ((param === undefined) || (param.dotDotDotToken !== undefined) || (param.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        return param;
    }

    // hx10 GP15: a `*string` argument handed to a `string` parameter prints its dereference, so
    // the parameter keeps the plain type (gp15NilProvenStringPtrArg is the nil proof)
    gp15DerefStringArgCall(node, identation): string | undefined {
        const args = node.arguments ?? [];
        if (args.length === 0) {
            return undefined;
        }
        // an identifier argument derefs in printIdentifier, so a build-layer pass that re-prints
        // the argument list (SafeStringPtr boxing of a sibling) keeps it; `*` binds tighter than
        // every operator but a postfix/call/selector chain, so only those shapes take it here
        const derefable = (arg) => [ SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression,
            SyntaxKind.ParenthesizedExpression, SyntaxKind.NonNullExpression, SyntaxKind.AsExpression ].includes(arg.kind);
        const deref: boolean[] = args.map((arg, i) => {
            const param = this.gp15CallParamAt(node, i);
            const callee: any = node.expression;
            const calleeName = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text : undefined;
            if ((typeof calleeName === 'string') && this.goIsUnifiedStringParameter(calleeName, i)) {
                return false; // a unified string argument prints through its own decision
            }
            return (param !== undefined) && (this.goNativeParameterType(param) === 'string')
                && derefable(arg) && this.gp15NilProvenStringPtrArg(arg);
        });
        if (!deref.some((x) => x)) {
            return undefined;
        }
        const print = () => args.map((arg, i) => {
            const text = this.printNode(arg, identation).trim();
            return deref[i] ? ('*' + text) : text;
        }).join(', ');
        return (args.length > 1) ? this.goWithExprDepth(this.goExprDepth + 1, print) : print();
    }

    printIdentifier(node) {
        const printed = super.printIdentifier(node);
        const parent: any = node.parent;
        if ((parent?.kind !== SyntaxKind.CallExpression) || !(parent.arguments ?? []).includes(node)) {
            return printed;
        }
        const index = parent.arguments.indexOf(node);
        // a unified string argument prints through its own deref/StringArg decision
        const callee: any = parent.expression;
        const calleeName = (callee?.kind === SyntaxKind.PropertyAccessExpression) ? callee.name?.text : undefined;
        if ((typeof calleeName === 'string') && this.goIsUnifiedStringParameter(calleeName, index)) {
            return printed;
        }
        const param = this.gp15CallParamAt(parent, index);
        if ((param === undefined) || (this.goNativeParameterType(param) !== 'string') || !this.gp15NilProvenStringPtrArg(node)) {
            return printed;
        }
        return '*' + printed;
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
        const name = nameNode.text;
        let used = false;
        const visit = (n) => {
            if (used) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== nameNode)) {
                const parent = n.parent;
                const isDeclarationName = (parent?.kind === SyntaxKind.VariableDeclaration) && (parent.name === n);
                const isPropertyName = (parent?.kind === SyntaxKind.PropertyAccessExpression) && (parent.name === n);
                if (!isDeclarationName && !isPropertyName) {
                    used = true;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
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
        const declaration: any = symbol?.valueDeclaration?.resolve();
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.initializer === undefined)) {
            return false;
        }
        if (this.goTypeOfInitializer(declaration.initializer, this.printNode(declaration.initializer, 0)) !== '[]any') {
            return false;
        }
        const scope = this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        const name = declaration.name.text;
        let safe = true;
        const visit = (n) => {
            if (!safe) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== declaration.name) && (n !== nameNode)) {
                const parent = n.parent;
                if (parent?.kind === SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if (this.goRebindingTargetOf(n) !== undefined) {
                    safe = false; // a rebinding write can box another type
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return safe;
    }

    // native IsArray: a constant for an operand whose Go type the printer proves, and
    // the two-value assertion on an `any` box that only ever holds a []any
    printNativeIsArray(node, parsedArg: string | undefined): string | undefined {
        if ((typeof parsedArg !== 'string') || parsedArg.includes('\n')) {
            return undefined;
        }
        const argNode = node.arguments?.[0];
        if (argNode?.kind !== SyntaxKind.Identifier) {
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

    // ---- FM-GO4-3: `Object.keys(m)` / `Object.values(m)` on a declared map[string]any ------------------
    // The runtime helpers derefScalar their argument and type-switch it; a receiver the printer
    // already declares `map[string]any` needs neither, so the local is collected by a range over the
    // map: nil for a nil map, a fresh non-nil slice otherwise (the helper's answers). Everything else
    // (an `any` box, a *sync.Map, a parameter the call-site proof left boxed) keeps the helper call.

    // the Go slice type of the local an `Object.keys/values(m)` declaration collects into, with the
    // receiver and the loop variable name; undefined when the declaration is any other shape
    goMapRangeLocalDeclaration(statement, declaration, identation: number): string | undefined {
        if ((statement?.parent?.kind !== SyntaxKind.FirstStatement) || (declaration?.name?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        const call: any = declaration.initializer;
        const callee: any = call?.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.arguments?.length !== 1)
            || (callee?.kind !== SyntaxKind.PropertyAccessExpression)
            || (callee.expression?.kind !== SyntaxKind.Identifier) || (callee.expression.text !== 'Object')) {
            return undefined;
        }
        const method = callee.name?.text;
        if ((method !== 'keys') && (method !== 'values')) {
            return undefined;
        }
        const receiver: any = call.arguments[0];
        if ((receiver?.kind !== SyntaxKind.Identifier) || !this.goIsRebindFreeMapReceiver(receiver)) {
            return undefined;
        }
        const scope: any = this.goEnclosingFunction(declaration);
        const isKeys = (method === 'keys');
        const goType = isKeys ? GO_STRING_LIST_LOCAL_TYPE : GO_SAFE_LIST_LOCAL_TYPE;
        const loopVariable = isKeys ? 'objectKey' : 'objectValue';
        if ((scope === undefined) || this.goTypeNameIsShadowed(scope, goType)
            || this.hasNodeWhere(scope, (n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === loopVariable))) {
            return undefined;
        }
        const receiverText = this.printNode(receiver, 0);
        const nameText = this.printNode(declaration.name, 0);
        if (receiverText.includes('\n') || (nameText === receiverText)) {
            return undefined;
        }
        // Object.keys: the printer types the collecting local itself (ObjectKeys answers []string).
        // Object.values: the local holds the helper's []any, named only while no use observes the box
        const named = isKeys
            ? (this.getGoLocalType(declaration, `ObjectKeys(${receiverText})`) === goType)
            : this.goObjectValuesLocalIsList(declaration, scope);
        if (!named) {
            return undefined;
        }
        const indent = this.getIden(identation);
        const inner = this.getIden(identation + 1);
        const body = this.getIden(identation + 2);
        const header = isKeys ? `for ${loopVariable} := range ${receiverText} {` : `for _, ${loopVariable} := range ${receiverText} {`;
        return [
            `${indent}var ${nameText} ${goType} = nil`,
            `${indent}if ${receiverText} != nil {`,
            `${inner}${nameText} = make(${goType}, 0, len(${receiverText}))`,
            `${inner}${header}`,
            `${body}${nameText} = append(${nameText}, ${loopVariable})`,
            `${inner}}`,
            `${indent}}`,
        ].join('\n');
    }

    // the receiver's declared Go type is map[string]any and nothing rebinds it, so a nil map is the
    // only value besides a real map (the helper's nil and non-map answers coincide for it)
    goIsRebindFreeMapReceiver(receiver): boolean {
        let declaration: any;
        try {
            declaration = this.checkerOrUndefined()?.getSymbolAtLocation(receiver)?.valueDeclaration?.resolve();
        } catch (e) {
            return false;
        }
        if ((declaration === undefined) || (declaration.name?.kind !== SyntaxKind.Identifier)) {
            return false;
        }
        // a defaulted `params = {}` is the GetArgMap-bound Go map in the line that binds it
        const declared = (declaration.kind === SyntaxKind.Parameter)
            ? this.goGetArgParameterType(declaration)
            : this.goDeclaredTypeOfIdentifier(receiver);
        if (declared !== 'map[string]any') {
            return false;
        }
        return !this.goLocalIsRebound(this.goEnclosingFunction(declaration), declaration.name);
    }

    // `const xs = Object.values(m)` keeps the helper's []any in an `any` box today. Naming that
    // slice on the declaration is identity for every read except one that observes the box itself:
    // a nil test (a box holding a nil slice is not nil), or a write/push/spread/destructuring shape
    // goLocalIsSafeToType refuses. Each remaining use reads the same slice value.
    goObjectValuesLocalIsList(declaration, scope): boolean {
        const name = declaration.name.text as string;
        if (this.goLocalIsRebound(scope, declaration.name)) {
            return false;
        }
        const observed = this.hasNodeWhere(scope, (n: any) => (n.kind === SyntaxKind.Identifier) && (n.text === name)
            && (n !== declaration.name) && (n.parent !== undefined) && this.goIsNilComparisonOperand(n, n.parent));
        return !observed && this.goLocalIsSafeToType(scope, declaration, name, GO_SAFE_LIST_LOCAL_TYPE);
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
        if (argument?.kind !== SyntaxKind.BinaryExpression || printedText === undefined) {
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
        if (node?.kind === SyntaxKind.Identifier) {
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
        if (!this.goFileKeepsFileLevelImports() || this.goInsideExcisedSpan()) {
            return undefined;
        }
        const receiver = this.goUnwrapPrintedAssertions(node?.expression?.expression);
        const target = this.goUnwrapPrintedAssertions(node?.arguments?.[0]);
        if (this.goIndexOfOperandType(target, parsedArg) !== 'string') {
            return undefined; // a nilable/number needle answers -1 in the helper
        }
        // an `(x as string)` receiver is the author's non-null promise: no nil guard needed
        if (this.goAssertedStringDeref(node?.expression?.expression)) {
            this.goFileStdlibImports.add('strings');
            return `strings.Index(*${name.trim()}, ${parsedArg})`;
        }
        const receiverType = this.goIndexOfOperandType(receiver, name);
        if (receiverType === 'string') {
            this.goFileStdlibImports.add('strings');
            return `strings.Index(${name}, ${parsedArg})`;
        }
        // the literal repeats the identifier, so the receiver is still read exactly once
        if ((receiverType === '*string') && (receiver?.kind === SyntaxKind.Identifier)) {
            this.goFileStdlibImports.add('strings');
            const level = this.goStatementLevel;
            const body = this.getIden(level + 1);
            const inner = this.getIden(level + 2);
            return `func() int {\n${body}if ${name} == nil {\n${inner}return -1\n${body}}\n${body}return strings.Index(*${name}, ${parsedArg})\n${this.getIden(level)}}()`;
        }
        return undefined;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.goHx4G06DerefIndexOf(node, name, parsedArg) ?? this.goNativeIndexOf(node, name, parsedArg);
        if (native !== undefined) {
            return native;
        }
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    // A native string operation needs every operand to be a Go `string`: a proven one prints as is,
    // a `*string` goDerefableStringOperand proves non-nil prints as its pointee (the helper's nil
    // branch is unreachable). A regex literal is a pattern, never a string: undefined keeps the helper.
    goNativeStringOperandTexts(operands: any[], texts: string[], expected: string[]): string[] | undefined {
        const result: string[] = [];
        for (let i = 0; i < expected.length; i++) {
            const operand = operands[i];
            if (operand === undefined || operand.kind === SyntaxKind.RegularExpressionLiteral) {
                return undefined;
            }
            if (this.goOperandStaticType(operand, texts[i]) === expected[i]) {
                result.push(texts[i]);
            } else if ((expected[i] === 'string') && !texts[i].includes('\n') && (this.goDerefableStringOperand(operand) || this.goLiteralUnionNarrowedStringDeref(operand))) {
                result.push('*' + texts[i].trim());
            } else {
                return undefined;
            }
        }
        return result;
    }

    // `(x as T)` and `(x)` print as `x`, so the operand's own Go type governs the printed receiver
    goUnwrapPrintedAssertions(node) {
        while ((node?.kind === SyntaxKind.AsExpression) || (node?.kind === SyntaxKind.ParenthesizedExpression)) {
            node = node.expression;
        }
        return node;
    }

    // the native string call (built from the proven operand texts, `*`-dereferenced where needed) when
    // every operand matches `expected` and the file's stdlib import can be placed (see
    // goStdlibImportIsPlaceable), else the helper call; an unprinted argument keeps the helper
    goNativeStringCallOr(node, texts: string[], expected: string[], nativeCall: (ops: string[]) => string, helperCall: string, unwrapReceiver = false): string {
        const receiver = unwrapReceiver ? this.goUnwrapPrintedAssertions(node.expression?.expression) : node.expression?.expression;
        const operands = [receiver, ...expected.slice(1).map((_, i) => node.arguments?.[i])];
        const ops = texts.slice(1).includes(undefined) ? undefined : this.goNativeStringOperandTexts(operands, texts, expected);
        if ((ops !== undefined) && this.goStdlibImportIsPlaceable()) {
            this.goFileStdlibImports.add('strings');
            return nativeCall(ops);
        }
        return helperCall;
    }

    // A native string call on a nilable `*string` local whose source carries an `(x as string)`
    // assertion needs no guard: an undefined receiver throws in JS, so the assertion is the
    // author's non-null promise (goAssertedStringDeref).

    // The native string calls need `import "strings"` before the file's first declaration. Every ccxt
    // consumer splices the body at file head, except build/goTranspiler.ts#transpileBaseMethods and
    // #transpilePredictionBaseMethods; those two declare each referenced package themselves (the
    // build sets the source paths here), so only those files may emit a stdlib call.
    goBaseFileStdlibImportSeamPaths: RegExp | undefined = undefined;

    // A consumer writer may cut every `START ... END` comment-marker span out of the printed Go
    // (config excisedSpanMarkers; the END comment is printed as the leading comment of the next statement; one that ends its
    // block is not printed, and then nothing is cut). A native stdlib call printed inside a cut
    // span would leave an import nothing uses, so a statement in the span keeps the helper call.
    goExcisedSpanMarkers: [string, string] | undefined = undefined;
    goExcisedSpans = new WeakMap<object, [number, number][]>();

    goInsideExcisedSpan(): boolean {
        const markers = this.goExcisedSpanMarkers;
        const src: any = this.getSrc();
        if ((markers === undefined) || (src === undefined) || (this.goStatement === undefined)) {
            return false;
        }
        let spans = this.goExcisedSpans.get(src);
        if (spans === undefined) {
            spans = [];
            const text: string = src.getFullText();
            for (let from = text.indexOf(markers[0]); from >= 0;) {
                const to = text.indexOf(markers[1], from);
                if (to < 0) {
                    break;
                }
                const next = text.slice(text.indexOf('\n', to) + 1).trimStart()[0];
                if ((next !== undefined) && (next !== '}')) {
                    spans.push([from, to]);
                }
                from = text.indexOf(markers[0], to);
            }
            this.goExcisedSpans.set(src, spans);
        }
        const start = this.goStatement.getStart();
        return spans.some(([from, to]) => (start >= from) && (start < to));
    }

    goStdlibImportIsPlaceable(): boolean {
        if (this.goInsideExcisedSpan()) {
            return false;
        }
        if (this.goFileKeepsFileLevelImports()) {
            return true;
        }
        const seam = this.goBaseFileStdlibImportSeamPaths;
        if (seam === undefined) {
            return false;
        }
        return seam.test(this.getSrc()?.fileName ?? '');
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.startsWith (p)` -> strings.HasPrefix
        return this.goNativeStringCallOr(node, [name, parsedArg], ['string', 'string'],
            (o) => `strings.HasPrefix(${o[0]}, ${o[1]})`, `StartsWith(${name}, ${parsedArg})`);
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.endsWith (p)` -> strings.HasSuffix
        return this.goNativeStringCallOr(node, [name, parsedArg], ['string', 'string'],
            (o) => `strings.HasSuffix(${o[0]}, ${o[1]})`, `EndsWith(${name}, ${parsedArg})`);
    }

    printTrimCall(node, identation, name = undefined) {
        return `Trim(${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        // `a.join (sep)` -> strings.Join: only a declared `[]string` receiver can skip the
        // per-element ToString the helper applies to a []any
        return this.goNativeStringCallOr(node, [name, parsedArg], ['[]string', 'string'],
            (o) => `strings.Join(${o[0]}, ${o[1]})`, `Join(${name}, ${parsedArg})`);
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.split (sep)` -> strings.Split, which keeps JS's empty trailing element
        // ("a," -> ["a", ""]) exactly like the helper's own strings.Split call
        return this.goNativeStringCallOr(node, [name, parsedArg], ['string', 'string'],
            (o) => `strings.Split(${o[0]}, ${o[1]})`, `Split(${name}, ${parsedArg})`);
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    // ToString is the identity on a Go string (exchange_helpers.go: derefScalar and `case string`
    // return it unchanged), so a receiver declared `string` prints as itself. An `any` box, a
    // *string (derefScalar answers nil) or a float64 keeps the helper's runtime formatting.
    printToStringCall(node, identation, name = undefined) {
        if ((name !== undefined) && (name.indexOf('\n') < 0)) {
            const receiver = (node?.expression?.kind === SyntaxKind.PropertyAccessExpression)
                ? node.expression.expression
                : undefined;
            if (receiver !== undefined) {
                const goType = this.goToStringReceiverType(receiver, name);
                if (goType === 'string') {
                    return name;
                }
                // a non-nil `*string`: derefScalar hands ToString the pointee, returned unchanged
                if (this.goDerefableStringOperand(receiver) || this.goLiteralUnionNarrowedStringDeref(receiver)) {
                    return '*' + name.trim();
                }
                if (this.goStdlibImportIsPlaceable()) {
                    // an int prints its decimal digits in both: the helper's Sprintf("%d") and Itoa
                    if (goType === 'int') {
                        this.goFileStdlibImports.add('strconv');
                        return `strconv.Itoa(${name})`;
                    }
                    // an int64 prints its decimal digits in both: the helper's Sprintf("%d") and FormatInt
                    if (goType === 'int64') {
                        this.goFileStdlibImports.add('strconv');
                        return `strconv.FormatInt(${name}, 10)`;
                    }
                    // a bool prints "true"/"false" in both: the helper's Sprintf("%t") and FormatBool
                    if (goType === 'bool') {
                        this.goFileStdlibImports.add('strconv');
                        return `strconv.FormatBool(${name})`;
                    }
                    // a []string prints "[a, b]": the helper's reflect arm brackets the elements
                    // and joins them with ", " after ToString, which is the identity on a string
                    if (goType === '[]string') {
                        this.goFileStdlibImports.add('strings');
                        return `"[" + strings.Join(${name}, ", ") + "]"`;
                    }
                    // a non-nil `*int64`: derefScalar hands ToString the pointee's decimal digits
                    if ((receiver?.kind === SyntaxKind.Identifier) && (this.goDeclaredTypeOfIdentifier(receiver) === '*int64')
                        && this.goPointerNumberIsNonNil(receiver)) {
                        this.goFileStdlibImports.add('strconv');
                        return `strconv.FormatInt(*${name.trim()}, 10)`;
                    }
                }
            }
        }
        return `ToString(${name})`;
    }

    // the Go type of a `.toString()` receiver: the scalar lookup names string/int/int64/float64,
    // while a declared `bool` or `[]string` local (or a parameter typed that way) is only reachable
    // through the declaration itself.
    goToStringReceiverType(receiver, printedText: string): string | undefined {
        const scalar = this.goOperandStaticType(receiver, printedText);
        if (scalar !== undefined) {
            return scalar;
        }
        if (receiver?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declared = this.goLocalStaticType(receiver) ?? this.goDeclaredParamStaticType(receiver);
        return ((declared === 'bool') || (declared === '[]string')) ? declared : undefined;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Concat(${name}, ${parsedArg})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        // `s.toUpperCase ()` -> strings.ToUpper
        return this.goNativeStringCallOr(node, [name], ['string'], (o) => `strings.ToUpper(${o[0]})`, `ToUpper(${name})`);
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        // `s.toLowerCase ()` -> strings.ToLower
        return this.goNativeStringCallOr(node, [name], ['string'], (o) => `strings.ToLower(${o[0]})`, `ToLower(${name})`);
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
        if (node?.kind === SyntaxKind.NumericLiteral) {
            const text = node.text;
            if (!/^\d+$/.test(text)) {
                return undefined;
            }
            const value = Number(text);
            return (value > 2147483647) ? undefined : value;
        }
        if ((node?.kind === SyntaxKind.PrefixUnaryExpression) && (node.operator === SyntaxKind.MinusToken)) {
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
        while ((receiverNode?.kind === SyntaxKind.AsExpression) || (receiverNode?.kind === SyntaxKind.NonNullExpression)
            || (receiverNode?.kind === SyntaxKind.ParenthesizedExpression)) {
            receiverNode = receiverNode.expression;
        }
        if (receiverNode?.kind !== SyntaxKind.Identifier) {
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
        if (node?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = node.expression;
        if ((callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.name?.text !== 'slice')) {
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
        return this.goNativeStringCallOr(node, [name, parsedArg, parsedArg2], ['string', 'string', 'string'],
            (o) => `strings.Replace(${o[0]}, ${o[1]}, ${o[2]}, 1)`, `Replace(${name}, ${parsedArg}, ${parsedArg2})`);
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // `s.replaceAll (a, b)` replaces every occurrence, like the helper
        return this.goNativeStringCallOr(node, [name, parsedArg, parsedArg2], ['string', 'string', 'string'],
            (o) => `strings.ReplaceAll(${o[0]}, ${o[1]}, ${o[2]})`, `Replace(${name}, ${parsedArg}, ${parsedArg2})`);
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
        // const type = (this.getChecker() as Checker).getTypeAtLocation(node.expression); // eslint-disable-line
        // this.warnIfAnyType(node, type.flags, leftSide, "length");
        return `GetLength(${leftSide})`;
    }

    // printPostFixUnaryExpression(node, identation) {
    //     const {operand, operator} = node;
    //     if (operand.kind === SyntaxKind.NumericLiteral) {
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
    //     if (operand.kind === SyntaxKind.NumericLiteral) {
    //         return super.printPrefixUnaryExpression(node, identation);
    //     }
    //     if (operator === SyntaxKind.ExclamationToken) {
    //         // not branch check falsy/turthy values if needed;
    //         return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    //     }
    //     const leftSide = this.printNode(operand, 0);
    //     if (operator === SyntaxKind.PlusToken) {
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

    // ---- hx11 rfm-X4 OG03: reads of an owner-goroutine base field ------------------------
    // `this.<field>` whose symbol is the `declaredIn` class's own property declaration (the
    // checker, not the spelling: a local or another class's field of that name is not it)
    goOwnedFieldAccess(node): boolean {
        const owned = this.goOwnedField;
        if ((owned === undefined) || (node?.kind !== SyntaxKind.PropertyAccessExpression)
            || (node.expression?.kind !== SyntaxKind.ThisKeyword) || (node.name?.text !== owned.field)) {
            return false;
        }
        const declaration: any = this.checkerOrUndefined()?.getSymbolAtLocation(node.name)?.valueDeclaration?.resolve();
        return (declaration?.kind === SyntaxKind.PropertyDeclaration) && (declaration.parent?.name?.text === owned.declaredIn);
    }

    // user-path code runs off the owner goroutine: the nearest enclosing method (an arrow or
    // catch closure belongs to it) is not one of the owner-side patterns. No enclosing method
    // (constructor, initializer) keeps the field.
    goOwnedFieldUserPath(node): boolean {
        for (let current = node?.parent; current; current = current.parent) {
            if ((current.kind === SyntaxKind.MethodDeclaration) || (current.kind === SyntaxKind.FunctionDeclaration)) {
                const name = current.name?.text;
                return (typeof name === 'string') && !this.goOwnedField.ownerSide.some((pattern) => pattern.test(name));
            }
        }
        return false;
    }

    // `this.<field> = v`, `this.<field>[k] = v` and `delete this.<field>[k]` happen on the owner
    goOwnedFieldIsWrite(node): boolean {
        const isAssignment = (parent, child) => (parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === child)
            && (parent.operatorToken.kind >= SyntaxKind.FirstAssignment) && (parent.operatorToken.kind <= SyntaxKind.LastAssignment);
        const parent = node.parent;
        if (isAssignment(parent, node)) {
            return true;
        }
        return (parent?.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === node)
            && (isAssignment(parent.parent, parent) || (parent.parent?.kind === SyntaxKind.DeleteExpression));
    }

    printPropertyAccessExpression(node, identation) {
        if (this.goOwnedFieldAccess(node) && !this.goOwnedFieldIsWrite(node) && this.goOwnedFieldUserPath(node)) {
            return `${this.printNode(node.expression, 0)}.${this.goOwnedField.snapshot}()`;
        }
        return super.printPropertyAccessExpression(node, identation);
    }

    // `delete this.<field>[k]` on the user path is the owner's delete op
    goOwnedFieldRemove(node): string | undefined {
        const access: any = node.expression;
        if ((access?.kind !== SyntaxKind.ElementAccessExpression) || !this.goOwnedFieldAccess(access.expression)
            || !this.goOwnedFieldUserPath(node)) {
            return undefined;
        }
        return `${this.printNode(access.expression.expression, 0)}.${this.goOwnedField.remove}(${this.printNode(access.argumentExpression, 0).trim()})`;
    }

    printDeleteExpression(node, identation) {
        const owned = this.goOwnedFieldRemove(node);
        if (owned !== undefined) {
            return owned;
        }
        const native = this.goNativeDelete(node);
        if (native !== undefined) {
            return native;
        }
        const object = this.printNode (node.expression.expression, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        return `Remove(${object}, ${key})`;
    }

    // `delete m[k]` as a statement on a receiver Go types as map[string]any (a local the printer
    // declared so, or one book of the map[string]map[string]any `this.ohlcvs`) with a string key.
    // Remove() ends in the same delete(); a nil map and a missing key are no-ops in both.
    // A `*string` key needs the checker's non-nil narrowing, else the helper's panic text differs.
    goNativeDelete(node): string | undefined {
        const access: any = node.expression;
        if ((node.parent?.kind !== SyntaxKind.ExpressionStatement) || (access?.kind !== SyntaxKind.ElementAccessExpression)) {
            return undefined;
        }
        const receiver = this.goDeleteReceiverText(access.expression);
        const key = this.goDeleteKeyText(access.argumentExpression);
        if ((receiver === undefined) || (key === undefined)) {
            return undefined;
        }
        return `delete(${receiver}, ${key})`;
    }

    goDeleteReceiverText(node): string | undefined {
        if (node?.kind === SyntaxKind.Identifier) {
            return (this.goDeclaredTypeOfIdentifier(node) === 'map[string]any') ? this.printNode(node, 0) : undefined;
        }
        const book: any = node;
        if ((book?.kind !== SyntaxKind.ElementAccessExpression) || (book.expression?.kind !== SyntaxKind.PropertyAccessExpression)
            || (book.expression.expression?.kind !== SyntaxKind.ThisKeyword) || (book.expression.name?.text !== 'ohlcvs')) {
            return undefined;
        }
        const symbol = this.goDeleteKeyText(book.argumentExpression);
        return (symbol === undefined) ? undefined : `this.Ohlcvs[${symbol}]`;
    }

    goDeleteKeyText(node): string | undefined {
        if ((node?.kind === SyntaxKind.StringLiteral) || (node?.kind === SyntaxKind.NoSubstitutionTemplateLiteral)) {
            return this.printNode(node, 0);
        }
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declared = this.goDeclaredTypeOfIdentifier(node);
        if (declared === 'string') {
            return this.printNode(node, 0);
        }
        return ((declared === '*string') && this.goDerefableStringOperand(node)) ? ('*' + this.printNode(node, 0)) : undefined;
    }

    printThrowStatement(node, identation) {
        // const expression = this.printNode(node.expression, 0);
        // return this.getIden(node) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
        if (node.expression.kind === SyntaxKind.Identifier) {
            return this.getIden(identation) + 'panic(' + this.printNode(node.expression, 0) + ')' + this.LINE_TERMINATOR;
        }
        if (node.expression.kind === SyntaxKind.NewExpression) {
            const expression = node.expression;
            // handle throw new Error (Message)
            // and throw new x[a] (message)
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map(n => this.printNode(n, 0)).join(",") ?? '';
            const newExpression =  this.printNode(expression.expression, 0);
            if (expression.expression.kind === SyntaxKind.Identifier) {
                // handle throw new X
                const id = expression.expression;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).getSymbol()?.declarations?.map((d) => d.resolve()) ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === SyntaxKind.InterfaceDeclaration ||  l.kind === SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        // return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${id.text} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
                    } else {
                        // Go has no statement terminator: the two statements go on
                        // their own lines (gofmt splits `a; b` exactly like this)
                        return this.getIden(identation) + `throwDynamicException(${id.text}, ${parsedArg})\n${this.getIden(identation)}return nil`;
                    }
                }
                return this.getIden(identation) + `panic(${id.text}(${parsedArg}))${this.LINE_TERMINATOR}`;
            } else if (expression.expression.kind === SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg})`;
            }
            return super.printThrowStatement(node, identation);
        }
        // const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
        // const newExpression = node.expression?.expression?.text;
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
        if (!node || !isBinaryExpression(node)) {
            return undefined;
        }
        const kind = node.operatorToken.kind;
        if (kind === SyntaxKind.EqualsToken || kind === SyntaxKind.PlusEqualsToken ||
            kind === SyntaxKind.MinusEqualsToken || kind === SyntaxKind.InKeyword ||
            kind === SyntaxKind.InstanceOfKeyword || kind in this.binaryExpressionsWrappers) {
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
        const walk = (childOperator: string, child) => {
            const info = this.goWalkBinary(childOperator, child.left, child.right, '');
            has4 = has4 || info.has4;
            has5 = has5 || info.has5;
            maxProblem = Math.max(maxProblem, info.maxProblem);
        };
        const leftOperator = this.goNativeBinaryOperator(left);
        if (leftOperator !== undefined && this.goOperatorPrecedence(leftOperator) >= precedence) {
            walk(leftOperator, left);
        }
        const rightOperator = this.goNativeBinaryOperator(right);
        if (rightOperator !== undefined && this.goOperatorPrecedence(rightOperator) > precedence) {
            walk(rightOperator, right);
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

        if (operatorToken.kind == SyntaxKind.InstanceOfKeyword) {
            return this.printInstanceOfExpression(node, identation);
        }

        if (operatorToken.kind === SyntaxKind.EqualsToken) {
            const a9fL1Init = this.goA9fL1CacheInitText(node);
            if (a9fL1Init !== undefined) {
                return a9fL1Init;
            }
            const pointerWrite = this.goPointerWriteText(node, identation);
            if (pointerWrite !== undefined) {
                return pointerWrite;
            }
            // handle test['a'] = 1;
            const elementAccess = left;
            const rightSide = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, 0));
            if (left.kind === SyntaxKind.ElementAccessExpression) {
                const leftSide = this.printNode(elementAccess.expression, 0);
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                const value = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();
                const native = this.printNativeElementAssignment(elementAccess.expression, leftSide, elementAccess.argumentExpression, propName, value, false, right)
                    ?? this.printNativeMapWriteOnProvenLocal(elementAccess.expression, leftSide, elementAccess.argumentExpression, propName, value, right);
                if (native !== undefined) {
                    return native;
                }
                return `AddElementToObject(${leftSide}, ${propName}, ${value})`;
            }

            if (right?.kind === SyntaxKind.AwaitExpression || rightSide.startsWith('<-this.callInternal')) {
                const leftParsed = this.printNode(left, 0);
                // the awaited call can carry a multi-line object literal argument: printing it
                // at the statement's own level keeps that literal one level deeper
                const awaited = (right?.kind === SyntaxKind.AwaitExpression)
                    ? this.printNode(right, identation)
                    : rightSide;
                return `
${this.getIden(identation)}${leftParsed} = ${awaited}
${this.getIden(identation)}PanicOnError(${leftParsed})`;
            }
        }

        const op = operatorToken.kind;
        // handle: [x,d] = this.method()
        if (op === SyntaxKind.EqualsToken && left.kind === SyntaxKind.ArrayLiteralExpression) {
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
                const statement = this.getIden(identation) + (this.goGetArgBindsDictElement(leftElement, right, index)
                    ? `${e} = MapTyped(GetValue(${syntheticName}, ${index}))`
                    : `${e} = GetValue(${syntheticName}, ${index})`);
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
        if (operatorToken.kind === SyntaxKind.EqualsEqualsToken || operatorToken.kind === SyntaxKind.EqualsEqualsEqualsToken) {
            if (this.COMPARISON_WRAPPER_OPEN) {
                leftVar = this.printNode(left, 0);
                rightVar = this.printNode(right, identation);
                return `${this.COMPARISON_WRAPPER_OPEN}${leftVar}, ${rightVar}${this.COMPARISON_WRAPPER_CLOSE}`;
            }
        }

        // check if boolean operators || and && because of the falsy values
        if (operatorToken.kind === SyntaxKind.BarBarToken || operatorToken.kind === SyntaxKind.AmpersandAmpersandToken) {
            leftVar = this.printCondition(left, 0);
            rightVar = this.printCondition(right, identation);
            if (operatorToken.kind === SyntaxKind.AmpersandAmpersandToken) {
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

        const bodyEndsWithReturn = (body: string, statements) => {
            const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
            const lastLine = lines.length ? lines[lines.length - 1] : "";
            return lastLine.startsWith("return") || lastLine.startsWith("panic") || lastLine.startsWith("throw new")
                || this.blockEndsWithConditionalReturn(statements);
        };
        const catchBodyEndsWithReturn = bodyEndsWithReturn(catchBody, node.catchClause.block.statements);
        const tryBodyEndsWithReturn = bodyEndsWithReturn(tryBody, node.tryBlock.statements);

        const returNil = "return nil";
        const isVoid   = this.isInsideVoidFunction(node);

        const nodeEndsWithReturn = tryBodyEndsWithReturn && catchBodyEndsWithReturn && !isVoid;
        const errorName = node.catchClause.variableDeclaration.name.text;
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
        if (operator === SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        if (operator === SyntaxKind.MinusToken) {
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
        let expression = node.expression?.text;
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
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.AsExpression:
            return this.goIndexableTypeOf(node.expression, printed);
        case SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case SyntaxKind.CallExpression:
            return this.goTypeOfInitializer(node, printed);
        case SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node) ?? this.g01MapParamType(node);
        case SyntaxKind.PropertyAccessExpression:
            return this.goIsPlainValuedMapField(node) ? 'map[string]any' : undefined;
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

    // `this.urls` on the exchange base: the hand-written go/v4/exchange.go keeps `urls` as a
    // map[string]any (the ccxt field table answers it) and derives two views of `urls["api"]` from it
    goIsUrlsField(node): boolean {
        return this.isGoThisPropertyAccessExpression(node) && (node.name?.text === 'urls')
            && (this.goFieldContainerTypeNative(node) === 'map[string]any');
    }

    // `this.urls['api']` is declared a Dict in the TS base (`urls: { api: Dict; ... }`): a string
    // index signature is the proof that every entry of it is the plain `any` a map index reads
    goUrlsApiIsDict(apiAccess): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        try {
            const type = checker.getTypeAtLocation(apiAccess);
            return (type !== undefined) && this.goParameterTypeIsDict(type);
        } catch (e) {
            return false;
        }
    }

    // `this.urls['api'][k]` reads the view BaseExchange.UrlsApi (urls["api"] as stored), and
    // `this.urls['api'][k][j]` the view UrlsApiSections (its dictionary entries); RefreshUrlsViews
    // re-derives both after every write of urls, so each read is the map's own index. The access path may
    // pass through `(… as Dict)` assertions, which print as their operand. A key the printer cannot prove a
    // Go string keeps its helper step, as does every step below the second.
    goUrlsViewRead(node, baseExpr, keys, keyStrs: string[]): string | undefined {
        if (this.isGoElementAccessAssignmentTarget(node)) {
            return undefined;
        }
        const path = keys.slice();
        const printed = keyStrs.slice();
        let receiver = baseExpr;
        let apiAccess: any = undefined;
        for (;;) {
            // `(x as Dict)` prints as `x`; a bare `(x)` keeps its parens in the printed text, so it stays a helper receiver
            while ((receiver?.kind === SyntaxKind.AsExpression)
                || ((receiver?.kind === SyntaxKind.ParenthesizedExpression) && (receiver.expression?.kind === SyntaxKind.AsExpression))) {
                receiver = receiver.expression;
            }
            if (receiver?.kind !== SyntaxKind.ElementAccessExpression) {
                break;
            }
            path.unshift(receiver.argumentExpression);
            printed.unshift(this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(receiver.argumentExpression, 0)));
            apiAccess = receiver;
            receiver = receiver.expression;
        }
        if ((path.length < 2) || !this.goIsUrlsField(receiver)) {
            return undefined;
        }
        if (apiAccess === undefined) {
            apiAccess = node;
            for (let i = path.length - 1; i > 0; i--) {
                apiAccess = apiAccess.expression;
            }
        }
        if ((path[0]?.kind !== SyntaxKind.StringLiteral) || (path[0].text !== 'api') || !this.goKeyIsString(path[1], printed[1])
            || !this.goUrlsApiIsDict(apiAccess)) {
            return undefined;
        }
        const section = (path.length > 2) && this.goKeyIsString(path[2], printed[2]);
        const view = section ? `this.UrlsApiSections[${printed[1]}][${printed[2]}]` : `this.UrlsApi[${printed[1]}]`;
        return this.goElementAccessChain(view, printed.slice(section ? 2 : 1));
    }

    // a statement assigning `this.urls` or one of its entries: the views have to be re-derived after it
    goIsUrlsWrite(statement): boolean {
        const expression: any = statement?.expression;
        if ((expression?.kind !== SyntaxKind.BinaryExpression) || (expression.operatorToken?.kind !== SyntaxKind.EqualsToken)) {
            return false;
        }
        let target: any = expression.left;
        while ((target?.kind === SyntaxKind.ElementAccessExpression) || (target?.kind === SyntaxKind.PropertyAccessExpression)) {
            if (this.goIsUrlsField(target)) {
                return true;
            }
            target = target.expression;
        }
        return false;
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
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.AsExpression:
            return this.goKeyIsString(node.expression, printed);
        case SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node) === 'string';
        case SyntaxKind.CallExpression:
            return this.goTypeOfInitializer(node, printed) === 'string';
        }
        return false;
    }

    // true when the printed key is a Safe*-boxed string: an identifier declared `*string`,
    // i.e. a nilable Go pointer. The native read needs GetValue's `*` deref and its nil
    // answer, neither of which an index expression expresses.
    goIsDerefStringKeyExpression(node): boolean {
        return (node?.kind === SyntaxKind.Identifier) && (this.goDeclaredTypeOfIdentifier(node) === '*string');
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
        return (node?.kind === SyntaxKind.PropertyAccessExpression)
            && (node.expression?.kind === SyntaxKind.ThisKeyword);
    }

    // true when the element access is the target of an assignment: the binary
    // expression printer owns that shape (AddElementToObject / rewritten GetValue
    // chains), a native `x[k]` index there would drop the write
    isGoElementAccessAssignmentTarget(node) {
        const parent = node.parent;
        return (parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === node)
            && ((parent.operatorToken.kind === SyntaxKind.EqualsToken) || (parent.operatorToken.kind === SyntaxKind.PlusEqualsToken));
    }

    // the key of a native list read: its printed Go type must be `int` for the guard's two
    // comparisons to compile, and the key expression is printed twice (the bounds test and the
    // index), so a call operand — evaluated twice — is rejected. Every other key keeps GetValue.
    goIntIndexExpression(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.NumericLiteral: {
            const text = `${node.text ?? ''}`;
            return /^\d+$/.test(text);
        }
        case SyntaxKind.ParenthesizedExpression:
            return this.goIntIndexExpression(node.expression);
        case SyntaxKind.PrefixUnaryExpression:
            return (node.operator === SyntaxKind.MinusToken) && this.goIntIndexExpression(node.operand);
        case SyntaxKind.Identifier:
            return this.goIntOperandIdentifier(node);
        case SyntaxKind.BinaryExpression: {
            const op = node.operatorToken?.kind;
            if ((op === SyntaxKind.PlusToken) || (op === SyntaxKind.MinusToken)
                || (op === SyntaxKind.AsteriskToken) || (op === SyntaxKind.PercentToken)) {
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
        const declaration: any = symbol?.valueDeclaration?.resolve();
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.initializer === undefined)) {
            return false;
        }
        const list: any = declaration.parent;
        const loop: any = list?.parent;
        if ((list?.kind !== SyntaxKind.VariableDeclarationList) || (list.declarations?.length !== 1)
            || (loop?.kind !== SyntaxKind.ForStatement) || (loop.initializer !== list)) {
            return false;
        }
        const text = `${declaration.initializer.text ?? ''}`;
        return (declaration.initializer.kind === SyntaxKind.NumericLiteral) && /^\d+$/.test(text);
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
        const declaration: any = symbol?.valueDeclaration?.resolve();
        return (declaration?.kind === SyntaxKind.VariableDeclaration)
            && (this.goSafeListLocalUnbox(declaration) === GO_SAFE_LIST_LOCAL_TYPE);
    }

    // true when the identifier's printed Go declaration is a `[]any` slice: the SafeList family
    // above, or any other local/param the declared-type table proved a slice (a slice literal,
    // a `[]any`-returning accessor, a slice param the typed-param family registers). All of them
    goDeclaredListIdentifier(node): boolean {
        return (this.goResolvedLocalGoType(node) === GO_SAFE_LIST_LOCAL_TYPE)
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
        const readBase: any = node?.expression;
        if ((readBase?.kind === SyntaxKind.Identifier)
            && this.goIsUnifiedAnySliceParameterNode(this.checkerOrUndefined()?.getSymbolAtLocation(readBase)?.valueDeclaration?.resolve?.())) {
            return undefined;
        }
        const bounded = this.goGb08BoundedListRead(node, keyNode); // RFM-G4 GB08
        if (bounded !== undefined) {
            return (bounded === 'native') ? `${containerStr}[${keyStr}]` : `DerefScalar(${containerStr}[${keyStr}])`;
        }
        const level = this.goStatementLevel;
        const body = this.getIden(level + 1);
        return `func() any {\n${body}if ${keyStr} >= 0 && ${keyStr} < len(${containerStr}) {\n${this.getIden(level + 2)}return DerefScalar(${containerStr}[${keyStr}])\n${body}}\n${body}return nil\n${this.getIden(level)}}()`;
    }

    // ===== RF-go-6-C =====
    // Go native reads on proven list receivers.
    // (1) A call `this.<name>(...)` to a method the host declares as returning a Go `[]any` (config
    //     `generatedListCallees`: the venue-uniform list producers) whose TS result type is an array
    //     type is a `[]any`: a local initialised by it is declared `[]any`, so `.length` prints
    //     `len(x)` and element reads take the native-list path.
    // (2) `xs[i]` on a local declared `[]string`, read inside `for (let i = 0; i < xs.length; i++)`
    //     with neither `i` nor `xs` written (or rebound) in the loop body and no function boundary
    //     between loop and read, is the slice index `xs[i]`: i < len(xs) holds at every statement of
    //     the body, a string element cannot box a pointer, so it is the very value GetValue returns.
    generatedListCallees: Set<string> = new Set<string>();

    goHostListCalleeType(callee: string, initializer): string | undefined {
        if (!callee.startsWith('this.') || !this.generatedListCallees.has(callee.substring('this.'.length))) {
            return undefined;
        }
        let call: any = initializer;
        while (call?.kind === SyntaxKind.ParenthesizedExpression) {
            call = call.expression;
        }
        const checker: any = this.checkerOrUndefined();
        if ((call?.kind !== SyntaxKind.CallExpression) || (checker === undefined)) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(call);
        return ((type !== undefined) && checker.isArrayType(type)) ? GO_SAFE_LIST_LOCAL_TYPE : undefined;
    }

    // a statement that writes, rebinds or shrinks `name` (assignment, ++/--, destructuring or
    // for-in/of target, a second declaration, delete, a mutating array method)
    goWritesOrRebindsName(n: any, name: string, mutators: string[]): boolean {
        if ((n.kind !== SyntaxKind.Identifier) || (n.text !== name)) {
            return false;
        }
        const parent: any = n.parent;
        switch (parent?.kind) {
        case SyntaxKind.BinaryExpression:
            return (parent.left === n) && (parent.operatorToken.kind >= SyntaxKind.FirstAssignment) && (parent.operatorToken.kind <= SyntaxKind.LastAssignment);
        case SyntaxKind.PrefixUnaryExpression:
        case SyntaxKind.PostfixUnaryExpression:
            return (parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken);
        case SyntaxKind.ForInStatement:
        case SyntaxKind.ForOfStatement:
            return parent.initializer === n;
        case SyntaxKind.VariableDeclaration:
        case SyntaxKind.Parameter:
        case SyntaxKind.BindingElement:
            return parent.name === n;
        case SyntaxKind.DeleteExpression:
            return true;
        case SyntaxKind.PropertyAccessExpression:
            return (parent.expression === n) && mutators.includes(parent.name?.text);
        }
        return false;
    }

    goLoopBoundedSliceRead(node, baseExpr, keyNode, containerStr: string, keyStr: string): string | undefined {
        if ((baseExpr?.kind !== SyntaxKind.Identifier) || (keyNode?.kind !== SyntaxKind.Identifier) || (baseExpr.text === keyNode.text)) {
            return undefined;
        }
        if (this.isGoElementAccessAssignmentTarget(node) || containerStr.includes('\n') || keyStr.includes('\n')) {
            return undefined;
        }
        const listType = this.goResolvedLocalGoType(baseExpr);
        if ((listType !== GO_STRING_LIST_LOCAL_TYPE) && !((listType === GO_SAFE_LIST_LOCAL_TYPE) && this.goListElementsAreObjects(baseExpr))) {
            return undefined;
        }
        const mutators = [ 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin' ];
        let child: any = node;
        for (let current: any = node.parent; (current !== undefined) && !isFunctionLike(current); child = current, current = current.parent) {
            if ((current.kind !== SyntaxKind.ForStatement) || (current.statement !== child)) {
                continue;
            }
            const condition: any = current.condition;
            const initializer: any = current.initializer;
            const step: any = current.incrementor;
            const declared: any = (initializer?.kind === SyntaxKind.VariableDeclarationList) ? initializer.declarations : undefined;
            const counts = (condition?.kind === SyntaxKind.BinaryExpression) && (condition.operatorToken.kind === SyntaxKind.LessThanToken)
                && (condition.left?.kind === SyntaxKind.Identifier) && (condition.left.text === keyNode.text)
                && this.goBoundIsLengthOf(condition.right, baseExpr, current)
                && (declared?.length === 1) && (declared[0].name?.text === keyNode.text)
                && (declared[0].initializer?.kind === SyntaxKind.NumericLiteral) && (declared[0].initializer.text === '0')
                && (step?.kind === SyntaxKind.PostfixUnaryExpression) && (step.operator === SyntaxKind.PlusPlusToken)
                && (step.operand?.kind === SyntaxKind.Identifier) && (step.operand.text === keyNode.text);
            if (!counts) {
                continue;
            }
            const disturbed = this.hasNodeWhere(current.statement, (n: any) => this.goWritesOrRebindsName(n, keyNode.text, [])
                || this.goWritesOrRebindsName(n, baseExpr.text, mutators));
            return disturbed ? undefined : `${containerStr}[${keyStr}]`;
        }
        return undefined;
    }
    // RF-go-6-C (DerefScalar follow-up): the checker types every element of this list as an object type
    // (a Trade / Order / Position interface, a Dict, a nested array), never a scalar, `any` or a union with
    // one. A Go `[]any` holding such elements holds maps or slices, never a *string/*int64/*float64/*bool, so
    // the DerefScalar the guarded element read carries is the identity and the read is the slice index.
    goListElementsAreObjects(baseExpr): boolean {
        const checker: any = this.checkerOrUndefined();
        const type: any = checker?.getTypeAtLocation(baseExpr);
        if ((type === undefined) || (typeof checker.isArrayType !== 'function') || !checker.isArrayType(type)) {
            return false;
        }
        const element: any = checker.getIndexTypeOfType(type, IndexKind.Number);
        if (element === undefined) {
            return false;
        }
        const parts: any[] = ((typeof element.isUnionType === 'function') && element.isUnionType()) ? element.getTypes().slice() : [element];
        const real = parts.filter((p) => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        return (real.length > 0) && real.every((p) => ((p.flags & TypeFlags.Object) !== 0) && ((p.flags & (TypeFlags.Any | TypeFlags.Unknown)) === 0));
    }

    // a same-named identifier that the checker binds to ANOTHER declaration (a sibling block's
    // `let quote`) is not a write of this loop-bounded element local
    goOtherBindingOfLoopBoundedElement(n, declaration): boolean {
        const init: any = declaration.initializer;
        if ((init?.kind !== SyntaxKind.ElementAccessExpression) || (this.goLoopBoundedStringElementType(init, this.printNode(init, 0)) === undefined)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const own: any = checker?.getSymbolAtLocation(declaration.name);
        const other: any = checker?.getSymbolAtLocation(n);
        return (own !== undefined) && (other !== undefined) && (own !== other);
    }

    // the loop bound is `xs.length`, or a `const n = xs.length` local with no write of xs between that
    // declaration and the end of the loop
    goBoundIsLengthOf(bound, baseExpr, loop): boolean {
        const isLength = (n: any) => (n?.kind === SyntaxKind.PropertyAccessExpression) && (n.name?.text === 'length')
            && (n.expression?.kind === SyntaxKind.Identifier) && (n.expression.text === baseExpr.text);
        if (isLength(bound)) {
            return true;
        }
        if (bound?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const declaration: any = this.checkerOrUndefined()?.getSymbolAtLocation(bound)?.valueDeclaration?.resolve();
        const list: any = declaration?.parent;
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (list?.kind !== SyntaxKind.VariableDeclarationList)
            || !isLength(declaration.initializer)) {
            return false;
        }
        const scope = this.goEnclosingFunction(loop);
        const mutators = [ 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin' ];
        // the length local is never written after its declaration; the list is not written between that
        // declaration and the end of the loop
        return !this.hasNodeWhere(scope, (n: any) => ((n !== declaration.name) && this.goWritesOrRebindsName(n, bound.text, []))
            || ((n.pos >= declaration.end) && (n.end <= loop.end) && this.goWritesOrRebindsName(n, baseExpr.text, mutators)));
    }

    // the element of a loop-bounded `[]string` read prints as the slice index, a Go string
    goLoopBoundedStringElementType(node, printedValue: string): string | undefined {
        const base: any = node.expression;
        const key: any = node.argumentExpression;
        if ((base?.kind !== SyntaxKind.Identifier) || (key?.kind !== SyntaxKind.Identifier)) {
            return undefined;
        }
        const index = `${base.text}[${key.text}]`;
        if (this.goResolvedLocalGoType(base) !== GO_STRING_LIST_LOCAL_TYPE) {
            return undefined;
        }
        return (printedValue.trim() === index) && (this.goLoopBoundedSliceRead(node, base, key, base.text, key.text) === index) ? 'string' : undefined;
    }
    // ===== end RF-go-6-C =====

    // ===== RFM-G4 GB08 (folded from build/hx10w8-GB08.ts): the prediction tier's dead bounds guard =====
    // `list[i]` inside `for (let i = 0; i < list.length; i++)` (or `i < n` with `const n = list.length`)
    // can never leave the slice, so the guard closure's nil branch is unreachable. Proof, all on the AST:
    // the counter starts at a non-negative literal and only the incrementor `i++` writes it, the list
    // local is never rebound in its function and no method call on it can resize it while the bound
    // is live. 'native' = `list[i]` (the list is a SafeList unbox or `[]` whose every write is a
    // dictionary, so DerefScalar cannot warp an element); 'deref' = `DerefScalar(list[i])`.
    goGb08PredictionFile(): boolean {
        const fileName = String(this.getSrc()?.fileName ?? '').replace(/\\/g, '/');
        return /(^|\/)ts\/src\/(prediction\/[^/]+|base\/PredictionExchange(\.nooverloads[^/]*)?)\.ts$/.test(fileName);
    }

    // an element written into the list that is an object (not a scalar, not an array): the Go value is
    // a map or struct, never one of derefScalar's `*string *int64 *float64 *bool *[]…` pointers
    goGb08IsDictExpression(expr): boolean {
        if (expr?.kind === SyntaxKind.ObjectLiteralExpression) {
            return true;
        }
        // a row read out of a decoded SafeList is a JSON value, never a pointer
        if ((expr?.kind === SyntaxKind.ElementAccessExpression) && (expr.expression?.kind === SyntaxKind.Identifier)
            && this.goSafeListUnboxIdentifier(expr.expression)) {
            return true;
        }
        const checker: any = this.checkerOrUndefined();
        const type: any = (checker !== undefined && expr !== undefined) ? checker.getTypeAtLocation(expr) : undefined;
        if (type === undefined) {
            return false;
        }
        const parts: any[] = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes().slice() : [type];
        const real = parts.filter((p) => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        return (real.length === 1) && ((real[0].flags & TypeFlags.Object) !== 0)
            && !checker.isArrayType(real[0]) && !checker.isTupleType?.(real[0]);
    }

    goGb08BoundedListRead(node, keyNode): 'native' | 'deref' | undefined {
        const checker: any = this.checkerOrUndefined();
        const base: any = node?.expression;
        if ((checker === undefined) || (keyNode?.kind !== SyntaxKind.Identifier) || (base?.kind !== SyntaxKind.Identifier)
            || !this.goGb08PredictionFile()) {
            return undefined;
        }
        const symbolOf = (n): any => checker.getSymbolAtLocation(n);
        const counterSymbol = symbolOf(keyNode);
        const counterDecl: any = counterSymbol?.valueDeclaration?.resolve?.();
        const counterList: any = counterDecl?.parent;
        const loop: any = counterList?.parent;
        if ((counterDecl?.kind !== SyntaxKind.VariableDeclaration) || (counterList?.kind !== SyntaxKind.VariableDeclarationList)
            || (loop?.kind !== SyntaxKind.ForStatement) || (loop.initializer !== counterList) || (counterList.declarations?.length !== 1)
            || (counterDecl.initializer?.kind !== SyntaxKind.NumericLiteral) || !/^\d+$/.test(`${counterDecl.initializer.text ?? ''}`)
            || (loop.statement === undefined) || (node.pos < loop.statement.pos) || (node.end > loop.statement.end)) {
            return undefined;
        }
        const listSymbol = symbolOf(base);
        const listDecl: any = listSymbol?.valueDeclaration?.resolve?.();
        const fn: any = this.goEnclosingFunction(node);
        if ((listDecl === undefined) || (fn === undefined) || (this.goEnclosingFunction(loop) !== fn)
            || (this.goEnclosingFunction(listDecl) !== fn)
            || ((listDecl.kind !== SyntaxKind.VariableDeclaration) && (listDecl.kind !== SyntaxKind.Parameter))
            || this.goLocalIsRebound(fn, listDecl.name)) {
            return undefined;
        }
        // the loop is `i < list.length`, or `i < n` where `const n = list.length` was read before it
        const cond: any = loop.condition;
        if ((cond?.kind !== SyntaxKind.BinaryExpression) || (cond.operatorToken?.kind !== SyntaxKind.LessThanToken)
            || (cond.left?.kind !== SyntaxKind.Identifier) || (symbolOf(cond.left) !== counterSymbol)) {
            return undefined;
        }
        let bound: any = cond.right;
        let hoistedEnd = -1;
        if (bound?.kind === SyntaxKind.Identifier) {
            const hoisted: any = symbolOf(bound)?.valueDeclaration?.resolve?.();
            if ((hoisted?.kind !== SyntaxKind.VariableDeclaration) || (hoisted.initializer === undefined)
                || (((hoisted.parent?.flags ?? 0) & NodeFlags.Const) === 0)
                || (hoisted.end > loop.pos) || (this.goEnclosingFunction(hoisted) !== fn)) {
                return undefined;
            }
            hoistedEnd = hoisted.end;
            bound = hoisted.initializer;
        }
        if ((bound?.kind !== SyntaxKind.PropertyAccessExpression) || (bound.name?.text !== 'length')
            || (bound.expression?.kind !== SyntaxKind.Identifier) || (symbolOf(bound.expression) !== listSymbol)) {
            return undefined;
        }
        const step: any = loop.incrementor;
        if (((step?.kind !== SyntaxKind.PostfixUnaryExpression) && (step?.kind !== SyntaxKind.PrefixUnaryExpression))
            || (step.operator !== SyntaxKind.PlusPlusToken) || (step.operand?.kind !== SyntaxKind.Identifier)
            || (symbolOf(step.operand) !== counterSymbol)) {
            return undefined;
        }
        const isAssignment = (n): boolean => {
            const op = n?.operatorToken?.kind;
            return (n?.kind === SyntaxKind.BinaryExpression)
                && ((op === SyntaxKind.EqualsToken) || ((op >= SyntaxKind.FirstCompoundAssignment) && (op <= SyntaxKind.LastCompoundAssignment)));
        };
        let sound = true;
        let dictOnly = true;
        const visit = (n): void => {
            if (!sound) {
                return;
            }
            if (n.kind === SyntaxKind.Identifier) {
                const inLoop = (n.pos >= loop.pos) && (n.end <= loop.end);
                if ((n.text === keyNode.text) && inLoop && (symbolOf(n) === counterSymbol)) {
                    const parent: any = n.parent;
                    const moved = (this.goRebindingTargetOf(n) !== undefined)
                        || (((parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.PrefixUnaryExpression))
                            && (parent !== step) && ((parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken)));
                    if (moved) {
                        sound = false;
                        return;
                    }
                }
                if ((n.text === base.text) && (n !== listDecl.name) && (symbolOf(n) === listSymbol)) {
                    const parent: any = n.parent;
                    const live = inLoop || ((hoistedEnd >= 0) && (n.pos > hoistedEnd));
                    if ((parent?.kind === SyntaxKind.PropertyAccessExpression) && (parent.expression === n)) {
                        const lengthWrite = (parent.name?.text === 'length') && isAssignment(parent.parent) && (parent.parent.left === parent);
                        const call = (parent.parent?.kind === SyntaxKind.CallExpression) && (parent.parent.expression === parent);
                        if (lengthWrite || (call && live)) {
                            sound = false;
                            return;
                        }
                        // a dictionary-only list takes elements through `push (dict)` and nothing else
                        if (call && !((parent.name?.text === 'push') && (parent.parent.arguments.length === 1)
                            && this.goGb08IsDictExpression(parent.parent.arguments[0]))) {
                            dictOnly = false;
                        }
                    } else if ((parent?.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === n)
                        && isAssignment(parent.parent) && (parent.parent.left === parent)) {
                        if (!((parent.parent.operatorToken.kind === SyntaxKind.EqualsToken) && this.goGb08IsDictExpression(parent.parent.right))) {
                            dictOnly = false;
                        }
                    }
                }
            }
            n.forEachChild(visit);
        };
        visit(fn);
        if (!sound) {
            return undefined;
        }
        const init: any = listDecl.initializer;
        const fromJson = (listDecl.kind === SyntaxKind.VariableDeclaration)
            && (this.goSafeListUnboxIdentifier(base) || ((init?.kind === SyntaxKind.ArrayLiteralExpression) && (init.elements.length === 0)));
        return (fromJson && dictOnly) ? 'native' : 'deref';
    }

    // RFM-G4 G21 (folded from build/hx10w5-G21.ts): `const xs = await this.m (..)` whose receive the printer
    // declares `[]any` (goAwaitReceiveUnbox) and whose awaited TS type is an array of objects (Dict[], a
    // Prediction* interface array). The carrier lists (MapSliceToList, Prediction*ToList, ListTyped of a
    // Dict[] endpoint) hold maps, never derefScalar's pointers, so a read the GB08 proof bounds is the bare
    // element. goNativeListElementRead only fires for locals the declared-type table calls []any; the
    // awaited receive is declared by printVariableDeclarationList, so it is answered here.
    goG21AwaitedObjectListRead(node, keyNode): boolean {
        const checker: any = this.checkerOrUndefined();
        const base: any = node?.expression;
        if ((checker === undefined) || (base?.kind !== SyntaxKind.Identifier) || (keyNode?.kind !== SyntaxKind.Identifier)) {
            return false;
        }
        const listDecl: any = checker.getSymbolAtLocation(base)?.valueDeclaration?.resolve?.();
        const awaited: any = listDecl?.initializer;
        if ((listDecl?.kind !== SyntaxKind.VariableDeclaration) || (listDecl.name?.kind !== SyntaxKind.Identifier)
            || (awaited?.kind !== SyntaxKind.AwaitExpression) || this.goDeclaredTypeInProgress.has(listDecl)
            || (this.goGb08BoundedListRead(node, keyNode) === undefined)) {
            return false;
        }
        const type: any = checker.getTypeAtLocation(awaited);
        if ((type === undefined) || !(type.flags & TypeFlags.Object) || !checker.isArrayType(type)
            || !this.goGb08IsDictExpression(node)) {
            return false;
        }
        this.goDeclaredTypeInProgress.add(listDecl);
        try {
            return this.goAwaitReceiveUnbox(awaited, this.printNode(awaited, 0))?.goType === GO_SAFE_LIST_LOCAL_TYPE;
        } finally {
            this.goDeclaredTypeInProgress.delete(listDecl);
        }
    }

    printElementAccessExpression(node, identation) {
        const bookSide = this.goOrderBookSideRead(node);  // RF-go-6-D
        if (bookSide !== undefined) {
            return bookSide;
        }
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
        while (isElementAccessExpression(current)) {
            keys.unshift(current.argumentExpression); // prepend
            const expr = current.expression;
            if (!isElementAccessExpression(expr)) {
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

        // RF-go-6-C: a loop-bounded read of a []string local is the slice index
        const boundedRead = (keys.length === 1) ? this.goLoopBoundedSliceRead(node, baseExpr, keys[0], containerStr, keyStrs[0]) : undefined;
        if (boundedRead !== undefined) {
            return boundedRead;
        }

        const urlsView = this.goUrlsViewRead(node, baseExpr, keys, keyStrs);
        if (urlsView !== undefined) {
            return urlsView;
        }

        const cacheRead = this.goG09CacheRead(node, baseExpr, containerStr, keys, keyStrs)
            ?? this.goG09CacheKeysElementRead(node, baseExpr, containerStr, keys, keyStrs);  // RFM-G4 G09
        if (cacheRead !== undefined) {
            return cacheRead;
        }

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

        if (this.rf6aNativeMapRead(node, baseExpr, keys[0], keyStrs[0])) {
            return this.goElementAccessChain(`${containerStr}[${keyStrs[0]}]`, keyStrs);
        }

        // Now build nested helpers.
        let acc = containerStr;
        keyStrs.forEach(k => {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${k}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        });

        // a local the printer declared []any — either unboxed from a `this.SafeList` accessor or
        // named []any by the declared-type table — is a slice, so an element read with a key it
        // prints as an int is the guarded native index (see goNativeListElementRead)
        if ((baseExpr?.kind === SyntaxKind.Identifier) && this.goDeclaredListIdentifier(baseExpr)) {
            const nativeRead = this.goNativeListElementRead(node, containerStr, keys[0], keyStrs[0]);
            if (nativeRead !== undefined) {
                return this.goElementAccessChain(nativeRead, keyStrs);
            }
        }
        // RFM-G4 G21: an awaited `[]any` local of objects (see goG21AwaitedObjectListRead)
        if ((baseExpr?.kind === SyntaxKind.Identifier) && (keys.length === 1) && !containerStr.includes('\n') && !keyStrs[0].includes('\n')
            && !this.isGoElementAccessAssignmentTarget(node) && this.goIntIndexExpression(keys[0])
            && this.goG21AwaitedObjectListRead(node, keys[0])) {
            return `${containerStr}[${keyStrs[0]}]`;
        }

        return acc;
    }

    isInsideVoidFunction(node: Node): boolean {
        for (let cur = node.parent; cur; cur = cur.parent) {
            if (isFunctionLike(cur)) {
                return (cur as any).type === undefined || (cur as any).type.kind === SyntaxKind.VoidKeyword;
            }
        }
        return true;          // default-to-void if uncertain
    }

    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: Statement): boolean {
        if (isBlock(statement)) {
            // A sequence of statements returns on all control paths if the last statement returns on all control paths
            if (statement.statements.length === 0) {
                return false;
            }
            return this.hasReturnInBlock(statement.statements[statement.statements.length - 1]);
        } else if (isReturnStatement(statement)) {
            return true;
        } else if (isThrowStatement(statement)) {
            return true;
        } else if (isIfStatement(statement)) {
            // An if statement returns on all control paths if both the "if" and "else" branches return on all control paths
            const ifHasReturn = this.hasReturnInBlock(statement.thenStatement);
            if (statement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(statement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
            return false; // No else statement, so execution can continue
        } else if (isTryStatement(statement)) {
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
    blockEndsWithConditionalReturn(statements: NodeArray<Statement>): boolean {
        if (statements.length === 0) {
            return false;
        }

        // an if (with an else) or a try returning on every path: hasReturnInBlock's own rules for both
        const lastStatement = statements[statements.length - 1];
        return (isIfStatement(lastStatement) || isTryStatement(lastStatement)) && this.hasReturnInBlock(lastStatement);
    }

    // hx4 G01
    // a defaulted parameter bound through GetArgMap is a Go map[string]any; an element read of it
    // indexes natively only where g01ReadOk proves the deref-free read answers what GetValue did
    g01MapParamType(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let decl: any;
        try {
            decl = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        } catch (e) {
            return undefined;
        }
        if ((decl?.kind !== SyntaxKind.Parameter) || (this.goGetArgParameterType(decl) !== 'map[string]any')) {
            return undefined;
        }
        const access: any = node.parent;
        if ((access?.kind === SyntaxKind.ElementAccessExpression) && (access.expression === node)
            && (this.g01ReadOk(node, access) !== 'map[string]any')) {
            return undefined;
        }
        return 'map[string]any';
    }

    // `receiver[k]` may replace GetValue(receiver, k) on a declared map[string]any: literal key, not a
    // compared operand, not an element-write value (the ccxt write pass proves those from the helper
    // spelling), and a market row or a consumer that derefScalars the value as GetValue did
    g01ReadOk(receiver, access): string | undefined {
        if (this.goIsComparedOperand(access) || this.g01IsWriteValue(access) || !this.g01LiteralKey(access.argumentExpression)) {
            return undefined;
        }
        return (this.g01MarketRow(receiver) || this.x02CurrencyRow(receiver) || this.g01DerefConsumer(access)) ? 'map[string]any' : undefined;
    }

    // a string literal or a non-negative integer literal key
    g01LiteralKey(key): boolean {
        return (key?.kind === SyntaxKind.StringLiteral) || (key?.kind === SyntaxKind.NoSubstitutionTemplateLiteral)
            || ((key?.kind === SyntaxKind.NumericLiteral) && /^\d+$/.test(`${key.text ?? ''}`));
    }

    // `y[k] = x["lit"]`
    g01IsWriteValue(access): boolean {
        let operand: any = access;
        while (operand.parent?.kind === SyntaxKind.ParenthesizedExpression) {
            operand = operand.parent;
        }
        const parent: any = operand.parent;
        return (parent?.kind === SyntaxKind.BinaryExpression) && (parent.right === operand)
            && (parent.operatorToken?.kind === SyntaxKind.EqualsToken) && (parent.left?.kind === SyntaxKind.ElementAccessExpression);
    }

    // a Market-typed local written only by `this.market (…)` (or undefined): that accessor returns
    // MarketTyped rows, whose values derefScalar leaves unchanged. Currency rows can hold *string values.
    g01MarketRow(node): boolean {
        let type: any;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return false;
        }
        const names = [ type?.aliasSymbol?.name, type?.symbol?.name ];
        if (!names.some((n) => [ 'Market', 'MarketInterface' ].includes(n))) {
            return false;
        }
        const declaration = this.goDeclarationOfIdentifier(node);
        const scope: any = (declaration === undefined) ? undefined : this.goEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        const isRow = (v: any) => (v === undefined) || ((v.kind === SyntaxKind.Identifier) && (v.text === 'undefined'))
            || ((v.kind === SyntaxKind.CallExpression) && (v.expression?.kind === SyntaxKind.PropertyAccessExpression)
                && (v.expression.expression?.kind === SyntaxKind.ThisKeyword) && (v.expression.name?.text === 'market'));
        let ok = isRow(declaration.initializer);
        const name = declaration.name?.text;
        const visit = (n: any) => {
            if (!ok) {
                return;
            }
            if ((n.kind === SyntaxKind.BinaryExpression) && (n.left?.kind === SyntaxKind.Identifier) && (n.left.text === name)
                && (n.operatorToken?.kind === SyntaxKind.EqualsToken) && this.goIdentifierRefersToDeclaration(n.left, declaration)) {
                ok = isRow(n.right);
            } else if ((n.kind === SyntaxKind.ArrayLiteralExpression) && (n.parent?.kind === SyntaxKind.BinaryExpression) && (n.parent.left === n)
                && n.elements.some((e: any) => (e.kind === SyntaxKind.Identifier) && (e.text === name))) {
                ok = false;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return ok;
    }

    // the read is the container of an enclosing element read, an operand of `in`, or an argument of a
    // SafeValueN-backed accessor (or safeCurrencyCode): each derefScalars it, so GetValue's deref is redundant
    g01DerefConsumer(access): boolean {
        let operand: any = access;
        while (operand.parent?.kind === SyntaxKind.ParenthesizedExpression) {
            operand = operand.parent;
        }
        const parent: any = operand.parent;
        if ((parent?.kind === SyntaxKind.ElementAccessExpression) && (parent.expression === operand)) {
            return !this.isGoElementAccessAssignmentTarget(parent);
        }
        if ((parent?.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken?.kind === SyntaxKind.InKeyword)) {
            return true;
        }
        const callee: any = parent?.expression;
        return (parent?.kind === SyntaxKind.CallExpression) && (parent.arguments.indexOf(operand) >= 0)
            && (callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.expression?.kind === SyntaxKind.ThisKeyword)
            && /^(?:safe(?:Value|String|StringLower|StringUpper|Integer|IntegerProduct|Float|Number|Bool|Timestamp|Dict|List)(?:2|N)?|safeCurrencyCode)$/.test(`${callee.name?.text ?? ''}`);
    }
    // hx4 G02
    // base safeValue/safeValue2/safeValueN (SafeValueN derefScalars every hit and its default) and
    // ws cache constructors (non-nil, outside the derefScalar set): never a nil pointer IsEqual folds
    goG02NonPointerAccessorSource(expr): boolean {
        if (expr?.kind === SyntaxKind.ConditionalExpression) {
            return this.goIsNonPointerValueSource(expr.whenTrue) && this.goIsNonPointerValueSource(expr.whenFalse);
        }
        if (expr?.kind === SyntaxKind.NewExpression) {
            const name = (expr.expression?.kind === SyntaxKind.Identifier) ? expr.expression.text : undefined;
            return GO_G02_CACHE_CLASSES.indexOf(name) >= 0;
        }
        if (expr?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee = expr.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== SyntaxKind.ThisKeyword
            || callee.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const keys = GO_G02_SAFE_VALUE_KEYS[callee.name.text];
        if (keys === undefined || expr.arguments.length > keys + 1) {
            return false;
        }
        // a default is returned as given (after derefScalar): only a literal is provably not a nil *sync.Map
        if (expr.arguments.length === keys + 1 && !this.goG02LiteralDefault(expr.arguments[keys])) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const declarations = checker?.getSymbolAtLocation(callee.name)?.declarations?.map((d) => d.resolve());
        if (!declarations || declarations.length === 0) {
            return false;
        }
        // an exchange override would print its own Go body: only the base property qualifies.
        // The base pass transpiles a stripped copy written beside the original as
        // Exchange.nooverloads.<pid>.ts, so accept that suffix as the base file too.
        const baseFile = /(^|\/)ts\/src\/base\/Exchange(\.[\w.-]+)?\.ts$/;
        if (declarations.every((d) => baseFile.test(String(d.getSourceFile()?.fileName ?? '').replace(/\\/g, '/')))) {
            return true;
        }
        return false;
    }

    goG02LiteralDefault(node): boolean {
        node = this.goUnwrapParenthesizedNode(node);
        switch (node?.kind) {
        case SyntaxKind.NullKeyword:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.ArrayLiteralExpression:
            return true;
        case SyntaxKind.Identifier:
            return node.text === 'undefined';
        }
        return false;
    }



    // hx4 G06
    // a `*string` the checker narrows to string (or whose every write is a defaulted SafeString)
    // is non-nil, so GetLength/GetArrayLength's deref + byte count is `len(*x)`
    goHx4G06DerefLength(expression, printedText: string, lengthNode): string | undefined {
        if ((expression?.kind !== SyntaxKind.Identifier) || (printedText !== expression.text)) {
            return undefined;
        }
        if (this.goLengthFeedsArithmeticClassifier(lengthNode) || !this.goDerefableStringOperand(expression)) {
            return undefined;
        }
        return `len(*${printedText})`;
    }

    // GetIndexOf on two operands that are Go strings once a proven-non-nil `*string` is deref'd:
    // both sides reach the helper's `case string` arm, which is strings.Index
    goHx4G06DerefIndexOf(node, name, parsedArg): string | undefined {
        if ((typeof name !== 'string') || (typeof parsedArg !== 'string') || name.includes('\n') || parsedArg.includes('\n')) {
            return undefined;
        }
        if (!this.goFileKeepsFileLevelImports() || !this.goStdlibImportIsPlaceable()) {
            return undefined;
        }
        const operands = [ this.goUnwrapPrintedAssertions(node?.expression?.expression), this.goUnwrapPrintedAssertions(node?.arguments?.[0]) ];
        const texts = [ name, parsedArg ];
        if (!operands.some((o) => this.goDerefableStringOperand(o))) {
            return undefined; // plain string pairs and nilable receivers stay with goNativeIndexOf
        }
        const out: string[] = [];
        for (let i = 0; i < 2; i++) {
            const o = operands[i];
            if ((o?.kind === SyntaxKind.Identifier) && (texts[i] === o.text) && this.goDerefableStringOperand(o)) {
                out.push('*' + texts[i]);
            } else if (this.goIndexOfOperandType(o, texts[i]) === 'string') {
                out.push(texts[i]);
            } else {
                return undefined;
            }
        }
        this.goFileStdlibImports.add('strings');
        return `strings.Index(${out[0]}, ${out[1]})`;
    }


    // hx4 G08
    // a `*string` local the checker narrowed to a union of string literals (`x === 'A' || x === 'B'`):
    // every member is a string, so the Go pointer is non-nil at this read and may be dereferenced
    goLiteralUnionNarrowedStringDeref(node): boolean {
        if ((node?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(node) !== '*string')) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(node);
        if ((type === undefined) || ((type.flags & TypeFlags.Union) === 0)) {
            return false;
        }
        const members = type.getTypes?.() ?? [];
        return (members.length > 0) && members.every((member) => (member.flags & TypeFlags.StringLiteral) !== 0);
    }
    // hx4 G09
    // hand-written BaseExchange value fields (go/v4/exchange.go) read as `this.<Field>`
    GO_G09_NUMERIC_FIELDS: { [tsName: string]: string } = {
        'rateLimit': 'float64',
        'fetchHistoryCacheSize': 'int',
        'minFundingAddressLength': 'int',
    };

    // `this.rateLimit` & co.: only when the checker resolves the property to the base
    // `class Exchange` declaration (a venue redeclaring it prints its own field)
    goG09FieldKind(node): string | undefined {
        node = this.goUnwrapParenthesizedNode(node);
        if ((node?.kind !== SyntaxKind.PropertyAccessExpression) || (node.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const kind = this.GO_G09_NUMERIC_FIELDS[node.name?.escapedText ?? node.name?.text];
        if (kind === undefined) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        const declaration: any = checker?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if ((declaration?.kind !== SyntaxKind.PropertyDeclaration) || (declaration.parent?.kind !== SyntaxKind.ClassDeclaration)) {
            return undefined;
        }
        const className = declaration.parent.name?.escapedText ?? declaration.parent.name?.text;
        return (className === 'Exchange') ? kind : undefined;
    }

    // [kind, pointer] of one ordered-comparison operand, undefined when unprovable
    goG09OperandKind(node, text: string): [string, boolean] | undefined {
        const pointee = this.goOrderedComparisonPointerKind(node);
        if (pointee !== undefined) {
            return [ pointee, true ];
        }
        const field = this.goG09FieldKind(node);
        if (field !== undefined) {
            return [ field, false ];
        }
        const kind = this.goOperandNumericKind(node, text);
        return (kind === undefined) ? undefined : [ kind, false ];
    }

    // Ordered comparisons the phase-1 rule refuses only because the two concrete kinds differ
    // (int vs int64, int/int64 vs float64) or an operand is a typed base field. The helper
    // converts the narrower side exactly like `int64(x)` / `float64(x)`; nil and NaN rules stay.
    printG09WideningComparison(left, right, leftText: string, rightText: string, op): string | undefined {
        const operator = ORDERED_COMPARISON_OPERATORS[op];
        if (operator === undefined) {
            return undefined;
        }
        if (this.goIsNumericConstant(left) && this.goIsNumericConstant(right)) {
            return undefined;
        }
        const l = this.goG09OperandKind(left, leftText);
        const r = this.goG09OperandKind(right, rightText);
        if ((l === undefined) || (r === undefined)) {
            return undefined;
        }
        let kind = this.goComparisonKind(left, l[0], right, r[0]);
        let lv = l[1] ? `*${leftText}` : leftText;
        let rv = r[1] ? `*${rightText}` : rightText;
        if (kind === undefined) {
            if (this.goIsNumericConstant(left) || this.goIsNumericConstant(right)) {
                return undefined;
            }
            kind = ((l[0] === 'float64') || (r[0] === 'float64')) ? 'float64' : 'int64';
            if (l[0] !== kind) {
                lv = `${kind}(${lv})`;
            }
            if (r[0] !== kind) {
                rv = `${kind}(${rv})`;
            }
        }
        if ((kind === 'float64') && ((operator === '<') || (operator === '<='))) {
            return undefined;
        }
        const leftNil = l[1] && !this.goHasEnclosingNilGuard(left);
        const rightNil = r[1] && !this.goHasEnclosingNilGuard(right);
        if ((leftNil && !r[1] && !this.goIsPureComparisonOperand(right))
            || (rightNil && !l[1] && !this.goIsPureComparisonOperand(left))) {
            return undefined;
        }
        const greater = (operator === '>') || (operator === '>=');
        const cmp = `${lv} ${operator} ${rv}`;
        if (!leftNil && !rightNil) {
            return `(${cmp})`;
        }
        if (leftNil && !rightNil) {
            return greater ? `(${leftText} != nil && ${cmp})` : `(${leftText} == nil || ${cmp})`;
        }
        if (!leftNil && rightNil) {
            return greater ? `(${rightText} == nil || ${cmp})` : `(${rightText} != nil && ${cmp})`;
        }
        if (operator === '>') {
            return `(${leftText} != nil && (${rightText} == nil || ${cmp}))`;
        }
        if (operator === '>=') {
            return `(${rightText} == nil || (${leftText} != nil && ${cmp}))`;
        }
        if (operator === '<') {
            return `(${rightText} != nil && (${leftText} == nil || ${cmp}))`;
        }
        return `(${leftText} == nil || (${rightText} != nil && ${cmp}))`;
    }

}


// get class decl node
// Use the getAllSuperTypeNodes function to get the base classes for the MyClass
// const baseClasses = getAllSuperTypeNodes(classDeclaration);

// // Create a type checker
// const typeChecker = ts.createTypeChecker(sourceFile.context.program, sourceFile.context.checker);

// // Get the type of the base class
// const baseClassType = typeChecker.getTypeAtLocation(baseClasses[0]);

// // Get the class declaration for the base class
// const baseClassDeclaration = baseClassType.symbol.valueDeclaration?.resolve();

// console.log(baseClassDeclaration);

// hx4 G02: key-argument count of the base safeValue family; ws cache classes (Go constructors return a non-nil *T)
const GO_G02_SAFE_VALUE_KEYS: { [name: string]: number } = { 'safeValue': 2, 'safeValue2': 3, 'safeValueN': 2 };
const GO_G02_CACHE_CLASSES = [ 'ArrayCache', 'ArrayCacheByTimestamp', 'ArrayCacheBySymbolById', 'ArrayCacheBySymbolBySide' ];

// hx4 G04
export interface GoTranspiler {
    goNativeIntWideningArithmetic(node, leftType: string, rightType: string, leftText: string, rightText: string): { goType: string, text: string } | undefined;
}
// `a - b` / `a * b` / `a + b` with one int64 and one int operand (or an int `- * %N` in a `var` initializer):
// the helper boxes int64 (Add/Subtract/Mod via the float path, Multiply via reflect Int()); Go refuses
// the mixed operator, so the int side converts. Exact under the helper's own 2^53 float bound.
GoTranspiler.prototype.goNativeIntWideningArithmetic = function (node, leftType: string, rightType: string, leftText: string, rightText: string) {
    const op = node.operatorToken.kind;
    const isMod = (op === SyntaxKind.PercentToken) && this.isNonZeroIntegerLiteral(node.right);
    if ((op !== SyntaxKind.MinusToken) && (op !== SyntaxKind.AsteriskToken) && (op !== SyntaxKind.PlusToken) && !isMod) {
        return undefined;
    }
    const mixed = ((leftType === 'int64') && (rightType === 'int')) || ((leftType === 'int') && (rightType === 'int64'));
    // `var x int64 = n - 1` over an `int` local: Subtract/Multiply box int64, so the int side converts
    const intKinds = [ 'int', 'const-int' ];
    const declaredInt64 = (op !== SyntaxKind.PlusToken) && intKinds.includes(leftType) && intKinds.includes(rightType)
        && ((leftType === 'int') || (rightType === 'int')) && this.goInsideTypedDeclarationInitializer(node);
    if ((!mixed || isMod) && !declaredInt64) {
        return undefined;
    }
    const operand = (operandNode, operandType: string, printed: string) => (operandType === 'int')
        ? 'int64(' + this.goUnwrapPrintedParens(printed.trim()) + ')'
        : this.goNativeOperandText(operandNode, printed);
    const left = operand(node.left, leftType, leftText);
    const right = operand(node.right, rightType, rightText);
    const symbol = this.SupportedKindNames[op];
    const separator = this.goBinarySeparator(symbol, right, node.left, node.right);
    return { 'goType': 'int64', 'text': left + separator + symbol + separator + right };
};

export interface GoTranspiler {
    goStringLiteralUnionType(type): boolean;
}
// `if (x === 'a' || x === 'b')` narrows a `Str` local to a union of string literals: every member
// is a non-nilable string, so the deref is as safe as for a plain narrowed `string`
GoTranspiler.prototype.goStringLiteralUnionType = function (type) {
    if ((type === undefined) || ((type.flags & TypeFlags.Union) === 0)) {
        return false;
    }
    const members = type.getTypes();
    return (members.length > 0) && members.every((member) => (member.flags & TypeFlags.StringLike) !== 0);
};

export interface GoTranspiler {
    goConcatDerefableStringOperand(node): boolean;
}
// the concat rule's `*string` leaf proof: goDerefableStringOperand, or a declared `*string`
// identifier the checker narrowed to a union of string literals at this use
GoTranspiler.prototype.goConcatDerefableStringOperand = function (node) {
    if (this.goDerefableStringOperand(node)) {
        return true;
    }
    if ((node?.kind !== SyntaxKind.Identifier) || (this.goDeclaredTypeOfIdentifier(node) !== '*string')) {
        return false;
    }
    const checker: any = this.checkerOrUndefined();
    return (checker !== undefined) && this.goStringLiteralUnionType(checker.getTypeAtLocation(node));
};

// hx4 X02
export interface GoTranspiler {
    x02CurrencyRow(node): boolean;
}
// a Currency-typed local written only by `this.currency (…)` / `this.safeCurrency (…)` (or undefined):
// the ccxt Go runtime returns those through CurrencyTyped, whose values derefScalar leaves unchanged
GoTranspiler.prototype.x02CurrencyRow = function (node) {
    let type: any;
    try {
        type = this.getChecker().getTypeAtLocation(node);
    } catch (e) {
        return false;
    }
    const named = (t: any) => [ t?.getAliasSymbol?.()?.name, t?.getSymbol?.()?.name ].some((n) => [ 'Currency', 'CurrencyInterface' ].includes(n));
    const members = ((typeof type?.isUnionType === 'function') && type.isUnionType()) ? type.getTypes() : [ type ];
    if (!named(type) && !members.some((t: any) => named(t))) {
        return false;
    }
    const declaration = this.goDeclarationOfIdentifier(node);
    const scope: any = (declaration === undefined) ? undefined : this.goEnclosingFunction(declaration);
    if (scope === undefined) {
        return false;
    }
    const isRow = (v: any) => (v === undefined) || ((v.kind === SyntaxKind.Identifier) && (v.text === 'undefined'))
        || ((v.kind === SyntaxKind.CallExpression) && (v.expression?.kind === SyntaxKind.PropertyAccessExpression)
            && (v.expression.expression?.kind === SyntaxKind.ThisKeyword) && [ 'currency', 'safeCurrency' ].includes(v.expression.name?.text));
    let ok = isRow(declaration.initializer);
    const name = declaration.name?.text;
    const visit = (n: any) => {
        if (!ok) {
            return;
        }
        if ((n.kind === SyntaxKind.BinaryExpression) && (n.left?.kind === SyntaxKind.Identifier) && (n.left.text === name)
            && (n.operatorToken?.kind === SyntaxKind.EqualsToken) && this.goIdentifierRefersToDeclaration(n.left, declaration)) {
            ok = isRow(n.right);
        } else if ((n.kind === SyntaxKind.ArrayLiteralExpression) && (n.parent?.kind === SyntaxKind.BinaryExpression) && (n.parent.left === n)
            && n.elements.some((e: any) => (e.kind === SyntaxKind.Identifier) && (e.text === name))) {
            ok = false;
        }
        n.forEachChild(visit);
    };
    scope.forEachChild(visit);
    return ok;
};

// hx4 G11
export interface GoTranspiler {
    g11NativeParameterType(fn, param, index: number): string | undefined;
    g11ParameterHasNullishDefault(body, param): boolean;
}
// A required parameter of an exchange-local method whose TS type is `Str`/`string`, `Dict`-shaped or
// `List`: the Go type every call site passes (`string` first, then *string / map / []any), when the body
// never writes another type, never nil-tests it and never `??`-defaults it (D2, D5)
GoTranspiler.prototype.g11NativeParameterType = function (fn, param, index: number) {
    const asyncMethod = this.isAsyncFunction(fn);
    if (!this.goHasTreeCallSite(fn)) {
        return undefined;
    }
    const candidates: string[] = [];
    if (asyncMethod) {
        // hx10 GP14: an async parameter takes only the value type every call site already passes.
        // A declared-type candidate (`*string` for `Str`, `*int64` for `Int`) would make the call
        // sites wrap their argument (SafeStringPtr/...), which is a wrapper move, not a win.
        candidates.push(...this.g14CallSiteParameterCandidates(fn, param, index));
    } else {
        const type = this.checkerOrUndefined()?.getTypeAtLocation(param);
        if (type !== undefined) {
            const all = ((typeof type.isUnionType === 'function') && type.isUnionType()) ? type.getTypes() : [type];
            const parts = all.filter(p => !(p.flags & (TypeFlags.Undefined | TypeFlags.Null)));
            if ((parts.length > 0) && parts.every(p => (p.flags & (TypeFlags.String | TypeFlags.StringLiteral)) !== 0)) {
                candidates.push('string');
            }
        }
        for (const goType of this.goNativeParameterTypeCandidates(param).concat(this.g13NumericParameterCandidates(param))) {
            if (!candidates.includes(goType)) {
                candidates.push(goType);
            }
        }
        // hx10 G02: a required parameter named `market` that TS leaves untyped is the market row by
        // convention; it takes the Go map when every call site passes one and the body only reads it
        if ((candidates.length === 0) && (param.name?.text === 'market') && (param.initializer === undefined)
            && (param.dotDotDotToken === undefined)) {
            candidates.push('map[string]any');
        }
    }
    for (const goType of candidates) {
        if (this.goParameterCallSitesPassType(fn, index, goType)
            && this.goLocalIsSafeToType(fn.body, param, param.name.text, goType)
            && (goType.startsWith('*') || this.goParameterKeepsNilCompareNative(fn.body, param, goType))
            && (goType.startsWith('*') || !this.g11ParameterHasNullishDefault(fn.body, param))) {
            return goType;
        }
    }
    return undefined;
};

// hx10 GP14
export interface GoTranspiler {
    g14CallSiteParameterCandidates(fn, param, index: number): string[];
    g14FeedsNullableSlot(fn, param): boolean;
    g14HasDynamicCallee(fn, name: string): boolean;
    goAnnotateMethodTypes(methodsTypes: any[], file): void;
}
// An async venue method also emits a public delegating wrapper, and ccxt builds that wrapper's
// parameter list from these records: a positional parameter has to carry the Go type the printer
// decided or the wrapper passes an `any` box into a typed slot. Optional and variadic parameters
// ride the options struct, whose field stays `any`.
GoTranspiler.prototype.goAnnotateMethodTypes = function (methodsTypes, file) {
    const methods: any[] = [];
    for (const statement of (file?.statements ?? [])) {
        if (statement.kind !== SyntaxKind.ClassDeclaration) {
            continue;
        }
        for (const member of (statement.members ?? [])) {
            if (member.kind === SyntaxKind.MethodDeclaration) {
                methods.push(member);
            }
        }
    }
    // getMethodTypes walks the classes and their methods in this same order
    for (let index = 0; index < methods.length; index++) {
        const fn = methods[index];
        const record = methodsTypes?.[index];
        if ((record === undefined) || !this.isAsyncFunction(fn)) {
            continue;
        }
        const parameters = fn.parameters ?? [];
        for (let i = 0; i < parameters.length; i++) {
            const param = parameters[i];
            if ((param.questionToken !== undefined) || (param.initializer !== undefined)
                || (param.dotDotDotToken !== undefined) || (record.parameters?.[i] === undefined)) {
                continue;
            }
            const goType = this.goNativeParameterType(param);
            if (goType !== undefined) {
                record.parameters[i].goType = goType;
            }
        }
    }
};
// the value types an async parameter takes: a map is passed as a map everywhere; a string is passed
// as a string unless the body feeds it into a nullable (`*string`) parameter slot
const G14_PARAMETER_TYPES = [ 'map[string]any', 'string' ];
// the aliases that print a `*T` Go type for a required parameter (g11NativeParameterTypeCandidates)
const G14_NULLABLE_PARAM_TYPES = /^(?:Str|Int|Num|Bool)$/;
// `this['name'](...)` resolves to no declaration, so a dynamic site can pass any value at any
// position; one file-wide scan per source file answers the veto
const G14_DYNAMIC_CACHE = new WeakMap<any, Set<string>>();
// The Go type the printed argument of every same-file call site carries when they agree on one the
// printer passes through unchanged; empty for disagreeing sites and for a site the index cannot see.
GoTranspiler.prototype.g14CallSiteParameterCandidates = function (fn, param, index: number) {
    if (this.g14HasDynamicCallee(fn, fn.name.text)) {
        return [];
    }
    const sites = this.goSameFileCallsOf(fn, fn.name.text);
    if (sites.length === 0) {
        return [];
    }
    const types: string[] = [];
    for (const site of sites) {
        const arg = site.arguments?.[index];
        if ((arg === undefined) || (arg.kind === SyntaxKind.SpreadElement)) {
            return [];
        }
        const printed = this.goPrintedArgType(arg);
        if ((printed === undefined) || (G14_PARAMETER_TYPES.indexOf(printed) < 0)) {
            return []; // an unnameable or unpassable argument type proves nothing
        }
        if (types.indexOf(printed) < 0) {
            types.push(printed);
        }
        if (types.length > 1) {
            return [];
        }
    }
    // a string that the body hands to a nullable-annotated parameter is re-wrapped there
    // (SafeStringPtr/...): a wrapper move, not a win
    if ((types[0] === 'string') && this.g14FeedsNullableSlot(fn, param)) {
        return [];
    }
    return types;
};

// true when the body passes `param` as an argument to a call whose parameter is declared a nullable
// alias (`Str`/`Int`/`Num`/`Bool`) or an `undefined`-bearing union: that slot prints a `*T`
GoTranspiler.prototype.g14FeedsNullableSlot = function (fn, param): boolean {
    const paramName = param.name.text;
    let found = false;
    const visit = (node: any) => {
        if (found) {
            return;
        }
        if ((node.kind === SyntaxKind.CallExpression) && (node.expression?.kind === SyntaxKind.PropertyAccessExpression)) {
            const args = node.arguments ?? [];
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                if ((arg?.kind !== SyntaxKind.Identifier) || (arg.text !== paramName)
                    || !this.goIdentifierRefersToDeclaration(arg, param)) {
                    continue;
                }
                let declaration;
                try {
                    declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
                } catch (e) {
                    declaration = undefined;
                }
                const calleeParam = declaration?.parameters?.[i];
                const text = ((calleeParam?.type === undefined) ? '' : String(calleeParam.type.getText()).trim());
                if (G14_NULLABLE_PARAM_TYPES.test(text) || text.includes('undefined')) {
                    found = true;
                    return;
                }
            }
        }
        node.forEachChild(visit);
    };
    fn.body?.forEachChild(visit);
    return found;
};

GoTranspiler.prototype.g14HasDynamicCallee = function (fn, name: string): boolean {
    const file: any = fn.getSourceFile();
    let names = G14_DYNAMIC_CACHE.get(file);
    if (names === undefined) {
        names = new Set<string>();
        const rx = /\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]\s*\(/g;
        const text = String(file.getFullText());
        let m: RegExpExecArray | null;
        while ((m = rx.exec(text)) !== null) {
            names.add(m[1]);
        }
        G14_DYNAMIC_CACHE.set(file, names);
    }
    return names.has(name);
};

// `x ?? d` / `x || d` reads the parameter's absent state, which a non-nilable Go type cannot hold
GoTranspiler.prototype.g11ParameterHasNullishDefault = function (body, param) {
    const name = param.name.text;
    return this.hasNodeWhere(body, (n: any) => {
        const parent: any = n.parent;
        return (n.kind === SyntaxKind.Identifier) && (n.text === name) && (parent?.kind === SyntaxKind.BinaryExpression)
            && (parent.left === n) && ((parent.operatorToken.kind === SyntaxKind.QuestionQuestionToken)
            || (parent.operatorToken.kind === SyntaxKind.QuestionQuestionEqualsToken));
    });
};

// hx4 G13
export interface GoTranspiler {
    g13NumericParameterCandidates(param): string[];
}
// a required `Int` / `Num` / `number` parameter: the pointer Go type the GetArg twins already use
// for `Int` / `Num` (nil is the absent state); a non-nullable `number` takes the plain value type its callers pass
GoTranspiler.prototype.g13NumericParameterCandidates = function (param) {
    const declared = (param?.type !== undefined) ? String(param.type.getText()).trim() : undefined;
    switch (declared) {
    case 'Int': return ['*int64'];
    case 'Num': return ['*float64'];
    case 'number': return ['int64', 'float64'];
    }
    return [];
};

// ---- FM-A9F L1: ws cache fields (goA9fL1*) -------------------------------------------------
export interface GoTranspiler {
    goA9fL1CacheField(node): string | undefined;
    goA9fL1CacheInitText(node): string | undefined;
}
// the four ws caches BaseExchange owns (go/v4/exchange.go declares each one a Go map/cache the exchange
// instance alone holds), keyed by the TS field name; the value is the printed Go field name
const GO_A9F_L1_CACHE_FIELDS: { [name: string]: string } = {
    'orderbooks': 'Orderbooks', 'ohlcvs': 'Ohlcvs', 'trades': 'Trades', 'fundingRates': 'FundingRates',
};
// `this.<field>` whose checker declaration is a property of the base exchange class (a local, a
// parameter or a field of another class with the same name is a different declaration)
GoTranspiler.prototype.goA9fL1CacheField = function (node) {
    if ((node?.kind !== SyntaxKind.PropertyAccessExpression) || (node.expression?.kind !== SyntaxKind.ThisKeyword)) {
        return undefined;
    }
    const name = node.name?.text;
    if ((typeof name !== 'string') || !Object.prototype.hasOwnProperty.call(GO_A9F_L1_CACHE_FIELDS, name)) {
        return undefined;
    }
    let declaration: any;
    try {
        declaration = this.checkerOrUndefined()?.getSymbolAtLocation(node.name)?.valueDeclaration?.resolve();
    } catch (e) {
        declaration = undefined;
    }
    const owner: any = declaration?.parent;
    const ownerName = owner?.name?.text;
    if ((declaration?.kind !== SyntaxKind.PropertyDeclaration) || (owner?.kind !== SyntaxKind.ClassDeclaration)
        || ((ownerName !== 'BaseExchange') && (ownerName !== 'Exchange'))) {
        return undefined;
    }
    return GO_A9F_L1_CACHE_FIELDS[name];
};
// `this.<cache> = this.createSafeDictionary ([true])` as a statement: the cache is a plain Go map owned by
// the exchange, so the reset is the map literal (a sync.Map-backed dictionary cannot be assigned to it)
GoTranspiler.prototype.goA9fL1CacheInitText = function (node) {
    const field = this.goA9fL1CacheField(node.left);
    const right = node.right;
    if ((field === undefined) || (node.parent?.kind !== SyntaxKind.ExpressionStatement) || (right?.kind !== SyntaxKind.CallExpression)) {
        return undefined;
    }
    const callee: any = right.expression;
    if ((callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)
        || (callee.name?.text !== 'createSafeDictionary')) {
        return undefined;
    }
    const args: any[] = right.arguments ?? [];
    if ((args.length > 1) || ((args.length === 1) && (args[0].kind !== SyntaxKind.TrueKeyword))) {
        return undefined;
    }
    return `${this.printNode(node.left, 0)} = map[string]any{}`;
};
