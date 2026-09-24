import { BaseTranspiler } from "./baseTranspiler.js";
import { SyntaxKind, type Node, type ParameterDeclaration } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isAsExpression, isBinaryExpression, isBlock, isBooleanLiteral, isBreakStatement, isCallExpression, isClassDeclaration, isClassExpression, isContinueStatement, isDeleteExpression, isElementAccessExpression, isExpressionStatement, isForStatement, isFunctionExpression, isIdentifier, isIfStatement, isMethodDeclaration, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPostfixUnaryExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isPropertyDeclaration, isPropertySignatureDeclaration, isReturnStatement, isSourceFile, isSpreadAssignment, isSpreadElement, isStringLiteral, isStringLiteralLikeNode, isThrowStatement, isTypeAssertion, isVariableDeclaration, isWhileStatement } from "typescript/unstable/ast/is";
import { IndexKind, TypeFlags, type Checker, type Symbol } from "typescript/unstable/sync";
import { findAncestor, isClassLike, isFunctionLike } from "./tsUtils.js";

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': 'new Dictionary<string, object>() {',
    'ARRAY_OPENING_TOKEN': 'new List<object>() {',
    'ARRAY_CLOSING_TOKEN': '}',
    'PROPERTY_ASSIGNMENT_TOKEN': ',',
    'VAR_TOKEN': 'object', // object
    'METHOD_TOKEN': '',
    'PROPERTY_ASSIGNMENT_OPEN': '{',
    'PROPERTY_ASSIGNMENT_CLOSE': '}',
    'SUPER_TOKEN': 'base',
    'SUPER_CALL_TOKEN': 'base',
    'FALSY_WRAPPER_OPEN': 'isTrue(',
    'FALSY_WRAPPER_CLOSE': ')',
    'COMPARISON_WRAPPER_OPEN' : "isEqual(",
    'COMPARISON_WRAPPER_CLOSE' : ")",
    'UKNOWN_PROP_WRAPPER_OPEN': 'this.call(',
    'UNKOWN_PROP_WRAPPER_CLOSE': ')',
    'UKNOWN_PROP_ASYNC_WRAPPER_OPEN': 'this.callAsync(',
    'UNKOWN_PROP_ASYNC_WRAPPER_CLOSE': ')',
    'DYNAMIC_CALL_OPEN': 'callDynamically(',
    'EQUALS_EQUALS_WRAPPER_OPEN': 'isEqual(',
    'EQUALS_EQUALS_WRAPPER_CLOSE': ')',
    'DIFFERENT_WRAPPER_OPEN': '!isEqual(',
    'DIFFERENT_WRAPPER_CLOSE': ')',
    'GREATER_THAN_WRAPPER_OPEN': 'isGreaterThan(',
    'GREATER_THAN_WRAPPER_CLOSE': ')',
    'GREATER_THAN_EQUALS_WRAPPER_OPEN': 'isGreaterThanOrEqual(',
    'GREATER_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'LESS_THAN_WRAPPER_OPEN': 'isLessThan(',
    'LESS_THAN_WRAPPER_CLOSE': ')',
    'LESS_THAN_EQUALS_WRAPPER_OPEN': 'isLessThanOrEqual(',
    'LESS_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'PLUS_WRAPPER_OPEN':'add(',
    'PLUS_WRAPPER_CLOSE':')',
    'MINUS_WRAPPER_OPEN':'subtract(',
    'MINUS_WRAPPER_CLOSE':')',
    'ARRAY_LENGTH_WRAPPER_OPEN': 'getArrayLength(',
    'ARRAY_LENGTH_WRAPPER_CLOSE': ')',
    'DIVIDE_WRAPPER_OPEN': 'divide(',
    'DIVIDE_WRAPPER_CLOSE': ')',
    'MULTIPLY_WRAPPER_OPEN': 'multiply(',
    'MULTIPLY_WRAPPER_CLOSE': ')',
    'INDEXOF_WRAPPER_OPEN': 'getIndexOf(',
    'INDEXOF_WRAPPER_CLOSE': ')',
    'MOD_WRAPPER_OPEN': 'mod(',
    'MOD_WRAPPER_CLOSE': ')',
    'FUNCTION_TOKEN': '',
    'INFER_VAR_TYPE': false,
    'INFER_ARG_TYPE': false,
};

// C# static type of the value each printed helper returns. A local initialised by
// one of these already holds that concrete type inside its `object` box, so naming
// the type at the declaration site keeps the very same runtime value and only
// refines what the C# compiler knows about it.

// instance-style calls the printer rewrites unconditionally by method name
// (`x.toUpperCase()` always prints `((string)x).ToUpper()`, whatever `x` is)
const CSHARP_METHOD_RETURN_TYPES: { [name: string]: string } = {
    'toUpperCase': 'string',
    'toLowerCase': 'string',
    'toString': 'string',
    'trim': 'string',
    'join': 'string',
    'replace': 'string',
    'replaceAll': 'string',
    'split': 'List<object>',
    'startsWith': 'bool',
    'endsWith': 'bool',
    'indexOf': 'int',
    'search': 'int',
};

// `Object.keys(x)`, `Math.floor(x)`, ... — matched on the full callee text
const CSHARP_STATIC_RETURN_TYPES: { [name: string]: string } = {
    'Object.keys': 'List<object>',
    'Object.values': 'List<object>',
    'Object.entries': 'List<object>',
    'JSON.stringify': 'string',
    'Math.floor': 'double',
    'Math.ceil': 'double',
    'Math.round': 'double',
    'Array.isArray': 'bool',
    'Number.isInteger': 'bool',
};

// delegate-valued members of the hand-written C# base (cs/ccxt/base/Exchange.Options.cs):
// `Func<...>` with this many parameters, so `this.<name>(args)` with that arity is a direct
// delegate invocation. `proxy` is a `string` there — not callable — and stays out.
const CSHARP_NATIVE_THIS_DELEGATE_ARITY: { [name: string]: number } = {
    'proxyUrlCallback': 3,
    'proxy_url_callback': 3,
    'httpProxyCallback': 4,
    'http_proxy_callback': 4,
    'httpsProxyCallback': 4,
    'https_proxy_callback': 4,
    'socksProxyCallback': 3,
    'socks_proxy_callback': 3,
};

// base-class helpers whose C# signature is already concrete
const CSHARP_THIS_RETURN_TYPES: { [name: string]: string } = {
    'extend': 'Dictionary<string, object>',
    'deepExtend': 'Dictionary<string, object>',
    'indexBy': 'Dictionary<string, object>',
    'groupBy': 'Dictionary<string, object>',
    'milliseconds': 'Int64',
    'seconds': 'Int64',
    'microseconds': 'Int64',
    'uuid': 'string',
    'hmac': 'string',
    'capitalize': 'string',
    'ymdhms': 'string',
    'yyyymmdd': 'string',
    'json': 'string',
    'inArray': 'bool',
    'valueIsDefined': 'bool',
    // the safe* accessor family: cs/ccxt/base already declares these with a concrete
    // return type (`string? safeString(...)`, `Int64? safeInteger(...)`, `bool? safeBool(...)`,
    // `IDictionary<string, object> safeDict(...)`, `List<object> safeList(...)`, ...), so a
    // local initialised by one of them already holds that type inside its `object` box
    'safeString': 'string?',
    'safeString2': 'string?',
    'safeStringN': 'string?',
    'safeStringLower': 'string?',
    'safeStringLower2': 'string?',
    'safeStringLowerN': 'string?',
    'safeStringUpper': 'string?',
    'safeStringUpper2': 'string?',
    'safeStringUpperN': 'string?',
    'safeCurrencyCode': 'string?',
    'safeInteger': 'Int64?',
    'safeInteger2': 'Int64?',
    'safeIntegerN': 'Int64?',
    'safeIntegerProduct': 'Int64?',
    'safeFloat': 'double?',
    'safeFloat2': 'double?',
    'safeFloatN': 'double?',
    'safeNumberN': 'double?',
    'safeBool': 'bool?',
    'safeBool2': 'bool?',
    'safeBoolN': 'bool?',
    'safeDict': 'IDictionary<string, object>',
    'safeDict2': 'IDictionary<string, object>',
    'safeDictN': 'IDictionary<string, object>',
    'safeList': 'List<object>',
    'safeList2': 'List<object>',
    'safeListN': 'List<object>',
};

// helpers whose C# signature is `object` (safeValue, getValue, parseInt, add,
// slice, safeTimestamp, ...) are deliberately absent above: their box holds a value the printer
// cannot name, so those locals stay `object`.

// this.<name>(...) base methods whose printed C# signature is a concrete numeric value the
// tables above do not carry: `int precisionFromString(object)` (Exchange.Number.cs) and
// `Int64? parseToInt(object)` (Exchange.BaseMethods.cs, retyped by the build layer)
const CSHARP_NATIVE_NUMERIC_THIS_KINDS: { [name: string]: string } = {
    'precisionFromString': 'int',
    'parseToInt': 'Int64?',
};

// the safe* accessor names of the table above: a local initialised by one of them gets the
// extra sink guards of csharpLocalIsSafeToType (list-only methods, hard `(string)` casts,
// the `+` LEFT operand overload rebinding)
const CSHARP_SAFE_ACCESSOR_NAMES = [
    'safeString', 'safeString2', 'safeStringN',
    'safeStringLower', 'safeStringLower2', 'safeStringLowerN',
    'safeStringUpper', 'safeStringUpper2', 'safeStringUpperN',
    'safeCurrencyCode',
    'safeInteger', 'safeInteger2', 'safeIntegerN', 'safeIntegerProduct',
    'safeFloat', 'safeFloat2', 'safeFloatN', 'safeNumberN',
    'safeBool', 'safeBool2', 'safeBoolN',
    'safeDict', 'safeDict2', 'safeDictN',
    'safeList', 'safeList2', 'safeListN',
];

// S62: calls whose C# signature is a hand-written `bool` (isTrue, isEqual, isGreaterThan, ...,
// inOp in cs/ccxt/base/Exchange.TranspileHelpers.cs; emitted for the comparison operators, `in`
// and TS `isTrue`) are already C# `bool`, so the condition printer's falsy wrapper is the identity.
const CSHARP_BOOLEAN_PRINTED_CALLS = [
    'isTrue', 'isEqual', 'isGreaterThan', 'isGreaterThanOrEqual',
    'isLessThan', 'isLessThanOrEqual', 'inOp',
];

// a transpiled parameter or local can literally be named `bool`, which would turn
// `bool x = ...` into a reference to that value instead of the type. `string` and
// `object` are already renamed by ReservedKeywordsReplacements.
const CSHARP_TYPE_NAMES = [ 'string', 'bool', 'int', 'long', 'Int64', 'double', 'object', 'List', 'IList', 'Dictionary', 'IDictionary', 'var' ];

// joins a receiver's printed text with a literal key in the `key in recv` guard index
const GUARD_KEY_SEPARATOR = "\u0000";

// C# kinds a comparison can be printed natively on: the runtime isLessThan family compares two
// boxes of one kind with the conversions the C# operator applies too. `double` keeps only
// `>`/`>=` — the helper reads a NaN operand as "less than", a native comparison is false — and
// only meets another `double`: its isEqual accepts an integral double as an integer.
const CSHARP_NUMERIC_KINDS = [ 'int', 'Int64', 'double' ];

// numeric kinds a printed call result can carry (with the nullable spellings the safe*
// accessors and parseToInt use), for the equality path only
const CSHARP_NUMERIC_VALUE_KINDS = [ 'int', 'Int64', 'Int64?', 'double', 'double?' ];

// integer kinds the helper normalises to Int64 (normalizeIntIfNeeded), the same widening the
// C# operator applies to an int next to a long, so a mixed pair prints the identical comparison
const CSHARP_INTEGER_KINDS = [ 'int', 'Int64' ];

const CSHARP_NATIVE_COMPARISON_TOKENS = {
    [SyntaxKind.LessThanToken]: '<',
    [SyntaxKind.GreaterThanToken]: '>',
    [SyntaxKind.LessThanEqualsToken]: '<=',
    [SyntaxKind.GreaterThanEqualsToken]: '>=',
};

// C# kinds where Math.Min/Max may replace mathMin/mathMax: the helper reads both boxes via
// Convert.ToDouble and returns an ORIGINAL box, so only integer kinds give the same value in the
// same box. `double` keeps the helper (Math.Min propagates NaN, and -0/+0 differ).
const CSHARP_MINMAX_NATIVE_KINDS = [ 'int', 'Int64' ];

// every binary operator that writes its left operand (typescript6 has no First/LastAssignmentOperator
// range to test against), used by the element-access loop guards below
const CSHARP_ASSIGNMENT_OPERATOR_KINDS = [
    SyntaxKind.EqualsToken,
    SyntaxKind.PlusEqualsToken,
    SyntaxKind.MinusEqualsToken,
    SyntaxKind.AsteriskEqualsToken,
    SyntaxKind.AsteriskAsteriskEqualsToken,
    SyntaxKind.SlashEqualsToken,
    SyntaxKind.PercentEqualsToken,
    SyntaxKind.LessThanLessThanEqualsToken,
    SyntaxKind.GreaterThanGreaterThanEqualsToken,
    SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
    SyntaxKind.AmpersandEqualsToken,
    SyntaxKind.BarEqualsToken,
    SyntaxKind.CaretEqualsToken,
    SyntaxKind.BarBarEqualsToken,
    SyntaxKind.AmpersandAmpersandEqualsToken,
    SyntaxKind.QuestionQuestionEqualsToken,
];

// hand-written BaseExchange fields whose C# declaration already is a concrete
// dictionary/list (cs/ccxt/base/Exchange.Options.cs): a read of the field carries
// that static type, so its own members (`Count`, `ContainsKey`) replace the helper
const CSHARP_NATIVE_FIELDS: { [name: string]: string } = {
    'options': 'ConcurrentDictionary<string, object>',
    'has': 'Dictionary<string, object>',
    'features': 'Dictionary<string, object>',
    'httpExceptions': 'Dictionary<string, object>',
    'markets_by_id': 'IDictionary<string, object>',
    'symbols': 'List<object>',
    'codes': 'List<object>',
    'ids': 'List<object>',
};

// hand-written BaseExchange fields declared `object` that always box a dictionary
// (dict / CustomConcurrentDictionary<string, object>): the member needs the same
// `(IDictionary<string, object>)` cast the transpiled helper body itself applies
const CSHARP_OBJECT_DICT_FIELDS = [ 'urls', 'tickers', 'bidsasks', 'orderbooks', 'ohlcvs', 'trades', 'markets', 'currencies', 'currencies_by_id', 'exceptions' ];

// Hand-written BaseExchange / PredictionExchange fields declared as C# reference types: the field
// holds a reference box, so a null comparison is exactly the isEqual(field, null) branch. A
// value-typed field keeps the helper — rateLimit is a `double` (its TS number type proves nothing).
const CSHARP_REFERENCE_FIELDS_NATIVE = [
    'id', 'hostname', 'apiKey', 'secret', 'password', 'uid', 'accountId', 'login', 'privateKey',
    'walletAddress', 'twofa', 'proxy', 'proxyUrl', 'proxy_url', 'proxyUrlCallback',
    'proxy_url_callback', 'last_http_response', 'markets', 'markets_by_id', 'features', 'tickers',
    'bidsasks', 'ohlcvs', 'trades', 'orders', 'myTrades', 'positions', 'liquidations', 'balance',
    'accounts', 'currencies', 'currencies_by_id', 'outcomes', 'outcomes_by_id', 'events',
    'events_by_slug', 'clients', 'ids', 'tokenBucket',
];

// hand-written BaseExchange fields declared `bool` (cs/ccxt/base/Exchange.Options.cs, e.g.
// `public bool newUpdates;` / `public bool verbose { get; set; }`): a `this.<name>` read is
// already a C# bool, so a condition holding one needs no isTrue wrapper
const CSHARP_NATIVE_BOOL_FIELDS = [
    'alias', 'certified', 'enableRateLimit', 'isSandboxModeEnabled', 'newUpdates', 'pro',
    'reduceFees', 'reloadingMarkets', 'returnResponseHeaders', 'substituteCommonCurrencyCodes', 'verbose',
];

// Hand-written BaseExchange fields whose reads print natively although the key may be absent:
// `has`/`options` are concrete dictionaries; `urls`, `markets`, `exceptions` are `object` boxes
// that always hold one. The native read tests the key, so a missing key still reads null.
const CSHARP_MISSING_KEY_FIELDS_NATIVE = [ 'has', 'options', 'urls', 'markets', 'exceptions' ];

// C# collection types this printer can name whose members replace the helpers
const CSHARP_NATIVE_COLLECTION_TYPES = [ 'List<object>', 'IList<object>', 'Dictionary<string, object>', 'IDictionary<string, object>' ];

// C# types isEqual's own branches can compare an element with: the box an element read
// yields is unboxed with `as`, which answers null for every other box
const CSHARP_SCALAR_ELEMENT_BOOL = 1;
const CSHARP_SCALAR_ELEMENT_STRING = 2;

// C# dictionary types this printer can name on a local
const CSHARP_NATIVE_DICTIONARY_TYPES = [ 'Dictionary<string, object>', 'IDictionary<string, object>' ];

// the row-receiver family of the cs-08 unit, extended by B-19 to the currency row: a read of a
// local with one of these names the declared table proves is a dictionary prints natively.
// Other receivers belong to their own units (cs-09 fields, cs-10 response/result/balance locals)
const CSHARP_NATIVE_MARKET_RECEIVERS = [ 'market', 'currency' ];

// Callees hand-written in cs/ccxt/base returning non-nullable `bool` with no TS declaration to read
// an annotation from: `isEmpty`, `isJsonEncodedObject`, `isBinaryMessage` and Precise's string
// comparisons. Keyed on printed callee text, so a `callDynamically` rewrite never matches.
const CSHARP_BOOL_CALLEES_NATIVE: { [name: string]: boolean } = {
    'this.isEmpty': true,
    'this.isJsonEncodedObject': true,
    'this.isBinaryMessage': true,
    'Precise.stringGt': true,
    'Precise.stringGe': true,
    'Precise.stringLt': true,
    'Precise.stringLe': true,
    'Precise.stringEq': true,
    'Precise.stringEquals': true,
};

// TS base methods the C# port hand-writes with its own signature: the TS annotation is `boolean`
// but the C# method bound by `this.<name>(...)` returns something else (`object isDictionary`),
// so the isTrue wrapper must stay regardless of the annotation.
const CSHARP_HANDWRITTEN_CALLEES_NATIVE = [ 'isDictionary' ];

// Declared C# types whose `Count` counts exactly what getArrayLength's IList / ICollection
// branches count. A prefix test: these are named with element types (`List<Order>`,
// `Dictionary<string, object>`, ...) and every member of the family carries `Count`.
const CSHARP_COUNT_TYPES = [ 'List<', 'IList<', 'Dictionary<', 'IDictionary<', 'ConcurrentDictionary<' ];

// ==== native parseInt / parseFloat / mod / prefix `-x` ====
// These helpers' answers depend on the runtime type of their boxes. Each emission below replaces
// the call only where the printer can name the exact value the helper returns; else keep helper.

// the numeric literal spellings this printer re-reads: decimal digits with an optional fraction
// (a hex or separator literal prints characters the C# compiler would read differently)
const CSHARP_DECIMAL_LITERAL = /^[0-9]+(\.[0-9]+)?$/;

// the C# source of a double literal holding exactly `value`: String() is the shortest
// round-trip spelling, and a whole number needs a fraction or an exponent to stay a double
function csharpDoubleLiteral(value) {
    if (!Number.isFinite(value)) {
        return undefined;
    }
    const text = String(value);
    return (text.indexOf('.') >= 0 || text.indexOf('e') >= 0) ? text : text + '.0';
}

// the numeric value of a literal operand: a plain literal or one under a unary minus
function csharpLiteralNumericValue(node) {
    if (isNumericLiteral(node)) {
        return CSHARP_DECIMAL_LITERAL.test(node.text) ? Number(node.text) : undefined;
    }
    if (isPrefixUnaryExpression(node) && (node.operator === SyntaxKind.MinusToken) && isNumericLiteral(node.operand)
        && CSHARP_DECIMAL_LITERAL.test(node.operand.text)) {
        return -Number(node.operand.text);
    }
    return undefined;
}

// `parseInt(<literal>)` boxes Convert.ToInt64(Math.Floor(Convert.ToDouble(a))): a digits-only
// string reads as the same number in every culture, so both readings fold into one Int64 literal
function csharpParseIntLiteralArgument(arg) {
    if (isStringLiteral(arg)) {
        if (!/^[0-9]+$/.test(arg.text)) {
            return undefined; // a sign, a point or an exponent is read with the CURRENT culture
        }
        const value = Number(arg.text);
        return Number.isSafeInteger(value) ? `${value}L` : undefined;
    }
    const numeric = csharpLiteralNumericValue(arg);
    if (numeric === undefined) {
        return undefined;
    }
    const floored = Math.floor(numeric);
    if (!Number.isSafeInteger(floored)) {
        return undefined;
    }
    return (floored < 0) ? `(${floored}L)` : `${floored}L`;
}

// `parseFloat(<literal>)` boxes Convert.ToDouble(a, InvariantCulture): a plain decimal string
// and a numeric literal both read as the nearest double, the value the literal spells
function csharpParseFloatLiteralArgument(arg) {
    if (isStringLiteral(arg)) {
        return CSHARP_DECIMAL_LITERAL.test(arg.text) ? csharpDoubleLiteral(Number(arg.text)) : undefined;
    }
    const numeric = csharpLiteralNumericValue(arg);
    return (numeric === undefined) ? undefined : csharpDoubleLiteral(numeric);
}

// receivers the market-typed-local unit owns (market/currency rows); this printer's literal-key
// read rule leaves them to that family and covers every other declared-collection local
const CSHARP_MARKET_RECEIVER_NAMES = [ 'market', 'currency' ];

// Parameters of a method whose override chain the ts/src census cleared: every declaration (base
// member + every override) maps to the same spelling AND every call site in the generated tree
// passes a compatible argument, so the whole-language build stays green. The three surviving
const CSHARP_OVERRIDE_PARAM_TYPES: { [name: string]: { [index: number]: string } } = {
    ethRpc: { 2: 'IList<object>' },
    parsePredictionOpenInterest: { 0: 'IDictionary<string, object>' },
    signEvmTransaction: { 0: 'IDictionary<string, object>' },
};


// a leading cast of the printed expression: `(IList<object>)(x)` names the receiver's static type
const CSHARP_LENGTH_CAST = /^\(([A-Za-z_][\w.]*(?:<[^<>]*(?:<[^<>]*>)?[^<>]*>)?)\)/;

// U55: declaration types where `isEqual (x, null)` -> `x == null` is the same test: `T?` (`== null`
// is `!x.HasValue`, the helper's `a == null` guard) and named reference types (reference compare).
// `object`/`var` and non-nullable scalars are refused (`x == null` won't compile for Int64/bool).
const CSHARP_NULL_COMPARISON_REFERENCE_HEADS = [ 'string', 'IDictionary<', 'Dictionary<', 'IList<', 'List<', 'ConcurrentDictionary<', 'ccxt.pro.', 'ArrayCache', 'IOrderBook', 'Future', 'WebSocketClient', 'Delegates' ];

export class CSharpTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    // method node -> 'bool' | 'bool?' | undefined (see csharpBooleanReturnType)
    csharpBooleanReturnTypes = new WeakMap<Node, string | undefined>();
    // variable declaration -> getCSharpLocalType result, shared by the condition checks
    csharpLocalTypes = new WeakMap<Node, string>();
    // method node -> `key in recv` guards of that method, keyed by receiver text + key
    csharpGuardIndex = new WeakMap<Node, Map<string, any[]>>();
    // optional proof of the concrete C# type of an expression, installed by the embedding build
    // layer for the locals it retypes itself (ccxt: build/csharp-local-types.js); it must
    // describe the same type the declaration is emitted with, or the operator will not compile
    csharpExpressionTypeResolver?: (node) => string | undefined;
    // optional proof of the C# type a LOCAL's declaration was emitted with, installed by the
    // embedding build layer for declarations it retyped itself; the member-access rules read it
    // only after this printer's own declared-local table declined
    csharpDeclaredLocalTypeResolver?: (declaration) => string | undefined;
    // variable declaration -> the concrete C# type this printer named for it
    // (getCSharpLocalType): 'List<object>' / 'Dictionary<string, object>' / 'string' / ...
    // Only declarations the printer typed itself are kept: the printed `<type> name = `
    // prefix is final, so every later read of the local is statically that type and its
    // members may replace inOp/getArrayLength
    csharpTypedLocals = new WeakMap<Node, string>();
    // ws handler `message` parameter -> the typed signature this printer prints for it (D-19)
    csharpHandlerMessageTypes = new WeakMap<Node, string | undefined>();
    // method declaration -> a static call reference exists (a call binds its arguments)
    csharpHandlerCalled = new WeakMap<Node, boolean>();
    // class declaration -> the class routes the raw message through a list test
    csharpListRouteClasses = new WeakMap<Node, boolean>();
    // source file -> method symbol -> a static call reference exists (built once per file: a
    // sticky batch program is shared by every file of the stage, so a program-keyed index
    // would answer for another venue's class)
    csharpHandlerCallIndex = new WeakMap<Node, Map<Symbol, boolean>>();
    // parameter node -> the type the printed signature gives it (printParameterType, e.g.
    // `Dict` -> Dictionary<string, object>), recorded as the signature is printed. Read-only:
    // no printer rule consults it, see csharpPrintedParamType
    csharpParamTypes = new WeakMap<Node, string>();
    // declaration node -> C# type of the local ('' = the printer prints `object`); see
    // csharpStringReceiverType -- the ccxt classifier asks once per string-method receiver
    stringReceiverTypes = new WeakMap<Node, string>();
    // declaration node -> 'bool' | 'bool?' | '' (the printer cannot name it); see
    // csharpConditionOperandType — asked once per condition operand
    conditionOperandTypes = new WeakMap<Node, string>();

    constructor(config = {}) {
        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = true;
        this.implicitAsyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = true;
        this.id = "C#";


        this.initConfig();

        // user overrides
        this.applyUserOverrides(config);
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
            'console.log': 'Console.WriteLine',
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
            'string': 'str',
            'object': 'obj',
            'params': 'parameters',
            'base': 'bs',
            'internal': 'intern',
            'event': 'eventVar',
            'fixed': 'fixedVar',
        };

        this.VariableTypeReplacements = {
            'string': 'string',
            'Str': 'string',
            'number': 'double',
            'Int': 'Int64',
            'Num': 'double',
            'Dict': 'Dictionary<string, object>',
            'Strings': 'List<string>',
            'List': 'List<object>',
            'boolean': 'bool',
        };

        this.ArgTypeReplacements = {
            'string': 'string',
            'Str': 'string',
            'number': 'double',
            'Int': 'Int64',
            'Num': 'double',
            'Dict': 'Dictionary<string, object>',
            'Strings': 'List<string>',
            'List': 'List<object>',
            'boolean': 'bool',
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

    getBlockOpen(identation){
        return "\n" + this.getIden(identation)  + this.BLOCK_OPENING_TOKEN + "\n";
    }

    printSuperCallInsideConstructor(node, identation) {
        return ""; // csharp does not need super call inside constructor
    }

    printIdentifier(node) {
        let idValue = node.text ?? node.text;

        if (this.ReservedKeywordsReplacements[idValue]) {
            idValue = this.ReservedKeywordsReplacements[idValue];
        }

        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }

        // check if it is a class declaration that we need to wrap arounf typeof
        // example: const x = Error -> var x = typeof(Error)
        const type = this.getChecker().getTypeAtLocation(node);
        const symbol = type?.symbol;
        if (symbol !== undefined) {
            // const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
            const decl = symbol?.declarations ?? [];
            let isBuiltIn = undefined;
            if (decl.length > 0) {
                isBuiltIn = decl[0].getSourceFile().fileName.indexOf('typescript') > -1; //very hacky find a better solution later
            }

            if (isBuiltIn !== undefined && !isBuiltIn) {
                // const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.ClassDeclaration);
                const isInsideNewExpression =  node?.parent?.kind === SyntaxKind.NewExpression;
                const isInsideCatch = node?.parent?.kind === SyntaxKind.ThrowStatement;
                const isLeftSide = node?.parent?.name === node || (node?.parent?.left === node);
                const isCallOrPropertyAccess = node?.parent?.kind === SyntaxKind.PropertyAccessExpression || node?.parent?.kind === SyntaxKind.ElementAccessExpression;
                if (!isLeftSide && !isCallOrPropertyAccess && !isInsideCatch && !isInsideNewExpression) {
                    // return `typeof(${idValue})`; // this is not working as expected
                    // for instance
                    // const instance = new x();
                    // const b = instance;
                    // gets transpiled to
                    // var instance = typeof(x);
                    const symbol = this.getChecker().getSymbolAtLocation(node);
                    let isClassDeclaration = false;
                    if (symbol) {
                        const first = symbol.declarations[0];
                        if (first.kind === SyntaxKind.ClassDeclaration) {
                            isClassDeclaration = true;
                        }
                        if (first.kind === SyntaxKind.ImportSpecifier) {
                            const importedSymbol = this.getChecker().getAliasedSymbol(symbol);
                            if (importedSymbol?.declarations[0]?.kind === SyntaxKind.ClassDeclaration) {
                                isClassDeclaration = true;
                            }
                        }
                    }
                    // console.log(node.getText(), 'isClass declaration', isClass);
                    if (isClassDeclaration) {
                        return `typeof(${idValue})`;
                        // this does not work then the class is imported from another file because
                        // the type is not resolved correctly and the symbol declaration is simply a importSpecifier
                        // we would need to find a way to get the type from the importSpecifier
                        // by loading the entire code upon transpiling the ts file
                    }
                }
            }
        }

        return this.transformIdentifier(node, idValue); // check this later
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

    printThisElementAccesssIfNeeded(node, identation) {
        // convert this[method] into this.call(method) or this.callAsync(method)
        // const isAsync = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
        const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        // if the call is async or not, so we need to assume it is async
        // example Promise.all([this.unknownPropAsync()])
        const elementAccess = node.expression;
        if (elementAccess?.kind === SyntaxKind.ElementAccessExpression) {
            if (elementAccess?.expression?.kind === SyntaxKind.ThisKeyword) {
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
        const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        const elementAccess = node.expression;
        if (elementAccess?.kind === SyntaxKind.ElementAccessExpression) {
            const parsedArg = node.arguments?.length > 0 ? node.arguments.map(n => this.printNode(n, identation).trimStart()).join(", ") : "";
            const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
            const argsArray = `new object[] { ${parsedArg} }`;
            const open = this.DYNAMIC_CALL_OPEN;
            let statement = `${open}${target}, ${propName}, ${argsArray})`;
            statement = isAsync ? `((Task<object>)${statement})` : statement;
            return statement;
        }
        return undefined;
    }


    // The C# declared type of an expression's receiver (`request` in `request["k"] = v`), as
    // the consumer's classifier knows it — ccxt's build/csharp-local-types.js overrides this
    // with its scope-aware local map. Undefined on an unpatched printer
    csharpDeclaredReceiverType(node): string | undefined {
        return undefined; // stub to override
    }

    // The C# type the printed SIGNATURE gives a parameter (`Dictionary<string, object>` for `Dict`,
    // `object` when unnamed), recorded while printing so a body use can ask. Read-only: no printer
    // rule consults it; only the consumer's csharpDeclaredReceiverType override changes emission.
    csharpPrintedParamType(receiver): string | undefined {
        const declaration = this.csharpReceiverBinding(receiver);
        if (declaration?.kind !== SyntaxKind.Parameter) {
            return undefined;
        }
        const recorded = this.csharpParamTypes.get(declaration);
        return ((recorded === undefined) || (recorded === '') || (recorded === 'object')) ? undefined : recorded;
    }

    // A receiver whose declared C# type the consumer's classifier names as a concrete dictionary:
    // the `((IDictionary<string,object>)x)` cast around element access is an identity conversion.
    // Gated entirely on the consumer's hook, so an object receiver and untyped runs keep the cast.
    csharpReceiverIsDeclaredDictionary(expression): boolean {
        const declared = this.csharpDeclaredReceiverType(expression);
        return (declared === 'Dictionary<string, object>') || (declared === 'IDictionary<string, object>');
    }

    // A dict element WRITE (`request["k"] = v`) on a receiver whose *declared* C# type is already a
    // dictionary needs no `((IDictionary<string,object>)…)` cast: both indexers are the same setter.
    // Gated entirely on csharpDeclaredReceiverType, so object receivers and untyped runs keep the cast.
    csharpDictionaryElementWriteTarget(node): string | undefined {
        const parent = node?.parent;
        // `request["k"] += v` keeps the cast: only the plain assignment was audited
        const isWrite = parent?.kind === SyntaxKind.BinaryExpression
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && parent.left === node;
        if (!isWrite || !this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return undefined;
        }
        const { expression, argumentExpression } = node;
        const declared = this.csharpDeclaredReceiverType(expression);
        if ((declared !== 'Dictionary<string, object>') && (declared !== 'IDictionary<string, object>')) {
            return undefined;
        }
        // the interface cast also carries the string-key proof; only a string key (or a union
        // holding one, the shape the index-signature key type reports) may stay cast-less
        const keyType = this.getChecker().getTypeAtLocation(argumentExpression);
        const members = (keyType.flags === TypeFlags.Union) ? ((keyType as any).types ?? [keyType]) : [keyType];
        const stringKey = (keyType.flags === TypeFlags.Any) || members.some((t) => this.isStringType(t.flags));
        if (!stringKey) {
            return undefined;
        }
        const cast = isStringLiteralLikeNode(argumentExpression) ? '' : '(string)';
        return this.printNode(expression, 0) + '[' + cast + this.printNode(argumentExpression, 0) + ']';
    }

    printElementAccessExpressionExceptionIfAny(node) {
        // convert this[method] into this.call(method) or this.callAsync(method)
    //    if (node?.expression?.kind === ts.SyntaxKind.ThisKeyword) {
    //         const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
    //         const open = isAsyncDecl ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
    //         return open.replace('(', '');
    //    }
    }

    // reads print getValue(recv, key), which yields null for a missing key; a C# indexer
    // throws instead, so the native form is only emitted where the source guarantees the key
    // is there: a dominating `key in recv` guard, or a receiver local built by a literal that
    // declares the key, or a receiver the declared table proves is a dictionary (the native
    // form then keeps the helper's null-for-a-missing-key result). every other read keeps the
    // helper.
    // the single element-access override, gates strongest (declaration-type) proof first:
    // S21 typed dict WRITE (csharpDictionaryElementWriteTarget), S63 typed dict READ twin
    // (printTypedDictElementAccessIfAny), S14 list-cast (csharpElementAccessReceiverIsList),
    // then the native read form proven from the printed source (#82, csharpNativeElementAccess,
    // see the note above). Every other read keeps the helper; a site no gate names keeps the
    // base printing.
    printElementAccessExpression(node, identation) {
        const native = this.csharpNativeElementAccess(node);
        if (native !== undefined) {
            return native;
        }
        const dictWrite = this.csharpDictionaryElementWriteTarget(node);
        if (dictWrite !== undefined) {
            return dictWrite;
        }
        const typedRead = this.printTypedDictElementAccessIfAny(node);
        if (typedRead !== undefined) {
            return typedRead;
        }
        if (this.csharpElementAccessReceiverIsList(node)) {
            const type = this.getChecker().getTypeAtLocation(node.argumentExpression);
            const isUnion = ((type.flags & TypeFlags.Union) !== 0) && Array.isArray((type as any).types);
            // the base printer's own key dispatch, plus the union spelling the worker
            // handles: a string (or type-less) key is a dictionary element, never a list
            // index, and keeps the IDictionary cast
            const isStringOrUnknownKey = this.isStringType(type.flags)
                || (type.flags === TypeFlags.Any)
                || (isUnion && (type as any).types.some((t) => this.isStringType(t.flags)));
            if (!isStringOrUnknownKey) {
                return `${this.printNode(node.expression, 0)}[Convert.ToInt32(${this.printNode(node.argumentExpression, 0)})]`;
            }
        }
        const listRead = this.csharpListIndexRead(node);
        if (listRead !== undefined) {
            return listRead;
        }
        return super.printElementAccessExpression(node, identation);
    }

    csharpNativeElementAccess(node): string | undefined {
        if (!this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return undefined;
        }
        const exception: any = this.printElementAccessExpressionExceptionIfAny(node);
        if (exception) {
            return undefined; // the exception printing wins over the native form
        }
        const { expression, argumentExpression } = node;
        const parent = node.parent;
        const isWrite = parent?.kind === SyntaxKind.BinaryExpression &&
            (parent.operatorToken.kind === SyntaxKind.EqualsToken || parent.operatorToken.kind === SyntaxKind.PlusEqualsToken) &&
            parent.left === node;
        if (isWrite) {
            return undefined; // writes are native already, they are printed with the cast
        }
        const isStringKey = isStringLiteralLikeNode(argumentExpression);
        const isNumberKey = isNumericLiteral(argumentExpression);
        if (!isStringKey && !isNumberKey) {
            return this.csharpLoopIndexListRead(expression, argumentExpression); // counter proven in range by its loop
        }
        const key = (argumentExpression as any).text;
        const builtFromLiteral = this.csharpLiteralDeclaresKey(node, expression, key, isNumberKey);
        const guarded = !builtFromLiteral && this.csharpKeyPresenceGuarded(node, expression, key);
        if (!builtFromLiteral && !guarded) {
            return this.csharpNativeDeclaredDictionaryRead(expression, argumentExpression)
                ?? this.csharpDeclaredLocalResolverRowRead(expression, argumentExpression)
                ?? this.csharpDeclaredCollectionRead(node, expression, argumentExpression, isStringKey, isNumberKey)
                ?? this.csharpProvenDictionaryRead(node, expression, argumentExpression, isStringKey)
                ?? this.csharpMissingKeyFieldRead(expression, argumentExpression, isStringKey);
        }
        const receiver = this.printNode(expression, 0);
        const printedKey = this.printNode(argumentExpression, 0);
        if (isNumberKey) {
            return `((${this.ARRAY_KEYWORD})${receiver})[${printedKey}]`;
        }
        // a receiver the classifier already declared a concrete dictionary keeps its own
        // indexer: the interface cast named the box, never a conversion
        if (this.csharpReceiverIsDeclaredDictionary(expression)) {
            return `${receiver}[${printedKey}]`;
        }
        return `((IDictionary<string,object>)${receiver})[${printedKey}]`;
    }

    // `getValue (market, "lit")` / `getValue (currency, "lit")` on a row local the declared
    // table proves is a C# dictionary: the native form tests the key, so a missing key still
    // reads null exactly like the helper. An untyped receiver keeps the helper.
    csharpNativeDeclaredDictionaryRead(expression, argumentExpression): string | undefined {
        if (!isIdentifier(expression) || !isStringLiteralLikeNode(argumentExpression)) {
            return undefined;
        }
        if (CSHARP_NATIVE_MARKET_RECEIVERS.indexOf(expression.text as string) < 0) {
            return undefined;
        }
        if (this.csharpDeclaredDictionaryType(expression) === undefined) {
            return undefined;
        }
        const receiver = this.printNode(expression, 0);
        const printedKey = this.printNode(argumentExpression, 0);
        return `(${receiver}.ContainsKey(${printedKey}) ? ${receiver}[${printedKey}] : null)`;
    }

    // the C# dictionary type the declared table names for a local read, or undefined: the
    // printer's own table, then the build layer's read proof (the row a market/currency builder
    // returned; never null on any path)
    csharpDeclaredDictionaryType(node): string | undefined {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const named = this.csharpTypedLocalType(node) ?? this.csharpExpressionTypeOf(node);
        if (named === undefined || CSHARP_NATIVE_DICTIONARY_TYPES.indexOf(named) < 0) {
            return undefined;
        }
        return named;
    }

    // the type the embedding build layer recorded for the declaration behind a read
    // (csharpDeclaredLocalTypeResolver): the declarations it retyped itself, i.e. the parameters
    // and locals whose printed prefix is no longer what the printer's own tables say
    csharpDeclaredLocalResolverType(node): string | undefined {
        if (typeof this.csharpDeclaredLocalTypeResolver !== 'function') {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration === undefined) {
            return undefined;
        }
        const recorded = this.csharpDeclaredLocalTypeResolver(declaration);
        return (typeof recorded === 'string') ? recorded : undefined;
    }

    // the same read for a receiver only the build layer's declared-local resolver names (a
    // parameter B-17 retyped): its box may still be null, so the read carries the helper's
    // own `value2 == null -> null` branch as a null test
    csharpDeclaredLocalResolverRowRead(expression, argumentExpression): string | undefined {
        if (!isIdentifier(expression) || !isStringLiteralLikeNode(argumentExpression)) {
            return undefined;
        }
        if (CSHARP_NATIVE_MARKET_RECEIVERS.indexOf(expression.text as string) < 0) {
            return undefined;
        }
        const recorded = this.csharpDeclaredLocalResolverType(expression);
        if (recorded === undefined || CSHARP_NATIVE_DICTIONARY_TYPES.indexOf(recorded) < 0) {
            return undefined;
        }
        const receiver = this.printNode(expression, 0);
        const printedKey = this.printNode(argumentExpression, 0);
        return `(${receiver} != null && ${receiver}.ContainsKey(${printedKey}) ? ${receiver}[${printedKey}] : null)`;
    }

    // a read of a hand-written BaseExchange dictionary field whose key may be absent: the key
    // test plus the indexer print what the helper computes, so a missing key still reads null
    // (a bare indexer would throw). Any other receiver or a numeric key keeps the helper
    csharpMissingKeyFieldRead(expression, argumentExpression, isStringKey): string | undefined {
        if (!isStringKey) {
            return undefined;
        }
        if (!isPropertyAccessExpression(expression) || expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const name = expression.name?.text as string;
        if (CSHARP_MISSING_KEY_FIELDS_NATIVE.indexOf(name) < 0) {
            return undefined;
        }
        const field = this.printNode(expression, 0);
        const printedKey = this.printNode(argumentExpression, 0);
        // `urls`/`markets`/`exceptions` are declared `object`: same cast and null-receiver branch as the
        // transpiled helper body (initializeProperties may leave the box null when describe() has no such
        // row). `has`/`options` are concrete dictionaries, never null, so they need no test.
        if (CSHARP_OBJECT_DICT_FIELDS.indexOf(name) >= 0) {
            const receiver = `((IDictionary<string, object>)${field})`;
            return `(${field} != null && ${receiver}.ContainsKey(${printedKey}) ? ${receiver}[${printedKey}] : null)`;
        }
        return `(${field}.ContainsKey(${printedKey}) ? ${field}[${printedKey}] : null)`;
    }

    // A literal-key read on a local whose C# declaration is already a collection: no cast needed, but
    // the indexer throws where GetValue answers null, so the native form carries the helper's key/index
    // and null-receiver tests. Only an Identifier qualifies (its text is read up to three times).
    csharpDeclaredCollectionRead(node, expression, argumentExpression, isStringKey, isNumberKey): string | undefined {
        if (!isIdentifier(expression)) {
            return undefined;
        }
        if (CSHARP_MARKET_RECEIVER_NAMES.indexOf(expression.text as string) >= 0) {
            return undefined;
        }
        const csharpType = this.csharpDeclaredCollectionType(expression);
        if (csharpType === undefined) {
            return undefined;
        }
        const func = this.csharpEnclosingFunction(node);
        if (func === undefined || this.csharpReceiverIsRewritten(func, expression)) {
            return undefined; // a reassigned receiver is not the object the declared type describes
        }
        const receiver = this.printNode(expression, 0);
        if (csharpType.indexOf('Dictionary<') >= 0) {
            if (!isStringKey) {
                return undefined; // the helper reads a dictionary key as a string, a literal index has no native twin
            }
            const printedKey = this.printNode(argumentExpression, 0);
            return `(${receiver} != null && ${receiver}.ContainsKey(${printedKey}) ? ${receiver}[${printedKey}] : null)`;
        }
        if (isNumberKey) {
            const index = Number((argumentExpression as any).text);
            if (!Number.isInteger(index) || (index < 0)) {
                return undefined; // the helper throws on a negative index too, but never prints one itself
            }
            return `(${receiver} != null && ${index} < ${receiver}.Count ? ${receiver}[${index}] : null)`;
        }
        return undefined;
    }

    // The C# collection type a local read was DECLARED with: printed by this printer, or recorded by
    // embedding build layer for a declaration it retyped (csharpDeclaredLocalTypeResolver). The
    // value-type oracle does not qualify: the declaration may still be `object` and not compile.
    csharpDeclaredCollectionType(expression): string | undefined {
        const named = this.csharpTypedLocalType(expression);
        if (named !== undefined && CSHARP_NATIVE_COLLECTION_TYPES.indexOf(named) >= 0) {
            return named;
        }
        if (this.csharpDeclaredLocalTypeResolver === undefined) {
            return undefined;
        }
        const declaration = this.getChecker().getSymbolAtLocation(expression)?.valueDeclaration;
        if (declaration === undefined) {
            return undefined;
        }
        const recorded = this.csharpDeclaredLocalTypeResolver(declaration);
        return (recorded !== undefined && CSHARP_NATIVE_COLLECTION_TYPES.indexOf(recorded) >= 0) ? recorded : undefined;
    }

    // A literal-key read on a local still declared `object` but whose box the build layer's value-type
    // oracle (build/csharp-local-types.js) proves a dictionary: the cast makes the read compile, and
    // key test plus null guard return exactly what the helper does. Sibling arms are filtered first.
    csharpProvenDictionaryRead(node, expression, argumentExpression, isStringKey): string | undefined {
        if (!isStringKey || !isIdentifier(expression)) {
            return undefined;
        }
        if (CSHARP_MARKET_RECEIVER_NAMES.indexOf(expression.text as string) >= 0) {
            return undefined;
        }
        if (this.csharpTypedLocalType(expression) !== undefined) {
            return undefined; // the declaration this printer wrote names its own type (see above)
        }
        const proven = this.csharpExpressionTypeOf(expression);
        if (proven === undefined || CSHARP_NATIVE_DICTIONARY_TYPES.indexOf(proven) < 0) {
            return undefined; // only a proven dictionary box has the members the read binds
        }
        const func = this.csharpEnclosingFunction(node);
        if (func === undefined || this.csharpReceiverIsRewritten(func, expression)) {
            return undefined; // a reassigned receiver may hold another box at this read
        }
        const local = this.printNode(expression, 0);
        const receiver = `((IDictionary<string, object>)${local})`;
        const printedKey = this.printNode(argumentExpression, 0);
        return `(${local} != null && ${receiver}.ContainsKey(${printedKey}) ? ${receiver}[${printedKey}] : null)`;
    }

    // the read sits in a branch that a `key in recv` guard admitted: same then-branch as the
    // guard, the else-branch of a negated guard, or after an early-exiting `if (!(key in recv))`
    csharpKeyPresenceGuarded(node, expression, key): boolean {
        const func = this.csharpEnclosingFunction(node);
        if (func === undefined || this.csharpEnclosingFunction(node) !== func) {
            return false;
        }
        const guards = this.csharpInGuardsOf(func).get(expression.getText() + GUARD_KEY_SEPARATOR + key);
        if (guards === undefined || !this.csharpReceiverIsDictionaryLike(expression, key)) {
            return false;
        }
        if (this.csharpReceiverIsRewritten(func, expression)) {
            return false; // a reassigned receiver is not the object the guard inspected
        }
        if (this.csharpHasKeyRemoval(func, expression, key)) {
            return false; // delete could have removed the guarded key
        }
        for (const guard of guards) {
            if (this.csharpGuardAdmitsRead(guard, node)) {
                return true;
            }
        }
        return false;
    }

    // `recv[i]` where `i` is the counter of an enclosing `for (...; i < recv.length; ...)`: that
    // condition is the range proof, so the helper's out-of-range null branch is unreachable. Both
    // operands must print as the indexer's C# types (object-element list, `int`); else keep the helper.
    csharpLoopIndexListRead(expression, argumentExpression): string | undefined {
        if (!isIdentifier(expression) || !isIdentifier(argumentExpression)) {
            return undefined;
        }
        const receiverType = this.csharpExpressionTypeOf(expression);
        if (receiverType === undefined || !this.csharpTypeIsList(receiverType)) {
            return undefined;
        }
        if (this.csharpExpressionTypeOf(argumentExpression) !== 'int') {
            return undefined; // a boxed/Int64/double index does not bind the List indexer
        }
        const loop = this.csharpCounterRangeLoop(argumentExpression, expression);
        if (loop === undefined) {
            return undefined;
        }
        if (!this.csharpCounterUnwrittenIn(loop.statement, argumentExpression) ||
            !this.csharpReceiverIntactIn(loop.statement, expression)) {
            return undefined; // the bound the header proved no longer holds at this read
        }
        return `${this.printNode(expression, 0)}[${this.printNode(argumentExpression, 0)}]`;
    }

    // the enclosing `for` whose condition is `<counter> < <recv>.length` and whose header declares
    // that counter: the condition held on entry to this pass and nothing in between moved off it
    csharpCounterRangeLoop(counter, receiver) {
        let node: any = counter;
        while (node.parent !== undefined) {
            const parent: any = node.parent;
            if (isFunctionLike(parent)) {
                return undefined; // a closure runs when the counter may already have moved on
            }
            if (isForStatement(parent) && this.csharpContains(parent.statement, counter) && this.csharpForBoundsCounter(parent, counter, receiver)) {
                return parent;
            }
            node = parent;
        }
        return undefined;
    }

    csharpForBoundsCounter(loop, counter, receiver): boolean {
        const condition = this.csharpUnparenthesized(loop.condition);
        if (condition?.kind !== SyntaxKind.BinaryExpression || condition.operatorToken.kind !== SyntaxKind.LessThanToken) {
            return false;
        }
        const left = this.csharpUnparenthesized(condition.left);
        const right = this.csharpUnparenthesized(condition.right);
        if (!isIdentifier(left) || !isPropertyAccessExpression(right) || right.name?.text !== 'length') {
            return false;
        }
        const receiverExpression = this.csharpUnparenthesized(right.expression);
        if (!isIdentifier(receiverExpression) || !this.csharpCounterStartsAtZero(loop, counter) || !this.csharpCounterAdvances(loop, counter)) {
            return false;
        }
        const declaration = this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration;
        const checker = this.getChecker();
        return declaration !== undefined &&
            checker.getSymbolAtLocation(left)?.valueDeclaration === declaration &&
            checker.getSymbolAtLocation(receiverExpression)?.valueDeclaration === checker.getSymbolAtLocation(receiver)?.valueDeclaration;
    }

    // `for (let i = <literal >= 0>; ...)` — a negative start would index below the list
    csharpCounterStartsAtZero(loop, counter): boolean {
        const initializer: any = loop.initializer;
        if (initializer?.kind !== SyntaxKind.VariableDeclarationList || initializer.declarations.length !== 1) {
            return false;
        }
        const declaration: any = initializer.declarations[0];
        if (!isIdentifier(declaration.name) || !isNumericLiteral(declaration.initializer)) {
            return false;
        }
        return Number(declaration.initializer.text) >= 0 && this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration === declaration;
    }

    // the header moves the counter forward: a decrement could leave a negative index behind
    csharpCounterAdvances(loop, counter): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration;
        const incrementor: any = this.csharpUnparenthesized(loop.incrementor);
        if (incrementor === undefined || declaration === undefined) {
            return false;
        }
        if (incrementor.kind === SyntaxKind.PostfixUnaryExpression || incrementor.kind === SyntaxKind.PrefixUnaryExpression) {
            return incrementor.operator === SyntaxKind.PlusPlusToken &&
                this.getChecker().getSymbolAtLocation(incrementor.operand)?.valueDeclaration === declaration;
        }
        if (incrementor.kind === SyntaxKind.BinaryExpression && incrementor.operatorToken.kind === SyntaxKind.PlusEqualsToken) {
            return this.getChecker().getSymbolAtLocation(incrementor.left)?.valueDeclaration === declaration &&
                isNumericLiteral(incrementor.right) && Number(incrementor.right.text) >= 0;
        }
        return false;
    }

    // a write to the counter in the body invalidates the bound the condition proved
    csharpCounterUnwrittenIn(range, counter): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration;
        if (declaration === undefined) {
            return false;
        }
        let written = false;
        this.csharpWalkIdentifiers(range, (identifier: any) => {
            if (written || !this.csharpIsSameDeclaration(identifier, declaration)) {
                return;
            }
            const parent: any = identifier.parent;
            if (isBinaryExpression(parent) && parent.left === identifier) {
                written = CSHARP_ASSIGNMENT_OPERATOR_KINDS.indexOf(parent.operatorToken.kind) >= 0;
            } else if ((isPrefixUnaryExpression(parent) || isPostfixUnaryExpression(parent)) && parent.operand === identifier) {
                written = true;
            } else if (isDeleteExpression(parent)) {
                written = true;
            }
        });
        return !written;
    }

    // the condition's `<recv>.length` still proves the range only while the list is intact: inside
    // the body the receiver may be read (element reads, its own `.length`) and nothing else
    csharpReceiverIntactIn(range, receiver): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(receiver)?.valueDeclaration;
        if (declaration === undefined) {
            return false;
        }
        let intact = true;
        this.csharpWalkIdentifiers(range, (identifier: any) => {
            if (!intact || !this.csharpIsSameDeclaration(identifier, declaration)) {
                return;
            }
            const parent: any = identifier.parent;
            if (isPropertyAccessExpression(parent) && parent.expression === identifier && parent.name?.text === 'length') {
                return;
            }
            if (isElementAccessExpression(parent) && parent.expression === identifier && !this.csharpIsWriteTarget(parent)) {
                return;
            }
            intact = false;
        });
        return intact;
    }

    csharpIsSameDeclaration(identifier, declaration): boolean {
        return this.getChecker().getSymbolAtLocation(identifier)?.valueDeclaration === declaration;
    }

    csharpWalkIdentifiers(node, visit) {
        if (node === undefined) {
            return;
        }
        if (isIdentifier(node)) {
            visit(node);
        }
        node.forEachChild((child: any) => this.csharpWalkIdentifiers(child, visit));
    }

    // `x[i] = v` / `x[i]++` / `delete x[i]` change the receiver in place
    csharpIsWriteTarget(node): boolean {
        let value: any = node;
        while (value.parent !== undefined && isParenthesizedExpression(value.parent)) {
            value = value.parent;
        }
        const parent: any = value.parent;
        if (parent === undefined) {
            return false;
        }
        if (isBinaryExpression(parent) && parent.left === value) {
            return CSHARP_ASSIGNMENT_OPERATOR_KINDS.indexOf(parent.operatorToken.kind) >= 0;
        }
        if ((isPrefixUnaryExpression(parent) || isPostfixUnaryExpression(parent)) && parent.operand === value) {
            return (parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken);
        }
        return isDeleteExpression(parent);
    }

    csharpUnparenthesized(node) {
        let value: any = node;
        while (value !== undefined && value.kind === SyntaxKind.ParenthesizedExpression) {
            value = value.expression;
        }
        return value;
    }

    csharpGuardAdmitsRead(guard, read): boolean {
        const negated = this.csharpGuardIsNegated(guard);
        let statement: any = guard;
        while (statement !== undefined && statement.parent !== undefined) {
            const parent: any = statement.parent;
            if (isIfStatement(parent) && this.csharpContains(parent.expression, guard)) {
                if (!negated && this.csharpContains(parent.thenStatement, read)) {
                    return true;
                }
                if (negated && parent.elseStatement !== undefined && this.csharpContains(parent.elseStatement, read)) {
                    return true;
                }
                // `if (!(key in recv)) { return/throw/continue; }` then the read after it
                if (negated && this.csharpAlwaysExits(parent.thenStatement) &&
                    read.getStart() >= parent.getEnd() && this.csharpContains(parent.parent, read)) {
                    return true;
                }
                return false;
            }
            if (isWhileStatement(parent) && this.csharpContains(parent.expression, guard)) {
                return !negated && this.csharpContains(parent.statement, read);
            }
            statement = parent;
        }
        return false;
    }

    // `key in recv` guards in the function body, indexed by receiver text + key; nested
    // functions are skipped, their guards cannot dominate a read of the outer function
    csharpInGuardsOf(func): Map<string, any[]> {
        const cached = this.csharpGuardIndex.get(func);
        if (cached !== undefined) {
            return cached;
        }
        const index: Map<string, any[]> = new Map();
        const collect = (n: any) => {
            if (n !== func && isFunctionLike(n)) {
                return;
            }
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.InKeyword) {
                const keyNode: any = n.left;
                if (isStringLiteralLikeNode(keyNode) || isNumericLiteral(keyNode)) {
                    const id = n.right.getText() + GUARD_KEY_SEPARATOR + keyNode.text;
                    const list = index.get(id);
                    if (list === undefined) {
                        index.set(id, [ n ]);
                    } else {
                        list.push(n);
                    }
                }
            }
            n.forEachChild(collect);
        };
        collect(func);
        this.csharpGuardIndex.set(func, index);
        return index;
    }

    // the read's receiver is a local whose only initializer is a literal that declares the
    // key, and the local is not reassigned or deleted from afterwards
    csharpLiteralDeclaresKey(node, expression, key, isNumberKey): boolean {
        if (!isIdentifier(expression)) {
            return false;
        }
        const symbol: any = this.getChecker().getSymbolAtLocation(expression);
        const declarations: any = symbol?.declarations ?? [];
        if (declarations.length !== 1 || !isVariableDeclaration(declarations[0])) {
            return false;
        }
        const declaration: any = declarations[0];
        if (declaration.initializer === undefined || declaration.getStart() >= node.getStart()) {
            return false;
        }
        const initializer = declaration.initializer;
        let declares = false;
        if (isNumberKey && isArrayLiteralExpression(initializer)) {
            const spread = initializer.elements.some((element: any) => isSpreadElement(element));
            declares = !spread && Number(key) < initializer.elements.length;
        } else if (!isNumberKey && isObjectLiteralExpression(initializer)) {
            declares = this.csharpObjectLiteralDeclaresKey(initializer, key);
        }
        if (!declares) {
            return false;
        }
        const func = this.csharpEnclosingFunction(node);
        return func !== undefined && !this.csharpReceiverIsRewritten(func, expression);
    }

    csharpObjectLiteralDeclaresKey(literal, key): boolean {
        for (const property of literal.properties) {
            if (isSpreadAssignment(property)) {
                return false; // spread keys cannot be enumerated
            }
            const name: any = (property as any).name;
            if (name !== undefined && (isIdentifier(name) || isStringLiteralLikeNode(name) || isNumericLiteral(name)) && name.text === key) {
                return true;
            }
        }
        return false;
    }

    // the receiver must be a dictionary at runtime for the IDictionary cast to hold; `any`
    // receivers are rejected because the checker cannot tell what the read reaches
    csharpReceiverIsDictionaryLike(expression, key): boolean {
        const type: any = this.getChecker().getTypeAtLocation(expression);
        if (type.flags === TypeFlags.Any || type.flags === TypeFlags.Unknown) {
            return false;
        }
        const checker = this.getChecker();
        return checker.getIndexInfoOfType(type, IndexKind.String) !== undefined ||
            checker.getPropertyOfType(type, key) !== undefined;
    }

    // any assignment to the receiver (or to a same-named binding) in the function makes the
    // object the read evaluates unprovable, so the read falls back to the helper
    csharpReceiverIsRewritten(func, expression): boolean {
        const text = expression.getText();
        const name = isIdentifier(expression) ? text : text.split(/[.[]/)[1];
        if (name === undefined) {
            return true;
        }
        let rewritten = false;
        const walk = (n: any) => {
            if (rewritten) {
                return;
            }
            if (isIdentifier(n) && n.text === name) {
                const parent: any = n.parent;
                if (isBinaryExpression(parent) && parent.left === n) {
                    rewritten = true;
                } else if ((isPrefixUnaryExpression(parent) || isPostfixUnaryExpression(parent)) && parent.operand === n) {
                    rewritten = true;
                } else if (isDeleteExpression(parent)) {
                    rewritten = true;
                }
            }
            n.forEachChild(walk);
        };
        walk(func);
        return rewritten;
    }

    // ===== ws handler `message` parameter (batch D, D-19) =====
    // A ws handler `handleX (client: Client, message: Dict)` is reached at runtime either
    // through a dispatch-table entry (`{ "k", this.handleX }` -> DynamicInvoker) or a direct
    csharpHandlerMessageType(param): string | undefined {
        if (this.csharpHandlerMessageTypes.has(param)) {
            return this.csharpHandlerMessageTypes.get(param);
        }
        let result: string | undefined = undefined;
        const method: any = param?.parent;
        if (isMethodDeclaration(method) && (method.parameters.length >= 2) && (method.parameters[1] === param)) {
            if ((this.csharpCheckerTypeName(method.parameters[0]) === 'Client') &&
                (this.csharpCheckerTypeName(param) === 'Dict') &&
                (this.getMethodOverride(method) === undefined) &&
                !this.csharpReceiverIsRewritten(method, param.name) &&
                !this.csharpHandlerIsCalled(method) &&
                !this.csharpClassHasListRoute(method)) {
                result = this.ArgTypeReplacements['Dict'] ?? 'Dictionary<string, object>';
            }
        }
        this.csharpHandlerMessageTypes.set(param, result);
        return result;
    }

    // the type name the checker prints for a node's type, or undefined in an in-memory
    // program (no checker answer: the printer keeps its own)
    csharpCheckerTypeName(node): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        try {
            const checker = this.getChecker();
            const type = checker.getTypeAtLocation(node);
            return (type === undefined) ? undefined : checker.typeToString(type);
        } catch (e) {
            return undefined;
        }
    }

    csharpEnclosingClass(node): any | undefined {
        let current: any = node?.parent;
        while (current !== undefined) {
            if (isClassDeclaration(current) || isClassExpression(current)) {
                return current;
            }
            current = current.parent;
        }
        return undefined;
    }

    // the identifier is the raw `message` parameter of a handler-shaped method (a `Client`
    // first parameter, so `handleMessage` with its `any` annotation included): the class can
    // route that same value through its list arm
    csharpIsHandlerMessageIdentifier(node): boolean {
        if (!isIdentifier(node)) {
            return false;
        }
        try {
            const declaration: any = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
            if ((declaration === undefined) || !isParameterDeclaration(declaration)) {
                return false;
            }
            const owner: any = declaration.parent;
            return isMethodDeclaration(owner) && (owner.parameters.length >= 2) &&
                (owner.parameters[1] === declaration) && (this.csharpCheckerTypeName(owner.parameters[0]) === 'Client');
        } catch (e) {
            return false;
        }
    }

    // a class that tests the message (or another dict parameter) for a list can hand the
    // array itself to a dispatch-table entry (binance `'x@arr'`), so its handlers keep the
    // box; a class testing unrelated lists (an array-typed `symbols` parameter, a field of
    csharpClassHasListRoute(method): boolean {
        const cls = this.csharpEnclosingClass(method);
        if (cls === undefined) {
            return true; // no class, no proof
        }
        const cached = this.csharpListRouteClasses.get(cls);
        if (cached !== undefined) {
            return cached;
        }
        let found = false;
        const walk = (n: any) => {
            if (found) {
                return;
            }
            if (isCallExpression(n) && isPropertyAccessExpression(n.expression) &&
                ((n.expression as any).expression?.text === 'Array') && ((n.expression as any).name?.text === 'isArray')) {
                const argument: any = n.arguments[0];
                if (this.csharpIsHandlerMessageIdentifier(argument)) {
                    found = true;
                    return;
                }
            }
            n.forEachChild(walk);
        };
        walk(cls);
        this.csharpListRouteClasses.set(cls, found);
        return found;
    }

    // a static call reference (`this.handleX (…)`) binds the argument to the printed
    // signature; a method-group value (a dispatch-table entry) does not
    csharpHandlerIsCalled(method): boolean {
        const cached = this.csharpHandlerCalled.get(method);
        if (cached !== undefined) {
            return cached;
        }
        let called = true; // no symbol answer: keep the box
        const cls = this.csharpEnclosingClass(method);
        let file: any;
        try {
            file = method.getSourceFile();
        } catch (e) {
            file = undefined;
        }
        if ((cls !== undefined) && (file !== undefined)) {
            try {
                const symbol = this.getChecker().getSymbolAtLocation(method.name);
                if (symbol !== undefined) {
                    called = this.csharpHandlerCallIndexFor(file).get(symbol) === true;
                }
            } catch (e) {
                called = true;
            }
        }
        this.csharpHandlerCalled.set(method, called);
        return called;
    }

    // every identifier of the FILE that resolves to one of its classes' own method names,
    // recorded as a call when it is the callee of a call expression; keyed by symbol, so a
    // same-named method of another class never marks this one
    csharpHandlerCallIndexFor(file): Map<Symbol, boolean> {
        const cached = this.csharpHandlerCallIndex.get(file);
        if (cached !== undefined) {
            return cached;
        }
        const names = new Set<string>();
        const collect = (n: any) => {
            if (isClassDeclaration(n) || isClassExpression(n)) {
                for (const member of n.members) {
                    const name: any = (member as any).name?.text;
                    if (isMethodDeclaration(member) && (name !== undefined)) {
                        names.add(name);
                    }
                }
            }
            n.forEachChild(collect);
        };
        collect(file);
        const index = new Map<Symbol, boolean>();
        if (names.size > 0) {
            let checker;
            try {
                checker = this.getChecker();
            } catch (e) {
                checker = undefined;
            }
            if (checker !== undefined) {
                const walk = (n: any) => {
                    if (isIdentifier(n) && names.has(n.text as string)) {
                        let symbol;
                        try {
                            symbol = checker.getSymbolAtLocation(n);
                        } catch (e) {
                            symbol = undefined;
                        }
                        if (symbol !== undefined) {
                            const parent: any = n.parent;
                            const isCall = (isPropertyAccessExpression(parent) && (parent.name === n) &&
                                isCallExpression(parent.parent) && (parent.parent.expression === parent)) ||
                                (isCallExpression(parent) && (parent.expression === n));
                            if (isCall) {
                                index.set(symbol, true);
                            } else if (index.get(symbol) === undefined) {
                                index.set(symbol, false);
                            }
                        }
                    }
                    n.forEachChild(walk);
                };
                walk(file);
            }
        }
        this.csharpHandlerCallIndex.set(file, index);
        return index;
    }

    csharpHasKeyRemoval(func, expression, key): boolean {
        const text = expression.getText();
        let removed = false;
        const walk = (n: any) => {
            if (removed) {
                return;
            }
            if (isDeleteExpression(n) && isElementAccessExpression(n.expression) &&
                n.expression.expression.getText() === text && n.expression.argumentExpression.getText().replace(/['"]/g, '') === key.replace(/['"]/g, '')) {
                removed = true;
            }
            n.forEachChild(walk);
        };
        walk(func);
        return removed;
    }

    csharpGuardIsNegated(guard): boolean {
        let node: any = guard;
        while (node.parent !== undefined && isParenthesizedExpression(node.parent)) {
            node = node.parent;
        }
        return node.parent !== undefined && isPrefixUnaryExpression(node.parent) &&
            node.parent.operator === SyntaxKind.ExclamationToken;
    }

    csharpAlwaysExits(statement): boolean {
        if (statement === undefined) {
            return false;
        }
        const exits = (n: any) => isReturnStatement(n) || isThrowStatement(n) || isContinueStatement(n) || isBreakStatement(n);
        if (exits(statement)) {
            return true;
        }
        if (isBlock(statement) && statement.statements.length > 0) {
            return exits(statement.statements[statement.statements.length - 1]);
        }
        return false;
    }

    csharpContains(outer, inner): boolean {
        if (outer === undefined || inner === undefined) {
            return false;
        }
        return inner.getStart() >= outer.getStart() && inner.getEnd() <= outer.getEnd();
    }
    // cs-strict S14: `((List<object>)x)[i] = v` needs no cast when the PRINTED declaration is
    // `List<object>` (identity conversion; not IList<object>, a checked downcast). Type comes via the
    // `csharpLocalTypeOf` hook; `x[i] += v` and reads stay on the base path (third override layer).
    csharpElementAccessReceiverIsList(node) {
        if (node?.kind !== SyntaxKind.ElementAccessExpression) {
            return false;
        }
        const parent = node.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression || parent.operatorToken?.kind !== SyntaxKind.EqualsToken || parent.left !== node) {
            return false;
        }
        const receiver = node.expression;
        if (receiver?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const localTypeOf = (this as any).csharpLocalTypeOf;
        return (typeof localTypeOf === 'function') && (localTypeOf.call(this, receiver) === 'List<object>');
    }

    // The C# declared type pair of a list index READ (`x[i]`): receiver (`List<object>` /
    // `IList<object>`) and index (`int`). Consumer-installed (build/csharp-local-types.js);
    // undefined by default, so an unpatched printer keeps `getValue (x, i)` for every read.
    csharpListIndexReadTypes(node): { receiver: string, index: string } | undefined {
        return undefined; // stub to override
    }

    // `x[i]` read on a list receiver: the helper answers null off the end while the C# indexer throws,
    // so the native read is only emitted where the source proves the index in range. Types come from
    // the consumer hook above, so the untyped emission is byte-identical.
    csharpListIndexRead(node): string | undefined {
        if (node?.kind !== SyntaxKind.ElementAccessExpression) {
            return undefined;
        }
        const { expression, argumentExpression } = node;
        if (expression?.kind !== SyntaxKind.Identifier || argumentExpression?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const parent: any = node.parent;
        const isWrite = parent?.kind === SyntaxKind.BinaryExpression
            && (parent.operatorToken.kind === SyntaxKind.EqualsToken || parent.operatorToken.kind === SyntaxKind.PlusEqualsToken)
            && parent.left === node;
        if (isWrite) {
            return undefined; // element writes print through the cast path
        }
        const types = (typeof this.csharpListIndexReadTypes === 'function') ? this.csharpListIndexReadTypes(node) : undefined;
        if (types?.index !== 'int') {
            return undefined; // only an int index binds the List<object> indexer
        }
        if ((types.receiver !== 'List<object>') && (types.receiver !== 'IList<object>')) {
            return undefined;
        }
        if (!this.csharpIndexIsLoopBounded(node, expression, argumentExpression)) {
            return undefined;
        }
        return this.printNode(expression, 0) + '[' + this.printNode(argumentExpression, 0) + ']';
    }

    // the read sits in the body of a `for` that re-tests `index < receiver.length`, both
    // resolved to the very symbols the read uses, and nothing in the body can move either
    csharpIndexIsLoopBounded(read, receiver, index): boolean {
        const receiverSymbol = this.csharpIdentifierSymbol(receiver);
        const indexSymbol = this.csharpIdentifierSymbol(index);
        if (receiverSymbol === undefined || indexSymbol === undefined) {
            return false;
        }
        let node: any = read;
        while (node?.parent !== undefined) {
            const parent: any = node.parent;
            if (isFunctionLike(parent)) {
                return false; // a read under a nested function is not dominated by the condition
            }
            if (isForStatement(parent) && this.csharpForBoundsIndex(parent, read, receiverSymbol, indexSymbol)) {
                return true;
            }
            node = parent;
        }
        return false;
    }

    csharpIdentifierSymbol(node): any {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        return this.checkerOrUndefined()?.getSymbolAtLocation(node);
    }

    csharpForBoundsIndex(forStatement, read, receiverSymbol, indexSymbol): boolean {
        if (!this.csharpContains(forStatement.statement, read)) {
            return false; // the read is in the loop header, not the body
        }
        const condition: any = forStatement.condition;
        if (condition?.kind !== SyntaxKind.BinaryExpression || condition.operatorToken?.kind !== SyntaxKind.LessThanToken) {
            return false;
        }
        const length: any = condition.right;
        if (length?.kind !== SyntaxKind.PropertyAccessExpression || length.name?.text !== 'length') {
            return false;
        }
        if (this.csharpIdentifierSymbol(condition.left) !== indexSymbol) {
            return false;
        }
        if (this.csharpIdentifierSymbol(this.csharpLengthReceiverIdentifier(length.expression)) !== receiverSymbol) {
            return false;
        }
        return !this.csharpIndexBoundIsVoided(forStatement.statement, receiverSymbol, indexSymbol);
    }

    // The identifier a `.length` receiver reads through wrappers whose C# print is the bare text:
    // parentheses, and `as T` where printAsExpression does not cast (`any`/`string`/`T[]` print a cast,
    // so the bound would not be the receiver's Count). `(response as List).length` -> `?.Count ?? 0`
    csharpLengthReceiverIdentifier(node): any {
        let current: any = node;
        while (current !== undefined) {
            if (current.kind === SyntaxKind.ParenthesizedExpression) {
                current = current.expression;
                continue;
            }
            if (current.kind === SyntaxKind.AsExpression && current.type !== undefined
                && current.type.kind !== SyntaxKind.AnyKeyword
                && current.type.kind !== SyntaxKind.StringKeyword
                && current.type.kind !== SyntaxKind.ArrayType) {
                current = current.expression;
                continue;
            }
            break;
        }
        return current;
    }

    // the condition ran before the body did: a write to the index, or any use of the receiver
    // other than an element access / a property read (a method call, an argument, a bare read —
    // anything that could hand the list to something that shrinks it) voids the bound
    csharpIndexBoundIsVoided(body, receiverSymbol, indexSymbol): boolean {
        let voided = false;
        const visit = (n: any) => {
            if (voided || n === undefined) {
                return;
            }
            if (n.kind === SyntaxKind.Identifier) {
                const symbol = this.csharpIdentifierSymbol(n);
                if (symbol === indexSymbol && this.csharpIdentifierIsWritten(n)) {
                    voided = true;
                    return;
                }
                if (symbol === receiverSymbol && !this.csharpReceiverUseKeepsBound(n)) {
                    voided = true;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return voided;
    }

    // a use that cannot move the value the condition tested: the expression of an element
    // access (`recv[i]`, a read or an element write — neither changes the length) or of a
    // property READ (`recv.Count`); a property write or a call on the receiver is not one
    csharpReceiverUseKeepsBound(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.ElementAccessExpression && parent.expression === node) {
            return true;
        }
        if (parent.kind === SyntaxKind.PropertyAccessExpression && parent.expression === node) {
            if (this.csharpIdentifierIsWritten(node)) {
                return false; // `recv.length = n`
            }
            const grand: any = parent.parent;
            return !(grand?.kind === SyntaxKind.CallExpression && grand.expression === parent);
        }
        return false;
    }

    // the identifier is a write target: `x = v`, `x += v`, `x++` / `x--`, a destructuring
    // element, or a property/element write through it (`x.length = 0`)
    csharpIdentifierIsWritten(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.BinaryExpression && parent.left === node && this.csharpIsAssignmentOperator(parent.operatorToken.kind)) {
            return true;
        }
        if ((parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression)
            && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)) {
            return true;
        }
        if (parent.kind === SyntaxKind.ArrayLiteralExpression || parent.kind === SyntaxKind.PropertyAccessExpression) {
            const grand: any = parent.parent;
            return grand?.kind === SyntaxKind.BinaryExpression && grand.left === parent && this.csharpIsAssignmentOperator(grand.operatorToken.kind);
        }
        return false;
    }

    csharpIsAssignmentOperator(kind): boolean {
        return (kind >= SyntaxKind.FirstAssignment) && (kind <= SyntaxKind.LastAssignment);
    }

    // S22: an index WRITE (`x["k"] = v`) needs no `((IDictionary<string,object>)x)` cast when the
    // receiver's printed C# declaration already IS a dictionary. The ccxt classifier
    // (build/csharp-local-types.js) installs this predicate; undefined/false keeps the upstream cast.
    csharpDictionaryIndexWriteNeedsNoCast(node): boolean | undefined {
        return undefined;
    }
    // the consumer's classifier may prove the declared C# type of an element-access receiver
    // (`Dictionary<string, object>` / `IDictionary<string, object>`); consumer-installed, so an
    // answer of undefined keeps the untyped emission byte-identical
    csharpElementAccessTypedReceiver(node): string | undefined {
        return undefined;
    }

    // `recv[key]` read with a consumer-proven string-keyed dict receiver and a literal key: the typed
    // twin GetValue(IDictionary<string, object>, string) runs the same dictionary read as the object
    // overload's dict branch without its runtime sniffing. Every other read keeps the wrapper.
    printTypedDictElementAccessIfAny(node) {
        if (this.csharpElementAccessTypedReceiver(node) === undefined) {
            return undefined;
        }
        const { expression, argumentExpression } = node;
        if (!isStringLiteralLikeNode(argumentExpression)) {
            return undefined; // the twin's key parameter is `string`; any other key keeps the object overload
        }
        const parent = node.parent;
        const isLeftSideOfAssignment = parent?.kind === SyntaxKind.BinaryExpression
            && (parent.operatorToken.kind === SyntaxKind.EqualsToken || parent.operatorToken.kind === SyntaxKind.PlusEqualsToken)
            && parent.left === node;
        if (isLeftSideOfAssignment) {
            return undefined; // a write prints the dictionary element assignment, not this read
        }
        return 'GetValue(' + this.printNode(expression, 0) + ', ' + this.printNode(argumentExpression, 0) + ')';
    }

    printWrappedUnknownThisProperty(node) {
        const type = this.getChecker().getResolvedSignature(node);
        if (type?.declaration === undefined) {
            let parsedArguments = node.arguments?.map((a) => this.printNode(a, 0)).join(", ");
            parsedArguments = parsedArguments ? parsedArguments : "";
            const propName = node.expression?.name.text;
            const nativeDelegateCall = this.csharpNativeDelegateCall(node, propName);
            if (nativeDelegateCall !== undefined) {
                return nativeDelegateCall;
            }
            // const isAsyncDecl = true;
            const isAsyncDecl = node?.parent?.kind === SyntaxKind.AwaitExpression;
            // const open = isAsyncDecl ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
            // const close = this.UNKOWN_PROP_WRAPPER_CLOSE;
            // return `${open}"${propName}"${parsedArguments}${close}`;
            const argsArray = `new object[] { ${parsedArguments} }`;
            const open = this.DYNAMIC_CALL_OPEN;
            let statement = `${open}this, "${propName}", ${argsArray})`;
            statement = isAsyncDecl ? `((Task<object>)${statement})` : statement;
            return statement;
        }
        return undefined;
    }

    // A `this.<name>(...)` call the checker cannot resolve on a function-valued property is a
    // delegate in the hand-written C# base, which `ResolveMethod` never finds (the helper throws
    // there); matching arity prints the same property invocation directly.
    csharpNativeDelegateCall(node, propName): string | undefined {
        const arity = CSHARP_NATIVE_THIS_DELEGATE_ARITY[propName as string];
        if (arity === undefined) {
            return undefined;
        }
        if (node?.parent?.kind === SyntaxKind.AwaitExpression) {
            return undefined; // the delegate returns object, not a Task
        }
        const args = node.arguments ?? [];
        if (args.length !== arity) {
            return undefined;
        }
        return `this.${propName as string}(${args.map((a) => this.printNode(a, 0)).join(", ")})`;
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind === SyntaxKind.PropertyAccessExpression) {
            const expressionText = node.expression.getText().trim();
            const args = node.arguments;
            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                switch (expressionText) {
                // case "JSON.parse":
                //     return `json_decode(${parsedArg}, $as_associative_array = true)`;
                case "Math.abs":
                    return `Math.Abs(Convert.ToDouble(${parsedArg}))`;
                }
            } else if (args.length === 2)
            {
                const parsedArg1 = this.printNode(args[0], 0);
                const parsedArg2 = this.printNode(args[1], 0);
                switch (expressionText) {
                case "Math.min":
                    return this.csharpNativeMathMinMax(node, 'Min', parsedArg1, parsedArg2) ?? `mathMin(${parsedArg1}, ${parsedArg2})`;
                case "Math.max":
                    return this.csharpNativeMathMinMax(node, 'Max', parsedArg1, parsedArg2) ?? `mathMax(${parsedArg1}, ${parsedArg2})`;
                case "Math.pow":
                    return `Math.Pow(Convert.ToDouble(${parsedArg1}), Convert.ToDouble(${parsedArg2}))`;
                }
            }
            const leftSide = node.expression?.expression;
            const leftSideText = leftSide ? this.printNode(leftSide, 0) : undefined;

            // wrap unknown property this.X calls
            if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) { // double check this
                const res = this.printWrappedUnknownThisProperty(node);
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

    handleTypeOfInsideBinaryExpression(node, identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        switch (right) {
        case "string":
            return notOperator + `(${target} is string)`;
        case "number":
            return notOperator + `(${target} is Int64 || ${target} is int || ${target} is float || ${target} is double)`;
        case "boolean":
            return notOperator + `(${target} is bool)`;
        case "object":
            return notOperator + `(${target} is IDictionary<string, object>)`;
        case "function":
            return notOperator + `(${target} is Delegate)`;
        }

        return undefined;

    }

    // The C# type of an operand of `==` / `!=` as the printer emits it, or undefined when
    // the printer only knows `object`: an `object` operand takes the reference-comparing
    // `operator ==`, so those keep the isEqual helper.
    csharpEqualityOperandType(node): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        switch (node.kind) {
        case SyntaxKind.NullKeyword:
            return 'null';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return 'bool';
        case SyntaxKind.NumericLiteral:
            return this.csharpNumericLiteralKind(node);
        case SyntaxKind.ParenthesizedExpression:
            return this.csharpEqualityOperandType(node.expression);
        case SyntaxKind.Identifier:
            // printIdentifier prints the `undefined` identifier as null
            if (node.text === 'undefined') {
                return 'null';
            }
            return this.csharpDeclaredTypeOfBinding(node) ?? this.csharpParameterOperandType(node);
        case SyntaxKind.PropertyAccessExpression: {
            const fieldType = this.csharpReferenceFieldType(node);
            return (fieldType === undefined) ? this.csharpTypeOfInitializer(node) : fieldType;
        }
        }
        if (isStringLiteralLikeNode(node)) {
            return 'string';
        }
        return this.csharpTypeOfInitializer(node);
    }

    // 'object' for a `this.<field>` read of a hand-written field the table proves a reference box;
    // undefined otherwise. Only printInlineEquality's null branch accepts 'object', so the exact
    // field type is never claimed and the value-equality branches keep the helper.
    csharpReferenceFieldType(node): string | undefined {
        if (!isPropertyAccessExpression(node) || (node.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = node.name?.text as string;
        if (CSHARP_REFERENCE_FIELDS_NATIVE.indexOf(name) < 0) {
            return undefined;
        }
        return this.csharpOperandIsValueTyped(node) ? undefined : 'object';
    }

    // the declaration behind an identifier read that is a plain method parameter; a
    // destructured or rest parameter prints a different declaration shape
    csharpParameterDeclaration(node): ParameterDeclaration | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration;
        if ((declaration === undefined) || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        if (!isIdentifier(declaration.name) || (declaration.name.text !== node.text) || (declaration.dotDotDotToken !== undefined)) {
            return undefined;
        }
        return declaration;
    }

    // `object` for a parameter operand a null comparison compiles on, else undefined. An optional
    // parameter prints `object` / `string` / `Int64?` / `double?` / `bool?`; any other keeps the
    // helper unless its checker type holds no number/boolean member (a reference box).
    csharpParameterOperandType(node): string | undefined {
        const declaration = this.csharpParameterDeclaration(node);
        if (declaration === undefined) {
            return undefined;
        }
        if (this.csharpDeclarationPrintsNullComparable(declaration)) {
            return 'object'; // reference box or nullable value: only the null branch may use it
        }
        return this.csharpOperandIsValueTyped(node) ? undefined : 'object';
    }

    // Whether this parameter's printed C# type is a reference or nullable value, so `x == null`
    // compiles and is isEqual's null branch. optionalScalarCsharpType gives a nullable scalar only
    // when optional with no initializer or `= undefined`; required or real-default ones are non-null.
    csharpDeclarationPrintsNullComparable(declaration): boolean {
        const initializer = declaration.initializer;
        const optional = (declaration.questionToken !== undefined) || (initializer !== undefined);
        if (optional && ((initializer === undefined) || ((initializer.kind === SyntaxKind.Identifier) && (initializer.text === 'undefined')))) {
            return true;
        }
        return !this.csharpDeclarationHasValueScalar(declaration);
    }

    csharpDeclarationHasValueScalar(declaration): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return true; // unknown: keep the helper
        }
        const type = checker.getTypeAtLocation(declaration);
        return this.csharpTypeHasValueScalar(type);
    }

    // A numeric literal prints as an untyped C# constant that adapts to the operand on the
    // other side. isEqual's integer branches round-trip through Convert.ToInt64, which an
    // integer literal beyond 2^53 does not survive, so those stay on the helper.
    csharpNumericLiteralKind(node): string | undefined {
        const value = Number(node.text);
        if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
            return undefined;
        }
        return 'number';
    }

    // the C# type the declaration behind an identifier was printed with ('object' when the
    // printer named none), or undefined when the identifier is not a printed local
    csharpDeclaredTypeOfBinding(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration;
        if (declaration === undefined) {
            return undefined;
        }
        if (declaration.kind === SyntaxKind.VariableDeclaration) {
            return this.getCSharpLocalType(declaration);
        }
        if (declaration.kind === SyntaxKind.BindingElement) {
            return 'var'; // `const [a, b] = ...` prints `var a = ((IList<object>)...)[0]`
        }
        return undefined; // parameters are retyped after printing by the build script
    }

    // the C# operator family an operand belongs to: `==` compares two operands of one family
    // by value, exactly like the isEqual branches those types take
    csharpValueEqualityKind(csharpType): string | undefined {
        switch (csharpType) {
        case 'string':
        case 'string?':
            return 'string';
        case 'bool':
        case 'bool?':
            return 'bool';
        case 'double':
        case 'double?':
            return 'double';
        case 'Int64':
        case 'long':
        case 'Int64?':
        case 'long?':
            return 'Int64';
        case 'int':
        case 'int?':
            return 'int';
        case 'number':
            return 'number'; // numeric literal, adapts to the numeric operand it is compared with
        }
        return undefined;
    }

    // `x == null` compiles — and matches isEqual — for reference types and nullable value
    // types, but not for a non-nullable value type (double / bool / Int64 / int). Lists,
    // dictionaries, class instances and `var` are references, and are the only types left
    // once csharpValueEqualityKind has claimed the value-typed names above.
    csharpIsNullComparableType(csharpType): boolean {
        if ((csharpType === undefined) || (csharpType === '') || (csharpType === 'null')) {
            return false;
        }
        if (csharpType.endsWith('?')) {
            return true;
        }
        if ((csharpType === 'object') || (csharpType === 'string')) {
            return true;
        }
        return (this.csharpValueEqualityKind(csharpType) === undefined);
    }

    // `x == null` compiles and matches isEqual's null branch when x's printed type is a
    // reference box or a nullable value type: the operand table's declared types, an optional
    // parameter, or a box the checker proves holds no number/boolean scalar.
    csharpOperandIsNullComparable(node): boolean {
        const declaration = this.csharpParameterDeclaration(node);
        if ((declaration !== undefined) && this.csharpDeclarationPrintsNullComparable(declaration)) {
            return true;
        }
        return !this.csharpOperandIsValueTyped(node);
    }

    // U55: the null-comparison rule's gate, stricter than csharpIsNullComparableType above:
    // only a type the hook names (the emitted declaration's own text) is accepted, `object` /
    // `var` included in the refusal because those are the boxes the classifier did not name.
    csharpNullComparisonTypeIsProvable(csharpType): boolean {
        if ((csharpType === undefined) || (csharpType === '') || (csharpType === 'object') || (csharpType === 'var') || (csharpType === 'null')) {
            return false;
        }
        if (csharpType.endsWith('?')) {
            return true;
        }
        return CSHARP_NULL_COMPARISON_REFERENCE_HEADS.some((head) => csharpType.startsWith(head));
    }

    // TypeScript numbers and booleans are C# value types in this port (double / bool /
    // Int64 / int), and the ccxt build script retypes some `object` declarations to exactly
    // those from its own tables (precisionFromString -> int, milliseconds -> Int64,
    // isEmpty -> bool). A null comparison against one of them would not compile, and the
    // printer's `object` cannot rule it out, so these always keep the helper.
    csharpOperandIsValueTyped(node): boolean {
        if (node === undefined) {
            return true;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return true;
        }
        const type = checker.getTypeAtLocation(node);
        return this.csharpTypeHasValueScalar(type);
    }

    csharpTypeHasValueScalar(type): boolean {
        if (type === undefined) {
            return true;
        }
        const flags = type.flags;
        if (flags & TypeFlags.Union) {
            const members = type.types ?? [];
            return members.some((member) => this.csharpTypeHasValueScalar(member));
        }
        return (flags & (TypeFlags.Number | TypeFlags.NumberLiteral | TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0;
    }

    // `x == "lit"` / `x != "lit"` prints natively when x is a read of a local whose printed
    // declaration is a C# string: the printer's declared-local table, then the embedding build
    // layer's proof for the declarations it retypes itself (ccxt's csharp-local-types.js).
    csharpDeclaredStringLiteralComparison(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        const ident = isIdentifier(left) ? left : (isIdentifier(right) ? right : undefined);
        if ((ident === undefined) || !isStringLiteralLikeNode((ident === left) ? right : left)) {
            return undefined;
        }
        const declared = this.csharpDeclaredReadType(ident);
        if ((declared === undefined) || !this.csharpTypeIsStringType(declared)) {
            return undefined;
        }
        return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }

    // the C# type the declaration behind a local read was printed with, or undefined: the
    // printer's own declared-local table first, then the embedding build layer's answer for a
    // declaration it retyped after the printer had left it `object`
    csharpDeclaredReadType(node): string | undefined {
        let named;
        try {
            named = this.csharpTypedLocalType(node);
        } catch (e) {
            named = undefined;
        }
        if (named !== undefined) {
            return named;
        }
        const resolver = this.csharpExpressionTypeResolver;
        if (typeof resolver !== 'function') {
            return undefined;
        }
        let resolved;
        try {
            resolved = resolver(node);
        } catch (e) {
            return undefined;
        }
        return (typeof resolved === 'string') ? resolved : undefined;
    }

    // the declared type of an identifier read, including this printer's own local table
    csharpDeclaredLocalType(node): string | undefined {
        const provided = this.csharpExpressionTypeResolver ? this.csharpExpressionTypeResolver(node) : undefined;
        if (provided !== undefined) {
            return provided;
        }
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (!this.csharpLocalTypes.has(declaration)) {
            this.csharpLocalTypes.set(declaration, this.getCSharpLocalType(declaration));
        }
        const type = this.csharpLocalTypes.get(declaration);
        return (type === undefined || type === this.VAR_TOKEN) ? undefined : type;
    }

    // `a === b` / `a !== b` between two plain reads: a local or parameter prints as a bare
    // name and both operands are read once by the printed expression
    csharpOperandsAreDeclaredReads(left, right): boolean {
        const isRead = (node) => (node?.kind === SyntaxKind.Identifier) && (node.text !== 'undefined');
        return isRead(left) && isRead(right);
    }

    // the C# type the embedding build layer declares for a read the printer can only call
    // `object`: that layer retypes the declaration so its recorded type IS the printed one
    csharpDeclaredReadEqualityType(node, printerType: string | undefined): string | undefined {
        if ((printerType !== undefined) && (printerType !== this.VAR_TOKEN) && (printerType !== 'var')) {
            return printerType;
        }
        const resolver = this.csharpExpressionTypeResolver;
        if (typeof resolver !== 'function') {
            return printerType;
        }
        let resolved;
        try {
            resolved = resolver(node);
        } catch (e) {
            return printerType;
        }
        return (typeof resolved === 'string') ? resolved : printerType;
    }

    // `==` / `!=` in place of the isEqual wrapper when both operands are C# values of one
    // family, or one side is null/undefined against a type `== null` compiles for. Both
    // operands are printed once, so neither is evaluated twice.
    printInlineEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        const stringComparison = this.csharpDeclaredStringLiteralComparison(left, right, leftText, rightText, isEquality);
        if (stringComparison !== undefined) {
            return stringComparison;
        }
        let leftType = this.csharpEqualityOperandType(left);
        let rightType = this.csharpEqualityOperandType(right);
        if (this.csharpOperandsAreDeclaredReads(left, right)) {
            leftType = this.csharpDeclaredReadEqualityType(left, leftType);
            rightType = this.csharpDeclaredReadEqualityType(right, rightType);
        }
        // D-21: an operand the printer could not name (or only named `object`) is not a
        // rejection by itself -- the value branch below re-reads its DECLARED scalar type
        if (leftType === 'null') {
            if (!this.csharpIsNullComparableType(rightType) || !this.csharpOperandIsNullComparable(right)) {
                return undefined;
            }
            return this.csharpNullComparison(rightText, isEquality);
        }
        if (rightType === 'null') {
            if (!this.csharpIsNullComparableType(leftType) || !this.csharpOperandIsNullComparable(left)) {
                return undefined;
            }
            return this.csharpNullComparison(leftText, isEquality);
        }
        // D-21: a read the printer's own tables could only call `object` still has the C# type
        // its emitted DECLARATION carries -- a parameter the build layer's typing pass narrowed,
        // a local retyped to the type of a typed return. The declared-read arm below names it.
        const leftKind = this.csharpValueEqualityKind(leftType);
        const rightKind = this.csharpValueEqualityKind(rightType);
        const leftReadKind = (leftKind !== undefined) ? leftKind : this.csharpDeclaredReadEqualityKind(left, leftType);
        const rightReadKind = (rightKind !== undefined) ? rightKind : this.csharpDeclaredReadEqualityKind(right, rightType);
        if ((leftReadKind === undefined) || (rightReadKind === undefined)) {
            return undefined;
        }
        // mixed numeric kinds are not equal in isEqual: `int` vs `double` takes the
        // `(int)a == (int)b` branch and throws on the boxed double, so only a numeric
        // literal may meet a different numeric type
        const numericKinds = [ 'double', 'Int64', 'int' ];
        const sameKind = (leftReadKind === rightReadKind);
        const literalVsNumeric = ((leftReadKind === 'number') && (numericKinds.indexOf(rightReadKind) >= 0))
            || ((rightReadKind === 'number') && (numericKinds.indexOf(leftReadKind) >= 0));
        if (!sameKind && !literalVsNumeric) {
            return undefined;
        }
        return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }

    // the value kind of an operand the printer could only call `object`: the type the read's
    // declaration was PRINTED with (printer table -> build layer's read-type oracle -> the
    // declared-type registry for the declarations its own passes retyped). A collection/class
    csharpDeclaredReadEqualityKind(node, operandType: string | undefined): string | undefined {
        if ((operandType !== undefined) && (operandType !== '') && (operandType !== 'object')) {
            return undefined; // the printer named a non-value C# type: never a value comparison
        }
        if ((node?.kind !== SyntaxKind.Identifier) || (node.text === 'undefined')) {
            return undefined; // parameters of a written body / accesses / calls are other units
        }
        const declared = this.csharpDeclaredReadType(node) ?? this.csharpDeclaredLocalResolverType(node);
        return (declared === undefined) ? undefined : this.csharpValueEqualityKind(declared);
    }

    csharpNullComparison(text: string, isEquality: boolean) {
        return isEquality ? `(${text} == null)` : `(${text} != null)`;
    }

    // `isEqual(<numeric call>, N)` / `isEqual(N, <numeric call>)` -> `==` / `!=`: the call prints a
    // concrete numeric kind, the literal adapts to it, and the operator matches isEqual's integer and
    // double branches. String/bool/collection calls and every `object` box keep the helper.
    csharpNativeNumericCallEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        const leftKind = this.csharpNumericCallKind(left);
        const rightKind = this.csharpNumericCallKind(right);
        const leftLiteral = (leftKind === undefined) ? this.csharpIntegerLiteralKind(left) : undefined;
        const rightLiteral = (rightKind === undefined) ? this.csharpIntegerLiteralKind(right) : undefined;
        const callOnLeft = (leftKind !== undefined) && (rightLiteral !== undefined) && this.csharpNumericKindHoldsLiteral(leftKind, rightLiteral);
        const callOnRight = (rightKind !== undefined) && (leftLiteral !== undefined) && this.csharpNumericKindHoldsLiteral(rightKind, leftLiteral);
        if (!callOnLeft && !callOnRight) {
            return undefined;
        }
        // both operands are printed once: the call is not duplicated
        return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }

    // The C# value kind of a call operand (or `x.length`) when its printed signature is numeric:
    // `.indexOf`/`.length` (int) and safe* accessors from the printer's tables, `this.<name>()` from
    // CSHARP_NATIVE_NUMERIC_THIS_KINDS. undefined keeps the helper (an `object` box has no kind).
    csharpNumericCallKind(node): string | undefined {
        const expression = node?.expression;
        if ((node?.kind === SyntaxKind.CallExpression)
            && (expression?.kind === SyntaxKind.PropertyAccessExpression)
            && (expression.expression?.kind === SyntaxKind.ThisKeyword)) {
            const named = CSHARP_NATIVE_NUMERIC_THIS_KINDS[expression.name?.text as string];
            // an unresolvable callee prints callDynamically(this, ...), which returns object
            if ((named !== undefined) && this.csharpCalleeResolves(node)) {
                return named;
            }
        }
        const named = this.csharpCallReturnType(node);
        return ((named === undefined) || (CSHARP_NUMERIC_VALUE_KINDS.indexOf(named) < 0)) ? undefined : named;
    }

    // The C# kind of an integer literal operand (`N` / `-N`), or undefined when the text is not an
    // integer the literal holds exactly. isEqual round-trips through Convert.ToInt64 and truncates
    // via `(int)a == (int)b`, so only a safe integer literal keeps both comparisons identical.
    csharpIntegerLiteralKind(node): string | undefined {
        let value;
        if (node?.kind === SyntaxKind.PrefixUnaryExpression) {
            if ((node.operator !== SyntaxKind.MinusToken) || (node.operand?.kind !== SyntaxKind.NumericLiteral)) {
                return undefined;
            }
            value = -Number(node.operand.text);
        } else if (node?.kind === SyntaxKind.NumericLiteral) {
            value = Number(node.text);
        } else {
            return undefined;
        }
        if (!Number.isSafeInteger(value)) {
            return undefined;
        }
        return ((value >= -2147483648) && (value <= 2147483647)) ? 'int' : 'long';
    }

    // a `long` literal has no implicit conversion to an `int` operand; every other pair
    // converts the literal exactly, which is what isEqual's Convert.ToInt64 /
    // Convert.ToDouble branches do with the same two boxes
    csharpNumericKindHoldsLiteral(callKind: string, literalKind: string): boolean {
        if (callKind === 'int') {
            return literalKind === 'int';
        }
        return (callKind.indexOf('Int64') === 0) || (callKind.indexOf('double') === 0);
    }

    // the concrete C# type of an expression the printer can name, or undefined: the embedding
    // build layer's proof wins (it retypes locals the printer leaves `object`), then the
    // printer's own tables and the literals whose C# type is fixed by their text
    csharpExpressionTypeOf(node): string | undefined {
        const provided = this.csharpExpressionTypeResolver ? this.csharpExpressionTypeResolver(node) : undefined;
        if (provided !== undefined) {
            return provided;
        }
        if (isNumericLiteral(node)) {
            const value = Number(node.text);
            // wider literals are typed uint/long/ulong by the C# compiler, keep the helper
            return (Number.isInteger(value) && Math.abs(value) <= 2147483647) ? 'int' : undefined;
        }
        if (isPrefixUnaryExpression(node) && (node.operator === SyntaxKind.MinusToken) && isNumericLiteral(node.operand)) {
            const value = Number(node.operand.text);
            return (Number.isInteger(value) && (value <= 2147483647)) ? 'int' : undefined;
        }
        return this.csharpTypeOfInitializer(node);
    }

    // the TypeScript checker must see two plain numbers: `any` (could be a string box) and a
    // nullable union (the helper orders null, C# would throw) both keep the runtime helper
    csharpOperandsAreNumbers(node): boolean {
        return this.csharpOperandIsPlainNumber(node.left) && this.csharpOperandIsPlainNumber(node.right);
    }

    csharpOperandIsPlainNumber(operand): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false; // in-memory program without a checker
        }
        const flags = checker.getTypeAtLocation(operand)?.flags;
        return (flags === TypeFlags.Number) || (flags === TypeFlags.NumberLiteral);
    }

    // `<`, `>`, `<=`, `>=` on two operands whose printed C# kind this printer can name (declaration,
    // literal, known call signature — never the JS type) print natively: the helper applies the same
    // conversions as the C# operator; an int/Int64 pair compares the same. See CSHARP_NUMERIC_KINDS.
    csharpNativeNumericComparison(node, identation): string | undefined {
        const token = CSHARP_NATIVE_COMPARISON_TOKENS[node.operatorToken.kind];
        if (token === undefined) {
            return undefined;
        }
        const leftKind = this.csharpExpressionTypeOf(node.left);
        const rightKind = this.csharpExpressionTypeOf(node.right);
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        const integerPair = (CSHARP_INTEGER_KINDS.indexOf(leftKind) >= 0) && (CSHARP_INTEGER_KINDS.indexOf(rightKind) >= 0);
        if (!integerPair && ((leftKind !== rightKind) || (CSHARP_NUMERIC_KINDS.indexOf(leftKind) < 0))) {
            return undefined;
        }
        if ((leftKind === 'double') && ((token === '<') || (token === '<='))) {
            return undefined;
        }
        const leftText = this.printNode(node.left, 0).trim();
        const rightText = this.printNode(node.right, 0).trim();
        return leftText + ' ' + token + ' ' + rightText;
    }

    // `Math.min/max (a, b)`: mathMin/mathMax read both boxes via Convert.ToDouble, return an ORIGINAL
    // one (null if either is null); Math.Min/Max returns one numeric kind. Native only when both are
    // declared integers of the same kind and the checker sees two plain numbers; else keep the helper.
    csharpNativeMathMinMax(node, name: string, parsedArg1: string, parsedArg2: string): string | undefined {
        const args = node.arguments;
        if ((args?.length !== 2) || !this.csharpMinMaxResultIsPlainValue(node)) {
            return undefined;
        }
        const leftKind = this.csharpExpressionTypeOf(args[0]);
        if ((leftKind === undefined) || (leftKind !== this.csharpExpressionTypeOf(args[1])) || (CSHARP_MINMAX_NATIVE_KINDS.indexOf(leftKind) < 0)) {
            return undefined;
        }
        if (!this.csharpOperandIsPlainNumber(args[0]) || !this.csharpOperandIsPlainNumber(args[1])) {
            return undefined;
        }
        return 'Math.' + name + '(' + parsedArg1 + ', ' + parsedArg2 + ')';
    }

    // the positions that take the primitive as the helper's box: assignment, argument,
    // dictionary/list value, return and ternary arm all box an int the same way. A receiver, an
    // `as`/`!` wrapper and the printer's hard `(string)` casts (throw / `delete`) do not.
    csharpMinMaxResultIsPlainValue(node): boolean {
        if (this.csharpIsClassThrowArgument(node) || this.csharpIsDeleteKey(node)) {
            return false;
        }
        let parent = node.parent;
        while (parent !== undefined && isParenthesizedExpression(parent)) {
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        if ((isPropertyAccessExpression(parent) || isElementAccessExpression(parent) || isCallExpression(parent)) && parent.expression === node) {
            return false;
        }
        return (parent.kind !== SyntaxKind.AsExpression) && (parent.kind !== SyntaxKind.TypeAssertionExpression) && (parent.kind !== SyntaxKind.NonNullExpression);
    }

    // `parseInt(...)` / `parseFloat(...)` print the runtime helper call; the folds below replace
    // it with the exact box the helper returns, everything else falls through to the printer
    printCallExpression(node, identation) {
        const nativeParse = this.csharpNativeParseCall(node);
        if (nativeParse !== undefined) {
            return nativeParse;
        }
        return super.printCallExpression(node, identation);
    }

    csharpNativeParseCall(node) {
        if (node?.kind !== SyntaxKind.CallExpression || !isIdentifier(node.expression)) {
            return undefined;
        }
        const callee = node.expression.text as string;
        if ((callee !== 'parseInt') && (callee !== 'parseFloat')) {
            return undefined;
        }
        const args = node.arguments;
        if (args === undefined || args.length !== 1) {
            return undefined;
        }
        if (!this.csharpCalleeIsGlobalFunction(node.expression)) {
            return undefined; // a locally declared function of the same name is not the helper
        }
        const literal = (callee === 'parseInt') ? csharpParseIntLiteralArgument(args[0]) : csharpParseFloatLiteralArgument(args[0]);
        if (literal !== undefined) {
            return literal;
        }
        return this.csharpNativeParseCallOnDeclaredLocal(callee, args[0]);
    }

    // the global `parseInt` / `parseFloat` live in the TS lib chain; a declaration anywhere else
    // means the call prints a different function than the runtime helper
    csharpCalleeIsGlobalFunction(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return true; // in-memory program without a checker: the name is all there is
        }
        const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
        return declarations.every((declaration) => declaration.getSourceFile().fileName.indexOf('typescript') > -1);
    }

    // `parseFloat(x)` / `parseInt(x)` on a local declared numeric: Convert.ToDouble is an identity for
    // `double` and a widening for integer kinds. An Int64 parseInt operand (rounded above 2^53), a
    // double one (NaN/overflow -> null) and nullable or `object` locals (null -> 0) keep the helper.
    csharpNativeParseCallOnDeclaredLocal(callee, arg) {
        if (arg?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const kind = this.csharpExpressionTypeOf(arg);
        if (CSHARP_NUMERIC_KINDS.indexOf(kind) < 0) {
            return undefined;
        }
        const text = this.printNode(arg, 0);
        if (callee === 'parseFloat') {
            return (kind === 'double') ? text : `((double)${text})`;
        }
        return (kind === 'int') ? `((Int64)${text})` : undefined;
    }

    // `a % b` prints `mod(a, b)`: the helper takes the double remainder and converts back to Int64. An
    // Int32 dividend with a nonzero integer literal divisor is exact as double, so the native Int64
    // remainder matches. Int64 dividends (rounded above 2^53) and possibly-zero divisors keep helper.
    csharpNativeModExpression(left, right, leftText) {
        if (left?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (this.csharpExpressionTypeOf(left) !== 'int') {
            return undefined;
        }
        const divisor = csharpLiteralNumericValue(right);
        if ((divisor === undefined) || !Number.isSafeInteger(divisor) || (divisor === 0)) {
            return undefined;
        }
        return `((Int64)${leftText} % ${divisor}L)`;
    }

    // `-x` prints `prefixUnaryNeg(ref x)`, whose typed overloads negate in place and return the same
    // box (`a = -a; return a;`): a local declared int / Int64 / double binds one, so the assignment is
    // the identical emission. Every other operand keeps the helper's runtime dispatch and null answer.
    csharpNativeNegatedLocal(operand, leftSide) {
        if (operand?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (CSHARP_NUMERIC_KINDS.indexOf(this.csharpExpressionTypeOf(operand)) < 0) {
            return undefined;
        }
        return `(${leftSide} = -${leftSide})`;
    }

    // The printed receiver whose C# static type is a known collection: a local this printer declared
    // with a concrete type (csharpTypedLocals), or a hand-written BaseExchange field. undefined keeps
    // the runtime helper, since the printer cannot name the operand's type.
    csharpNativeReceiver(node): { text: string, type: string } | undefined {
        if (node?.kind === SyntaxKind.ParenthesizedExpression) {
            const inner = this.csharpNativeReceiver(node.expression);
            return inner === undefined ? undefined : { text: `(${inner.text})`, type: inner.type };
        }
        if (isIdentifier(node)) {
            const named = this.csharpTypedLocalType(node);
            return (named === undefined || CSHARP_NATIVE_COLLECTION_TYPES.indexOf(named) < 0) ? undefined : { text: this.printNode(node, 0), type: named };
        }
        if (isPropertyAccessExpression(node) && node.expression?.kind === SyntaxKind.ThisKeyword) {
            const name = node.name?.text as string;
            if (CSHARP_OBJECT_DICT_FIELDS.indexOf(name) >= 0) {
                // the field is declared `object`; its box is always a dictionary
                return { text: `((IDictionary<string, object>)${this.printNode(node, 0)})`, type: 'IDictionary<string, object>' };
            }
            return CSHARP_NATIVE_FIELDS[name] === undefined ? undefined : { text: this.printNode(node, 0), type: CSHARP_NATIVE_FIELDS[name] };
        }
        // a call whose printed C# type this printer already names (Object.keys, this.indexBy,
        // x.split, ...) is a collection too
        const callType = this.csharpCallReturnType(node);
        if (callType !== undefined && CSHARP_NATIVE_COLLECTION_TYPES.indexOf(callType) >= 0) {
            const printed = this.printNode(node, 0);
            return { text: printed.startsWith('new ') ? `(${printed})` : printed, type: callType };
        }
        return undefined;
    }

    // the C# types this printer can name on a local whose members replace the helpers:
    // the collection types (Count/ContainsKey) and string (Length/ContainsKey keys)
    csharpTypeIsNative(csharpType: string): boolean {
        return CSHARP_NATIVE_COLLECTION_TYPES.indexOf(csharpType) >= 0 || csharpType.indexOf('string') === 0;
    }

    // the C# type this printer declared for a local read, or undefined
    csharpTypedLocalType(node): string | undefined {
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        return declaration === undefined ? undefined : this.csharpTypedLocals.get(declaration);
    }

    // the member that replaces getArrayLength on a declared C# type: Count counts the same
    // elements the helper's IList / ICollection branches count, Length is its string branch.
    // Any other declared type keeps the helper
    csharpCountMemberOf(csharpType: string): string | undefined {
        if ((csharpType === 'string') || (csharpType === 'string?')) {
            return 'Length';
        }
        return CSHARP_COUNT_TYPES.some((prefix) => csharpType.indexOf(prefix) === 0) ? 'Count' : undefined;
    }

    // `getArrayLength(x)` -> `(x?.Count ?? 0)` for a local whose printed declaration carries a C#
    // collection / string type (printer's declared-local table, then build/csharp-local-types.js).
    // The null-conditional is the helper's `null -> 0`; a plain member read would throw instead.
    csharpDeclaredLengthExpression(node): string | undefined {
        // a cast the printer itself printed around the receiver names the type outright, and
        // takes the whole expression as its operand (`(T)x?.Count` would cast the Count), so
        // the printed form is parenthesised before its own member read
        const printed = this.printNode(node, 0).trim();
        const cast = CSHARP_LENGTH_CAST.exec(printed);
        if (cast !== null) {
            const castMember = this.csharpCountMemberOf(cast[1]);
            if (castMember !== undefined) {
                return `(${isIdentifier(node) ? printed : `(${printed})`}?.${castMember} ?? 0)`;
            }
        }
        // `(x as List).length` / `((x)).length`: the printer prints the wrapper as the bare
        // local when it elides the assertion, so the read is still the identifier
        const receiver = this.csharpLengthReceiverIdentifier(node);
        if (receiver === undefined) {
            return undefined;
        }
        const named = this.csharpTypedLocalType(receiver);
        const csharpType = named !== undefined ? named
            : (this.csharpExpressionTypeResolver ? this.csharpExpressionTypeResolver(receiver) : undefined)
            ?? this.csharpLengthReceiverType(receiver);
        const member = csharpType === undefined ? undefined : this.csharpCountMemberOf(csharpType);
        if (member === undefined) {
            return undefined;
        }
        // a wrapper the printer does print (a `((string)x)` cast keeps its assertion) is a
        // different receiver: only the printed-as-identifier shape may take the member read
        const receiverText = this.printNode(receiver, 0);
        if (this.printNode(node, 0).trim() !== receiverText.trim()) {
            return undefined;
        }
        return `(${receiverText}?.${member} ?? 0)`;
    }

    // the printed key of ContainsKey must itself be a C# string: a literal, a local this
    // printer declared `string`, a call it types as string, or its own `((string)x)` cast
    csharpNativeStringKey(key): string | undefined {
        if (key?.kind === SyntaxKind.ParenthesizedExpression) {
            return this.csharpNativeStringKey(key.expression);
        }
        if (isStringLiteralLikeNode(key)) {
            return this.printNode(key, 0);
        }
        if (isIdentifier(key)) {
            const named = this.csharpTypedLocalType(key);
            // a non-nullable string local is the printed proof ContainsKey needs (`string?`
            // still needs the checker's string, or a null key would throw where inOp says false)
            if (named === 'string') {
                return this.printNode(key, 0);
            }
            if ((named === undefined) || (named.indexOf('string') !== 0)) {
                return undefined;
            }
            return this.isStringType(this.getChecker().getTypeAtLocation(key).flags) ? this.printNode(key, 0) : undefined;
        }
        if (this.csharpCallReturnType(key) === 'string') {
            // the callee's C# signature is a plain string; the checker proof is the phase-1 gate
            return this.isStringType(this.getChecker().getTypeAtLocation(key).flags) ? this.printNode(key, 0) : undefined;
        }
        const printed = this.printNode(key, 0);
        if (!printed.startsWith('((string)')) {
            return undefined;
        }
        // the cast is the printer's own string view of the value: only a checker-proven
        // string operand may have it (a non-string box would throw where the helper says false)
        return this.isStringType(this.getChecker().getTypeAtLocation(key).flags) ? printed : undefined;
    }

    // the checker's view of an `in` / `.length` operand: a dictionary carries a string
    // index signature, an array is the Array reference type. `any` proves nothing
    csharpIsDictionaryType(type): boolean {
        if (type === undefined || this.isAnyType(type.flags)) {
            return false;
        }
        return this.getChecker().getIndexTypeOfType(type, IndexKind.String) !== undefined;
    }

    csharpIsArrayType(type): boolean {
        if (type === undefined || this.isAnyType(type.flags)) {
            return false;
        }
        return type?.symbol?.escapedName === 'Array';
    }

    // a union of dictionary members and nullish ones (what a `Dict | undefined` signature
    // widens to): a C# reference that happens to be null is a nullish arm, not a scalar one.
    // Any other member (arrays, classes, scalars) keeps the helper
    csharpNullableDictionaryType(type): boolean {
        if (type === undefined || ((type.flags & TypeFlags.Union) === 0)) {
            return false;
        }
        let dictionaries = 0;
        for (const member of (type as ts.UnionType).types ?? []) {
            if ((member.flags & (TypeFlags.Undefined | TypeFlags.Null)) !== 0) {
                continue;
            }
            if (!this.csharpIsDictionaryType(member)) {
                return false;
            }
            dictionaries++;
        }
        return dictionaries > 0;
    }

    // a dictionary whose values are `any` — the shape the transpiled C# boxes as
    // Dictionary<string, object>. A `Dictionary<Future>` / `Dictionary<Currency>` keeps the
    // helper: the C# cast target is invariant, so `IDictionary<string, Future>` would throw
    csharpIsAnyValuedDictionaryType(type): boolean {
        if (!this.csharpIsDictionaryType(type)) {
            return false;
        }
        const value = this.getChecker().getIndexTypeOfType(type, IndexKind.String);
        return (value !== undefined) && this.isAnyType(value.flags);
    }

    // the parameter printFunctionBody gives a `??= new Dictionary<string, object>()` line
    // (its initializer is an object literal): from the first statement on its box is a
    // dictionary whatever the caller passed, so a null check would be dead code
    csharpDictionaryParamsBag(node): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        const initializer = (declaration?.kind === SyntaxKind.Parameter) ? (declaration as ParameterDeclaration).initializer : undefined;
        return initializer?.kind === SyntaxKind.ObjectLiteralExpression;
    }

    // D2: the name is rewritten before this read, so the box it holds there is not the one its
    // declaration started with (the scan is a name match, so any earlier write bails)
    csharpNameWrittenBefore(node, name: string): boolean {
        const scope = this.csharpEnclosingFunction(node);
        if (scope === undefined) {
            return true;
        }
        let written = false;
        const visit = (n) => {
            if (written || (n.pos >= node.pos)) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name)) {
                const parent = n.parent;
                const assignment = (parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n);
                const increment = ((parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.PrefixUnaryExpression))
                    && ((parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken));
                if (assignment || increment) {
                    written = true;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return written;
    }

    // The C# dictionary a ContainsKey receiver reads through, or undefined: printer tables, then the
    // build layer's declared-type table, then an `object` parameter proven a dictionary by TS or an
    // emitted `??= new Dictionary<string, object>()`. That case applies the helper's cast + null test.
    csharpNativeDictionaryReceiver(obj): { text: string, nullTest?: string } | undefined {
        const checker = this.getChecker();
        const type = checker.getTypeAtLocation(obj);
        const nullable = this.csharpNullableDictionaryType(type);
        const receiver = this.csharpNativeReceiver(obj);
        if (receiver !== undefined) {
            // only a dictionary C# type carries ContainsKey (IList<object> keeps the helper)
            if (receiver.type.indexOf('Dictionary<') < 0) {
                return undefined;
            }
            return nullable ? { text: receiver.text, nullTest: receiver.text } : { text: receiver.text };
        }
        // the embedding build layer's declared-type table names the type the local's own
        // declaration carries, so it needs neither the checker proof nor a cast
        const declared = this.csharpExpressionTypeOf(obj);
        if (declared !== undefined) {
            return (declared.indexOf('Dictionary<') >= 0) ? { text: this.printNode(obj, 0) } : undefined;
        }
        // an `object` box: only a parameter of this function (a local may box the hand-written
        // base's own instantiation — `client.futures` is IDictionary<string, Future> — and the
        // printer cannot tell), and only while nothing has rewritten it (D2)
        if (!isIdentifier(obj) || (this.csharpTypedLocalType(obj) !== undefined)) {
            return undefined;
        }
        const name = obj.text as string;
        if (this.csharpNameWrittenBefore(obj, name)) {
            return undefined;
        }
        const declaration = checker.getSymbolAtLocation(obj)?.valueDeclaration;
        if (declaration?.kind !== SyntaxKind.Parameter) {
            return undefined; // a local may box a hand-written instantiation the printer cannot name
        }
        const printed = this.printNode(obj, 0);
        const text = `((IDictionary<string, object>)${printed})`;
        // the params bag: the printer's own `??= new Dictionary<string, object>()` line made the
        // box a dictionary whatever the caller passed, so no checker proof is needed (and no
        // null test — the line is the first statement of the body)
        if (this.csharpDictionaryParamsBag(obj)) {
            return { text };
        }
        if (!this.csharpIsDictionaryType(type) && !nullable) {
            return undefined;
        }
        if (!this.csharpIsAnyValuedDictionaryType(type)) {
            return undefined;
        }
        return { text, nullTest: printed };
    }

    // `key in obj` -> `obj.ContainsKey(key)`, only when both the printed key and the printed
    // operand are already C# string / dictionary values. Every other shape keeps the inOp helper
    csharpNativeInExpression(key, obj): string | undefined {
        const printedKey = this.csharpNativeStringKey(key);
        if (printedKey === undefined) {
            return this.csharpDeclaredDictInExpression(key, obj);
        }
        const receiver = this.csharpNativeDictionaryReceiver(obj);
        if (receiver !== undefined) {
            const call = `${receiver.text}.ContainsKey(${printedKey})`;
            return (receiver.nullTest === undefined) ? call : `(${receiver.nullTest} != null && ${call})`;
        }
        // a receiver the embedding build layer retypes AFTER printing: the checker may see
        // `any` on it, so no table above names it (see csharpDeclaredDictInExpression)
        return this.csharpDeclaredDictInExpression(key, obj);
    }

    // `key in obj` on a local whose EMITTED declaration is a dictionary the printer cannot name itself
    // (build/csharp-local-types.js retypes it, answers csharpDeclaredDictReceiverType): inOp's dict
    // branch is exactly `obj?.ContainsKey(key) == true` for a key that is already a C# string.
    csharpDeclaredDictInExpression(key, obj): string | undefined {
        if (obj?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declared = (typeof this.csharpDeclaredDictReceiverType === 'function') ? this.csharpDeclaredDictReceiverType(obj) : undefined;
        if ((declared === undefined) || (declared.indexOf('Dictionary<') < 0)) {
            return undefined;
        }
        const printedKey = this.csharpNativeStringKey(key) ?? this.csharpDeclaredStringKey(key);
        if (printedKey === undefined) {
            return undefined;
        }
        const receiver = this.printNode(obj, 0);
        if (isStringLiteralLikeNode(key)) {
            return `(${receiver}?.ContainsKey(${printedKey}) == true)`;
        }
        // an identifier key may hold null, where a bare ContainsKey throws ArgumentNullException:
        // the helper's own null guard is emitted back. Undefined by default, so an untyped run is
        // byte-identical (a receiver no hook names keeps the helper call).
        if (isIdentifier(key)) {
            return `((${printedKey} != null) && (${receiver}?.ContainsKey(${printedKey}) == true))`;
        }
        return undefined;
    }

    // the key of the rule above, when the printer's own tables name no string for it but the
    // embedding build layer's record does (the same hook the isEqual twin reads)
    csharpDeclaredStringKey(key): string | undefined {
        if (key?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const type = (typeof this.csharpLocalTypeOf === 'function') ? this.csharpLocalTypeOf(key) : undefined;
        return ((type === 'string') || (type === 'string?')) ? this.printNode(key, 0) : undefined;
    }

    // `x.length` -> `x.Count`, same proof for the checker's array operands; strings keep
    // the `((string)x).Length` branch and every unproven operand keeps getArrayLength
    csharpNativeLengthExpression(expression): string | undefined {
        if (this.csharpIsArrayType(this.getChecker().getTypeAtLocation(expression))) {
            const receiver = this.csharpNativeReceiver(expression);
            if (receiver !== undefined) {
                return `${receiver.text}.Count`;
            }
        }
        return this.csharpDeclaredLengthExpression(expression);
    }

    // the C# type of a dictionary element read is `object`: isEqual compares the boxed
    // element, which `as` + the operator reproduce exactly (any other box reads as null,
    // where isEqual also answers false)
    csharpNativeElementLiteralEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        let element;
        let literal;
        if (this.csharpStringKeyedElementAccess(left)) {
            element = left;
            literal = right;
        } else if (this.csharpStringKeyedElementAccess(right)) {
            element = right;
            literal = left;
        } else {
            return undefined;
        }
        const isBoolLiteral = (literal.kind === SyntaxKind.TrueKeyword) || (literal.kind === SyntaxKind.FalseKeyword);
        const isStringLiteral = isStringLiteralLikeNode(literal);
        if (!isBoolLiteral && !isStringLiteral) {
            return undefined;
        }
        if (this.csharpDictionaryReceiverType(element.expression) === undefined) {
            return undefined;
        }
        const wanted = isBoolLiteral ? CSHARP_SCALAR_ELEMENT_BOOL : CSHARP_SCALAR_ELEMENT_STRING;
        if ((this.csharpScalarElementKinds(element) & wanted) === 0) {
            return undefined;
        }
        const token = isEquality ? '==' : '!=';
        if (isStringLiteral && this.csharpNumericStringLiteral(literal)) {
            return undefined; // isEqual's double/decimal branches coerce a numeric string
        }
        const cast = isBoolLiteral ? 'bool?' : 'string';
        const elementIsLeft = (element === left);
        const castElement = `(${elementIsLeft ? leftText : rightText} as ${cast})`;
        const otherText = elementIsLeft ? rightText : leftText;
        return elementIsLeft ? `(${castElement} ${token} ${otherText})` : `(${otherText} ${token} ${castElement})`;
    }

    // `x["k"]` — the element read of a dictionary key this printer prints as getValue(x, "k")
    csharpStringKeyedElementAccess(node): boolean {
        return (node?.kind === SyntaxKind.ElementAccessExpression) && isStringLiteralLikeNode(node.argumentExpression);
    }

    // isEqual compares a boxed number with a numeric string by converting both, which the
    // string cast of the native form cannot reproduce: a numeric-looking literal stays on
    // the helper (the element proof says the box is a string, and a number box would differ)
    csharpNumericStringLiteral(node): boolean {
        const text = String(node.text).trim();
        return (text !== '') && !isNaN(Number(text));
    }

    // the declared C# type of a dictionary receiver: a local the embedding build layer retypes
    // (csharpExpressionTypeResolver) or a hand-written BaseExchange field; undefined keeps the
    // runtime helper, since the printer cannot name the box the key lives in
    csharpDictionaryReceiverType(node): string | undefined {
        const native = this.csharpNativeReceiver(node);
        const declared = (native !== undefined) ? native.type : this.csharpExpressionTypeOf(node);
        if ((declared === undefined) || (declared.indexOf('Dictionary<') < 0)) {
            return undefined;
        }
        return declared;
    }

    // the scalar branches isEqual can compare an element with: every member of the element's
    // TypeScript type must be a boolean, a string or undefined, or the helper stays
    csharpScalarElementKinds(node): number {
        try {
            const type = this.getChecker().getTypeAtLocation(node);
            const members = ((type.flags & TypeFlags.Union) !== 0) ? ((type as any).types ?? []) : [ type ];
            let kinds = 0;
            for (const member of members) {
                const flags = member.flags;
                if (flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) {
                    kinds |= CSHARP_SCALAR_ELEMENT_BOOL;
                } else if (flags & (TypeFlags.String | TypeFlags.StringLiteral | TypeFlags.TemplateLiteral)) {
                    kinds |= CSHARP_SCALAR_ELEMENT_STRING;
                } else if (!(flags & TypeFlags.Undefined)) {
                    return 0;
                }
            }
            return kinds;
        } catch (e) {
            return 0; // in-memory program without a checker
        }
    }

    // the C# type the emitted declaration gives a `.length` receiver, or undefined when this
    // printer names none. Installed by build/csharp-local-types.js; undefined by default, so
    // the untyped emission is byte-identical without the override
    csharpLengthReceiverType(expression): string | undefined {
        return undefined;
    }

    // `isEqual (x, "lit")` -> `x == "lit"` (and `!isEqual` -> `!=`) when the operand's emitted
    // declaration is a string: isEqual's string branch is the same ordinal comparison; a null operand
    // is false in both. Gated on csharpLocalTypeOf; an unnamed operand keeps the helper call.
    csharpStringLiteralEquality(op, left, right, leftText: string, rightText: string): string | undefined {
        const equality = (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken);
        const inequality = (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken);
        if (!equality && !inequality) {
            return undefined;
        }
        const leftLiteral = isStringLiteral(left);
        const rightLiteral = isStringLiteral(right);
        if (leftLiteral === rightLiteral) {
            return undefined; // exactly one side must be the (never-null) string literal
        }
        const operand = leftLiteral ? right : left;
        if (operand?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const operandType = this.csharpLocalTypeOf(operand);
        if ((operandType !== 'string') && (operandType !== 'string?')) {
            return undefined;
        }
        return `${leftText} ${inequality ? '!=' : '=='} ${rightText}`;
    }

    // U55: `isEqual (x, null)` -> `x == null` (`!isEqual` -> `!=`) when the emitted declaration is
    // a typed reference or nullable scalar: the helper's null guards return exactly the C# null test,
    // never reach a typed branch. Gated on csharpNullComparisonTypeOf; unnamed operands keep helper.
    csharpNullLiteralEquality(op, left, right, leftText: string, rightText: string): string | undefined {
        const equality = (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken);
        const inequality = (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken);
        if (!equality && !inequality) {
            return undefined;
        }
        const leftNull = this.csharpOperandIsNullLiteral(left);
        const rightNull = this.csharpOperandIsNullLiteral(right);
        if (leftNull === rightNull) {
            return undefined; // exactly one side must be the (never-typed) null literal
        }
        let operand = leftNull ? right : left;
        while (operand?.kind === SyntaxKind.ParenthesizedExpression) {
            operand = operand.expression;
        }
        if (operand?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const operandType = (typeof this.csharpNullComparisonTypeOf === 'function') ? this.csharpNullComparisonTypeOf(operand) : undefined;
        if (!this.csharpNullComparisonTypeIsProvable(operandType)) {
            return undefined;
        }
        return this.csharpNullComparison(leftNull ? rightText : leftText, equality);
    }

    // `null` and the `undefined` identifier both print as the C# null literal
    csharpOperandIsNullLiteral(node): boolean {
        return (node?.kind === SyntaxKind.NullKeyword)
            || ((node?.kind === SyntaxKind.Identifier) && (node.text === 'undefined'));

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;

        const op = node.operatorToken.kind;

        if (left.kind === SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        // handle: [x,d] = this.method()
        if (op === SyntaxKind.EqualsToken && left.kind === SyntaxKind.ArrayLiteralExpression) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            // when the holder's C# type is known (see csharpDestructuringTempType), declare the
            // holder with it and index it directly: `((IList<object>)holder)[i]` names nothing new
            const tempType = this.csharpDestructuringTempType(right);
            const tempExpression = this.printNode(right, 0);

            let arrayBindingStatement = tempType ? `${tempType} ${syntheticName} = (${tempType})${tempExpression};\n` : `var ${syntheticName} = ${tempExpression};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const leftElement = arrayBindingPatternElements[index];
                const leftType = this.getChecker().getTypeAtLocation(leftElement);
                const parsedType = this.getTypeFromRawType(leftType);

                const castExp = parsedType ? `(${parsedType})` : "";

                // const statement = this.getIden(identation) + `${e} = (${castExp}((List<object>)${syntheticName}))[${index}]`;
                const statement = this.getIden(identation) + (tempType ? `${e} = ${syntheticName}[${index}]` : `${e} = ((IList<object>)${syntheticName})[${index}]`);
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        if (op === SyntaxKind.InKeyword) {
            const nativeIn = this.csharpNativeInExpression(left, right);
            if (nativeIn !== undefined) {
                return nativeIn;
            }
            return `inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            const nativeComparison = this.csharpNativeNumericComparison(node, identation);
            if (nativeComparison !== undefined) {
                return nativeComparison;
            }
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);

            if (op === SyntaxKind.PlusEqualsToken) {
                return `${leftText} = add(${leftText}, ${rightText})`;
            }

            if (op === SyntaxKind.MinusEqualsToken) {
                return `${leftText} = subtract(${leftText}, ${rightText})`;
            }

            const isEquality = (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken);
            const isDifference = (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken);
            if (isEquality || isDifference) {
                // `isEqual (x, "lit")` / `!isEqual (x, "lit")` over a string-typed operand (S60,
                // csharpStringLiteralEquality) first; anything the hook cannot name falls through to the
                // printed-form inlining below, byte-identically.
                const nativeEquality = this.csharpStringLiteralEquality(op, left, right, leftText, rightText);
                if (nativeEquality !== undefined) {
                    return nativeEquality;
                }
                // `isEqual (x, null)` / `!isEqual (x, null)` over a typed-reference or nullable-scalar operand
                // (U55, csharpNullLiteralEquality), the hook-gated null-literal twin of the rule above; anything
                // it cannot name falls through to the printed-form inlining below, byte-identically.
                const nativeNullEquality = this.csharpNullLiteralEquality(op, left, right, leftText, rightText);
                if (nativeNullEquality !== undefined) {
                    return nativeNullEquality;
                }
                const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
                if (inlined !== undefined) {
                    return inlined;
                }
                const nativeElement = this.csharpNativeElementLiteralEquality(left, right, leftText, rightText, isEquality);
                if (nativeElement !== undefined) {
                    return nativeElement;
                }
                const numericCall = this.csharpNativeNumericCallEquality(left, right, leftText, rightText, isEquality);
                if (numericCall !== undefined) {
                    return numericCall;
                }
            }

            if (op === SyntaxKind.PlusToken) {
                // `add (x, y)` -> `(x + y)` when the classifier proves the LEFT operand's emitted declaration is a
                // string (U57): the call binds add(string, string) / add(string, object), exactly this
                // concatenation. Gated on the hook, so an unnamed operand keeps the helper.
                const nativeConcat = this.csharpNativeStringConcat(left, right, leftText, rightText);
                if (nativeConcat !== undefined) {
                    return nativeConcat;
                }
            }

            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
            if (op === SyntaxKind.PercentToken) {
                const nativeMod = this.csharpNativeModExpression(left, right, leftText);
                if (nativeMod !== undefined) {
                    return nativeMod;
                }
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

    // the C# type of a whole-call / whole-property initializer, keyed on the AST so
    // the printer's cast wrappers (`((string)x).ToUpper()`) do not hide the callee
    csharpCallReturnType(initializer): string | undefined {
        if (initializer?.kind === SyntaxKind.PropertyAccessExpression) {
            // `x.length` prints `((string)x).Length` or `getArrayLength(x)`, both int
            return (initializer.name?.text === 'length') ? 'int' : undefined;
        }
        if (initializer?.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        const expression = initializer.expression;
        if (expression?.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }
        const methodName = expression.name?.text as string;
        const target = expression.expression;
        if (target?.kind === SyntaxKind.ThisKeyword) {
            // the table names the C# signature of the same-name base helper, which the printed
            // call only binds when the printer resolves the callee. An unresolvable one
            // (`this.proxyUrlCallback(...)` — a property holding the function — or a
            // checker-less program) prints `callDynamically(this, "name", ...)` instead, and
            // that helper returns `object`: no concrete type may be named for its value
            if (!this.csharpCalleeResolves(initializer)) {
                return undefined;
            }
            return CSHARP_THIS_RETURN_TYPES[methodName];
        }
        if (target?.kind === SyntaxKind.Identifier) {
            const full = (target.text as string) + '.' + methodName;
            if (CSHARP_STATIC_RETURN_TYPES[full] !== undefined) {
                return CSHARP_STATIC_RETURN_TYPES[full];
            }
        }
        return CSHARP_METHOD_RETURN_TYPES[methodName];
    }

    // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call whose callee the
    // checker cannot resolve is printed as `callDynamically(this, "<name>", ...)`, whose C#
    // signature returns `object` whatever the name says
    csharpCalleeResolves(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const signature = checker.getResolvedSignature(node);
        return signature?.declaration !== undefined;
    }

    // the concrete C# type the initializer already produces, or undefined when the
    // printer cannot name it (this.safeString, getValue, add, parseInt, ... return object)
    csharpTypeOfInitializer(initializer): string | undefined {
        switch (initializer?.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return 'bool';
        case SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!isTrue(x)`
            return (initializer.operator === SyntaxKind.ExclamationToken) ? 'bool' : undefined;
        case SyntaxKind.ParenthesizedExpression:
            return this.csharpTypeOfInitializer(initializer.expression);
        case SyntaxKind.BinaryExpression: {
            const op = initializer.operatorToken.kind;
            // `a || b` prints `isTrue(a) || isTrue(b)`; the comparison wrappers and
            // `in` all return bool
            switch (op) {
            case SyntaxKind.BarBarToken:
            case SyntaxKind.AmpersandAmpersandToken:
            case SyntaxKind.EqualsEqualsToken:
            case SyntaxKind.EqualsEqualsEqualsToken:
            case SyntaxKind.ExclamationEqualsToken:
            case SyntaxKind.ExclamationEqualsEqualsToken:
            case SyntaxKind.GreaterThanToken:
            case SyntaxKind.GreaterThanEqualsToken:
            case SyntaxKind.LessThanToken:
            case SyntaxKind.LessThanEqualsToken:
            case SyntaxKind.InKeyword:
                return 'bool';
            }
            return undefined;
        }
        }
        const knownType = this.csharpCallReturnType(initializer);
        if (knownType !== undefined) {
            return knownType;
        }
        return this.csharpBoolCallTyped(initializer) ? 'bool' : undefined;
    }

    // A `this.<name>(...)` call to a method the enclosing class declares with a plain `bool` return
    // (csharpBooleanReturnType prints that `bool`) hands back an unboxed bool, so a local holding it is
    // `bool`. Base helpers, names the table answers and overloaded families keep their box.
    csharpBoolCallTyped(node): boolean {
        if (node?.kind !== SyntaxKind.CallExpression || !this.csharpIsCheckedBoolean(node)) {
            return false;
        }
        const expression = node.expression;
        if (expression?.kind !== SyntaxKind.PropertyAccessExpression || expression.expression?.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        let declaration;
        let checker;
        try {
            checker = this.getChecker();
            declaration = checker.getResolvedSignature(node)?.declaration;
        } catch (e) {
            return false;
        }
        if (!isMethodDeclaration(declaration) || (this.csharpBooleanReturnType(declaration) !== 'bool')) {
            return false;
        }
        const owner = findAncestor(declaration, isClassLike);
        if ((owner === undefined) || (owner !== findAncestor(node, isClassLike))) {
            return false;
        }
        return checker.getSymbolAtLocation(declaration.name)?.declarations?.length === 1;
    }

    csharpEnclosingFunction(node) {
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

    csharpTypeNameIsShadowed(scope, csharpType: string): boolean {
        const names = csharpType.match(/[A-Za-z_]\w*/g) ?? [];
        const relevant = names.filter((n) => CSHARP_TYPE_NAMES.indexOf(n) >= 0);
        if (relevant.length === 0 || scope === undefined) {
            return false;
        }
        return this.hasNodeWhere(scope, (n: any) => {
            const isBinding = (n.kind === SyntaxKind.Parameter) || (n.kind === SyntaxKind.VariableDeclaration);
            if (isBinding && (n.name?.kind === SyntaxKind.Identifier)) {
                const printed = this.printNode(n.name, 0);
                if (relevant.indexOf(printed) >= 0) { return true; }
            }
            return false;
        });
    }

    // reject the refinement when something downstream needs the local to stay `object`:
    // `x.push(v)` prints `((IList<object>)x).Add(v)` on a value that must be boxed, a
    // later assignment of another concrete type would stop compiling, and `x++` prints
    // `postFixIncrement(ref x)` whose parameter is `ref object`
    csharpLocalIsSafeToType(scope, declaration, varName: string, csharpType: string, safeAccessor = false): boolean {
        if (scope === undefined) {
            return false;
        }
        const safe = !this.hasNodeWhere(scope, (n: any) => {
            if ((n.kind === SyntaxKind.Identifier) && (n.text === varName) && (n !== declaration.name)) {
                const parent = n.parent;
                if (parent?.kind === SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if ((parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.PrefixUnaryExpression)) {
                    const op = parent.operator;
                    if ((op === SyntaxKind.PlusPlusToken) || (op === SyntaxKind.MinusMinusToken)) {
                        return true;
                    }
                    // prefixUnaryNeg/Plus(ref x) has int / Int64 / double twins only: a
                    // nullable or reference local would not bind any overload
                    if (safeAccessor && (op !== SyntaxKind.ExclamationToken) && (csharpType !== 'int') && (csharpType !== 'Int64') && (csharpType !== 'double')) {
                        return true;
                    }
                }
                if (parent?.kind === SyntaxKind.SpreadElement) {
                    return true;
                }
                if (parent?.kind === SyntaxKind.ArrayLiteralExpression
                && parent.parent?.kind === SyntaxKind.BinaryExpression
                && parent.parent.left === parent
                && parent.parent.operatorToken.kind === SyntaxKind.EqualsToken) {
                    return true;
                }
                if (parent?.kind === SyntaxKind.PropertyAccessExpression && parent.expression === n) {
                    const method = parent.name?.text;
                    // these print as `((IList<object>)x).Add(...)` / `x = (x as IList<object>)...`
                    if ((method === 'push') || (method === 'reverse') || (method === 'sort')) {
                        return true;
                    }
                    // the remaining list methods print an `((IList<object>)x)` cast too; only
                    // a safe* list local can carry one
                    if (safeAccessor && !this.csharpTypeIsList(csharpType) && ((method === 'join') || (method === 'shift') || (method === 'pop'))) {
                        return true;
                    }
                }
                if (safeAccessor) {
                // `const [a, b] = x` prints a `((IList<object>)x)[0]` read
                    if (parent?.kind === SyntaxKind.VariableDeclaration && parent.name?.kind === SyntaxKind.ArrayBindingPattern && !this.csharpTypeIsList(csharpType)) {
                        return true;
                    }
                    // `throw new ExchangeError (x)` wraps the argument in a hard `(string)`
                    // cast, which only compiles from `object` or a string
                    if (!this.csharpTypeIsStringType(csharpType) && this.csharpIsClassThrowArgument(n)) {
                        return true;
                    }
                    // `delete obj[x]` prints `.Remove((string)x)`, the same hard cast
                    if (!this.csharpTypeIsStringType(csharpType) && this.csharpIsDeleteKey(n)) {
                        return true;
                    }
                }
                if (parent?.kind === SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === SyntaxKind.EqualsToken) {
                        if (this.csharpTypeOfInitializer(parent.right) !== csharpType) {
                            return true;
                        }
                    } else if ((op >= SyntaxKind.FirstCompoundAssignment) && (op <= SyntaxKind.LastCompoundAssignment)) {
                        return true;
                    }
                }
                // a `string?` local as the LEFT operand of `+` prints add(<x>, ...): the
                // nullable-to-`string` conversion makes add(string, ...) a better match than
                // add(object, object), which turns a null left into the right operand instead
                // of null (see the same rule in the ccxt cs/ccxt/base comments)
                if (safeAccessor && (csharpType === 'string?') && this.csharpIsLeftPlusOperand(n)) {
                    return true;
                }
            }
            return false;
        });
        return safe;
    }

    // a `((string)x)` wrapper is redundant as soon as the receiver's static C# type is
    // already string: the cast names the box the value is in, it never changes the value

    getCSharpLocalType(declaration): string {
        const csharpType = this.csharpTypeOfInitializer(declaration.initializer);
        if (csharpType === undefined) {
            return this.VAR_TOKEN;
        }
        // the scan matches AST identifiers, so it needs the source name, not the
        // printed one (`string` is renamed to `str` on the way out)
        const sourceName = declaration.name?.text;
        if (sourceName === undefined) {
            return this.VAR_TOKEN;
        }
        const scope = this.csharpEnclosingFunction(declaration);
        const safeAccessor = this.csharpIsSafeAccessorCall(declaration.initializer);
        if (this.csharpTypeNameIsShadowed(scope, csharpType) || !this.csharpLocalIsSafeToType(scope, declaration, sourceName, csharpType, safeAccessor)) {
            return this.VAR_TOKEN;
        }
        return csharpType;
    }

    // `this.safeString2 (...)`: the printed call binds the concrete C# signature of the
    // same-name base helper (see CSHARP_THIS_RETURN_TYPES). Used to gate the extra sinks.
    csharpIsSafeAccessorCall(initializer): boolean {
        if (initializer?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const expression = initializer.expression;
        if (expression?.kind !== SyntaxKind.PropertyAccessExpression || expression.expression?.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        return CSHARP_SAFE_ACCESSOR_NAMES.indexOf(expression.name?.text as string) >= 0;
    }

    csharpTypeIsList(csharpType: string): boolean {
        return (csharpType === 'List<object>') || (csharpType === 'IList<object>');
    }

    csharpTypeIsStringType(csharpType: string): boolean {
        return (csharpType === 'string') || (csharpType === 'string?');
    }

    // `throw new ExchangeError (x)`: the printer wraps the argument in a hard `(string)`
    csharpIsClassThrowArgument(node): boolean {
        let current = node;
        while (current.parent) {
            const parent = current.parent;
            if ((parent.kind === SyntaxKind.ParenthesizedExpression) || (parent.kind === SyntaxKind.AsExpression)) {
                current = parent;
                continue;
            }
            if ((parent.kind === SyntaxKind.NewExpression) && (parent.arguments?.indexOf(current) >= 0)) {
                current = parent;
                continue;
            }
            return parent.kind === SyntaxKind.ThrowStatement;
        }
        return false;
    }

    // `delete obj[x]` prints `.Remove((string)x)`
    csharpIsDeleteKey(node): boolean {
        let value = node;
        while (value.parent && ((value.parent.kind === SyntaxKind.ParenthesizedExpression) || (value.parent.kind === SyntaxKind.AsExpression))) {
            value = value.parent;
        }
        const access = value.parent;
        return access?.kind === SyntaxKind.ElementAccessExpression && access.argumentExpression === value && access.parent?.kind === SyntaxKind.DeleteExpression;
    }

    // `(x) + y` / `x + y` prints `add(x, y)`: the parentheses keep x's static type
    csharpIsLeftPlusOperand(node): boolean {
        let value = node;
        while (value.parent && (value.parent.kind === SyntaxKind.ParenthesizedExpression)) {
            value = value.parent;
        }
        const parent = value.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression || parent.left !== value) {
            return false;
        }
        const op = parent.operatorToken.kind;
        return (op === SyntaxKind.PlusToken) || (op === SyntaxKind.PlusEqualsToken);
    }
    // the binding a bare identifier resolves to (a local, a parameter, ...) or undefined
    // for every other receiver shape (`this.x`, a call result, a destructured target)
    csharpReceiverBinding(receiver) {
        if (receiver?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const symbol = (this.getChecker() as Checker).getSymbolAtLocation(receiver);
        return symbol?.valueDeclaration;
    }

    // The static C# type the emitted declaration gives a string-method receiver, or undefined when the
    // printer cannot name it (parameters, call results, ...). Only printer-typed locals are provable
    // here; the ccxt classifier overrides this hook to add the locals and parameters ITS tables retype.
    csharpStringReceiverType(receiver): string | undefined {
        const declaration = this.csharpReceiverBinding(receiver);
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        if ((declaration.parent as any)?.declarations?.length !== 1) {
            return undefined; // `object a = ..., b = ...` is printed as one statement
        }
        // memoized: the caller asks per receiver, getCSharpLocalType scans the scope
        const cached = this.stringReceiverTypes.get(declaration);
        if (cached !== undefined) {
            return (cached === '') ? undefined : cached;
        }
        const type = this.getCSharpLocalType(declaration);
        this.stringReceiverTypes.set(declaration, type ?? '');
        return type;
    }

    // the receiver of `x.Split/.ToUpper/.ToLower/.Replace/.Trim/.Length`, already printed:
    // bare when its static C# type is a string, wrapped in `((string)...)` otherwise (the
    // untyped emission is unchanged)
    csharpStringMethodReceiver(node, name) {
        const expression = node?.expression;
        const receiver = (node?.kind === SyntaxKind.CallExpression)
            ? ((expression?.kind === SyntaxKind.PropertyAccessExpression) ? expression.expression : undefined)
            : expression;
        const type = this.csharpStringReceiverType(receiver);
        return ((type === 'string') || (type === 'string?')) ? name : `((string)${name})`;
    }

    // The declared C# type of the `<a><b>Variable` holder of a destructuring block, or undefined
    // (keeps a `var` holder read via `((IList<object>)holder)[i]`). The ccxt classifier overrides this
    // for the tuple-returning `handle*AndParams` family: holder is `IList<object>`, read directly.
    csharpDestructuringTempType(initializer): string | undefined {
        return undefined;
    }

    // `isTrue (x)` is the identity on a C# `bool`, and `x == true` is what it computes for a `bool?`
    // (null -> false), so in a condition the wrapper adds nothing. The hook answers the emitted
    // declaration's type (getCSharpLocalType, plus classifier retypes); unnamed operands keep isTrue.
    csharpConditionOperandType(node) {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const symbol = (this.getChecker() as Checker).getSymbolAtLocation(node); // eslint-disable-line
        const declaration = symbol?.valueDeclaration;
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return undefined; // a parameter / member read has no declaration this pass retypes
        }
        if ((declaration.parent as any)?.declarations?.length !== 1) {
            return undefined; // `object a = ..., b = ...` is printed as one statement
        }
        // memoized: the caller asks per operand, getCSharpLocalType scans the scope
        const cached = this.conditionOperandTypes.get(declaration);
        if (cached !== undefined) {
            return (cached === '') ? undefined : cached;
        }
        const type = this.getCSharpLocalType(declaration);
        const result = ((type === 'bool') || (type === 'bool?')) ? type : undefined;
        this.conditionOperandTypes.set(declaration, result ?? '');
        return result;
    }

    // the native spelling of a condition operand, or undefined when it needs `isTrue`.
    // `!x == true` would parse as `(!x) == true`, so the `bool?` form takes parentheses
    // under the `!` operator; every other allowed position binds `==` tighter already.
    csharpNativeCondition(node, identation) {
        const type = this.csharpConditionOperandType(node);
        if (type === undefined) {
            return undefined;
        }
        const text = this.printNode(node, 0);
        if (type === 'bool') {
            return this.getIden(identation) + text;
        }
        const equalsTrue = text + ' == true';
        const parent = node.parent;
        const negated = (parent?.kind === SyntaxKind.PrefixUnaryExpression) && (parent.operator === SyntaxKind.ExclamationToken);
        return this.getIden(identation) + (negated ? `(${equalsTrue})` : equalsTrue);
    }

    // `!x` on the `bool?` the hook names prints `x != true`: exactly `!(x == true)` (null -> true)
    // and the value isTrue computes for the box. A `bool` operand keeps the base `!x`; an operand
    // the hook cannot name keeps `!isTrue(x)` (the untyped emission is untouched).
    csharpNegatedConditionOperand(operand) {
        if (operand?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        if (this.csharpConditionOperandType(operand) !== 'bool?') {
            return undefined;
        }
        return `${this.printNode(operand, 0)} != true`;
    }

    // only the if / while / && / || / ! condition positions print natively through this gate; the
    // ternary condition has its own hook-driven fold (csharpTernaryConditionOperand, U56) because
    // its operand is a plain value position the base printCondition path never asks about.
    csharpConditionPositionAllowsNative(node) {
        const parent = node?.parent;
        switch (parent?.kind) {
        case SyntaxKind.IfStatement:
            return parent.expression === node;
        case SyntaxKind.WhileStatement:
            return parent.expression === node;
        case SyntaxKind.PrefixUnaryExpression:
            return (parent.operator === SyntaxKind.ExclamationToken) && (parent.operand === node);
        case SyntaxKind.BinaryExpression: {
            const op = parent.operatorToken?.kind;
            return ((op === SyntaxKind.AmpersandAmpersandToken) || (op === SyntaxKind.BarBarToken))
                && ((parent.left === node) || (parent.right === node));
        }
        }
        return false;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        // const name = declaration.name.escapedText;

        if (this.removeVariableDeclarationForFunctionExpression && declaration?.initializer &&  isFunctionExpression(declaration.initializer)) {
            return this.printNode(declaration.initializer, identation).trimEnd();
        }
        // handle array binding : input: const [a,b] = this.method()
        // output: var abVar = this.method; var a = abVar[0]; var b = abVar[1];
        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            // typed holder (see csharpDestructuringTempType): same value, read without the re-cast
            const tempType = this.csharpDestructuringTempType(declaration.initializer);
            const tempExpression = this.printNode(declaration.initializer, 0);
            const tempDeclaration = tempType ? `${tempType} ${syntheticName} = (${tempType})${tempExpression}` : `var ${syntheticName} = ${tempExpression}`;

            let arrayBindingStatement =  `${this.getIden(identation)}${tempDeclaration};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const statement = this.getIden(identation) + `var ${e} = ` + (tempType ? `${syntheticName}[${index}]` : `((IList<object>) ${syntheticName})[${index}]`);
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        const isNew = declaration?.initializer && (declaration.initializer.kind === SyntaxKind.NewExpression);
        const varToken = isNew ? 'var ' : this.VAR_TOKEN + ' ' ;

        // handle default undefined initialization
        if (declaration?.initializer && declaration.initializer === undefined) {
            // handle the let id: Str; case
            return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
        } else if (!declaration.initializer) {
            return this.getIden(identation) + 'object ' + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
        }
        const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
        if (parsedValue === this.UNDEFINED_TOKEN) {
            let specificVarToken = "object";
            if (this.INFER_VAR_TYPE) {
                const variableType = this.getChecker().typeToString(this.getChecker().getTypeAtLocation(declaration));
                if (this.VariableTypeReplacements[variableType]) {
                    specificVarToken = this.VariableTypeReplacements[variableType] + '?';
                }
            }
            return this.getIden(identation) + specificVarToken + " " + this.printNode(declaration.name) + " = " + parsedValue;
        }
        const declaredType = isNew ? 'var' : this.getCSharpLocalType(declaration);
        // remember the concrete types this printer declared itself: the printed prefix is
        // final (a host wrapper only rewrites untyped `object <name> = ` declarations), so
        // the local's static type is known at every later read
        if (!isNew && node.declarations.length === 1 && this.csharpTypeIsNative(declaredType)) {
            this.csharpTypedLocals.set(declaration, declaredType);
        }
        return this.getIden(identation) + declaredType + " " + this.printNode(declaration.name) + " = " + parsedValue;
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.text;

        let rawExpression = undefined;

        switch(rightSide) {
        case 'length':
                const type = (this.getChecker() as Checker).getTypeAtLocation(expression); // eslint-disable-line
            this.warnIfAnyType(node, type.flags, leftSide, "length");
            // rawExpression = this.isStringType(type.flags) ? `(string${leftSide}).Length` : `(${leftSide}.Cast<object>().ToList()).Count`;
            rawExpression = this.isStringType(type.flags) ? `${this.csharpStringMethodReceiver(node, leftSide)}.Length` : (this.csharpNativeLengthExpression(expression) ?? `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`); // `(${leftSide}.Cast<object>()).ToList().Count`
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
        if (isArrayLiteralExpression(node) || isObjectLiteralExpression(node) || isStringLiteral(node) || isBooleanLiteral(node)) {
            return this.UNDEFINED_TOKEN;
        }

        if (isNumericLiteral(node)) {
            return this.UNDEFINED_TOKEN;
        }

        // convert x: number = undefined (invalid) into x = -1 (valid)
        if (node?.text === "undefined" && this.getChecker().getTypeAtLocation(node?.parent)?.flags === TypeFlags.Number) {
            // return "-1";
            return this.UNDEFINED_TOKEN;
        }

        return undefined;
    }

    printFunctionBody(node, identation) {

        // check if there is any default parameter to initialize
        const funcParams = node.parameters;
        const initParams = [];
        if (funcParams.length > 0) {
            const body = node.body.statements;
            const first = body.length > 0 ? body[0] : [];
            const remaining = body.length > 0 ? body.slice(1): [];
            let firstStatement = this.printNode(first, identation + 1);

            const remainingString = remaining.map((statement) => this.printNode(statement, identation + 1)).join("\n");
            funcParams.forEach((param) => {
                const initializer = param.initializer;
                if (initializer) {
                    if (isArrayLiteralExpression(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= new List<object>();`);
                    }
                    if (isObjectLiteralExpression(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= new Dictionary<string, object>();`);
                    }
                    if (isNumericLiteral(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
                    }
                    if (isStringLiteral(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
                    }
                    if (isBooleanLiteral(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
                    }
                }
            });

            if (initParams.length > 0) {
                const defaultInitializers = initParams.map( l => this.getIden(identation+1) + l ).join("\n") + "\n";
                const bodyParts = firstStatement.split("\n");
                const commentPart = bodyParts.filter(line => this.isComment(line));
                const isComment = commentPart.length > 0;
                if (isComment) {
                    const commentPartString = commentPart.map((c) => this.getIden(identation+1) + c.trim()).join("\n");
                    const firstStmNoComment = bodyParts.filter(line => !this.isComment(line)).join("\n");
                    firstStatement = commentPartString + "\n" + defaultInitializers + firstStmNoComment;
                } else {
                    firstStatement = defaultInitializers + firstStatement;
                }
            }
            const blockOpen = this.getBlockOpen(identation);
            const blockClose = this.getBlockClose(identation);
            firstStatement = remainingString.length > 0 ? firstStatement + "\n" : firstStatement;
            return blockOpen + firstStatement + remainingString + blockClose;
        }

        return super.printFunctionBody(node, identation);
    }

    printInstanceOfExpression(node, identation) {
        const left = node.left.text;
        const right = node.right.text;
        return this.getIden(identation) + `${left} is ${right}`;
    }

    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === SyntaxKind.AnyKeyword) {
            return `((object)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === SyntaxKind.StringKeyword) {
            return `((string)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === SyntaxKind.ArrayType) {
            if (type.elementType.kind === SyntaxKind.AnyKeyword) {
                return `(IList<object>)(${this.printNode(node.expression, identation)})`;
            }
            if (type.elementType.kind === SyntaxKind.StringKeyword) {
                // ts 'as string[]' is a compile-time-only assertion with no runtime
                // effect, and C# IList<T> is invariant in BOTH directions: a hard
                // (IList<string>) cast throws on the untyped core's List<object>
                // (ccxt cs ws test lane, https://github.com/ccxt/ccxt/actions/runs/31173663316)
                // while a hard (IList<object>) cast throws on genuinely typed
                // List<string> values (starknet typedData via the paradex broker-id
                // leg, https://github.com/ccxt/ccxt/actions/runs/31322911365). The
                // honest emission is the bare expression, like the fallthrough below.
                return this.printNode(node.expression, identation);
            }
        }

        return this.printNode(node.expression, identation);
    }

    // A parameter of a method that participates in an override relation prints the spelling its
    // base member and every sibling override agree on (CSHARP_OVERRIDE_PARAM_TYPES; D8): C# is
    // invariant on override parameter types, so a half-retyped name is CS0115, while a name the
    printParameterType(node) {
        if (node === undefined || node.kind !== SyntaxKind.Parameter) {
            return super.printParameterType(node);
        }
        const method = findAncestor(node, (n) => isMethodDeclaration(n));
        const name = method === undefined || method.name === undefined ? undefined : method.name.getText().trim();
        const row = name === undefined ? undefined : CSHARP_OVERRIDE_PARAM_TYPES[name as string];
        const wanted = row === undefined ? undefined : row[method.parameters.indexOf(node)];
        if (wanted === undefined || this.csharpOverrideParamSpelling(node) !== wanted) {
            return super.printParameterType(node);
        }
        return wanted;
    }

    // checker spelling of a parameter the override table covers: a dictionary-shaped type (string
    // index signature, never a class instance or a callable) or an array of any/dictionary cells
    csharpOverrideParamSpelling(node): string | undefined {
        const type = this.getChecker().getTypeAtLocation(node);
        const rest = (type === undefined || !type.isUnion())
            ? type
            : type.types.filter((m) => !(m.flags & (TypeFlags.Undefined | TypeFlags.Null)))[0];
        return this.csharpOverrideParamSpellingOfType(rest, type !== undefined && type.isUnion()
            ? type.types.filter((m) => !(m.flags & (TypeFlags.Undefined | TypeFlags.Null))).length
            : 1);
    }

    csharpOverrideParamSpellingOfType(type, unionArms = 1): string | undefined {
        if (type === undefined || unionArms !== 1) {
            return undefined;
        }
        if (type.flags & (TypeFlags.TypeParameter | TypeFlags.Any | TypeFlags.Unknown | TypeFlags.EnumLike)) {
            return undefined;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            const el = (checker.getTypeArguments(type) || [])[0];
            if (el === undefined) {
                return undefined;
            }
            if (el.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
                return 'IList<object>';
            }
            return this.csharpOverrideParamSpellingOfType(el) === 'IDictionary<string, object>' ? 'IList<object>' : undefined;
        }
        if (checker.getIndexTypeOfType(type, IndexKind.String) === undefined) {
            return undefined;
        }
        const declarations = type.symbol && type.symbol.declarations ? type.symbol.declarations : [];
        if (declarations.some((d) => d.kind === SyntaxKind.ClassDeclaration)) {
            return undefined;   // a class instance is not a JSON dictionary
        }
        if (type.getCallSignatures && type.getCallSignatures().length > 0) {
            return undefined;   // a callable is not a JSON dictionary
        }
        return 'IDictionary<string, object>';
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        const handlerType = this.csharpHandlerMessageType(node);
        if (handlerType !== undefined) {
            // the printed declaration is final, so every read of the parameter is that
            // dictionary and the member reads replace getValue/getArrayLength/inOp
            this.csharpTypedLocals.set(node, handlerType);
        }
        let type = handlerType !== undefined ? handlerType : this.printParameterType(node);
        type = type ? type : "";
        this.csharpParamTypes.set(node, type); // see csharpPrintedParamType

        if (defaultValue) {
            if (initializer) {
                const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
                const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
                type = (defaultValue === "null" && type !== "object") ? type + "? ": type + " ";
                return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            }
            return type + " " + name;
        }
        return name;
    }

    printArrayLiteralExpression(node) {

        let arrayOpen = this.ARRAY_OPENING_TOKEN;
        const elems = node.elements;

        const elements = node.elements.map((e) => {
            return this.printNode(e);
        }).join(", ");

        // take into consideration list of promises
        if (elems.length > 0) {
            const first = elems[0];
            if (first.kind === SyntaxKind.CallExpression) {
                // const type = this.getChecker().getTypeAtLocation(first);
                let type = this.getFunctionType(first);
                // const parsedType = this.getTypeFromRawType(type);
                // parsedType === "Task" ||
                // to do check this later
                if (type === undefined || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
                    // if (type === undefined) {
                    arrayOpen = "new List<object> {";
                    // }
                    //  else {
                    //     arrayOpen = "new List<Task<object>> {";
                    // }
                } else {
                    type = 'object';
                    // check this out later
                    // if (type === 'Task<List<object>>') {
                    //     type = 'Task<object>';
                    // }
                    // if (type === 'string'){
                    //     type = 'object';
                    // }
                    // type =
                    arrayOpen = `new List<${type}> {`;
                }
            }
        }

        return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
    }

    // A method declared `: boolean` / `: boolean | undefined` (or an alias of either) returns a
    // C# `bool` / `bool?` instead of `object`. Only non-async methods with an explicit annotation
    // qualify: `undefined`/`null` union members make the result nullable, any other member (or an
    // inferred type) keeps the upstream `object`. The nullable spelling is what keeps a missing
    // key a missing key — plain `bool` would turn it into `false`.
    csharpBooleanReturnType(node): string | undefined {
        if (node?.kind !== SyntaxKind.MethodDeclaration || this.isAsyncFunction(node)) {
            return undefined;
        }
        if (this.csharpBooleanReturnTypes.has(node)) {
            return this.csharpBooleanReturnTypes.get(node);
        }
        let result: string | undefined = undefined;
        if (node.type) {
            const type = this.getChecker().getTypeFromTypeNode(node.type);
            const members = type.isUnion() ? type.types : [ type ];
            let nullable = false;
            let sawBoolean = false;
            let sawOther = false;
            for (const member of members) {
                if (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) {
                    nullable = true;
                } else if (member.flags & TypeFlags.BooleanLike) {
                    sawBoolean = true;
                } else {
                    sawOther = true;
                }
            }
            if (sawBoolean && !sawOther) {
                result = nullable ? this.BOOLEAN_KEYWORD + '?' : this.BOOLEAN_KEYWORD;
            }
        } else {
            // an un-annotated override inherits the parent's printed return type
            // (printMethodDefinition), so its returns need the same unboxing
            result = this.csharpBooleanReturnType(this.getMethodOverride(node));
        }
        this.csharpBooleanReturnTypes.set(node, result);
        return result;
    }

    printFunctionType(node) {
        const booleanType = this.csharpBooleanReturnType(node);
        if (booleanType !== undefined) {
            return booleanType;
        }
        return super.printFunctionType(node);
    }

    // `return x;` inside a bool/bool? method: the printed expression is still the `object`
    // box the rest of the printer produces, so unbox it through `object`. The nullable
    // spelling `(bool?)((object)(x))` accepts null; the non-nullable one needs the
    // null-forgiving `!` on the box (CS8605 under TreatWarningsAsErrors otherwise) — which is
    // exactly the runtime NullReferenceException a `: boolean` method returning null deserves
    printReturnStatement(node, identation) {
        // nearest function-like: a `return` inside an arrow/function expression belongs to
        // that callback, never to the enclosing bool method
        const booleanType = this.csharpBooleanReturnType(findAncestor(node.parent, isFunctionLike));
        if (booleanType === undefined || !node.expression) {
            return super.printReturnStatement(node, identation);
        }
        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        const value = this.printNode(node.expression, identation).trim();
        const forgiving = booleanType.endsWith('?') ? '' : '!';
        return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + ` ((${booleanType})((object)(${value}))${forgiving})` + this.LINE_TERMINATOR + trailingComment;
    }

    printMethodDefinition(node, identation) {
        let name = node.name.text;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        let modifiers = this.printModifiers(node);
        const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " ": "";
        modifiers = modifiers ? modifiers + " " : defaultAccess; // tmp check this

        modifiers = modifiers.indexOf("public") === -1 && modifiers.indexOf("private") === -1 && modifiers.indexOf("protected") === -1 ? defaultAccess + modifiers : modifiers;

        let parsedArgs = undefined;
        // c# only move this elsewhere (csharp transpiler)
        const methodOverride = this.getMethodOverride(node) as any;
        const isOverride = methodOverride !== undefined;
        modifiers = isOverride ? modifiers + "override " : modifiers + "virtual ";

        // infer parent return type
        if (isOverride && (returnType === "object" || returnType === "Task<object>")) {
            returnType = this.printFunctionType(methodOverride);
        }

        // ts does not infer parameters types of overriden methods :x , so we need some
        // heuristic here to infer the types
        if (isOverride && node.parameters.length > 0) {
            const first = node.parameters[0];
            const firstType = this.getType(first);

            if (firstType === undefined) {
                // use the override version, check this out later
                // parsedArgs = this.printMethodParameters(methodOverride);
                const currentArgs = node.parameters;
                const parentArgs = methodOverride.parameters;
                parsedArgs = "";
                parentArgs.forEach((param, index) => {
                    const originalName = this.printNode(currentArgs[index].name, 0);
                    const parsedArg = this.printParameteCustomName(param, originalName);
                    parsedArgs+= parsedArg;
                    if (index < parentArgs.length - 1) {
                        parsedArgs+= ", ";
                    }
                });
            }
        }

        parsedArgs = parsedArgs ? parsedArgs : this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const methodDef = this.getIden(identation) + modifiers + returnType + methodToken + name
            + "(" + parsedArgs + ")";

        return this.printNodeCommentsIfAny(node, identation, methodDef);
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
        return super.printArgsForCallExpression(node, identation);
    }

    // check this out later

    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `((${parsedArg} is IList<object>) || (${parsedArg}.GetType().IsGenericType && ${parsedArg}.GetType().GetGenericTypeDefinition().IsAssignableFrom(typeof(List<>))))`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        // `Object.keys(x)` on a receiver the classifier declared a concrete dictionary: the
        // cast only named the box; `.Keys` is the same collection either way
        if ((node?.arguments?.length === 1) && this.csharpReceiverIsDeclaredDictionary(node.arguments[0])) {
            return `new List<object>(${parsedArg}.Keys)`;
        }
        return `new List<object>(((IDictionary<string,object>)${parsedArg}).Keys)`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        if ((node?.arguments?.length === 1) && this.csharpReceiverIsDeclaredDictionary(node.arguments[0])) {
            return `new List<object>(${parsedArg}.Values)`;
        }
        return `new List<object>(((IDictionary<string,object>)${parsedArg}).Values)`;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `parseJson(${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `json(${parsedArg})`; // make this customizable
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promiseAll(${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `(Math.Floor(Double.Parse((${parsedArg}).ToString())))`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `Math.Round(Convert.ToDouble(${parsedArg}))`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `Math.Ceiling(Convert.ToDouble(${parsedArg}))`;
    }

    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any) {
        return `((${parsedArg} is int) || (${parsedArg} is long) || (${parsedArg} is Int32) || (${parsedArg} is Int64))`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        // `x.push (v)` on a receiver whose printed declaration already IS a list needs no cast:
        // (IList<object>)x is an identity conversion and `.Add` binds the same ICollection<object>.Add.
        // An `object` receiver (and every receiver this printer cannot name) keeps the cast.
        if (this.csharpReceiverIsDeclaredList(node?.expression?.expression)) {
            return `${name}.Add(${parsedArg})`;
        }
        return  `((IList<object>)${name}).Add(${parsedArg})`;
    }

    // The C# type the emitted declaration gives a local / operand read (`string`, `List<object>`,
    // `Dictionary<string, object>`, ...), or undefined. Installed by build/csharp-local-types.js, which
    // retypes the declaration AFTER printing. Undefined by default: callers keep the helper form.
    csharpLocalTypeOf(node): string | undefined {
        return undefined;
    }

    // U55: the emitted C# type of an identifier operand of a null comparison, installed by
    // build/csharp-local-types.js from the PRINTED declaration lines (retyped after printing, so the
    // printer cannot see it). Undefined by default: every null comparison keeps isEqual unchanged.
    csharpNullComparisonTypeOf(node): string | undefined {
        return undefined;
    }

    // `add (x, y)` -> `(x + y)` when the classifier proves the LEFT operand's emitted declaration is a
    // string (U57): add(string, string) / add(string, object) compute exactly C# concatenation, nulls
    // included. Undefined keeps the helper; parenthesised because `+` binds looser in embedded text.
    csharpNativeStringConcat(left, right, leftText: string, rightText: string): string | undefined {
        return undefined;
    }

    // The emitted declaration type of a local read the embedding build layer retypes AFTER
    // printing (ccxt: build/csharp-local-types.js): the dict type for the `key in x` rule,
    // undefined for every receiver it does not retype. Undefined by default.
    csharpDeclaredDictReceiverType(node): string | undefined {
        return undefined;
    }

    // is this receiver expression, as printed, a local declared List<object> /
    // IList<object>? Only a bare identifier reads the type hook; a parameter (printed
    // `object`), a member read and every composite expression keep the cast.
    csharpReceiverIsDeclaredList(receiver): boolean {
        if (receiver?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const type = (typeof this.csharpLocalTypeOf === 'function') ? this.csharpLocalTypeOf(receiver) : undefined;
        return (type === 'List<object>') || (type === 'IList<object>');
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${name}.Contains(${parsedArg})`;
    }

    // `x.indexOf (y)` prints `x`'s own member when the printer proves the receiver holds a
    // string or a list at this read and can name that C# type; every other receiver keeps the
    // runtime getIndexOf helper, which is the only form that answers -1 for a null box.
    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.csharpNativeIndexOfCall(node, name, parsedArg);
        if (native !== undefined) {
            return native;
        }
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    // the helper's `(string)` branch spelled natively: `((string)x).IndexOf(needle, Ordinal)` is
    // the ordinal scan TS indexOf performs (not-found stays -1, an empty needle stays 0); a
    // `List<object>` local takes its own IndexOf, a possibly-null box keeps the helper
    csharpNativeIndexOfCall(node, name = undefined, parsedArg = undefined): string | undefined {
        const receiver = node?.expression?.expression;
        if (receiver === undefined || name === undefined) {
            return undefined;
        }
        const declared = this.csharpExpressionTypeOf(receiver);
        if (this.csharpIndexOfReceiverHoldsString(node, receiver, declared)) {
            const needle = this.csharpNativeIndexOfNeedle(node.arguments?.[0], parsedArg);
            if (needle === undefined) {
                return undefined;
            }
            // the helper's own `((string)str)` cast; a cast the printer already emitted is final
            const casted = name.startsWith('((string)') ? name : `((string)${name})`;
            return `${casted}.IndexOf(${needle}, StringComparison.Ordinal)`;
        }
        if (this.csharpIndexOfReceiverIsDeclaredList(declared)) {
            return `((${declared})${name}).IndexOf(${parsedArg})`;
        }
        return undefined;
    }

    // the receiver is a string the helper would scan and no null can reach the read: a C#
    // `string` declaration, a checker `string`/literal whose own declaration is a plain
    // non-optional `string` (`as string` included), or a value a `!== undefined` test admits
    csharpIndexOfReceiverHoldsString(node, receiver, declared): boolean {
        if (declared === 'string') {
            return true;
        }
        if ((declared !== undefined) && (declared !== 'string?')) {
            return false; // a named C# type that is not a string
        }
        if (!this.csharpIndexOfReceiverIsCheckedString(receiver)) {
            return false;
        }
        return this.csharpNullGuardAdmitsRead(node, receiver) || ((declared === undefined) && this.csharpReceiverDeclaredNonNullString(receiver));
    }

    // the checker's view of the receiver: exactly `string` / a string literal. `any` (could box
    // anything) and `string[]` (boxes a List<string> where the helper casts its target) are not
    csharpIndexOfReceiverIsCheckedString(receiver): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false; // in-memory program without a checker
        }
        const type = checker.getTypeAtLocation(receiver);
        return this.isStringType(type?.flags);
    }

    // `List<object>` / `IList<object>` locals (split, Object.keys, the retyped collection
    // returns) hold exactly the box the helper's own IList<object> branch scans
    csharpIndexOfReceiverIsDeclaredList(declared): boolean {
        return (declared === 'List<object>') || (declared === 'IList<object>');
    }

    // the receiver's own declaration says non-optional `string` (params, fields, locals), or the
    // source pinned a string itself (a literal, an `as string` assertion). The `Str` alias and
    // `= undefined` fields hold the undefined the helper answers -1 for: they need the guard
    csharpReceiverDeclaredNonNullString(receiver): boolean {
        const kind = receiver?.kind;
        if ((kind === SyntaxKind.StringLiteral) || (kind === SyntaxKind.NoSubstitutionTemplateLiteral)) {
            return true;
        }
        if (kind === SyntaxKind.ParenthesizedExpression) {
            return this.csharpReceiverDeclaredNonNullString(receiver.expression);
        }
        if ((kind === SyntaxKind.AsExpression) && (receiver.type?.kind === SyntaxKind.StringKeyword)) {
            return true; // the source itself pinned a string here
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(receiver);
        const declarations: any[] = symbol?.declarations ?? [];
        return (declarations.length > 0) && declarations.every((declaration) => this.csharpDeclarationIsNonNullString(declaration));
    }

    csharpDeclarationIsNonNullString(declaration): boolean {
        const annotation: any = declaration?.type;
        if (declaration?.kind === SyntaxKind.Parameter) {
            return (declaration.questionToken === undefined) && (declaration.dotDotDotToken === undefined)
                && ((annotation?.kind === SyntaxKind.StringKeyword) || ((annotation === undefined) && isStringLiteralLikeNode(declaration.initializer)));
        }
        const isField = isPropertyDeclaration(declaration) || isPropertySignatureDeclaration(declaration);
        if (isVariableDeclaration(declaration) || isField) {
            if ((declaration as any).questionToken !== undefined) {
                return false;
            }
            if (annotation !== undefined) {
                // `apiKey: string = undefined` holds undefined until the credentials are set
                return (annotation.kind === SyntaxKind.StringKeyword) && !this.csharpInitializerIsUndefined((declaration as any).initializer);
            }
            return isStringLiteralLikeNode((declaration as any).initializer);
        }
        return false;
    }

    csharpInitializerIsUndefined(initializer): boolean {
        if (initializer === undefined) {
            return false;
        }
        return (initializer.kind === SyntaxKind.NullKeyword)
            || ((initializer.kind === SyntaxKind.Identifier) && (initializer.text === 'undefined'));
    }

    // a `x !== undefined` / `x !== null` (or `!= null`) test in a branch that admits the read:
    // inside the right operand of its `&&`, inside the then-branch of its `if`, or after an
    // early-exiting `if (x === undefined) { return/throw/continue/break }`
    csharpNullGuardAdmitsRead(node, receiver): boolean {
        if (!isIdentifier(receiver)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(receiver);
        if (symbol === undefined) {
            return false;
        }
        const scope = this.csharpEnclosingFunction(node);
        let current: any = node;
        while (current !== undefined) {
            const parent: any = current.parent;
            if (parent === undefined) {
                return false;
            }
            if ((parent.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken)
                && this.csharpContains(parent.right, current) && this.csharpTestIsNonNullCheck(parent.left, symbol, true)) {
                return true;
            }
            if (parent.kind === SyntaxKind.IfStatement) {
                if (this.csharpContains(parent.thenStatement, current) && this.csharpTestIsNonNullCheck(parent.expression, symbol, true)) {
                    return true;
                }
                if (this.csharpContains(parent.elseStatement, current) && this.csharpTestIsNonNullCheck(parent.expression, symbol, false)) {
                    return true;
                }
            }
            if (isBlock(parent) || isSourceFile(parent)) {
                if (this.csharpEarlyExitNonNullGuarded(parent, current, symbol, scope)) {
                    return true;
                }
            }
            if (this.csharpIsFunctionLike(parent)) {
                return false; // a guard outside this function cannot dominate a read inside it
            }
            current = parent;
        }
        return false;
    }

    csharpIsFunctionLike(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.MethodDeclaration:
        case SyntaxKind.FunctionDeclaration:
        case SyntaxKind.FunctionExpression:
        case SyntaxKind.ArrowFunction:
        case SyntaxKind.Constructor:
            return true;
        }
        return false;
    }

    // `if (x === undefined) { return/throw/... }` (or the same test with an exiting else) in the
    // same block, with no write to x in between: every statement after it runs with x bound
    csharpEarlyExitNonNullGuarded(block, statement, symbol, scope): boolean {
        for (const sibling of block.statements) {
            if (sibling.getStart() >= statement.getStart()) {
                return false;
            }
            if (!isIfStatement(sibling)) {
                continue;
            }
            const exitsOnNull = this.csharpTestIsNonNullCheck(sibling.expression, symbol, false) && this.csharpAlwaysExits(sibling.thenStatement);
            const continuesOnNonNull = this.csharpTestIsNonNullCheck(sibling.expression, symbol, true) && this.csharpAlwaysExits(sibling.elseStatement);
            if ((exitsOnNull || continuesOnNonNull) && !this.csharpReceiverWrittenBetween(scope, sibling.getEnd(), statement.getStart(), symbol)) {
                return true;
            }
        }
        return false;
    }

    // the test proves the binding non-null when it evaluates to `truthy`: `x != null`, `x !==
    // undefined` (either operand order), and both sides of an `&&` (a false `||`). Everything
    // else — `any` comparisons, a different binding — proves nothing
    csharpTestIsNonNullCheck(test, symbol, truthy): boolean {
        switch (test?.kind) {
        case SyntaxKind.ParenthesizedExpression:
            return this.csharpTestIsNonNullCheck(test.expression, symbol, truthy);
        case SyntaxKind.PrefixUnaryExpression:
            return (test.operator === SyntaxKind.ExclamationToken) && this.csharpTestIsNonNullCheck(test.operand, symbol, !truthy);
        case SyntaxKind.BinaryExpression: {
            const op = test.operatorToken.kind;
            if (op === SyntaxKind.AmpersandAmpersandToken) {
                return truthy && (this.csharpTestIsNonNullCheck(test.left, symbol, true) || this.csharpTestIsNonNullCheck(test.right, symbol, true));
            }
            if (op === SyntaxKind.BarBarToken) {
                return !truthy && (this.csharpTestIsNonNullCheck(test.left, symbol, false) || this.csharpTestIsNonNullCheck(test.right, symbol, false));
            }
            const inequality = (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken);
            const isNullTest = (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken) || inequality;
            if (!isNullTest || (truthy !== inequality)) {
                return false;
            }
            const tested = isIdentifier(test.left) ? test.left : test.right;
            const literal = isIdentifier(test.left) ? test.right : test.left;
            return isIdentifier(tested) && this.csharpInitializerIsUndefined(literal) && this.csharpSameBinding(tested, symbol);
        }
        }
        return false;
    }

    csharpSameBinding(node, symbol): boolean {
        try {
            const resolved = this.getChecker().getSymbolAtLocation(node);
            return (resolved !== undefined) && (resolved === symbol);
        } catch (e) {
            return false;
        }
    }

    // any write to the same binding inside the window voids a dominance proof
    csharpReceiverWrittenBetween(scope, from: number, to: number, symbol): boolean {
        if (scope === undefined) {
            return true;
        }
        let written = false;
        const visit = (n: any) => {
            if (written || (n.getStart() >= to) || (n.getEnd() <= from)) {
                return;
            }
            if (isIdentifier(n) && this.csharpIsWriteTarget(n) && this.csharpSameBinding(n, symbol)) {
                written = true;
                return;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return written;
    }

    // the C# string the native `IndexOf` takes as its needle: a value the printer types a C#
    // string prints as-is, an `object`-printed operand takes the helper's own `(string)` cast.
    // A value of any other named C# type (number, bool, collection) keeps the helper
    csharpNativeIndexOfNeedle(key, printed = undefined): string | undefined {
        if (key === undefined || printed === undefined) {
            return undefined;
        }
        const keyType = this.csharpExpressionTypeOf(key);
        if (keyType === undefined) {
            return `((string)${printed})`;
        }
        if (keyType === 'string') {
            return printed;
        }
        return (keyType === 'string?') ? `((string)${printed})` : undefined;
    }

    printSearchCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).IndexOf(${parsedArg})`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).StartsWith(((string)${parsedArg}))`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).EndsWith(((string)${parsedArg}))`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.Trim()`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return `String.Join(${parsedArg}, ((IList<object>)${name}).ToArray())`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.Split(new [] {((string)${parsedArg})}, StringSplitOptions.None).ToList<object>()`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `concat(${name}, ${parsedArg})`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `((object)${name}).ToString()`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.ToUpper()`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.ToLower()`;
    }

    printShiftCall(node, identation, name = undefined) {
        return `((IList<object>)${name}).First()`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `${name} = (${name} as IList<object>).Reverse().ToList()`;
    }

    printPopCall(node, identation, name = undefined) {
        return `((IList<object>)${name}).Last()`;
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        const nativeCall = this.csharpNativeSliceCall(node, name);
        if (nativeCall !== undefined) {
            return nativeCall;
        }
        if (parsedArg2 === undefined){
            // return `((string)${name}).Substring((int)${parsedArg})`;
            parsedArg2 = 'null';
        }
        // return `((string)${name})[((int)${parsedArg})..((int)${parsedArg2})]`;
        return `slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    // `x.slice (a, b)` -> Substring / GetRange when x is a checker-proven string (or a printer-declared
    // `List<object>`) and every bound is an integer literal: JS clamps bounds into [0, length] where C#
    // throws, so literals are clamped with Math.Min / Math.Max. Anything unproven keeps the helper.
    csharpNativeSliceCall(node, name) {
        const args = node?.arguments ?? [];
        if ((args.length < 1) || (args.length > 2)) {
            return undefined;
        }
        const start = this.csharpSliceLiteralBound(args[0]);
        if (start === undefined) {
            return undefined;
        }
        const hasEnd = args.length === 2;
        const end = hasEnd ? this.csharpSliceLiteralBound(args[1]) : undefined;
        if (hasEnd && (end === undefined)) {
            return undefined;
        }
        // x.slice (a, b) prints through this method for the CALL, so the receiver is `.expression.expression`
        const receiver = isPropertyAccessExpression(node?.expression) ? node.expression.expression : undefined;
        if (!this.csharpSliceReceiverIsSideEffectFree(receiver)) {
            return undefined;
        }
        const kind = this.csharpSliceReceiverKind(receiver);
        if (kind === undefined) {
            return undefined;
        }
        const isString = (kind === 'string');
        // `(id as string)` already prints `((string)id)`: a second cast would only add parens
        const cast = (isString && name.startsWith('((string)')) ? name : `((${isString ? 'string' : 'List<object>'})${name})`;
        const length = `${cast}.${isString ? 'Length' : 'Count'}`;
        const from = this.csharpSliceBoundExpression(start, length);
        // the null guard reproduces the helper's null -> null result for a null receiver; the
        // whole emission is parenthesised because a ternary binds looser than the `+` / `+` chain
        // the printer may wrap this call in
        const guard = `(${this.csharpNullComparison(name, true)} ? null : `;
        const method = isString ? 'Substring' : 'GetRange';
        if (!hasEnd) {
            // the open end is the length itself: `Substring (from)` and `GetRange (from, length - from)`
            const open = isString ? `Substring(${from})` : `GetRange(${from}, ${from === '0' ? length : `${length} - ${from}`})`;
            return `${guard}${cast}.${open})`;
        }
        const to = this.csharpSliceBoundExpression(end, length);
        // from <= to is proven per case: 0 is never above a clamp, and two literals clamp
        // monotonically once they keep their order (non-negative, or both counting from the end)
        const ordered = (start === 0) || ((start >= 0) && (end >= 0) && (start <= end)) || ((start < 0) && (end < 0) && (start <= end));
        let count;
        if (from === to) {
            count = '0'; // two bounds that clamp to the same index: an empty result
        } else if (from === '0') {
            count = to; // from 0: the clamped end IS the count
        } else {
            // an inverted pair yields an empty slice in JS, so the count never goes below 0
            count = ordered ? `${to} - ${from}` : `Math.Max(${to} - ${from}, 0)`;
        }
        return `${guard}${cast}.${method}(${from}, ${count}))`;
    }

    // Integer value of a slice bound that is an integer literal (`18`, `-64`); anything
    // else (expression, float, exponent, out of int range) keeps the helper — the bounds
    // are clamped with the integer Math.Min / Math.Max of the native form.
    csharpSliceLiteralBound(node) {
        if (node === undefined) {
            return undefined;
        }
        if (isNumericLiteral(node)) {
            const text = String(node.text);
            if ((text.indexOf('.') !== -1) || (text.indexOf('e') !== -1) || (text.indexOf('E') !== -1)) {
                return undefined;
            }
            const value = Number(text);
            return value <= 2147483647 ? value : undefined;
        }
        if (isPrefixUnaryExpression(node) && (node.operator === SyntaxKind.MinusToken)) {
            const inner = this.csharpSliceLiteralBound(node.operand);
            return inner === undefined ? undefined : -inner;
        }
        return undefined;
    }

    // JS slice clamps a literal bound into [0, length]: a non-negative bound is min
    // (bound, length), a negative one counts from the end (max (length - |bound|, 0)).
    // `0` stays `0` because the length of a string / list is never negative.
    csharpSliceBoundExpression(value, length) {
        if (value === 0) {
            return '0';
        }
        return value > 0 ? `Math.Min(${value}, ${length})` : `Math.Max(${length} - ${-value}, 0)`;
    }

    // The receiver of a native slice: a `List<object>` the printer / build layer declared (the only
    // receiver with GetRange), or a CHECKER-proven string (`string`, a literal, or a union with
    // null / undefined such as ccxt's `Str`); `any`, Dict and every other type keep the helper.
    csharpSliceReceiverKind(expression) {
        // a declared `List<object>` (printer table or the embedding build layer's retype) is the
        // only receiver carrying a native bounding accessor, GetRange
        const declared = (isIdentifier(expression) ? this.csharpTypedLocalType(expression) : undefined) ?? this.csharpExpressionTypeOf(expression);
        if (declared === 'List<object>') {
            return 'list';
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(expression);
        return this.csharpSliceStringType(type) ? 'string' : undefined;
    }

    // the checker's string view of a slice receiver: a string type, or a union of string
    // members and nullish ones only. `boolean | string`, `any` and every unproven shape fail
    csharpSliceStringType(type): boolean {
        if (this.isStringType(type?.flags)) {
            return true;
        }
        if (type?.flags !== TypeFlags.Union) {
            return false;
        }
        const members = type.types ?? [];
        return (members.length > 0) && members.every((member) => this.isStringType(member.flags) || this.csharpSliceNullishType(member.flags));
    }

    csharpSliceNullishType(flags: ts.TypeFlags): boolean {
        return (flags === TypeFlags.Undefined) || (flags === TypeFlags.Null);
    }

    // True for receivers that read a value without calling anything: `x`, `x.y`, `this.x`,
    // `(x as string)` and parenthesised forms of those. Guards the repeated receiver read —
    // the clamp reads `Length` / `Count` and the call itself reads the receiver again.
    csharpSliceReceiverIsSideEffectFree(expression): boolean {
        if (expression === undefined) {
            return false;
        }
        if (isParenthesizedExpression(expression) || isAsExpression(expression) || isTypeAssertion(expression)) {
            return this.csharpSliceReceiverIsSideEffectFree(expression.expression);
        }
        if (isIdentifier(expression) || (expression.kind === SyntaxKind.ThisKeyword)) {
            return true;
        }
        if (isPropertyAccessExpression(expression)) {
            return this.csharpSliceReceiverIsSideEffectFree(expression.expression);
        }
        return false;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.Replace((string)${parsedArg}, (string)${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.Replace((string)${parsedArg}, (string)${parsedArg2})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `(${name} as String).PadRight(Convert.ToInt32(${parsedArg}), Convert.ToChar(${parsedArg2}))`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `(${name} as String).PadLeft(Convert.ToInt32(${parsedArg}), Convert.ToChar(${parsedArg2}))`;
    }

    printDateNowCall(node, identation) {
        return "(new DateTimeOffset(DateTime.UtcNow)).ToUnixTimeMilliseconds()";
    }

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (this.getChecker() as Checker).getTypeAtLocation(node.expression); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSide, "length");
        return this.isStringType(type.flags) ? `${this.csharpStringMethodReceiver(node, leftSide)}.Length` : (this.csharpNativeLengthExpression(node.expression) ?? `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`);
    }

    // A for-header incrementor discards the postfix value, so an operand whose printed C# type is `int`
    // takes the native operator: the same unchecked +1 / -1 as the (ref int) helper twin. Any other
    // operand keeps the helper, whose overload set binds an `object` counter.
    csharpNativePostFixIncrement(node): boolean {
        if (node.operand?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const parent = node.parent;
        if (parent?.kind !== SyntaxKind.ForStatement || parent.incrementor !== node) {
            return false;
        }
        return this.csharpExpressionTypeOf(node.operand) === 'int';
    }

    printPostFixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operand.kind === SyntaxKind.NumericLiteral) {
            return super.printPostFixUnaryExpression(node, identation);
        }
        const leftSide = this.printNode(operand, 0);
        const op = this.PostFixOperators[operator]; // todo: handle --
        if (this.csharpNativePostFixIncrement(node)) {
            return `${leftSide}${op}`;
        }
        if (op === '--') {
            return `postFixDecrement(ref ${leftSide})`;
        }
        return `postFixIncrement(ref ${leftSide})`;
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operand.kind === SyntaxKind.NumericLiteral) {
            return super.printPrefixUnaryExpression(node, identation);
        }
        if (operator === SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            const nativeNot = this.csharpNegatedConditionOperand(operand);
            if (nativeNot !== undefined) {
                return nativeNot;
            }
            return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        const leftSide = this.printNode(operand, 0);
        if (operator === SyntaxKind.PlusToken) {
            return `prefixUnaryPlus(ref ${leftSide})`;
        }
        const nativeNegation = this.csharpNativeNegatedLocal(operand, leftSide);
        if (nativeNegation !== undefined) {
            return nativeNegation;
        }
        return `prefixUnaryNeg(ref ${leftSide})`;
    }

    // `isTrue(x)` is the identity function on a C# bool (`isTrue` returns a bool unchanged),
    // so the wrapper is only needed for values the printer leaves boxed as `object`. Every
    // shape below is rendered as a C# bool by the printer itself; anything else keeps the helper.
    csharpConditionPrintsBool(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return true; // `true` / `false`
        case SyntaxKind.ParenthesizedExpression:
            return this.csharpConditionPrintsBool(node.expression);
        case SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!isTrue(x)`, and printCondition always returns a bool
            return node.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression:
            return this.csharpBinaryExpressionPrintsBool(node);
        case SyntaxKind.Identifier:
            return this.csharpIdentifierPrintsBool(node);
        case SyntaxKind.PropertyAccessExpression:
            return this.csharpFieldPrintsBool(node);
        case SyntaxKind.CallExpression:
            return this.csharpCallPrintsBool(node);
        }
        return false;
    }

    // `this.<field>` reads of the hand-written BaseExchange bool fields: the field is declared
    // `bool` there, so a checker-typed plain boolean read is a C# bool the condition can use bare
    csharpFieldPrintsBool(node): boolean {
        if (node.expression?.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        return (CSHARP_NATIVE_BOOL_FIELDS.indexOf(node.name?.text as string) >= 0) && this.csharpIsCheckedBoolean(node);
    }

    // isEqual / !isEqual / isGreaterThan / ... / inOp all have a C# `bool` signature, a
    // `&&` / `||` prints both operands through printCondition, i.e. as bool themselves, and
    // `x instanceof T` prints the C# type test `<x> is <T>`, itself a bool
    csharpBinaryExpressionPrintsBool(node): boolean {
        switch (node.operatorToken.kind) {
        case SyntaxKind.EqualsEqualsToken:
        case SyntaxKind.EqualsEqualsEqualsToken:
        case SyntaxKind.ExclamationEqualsToken:
        case SyntaxKind.ExclamationEqualsEqualsToken:
        case SyntaxKind.GreaterThanToken:
        case SyntaxKind.GreaterThanEqualsToken:
        case SyntaxKind.LessThanToken:
        case SyntaxKind.LessThanEqualsToken:
        case SyntaxKind.InKeyword:
        case SyntaxKind.InstanceOfKeyword:
        case SyntaxKind.BarBarToken:
        case SyntaxKind.AmpersandAmpersandToken:
            return true;
        }
        return false;
    }

    // the checker sees a value that is exactly boolean; `boolean | undefined` is a
    // TypeFlags.Union here and is therefore rejected (`bool?` is no condition in C#)
    csharpIsCheckedBoolean(node): boolean {
        const type = this.getChecker().getTypeAtLocation(node);
        return ((type?.flags ?? 0) & TypeFlags.BooleanLike) !== 0;
    }

    // `bool name = ...` is only declared when getCSharpLocalType resolved that exact
    // declaration to `bool`, so ask the same function: the condition and the declaration
    // cannot disagree. Parameters, members and demoted locals return `object` there. The
    // embedding layer's resolver (ccxt: build/csharp-local-types.js) retypes locals the
    // printer cannot name itself and reports the type the printed declaration carries, so a
    // `bool` there is the same proof for a declaration this printer did not write
    csharpIdentifierPrintsBool(node): boolean {
        if (!this.csharpIsCheckedBoolean(node)) {
            return false;
        }
        if (this.csharpExpressionTypeOf(node) === 'bool') {
            return true;
        }
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        if (!this.csharpLocalTypes.has(declaration)) {
            this.csharpLocalTypes.set(declaration, this.getCSharpLocalType(declaration));
        }
        return this.csharpLocalTypes.get(declaration) === 'bool';
    }

    // the printed callee text of a method call the printer can name statically: `this.<name>` and
    // `<Ident>.<name>`. A deeper receiver (`a.b.c(...)`) or a plain function call stays undefined —
    // the hand-written-callee proof must know exactly which callee the emitted text binds
    csharpCalleeName_Native(node): string | undefined {
        const expression = node?.expression;
        if (expression?.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }
        const receiver = expression.expression;
        const name = expression.name?.text as string;
        if (receiver?.kind === SyntaxKind.ThisKeyword) {
            return 'this.' + name;
        }
        if (receiver?.kind === SyntaxKind.Identifier) {
            return (receiver.text as string) + '.' + name;
        }
        return undefined;
    }

    // cs-14: `isTrue(<call>)` goes bare when the call's own C# signature is non-nullable `bool`: (a)
    // hand-written cs/ccxt/base callees (CSHARP_BOOL_CALLEES_NATIVE), (b) `this.<name>(...)` printed by
    // the same csharpBooleanReturnType. Hand-written overrides and `callDynamically` keep the wrapper.
    csharpBoolCall_Native(node): boolean {
        const callee = this.csharpCalleeName_Native(node);
        if (callee !== undefined && CSHARP_BOOL_CALLEES_NATIVE[callee] === true) {
            return true;
        }
        if (callee === undefined || callee.indexOf('this.') !== 0) {
            return false;
        }
        if (CSHARP_HANDWRITTEN_CALLEES_NATIVE.indexOf(callee.substring('this.'.length)) > -1) {
            return false;
        }
        if (!this.csharpCalleeResolves(node)) {
            return false;
        }
        const signature = this.getChecker().getResolvedSignature(node);
        const declaration = signature?.declaration;
        // a bodiless overload signature (`safeBool (…, defaultValue: boolean): boolean` next to a
        // `boolean | undefined` implementation) states only that overload's type, while C# binds
        // the single implementation: its `bool?` must not lose the wrapper
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined) {
            return false;
        }
        return this.csharpBooleanReturnType(declaration) === 'bool';
    }

    // calls the printer gives a concrete bool signature (inArray, valueIsDefined, startsWith,
    // Array.isArray, ...); safeBool and friends are `bool?` / `object` and keep the wrapper
    csharpCallPrintsBool(node): boolean {
        return this.csharpIsCheckedBoolean(node) && ((this.csharpCallReturnType(node) === 'bool') || this.csharpBoolCall_Native(node));
    }

    // The declared type of an identifier read: build layer's proof first, then this printer's table;
    // `var`/`object` mean "no type". `isTrue (x)` answers false for a null box, exactly the lifted
    // `x == true` on a `bool?`. Only reads declared `bool?` qualify; every other shape keeps helper.
    csharpNullableBoolCondition(node): string | undefined {
        let value = node;
        while (value?.kind === SyntaxKind.ParenthesizedExpression) {
            value = value.expression;
        }
        if (value?.kind === SyntaxKind.Identifier) {
            if (this.csharpDeclaredLocalType(value) === 'bool?') {
                return `(${this.printNode(value, 0)} == true)`;
            }
            // a declaration the embedding build layer retyped itself — the parameter/override
            // signatures the typed-param units print: the recorded type IS the emitted
            // declaration's, so a `bool?` parameter is no C# condition either
            if (this.csharpDeclaredLocalResolverType(value) === 'bool?') {
                return `(${this.printNode(value, 0)} == true)`;
            }
            return undefined;
        }
        if ((value?.kind === SyntaxKind.CallExpression) && this.csharpCallPrintsNullableBool(value)) {
            return `(${this.printNode(value, 0)} == true)`;
        }
        return undefined;
    }

    // a call whose printed C# signature is `bool?`: the `bool? safeBool(...)` family of the
    // hand-written base (CSHARP_THIS_RETURN_TYPES, which names that signature), and a
    // `this.<name>(...)` whose TS declaration the generator itself prints — definition and call
    csharpCallPrintsNullableBool(node): boolean {
        if (this.csharpCallReturnType(node) === 'bool?') {
            return true;
        }
        const callee = this.csharpCalleeName_Native(node);
        if (callee === undefined || callee.indexOf('this.') !== 0) {
            return false;
        }
        if (CSHARP_HANDWRITTEN_CALLEES_NATIVE.indexOf(callee.substring('this.'.length)) > -1) {
            return false;
        }
        if (!this.csharpCalleeResolves(node)) {
            return false;
        }
        const declaration = this.getChecker().getResolvedSignature(node)?.declaration;
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined) {
            return false;
        }
        return this.csharpBooleanReturnType(declaration) === 'bool?';
    }

    // same emission as the base implementation except for the bare-bool branch: the node is
    // printed once and only wrapped in isTrue(...) when the printer did not already render a bool
    //
    // the single `printCondition` override, rules layered strongest-proof-first over the base
    // body (the untyped fallback at the bottom):
    // S61 -- bare `isTrue (x)` in an if / while / && / || / ! condition: the operand is already
    // the `bool` (or `bool?`) the helper computes, so the wrapper adds nothing (the gate is the
    // csharpConditionPositionAllowsNative / csharpNativeCondition pair, never a name shape).
    // S62 -- a condition whose printed text is already a C# `bool` helper call
    // (csharpPrintedConditionIsBoolean) needs no wrapper either; the same identity proven from
    // the printed form rather than from the declaration.
    // #82 -- csharpConditionPrintsBool folds the wrapper on the node shapes the printer itself
    // renders as a bool, with csharpConditionParensIfNeeded keeping the `&&` / `||` precedence.
    printCondition(node, identation) {
        if (this.supportsFalsyOrTruthyValues) {
            return this.printNode(node, identation);
        }
        // can be called from ifs or conditional expressions or binary expressions so might contain the ! operator
        if (node?.kind === SyntaxKind.PrefixUnaryExpression && node.operator === SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation); // avoid infinite recursion
        }
        const nullableBool = this.csharpNullableBoolCondition(node);
        if (nullableBool !== undefined) {
            return `${this.getIden(identation)}${nullableBool}`;
        }
        const native = this.csharpConditionPositionAllowsNative(node) ? this.csharpNativeCondition(node, identation) : undefined;
        if (native !== undefined) {
            return native;
        }
        const printed = this.printNode(node, 0);
        if (this.csharpConditionPrintsBool(node)) {
            return `${this.getIden(identation)}${this.csharpConditionParensIfNeeded(node, printed)}`;
        }
        // `isTrue(X)` is the identity on a printed C# bool (Exchange.TranspileHelpers.cs:
        // `isTrue(object)` returns `(bool)value`, and normalizeIntIfNeeded is a no-op on bools),
        // so the wrapper is dropped when the node already prints as one
        if (this.csharpPrintedConditionIsBoolean(printed)) {
            return `${this.getIden(identation)}${printed}`;
        }
        return `${this.getIden(identation)}${this.FALSY_WRAPPER_OPEN}${printed}${this.FALSY_WRAPPER_CLOSE}`;
    }

    // dropping the wrapper exposes the `&&` / `||` / `is` of the node, so the bare text needs its own
    // parentheses where C# binds tighter than the JS it replaces: under `!` (which binds tighter
    // than both), and a `||` that becomes an operand of a `&&` (`(a || b) && c` must not flatten
    // to `a || b && c`). A type test additionally needs them under the `(bool)` cast the
    // conditional-expression printer prepends (`(bool) x is T` would bind as `((bool) x) is T`).
    // Source parentheses, when present, already come out in `printed`.
    csharpConditionParensIfNeeded(node, printed: string): string {
        if (node?.kind !== SyntaxKind.BinaryExpression) {
            return printed;
        }
        const op = node.operatorToken.kind;
        const parent = node.parent;
        if (op === SyntaxKind.InstanceOfKeyword) {
            const underNot = parent?.kind === SyntaxKind.PrefixUnaryExpression && parent.operator === SyntaxKind.ExclamationToken;
            const underCast = parent?.kind === SyntaxKind.ConditionalExpression && parent.condition === node;
            return (underNot || underCast) ? `(${printed})` : printed;
        }
        if (op !== SyntaxKind.BarBarToken && op !== SyntaxKind.AmpersandAmpersandToken) {
            return printed;
        }
        const underNot = parent?.kind === SyntaxKind.PrefixUnaryExpression && parent.operator === SyntaxKind.ExclamationToken;
        const underAnd = op === SyntaxKind.BarBarToken && parent?.kind === SyntaxKind.BinaryExpression
            && parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken;
        return (underNot || underAnd) ? `(${printed})` : printed;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printTernaryCondition(node.condition);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);

        return condition + " ? " + whenTrue + " : " + whenFalse;
    }

    // The ternary condition is a condition position the native gate above never sees: the same hook
    // answer prints natively there — `bool` bare, `bool?` as `x == true` (null -> false), source parens
    // unwrapped. Undefined keeps the base path, so an unnamed operand is unchanged.
    csharpTernaryConditionOperand(node) {
        let operand = node;
        while (operand?.kind === SyntaxKind.ParenthesizedExpression) {
            operand = operand.expression;
        }
        if (operand?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const type = this.csharpConditionOperandType(operand);
        if (type === 'bool') {
            return this.printNode(operand, 0);
        }
        if (type === 'bool?') {
            return `${this.printNode(operand, 0)} == true`;
        }
        return undefined;
    }

    // printCondition already yields a C# `bool` (`isTrue(x)` / `!isTrue(x)`), so a `((bool) <cond>)`
    // wrapper is a cast on a bool. The hook fold above answers the emitted declaration's type first;
    // anything it cannot name keeps the printer's `bool` fold (getCSharpLocalType) and then `isTrue`.
    printTernaryCondition(node) {
        const native = this.csharpTernaryConditionOperand(node);
        if (native !== undefined) {
            return native;
        }
        if (this.csharpConditionPrintsAsBool(node)) {
            return this.printNode(node, 0);
        }
        return this.printCondition(node, 0);
    }

    csharpConditionPrintsAsBool(node): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const checker = this.getChecker() as Checker; // eslint-disable-line
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return false;
        }
        return this.getCSharpLocalType(declaration) === 'bool';
    }

    // index of the `)` matching the `(` at `start` inside printed C# text, or -1; string
    // and char literals are skipped so a `(` inside a literal cannot shift the depth
    csharpMatchingParenIndex(text: string, start: number): number {
        let depth = 0;
        for (let i = start; i < text.length; i++) {
            const char = text[i];
            if (char === '"' || char === '\'') {
                const quote = char;
                i++;
                while (i < text.length) {
                    if (text[i] === '\\') { i += 2; continue; }
                    if (text[i] === quote) { break; }
                    i++;
                }
            } else if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    // S62: a `?` at paren/bracket/brace depth 0 in printed condition text is a C# conditional; its type
    // is the branches' common type (`object`), never `bool`; without this guard the falsy wrapper would
    // be folded into an invalid `if (object)`. `?` inside parens/brackets and in literals is ignored.
    csharpTextHasTopLevelConditional(text: string): boolean {
        let depth = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"' || char === '\'') {
                const quote = char;
                i++;
                while (i < text.length) {
                    if (text[i] === '\\') { i += 2; continue; }
                    if (text[i] === quote) { break; }
                    i++;
                }
            } else if ((char === '(') || (char === '[') || (char === '{')) {
                depth++;
            } else if ((char === ')') || (char === ']') || (char === '}')) {
                depth--;
            } else if ((char === '?') && (depth === 0)) {
                return true;
            }
        }
        return false;
    }

    // S62: is this printed condition text already a C# `bool`? Only `isTrue`/`isEqual`/`isGreaterThan
    // (OrEqual)`/`isLessThan(OrEqual)`/`inOp` calls qualify (CSHARP_BOOLEAN_PRINTED_CALLS). A `!`,
    // whole-text parens and `&&`/`||` composites (via the leading operand) keep the property.
    csharpPrintedConditionIsBoolean(text: string): boolean {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return false;
        }
        if (this.csharpTextHasTopLevelConditional(trimmed)) {
            return false;
        }
        if (trimmed.startsWith('(') && (this.csharpMatchingParenIndex(trimmed, 0) === trimmed.length - 1)) {
            return this.csharpPrintedConditionIsBoolean(trimmed.substring(1, trimmed.length - 1));
        }
        if (trimmed.startsWith('!')) {
            return this.csharpPrintedConditionIsBoolean(trimmed.substring(1));
        }
        const printedCall = /^([A-Za-z_]\w*)\(/.exec(trimmed);
        return (printedCall !== null) && (CSHARP_BOOLEAN_PRINTED_CALLS.indexOf(printedCall[1]) >= 0);
    }

    printDeleteExpression(node, identation) {
        const receiver = node.expression.expression;
        const object = this.printNode (receiver, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        // same identity as the element write: `Remove` on the declared dictionary is the
        // interface method the cast would bind to
        if (this.csharpReceiverIsDeclaredDictionary(receiver)) {
            return `${object}.Remove((string)${key})`;
        }
        return `((IDictionary<string,object>)${object}).Remove((string)${key})`;
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.text;
        expression = expression ? expression : this.printNode(node.expression);
        // JS's built-in `Error` maps to C#'s `Exception` (C# has no `Error` type in the BCL)
        if (expression === 'Error') {
            expression = 'Exception';
        }
        const args = node.arguments.map(n => this.printNode(n, identation)).join(", ");
        const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
        return newToken + expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }

    printThrowStatement(node, identation) {
        // const expression = this.printNode(node.expression, 0);
        // return this.getIden(node) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
        if (node.expression.kind === SyntaxKind.Identifier) {
            return this.getIden(identation) + this.THROW_TOKEN + ' ' + this.printNode(node.expression, 0) + this.LINE_TERMINATOR;
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
                // JS's built-in `Error` maps to C#'s `Exception` (C# has no `Error` type in the BCL)
                const idName = id.text === 'Error' ? 'Exception' : id.text;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === SyntaxKind.InterfaceDeclaration ||  l.kind === SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${idName} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
                    } else {
                        return this.getIden(identation) + `throwDynamicException(${idName}, ${parsedArg});return null;`;
                    }
                }
                return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${idName === id.text ? newExpression : idName} (${parsedArg}) ${this.LINE_TERMINATOR}`;
            } else if (expression.expression.kind === SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg});`;
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

    csModifiers = {

    };

    printPropertyAccessModifiers(node) {
        let modifiers = this.printModifiers(node);
        if (modifiers === '') {
            modifiers = this.defaultPropertyAccess;
        }
        // add type
        let typeText = 'object';
        if (node.type) {
            typeText = this.getType(node);
            if (!typeText) {
                if (node.type.kind === SyntaxKind.AnyKeyword) {
                    typeText = this.OBJECT_KEYWORD + ' ';
                }
            }
        }
        return modifiers + ' ' + typeText + ' ';
    }

    // printLeadingComments(node, identation) {
    //     const fullText = this.getSrc().getFullText();
    //     const commentsRangeList = ts.getLeadingCommentRanges(fullText, node.pos);
    //     const commentsRange = commentsRangeList ? commentsRangeList : undefined;
    //     let res = "";
    //     if (commentsRange) {
    //         for (const commentRange of commentsRange) {
    //             const commentText = fullText.slice(commentRange.pos, commentRange.end);
    //             if (commentText !== undefined) {
    //                 const formatted = commentText
    //                     .split("\n")
    //                     .map(line=>line.trim())
    //                     .map(line => !(line.trim().startsWith("*")) ? this.getIden(identation) + line : this.getIden(identation) + " " + line) .join("\n");
    //                 // res+= this.transformLeadingComment(formatted) + "\n";
    //             }
    //         }
    //     }
    //     return res;
    // }
}

// if (this.requiresCallExpressionCast) {
//     const parsedTypes = this.getTypesFromCallExpressionParameters(node);
//     const tmpArgs = [];
//     args.forEach((arg, index) => {
//         const parsedType = parsedTypes[index];
//         const cast = parsedType ? `(${parsedType})` : '';
//         tmpArgs.push(cast + this.printNode(arg, identation).trim());
//     });
//     parsedArgs = tmpArgs.join(",");
// } else {
//     parsedArgs = args.map((a) => {
//         return  this.printNode(a, identation).trim();
//     }).join(", ");
// }

// getTypesFromCallExpressionParameters(node) {
//     const resolvedParams = this.getChecker().getResolvedSignature(node).parameters;
//     const parsedTypes = [];
//     resolvedParams.forEach((p) => {
//         const decl = p.declarations[0];
//         const type = this.getChecker().getTypeAtLocation(decl);
//         const parsedType = this.getTypeFromRawType(type);
//         parsedTypes.push(parsedType);
//     });

//     return parsedTypes;
// }


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
